import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { volumeOf } from './lib/volume';
import { unitFor } from './lib/catalog';
import { lotsFromQty, orderUnitOf, splitLotsIntoBottles } from './lib/units';
import { loadCopy, saveCopy } from './lib/offline';
import { mergeValue } from './lib/merge';
import { LOG_LIMIT as PARTS_LOG_LIMIT, mergeLog, PART_NAMES, PARTS, partChanged, pickPart, type PartName } from './lib/parts';
import { useAuth, Splash } from './auth';
import { api, ApiError } from './lib/api';
import { withStatus } from './lib/stock';
import { packSizeOf, splitIntoCases } from './lib/pack';
import { parseSize } from './lib/volume';
import { adjustOnShelf, type Adjust } from './lib/shelfCount';
import { applyTraining, buildTraining, type Move, type Training } from './lib/training';
import { formatDate, todayIso } from './lib/text';
import { newLot } from './lib/fifo';
import type { CatalogItem, DraftLine, Lot, Pending, Product, ShelfDef, StockedProduct, Unit } from './lib/types';

export interface State {
  products: Product[];
  /** Date of the last finished inventory count (ISO). */
  lastCount: string;
  /** In-progress inventory: product id → typed count (digits, '' = not counted). */
  counts: Record<string, string>;
  /** "Do zamówienia" check-offs: product id → ordered. Cleared by the next inventory. */
  ordered: Record<string, boolean>;
  /** In-progress inventory FIFO batches: product id → lots. When present, their sum is the count. */
  countLots?: Record<string, Lot[]>;
  /** Training session in progress (products taken off the shelves). */
  training?: Training | null;
  /** Stock movements outside inventories (newest first, capped). */
  log?: Move[];
  /** Manual edits of the order list, by product id. */
  orderDraft?: Record<string, DraftLine>;
  /** Ordered, not yet delivered. */
  pending?: Pending[];
  /** Shelf layouts (rows → slots → products). */
  shelves?: ShelfDef[];
  /** Shelf-by-shelf count: products confirmed per shelf and when the shelf was finished. */
  shelfAudit?: Record<string, ShelfAudit>;
}

export interface ShelfAudit {
  /** ISO date the checks below belong to (checks from other days don't count). */
  date: string;
  done: string[];
  finished?: boolean;
}

export interface Receipt {
  qty: number;
  shelf?: string;
  expiresAt?: string;
}

const LOG_LIMIT = PARTS_LOG_LIMIT;

export type ProductDraft = Pick<Product, 'name' | 'code' | 'cat' | 'unit' | 'min'> & {
  packSize?: number;
  volume?: number;
  volumeUnit?: 'ml' | 'g';
  price?: number;
  ean?: string;
};

type Action =
  | { type: 'add'; id: string; draft: ProductDraft }
  | { type: 'addMany'; products: Product[] }
  | { type: 'setPrices'; prices: Record<string, number> }
  | { type: 'update'; id: string; patch: Partial<ProductDraft> }
  | { type: 'archive'; id: string }
  | { type: 'setCount'; id: string; value: string }
  | { type: 'setLots'; id: string; lots: Lot[] }
  | { type: 'setTraining'; training: Training | null }
  | { type: 'setDraft'; id: string; line: DraftLine | null }
  | { type: 'fixUnits' }
  | { type: 'placeOrder'; lines: { productId: string; qty: number }[]; at: string }
  | { type: 'receive'; pendingId: string; parts: Receipt[]; at: string }
  | { type: 'cancelPending'; pendingId: string }
  | { type: 'saveShelf'; shelf: ShelfDef }
  | { type: 'shelfAdjust'; adjust: Adjust; at: string; date: string }
  | { type: 'shelfCheck'; shelf: string; productId: string; date: string }
  | { type: 'shelfFinish'; shelf: string; date: string; finished: boolean }
  | { type: 'deleteShelf'; id: string }
  | { type: 'finishTraining'; date: string }
  | { type: 'finishInventory'; date: string }
  | { type: 'toggleOrdered'; id: string }
  | { type: 'replace'; state: State }
  | { type: 'patch'; patch: Partial<State> }
  | { type: 'reset'; mode: ResetMode; date: string };

/** `products`: delete every product (start from scratch). `stock`: keep products, set all stock to 0. */
export type ResetMode = 'products' | 'stock';

