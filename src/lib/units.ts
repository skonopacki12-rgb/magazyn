import { packSizeOf } from './pack';
import { newLot } from './fifo';
import type { Lot, Product } from './types';
import { volumeOf } from './volume';

/**
 * Stock may be counted in ml, but bottles are what stands on shelves and what gets ordered.
 * perUnit: stock units in one ordered unit (700 for a 700 ml bottle counted in ml, else 1).
 * step: order in multiples of this (12 for mixers in trays of 12).
 */
export interface OrderUnit {
  perUnit: number;
  step: number;
  label: string;
}

type P = Pick<Product, 'unit' | 'volume' | 'volumeUnit' | 'size' | 'packSize' | 'code' | 'catalogId'> & { name?: string };

export function orderUnitOf(p: P): OrderUnit {
  const v = volumeOf(p);
  const perUnit = p.unit === 'ml' && v?.unit === 'ml' && v.value > 1 ? v.value : 1;
  const step = perUnit === 1 ? (packSizeOf(p) ?? 1) : 1;
  return { perUnit, step, label: perUnit > 1 ? 'but.' : p.unit };
}

/** Whole packages needed to cover `units` of stock (rounded up to bottles and to full cases). */
export function packsFor(units: number, ou: OrderUnit): number {
  if (units <= 0) return 0;
  const n = Math.ceil(units / ou.perUnit);
  return Math.ceil(n / ou.step) * ou.step;
}

/** Bottles a stock amount takes on a shelf (an opened, part-full bottle is still a bottle). */
export function bottlesOf(p: P, qty: number): number {
  return Math.ceil(Math.max(0, qty) / orderUnitOf(p).perUnit);
}

/**
 * Bottles of a product in stock: each lot is counted on its own (two half-empty opened bottles are two
 * bottles), whatever isn't covered by lots is counted as full bottles.
 */
export function bottleCount(p: P & Pick<Product, 'qty' | 'lots'>, lots = p.lots ?? [], total = p.qty): number {
  const per = orderUnitOf(p).perUnit;
  if (per === 1) return Math.max(0, total);
  const inLots = lots.reduce((s, l) => s + l.qty, 0);
  return lots.reduce((s, l) => s + Math.ceil(Math.max(0, l.qty) / per), 0) + bottlesOf(p, total - inLots);
}

/** One physical bottle on a shelf / in a count. */
export interface Bottle {
  qty: number;
  open: boolean;
  lot: Lot;
}

/**
 * Lots → single bottles. A closed lot of 3000 ml is three 1000 ml bottles; an opened lot bigger than
 * a bottle (e.g. 1300 ml typed as one number) is one opened bottle (300) plus full ones (1000).
 * For products counted in pieces each unit is a bottle.
 */
export function bottlesOfLots(p: P, lots: Lot[]): Bottle[] {
  const b = orderUnitOf(p).perUnit;
  const out: Bottle[] = [];
  for (const lot of lots) {
    if (lot.qty <= 0) continue;
    if (b === 1) {
      for (let i = 0; i < lot.qty; i++) out.push({ qty: 1, open: lot.open, lot });
      continue;
    }
    const n = Math.ceil(lot.qty / b);
    const partial = lot.qty - (n - 1) * b;
    if (lot.open) out.push({ qty: partial, open: true, lot });
    for (let i = 0; i < (lot.open ? n - 1 : n); i++) out.push({ qty: !lot.open && i === n - 1 ? partial : b, open: false, lot });
  }
  return out;
}

/**
 * Splits lots so that every lot is either whole closed bottles or exactly one opened bottle:
 * "1300 ml" becomes a closed 1000 ml bottle + an opened 300 ml one.
 */
export function splitLotsIntoBottles(p: P, lots: Lot[]): Lot[] {
  const b = orderUnitOf(p).perUnit;
  if (b === 1) return lots;
  const out: Lot[] = [];
  for (const l of lots) {
    if (l.qty <= 0) continue;
    const full = Math.floor(l.qty / b);
    const rest = l.qty - full * b;
    if (!rest || (!l.open && !full)) {
      out.push(l);
      continue;
    }
    if (l.open && !full) {
      out.push(l);
      continue;
    }
    // Some full bottles + one part-used bottle (opened).
    out.push({ ...l, id: newLot().id, qty: full * b, open: false, openedAt: undefined });
    out.push({ ...l, qty: rest, open: true });
  }
  return out;
}

/** A counted amount without batch details → bottles (closed full ones + one opened rest). */
export function lotsFromQty(p: P, qty: number, base: Partial<Lot> = {}): Lot[] {
  if (qty <= 0) return [];
  return splitLotsIntoBottles(p, [newLot({ ...base, qty, open: false })]);
}
