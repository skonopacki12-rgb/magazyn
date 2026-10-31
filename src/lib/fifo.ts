import type { Lot, Product } from './types';
import { todayIso } from './text';

/** A best-before date this close (in days) counts as "kończy się". */
export const SOON_DAYS = 14;

export type ExpiryState = 'expired' | 'soon' | 'ok' | 'none';

const DAY = 86_400_000;
const toDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;

/** Whole days from today to `iso` (negative = in the past). */
export function daysUntil(iso: string, today = todayIso()): number {
  return Math.round(toDay(iso) - toDay(today));
}

export function expiryState(l: Pick<Lot, 'expiresAt'>, today = todayIso()): ExpiryState {
  if (!l.expiresAt) return 'none';
  const d = daysUntil(l.expiresAt, today);
  return d < 0 ? 'expired' : d <= SOON_DAYS ? 'soon' : 'ok';
}

/**
 * FIFO order — what to use first: opened bottles first (oldest opening first),
 * then the earliest best-before date; lots without a date go last.
 */
export function fifoSort(lots: Lot[]): Lot[] {
  return [...lots].sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1;
    if (a.open && b.open && a.openedAt !== b.openedAt) return (a.openedAt ?? '9999') < (b.openedAt ?? '9999') ? -1 : 1;
    return (a.expiresAt ?? '9999-12-31') < (b.expiresAt ?? '9999-12-31') ? -1 : (a.expiresAt ?? '9999-12-31') > (b.expiresAt ?? '9999-12-31') ? 1 : 0;
  });
}

export function newLot(partial?: Partial<Lot>): Lot {
  return { id: Math.random().toString(36).slice(2, 10), qty: 1, open: false, ...partial };
}

/** Copy of lots with fresh ids (used by "Bez zmian" to carry the previous breakdown over). */
export const cloneLots = (lots: Lot[] = []) => lots.map((l) => ({ ...l, id: newLot().id }));

export interface LotAlert {
  product: Product;
  lot: Lot;
  state: ExpiryState;
  days: number | null;
}

/** Every lot that is past its date or close to it, soonest first. */
export function expiryAlerts(products: Product[], today = todayIso()): LotAlert[] {
  const out: LotAlert[] = [];
  for (const p of products)
    for (const lot of p.lots ?? []) {
      const state = expiryState(lot, today);
      if (state === 'expired' || state === 'soon') out.push({ product: p, lot, state, days: daysUntil(lot.expiresAt!, today) });
    }
  return out.sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
}
