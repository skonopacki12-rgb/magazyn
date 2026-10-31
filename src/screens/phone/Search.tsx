import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AccountMenu } from '../../components/Account';
import { CategoryChips, chipLabel, type CatFilter } from '../../components/CategoryChips';
import { Icon } from '../../components/Icon';
import { SearchField } from '../../components/SearchField';
import { TabBar } from '../../components/Shell';
import { QtySmall, Qty, StatusBadge, StatusBand } from '../../components/Status';
import { catLabel } from '../../lib/catalog';
import { useStockSearch } from '../../lib/useStockSearch';
import { countProducts, countResults, formatDate, plural } from '../../lib/text';
import { useStore } from '../../store';

export function PhoneSearch() {
  const { state, needs } = useStore();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<CatFilter>('all');
  const { matched, results, hasQuery } = useStockSearch(query, cat);
  const n = results.length;
  const outN = needs.filter((p) => p.isOut).length;
  const lowN = needs.length - outN;
  const single = hasQuery && n === 1 ? results[0] : null;
  const noneInCat = n === 0 && cat !== 'all' && matched.length > 0;

  return (
    <div className="phone">
      <header className="phone__header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div className="stack-2">
            <h1 className="title-xl">Magazyn</h1>
            <p className="subtitle">Stan z inwentaryzacji: {formatDate(state.lastCount)}</p>
          </div>
          <div style={{ flex: 'none', display: 'flex', gap: 8 }}>
            <Link to="/produkt/nowy" aria-label="Dodaj produkt" className="icon-btn icon-btn--boxed">
              <Icon name="plus" size={22} strokeWidth={2} />
            </Link>
            <AccountMenu compact />
          </div>
        </div>
        <SearchField id="szukaj" value={query} onChange={setQuery} placeholder="Nazwa lub kod, np. kokos" label="Szukaj produktu po nazwie lub kodzie" />
        <CategoryChips value={cat} onChange={setCat} matched={matched} layout="scroll" />
      </header>

      <main className="phone__main">
        {!hasQuery && needs.length > 0 && (
          <Link to="/zamowienia" className="banner">
            <span className="banner__icon">
              <Icon name="cart" size={20} />
            </span>
            <span className="stack-2" style={{ flex: 1 }}>
              <span className="banner__title">
                {needs.length} {plural(needs.length, 'produkt', 'produkty', 'produktów')} do zamówienia
              </span>
              <span className="banner__sub">
                {outN} brak · {lowN} poniżej minimum
              </span>
            </span>
            <Icon name="chevronRight" size={20} />
          </Link>
        )}

        {single && (
          <article className="card card--18" style={{ display: 'flex', flexDirection: 'column' }}>
            <StatusBand p={single} variant="card" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '18px 18px 10px' }}>
              <div className="stack-4">
                <h2 style={{ fontSize: 22, lineHeight: '28px', fontWeight: 700 }}>{single.name}</h2>
                <span className="code code--lg">
                  {single.code} · {catLabel(single.cat)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
                <Qty n={single.qty} unit={single.unit} size={64} unitSize={18} />
                <span className="muted" style={{ fontSize: 14, lineHeight: '20px', textAlign: 'right' }}>
                  minimum {single.min} {single.unit}
                </span>
              </div>
              <Link
                to={`/produkt/${encodeURIComponent(single.id)}`}
                style={{ minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--line)', fontSize: 15, fontWeight: 600, textDecoration: 'none' }}
              >
                Szczegóły i historia stanów
                <Icon name="chevronRight" size={18} />
              </Link>
            </div>
          </article>
        )}

        {(n > 1 || (!hasQuery && n > 0)) && (
          <section className="stack-4" style={{ gap: 8 }}>
            <h2 className="eyebrow">{hasQuery ? countResults(n) : countProducts(n)}</h2>
            <ul className="rows">
              {results.map((p) => (
                <li key={p.id}>
                  <Link to={`/produkt/${encodeURIComponent(p.id)}`} className="row-link">
                    <span className="stack-2" style={{ flex: 1 }}>
                      <span className="row-name">{p.name}</span>
                      <span className="code">{p.code}</span>
                    </span>
                    <span className="row-end">
                      <QtySmall n={p.qty} unit={p.unit} />
                      <StatusBadge p={p} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {noneInCat && (
          <div className="card card--18 empty">
            <h2 className="empty__title empty__title--sm">Nic w kategorii „{chipLabel(cat)}”</h2>
            <p className="empty__text">Pasujące produkty są w innych kategoriach.</p>
            <button type="button" className="btn btn--outline btn--md" onClick={() => setCat('all')}>
              Pokaż wszystkie ({matched.length})
            </button>
          </div>
        )}

        {n === 0 && !noneInCat && (
          <div className="card card--18 card--dashed empty">
            <h2 className="empty__title">{hasQuery ? `Nie ma „${query.trim()}” w bazie` : 'Magazyn jest pusty'}</h2>
            <p className="empty__text">
              {hasQuery ? 'Sprawdź pisownię albo kod. Jeśli to nowy produkt, dodaj go — pojawi się w następnej inwentaryzacji.' : 'Dodaj pierwszy produkt — pojawi się w następnej inwentaryzacji.'}
            </p>
            <Link to={`/produkt/nowy${hasQuery ? `?nazwa=${encodeURIComponent(query.trim())}` : ''}`} className="btn btn--primary btn--md">
              <Icon name="plus" size={18} />
              Dodaj produkt
            </Link>
          </div>
        )}
      </main>
      <TabBar />
    </div>
  );
}