export type SyncStatus = 'saved' | 'saving' | 'error' | 'conflict' | 'offline';

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Today's audit of a shelf (an audit from another day starts fresh). */
function auditFor(state: State, shelf: string, date: string): ShelfAudit {
  const a = state.shelfAudit?.[shelf];
  return a && a.date === date ? a : { date, done: [] };
}

/**
 * A product counted on a shelf ("Po półkach") also counts in the regular inventory, so finishing the
 * inventory doesn't treat it as missing. Not counted yet → its stock after the shelf count; counted
 * already → the shelf correction is added to that number.
 */
function countFromShelf(state: State, products: Product[], pid: string, delta: number): Pick<State, 'counts' | 'countLots'> {
  const p = products.find((x) => x.id === pid);
  const counts = state.counts;
  const countLots = state.countLots ?? {};
  if (!p) return { counts, countLots };
  const had = counts[pid];
  if (had == null || had === '') return { counts: { ...counts, [pid]: String(p.qty) }, countLots: { ...countLots, [pid]: p.lots ?? [] } };
  if (!delta) return { counts, countLots };
  if (countLots[pid]?.length) return { counts: { ...counts, [pid]: String(p.qty) }, countLots: { ...countLots, [pid]: p.lots ?? [] } };
  return { counts: { ...counts, [pid]: String(Math.max(0, Number(had) + delta)) }, countLots };
}

export function unitFixes(products: Product[]): { p: Product; unit: Unit }[] {
  return products.flatMap((p) => {
    if (p.archived || !p.catalogId) return [];
    const unit = unitFor(p);
    return unit !== p.unit ? [{ p, unit }] : [];
  });
}

/**
 * Switches products to their catalog unit and converts amounts. From ml to pieces/packs the amount
 * is divided by the pack content (200 ml mixer, 100 g dried fruit, 1 kg puree); for accessories the
 * size isn't the content, so amounts stay and the minimum becomes 1.
 */
