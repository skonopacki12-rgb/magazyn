import type { Product } from './types';
import { volumeOf } from './volume';

const fmt = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 2 });
export const money = (n: number) => fmt.format(n);

/** Netto value of `qty` units of a product (products counted in ml are priced per bottle). */
export function valueOf(p: Pick<Product, 'price' | 'unit' | 'volume' | 'volumeUnit' | 'size'> & { name?: string }, qty: number): number {
  if (!p.price) return 0;
  if (p.unit === 'ml') {
    const v = volumeOf(p);
    if (v?.unit === 'ml' && v.value > 0) return (p.price * qty) / v.value;
  }
  return p.price * qty;
}

export function stockValue(products: (Pick<Product, 'price' | 'unit' | 'volume' | 'volumeUnit' | 'size' | 'qty'> & { name?: string })[]): { value: number; priced: number } {
  let value = 0;
  let priced = 0;
  for (const p of products) {
    if (!p.price) continue;
    priced++;
    value += valueOf(p, p.qty);
  }
  return { value, priced };
}
