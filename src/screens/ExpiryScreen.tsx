import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { expiryText, openedText } from '../components/Lots';
import { Thumb } from '../components/Thumb';
import { expiryAlerts, daysUntil } from '../lib/fifo';
import { plural } from '../lib/text';
import type { Lot, Product } from '../lib/types';
import { useStore } from '../store';

/** "Terminy": batches past or near their best-before date, then all opened bottles. */
export function ExpiryScreen() {
  const { products } = useStore();
  const navigate = useNavigate();
  const alerts = expiryAlerts(products);
  const expired = alerts.filter((a) => a.state === 'expired');
  const soon = alerts.filter((a) => a.state === 'soon');
  const opened = products
    .flatMap((p) => (p.lots ?? []).filter((l) => l.open).map((lot) => ({ product: p, lot })))
    .sort((a, b) => ((a.lot.openedAt ?? '9999') < (b.lot.openedAt ?? '9999') ? -1 : 1));

  return (
    <div className="catalog">
      <header className="catalog__head">
        <div className="catalog__inner" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ margin: '0 -8px' }}>
            <button type="button" className="back-link" style={{ border: 0, background: 'none', color: 'var(--accent)' }} onClick={() => navigate(-1)}>
              <Icon name="chevronLeft" size={22} />
              Wróć
            </button>
          </div>
          <div className="stack-2">
            <h1 className="title-xl">Terminy i otwarte</h1>
            <p className="subtitle subtitle--lg">Według ostatniej inwentaryzacji. „Kończy się” = 14 dni lub mniej.</p>
          </div>
        </div>
      </header>
      <main className="catalog__main">
        <div className="catalog__inner" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>
          <Group title={`Po terminie · ${expired.length}`} tone="is-out" rows={expired} empty="Nic po terminie." />
          <Group title={`Kończy się termin · ${soon.length}`} tone="is-low" rows={soon} empty="Nic z krótkim terminem." />
          <Group title={`Otwarte · ${opened.length}`} tone="is-new" rows={opened} empty="Brak otwartych butelek w ostatniej inwentaryzacji." showOpened />
          {!products.some((p) => p.lots?.length) && (
            <div className="card card--dashed empty">
              <h2 className="empty__title empty__title--sm">Brak danych o partiach</h2>
              <p className="empty__text">
                Podczas inwentaryzacji rozwiń „Otwarte i daty ważności” przy produkcie i wpisz, które butelki są otwarte oraz do kiedy są ważne.
              </p>
              <Link to="/inwentaryzacja" className="btn btn--primary btn--md">
                Przejdź do inwentaryzacji
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Group({
  title,
  tone,
  rows,
  empty,
  showOpened,
}: {
  title: string;
  tone: string;
  rows: { product: Product; lot: Lot }[];
  empty: string;
  showOpened?: boolean;
}) {
  return (
    <section className="stack-4" style={{ gap: 8 }}>
      <div className="order-group__head">
        <span className={`badge ${tone}`} aria-hidden="true">
          &nbsp;
        </span>
        <h2 className="eyebrow">{title}</h2>
      </div>
      {rows.length ? (
        <ul className="rows">
          {rows.map(({ product: p, lot }) => (
            <li key={`${p.id}-${lot.id}`}>
              <Link to={`/produkt/${encodeURIComponent(p.id)}`} className="exp-row">
                {p.image && <Thumb src={p.image} />}
                <span className="stack-2" style={{ flex: 1 }}>
                  <span className="row-name" style={{ fontSize: 15, lineHeight: '20px' }}>
                    {p.name}
                  </span>
                  <span className="hint">
                    {lot.qty} {p.unit} · {showOpened ? openedText(lot) : (expiryText(lot) ?? '')}
                    {showOpened && lot.expiresAt ? ` · ${expiryText(lot)}` : ''}
                    {lot.shelf ? ` · półka ${lot.shelf}` : ''}
                  </span>
                </span>
                {lot.expiresAt && !showOpened && (
                  <span className="mono" style={{ fontWeight: 600, fontSize: 15, color: daysUntil(lot.expiresAt) < 0 ? 'var(--out-bg)' : 'var(--ink)' }}>
                    {daysUntil(lot.expiresAt) < 0 ? `−${-daysUntil(lot.expiresAt)}` : daysUntil(lot.expiresAt)}{' '}
                    {plural(Math.abs(daysUntil(lot.expiresAt)), 'dzień', 'dni', 'dni')}
                  </span>
                )}
                <Icon name="chevronRight" size={18} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" style={{ fontSize: 14 }}>
          {empty}
        </p>
      )}
    </section>
  );
}

/** Banner shown on stock screens when something is past or near its date. */
export function ExpiryBanner() {
  const { products } = useStore();
  const alerts = expiryAlerts(products);
  if (!alerts.length) return null;
  const expired = alerts.filter((a) => a.state === 'expired').length;
  const soon = alerts.length - expired;
  return (
    <Link to="/terminy" className="banner banner--exp">
      <span className="banner__icon">
        <Icon name="clock" size={20} />
      </span>
      <span className="stack-2" style={{ flex: 1 }}>
        <span className="banner__title">
          {alerts.length} {plural(alerts.length, 'partia', 'partie', 'partii')} — sprawdź terminy
        </span>
        <span className="banner__sub">
          {expired} po terminie · {soon} kończy się w 14 dni
        </span>
      </span>
      <Icon name="chevronRight" size={20} />
    </Link>
  );
}