function fixUnits(state: State): State {
  const fixes = new Map(unitFixes(state.products).map((f) => [f.p.id, f.unit]));
  if (!fixes.size) return state;
  const conv = (p: Product, unit: Unit) => {
    const v = volumeOf(p);
    const div = p.unit === 'ml' && unit !== 'ml' && p.cat !== 'akcesoria' && v && v.value > 1 ? v.value : 1;
    const q = (n: number) => (n > 0 ? Math.max(1, Math.round(n / div)) : 0);
    const minQ = (n: number) => (n > 0 ? (div > 1 ? q(n) : unit === 'ml' ? n : 1) : 0);
    return { q, minQ, div };
  };
  const products = state.products.map((p) => {
    const unit = fixes.get(p.id);
    if (!unit) return p;
    const { q, minQ } = conv(p, unit);
    return {
      ...p,
      unit,
      qty: q(p.qty),
      min: minQ(p.min),
      hist: p.hist.map((h) => ({ ...h, qty: q(h.qty) })),
      lots: (p.lots ?? []).map((l) => ({ ...l, qty: q(l.qty) })).filter((l) => l.qty > 0),
    };
  });
  const counts = { ...state.counts };
  const countLots = { ...(state.countLots ?? {}) };
  for (const p of state.products) {
    const unit = fixes.get(p.id);
    if (!unit) continue;
    const { q } = conv(p, unit);
    if (counts[p.id]) counts[p.id] = String(q(Number(counts[p.id])));
    if (countLots[p.id]) countLots[p.id] = countLots[p.id].map((l) => ({ ...l, qty: q(l.qty) })).filter((l) => l.qty > 0);
  }
  const pending = (state.pending ?? []).map((x) => {
    const p = state.products.find((y) => y.id === x.productId);
    const unit = fixes.get(x.productId);
    if (!p || !unit) return x;
    const { q, div } = conv(p, unit);
    const { perUnit: _drop, ...rest } = x;
    // Ordered in bottles/pieces already (perUnit) and nothing to divide by → keep the ordered number.
    return { ...rest, qty: div > 1 ? q(x.qty * (x.perUnit ?? 1)) : x.qty };
  });
  const { orderDraft: _d, ...rest } = state;
  const orderDraft = Object.fromEntries(Object.entries(state.orderDraft ?? {}).filter(([id]) => !fixes.has(id)));
  return { ...rest, products, counts, countLots, pending, orderDraft };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'replace':
      return action.state;
    case 'patch':
      return { ...state, ...action.patch };
    case 'reset':
      if (action.mode === 'products')
        return { ...state, products: [], lastCount: action.date, counts: {}, ordered: {}, countLots: {}, training: null, pending: [], orderDraft: {} };
      return { ...state, products: state.products.map((p) => ({ ...p, qty: 0, lots: [] })), counts: {}, ordered: {}, countLots: {}, training: null };
    case 'setPrices':
      return { ...state, products: state.products.map((p) => (action.prices[p.id] != null ? { ...p, price: action.prices[p.id] } : p)) };
    case 'addMany':
      return { ...state, products: [...state.products, ...action.products] };
    case 'add':
      return {
        ...state,
        products: [...state.products, { ...action.draft, id: action.id, qty: 0, hist: [] }],
      };
    case 'update':
      return {
        ...state,
        products: state.products.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)),
      };
    case 'archive':
      return {
        ...state,
        products: state.products.map((p) => (p.id === action.id ? { ...p, archived: true } : p)),
      };
    case 'setCount': {
      // Typing a number by hand drops the batch breakdown for that product.
      const { [action.id]: _drop, ...rest } = state.countLots ?? {};
      return { ...state, counts: { ...state.counts, [action.id]: action.value }, countLots: rest };
    }
    case 'setDraft': {
      const { [action.id]: _old, ...rest } = state.orderDraft ?? {};
      return { ...state, orderDraft: action.line ? { ...rest, [action.id]: action.line } : rest };
    }
    case 'fixUnits':
      return fixUnits(state);
    case 'placeOrder': {
      const added = action.lines
        .filter((l) => l.qty > 0)
        .map((l) => {
          const p = state.products.find((x) => x.id === l.productId);
          const perUnit = p ? orderUnitOf(p).perUnit : 1;
          return { id: newLot().id, productId: l.productId, qty: l.qty, orderedAt: action.at, ...(perUnit > 1 ? { perUnit } : {}) };
        });
      return { ...state, pending: [...(state.pending ?? []), ...added], orderDraft: {} };
    }
    case 'saveShelf': {
      const list = state.shelves ?? [];
      const i = list.findIndex((s) => s.id === action.shelf.id);
      return { ...state, shelves: i < 0 ? [...list, action.shelf] : list.map((s, j) => (j === i ? action.shelf : s)) };
    }
    case 'shelfAdjust': {
      const r = adjustOnShelf(state.products, state.shelves ?? [], action.adjust, action.at);
      const audit = auditFor(state, action.adjust.shelf, action.date);
      return {
        ...state,
        ...countFromShelf(state, r.products, action.adjust.productId, r.move?.qty ?? 0),
        products: r.products,
        shelves: r.shelves,
        log: r.move ? [r.move, ...(state.log ?? [])].slice(0, LOG_LIMIT) : state.log,
        shelfAudit: { ...(state.shelfAudit ?? {}), [action.adjust.shelf]: { ...audit, done: [...new Set([...audit.done, action.adjust.productId])] } },
      };
    }
    case 'shelfCheck': {
      const audit = auditFor(state, action.shelf, action.date);
      const undo = audit.done.includes(action.productId);
      const done = undo ? audit.done.filter((x) => x !== action.productId) : [...audit.done, action.productId];
      return { ...state, ...(undo ? {} : countFromShelf(state, state.products, action.productId, 0)), shelfAudit: { ...(state.shelfAudit ?? {}), [action.shelf]: { ...audit, done } } };
    }
    case 'shelfFinish': {
      const audit = auditFor(state, action.shelf, action.date);
      return { ...state, shelfAudit: { ...(state.shelfAudit ?? {}), [action.shelf]: { ...audit, finished: action.finished } } };
    }
    case 'deleteShelf':
      return { ...state, shelves: (state.shelves ?? []).filter((s) => s.id !== action.id) };
    case 'cancelPending':
      return { ...state, pending: (state.pending ?? []).filter((x) => x.id !== action.pendingId) };
    case 'receive': {
      // One delivery line can be split into parts with different shelves / best-before dates.
      const pend = (state.pending ?? []).find((x) => x.id === action.pendingId);
      if (!pend) return state;
      // Quantities come in ordered units (bottles); stock may be kept in ml.
      const per = pend.perUnit ?? 1;
      const ordered = action.parts.map((r) => Math.max(0, r.qty));
      const parts = action.parts.map((r, i) => ({ ...r, qty: ordered[i] * per })).filter((r) => r.qty > 0);
      const qty = parts.reduce((s, r) => s + r.qty, 0);
      const left = pend.qty - ordered.reduce((a, b) => a + b, 0);
      const pending = (state.pending ?? []).flatMap((x) => (x.id !== pend.id ? [x] : left > 0 ? [{ ...x, qty: left }] : []));
      let name = '';
      let unit = '';
      const products = state.products.map((p) => {
        if (p.id !== pend.productId) return p;
        name = p.name;
        unit = p.unit;
        const lots = [...(p.lots ?? [])];
        const size = packSizeOf(p);
        for (const r of parts) {
          const base = { open: false, shelf: r.shelf?.trim() || undefined, expiresAt: r.expiresAt || undefined };
          if (size) {
            // Products delivered in cases (e.g. mixers in trays of 12) are stored case by case.
            lots.push(...splitIntoCases(r.qty, size, base));
            continue;
          }
          const lot: Lot = { id: newLot().id, qty: r.qty, ...base };
          const same = lots.findIndex((l) => !l.open && !l.pack && (l.shelf ?? '') === (lot.shelf ?? '') && (l.expiresAt ?? '') === (lot.expiresAt ?? ''));
          if (same >= 0) lots[same] = { ...lots[same], qty: lots[same].qty + r.qty };
          else lots.push(lot);
        }
        return { ...p, qty: p.qty + qty, lots };
      });
      const moves: Move[] = parts.map((r, i) => ({
        id: newLot().id,
        at: action.at,
        productId: pend.productId,
        name,
        kind: 'delivered' as const,
        qty: r.qty,
        unit,
        note:
          [
            r.shelf?.trim() && `półka ${r.shelf.trim()}`,
            r.expiresAt && `ważne do ${formatDate(r.expiresAt)}`,
            parts.length > 1 && `partia ${i + 1}/${parts.length}`,
            i === parts.length - 1 && left > 0 && `brakuje ${left}`,
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
      }));
      return { ...state, products, pending, log: [...moves.reverse(), ...(state.log ?? [])].slice(0, LOG_LIMIT) };
    }
    case 'setTraining':
      return { ...state, training: action.training };
    case 'finishTraining': {
      if (!state.training) return state;
      const { products, moves } = applyTraining(state.products, state.training, action.date);
      return { ...state, products, training: null, log: [...moves, ...(state.log ?? [])].slice(0, LOG_LIMIT) };
    }
    case 'setLots': {
      const lots = action.lots;
      const countLots = { ...(state.countLots ?? {}), [action.id]: lots };
      const counts = lots.length ? { ...state.counts, [action.id]: String(lots.reduce((s, l) => s + l.qty, 0)) } : state.counts;
      return { ...state, countLots, counts };
    }
    case 'toggleOrdered':
      return { ...state, ordered: { ...state.ordered, [action.id]: !state.ordered[action.id] } };
    case 'finishInventory': {
      const products = state.products.map((p) => {
        const raw = state.counts[p.id];
        if (p.archived || raw == null || raw === '') return p;
        const qty = Number(raw);
        // Every bottle separately: a typed "1300 ml" becomes a full 1000 ml bottle + an opened 300 ml one.
        const counted = (state.countLots?.[p.id] ?? []).filter((l) => l.qty > 0);
        const shelves = [...new Set((p.lots ?? []).map((l) => l.shelf ?? ''))];
        const lots = counted.length
          ? splitLotsIntoBottles(p, counted)
          : orderUnitOf(p).perUnit > 1
            ? lotsFromQty(p, qty, shelves.length === 1 && shelves[0] ? { shelf: shelves[0] } : {})
            : [];
        return { ...p, qty, lots, hist: [...p.hist.filter((h) => h.date !== action.date), { date: action.date, qty }] };
      });
      return { ...state, products, lastCount: action.date, counts: {}, ordered: {}, countLots: {} };
    }
  }
}

