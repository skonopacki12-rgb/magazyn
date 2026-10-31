import { daysUntil, expiryState, fifoSort, newLot, type ExpiryState } from '../lib/fifo';
import { digitsOnly, formatDate, plural, todayIso } from '../lib/text';
import { packSummary, splitIntoCases } from '../lib/pack';
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

function shelvesOf(lots: Lot[]): string | null {
  const s = [...new Set(lots.map((l) => l.shelf).filter(Boolean))];
  return s.length ? `półka ${s.join(', ')}` : null;
}

/** Datalist with every shelf already used — rendered once in the app for shelf inputs. */
export function ShelfOptions({ shelves }: { shelves: string[] }) {
  return (
    <datalist id="shelf-options">
      {shelves.map((s) => (
        <option key={s} value={s} />
      ))}
    </datalist>
  );
}

/** "2 partie · 1 otwarta · najbliższy termin 3 lis" — or a call to action when empty. */
export function lotsSummary(lots: Lot[], packSize?: number): string {
  if (!lots.length) return packSize ? 'Zgrzewki, otwarte i daty ważności' : 'Otwarte i daty ważności';
  const packs = packSummary(lots, packSize);
  const open = lots.filter((l) => l.open).reduce((s, l) => s + l.qty, 0);
  const next = fifoSort(lots.filter((l) => l.expiresAt)).sort((a, b) => (a.expiresAt! < b.expiresAt! ? -1 : 1))[0];
  return [
    packs ?? `${lots.length} ${plural(lots.length, 'partia', 'partie', 'partii')}`,
    open ? `${open} otw.` : null,
    next ? `termin ${formatDate(next.expiresAt)}` : null,
    shelvesOf(lots),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Small toggle under a product name in inventory that opens the FIFO editor. */
export function LotToggle({
  lots,
  open,
  onClick,
  controls,
  packSize,
}: {
  lots: Lot[];
  open: boolean;
  onClick: () => void;
  controls: string;
  packSize?: number;
}) {
  const worst = lots.map((l) => expiryState(l)).find((s) => s === 'expired') ?? lots.map((l) => expiryState(l)).find((s) => s === 'soon');
  return (
    <button type="button" className={`lot-toggle${lots.length ? ' has-lots' : ''}`} aria-expanded={open} aria-controls={controls} onClick={onClick}>
      <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} strokeWidth={2.4} />
      <span>{lotsSummary(lots, packSize)}</span>
      {worst && <span className={`lot-dot ${EXPIRY_CLASS[worst]}`} aria-label={worst === 'expired' ? 'po terminie' : 'kończy się termin'} />}
    </button>
  );
}

/** Case layout: 12 → 3 rows × 4, otherwise a near-square grid (e.g. 6 → 2×3, 24 → 4×6). */
export function caseColumns(size: number): number {
  if (size === 12) return 4;
  let cols = Math.ceil(Math.sqrt(size));
  while (size % cols && cols < size) cols++;
  return cols > 8 ? Math.ceil(Math.sqrt(size)) : cols;
}

/** Graphic bottle count for one case: click the k-th bottle to say k bottles are in the case. */
export function CaseGrid({ size, qty, onChange, label }: { size: number; qty: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="casegrid" role="group" aria-label={label} style={{ gridTemplateColumns: `repeat(${caseColumns(size)}, 1fr)` }}>
      {Array.from({ length: size }, (_, i) => {
        const n = i + 1;
        const on = n <= qty;
        return (
          <button
            key={n}
            type="button"
            className={`casegrid__b${on ? ' is-on' : ''}`}
            aria-pressed={on}
            aria-label={on && n === qty ? `${n} butelek — kliknij, aby odjąć jedną` : `${n} ${plural(n, 'butelka', 'butelki', 'butelek')}`}
            onClick={() => onChange(on && n === qty ? n - 1 : n)}
          >
            <svg viewBox="0 0 12 24" aria-hidden="true">
              <path d="M4.5 1h3v5l2 2.5V22a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V8.5l2-2.5z" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

/**
 * FIFO editor used during inventory: one line per batch (how many, opened or not, dates).
 * The sum of quantities becomes the counted number. Products sold in cases (packSize) get
 * "Rozłóż na zgrzewki" and a bottle grid per case.
 */
export function LotEditor({
  id,
  lots,
  unit,
  prevLots,
  onChange,
  packSize,
  count = 0,
  bottle = 1,
}: {
  id: string;
  lots: Lot[];
  unit: string;
  prevLots?: Lot[];
  onChange: (lots: Lot[]) => void;
  packSize?: number;
  /** Number typed in the count field — used by "Rozłóż na zgrzewki" when there are no lots yet. */
  count?: number;
  /** Content of one bottle in stock units (1000 for a 1 l bottle counted in ml). Closed bottles are counted whole. */
  bottle?: number;
}) {
  const inBottles = (l: Lot) => bottle > 1 && !l.open && !l.pack;
  const nBottles = (l: Lot) => Math.max(1, Math.ceil(l.qty / bottle));
  const set = (lotId: string, patch: Partial<Lot>) => onChange(lots.map((l) => (l.id === lotId ? { ...l, ...patch } : l)));
  const total = lots.reduce((s, l) => s + l.qty, 0);
  let caseNo = 0;
  const intoCases = () => {
    const n = lots.length ? total : count;
    const first = lots[0];
    const base = { shelf: first?.shelf, expiresAt: first?.expiresAt };
    if (lots.length && !window.confirm(`Rozłożyć ${n} ${unit} na zgrzewki po ${packSize}? Obecne partie zostaną zastąpione.`)) return;
    onChange(n > 0 ? splitIntoCases(n, packSize!, base) : [newLot({ ...base, qty: packSize!, pack: true })]);
  };
  return (
    <div id={id} className="lots" role="group" aria-label="Partie FIFO">
      {lots.map((l, i) => {
        const p = `${id}-${i}`;
        return (
          <div key={l.id} className={`lot${l.open ? ' is-open' : ''}${l.pack ? ' is-case' : ''}`}>
            {packSize && (
              <div className="lot__row">
                <span className="eyebrow eyebrow--sm" style={{ flex: 1 }}>
                  {l.pack ? `Zgrzewka ${++caseNo} · ${l.qty}/${packSize}` : `Luzem · ${l.qty} ${unit}`}
                </span>
                <div className="seg seg--xs" role="group" aria-label={`Partia ${i + 1}: zgrzewka czy luzem`}>
                  <button type="button" className="seg__btn" aria-pressed={!!l.pack} onClick={() => set(l.id, { pack: true, qty: Math.min(l.qty, packSize) })}>
                    Zgrzewka
                  </button>
                  <button type="button" className="seg__btn" aria-pressed={!l.pack} onClick={() => set(l.id, { pack: false })}>
                    Luzem
                  </button>
                </div>
              </div>
            )}
            {l.pack && packSize ? (
              <div className="lot__row">
                <CaseGrid size={packSize} qty={l.qty} label={`Butelki w zgrzewce ${caseNo}`} onChange={(n) => set(l.id, { qty: n })} />
                <button
                  type="button"
                  className="icon-btn icon-btn--muted lot__del"
                  aria-label={`Usuń zgrzewkę ${caseNo}`}
                  onClick={() => onChange(lots.filter((x) => x.id !== l.id))}
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            ) : (
              <div className="lot__row">
                <div className="lot__qty">
                  <button
                    type="button"
                    className="stepper__btn"
                    aria-label={inBottles(l) ? 'Jedna butelka mniej' : 'Mniej'}
                    onClick={() => set(l.id, { qty: inBottles(l) ? Math.max(1, nBottles(l) - 1) * bottle : Math.max(1, l.qty - 1) })}
                  >
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
                    value={inBottles(l) ? nBottles(l) : l.qty}
                    onChange={(e) => {
                      const n = Math.max(0, Number(digitsOnly(e.target.value)) || 0);
                      set(l.id, { qty: inBottles(l) ? n * bottle : n });
                    }}
                  />
                  <button
                    type="button"
                    className="stepper__btn"
                    aria-label={inBottles(l) ? 'Jedna butelka więcej' : 'Więcej'}
                    onClick={() => set(l.id, { qty: inBottles(l) ? (nBottles(l) + 1) * bottle : l.qty + 1 })}
                  >
                    <Icon name="plus" size={16} />
                  </button>
                  <span className="stepper__unit">
                    {inBottles(l) ? (
                      <>
                        but. · {nBottles(l) * bottle} {unit}
                        {l.qty % bottle !== 0 && (
                          <span className="hint" style={{ display: 'block', color: '#8a5a00' }}>
                            było {l.qty} {unit} — zamknięta liczy się jako pełna
                          </span>
                        )}
                      </>
                    ) : (
                      unit
                    )}
                  </span>
                </div>
                <div className="seg seg--xs" role="group" aria-label={`Partia ${i + 1}: otwarta czy zamknięta`}>
                  <button type="button" className="seg__btn" aria-pressed={!l.open} onClick={() => set(l.id, { open: false, openedAt: undefined, ...(bottle > 1 && !l.pack ? { qty: nBottles(l) * bottle } : {}) })}>
                    Zamknięta
                  </button>
                  <button
                    type="button"
                    className="seg__btn"
                    aria-pressed={l.open}
                    onClick={() => set(l.id, { open: true, openedAt: l.openedAt ?? todayIso() })}
                  >
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
            )}
            <div className="lot__dates">
              <label className="lot__date">
                <span>Półka</span>
                <input
                  type="text"
                  className="input"
                  list="shelf-options"
                  placeholder="np. A2"
                  autoComplete="off"
                  value={l.shelf ?? ''}
                  style={{ width: 120 }}
                  onChange={(e) => set(l.id, { shelf: e.target.value || undefined })}
                />
              </label>
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
        {packSize && (
          <>
            <button type="button" className={`btn ${lots.length ? 'btn--ghost' : 'btn--primary'}`} onClick={intoCases}>
              Rozłóż na zgrzewki po {packSize}
              {(lots.length ? total : count) > 0 ? ` (${lots.length ? total : count} ${unit})` : ''}
            </button>
            {lots.length > 0 && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() =>
                  onChange([...lots, newLot({ qty: packSize, pack: true, shelf: lots[lots.length - 1]?.shelf, expiresAt: lots[lots.length - 1]?.expiresAt })])
                }
              >
                <Icon name="plus" size={16} />
                Dodaj zgrzewkę
              </button>
            )}
          </>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => onChange([...lots, newLot({ qty: lots.length ? bottle : Math.max(1, total || count) })])}>
          <Icon name="plus" size={16} />
          {packSize ? (lots.length ? 'Dodaj luzem' : 'Rozpisz bez zgrzewek') : lots.length ? 'Dodaj partię' : 'Rozpisz na partie'}
        </button>
        {!lots.length && prevLots && prevLots.length > 0 && (
          <button type="button" className="btn btn--quiet" onClick={() => onChange(prevLots.map((l) => ({ ...l, id: newLot().id })))}>
            Wczytaj z poprzedniej ({prevLots.length})
          </button>
        )}
        {lots.length > 1 && (lots[0].shelf || lots[0].expiresAt) && lots.some((l) => l.shelf !== lots[0].shelf || l.expiresAt !== lots[0].expiresAt) && (
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => onChange(lots.map((l) => ({ ...l, shelf: lots[0].shelf, expiresAt: lots[0].expiresAt })))}
          >
            Półka i data jak w 1. dla wszystkich
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
                  {l.pack && <span className="pack-tag">zgrzewka</span>}
                </span>
                <span className={`shelf-tag${l.shelf ? '' : ' is-none'}`} title="Półka">
                  {l.shelf ?? 'bez półki'}
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
