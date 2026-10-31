import { newLot } from './fifo';
import { pickOrder, type Move } from './training';
import type { Lot, Product, ShelfDef } from './types';
import { bottleCount, bottlesOf, orderUnitOf } from './units';

/** One product as found on a shelf: what the lots say and how many slots it has in the layout. */
export interface ShelfItem {
  productId: string;
  /** Units on this shelf according to lots. */
  lotQty: number;
  /** Slots (bottles) holding this product in the shelf layout. */
  slots: number;
  /** True when some lot says this product is on the shelf. */
  hasLots: boolean;
  /** Bottles on this shelf according to lots (an opened bottle in ml is still one bottle). */
  bottles: number;
  /** Best current guess of what is on the shelf: lots if known, otherwise slots. */
  expected: number;
}

const lotsOn = (p: Product, shelf: string) => (p.lots ?? []).filter((l) => (l.shelf ?? '') === shelf);

/** Products on a shelf: from lots with this shelf name and from the layout's slots. */
export function shelfContents(products: Product[], shelf: string, layout?: ShelfDef): ShelfItem[] {
  const slots = new Map<string, number>();
  for (const r of layout?.rows ?? []) for (const pid of r.slots) if (pid) slots.set(pid, (slots.get(pid) ?? 0) + 1);
  const ids = new Set<string>([...slots.keys()]);
  for (const p of products) if (lotsOn(p, shelf).length) ids.add(p.id);
  const out: ShelfItem[] = [];
  for (const id of ids) {
    const p = products.find((x) => x.id === id);
    if (!p || p.archived) continue;
    const here = lotsOn(p, shelf);
    const lotQty = here.reduce((s, l) => s + l.qty, 0);
    const n = slots.get(id) ?? 0;
    out.push({ productId: id, lotQty, slots: n, bottles: bottleCount(p, here, lotQty), hasLots: here.length > 0, expected: here.length ? lotQty : n * orderUnitOf(p).perUnit });
  }
  return out;
}

export interface Adjust {
  shelf: string;
  productId: string;
  /** New number of units of the product on this shelf. */
  qty: number;
  /** A specific bottle tapped in the layout — that slot is emptied first. */
  slot?: { row: number; index: number };
  note?: string;
}

/**
 * Applies a shelf-count correction right away: product stock changes by the difference, lots on this
 * shelf grow (a closed lot) or shrink (from the end of the FIFO order, so what should be used first
 * stays), and the shelf layout gets bottles added to free slots or removed.
 */
export function adjustOnShelf(
  products: Product[],
  shelves: ShelfDef[],
  a: Adjust,
  at: string,
): { products: Product[]; shelves: ShelfDef[]; move: Move | null } {
  const p = products.find((x) => x.id === a.productId);
  if (!p) return { products, shelves, move: null };
  const layout = shelves.find((s) => s.name === a.shelf);
  const item = shelfContents(products, a.shelf, layout).find((i) => i.productId === p.id);
  const before = item?.expected ?? 0;
  const target = Math.max(0, Math.round(a.qty));
  const delta = target - before;

  // --- lots on this shelf
  let lots: Lot[] = [...(p.lots ?? [])];
  const here = lotsOn(p, a.shelf);
  if (!here.length) {
    // No lot data for this shelf yet: record what was counted.
    if (target > 0) lots.push(newLot({ qty: target, open: false, shelf: a.shelf }));
  } else if (delta > 0) {
    const i = lots.findIndex((l) => (l.shelf ?? '') === a.shelf && !l.open && !l.pack && !l.expiresAt);
    if (i >= 0) lots[i] = { ...lots[i], qty: lots[i].qty + delta };
    else lots.push(newLot({ qty: delta, open: false, shelf: a.shelf }));
  } else if (delta < 0) {
    let left = -delta;
    for (const l of [...pickOrder(here)].reverse()) {
      if (!left) break;
      const take = Math.min(l.qty, left);
      left -= take;
      lots = lots.map((x) => (x.id === l.id ? { ...x, qty: x.qty - take } : x));
    }
    lots = lots.filter((l) => l.qty > 0);
  }
  const qty = Math.max(0, p.qty + delta);
  const nextProducts = products.map((x) => (x.id === p.id ? { ...x, qty, lots } : x));

  // --- layout: make the product's slot count match the count (as far as free slots allow)
  let nextShelves = shelves;
  if (layout) {
    const rows = layout.rows.map((r) => ({ ...r, slots: [...r.slots] }));
    if (a.slot && rows[a.slot.row]?.slots[a.slot.index] === p.id) rows[a.slot.row].slots[a.slot.index] = null;
    // Slots are bottles: 1 ml more of an opened bottle doesn't take another slot.
    const hereAfter = lots.filter((l) => (l.shelf ?? '') === a.shelf);
    const want = hereAfter.length ? bottleCount(p, hereAfter, hereAfter.reduce((s, l) => s + l.qty, 0)) : bottlesOf(p, target);
    let have = rows.reduce((s, r) => s + r.slots.filter((x) => x === p.id).length, 0);
    for (let r = rows.length - 1; r >= 0 && have > want; r--)
      for (let i = rows[r].slots.length - 1; i >= 0 && have > want; i--)
        if (rows[r].slots[i] === p.id) {
          rows[r].slots[i] = null;
          have--;
        }
    // Bottles counted on the shelf take free slots in the layout (as far as there are free slots).
    for (let r = 0; r < rows.length && have < want; r++)
      for (let i = 0; i < rows[r].slots.length && have < want; i++)
        if (rows[r].slots[i] === null) {
          rows[r].slots[i] = p.id;
          have++;
        }
    nextShelves = shelves.map((s) => (s.id === layout.id ? { ...s, rows } : s));
  }

  const move: Move | null = delta
    ? {
        id: newLot().id,
        at,
        productId: p.id,
        name: p.name,
        kind: 'adjusted',
        qty: delta,
        unit: p.unit,
        note: [`półka ${a.shelf}: ${before} → ${target}`, a.note].filter(Boolean).join(' · '),
      }
    : null;
  return { products: nextProducts, shelves: nextShelves, move };
}

/** Every shelf name known from layouts or lots, sorted naturally. */
export function shelfNames(products: Product[], shelves: ShelfDef[]): string[] {
  const set = new Set(shelves.map((s) => s.name).filter(Boolean));
  for (const p of products) for (const l of p.lots ?? []) if (l.shelf) set.add(l.shelf);
  return [...set].sort((a, b) => a.localeCompare(b, 'pl', { numeric: true }));
}