interface Store {
  state: State;
  /** Active (not archived) products with derived stock status. */
  products: StockedProduct[];
  byId: (id: string | null | undefined) => StockedProduct | undefined;
  needs: StockedProduct[];
  addProduct: (draft: ProductDraft) => string;
  /** Adds catalog items as new products (stock 0). Returns how many were added. */
  addFromCatalog: (items: CatalogItem[], opts: { min: number; unit: Unit | 'auto' }) => number;
  /** Products whose unit doesn't match the catalog rule (see unitFor). */
  unitFixes: { p: Product; unit: Unit }[];
  fixUnits: () => void;
  updateProduct: (id: string, patch: Partial<ProductDraft>) => void;
  archiveProduct: (id: string) => void;
  setCount: (id: string, value: string) => void;
  setLots: (id: string, lots: Lot[]) => void;
  startTraining: (input: string) => Training;
  updateTraining: (training: Training | null) => void;
  finishTraining: () => void;
  pending: Pending[];
  setDraft: (id: string, line: DraftLine | null) => void;
  placeOrder: (lines: { productId: string; qty: number }[]) => void;
  /** Receive a delivery line, possibly split into parts (shelf + best-before per part). */
  receive: (pendingId: string, parts: Receipt[]) => void;
  cancelPending: (pendingId: string) => void;
  shelves: ShelfDef[];
  saveShelf: (shelf: ShelfDef) => void;
  deleteShelf: (id: string) => void;
  shelfAudit: (shelf: string) => ShelfAudit;
  /** Replaces the whole warehouse with a backup (saved to the cloud like any change). */
  restore: (data: State) => void;
  /** Fills in missing prices of products added from the folders. */
  fillCatalogPrices: (items: CatalogItem[]) => void;
  adjustShelf: (adjust: Adjust) => void;
  checkOnShelf: (shelf: string, productId: string) => void;
  finishShelf: (shelf: string, finished: boolean) => void;
  finishInventory: () => void;
  resetWarehouse: (mode: ResetMode) => void;
  toggleOrdered: (id: string) => void;
  sync: SyncStatus;
  retrySync: () => void;
  dismissConflict: () => void;
}

