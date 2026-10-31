import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { useAuth, Splash } from './auth';
import { api, ApiError } from './lib/api';
import { withStatus } from './lib/stock';
import { todayIso } from './lib/text';
import type { CatalogItem, Product, StockedProduct, Unit } from './lib/types';

export interface State {
  products: Product[];
  /** Date of the last finished inventory count (ISO). */
  lastCount: string;
  /** In-progress inventory: product id → typed count (digits, '' = not counted). */
  counts: Record<string, string>;
  /** "Do zamówienia" check-offs: product id → ordered. Cleared by the next inventory. */
  ordered: Record<string, boolean>;
}

export type ProductDraft = Pick<Product, 'name' | 'code' | 'cat' | 'unit' | 'min'>;

type Action =
  | { type: 'add'; id: string; draft: ProductDraft }
  | { type: 'addMany'; products: Product[] }
  | { type: 'update'; id: string; patch: Partial<ProductDraft> }
  | { type: 'archive'; id: string }
  | { type: 'setCount'; id: string; value: string }
  | { type: 'finishInventory'; date: string }
  | { type: 'toggleOrdered'; id: string }
  | { type: 'replace'; state: State }
  | { type: 'reset'; mode: ResetMode; date: string };

/** `products`: delete every product (start from scratch). `stock`: keep products, set all stock to 0. */
export type ResetMode = 'products' | 'stock';

export type SyncStatus = 'saved' | 'saving' | 'error' | 'conflict';

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'replace':
      return action.state;
    case 'reset':
      if (action.mode === 'products') return { products: [], lastCount: action.date, counts: {}, ordered: {} };
      return { ...state, products: state.products.map((p) => ({ ...p, qty: 0 })), counts: {}, ordered: {} };
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
    case 'setCount':
      return { ...state, counts: { ...state.counts, [action.id]: action.value } };
    case 'toggleOrdered':
      return { ...state, ordered: { ...state.ordered, [action.id]: !state.ordered[action.id] } };
    case 'finishInventory': {
      const products = state.products.map((p) => {
        const raw = state.counts[p.id];
        if (p.archived || raw == null || raw === '') return p;
        const qty = Number(raw);
        return { ...p, qty, hist: [...p.hist.filter((h) => h.date !== action.date), { date: action.date, qty }] };
      });
      return { ...state, products, lastCount: action.date, counts: {}, ordered: {} };
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
    const products = state.products.filter((p) => !p.archived).map(withStatus);
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
          });
        }
        if (fresh.length) dispatch({ type: 'addMany', products: fresh });
        return fresh.length;
      },
      updateProduct: (id, patch) => dispatch({ type: 'update', id, patch }),
      archiveProduct: (id) => dispatch({ type: 'archive', id }),
      setCount: (id, value) => dispatch({ type: 'setCount', id, value }),
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
