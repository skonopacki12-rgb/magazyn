import { packSizeOf } from './pack';
import type { Product } from './types';
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