const Ctx = createContext<Store | null>(null);

/** Loads the signed-in user's warehouse from Cloudflare (D1), then provides it. */
export function StoreProvider({ children }: { children: ReactNode }) {
  const { expired, user } = useAuth();
  const [loaded, setLoaded] = useState<{ data: State; saved: State; versions: Record<PartName, number>; offline?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    const copy = loadCopy<State>(user.id);
    api
      .getState()
      .then((server) => {
        // Unsaved changes from this device (e.g. made offline) win for the parts they touch;
        // they'll be saved (and merged with the server copy) right away.
        if (copy) {
          const dirty = PART_NAMES.filter((p) => partChanged(copy.state as never, copy.saved as never, p));
          if (dirty.length) {
            let data = server.data;
            let saved = server.data;
            const versions = { ...server.versions };
            for (const p of dirty) {
              data = { ...data, ...(pickPart(copy.state as never, p) as Partial<State>) };
              saved = { ...saved, ...(pickPart(copy.saved as never, p) as Partial<State>) };
              versions[p] = copy.versions[p] ?? 0;
            }
            return setLoaded({ data, saved, versions });
          }
        }
        setLoaded({ data: server.data, saved: server.data, versions: server.versions });
      })
      .catch((e: ApiError) => {
        if (e.status === 401) return expired();
        if (e.status === 0 && copy) return setLoaded({ data: copy.state, saved: copy.saved, versions: copy.versions, offline: true });
        setError(e.status === 0 ? 'Brak połączenia z internetem, a na tym urządzeniu nie ma jeszcze zapisanej kopii magazynu.' : e.message);
      });
  }, [expired, user.id]);
  useEffect(load, [load]);

  if (error) return <Splash text={error} retry={load} />;
  if (!loaded) return <Splash text="Wczytywanie magazynu…" />;
  return (
    <SyncedStore userId={user.id} initial={loaded.data} saved={loaded.saved} versions={loaded.versions} offline={loaded.offline} onUnauthorized={expired}>
      {children}
    </SyncedStore>
  );
}

const SAVE_DELAY = 600;
const RETRY_DELAY = 4000;

/**
 * Keeps local state in a reducer (instant UI) and saves it to the server shortly after each change.
 * Saves are serialized; a 409 means another device saved first, so we adopt the server copy.
 */
