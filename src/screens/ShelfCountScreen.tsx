import { useMemo, useState } from 'react';
import { ScanButton, ScanDialog } from '../components/Scanner';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ProductPicker, ShelfPreview } from '../components/Shelf';
import { TabBar, TopBar } from '../components/Shell';
import { Thumb } from '../components/Thumb';
import { shelfContents, shelfNames } from '../lib/shelfCount';
import { plural } from '../lib/text';
import type { StockedProduct } from '../lib/types';
import { useBreakpoint } from '../lib/useBreakpoint';
import { bottleQty } from '../lib/volume';
import { useStore } from '../store';

function Layout({ children }: { children: React.ReactNode }) {
  const bp = useBreakpoint();
  return (
    <div className="catalog">
      {bp !== 'phone' && <TopBar variant={bp === 'laptop' ? 'laptop' : 'tablet'} />}
      <main className="catalog__main" style={{ paddingTop: bp === 'phone' ? 8 : 20 }}>
        <div className="catalog__inner" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
          {children}
        </div>
      </main>
      {bp === 'phone' && <TabBar />}
    </div>
  );
}

/** "Inwentaryzacja po półkach": list of shelves with today's status. */
export function ShelfCountList() {
  const { products, shelves, byId, shelfAudit } = useStore();
  const names = shelfNames(products, shelves);
  return (
    <Layout>
      <div style={{ margin: '0 -8px' }}>
        <Link to="/inwentaryzacja" className="back-link">
          <Icon name="chevronLeft" size={22} />
          Inwentaryzacja
        </Link>
      </div>
      <div className="stack-2">
        <h1 className="title-xl">Inwentaryzacja po półkach</h1>
        <p className="subtitle subtitle--lg">Otwórz półkę, potwierdź albo popraw ilości. Każda zmiana od razu zapisuje się w stanach i w ułożeniu półki.</p>
      </div>
      {!names.length && (
        <div className="card card--dashed empty">
          <h2 className="empty__title empty__title--sm">Brak półek</h2>
          <p className="empty__text">Wpisz półki w partiach (w zwykłej inwentaryzacji lub przy dostawie) albo utwórz układ półki.</p>
          <Link to="/polki" className="btn btn--primary btn--md">
            Półki
          </Link>
        </div>
      )}
      <ul className="shelf-grid">
        {names.map((name) => {
          const layout = shelves.find((s) => s.name === name);
          const items = shelfContents(products, name, layout);
          const audit = shelfAudit(name);
          const done = items.filter((i) => audit.done.includes(i.productId)).length;
          const bottles = items.reduce((s, i) => s + i.expected, 0);
          return (
            <li key={name}>
              <Link to={`/inwentaryzacja/polki/${encodeURIComponent(name)}`} className={`card card--16 shelf-card${audit.finished ? ' is-finished' : ''}`}>
                <div className="heading-row" style={{ alignItems: 'center' }}>
                  <span className="shelf-tag shelf-tag--lg">{name}</span>
                  {audit.finished ? (
                    <span className="badge is-ok">Sprawdzona dziś</span>
                  ) : done ? (
                    <span className="badge is-low">
                      Sprawdzone {done}/{items.length}
                    </span>
                  ) : (
                    <span className="hint">nie sprawdzona</span>
                  )}
                </div>
                <span className="hint">
                  {items.length} {plural(items.length, 'produkt', 'produkty', 'produktów')} · {bottles} szt./jedn.
                  {layout ? '' : ' · bez układu półki'}
                </span>
                {layout && <ShelfPreview shelf={layout} byId={byId} size="sm" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </Layout>
  );
}

/** Counting one shelf: confirm or correct each product; tap a bottle to take it off the shelf. */
export function ShelfCount() {
  const { name: raw } = useParams();
  const name = decodeURIComponent(raw ?? '');
  const { products, shelves, byId, shelfAudit, adjustShelf, checkOnShelf, finishShelf } = useStore();
  const navigate = useNavigate();
  const layout = shelves.find((s) => s.name === name);
  const items = shelfContents(products, name, layout);
  const audit = shelfAudit(name);
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const names = shelfNames(products, shelves);
  const next = names[names.indexOf(name) + 1];
  const sorted = useMemo(() => [...items].sort((a, b) => (byId(a.productId)?.name ?? '').localeCompare(byId(b.productId)?.name ?? '', 'pl')), [items, byId]);
  const done = items.filter((i) => audit.done.includes(i.productId)).length;

  const removeBottle = (row: number, index: number) => {
    const pid = layout?.rows[row]?.slots[index];
    const p = pid ? byId(pid) : undefined;
    const it = items.find((i) => i.productId === pid);
    if (!p || !it) return;
    if (!window.confirm(`Usunąć butelkę „${p.name}” z półki ${name}? Stan zmniejszy się o ${bottleQty(p)} ${p.unit}.`)) return;
    adjustShelf({ shelf: name, productId: p.id, qty: it.expected - bottleQty(p), slot: { row, index }, note: 'usunięta z półki' });
  };

  return (
    <Layout>
      <div style={{ margin: '0 -8px' }}>
        <Link to="/inwentaryzacja/polki" className="back-link">
          <Icon name="chevronLeft" size={22} />
          Półki do sprawdzenia
        </Link>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <span className="shelf-tag shelf-tag--lg" style={{ fontSize: 24, lineHeight: '32px' }}>
          {name}
        </span>
        <div className="stack-2" style={{ flex: 1 }}>
          <h1 className="title-md">Liczenie półki</h1>
          <span className="hint">
            Sprawdzone {done} z {items.length} · zmiany zapisują się od razu
          </span>
        </div>
        {layout && (
          <Link to={`/polki/${layout.id}`} className="btn btn--ghost">
            Układ półki
          </Link>
        )}
      </div>

      {layout ? (
        <>
          <p className="hint">Kliknij butelkę na półce, aby ją usunąć (zdjęta, rozbita, pusta).</p>
          <ShelfPreview shelf={layout} byId={byId} onSlot={removeBottle} />
        </>
      ) : (
        <p className="hint">Ta półka nie ma jeszcze układu — liczysz według partii.</p>
      )}

      <ul className="rows">
        {sorted.map((it) => {
          const p = byId(it.productId);
          if (!p) return null;
          const ok = audit.done.includes(p.id);
          const step = bottleQty(p);
          const set = (n: number) => adjustShelf({ shelf: name, productId: p.id, qty: Math.max(0, n) });
          return (
            <li key={p.id} className={`sc-row${ok ? ' is-done' : ''}`}>
              {p.image && <Thumb src={p.image} />}
              <span className="stack-2" style={{ flex: '1 1 180px' }}>
                <span className="row-name" style={{ fontSize: 15, lineHeight: '20px' }}>
                  {p.name}
                </span>
                <span className="code">
                  {p.code}
                  {it.hasLots ? '' : ' · wg ułożenia'}
                  {layout && it.hasLots && it.slots !== it.lotQty ? ` · miejsc na półce ${it.slots}` : ''}
                </span>
              </span>
              <span className="sc-qty">
                <button
                  type="button"
                  className="stepper__btn"
                  aria-label={`Mniej: ${p.name}`}
                  disabled={it.expected <= 0}
                  onClick={() => set(it.expected - step)}
                >
                  <Icon name="minus" size={18} />
                </button>
                <label className="sr-only" htmlFor={`sc-${p.id}`}>
                  Ilość na półce: {p.name}
                </label>
                <input
                  id={`sc-${p.id}`}
                  key={`${p.id}-${it.expected}`}
                  className="stepper__input"
                  type="text"
                  inputMode="numeric"
                  defaultValue={it.expected}
                  onBlur={(e) => {
                    const n = Number(e.target.value.replace(/[^0-9]/g, ''));
                    if (!Number.isNaN(n) && n !== it.expected) set(n);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
                <button type="button" className="stepper__btn" aria-label={`Więcej: ${p.name}`} onClick={() => set(it.expected + step)}>
                  <Icon name="plus" size={18} />
                </button>
                <span className="stepper__unit">{p.unit}</span>
              </span>
              <button type="button" className={`btn ${ok ? 'btn--success' : 'btn--ghost'} sc-ok`} aria-pressed={ok} onClick={() => checkOnShelf(name, p.id)}>
                <Icon name="check" size={18} />
                {ok ? 'Sprawdzone' : 'Zgadza się'}
              </button>
            </li>
          );
        })}
        {!sorted.length && (
          <li className="hint" style={{ padding: 16 }}>
            Na tej półce nic nie ma — dodaj produkt, który na niej znalazłeś.
          </li>
        )}
      </ul>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <ScanButton onClick={() => setScanning(true)} label="Skanuj (+1 na półce)" />
        <ScanDialog
          open={scanning}
          continuous
          title={`Skanuj butelki na półce ${name}`}
          onClose={() => setScanning(false)}
          onProduct={(p) => {
            const now = shelfContents(products, name, layout).find((i) => i.productId === p.id)?.expected ?? 0;
            adjustShelf({ shelf: name, productId: p.id, qty: now + bottleQty(p), note: 'zeskanowany na półce' });
            return `${p.name}: ${now} → ${now + bottleQty(p)} na półce ${name}`;
          }}
        />
        <button type="button" className="btn btn--ghost btn--md" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} />
          Znaleziony produkt na tej półce
        </button>
        <span className="spacer" />
        {audit.finished ? (
          <button type="button" className="btn btn--quiet btn--md" onClick={() => finishShelf(name, false)}>
            Cofnij „sprawdzona”
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary btn--md"
            onClick={() => {
              for (const it of items) if (!audit.done.includes(it.productId)) checkOnShelf(name, it.productId);
              finishShelf(name, true);
              navigate(next ? `/inwentaryzacja/polki/${encodeURIComponent(next)}` : '/inwentaryzacja/polki');
            }}
          >
            <Icon name="check" size={18} />
            Półka sprawdzona{next ? ` → ${next}` : ''}
          </button>
        )}
      </div>

      <ProductPicker
        open={adding}
        products={products}
        suggested={[]}
        title={`Dodaj na półkę ${name}`}
        allowFill={false}
        onClose={() => setAdding(false)}
        onClear={() => setAdding(false)}
        onPick={(p: StockedProduct) => {
          const it = items.find((i) => i.productId === p.id);
          adjustShelf({ shelf: name, productId: p.id, qty: (it?.expected ?? 0) + bottleQty(p), note: 'znaleziony na półce' });
          setAdding(false);
        }}
      />
    </Layout>
  );
}
