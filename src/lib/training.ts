import { expiryState, fifoSort, newLot } from './fifo';
import { todayIso } from './text';
import type { Lot, Product } from './types';

/** What happens to a picked line when the training ends. */
export type Outcome = 'back' | 'used' | 'waste' | 'other';

export const OUTCOME_LABEL: Record<Outcome, string> = {
  back: 'Odłóż',
  used: 'Zużyte do końca',
  waste: 'Wyrzuć — zepsute',
  other: 'Inne',
};

export interface TrainingLine {
  id: string;
  productId: string;
  /** Lot the units are taken from (null when the product has no FIFO data). */
  lotId: string | null;
  /** Units taken (for ml/kg products: the whole bottle's content). */
  qty: number;
  /** Ticked on the pick list. */
  picked: boolean;
  /** Return form (filled at the end). */
  outcome: Outcome;
  /** Shelf to put it back on. */
  shelf: string;
  /** How much was used up ("zejście"), in the product unit. Only for outcome "back". */
  used: number;
  /** A closed bottle was opened during the training. */
  opened: boolean;
  note: string;
}

export interface Training {
  startedAt: string;
  stage: 'pick' | 'return';
  /** The pasted text, kept so the session can be reviewed. */
  input: string;
  lines: TrainingLine[];
  /** Codes that matched no product. */
  unknown: string[];
  /** Codes whose product has no stock. */
  empty: string[];
}

export type MoveKind = 'used' | 'waste' | 'other' | 'moved' | 'opened' | 'consumed' | 'delivered' | 'adjusted';

export const MOVE_LABEL: Record<MoveKind, string> = {
  used: 'Zużyte do końca',
  waste: 'Wyrzucone (zepsute)',
  other: 'Usunięte ze stanu',
  moved: 'Przeniesione na inną półkę',
  opened: 'Otwarte',
  consumed: 'Zejście',
  delivered: 'Dostawa',
  adjusted: 'Korekta na półce',
};

export interface Move {
  id: string;
  at: string;
  productId: string;
  name: string;
  kind: MoveKind;
  qty: number;
  unit: string;
  note?: string;
}

const COUNT_UNITS = new Set(['szt.', 'op.']);
const uid = () => newLot().id;

/** Splits pasted text into product codes (new lines, commas, semicolons, tabs, spaces). */
export function parseCodes(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
}

/** Lots in pick order: FIFO (opened first, then shortest date), expired ones last. */
export function pickOrder(lots: Lot[]): Lot[] {
  const live = lots.filter((l) => l.qty > 0);
  const fresh = fifoSort(live.filter((l) => expiryState(l) !== 'expired'));
  const expired = fifoSort(live.filter((l) => expiryState(l) === 'expired'));
  return [...fresh, ...expired];
}

function findProduct(products: Product[], code: string): Product | undefined {
  const hits = products.filter((p) => p.code.toUpperCase() === code || p.id.toUpperCase() === code);
  // Folders reuse a code now and then — prefer the product that is actually in stock.
  return hits.find((p) => p.qty > 0) ?? hits[0];
}

/**
 * Turns the pasted codes into a pick list. A code pasted N times takes N units (szt./op.);
 * for ml/kg products one code = one bottle (the whole lot).
 */
export function buildTraining(products: Product[], input: string): Training {
  const counts = new Map<string, number>();
  for (const c of parseCodes(input)) counts.set(c, (counts.get(c) ?? 0) + 1);
  const lines: TrainingLine[] = [];
  const unknown: string[] = [];
  const empty: string[] = [];

  for (const [code, n] of counts) {
    const p = findProduct(products, code);
    if (!p) {
      unknown.push(code);
      continue;
    }
    if (p.qty <= 0) {
      empty.push(code);
      continue;
    }
    const base = { productId: p.id, picked: false, outcome: 'back' as Outcome, used: 0, opened: false, note: '' };
    const lots = pickOrder(p.lots ?? []);
    if (!lots.length) {
      lines.push({ ...base, id: uid(), lotId: null, qty: COUNT_UNITS.has(p.unit) ? Math.min(n, p.qty) : p.qty, shelf: '' });
      continue;
    }
    if (!COUNT_UNITS.has(p.unit)) {
      lots.slice(0, n).forEach((l) => lines.push({ ...base, id: uid(), lotId: l.id, qty: l.qty, shelf: l.shelf ?? '' }));
      continue;
    }
    let left = n;
    for (const l of lots) {
      if (!left) break;
      const take = Math.min(l.qty, left);
      lines.push({ ...base, id: uid(), lotId: l.id, qty: take, shelf: l.shelf ?? '' });
      left -= take;
    }
  }
  return { startedAt: new Date().toISOString(), stage: 'pick', input, lines, unknown, empty };
}

