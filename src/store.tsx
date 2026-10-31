import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
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

const LOG_LIMIT = 300;

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
  | { type: 'reset'; mode: ResetMode; date: string };

/** `products`: delete every product (start from scratch). `stock`: keep products, set all stock to 0. */
export type ResetMode = 'products' | 'stock';

export type SyncStatus = 'saved' | 'saving' | 'error' | 'conflict';

/** Today's audit of a shelf (an audit from another day starts fresh). */
function auditFor(state: State, shelf: string, date: string): ShelfAudit {
  const a = state.shelfAudit?.[shelf];
  return a && a.date === date ? a : { date, done: [] };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'replace':
      return action.state;
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
    case 'placeOrder': {
      const added = action.lines.filter((l) => l.qty > 0).map((l) => ({ id: newLot().id, productId: l.productId, qty: l.qty, orderedAt: action.at }));
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
        products: r.products,
        shelves: r.shelves,
        log: r.move ? [r.move, ...(state.log ?? [])].slice(0, LOG_LIMIT) : state.log,
        shelfAudit: { ...(state.shelfAudit ?? {}), [action.adjust.shelf]: { ...audit, done: [...new Set([...audit.done, action.adjust.productId])] } },
      };
    }
    case 'shelfCheck': {
      const audit = auditFor(state, action.shelf, action.date);
      const done = audit.done.includes(action.productId) ? audit.done.filter((x) => x !== action.productId) : [...audit.done, action.productId];
      return { ...state, shelfAudit: { ...(state.shelfAudit ?? {}), [action.shelf]: { ...audit, done } } };
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
      const parts = action.parts.map((r) => ({ ...r, qty: Math.max(0, r.qty) })).filter((r) => r.qty > 0);
      const qty = parts.reduce((s, r) => s + r.qty, 0);
      const left = pend.qty - qty;
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
        const lots = (state.countLots?.[p.id] ?? []).filter((l) => l.qty > 0);
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
  addFromCatalog: (items: CatalogItem[], opts: { min: number; unit: Unit }) => number;
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
  const { expired } = useAuth();
  const [loaded, setLoaded] = useState<{ data: State; version: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api
      .getState()
      .then(setLoaded)
      .catch((e: ApiError) => (e.status === 401 ? expired() : setError(e.message)));
  }, [expired]);
  useEffect(load, [load]);

  if (error) return <Splash text={error} retry={load} />;
  if (!loaded) return <Splash text="Wczytywanie magazynu…" />;
  return (
    <SyncedStore initial={loaded.data} version={loaded.version} onUnauthorized={expired}>
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
function SyncedStore({ initial, version, onUnauthorized, children }: { initial: State; version: number; onUnauthorized: () => void; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const [sync, setSync] = useState<SyncStatus>('saved');
  const stateRef = useRef(state);
  const savedRef = useRef(initial);
  const versionRef = useRef(version);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  stateRef.current = state;

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inFlight.current || stateRef.current === savedRef.current) return;
    inFlight.current = true;
    const snapshot = stateRef.current;
    setSync('saving');
    let retryIn = 0;
    try {
      const r = await api.putState(snapshot, versionRef.current);
      versionRef.current = r.version;
      savedRef.current = snapshot;
      setSync('saved');
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) return onUnauthorized();
      const p = err.payload as { data?: State; version?: number } | undefined;
      if (err.status === 409 && p?.data && typeof p.version === 'number') {
        versionRef.current = p.version;
        savedRef.current = p.data;
        dispatch({ type: 'replace', state: p.data });
        setSync('conflict');
      } else {
        setSync('error');
        retryIn = RETRY_DELAY;
      }
    } finally {
      inFlight.current = false;
    }
    if (stateRef.current !== savedRef.current) timer.current = setTimeout(flush, retryIn || SAVE_DELAY);
  }, [onUnauthorized]);

  useEffect(() => {
    if (state === savedRef.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  }, [state, flush]);

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
      if (stateRef.current !== savedRef.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const store = useMemo<Store>(() => {
    const incoming = new Map<string, number>();
    for (const x of state.pending ?? []) incoming.set(x.productId, (incoming.get(x.productId) ?? 0) + x.qty);
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
            unit,
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
