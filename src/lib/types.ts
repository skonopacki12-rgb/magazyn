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
  toOrder: number;
}

export type StockedProduct = Product & StockStatus;
