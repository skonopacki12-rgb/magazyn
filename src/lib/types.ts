export type Category = 'syropy' | 'puree' | 'sosy' | 'napoje' | 'dodatki' | 'akcesoria';
export type Unit = 'szt.' | 'op.' | 'kg' | 'ml';

export interface HistoryEntry {
  /** ISO date, yyyy-mm-dd */
  date: string;
  qty: number;
}

/** One FIFO batch of a product: N units in the same state with the same dates. */
export interface Lot {
  id: string;
  qty: number;
  open: boolean;
  /** ISO date the bottle/pack was opened (only when open). */
  openedAt?: string;
  /** ISO best-before date. */
  expiresAt?: string;
  /** Shelf / location label, e.g. "A2" or "Bar – lodówka". */
  shelf?: string;
}

export interface Product {
  /** Stable key; the visible `code` can be edited. */
  id: string;
  code: string;
  name: string;
  cat: Category;
  unit: Unit;
  min: number;
  /** Stock from the latest finished inventory count. */
  qty: number;
  /** Oldest first. */
  hist: HistoryEntry[];
  archived?: boolean;
  /** Set for products added from the supplier folders. */
  brand?: string;
  /** Pack size, e.g. "1 l", "700 ml", "50 g". */
  size?: string;
  /** Image URL (served from /katalog/img/). */
  image?: string;
  /** Id of the catalog entry this product came from. */
  catalogId?: string;
  /** FIFO batches recorded in the last finished inventory. */
  lots?: Lot[];
}

/** One row of a shelf; each slot holds one product (bottle) or is empty. */
export interface ShelfRow {
  id: string;
  /** Product id per slot, null = empty slot. Length = number of slots in the row. */
  slots: (string | null)[];
}

/** Physical shelf layout (planogram). `name` matches the "Półka" label used in lots. */
export interface ShelfDef {
  id: string;
  name: string;
  /** Top row first. */
  rows: ShelfRow[];
}

/** An ordered product that hasn't arrived yet. */
export interface Pending {
  id: string;
  productId: string;
  qty: number;
  /** ISO timestamp of "Dodaj jako oczekujące". */
  orderedAt: string;
}

/** Manual changes to the order list: quantity and whether to order. Extra products can be added. */
export interface DraftLine {
  qty: number;
  include: boolean;
  /** Added by hand (not below minimum). */
  extra?: boolean;
}

/** One entry of public/katalog/katalog.json. */
export interface CatalogItem {
  id: string;
  code: string;
  name: string;
  brand: string;
  cat: Category;
  size: string;
  image: string | null;
  source: string;
}

export interface StockStatus {
  isOut: boolean;
  isLow: boolean;
  isOk: boolean;
  /** Never counted in an inventory yet — stock unknown, so it is not on the order list. */
  uncounted?: boolean;
  /** qty below min (out-of-stock with min 0 does not count). */
  needs: boolean;
  /** Units already ordered and on their way (pending deliveries). */
  incoming: number;
  toOrder: number;
}

export type StockedProduct = Product & StockStatus;
