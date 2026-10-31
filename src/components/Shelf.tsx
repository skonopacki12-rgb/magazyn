import { useEffect, useMemo, useRef, useState } from 'react';
import { bottlesOfLots, orderUnitOf, type Bottle } from '../lib/units';
import { pickOrder } from '../lib/training';
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
  /** Slots (`row-slot`) holding more bottles than there are in stock — drawn in red. */
  over?: Set<string>;
}

/** "Real-life" view of a shelf: rows as boards with product photos standing in their slots. */
/** Name without brand, size and packaging, so it fits under a narrow bottle ("Ciastko Toffi"). */
export function shortName(name: string): string {
  const s = name
    .replace(/\((PET|szkło|szklana|butelka)\)/gi, '')
    .replace(/\b\d+([,.]\d+)?\s?(ml|l|g|kg|cl)\b/gi, '')
    .replace(/\b(Lord of Taste|Maison Routin|1883)\b/gi, '')
    .replace(/^\s*(Syrop|Sos|Puree|Pure)\s+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s || name;
}

export function ShelfPreview({ shelf, byId, showStock, captions, size = 'md', onSlot, over }: PreviewProps) {
  // Each slot is one bottle: the product's bottles on this shelf (FIFO order: what to use first) are
  // handed out to its slots in reading order, so every slot shows its own bottle's amount and state.
  const bottleAt = new Map<string, Bottle | null>();
  const queues = new Map<string, Bottle[]>();
  shelf.rows.forEach((row, r) =>
    row.slots.forEach((pid, i) => {
      if (!pid) return;
      const p = byId(pid);
      if (!p) return;
      if (!queues.has(pid)) queues.set(pid, bottlesOfLots(p, pickOrder((p.lots ?? []).filter((l) => (l.shelf ?? '') === shelf.name))));
      bottleAt.set(`${r}-${i}`, queues.get(pid)!.shift() ?? null);
    }),
  );
  return (
    <div className={`rack rack--${size}`} role="img" aria-label={`Podgląd półki ${shelf.name}`}>
      {shelf.rows.map((row, r) => (
        <div key={row.id} className="rack__row">
          <div className="rack__slots">
            {row.slots.map((pid, i) => {
              const p = pid ? byId(pid) : undefined;
              const bottle = bottleAt.get(`${r}-${i}`) ?? null;
              const inMl = p ? orderUnitOf(p).perUnit > 1 : false;
              const open = !!bottle?.open;
              const st = bottle ? expiryState(bottle.lot) : null;
              const worst = st === 'expired' || st === 'soon' ? st : undefined;
              const Tag = onSlot ? 'button' : 'div';
              return (
                <Tag
                  key={i}
                  {...(onSlot
                    ? { type: 'button' as const, onClick: () => onSlot(r, i), 'aria-label': `Rząd ${r + 1}, miejsce ${i + 1}: ${p?.name ?? 'puste'}` }
                    : {})}
                  className={`rack__slot${p || pid ? '' : ' is-empty'}${over?.has(`${r}-${i}`) ? ' is-over' : ''}`}
                  title={over?.has(`${r}-${i}`) ? `Ponad stan: ${p?.name ?? 'produkt usunięty'}` : p ? `${p.name} (${p.code})` : 'Puste miejsce'}
                >
                  {p?.image ? (
                    <img src={p.image} alt="" loading="lazy" />
                  ) : p ? (
                    <span className="rack__bottle" aria-hidden="true">
                      <span className="rack__neck" />
                      <span className="rack__body">{captions ? '' : shortName(p.name)}</span>
                    </span>
                  ) : (
                    <span className="rack__hole" aria-hidden="true" />
                  )}
                  {showStock && p && (
                    <span className="rack__badges">
                      {bottle ? (
                        inMl && (
                          <span className="rack__qty" title={`${open ? 'Otwarta' : 'Zamknięta'} butelka: ${bottle.qty} ml`}>
                            {bottle.qty}
                          </span>
                        )
                      ) : (
                        <span className="rack__qty is-unknown" title="Brak tej butelki w partiach na tej półce">
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
                  {captions && size !== 'sm' && p && <span className="rack__cap">{shortName(p.name)}</span>}
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
  free,
  allowFill = true,
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
  /** Bottles of `p` that can still be placed in this slot (stock minus bottles already on shelves). */
  free?: (p: StockedProduct) => number;
  /** Show the "fill the row" option (shelf layout editor). */
  allowFill?: boolean;
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
        {allowFill && (
          <label className="ret__check" style={{ fontSize: 14 }}>
            <input type="checkbox" checked={fillRow} onChange={() => setFillRow(!fillRow)} />
            Wstaw też w puste miejsca tego rzędu (tyle, ile jest wolnych butelek)
          </label>
        )}
        <ul className="rows picker__list">
          {list.map((p) => {
            const f = free ? free(p) : Infinity;
            return (
              <li key={p.id}>
                <button type="button" className="row-link picker__item" style={{ minHeight: 60 }} disabled={f <= 0} onClick={() => onPick(p, fillRow)}>
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
                  {free ? (
                    <span className={`picker__free${f > 0 ? '' : ' is-none'}`}>
                      {f > 0 ? `wolne ${f}` : 'wszystkie na półkach'}
                      <span className="hint" style={{ display: 'block', color: 'inherit', fontWeight: 400 }}>
                        stan {p.qty} {p.unit}
                      </span>
                    </span>
                  ) : (
                    <span className="hint">
                      stan {p.qty} {p.unit}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {!list.length && (
            <li className="hint" style={{ padding: 14 }}>
              {products.length
                ? 'Nic nie pasuje.'
                : 'Brak produktów na stanie. Na półkę wstawisz tylko butelki policzone w inwentaryzacji albo przyjęte z dostawy.'}
            </li>
          )}
        </ul>
      </div>
    </dialog>
  );
}
