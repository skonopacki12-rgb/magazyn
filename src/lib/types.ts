export type Category = 'syropy' | 'puree' | 'napoje' | 'akcesoria';
export type Unit = 'szt.' | 'op.' | 'kg';

export interface HistoryEntry {
  /** ISO date, yyyy-mm-dd */
  date: string;
  qty: number;
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
}

export interface StockStatus {
  isOut: boolean;
  isLow: boolean;
  isOk: boolean;
  /** qty below min (out-of-stock with min 0 does not count). */
  needs: boolean;
  toOrder: number;
}

export type StockedProduct = Product & StockStatus;