function SyncedStore({
  userId,
  initial,
  saved: initialSaved,
  versions,
  offline,
  onUnauthorized,
  children,
}: {
  userId: string;
  initial: State;
  saved: State;
  versions: Record<PartName, number>;
  offline?: boolean;
  onUnauthorized: () => void;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, initial);
  const [sync, setSync] = useState<SyncStatus>(offline ? 'offline' : 'saved');
  const stateRef = useRef(state);
  /** Last state known to be saved — compared per part (by field identity) to find what changed. */
  const savedRef = useRef(initialSaved);
  const versionsRef = useRef(versions);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  stateRef.current = state;
  const dirtyParts = () => PART_NAMES.filter((p) => partChanged(stateRef.current as never, savedRef.current as never, p));

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const dirty = dirtyParts();
    if (inFlight.current || !dirty.length) return;
    inFlight.current = true;
    const snapshot = stateRef.current;
    setSync('saving');
    let retryIn = 0;
    try {
      const payload = Object.fromEntries(dirty.map((p) => [p, { data: pickPart(snapshot as never, p), version: versionsRef.current[p] ?? 0 }]));
      const r = await api.putParts(payload);
      let saved: State = savedRef.current;
      for (const p of dirty) if (r.versions[p] != null) saved = { ...saved, ...(pickPart(snapshot as never, p) as Partial<State>) };
      versionsRef.current = { ...versionsRef.current, ...r.versions };
      // Log: the server merged entries from all devices; keep local ones added meanwhile.
      const mergedLog = r.merged.log?.data.log as State['log'];
      if (mergedLog) {
        const union = mergeLog(stateRef.current.log ?? [], mergedLog);
        const next = union.length === mergedLog.length ? mergedLog : union;
        saved = { ...saved, log: mergedLog };
        if (next !== stateRef.current.log) dispatch({ type: 'patch', patch: { log: next } });
      }
      // Parts saved meanwhile on another device: merge item by item (3-way) with the server copy;
      // what changed only here is kept and saved again, the server wins only for the same item.
      const conflicted = Object.entries(r.conflicts) as [PartName, { data: Partial<State>; version: number }][];
      let clash = false;
      for (const [p, c] of conflicted) {
        versionsRef.current[p] = c.version;
        const patch: Record<string, unknown> = {};
        for (const k of PARTS[p]) {
          const theirs = (c.data as Record<string, unknown>)[k];
          const res = mergeValue(
            (savedRef.current as unknown as Record<string, unknown>)[k],
            (stateRef.current as unknown as Record<string, unknown>)[k],
            theirs,
          );
          clash ||= res.clash;
          patch[k] = same(res.value, theirs) ? theirs : res.value;
          saved = { ...saved, [k]: theirs } as State;
        }
        dispatch({ type: 'patch', patch: patch as Partial<State> });
      }
      savedRef.current = saved;
      setSync(clash ? 'conflict' : 'saved');
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) return onUnauthorized();
      setSync(err.status === 0 ? 'offline' : 'error');
      retryIn = RETRY_DELAY;
    } finally {
      inFlight.current = false;
    }
    if (dirtyParts().length) timer.current = setTimeout(flush, retryIn || SAVE_DELAY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onUnauthorized]);

  useEffect(() => {
    if (!PART_NAMES.some((p) => partChanged(state as never, savedRef.current as never, p))) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  }, [state, flush]);

  // Local copy on this device (works offline; merged with the server on reconnect).
  useEffect(() => {
    const t = setTimeout(() => saveCopy(userId, { state, saved: savedRef.current, versions: versionsRef.current }), 300);
    return () => clearTimeout(t);
  }, [state, sync, userId]);

  // Back online → save what's waiting.
  useEffect(() => {
    const on = () => void flush();
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [flush]);

  // Save immediately when the tab is hidden or closed, so a quick switch away doesn't lose counts.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [flush]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyParts().length) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const store = useMemo<Store>(() => {
    const incoming = new Map<string, number>();
    for (const x of state.pending ?? []) incoming.set(x.productId, (incoming.get(x.productId) ?? 0) + x.qty * (x.perUnit ?? 1));
    const products = state.products.filter((p) => !p.archived).map((p) => withStatus(p, incoming.get(p.id) ?? 0));
    return {
      state,
      products,
      byId: (id) => products.find((p) => p.id === id),
      needs: products.filter((p) => p.needs),
      addProduct: (draft) => {
        const taken = new Set(state.products.map((p) => p.id));
        let id = draft.code || 'NOWY-1';
        for (let i = 1; taken.has(id); i++) id = `${draft.code || 'NOWY'}-${i}`;
        dispatch({ type: 'add', id, draft: { ...draft, code: draft.code || id } });
        return id;
      },
      addFromCatalog: (items, { min, unit }) => {
        const taken = new Set(state.products.map((p) => p.id));
        const have = new Set(state.products.filter((p) => !p.archived && p.catalogId).map((p) => p.catalogId));
        const fresh: Product[] = [];
        for (const it of items) {
          if (have.has(it.id)) continue;
          let id = it.id;
          for (let i = 2; taken.has(id); i++) id = `${it.id}-${i}`;
          taken.add(id);
          fresh.push({
            id,
            code: it.code,
            name: it.name,
            cat: it.cat,
            unit: unit === 'auto' ? unitFor(it) : unit,
            min,
            qty: 0,
            hist: [],
            brand: it.brand,
            size: it.size,
            image: it.image ?? undefined,
            catalogId: it.id,
            packSize: it.packSize,
            price: it.price ?? undefined,
            volume: parseSize(it.size)?.value,
            volumeUnit: parseSize(it.size)?.unit,
          });
        }
        if (fresh.length) dispatch({ type: 'addMany', products: fresh });
        return fresh.length;
      },
      unitFixes: unitFixes(state.products),
      fixUnits: () => dispatch({ type: 'fixUnits' }),
      updateProduct: (id, patch) => dispatch({ type: 'update', id, patch }),
      archiveProduct: (id) => dispatch({ type: 'archive', id }),
      setCount: (id, value) => dispatch({ type: 'setCount', id, value }),
      setLots: (id, lots) => dispatch({ type: 'setLots', id, lots }),
      startTraining: (input) => {
        const t = buildTraining(products, input);
        dispatch({ type: 'setTraining', training: t });
        return t;
      },
      updateTraining: (training) => dispatch({ type: 'setTraining', training }),
      finishTraining: () => dispatch({ type: 'finishTraining', date: todayIso() }),
      pending: state.pending ?? [],
      setDraft: (id, line) => dispatch({ type: 'setDraft', id, line }),
      placeOrder: (lines) => dispatch({ type: 'placeOrder', lines, at: new Date().toISOString() }),
      receive: (pendingId, parts) => dispatch({ type: 'receive', pendingId, parts, at: new Date().toISOString() }),
      cancelPending: (pendingId) => dispatch({ type: 'cancelPending', pendingId }),
      shelves: state.shelves ?? [],
      saveShelf: (shelf) => dispatch({ type: 'saveShelf', shelf }),
      deleteShelf: (id) => dispatch({ type: 'deleteShelf', id }),
      shelfAudit: (shelf) => auditFor(state, shelf, todayIso()),
      restore: (data) => dispatch({ type: 'replace', state: data }),
      fillCatalogPrices: (items) => {
        const byId = new Map(items.map((i) => [i.id, i.price]));
        const prices: Record<string, number> = {};
        for (const p of state.products) {
          const price = p.catalogId ? byId.get(p.catalogId) : undefined;
          if (p.price == null && price != null) prices[p.id] = price;
        }
        if (Object.keys(prices).length) dispatch({ type: 'setPrices', prices });
      },
      adjustShelf: (adjust) => dispatch({ type: 'shelfAdjust', adjust, at: new Date().toISOString(), date: todayIso() }),
      checkOnShelf: (shelf, productId) => dispatch({ type: 'shelfCheck', shelf, productId, date: todayIso() }),
      finishShelf: (shelf, finished) => dispatch({ type: 'shelfFinish', shelf, date: todayIso(), finished }),
      finishInventory: () => dispatch({ type: 'finishInventory', date: todayIso() }),
      resetWarehouse: (mode) => dispatch({ type: 'reset', mode, date: todayIso() }),
      toggleOrdered: (id) => dispatch({ type: 'toggleOrdered', id }),
      sync,
      retrySync: () => void flush(),
      dismissConflict: () => setSync('saved'),
    };
  }, [state, sync, flush]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside <StoreProvider>');
  return s;
}
