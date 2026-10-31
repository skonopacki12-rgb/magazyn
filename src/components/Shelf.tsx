import { useEffect, useMemo, useRef, useState } from 'react';
import { expiryState } from '../lib/fifo';
import { matches, tokenize } from '../lib/text';
import type { ShelfDef, StockedProduct } from '../lib/types';
import { Icon } from './Icon';
import { SearchField } from './SearchField';
import { Thumb } from './Thumb';

export const MAX_SLOTS = 40;

/**
 * Graphic slot-count picker: a row of squares, click the k-th square to make the row k slots wide.
 * Clicking the last filled square removes it. More squares appear as the row grows.
 */
export function RowSizer({ count, onChange, images, label }: { count: number; onChange: (n: number) => void; images: (string | undefined)[]; label: string }) {
  const visible = Math.min(MAX_SLOTS, Math.max(8, count + 3));
  return (
    <div className="sizer" role="group" aria-label={label}>
      {Array.from({ length: visible }, (_, i) => {
        const n = i + 1;
        const on = n <= count;
        return (
          <button
            key={n}
            type="button"
            className={`sizer__sq${on ? ' is-on' : ''}`}
            aria-pressed={on}
            aria-label={on && n === count ? `${n} miejsc — kliknij, aby usunąć ostatnie` : `Ustaw ${n} ${n === 1 ? 'miejsce' : 'miejsc'}`}
            onClick={() => onChange(on && n === count ? n - 1 : n)}
          >
            {on && images[i] ? <img src={images[i]} alt="" /> : <span aria-hidden="true">{on ? n : ''}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface PreviewProps {
  shelf: ShelfDef;
  byId: (id: string) => StockedProduct | undefined;
  /** Overlay stock on this shelf, open bottles and expiry warnings. */
  showStock?: boolean;
  /** Product names under the bottles. */
  captions?: boolean;
  size?: 'sm' | 'md';
  onSlot?: (row: number, slot: number) => void;
}

/** "Real-life" view of a shelf: rows as boards with product photos standing in their slots. */
export function ShelfPreview({ shelf, byId, showStock, captions, size = 'md', onSlot }: PreviewProps) {
  return (
    <div className={`rack rack--${size}`} role="img" aria-label={`Podgląd półki ${shelf.name}`}>
      {shelf.rows.map((row, r) => (
        <div key={row.id} className="rack__row">
          <div className="rack__slots">
            {row.slots.map((pid, i) => {
              const p = pid ? byId(pid) : undefined;
              const here = (p?.lots ?? []).filter((l) => (l.shelf ?? '') === shelf.name);
              const qty = here.reduce((s, l) => s + l.qty, 0);
              const open = here.some((l) => l.open);
              const worst = here.map((l) => expiryState(l)).find((s) => s === 'expired') ?? here.map((l) => expiryState(l)).find((s) => s === 'soon');
              const Tag = onSlot ? 'button' : 'div';
              return (
                <Tag
                  key={i}
                  {...(onSlot
                    ? { type: 'button' as const, onClick: () => onSlot(r, i), 'aria-label': `Rząd ${r + 1}, miejsce ${i + 1}: ${p?.name ?? 'puste'}` }
                    : {})}
                  className={`rack__slot${p ? '' : ' is-empty'}`}
                  title={p ? `${p.name} (${p.code})` : 'Puste miejsce'}
                >
                  {p?.image ? (
                    <img src={p.image} alt="" loading="lazy" />
                  ) : p ? (
                    <span className="rack__bottle" aria-hidden="true">
                      <span className="rack__neck" />
                      <span className="rack__body">{captions ? '' : p.name}</span>
                    </span>
                  ) : (
                    <span className="rack__hole" aria-hidden="true" />
                  )}
                  {showStock && p && (
                    <span className="rack__badges">
                      {p.lots?.length ? (
                        <span className={`rack__qty${qty ? '' : ' is-zero'}`} title={`${qty} na tej półce wg partii`}>
                          {qty}
                        </span>
                      ) : (
                        <span className="rack__qty is-unknown" title="Brak danych o partiach">
                          ?
                        </span>
                      )}
                      {open && <span className="rack__dot is-low" title="otwarta" />}
                      {worst && (
                        <span
                          className={`rack__dot ${worst === 'expired' ? 'is-out' : 'is-low'}`}
                          title={worst === 'expired' ? 'po terminie' : 'kończy się termin'}
                        />
                      )}
                    </span>
                  )}
                  {captions && size !== 'sm' && <span className="rack__cap">{p ? p.name : ''}</span>}
                </Tag>
              );
            })}
            {!row.slots.length && <span className="rack__emptyrow">pusty rząd</span>}
          </div>
          <div className="rack__board" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}

/** Dialog to choose which product stands in a slot. */
export function ProductPicker({
  open,
  products,
  current,
  title,
  suggested,
  onPick,
  onClear,
  onClose,
}: {
  open: boolean;
  products: StockedProduct[];
  current?: StockedProduct;
  title: string;
  /** Products that sit on this shelf according to lots — shown first. */
  suggested: StockedProduct[];
  onPick: (p: StockedProduct, fillRow: boolean) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState('');
  const [fillRow, setFillRow] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setQ('');
      setFillRow(false);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);
  const list = useMemo(() => {
    const t = tokenize(q);
    if (!t.length) {
      const ids = new Set(suggested.map((p) => p.id));
      return [...suggested, ...products.filter((p) => !ids.has(p.id))].slice(0, 60);
    }
    return products.filter((p) => matches(t, p.name, p.code, p.brand ?? '')).slice(0, 60);
  }, [q, products, suggested]);
  const sugg = new Set(suggested.map((p) => p.id));

  return (
    <dialog ref={ref} className="dialog picker" aria-labelledby="picker-title" onClose={onClose} onCancel={onClose}>
      <div className="dialog__body" style={{ gap: 12 }}>
        <div className="heading-row" style={{ alignItems: 'center' }}>
          <h2 id="picker-title" style={{ fontSize: 20, lineHeight: '26px', fontWeight: 700 }}>
            {title}
          </h2>
          <button type="button" className="icon-btn" aria-label="Zamknij" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        {current && (
          <div className="picker__current">
            <Thumb src={current.image} size="sm" />
            <span style={{ flex: 1 }}>{current.name}</span>
            <button type="button" className="btn btn--quiet" style={{ minHeight: 36, fontSize: 14 }} onClick={onClear}>
              Opróżnij miejsce
            </button>
          </div>
        )}
        <SearchField id="picker-q" size="filter" value={q} onChange={setQ} placeholder="Szukaj produktu (nazwa, kod)" label="Szukaj produktu" />
        <label className="ret__check" style={{ fontSize: 14 }}>
          <input type="checkbox" checked={fillRow} onChange={() => setFillRow(!fillRow)} />
          Wstaw też we wszystkie puste miejsca tego rzędu
        </label>
        <ul className="rows picker__list">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" className="row-link" style={{ minHeight: 60 }} onClick={() => onPick(p, fillRow)}>
                <Thumb src={p.image} size="sm" />
                <span className="stack-2" style={{ flex: 1 }}>
                  <span className="row-name" style={{ fontSize: 15, lineHeight: '20px' }}>
                    {p.name}
                  </span>
                  <span className="code">
                    {p.code}
                    {sugg.has(p.id) ? ' · na tej półce wg partii' : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {!list.length && (
            <li className="hint" style={{ padding: 14 }}>
              Brak produktów.
            </li>
          )}
        </ul>
      </div>
    </dialog>
  );
}
