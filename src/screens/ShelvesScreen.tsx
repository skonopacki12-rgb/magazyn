import { useState } from 'react';
import { bottleCount } from '../lib/units';
import { formatDate, todayIso } from '../lib/text';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ProductPicker, RowSizer, ShelfPreview } from '../components/Shelf';
import { TopBar } from '../components/Shell';
import { allShelves, newLot } from '../lib/fifo';
import { plural } from '../lib/text';
import type { ShelfDef, ShelfRow } from '../lib/types';
import { useBreakpoint } from '../lib/useBreakpoint';
import { useStore } from '../store';

const uid = () => newLot().id;
const newRow = (n = 6): ShelfRow => ({ id: uid(), slots: Array(n).fill(null) });
const filled = (s: ShelfDef) => s.rows.reduce((a, r) => a + r.slots.filter(Boolean).length, 0);
const total = (s: ShelfDef) => s.rows.reduce((a, r) => a + r.slots.length, 0);

function Page({ title, back, children }: { title: React.ReactNode; back?: { to: string; label: string }; children: React.ReactNode }) {
  const bp = useBreakpoint();
  return (
    <div className="catalog">
      {bp !== 'phone' && <TopBar variant={bp === 'laptop' ? 'laptop' : 'tablet'} />}
      <main className="catalog__main" style={{ paddingTop: bp === 'phone' ? 8 : 20 }}>
        <div className="catalog__inner" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
          {back && (
            <div style={{ margin: '0 -8px' }}>
              <Link to={back.to} className="back-link">
                <Icon name="chevronLeft" size={22} />
                {back.label}
              </Link>
            </div>
          )}
          {title}
          {children}
        </div>
      </main>
    </div>
  );
}

