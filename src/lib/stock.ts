import type { Product, StockedProduct } from './types';
import { orderUnitOf, packsFor } from './units';

/** `incoming` = units already ordered (pending deliveries); they reduce what still needs ordering. */
export function withStatus(p: Product, incoming = 0): StockedProduct {
  const ou = orderUnitOf(p);
  if (!p.hist.length && p.qty === 0)
    return { ...p, isOut: false, isLow: false, isOk: false, uncounted: true, needs: false, toOrder: 0, incoming, orderQty: 0, orderLabel: ou.label };
  const toOrder = Math.max(p.min - p.qty - incoming, 0);
  const isOut = p.qty === 0;
  const isLow = !isOut && p.qty < p.min;
  return {
    ...p,
    isOut,
    isLow,
    isOk: !isOut && !isLow,
    needs: toOrder > 0,
    toOrder,
    incoming,
    orderQty: packsFor(toOrder, ou),
    orderLabel: ou.label,
  };
}

/** Text for the big coloured status band on product views. */
export function bandText(p: StockedProduct): string {
  if (p.uncounted) return 'Niepoliczony — stan po inwentaryzacji';
  if (p.isOut) return p.orderQty ? `Brak — zamów ${p.orderQty} ${p.orderLabel}` : 'Brak w magazynie';
  if (p.isLow) return `Mało — zamów ${p.orderQty} ${p.orderLabel}`;
  return 'Jest w magazynie';
}

export function orderListText(items: StockedProduct[]): string {
  return items.map((p) => `${p.name} (${p.code}) – ${p.orderQty} ${p.orderLabel}`).join('\n');
}
