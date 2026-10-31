import { newLot } from './fifo';
import type { Lot, Product } from './types';

/** Units per case for a product; Lord of Taste mixers come in trays of 12. */
export function packSizeOf(p: Pick<Product, 'packSize' | 'code' | 'catalogId'>): number | undefined {
  if (p.packSize && p.packSize > 1) return p.packSize;
  if (/^LOTMIX/i.test(p.catalogId ?? p.code)) return 12;
  return undefined;
}

/** n units → full cases of `size` plus the remainder as one more (partial) case. */
export function splitIntoCases(n: number, size: number, base: Partial<Lot> = {}): Lot[] {
  const out: Lot[] = [];
  let left = n;
  while (left > 0) {
    const q = Math.min(size, left);
    out.push(newLot({ ...base, qty: q, pack: true }));
    left -= q;
  }
  return out;
}

/** "2 zgrzewki (12+8) + 3 luzem" */
export function packSummary(lots: Lot[], size?: number): string | null {
  const cases = lots.filter((l) => l.pack);
  if (!cases.length) return null;
  const loose = lots.filter((l) => !l.pack).reduce((s, l) => s + l.qty, 0);
  const word = cases.length === 1 ? 'zgrzewka' : cases.length < 5 ? 'zgrzewki' : 'zgrzewek';
  const full = size ? cases.filter((c) => c.qty >= size).length : 0;
  const detail = size && full !== cases.length ? ` (${cases.map((c) => c.qty).join('+')})` : '';
  return `${cases.length} ${word}${detail}${loose ? ` + ${loose} luzem` : ''}`;
}