/** List of shelves with miniature previews. */
export function ShelvesScreen() {
  const { shelves, saveShelf, byId, products, state } = useStore();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const fromLots = allShelves(products, Object.values(state.countLots ?? {})).filter((n) => !shelves.some((s) => s.name === n));

  const create = (n: string) => {
    const shelf: ShelfDef = { id: uid(), name: n.trim(), rows: [newRow(), newRow(), newRow()] };
    saveShelf(shelf);
    navigate(`/polki/${shelf.id}`);
  };

  return (
    <Page
      back={{ to: '/', label: 'Magazyn' }}
      title={
        <div className="stack-2">
          <h1 className="title-xl">Półki</h1>
          <p className="subtitle subtitle--lg">Układ półek: rzędy i miejsca na butelki. Nazwa półki = nazwa w polu „Półka” w partiach.</p>
        </div>
      }
    >
      <form
        className="card card--16 shelf-new"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create(name);
        }}
      >
        <label htmlFor="shelf-name" className="field__label">
          Nowa półka
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            id="shelf-name"
            className="input input--mono"
            style={{ flex: '1 1 160px' }}
            list="shelf-options"
            placeholder="np. A2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn btn--primary btn--md" disabled={!name.trim() || shelves.some((s) => s.name === name.trim())}>
            <Icon name="plus" size={18} />
            Utwórz
          </button>
        </div>
        {shelves.some((s) => s.name === name.trim()) && <p className="hint">Półka o tej nazwie już istnieje.</p>}
        {fromLots.length > 0 && (
          <div className="stack-4" style={{ gap: 6 }}>
            <span className="hint">Półki wpisane w partiach, bez układu — kliknij, aby utworzyć:</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {fromLots.map((n) => (
                <button key={n} type="button" className="shelf-tag shelf-chip" onClick={() => create(n)}>
                  + {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>

      {!shelves.length && (
        <div className="card card--dashed empty">
          <h2 className="empty__title empty__title--sm">Nie ma jeszcze żadnej półki</h2>
          <p className="empty__text">Utwórz pierwszą — dostanie 3 rzędy po 6 miejsc. Liczbę miejsc w rzędzie ustawisz, klikając kwadraty.</p>
        </div>
      )}

      <ul className="shelf-grid">
        {[...shelves]
          .sort((a, b) => a.name.localeCompare(b.name, 'pl', { numeric: true }))
          .map((s) => (
            <li key={s.id}>
              <Link to={`/polki/${s.id}`} className="card card--16 shelf-card">
                <div className="heading-row" style={{ alignItems: 'center' }}>
                  <span className="shelf-tag shelf-tag--lg">{s.name}</span>
                  <span className="hint">
                    {s.rows.length} {plural(s.rows.length, 'rząd', 'rzędy', 'rzędów')} · {filled(s)}/{total(s)} miejsc zajętych
                  </span>
                </div>
                <ShelfPreview shelf={s} byId={byId} size="sm" />
              </Link>
            </li>
          ))}
      </ul>
    </Page>
  );
}

type Mode = 'layout' | 'products' | 'preview';

/** Shelf editor: rows and slot counts (graphic squares), products in slots, real-life preview. */
export function ShelfEditor() {
  const { id } = useParams();
  const { shelves, saveShelf, deleteShelf, byId, products } = useStore();
  const navigate = useNavigate();
  const shelf = shelves.find((s) => s.id === id);
  const [mode, setMode] = useState<Mode>('layout');
  const [pick, setPick] = useState<{ row: number; slot: number } | null>(null);
  const [showStock, setShowStock] = useState(false);
  const [captions, setCaptions] = useState(true);

  if (!shelf)
    return (
      <Page back={{ to: '/polki', label: 'Półki' }} title={<h1 className="title-xl">Nie ma takiej półki</h1>}>
        <span />
      </Page>
    );

  const save = (patch: Partial<ShelfDef>) => saveShelf({ ...shelf, ...patch });
  const setRow = (r: number, row: ShelfRow) => save({ rows: shelf.rows.map((x, i) => (i === r ? row : x)) });
  const resize = (r: number, n: number) => {
    const row = shelf.rows[r];
    const slots = row.slots.slice(0, n);
    while (slots.length < n) slots.push(null);
    setRow(r, { ...row, slots });
  };
  const move = (r: number, d: -1 | 1) => {
    const rows = [...shelf.rows];
    const j = r + d;
    if (j < 0 || j >= rows.length) return;
    [rows[r], rows[j]] = [rows[j], rows[r]];
    save({ rows });
  };
  // Only bottles that exist (stock from inventory / deliveries) can stand on shelves: one slot = one bottle.
  const inStock = products.filter((p) => p.qty > 0);
  const placedElsewhere = new Map<string, number>();
  for (const s of shelves)
    if (s.id !== shelf.id) for (const r of s.rows) for (const pid of r.slots) if (pid) placedElsewhere.set(pid, (placedElsewhere.get(pid) ?? 0) + 1);
  const placedHere = new Map<string, number>();
  const over = new Set<string>();
  shelf.rows.forEach((r, ri) =>
    r.slots.forEach((pid, si) => {
      if (!pid) return;
      const n = (placedHere.get(pid) ?? 0) + 1;
      placedHere.set(pid, n);
      const p = byId(pid);
      if (!p || n + (placedElsewhere.get(pid) ?? 0) > bottleCount(p)) over.add(`${ri}-${si}`);
    }),
  );
  const freeOf = (pid: string) => { const p = byId(pid); return (p ? bottleCount(p) : 0) - (placedElsewhere.get(pid) ?? 0) - (placedHere.get(pid) ?? 0); };
  const clearOver = () => save({ rows: shelf.rows.map((r, ri) => ({ ...r, slots: r.slots.map((pid, si) => (over.has(`${ri}-${si}`) ? null : pid)) })) });

  // Products that sit on this shelf according to lots (FIFO data) — suggested first.
  const onShelf = inStock.filter((p) => (p.lots ?? []).some((l) => (l.shelf ?? '') === shelf.name));
  const notPlaced = onShelf.filter((p) => !placedHere.has(p.id) && freeOf(p.id) > 0);
  const placeNext = (pid: string) => {
    if (freeOf(pid) <= 0) return;
    for (let r = 0; r < shelf.rows.length; r++) {
      const i = shelf.rows[r].slots.indexOf(null);
      if (i >= 0) {
        const slots = [...shelf.rows[r].slots];
        slots[i] = pid;
        return setRow(r, { ...shelf.rows[r], slots });
      }
    }
    // no free slot: add one to the last row
    const r = shelf.rows.length - 1;
    if (r >= 0) setRow(r, { ...shelf.rows[r], slots: [...shelf.rows[r].slots, pid] });
  };
  const current = pick ? shelf.rows[pick.row]?.slots[pick.slot] : null;

  return (
    <Page
      back={{ to: '/polki', label: 'Półki' }}
      title={
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
          <div className="field" style={{ gap: 4, flex: '0 1 220px' }}>
            <label htmlFor="sh-name" className="hint" style={{ fontWeight: 600 }}>
              Półka
            </label>
            <input
              id="sh-name"
              className="input input--mono"
              style={{ fontSize: 22, fontWeight: 700, height: 52 }}
              value={shelf.name}
              onChange={(e) => save({ name: e.target.value })}
            />
          </div>
          <span className="hint" style={{ flex: 1, paddingBottom: 14 }}>
            {shelf.rows.length} {plural(shelf.rows.length, 'rząd', 'rzędy', 'rzędów')} · {filled(shelf)}/{total(shelf)} miejsc zajętych
          </span>
          <Link to={`/inwentaryzacja/polki/${encodeURIComponent(shelf.name)}`} className="btn btn--ghost">
            <Icon name="clipboard" size={18} />
            Policz tę półkę
          </Link>
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => {
              if (window.confirm(`Usunąć układ półki ${shelf.name}? Produkty i partie zostają.`)) {
                deleteShelf(shelf.id);
                navigate('/polki');
              }
            }}
          >
            Usuń półkę
          </button>
        </div>
      }
    >
      <div className="seg" role="tablist" aria-label="Tryb">
        {(
          [
            ['layout', '1. Rzędy i miejsca'],
            ['products', '2. Produkty'],
            ['preview', '3. Podgląd'],
          ] as [Mode, string][]
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            className="seg__btn"
            style={{ flex: 1 }}
            aria-selected={mode === k}
            aria-pressed={mode === k}
            onClick={() => setMode(k)}
          >
            {l}
          </button>
        ))}
      </div>

      {mode === 'layout' && (
        <>
          <p className="hint">
            Kliknij kwadrat, aby ustawić, ile butelek mieści się w rzędzie (klik w ostatni zaznaczony usuwa jedno miejsce). Rząd 1 = najwyższy.
          </p>
          <ol className="shelf-rows">
            {shelf.rows.map((row, r) => (
              <li key={row.id} className="card shelf-rowcard">
                <div className="heading-row" style={{ alignItems: 'center' }}>
                  <span className="eyebrow">
                    Rząd {r + 1} · {row.slots.length} {plural(row.slots.length, 'miejsce', 'miejsca', 'miejsc')}
                  </span>
                  <span style={{ display: 'flex', gap: 2 }}>
                    <button type="button" className="icon-btn icon-btn--muted" aria-label="Przesuń rząd wyżej" disabled={r === 0} onClick={() => move(r, -1)}>
                      <Icon name="chevronUp" size={18} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn--muted"
                      aria-label="Przesuń rząd niżej"
                      disabled={r === shelf.rows.length - 1}
                      onClick={() => move(r, 1)}
                    >
                      <Icon name="chevronDown" size={18} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn--muted"
                      aria-label={`Usuń rząd ${r + 1}`}
                      onClick={() =>
                        (!row.slots.some(Boolean) || window.confirm('Usunąć rząd razem z przypisanymi produktami?')) &&
                        save({ rows: shelf.rows.filter((_, i) => i !== r) })
                      }
                    >
                      <Icon name="close" size={18} />
                    </button>
                  </span>
                </div>
                <RowSizer
                  count={row.slots.length}
                  onChange={(n) => resize(r, n)}
                  images={row.slots.map((pid) => (pid ? byId(pid)?.image : undefined))}
                  label={`Liczba miejsc w rzędzie ${r + 1}`}
                />
              </li>
            ))}
          </ol>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn--ghost btn--md"
              onClick={() => save({ rows: [...shelf.rows, newRow(shelf.rows[shelf.rows.length - 1]?.slots.length || 6)] })}
            >
              <Icon name="plus" size={18} />
              Dodaj rząd
            </button>
            <button type="button" className="btn btn--primary btn--md" onClick={() => setMode('products')}>
              Dalej: produkty
            </button>
          </div>
        </>
      )}

      {mode === 'products' && (
        <>
          {over.size > 0 && (
            <div className="card over-warn" role="alert">
              <span style={{ flex: 1 }}>
                <strong>
                  {over.size} {plural(over.size, 'miejsce', 'miejsca', 'miejsc')} ponad stan
                </strong>{' '}
                — tych butelek nie ma już w magazynie (np. po szkoleniu albo wyrzuceniu). Zaznaczone na czerwono.
              </span>
              <button type="button" className="btn btn--outline" onClick={clearOver}>
                Opróżnij miejsca ponad stan
              </button>
            </div>
          )}
          {notPlaced.length > 0 && (
            <div className="card shelf-suggest">
              <span className="hint">Na tej półce wg partii, jeszcze bez miejsca — kliknij, aby wstawić w pierwsze wolne:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {notPlaced.map((p) => (
                  <button key={p.id} type="button" className="chip" style={{ minHeight: 40 }} onClick={() => placeNext(p.id)}>
                    {p.name}
                    <span className="chip__n">wolne {freeOf(p.id)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="hint">Kliknij miejsce, aby wstawić butelkę albo ją zmienić. Do wyboru są tylko produkty ze stanem — każde miejsce to jedna butelka.</p>
          <ShelfPreview shelf={shelf} byId={byId} captions over={over} onSlot={(row, slot) => setPick({ row, slot })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn--primary btn--md" onClick={() => setMode('preview')}>
              Dalej: podgląd
            </button>
          </div>
        </>
      )}

      {mode === 'preview' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 20px' }}>
            <button type="button" className="btn btn--primary btn--md" onClick={() => window.print()}>
              <Icon name="copy" size={18} />
              Drukuj planogram
            </button>
            <label className="ret__check" style={{ fontSize: 14 }}>
              <input type="checkbox" checked={showStock} onChange={() => setShowStock(!showStock)} />
              Pokaż stany, otwarte i terminy
            </label>
            <label className="ret__check" style={{ fontSize: 14 }}>
              <input type="checkbox" checked={captions} onChange={() => setCaptions(!captions)} />
              Podpisy
            </label>
          </div>
          <ShelfPreview shelf={shelf} byId={byId} showStock={showStock} captions={captions} over={over} />
          <PrintSheet shelf={shelf} byId={byId} />
          {showStock && (
            <p className="hint">
              Liczba = sztuki tego produktu na półce {shelf.name} wg partii · <span className="rack__dot is-low" style={{ display: 'inline-block' }} /> otwarta
              lub krótki termin · <span className="rack__dot is-out" style={{ display: 'inline-block' }} /> po terminie
            </p>
          )}
        </>
      )}

      <ProductPicker
        open={!!pick}
        products={inStock}
        suggested={onShelf}
        free={(p) => freeOf(p.id) + (current === p.id ? 1 : 0)}
        current={current ? byId(current) : undefined}
        title={pick ? `Rząd ${pick.row + 1}, miejsce ${pick.slot + 1}` : ''}
        onClose={() => setPick(null)}
        onClear={() => {
          if (!pick) return;
          const row = shelf.rows[pick.row];
          setRow(pick.row, { ...row, slots: row.slots.map((x, i) => (i === pick.slot ? null : x)) });
          setPick(null);
        }}
        onPick={(p, fillRow) => {
          if (!pick) return;
          const row = shelf.rows[pick.row];
          // Never place more bottles than are free: this slot first, then empty slots of the row.
          let left = freeOf(p.id) + (current === p.id ? 1 : 0);
          const slots = row.slots.map((x, i) => {
            if (i === pick.slot) return left-- > 0 ? p.id : x;
            return x;
          });
          if (fillRow) for (let i = 0; i < slots.length && left > 0; i++) if (slots[i] === null) (slots[i] = p.id), left--;
          setRow(pick.row, { ...row, slots });
          setPick(null);
        }}
      />
    </Page>
  );
}

/** Printed planogram: shelf name and date, the shelf with captions, and a row-by-row list. Only visible on paper. */
function PrintSheet({ shelf, byId }: { shelf: ShelfDef; byId: (id: string) => import('../lib/types').StockedProduct | undefined }) {
  return (
    <div className="print-sheet" aria-hidden="true">
      <div className="print-sheet__head">
        <span className="shelf-tag shelf-tag--lg">{shelf.name}</span>
        <span>Planogram półki · {formatDate(todayIso())}</span>
      </div>
      <ShelfPreview shelf={shelf} byId={byId} captions />
      <ol className="print-sheet__list">
        {shelf.rows.map((r, i) => (
          <li key={r.id}>
            <strong>Rząd {i + 1}:</strong>{' '}
            {r.slots.map((pid, j) => `${j + 1}. ${pid ? (byId(pid)?.name ?? '?') + ` (${byId(pid)?.code ?? ''})` : '— puste —'}`).join('; ')}
          </li>
        ))}
      </ol>
    </div>
  );
}
