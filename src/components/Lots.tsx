import { daysUntil, expiryState, fifoSort, newLot, type ExpiryState } from '../lib/fifo';
import { digitsOnly, formatDate, plural, todayIso } from '../lib/text';
import type { Lot } from '../lib/types';
import { Icon } from './Icon';

const EXPIRY_CLASS: Record<ExpiryState, string> = { expired: 'is-out', soon: 'is-low', ok: 'is-new', none: 'is-new' };

export function expiryText(l: Lot): string | null {
  if (!l.expiresAt) return null;
  const d = daysUntil(l.expiresAt);
  if (d < 0) return `Po terminie (${formatDate(l.expiresAt)})`;
  if (d === 0) return 'Termin mija dziś';
  return `Ważne do ${formatDate(l.expiresAt)}${d <= 14 ? ` · ${d} ${plural(d, 'dzień', 'dni', 'dni')}` : ''}`;
}

export function openedText(l: Lot): string {
  if (!l.open) return 'Zamknięta';
  if (!l.openedAt) return 'Otwarta';
  const d = -daysUntil(l.openedAt);
  return `Otwarta ${formatDate(l.openedAt)}${d > 0 ? ` · ${d} ${plural(d, 'dzień', 'dni', 'dni')} temu` : d === 0 ? ' · dziś' : ''}`;
}

