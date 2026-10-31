import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { StockedProduct } from '../lib/types';
import { useStore } from '../store';
import { Icon } from './Icon';
import { StatusBadge } from './Status';

export interface OrderLine {
  p: StockedProduct;
  qty: number;
  include: boolean;
  extra: boolean;
}

/**
 * The order list: products below minimum (minus what is already on its way), with manual
 * quantities / skips from the draft, plus products added by hand.
 */
export function useOrderDraft() {
  const { products, needs, state, setDraft, placeOrder } = useStore();
  const [copied, setCopied] = useState(false);
  const draft = state.orderDraft ?? {};

  const auto: OrderLine[] = needs.map((p) => ({
    p,
    qty: draft[p.id]?.qty ?? p.toOrder,
    include: draft[p.id]?.include ?? true,
    extra: false,
  }));
  const autoIds = new Set(needs.map((p) => p.id));
  const extras: OrderLine[] = Object.entries(draft)
    .filter(([id, d]) => d.extra && !autoIds.has(id))
    .flatMap(([id, d]) => {
      const p = products.find((x) => x.id === id);
      return p ? [{ p, qty: d.qty, include: d.include, extra: true }] : [];
    });
  const lines = [...auto, ...extras];
  const chosen = lines.filter((l) => l.include && l.qty > 0);
  const codesText = chosen.map((l) => `${l.p.code}\t${l.qty}`).join('\n');

  const groups = [
    { key: 'out', label: 'Brak w magazynie', status: { isOut: true, isLow: false }, items: auto.filter((l) => l.p.qty === 0) },
    { key: 'low', label: 'Poniżej minimum', status: { isOut: false, isLow: true }, items: auto.filter((l) => l.p.qty > 0) },
    { key: 'extra', label: 'Dodane ręcznie', status: null, items: extras },
  ].filter((g) => g.items.length);

  const edit = (l: OrderLine, patch: Partial<Pick<OrderLine, 'qty' | 'include'>>) => {
    setCopied(false);
    setDraft(l.p.id, { qty: patch.qty ?? l.qty, include: patch.include ?? l.include, extra: l.extra || undefined });
  };

  return {
    lines,
    groups,
    chosen,
    codesText,
    copied,
    edit,
    remove: (l: OrderLine) => setDraft(l.p.id, null),
    addExtra: (p: StockedProduct) => setDraft(p.id, { qty: Math.max(1, p.toOrder || 1), include: true, extra: true }),
    inList: (id: string) => lines.some((l) => l.p.id === id),
    copy: () => {
      if (!codesText) return;
      navigator.clipboard?.writeText(codesText).catch(() => setCopied(false));
      setCopied(true);
    },
    place: () => placeOrder(chosen.map((l) => ({ productId: l.p.id, qty: l.qty }))),
  };
}

/** Read-only summary for the tablet/laptop side panels, with links to the full order screen. */
export function OrderSummary({ compact }: { compact?: boolean }) {
  const { needs, pending } = useStore();
  const out = needs.filter((p) => p.qty === 0);
  const low = needs.filter((p) => p.qty > 0);
  const incoming = pending.reduce((s, x) => s + x.qty, 0);
  const groups = [
    { key: 'out', label: `Brak w magazynie · ${out.length}`, status: { isOut: true, isLow: false }, items: out },
    { key: 'low', label: `Poniżej minimum · ${low.length}`, status: { isOut: false, isLow: true }, items: low },
  ].filter((g) => g.items.length);

  return (
    <div className={compact ? 'orders--aside' : 'orders--tablet'} style={{ display: 'flex', flexDirection: 'column', gap: compact ? 0 : 18 }}>
      {groups.map((g) => (
        <section key={g.key} className="order-group">
          <div className="order-group__head">
            <StatusBadge p={g.status} small={compact} />
            <h3 className={`eyebrow${compact ? ' eyebrow--sm' : ''}`}>{g.label}</h3>
          </div>
          <ul className="rows">
            {g.items.map((p) => (
              <li key={p.id} className="order-item">
                <span className="stack-2" style={{ flex: 1, gap: compact ? 0 : 2 }}>
                  <span className="order-item__name">{p.name}</span>
                  <span className="code order-item__meta">
                    {compact ? '' : `${p.code} · `}masz {p.qty} / min {p.min}
                    {p.incoming ? ` · w drodze ${p.incoming}` : ''}
                  </span>
                </span>
                <span className="order-item__end">
                  {!compact && <span className="order-item__verb">zamów</span>}
                  <span className="order-item__qty">
                    <span className="order-item__n">{p.toOrder}</span>
                    <span className="order-item__u">{p.unit}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!needs.length && (
        <p className="empty__text" style={{ padding: compact ? '16px 20px 0' : 0 }}>
          Nic nie trzeba zamawiać{incoming ? ' — reszta jest w drodze' : ''}.
        </p>
      )}
      <div className="order-links" style={compact ? { padding: '14px 20px 18px', borderTop: '1px solid var(--line)', marginTop: 8 } : undefined}>
        <Link to="/zamowienia" className="btn btn--primary btn--md btn--block">
          <Icon name="cart" size={18} />
          Przygotuj zamówienie{needs.length ? ` (${needs.length})` : ''}
        </Link>
        {pending.length > 0 && (
          <Link to="/zamowienia?widok=w-drodze" className="btn btn--ghost btn--md btn--block">
            <Icon name="truck" size={18} />W drodze: {pending.length} {pending.length === 1 ? 'pozycja' : 'pozycji'} · przyjmij dostawę
          </Link>
        )}
      </div>
    </div>
  );
}
