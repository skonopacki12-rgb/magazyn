import { bandText } from '../lib/stock';
import type { StockStatus, StockedProduct } from '../lib/types';

export function statusClass(s: Pick<StockStatus, 'isOut' | 'isLow' | 'uncounted'>): string {
  return s.uncounted ? 'is-new' : s.isOut ? 'is-out' : s.isLow ? 'is-low' : 'is-ok';
}

/** Small "Jest / Mało / Brak" pill. */
export function StatusBadge({ p, small }: { p: Pick<StockStatus, 'isOut' | 'isLow' | 'uncounted'>; small?: boolean }) {
  const label = p.uncounted ? 'Nowy' : p.isOut ? 'Brak' : p.isLow ? 'Mało' : 'Jest';
  return <span className={`badge ${statusClass(p)}${small ? ' badge--sm' : ''}`}>{label}</span>;
}

/** Full-width status band ("Mało — zamów 2 szt."). */
export function StatusBand({ p, variant }: { p: StockedProduct; variant: 'flush' | 'card' | 'rounded' | 'xl' }) {
  const mod = variant === 'flush' ? '' : ` band--${variant}`;
  return <div className={`band${mod} ${statusClass(p)}`}>{bandText(p)}</div>;
}

export function Qty({ n, unit, size, unitSize }: { n: number; unit: string; size: number; unitSize: number }) {
  return (
    <span className="qty" style={{ gap: size >= 64 ? 8 : 6 }}>
      <span className="qty__n" style={{ fontSize: size, lineHeight: `${Math.round(size * 1.06)}px` }}>
        {n}
      </span>
      <span className="qty__u" style={{ fontSize: unitSize, lineHeight: `${unitSize + 6}px` }}>
        {unit}
      </span>
    </span>
  );
}

export function QtySmall({ n, unit }: { n: number; unit: string }) {
  return (
    <span className="qty qty--sm">
      <span className="qty__n">{n}</span>
      <span className="qty__u">{unit}</span>
    </span>
  );
}