/** "2 partie · 1 otwarta · najbliższy termin 3 lis" — or a call to action when empty. */
export function lotsSummary(lots: Lot[]): string {
  if (!lots.length) return 'Otwarte i daty ważności';
  const open = lots.filter((l) => l.open).reduce((s, l) => s + l.qty, 0);
  const next = fifoSort(lots.filter((l) => l.expiresAt)).sort((a, b) => (a.expiresAt! < b.expiresAt! ? -1 : 1))[0];
  return [
    `${lots.length} ${plural(lots.length, 'partia', 'partie', 'partii')}`,
    open ? `${open} otw.` : null,
    next ? `termin ${formatDate(next.expiresAt)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Small toggle under a product name in inventory that opens the FIFO editor. */
export function LotToggle({ lots, open, onClick, controls }: { lots: Lot[]; open: boolean; onClick: () => void; controls: string }) {
  const worst = lots.map((l) => expiryState(l)).find((s) => s === 'expired') ?? lots.map((l) => expiryState(l)).find((s) => s === 'soon');
  return (
    <button type="button" className={`lot-toggle${lots.length ? ' has-lots' : ''}`} aria-expanded={open} aria-controls={controls} onClick={onClick}>
      <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} strokeWidth={2.4} />
      <span>{lotsSummary(lots)}</span>
      {worst && <span className={`lot-dot ${EXPIRY_CLASS[worst]}`} aria-label={worst === 'expired' ? 'po terminie' : 'kończy się termin'} />}
    </button>
  );
}

/**
 * FIFO editor used during inventory: one line per batch (how many, opened or not, dates).
 * The sum of quantities becomes the counted number.
 */
export function LotEditor({
  id,
  lots,
  unit,
  prevLots,
  onChange,
}: {
  id: string;
  lots: Lot[];
  unit: string;
  prevLots?: Lot[];
  onChange: (lots: Lot[]) => void;
}) {
  const set = (lotId: string, patch: Partial<Lot>) => onChange(lots.map((l) => (l.id === lotId ? { ...l, ...patch } : l)));
  const total = lots.reduce((s, l) => s + l.qty, 0);
  return (
    <div id={id} className="lots" role="group" aria-label="Partie FIFO">
      {lots.map((l, i) => {
        const p = `${id}-${i}`;
        return (
          <div key={l.id} className={`lot${l.open ? ' is-open' : ''}`}>
            <div className="lot__row">
              <div className="lot__qty">
                <button type="button" className="stepper__btn" aria-label="Mniej" onClick={() => set(l.id, { qty: Math.max(1, l.qty - 1) })}>
                  <Icon name="minus" size={16} />
                </button>
                <label htmlFor={`${p}-q`} className="sr-only">
                  Ilość w partii {i + 1}
                </label>
                <input
                  id={`${p}-q`}
                  className="stepper__input"
                  type="text"
                  inputMode="numeric"
                  value={l.qty}
                  onChange={(e) => set(l.id, { qty: Math.max(0, Number(digitsOnly(e.target.value)) || 0) })}
                />
                <button type="button" className="stepper__btn" aria-label="Więcej" onClick={() => set(l.id, { qty: l.qty + 1 })}>
                  <Icon name="plus" size={16} />
                </button>
                <span className="stepper__unit">{unit}</span>
              </div>
              <div className="seg seg--xs" role="group" aria-label={`Partia ${i + 1}: otwarta czy zamknięta`}>
                <button type="button" className="seg__btn" aria-pressed={!l.open} onClick={() => set(l.id, { open: false, openedAt: undefined })}>
                  Zamknięta
                </button>
                <button type="button" className="seg__btn" aria-pressed={l.open} onClick={() => set(l.id, { open: true, openedAt: l.openedAt ?? todayIso() })}>
                  Otwarta
                </button>
              </div>
              <button
                type="button"
                className="icon-btn icon-btn--muted lot__del"
                aria-label={`Usuń partię ${i + 1}`}
                onClick={() => onChange(lots.filter((x) => x.id !== l.id))}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="lot__dates">
              {l.open && (
                <label className="lot__date">
                  <span>Data otwarcia</span>
                  <input
                    type="date"
                    className="input"
                    value={l.openedAt ?? ''}
                    max={todayIso()}
                    onChange={(e) => set(l.id, { openedAt: e.target.value || undefined })}
                  />
                </label>
              )}
              <label className="lot__date">
                <span>Data ważności</span>
                <input type="date" className="input" value={l.expiresAt ?? ''} onChange={(e) => set(l.id, { expiresAt: e.target.value || undefined })} />
              </label>
              {l.expiresAt && <span className={`badge ${EXPIRY_CLASS[expiryState(l)]} lot__badge`}>{expiryText(l)}</span>}
            </div>
          </div>
        );
      })}
      <div className="lots__foot">
        <button type="button" className="btn btn--ghost" onClick={() => onChange([...lots, newLot({ qty: lots.length ? 1 : Math.max(1, total) })])}>
          <Icon name="plus" size={16} />
          {lots.length ? 'Dodaj partię' : 'Rozpisz na partie'}
        </button>
        {!lots.length && prevLots && prevLots.length > 0 && (
          <button type="button" className="btn btn--quiet" onClick={() => onChange(prevLots.map((l) => ({ ...l, id: newLot().id })))}>
            Wczytaj z poprzedniej ({prevLots.length})
          </button>
        )}
        {lots.length > 0 && (
          <span className="hint">
            Razem {total} {unit} — wpisane jako policzone
          </span>
        )}
      </div>
    </div>
  );
}

/** FIFO view of a product's batches: what to use first. */
export function LotsList({ lots, unit, compact, headingLevel = 'h2' }: { lots: Lot[]; unit: string; compact?: boolean; headingLevel?: 'h2' | 'h3' }) {
  const H = headingLevel;
  const sorted = fifoSort(lots);
  return (
    <section className="stack-4" style={{ gap: compact ? 8 : 10 }}>
      <div className="heading-row">
        <H className={`eyebrow${compact ? ' eyebrow--sm' : ''}`}>Partie · FIFO</H>
        {sorted.length > 0 && <span className="hint">od góry: zużyj najpierw</span>}
      </div>
      {sorted.length ? (
        <ol className="rows fifo">
          {sorted.map((l, i) => {
            const ex = expiryState(l);
            return (
              <li key={l.id} className="fifo__item">
                <span className="fifo__n mono">
                  {l.qty} {unit}
                </span>
                <span className="stack-2" style={{ flex: 1 }}>
                  <span className="fifo__state">
                    {openedText(l)}
                    {i === 0 && sorted.length > 1 && <span className="badge is-ok fifo__first">Zużyj najpierw</span>}
                  </span>
                  {l.expiresAt ? <span className={`fifo__exp fifo__exp--${ex}`}>{expiryText(l)}</span> : <span className="hint">Bez daty ważności</span>}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted" style={{ fontSize: 14, lineHeight: '20px' }}>
          Brak danych o partiach. W inwentaryzacji rozwiń „Otwarte i daty ważności” przy produkcie.
        </p>
      )}
    </section>
  );
}
