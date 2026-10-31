import type { Product, StockedProduct } from './types';

export function withStatus(p: Product): StockedProduct {
  const isOut = p.qty === 0;
  const isLow = !isOut && p.qty < p.min;
  return {
    ...p,
    isOut,
    isLow,
    isOk: !isOut && !isLow,
    needs: p.qty < p.min,
    toOrder: Math.max(p.min - p.qty, 0),
  };
}

/** Text for the big coloured status band on product views. */
export function bandText(p: StockedProduct): string {
  if (p.isOut) return p.toOrder ? `Brak — zamów ${p.toOrder} ${p.unit}` : 'Brak w magazynie';
  if (p.isLow) return `Mało — zamów ${p.toOrder} ${p.unit}`;
  return 'Jest w magazynie';
}

export function orderListText(items: StockedProduct[]): string {
  return items.map((p) => `${p.name} (${p.code}) – ${p.toOrder} ${p.unit}`).join('\n');
}
