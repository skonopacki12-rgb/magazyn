import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { expiryText, openedText } from '../components/Lots';
import { Stepper } from '../components/Stepper';
import { Thumb } from '../components/Thumb';
import { expiryState } from '../lib/fifo';
import { digitsOnly, formatDate, plural } from '../lib/text';
import { MOVE_LABEL, OUTCOME_LABEL, parseCodes, pickOrder, type Move, type Outcome, type Training, type TrainingLine } from '../lib/training';
import type { Lot, StockedProduct } from '../lib/types';
import { useStore } from '../store';

const OUTCOMES: Outcome[] = ['back', 'used', 'waste', 'other'];

/**
 * "Szkolenie": paste product codes → pick list by shelf (FIFO suggestion: opened, shortest date) →
 * "Koniec szkolenia" → where to put each item back, usage, or remove it from stock.
 */
export function TrainingScreen() {
  const { state, byId, startTraining, updateTraining, finishTraining } = useStore();
  const navigate = useNavigate();
  const training = state.training ?? null;
  const [done, setDone] = useState<Move[] | null>(null);

  const setLine = (id: string, patch: Partial<TrainingLine>) =>
    training && updateTraining({ ...training, lines: training.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });

  return (
    <div className="catalog">
      <header className="catalog__head">
        <div className="catalog__inner" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ margin: '0 -8px' }}>
            <button type="button" className="back-link" style={{ border: 0, background: 'none', color: 'var(--accent)' }} onClick={() => navigate('/')}>
              <Icon name="chevronLeft" size={22} />
              Magazyn
            </button>
          </div>
          <div className="stack-2">
            <h1 className="title-xl">Szkolenie</h1>
            <p className="subtitle subtitle--lg">
              {!training
                ? 'Wklej kody produktów — podpowiem, z której półki wziąć butelkę (najpierw otwarte, potem najkrótsza data).'
                : training.stage === 'pick'
                  ? 'Zbierz produkty z półek i odhacz. Na koniec kliknij „Koniec szkolenia”.'
                  : 'Zdecyduj, co dzieje się z każdym produktem — stany zaktualizują się po zatwierdzeniu.'}
            </p>
          </div>
          {training && <Steps stage={training.stage} />}
        </div>
      </header>

      <main className="catalog__main">
        <div className="catalog__inner" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
          {!training && <Start done={done} onStart={(text) => (setDone(null), startTraining(text))} />}
          {training?.stage === 'pick' && <PickList training={training} byId={byId} setLine={setLine} />}
          {training?.stage === 'return' && <ReturnList training={training} byId={byId} setLine={setLine} />}
        </div>
      </main>

      {training && (
        <footer className="catalog__foot">
          <div className="catalog__inner catalog__foot-row">
            {training.stage === 'pick' ? (
              <>
                <button
                  type="button"
                  className="btn btn--quiet btn--md"
                  onClick={() => window.confirm('Anulować szkolenie? Lista zniknie, stany się nie zmienią.') && updateTraining(null)}
                >
                  Anuluj szkolenie
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--lg catalog__submit"
                  disabled={!training.lines.length}
                  onClick={() => updateTraining({ ...training, stage: 'return' })}
                >
                  Koniec szkolenia
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn--ghost btn--md" onClick={() => updateTraining({ ...training, stage: 'pick' })}>
                  Wróć do listy
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--lg catalog__submit"
                  onClick={() => {
                    finishTraining();
                    setDone([]);
                  }}
                >
                  <Icon name="check" size={20} />
                  Zatwierdź i zaktualizuj stany
                </button>
              </>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

function Steps({ stage }: { stage: Training['stage'] }) {
  const steps = [
    ['pick', '1. Zbierz z półek'],
    ['return', '2. Odłóż / rozlicz'],
  ] as const;
  return (
    <ol className="steps" aria-label="Etapy szkolenia">
      {steps.map(([k, label]) => (
        <li key={k} className={stage === k ? 'is-on' : undefined} aria-current={stage === k ? 'step' : undefined}>
          {label}
        </li>
      ))}
    </ol>
  );
}

function Start({ onStart, done }: { onStart: (text: string) => void; done: Move[] | null }) {
  const { state } = useStore();
  const [text, setText] = useState('');
  const codes = parseCodes(text);
  const log = state.log ?? [];
  return (
    <>
      {done && (
        <div className="catalog__done" role="status">
          <Icon name="check" size={20} />
          <span style={{ flex: 1 }}>Szkolenie rozliczone — stany i półki zaktualizowane.</span>
          <Link to="/" className="btn btn--success" style={{ padding: '0 12px', textDecoration: 'underline' }}>
            Do magazynu
          </Link>
        </div>
      )}
      <section className="card card--16" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
        <label htmlFor="tr-codes" className="field__label">
          Kody produktów na szkolenie
        </label>
        <textarea
          id="tr-codes"
          className="input textarea"
          rows={7}
          placeholder={'RT1717\nRT1646\nLOTPURPAS\n…'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="hint">
          Każdy kod w nowej linii albo po przecinku/spacji. Ten sam kod wpisany 2× = 2 sztuki. Produkty liczone w ml/kg: jeden kod = jedna butelka.
        </p>
        <button type="button" className="btn btn--primary btn--lg" disabled={!codes.length} onClick={() => onStart(text)}>
          {codes.length ? `Przygotuj listę (${codes.length} ${plural(codes.length, 'kod', 'kody', 'kodów')})` : 'Wklej kody'}
        </button>
      </section>

      <section className="stack-4" style={{ gap: 8 }}>
        <h2 className="eyebrow">Ostatnie ruchy</h2>
        {log.length ? (
          <ul className="rows">
            {log.slice(0, 30).map((m) => (
              <li key={m.id} className="move">
                <span className="stack-2" style={{ flex: 1 }}>
                  <span className="row-name" style={{ fontSize: 15, lineHeight: '20px' }}>
                    {m.name}
                  </span>
                  <span className="hint">
                    {MOVE_LABEL[m.kind]}
                    {m.note ? ` · ${m.note}` : ''}
                  </span>
                </span>
                <span className="mono" style={{ fontWeight: 600 }}>
                  {m.kind === 'moved' || m.kind === 'opened' ? '' : m.kind === 'delivered' || (m.kind === 'adjusted' && m.qty > 0) ? '+' : '−'}
                  {Math.abs(m.qty)} {m.unit}
                </span>
                <span className="hint" style={{ minWidth: 84, textAlign: 'right' }}>
                  {new Date(m.at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ fontSize: 14 }}>
            Jeszcze nic — ruchy ze szkoleń pojawią się tutaj.
          </p>
        )}
      </section>
    </>
  );
}

function LotLine({ lot, unit }: { lot: Lot | undefined; unit: string }) {
  if (!lot) return <span className="hint">Brak danych o partiach — sprawdź półki samodzielnie.</span>;
  const ex = expiryState(lot);
  return (
    <span className="hint" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px', alignItems: 'center' }}>
      {lot.pack && (
        <span className="pack-tag" style={{ display: 'inline', marginTop: 0 }}>
          zgrzewka
        </span>
      )}
      <span>{openedText(lot)}</span>
      {lot.expiresAt && <span className={`fifo__exp fifo__exp--${ex}`}>{expiryText(lot)}</span>}
      <span>
        · w partii {lot.qty} {unit}
      </span>
    </span>
  );
}

function PickList({
  training,
  byId,
  setLine,
}: {
  training: Training;
  byId: (id: string) => StockedProduct | undefined;
  setLine: (id: string, patch: Partial<TrainingLine>) => void;
}) {
  const shelves = new Map<string, TrainingLine[]>();
  for (const l of training.lines) {
    const key = l.shelf || '';
    shelves.set(key, [...(shelves.get(key) ?? []), l]);
  }
  const order = [...shelves.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'pl', { numeric: true })));
  const picked = training.lines.filter((l) => l.picked).length;

  return (
    <>
      {(training.unknown.length > 0 || training.empty.length > 0) && (
        <div className="card warn">
          {training.unknown.length > 0 && (
            <p>
              <strong>Nie znaleziono kodów:</strong> <span className="mono">{training.unknown.join(', ')}</span>
            </p>
          )}
          {training.empty.length > 0 && (
            <p>
              <strong>Brak na stanie:</strong> <span className="mono">{training.empty.join(', ')}</span>
            </p>
          )}
        </div>
      )}
      <div className="heading-row">
        <h2 className="eyebrow">
          Zebrane {picked} z {training.lines.length}
        </h2>
        <span className="hint">pogrupowane według półek</span>
      </div>
      {order.map((shelf) => (
        <section key={shelf} className="stack-4" style={{ gap: 8 }}>
          <div className="order-group__head">
            <span className={`shelf-tag shelf-tag--lg${shelf ? '' : ' is-none'}`}>{shelf || 'bez półki'}</span>
            {shelf && <span className="hint">półka</span>}
          </div>
          <ul className="rows">
            {shelves.get(shelf)!.map((line) => {
              const p = byId(line.productId);
              if (!p) return null;
              const lot = p.lots?.find((x) => x.id === line.lotId);
              const choices = pickOrder(p.lots ?? []);
              return (
                <li key={line.id} className={`pick${line.picked ? ' is-done' : ''}`}>
                  <label className="pick__main">
                    <input type="checkbox" checked={line.picked} onChange={() => setLine(line.id, { picked: !line.picked })} />
                    {p.image && <Thumb src={p.image} />}
                    <span className="stack-2" style={{ flex: 1 }}>
                      <span className="row-name pick__name">{p.name}</span>
                      <span className="code">{p.code}</span>
                      <LotLine lot={lot} unit={p.unit} />
                    </span>
                    <span className="pick__qty">
                      <span className="order-item__verb">weź</span>
                      <span className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
                        {line.qty}
                      </span>
                      <span className="hint">{p.unit}</span>
                    </span>
                  </label>
                  {choices.length > 1 && (
                    <div className="pick__alt">
                      <label htmlFor={`alt-${line.id}`} className="hint">
                        Inna partia:
                      </label>
                      <select
                        id={`alt-${line.id}`}
                        className="select"
                        value={line.lotId ?? ''}
                        onChange={(e) => {
                          const l = choices.find((c) => c.id === e.target.value)!;
                          setLine(line.id, {
                            lotId: l.id,
                            shelf: l.shelf ?? '',
                            qty: p.unit === 'szt.' || p.unit === 'op.' ? Math.min(line.qty, l.qty) : l.qty,
                          });
                        }}
                      >
                        {choices.map((c, i) => (
                          <option key={c.id} value={c.id}>
                            {i === 0 ? '★ ' : ''}
                            {c.shelf ? `półka ${c.shelf}` : 'bez półki'} · {c.open ? 'otwarta' : 'zamknięta'}
                            {c.expiresAt ? ` · do ${formatDate(c.expiresAt)}` : ''} · {c.qty} {p.unit}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

function ReturnList({
  training,
  byId,
  setLine,
}: {
  training: Training;
  byId: (id: string) => StockedProduct | undefined;
  setLine: (id: string, patch: Partial<TrainingLine>) => void;
}) {
  return (
    <ul className="return-list">
      {training.lines.map((line) => {
        const p = byId(line.productId);
        if (!p) return null;
        const lot = p.lots?.find((x) => x.id === line.lotId);
        const from = lot?.shelf ?? '';
        const moved = line.outcome === 'back' && line.shelf.trim() !== from;
        return (
          <li key={line.id} className="card card--16 ret">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {p.image && <Thumb src={p.image} />}
              <span className="stack-2" style={{ flex: 1 }}>
                <span className="row-name">{p.name}</span>
                <span className="hint">
                  Zabrano {line.qty} {p.unit} · {from ? `z półki ${from}` : 'półka nieznana'}
                </span>
              </span>
            </div>
            <div className="seg seg--xs ret__seg" role="group" aria-label={`Co z: ${p.name}`}>
              {OUTCOMES.map((o) => (
                <button key={o} type="button" className="seg__btn" aria-pressed={line.outcome === o} onClick={() => setLine(line.id, { outcome: o })}>
                  {OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>

            {line.outcome === 'back' ? (
              <div className="ret__grid">
                <div className="field" style={{ gap: 4 }}>
                  <label htmlFor={`sh-${line.id}`} className="field__label">
                    Odłóż na półkę
                  </label>
                  <input
                    id={`sh-${line.id}`}
                    className="input input--mono"
                    list="shelf-options"
                    autoComplete="off"
                    placeholder="np. A2"
                    value={line.shelf}
                    onChange={(e) => setLine(line.id, { shelf: e.target.value })}
                  />
                  <span className={`hint${moved ? ' ret__moved' : ''}`}>
                    {moved ? `Zmiana półki: ${from || 'bez półki'} → ${line.shelf.trim() || 'bez półki'}` : from ? 'Ta sama półka, z której zabrano' : ' '}
                  </span>
                </div>
                <div className="field" style={{ gap: 4 }}>
                  <label htmlFor={`used-${line.id}`} className="field__label">
                    Zejście (zużyto)
                  </label>
                  <Stepper
                    id={`used-${line.id}`}
                    value={line.used}
                    small
                    unit={p.unit}
                    label={{ dec: 'Mniej zejścia', inc: 'Więcej zejścia' }}
                    onChange={(v) => setLine(line.id, { used: Math.min(line.qty, Number(digitsOnly(v)) || 0) })}
                  />
                  <span className="hint">
                    {p.unit === 'szt.' || p.unit === 'op.'
                      ? 'Ile sztuk zużyto do końca. Napoczęta butelka = 0 i zaznacz „otwarta”.'
                      : `Ile ${p.unit} ubyło (max ${line.qty}).`}
                  </span>
                </div>
                {lot && !lot.open && (
                  <label className="ret__check">
                    <input type="checkbox" checked={line.opened} onChange={() => setLine(line.id, { opened: !line.opened })} />
                    Butelka została otwarta podczas szkolenia
                  </label>
                )}
              </div>
            ) : (
              <div className="field" style={{ gap: 4 }}>
                <label htmlFor={`note-${line.id}`} className="field__label">
                  {line.outcome === 'other' ? 'Powód (np. rozbita, oddana, zwrot)' : 'Notatka (opcjonalnie)'}
                </label>
                <input id={`note-${line.id}`} className="input" value={line.note} onChange={(e) => setLine(line.id, { note: e.target.value })} />
                <span className="hint ret__remove">
                  Zdejmie {line.qty} {p.unit} ze stanu
                  {lot ? ` (partia z półki ${from || '—'})` : ''}.
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