const lotKey = (l: Lot) => (l.pack ? `case:${l.id}` : [l.shelf ?? '', l.open, l.openedAt ?? '', l.expiresAt ?? ''].join('|'));

/** Adds a lot, merging it into an identical one (same shelf, state and dates). */
function putLot(lots: Lot[], add: Lot): Lot[] {
  if (add.qty <= 0) return lots;
  const i = lots.findIndex((l) => lotKey(l) === lotKey(add));
  if (i < 0) return [...lots, add];
  return lots.map((l, j) => (j === i ? { ...l, qty: l.qty + add.qty } : l));
}

function takeFromLot(lots: Lot[], lotId: string | null, qty: number): { lots: Lot[]; taken: Lot | null } {
  const src = lots.find((l) => l.id === lotId);
  if (!src) return { lots, taken: null };
  const rest = lots.map((l) => (l.id === lotId ? { ...l, qty: Math.max(0, l.qty - qty) } : l)).filter((l) => l.qty > 0);
  return { lots: rest, taken: src };
}

/**
 * Applies the end-of-training form to the stock: puts units back (possibly on another shelf or
 * opened), subtracts usage ("zejście"), and removes used-up / spoiled / otherwise gone units.
 * Returns updated products and the movements to log.
 */
export function applyTraining(products: Product[], training: Training, today = todayIso()): { products: Product[]; moves: Move[] } {
  const at = new Date().toISOString();
  const moves: Move[] = [];
  const byId = new Map(products.map((p) => [p.id, { ...p, lots: [...(p.lots ?? [])] }]));

  for (const line of training.lines) {
    const p = byId.get(line.productId);
    if (!p) continue;
    const log = (kind: MoveKind, qty: number, note?: string) =>
      moves.push({ id: uid(), at, productId: p.id, name: p.name, kind, qty, unit: p.unit, note: note || undefined });
    const { lots, taken } = takeFromLot(p.lots, line.lotId, line.qty);

    if (line.outcome !== 'back') {
      p.lots = lots;
      p.qty = Math.max(0, p.qty - line.qty);
      log(line.outcome, line.qty, line.note);
      continue;
    }

    const used = Math.min(Math.max(0, line.used), line.qty);
    const back = line.qty - used;
    const shelf = line.shelf.trim() || undefined;
    p.qty = Math.max(0, p.qty - used);
    if (used) log('consumed', used, line.note);

    if (!taken) {
      // No FIFO data for this product — only record where the returned units went.
      if (shelf && back) p.lots = putLot(p.lots, newLot({ qty: back, shelf, open: line.opened, openedAt: line.opened ? today : undefined }));
      continue;
    }
    const nowOpen = taken.open || line.opened || (used > 0 && !COUNT_UNITS.has(p.unit));
    if (nowOpen && !taken.open) log('opened', back || line.qty);
    if ((shelf ?? '') !== (taken.shelf ?? '') && back) log('moved', back, `${taken.shelf ?? 'bez półki'} → ${shelf ?? 'bez półki'}`);
    p.lots = putLot(lots, {
      ...taken,
      id: uid(),
      qty: back,
      shelf,
      open: nowOpen,
      openedAt: nowOpen ? (taken.openedAt ?? today) : undefined,
    });
  }
  return { products: products.map((p) => byId.get(p.id) ?? p), moves };
}
