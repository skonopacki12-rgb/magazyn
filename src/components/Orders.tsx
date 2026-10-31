import { useEffect, useState } from 'react';
import { orderListText } from '../lib/stock';
import type { StockedProduct } from '../lib/types';
import { useStore } from '../store';
import { Icon } from './Icon';
import { StatusBadge } from './Status';

/** Shared "Do zamówienia" logic: products below minimum, check-offs and copy-to-clipboard. */
export function useOrders() {
  const { needs, state, toggleOrdered } = useStore();
  const [copied, setCopied] = useState(false);
  const isDone = (p: StockedProduct) => !!state.ordered[p.id];
  const open = needs.filter((p) => !isDone(p));
  const out = needs.filter((p) => p.qty === 0);
  const low = needs.filter((p) => p.qty > 0);

  // Any check-off change invalidates "Skopiowano".
  useEffect(() => setCopied(false), [state.ordered]);

  const groups = [
    out.length && { key: 'out', label: `Brak w magazynie · ${out.length}`, status: { isOut: true, isLow: false }, items: out },
    low.length && { key: 'low', label: `Poniżej minimum · ${low.length}`, status: { isOut: false, isLow: true }, items: low },
  ].filter(Boolean) as { key: string; label: string; status: { isOut: boolean; isLow: boolean }; items: StockedProduct[] }[];

  const copy = () => {
    if (!open.length) return;
    // Don't await: a pending permission prompt must not hold back the confirmation.
    navigator.clipboard?.writeText(orderListText(open)).catch(() => setCopied(false));
    setCopied(true);
  };

  return {
    groups,
    total: needs.length,
    open,
    doneCount: needs.length - open.length,
    isDone,
    toggle: (p: StockedProduct) => toggleOrdered(p.id),
    copied,
    copy,
    copyLabel: (short?: boolean) =>
      copied ? (short ? 'Skopiowano' : 'Skopiowano listę') : open.length ? `Kopiuj listę do zamówienia (${open.length})` : 'Wszystko zamówione',
  };
}

export type OrdersModel = ReturnType<typeof useOrders>;

export function OrderGroups({ m, variant, headingLevel = 'h2' }: { m: OrdersModel; variant: 'phone' | 'tablet' | 'aside'; headingLevel?: 'h2' | 'h3' }) {
  const H = headingLevel;
  const aside = variant === 'aside';
  return (
    <div className={`orders--${variant}`} style={{ display: 'flex', flexDirection: 'column', gap: aside ? 0 : 18 }}>
      {m.groups.map((g) => (
        <section key={g.key} className="order-group">
          <div className="order-group__head">
            <StatusBadge p={g.status} small={aside} />
            <H className={`eyebrow${aside ? ' eyebrow--sm' : ''}`}>{g.label}</H>
          </div>
          <ul className="rows">
            {g.items.map((p) => {
              const done = m.isDone(p);
              return (
                <li key={p.id}>
                  <label className={`order-item${done ? ' is-done' : ''}`}>
                    <input type="checkbox" checked={done} onChange={() => m.toggle(p)} />
                    <span className="stack-2" style={{ flex: 1, gap: aside ? 0 : 2 }}>
                      <span className="sr-only">Oznacz jako zamówione: </span>
                      <span className="order-item__name">{p.name}</span>
                      <span className="code order-item__meta">
                        {aside ? '' : `${p.code} · `}masz {p.qty} / min {p.min}
                      </span>
                    </span>
                    <span className="order-item__end">
                      {!aside && <span className="order-item__verb">{done ? 'zamówione' : 'zamów'}</span>}
                      <span className="order-item__qty">
                        <span className="order-item__n">{p.toOrder}</span>
                        <span className="order-item__u">{p.unit}</span>
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function CopyButton({ m, className, short, iconSize = 18 }: { m: OrdersModel; className: string; short?: boolean; iconSize?: number }) {
  if (!m.total) return null;
  return (
    <button type="button" className={className} onClick={m.copy} aria-live="polite">
      <Icon name={m.copied ? 'check' : 'copy'} size={iconSize} />
      <span>{m.copyLabel(short)}</span>
    </button>
  );
}
