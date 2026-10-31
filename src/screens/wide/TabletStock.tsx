import { CategoryChips, chipLabel } from '../../components/CategoryChips';
import { money, stockValue } from '../../lib/money';
import { IncomingNote } from '../../components/Incoming';
import { History } from '../../components/History';
import { Icon } from '../../components/Icon';
import { OrderSummary } from '../../components/Orders';
import { ProductFields } from '../../components/ProductForm';
import { SearchField } from '../../components/SearchField';
import { TopBar } from '../../components/Shell';
import { Thumb } from '../../components/Thumb';
import { ExpiryBanner } from '../ExpiryScreen';
import { LotsList } from '../../components/Lots';
import { Link } from 'react-router-dom';
import { MIN_LABELS, Stepper } from '../../components/Stepper';
import { Qty, QtySmall, StatusBadge, StatusBand } from '../../components/Status';
import { catLabel } from '../../lib/catalog';
import { countProducts, countResults, formatDate, plural } from '../../lib/text';
import { useStore } from '../../store';
import { useStockPanel, type StockPanelInit } from './useStockPanel';

export function TabletStock({ init }: { init?: StockPanelInit }) {
  const { state, needs } = useStore();
  const m = useStockPanel('product', init);
  const outN = needs.filter((p) => p.isOut).length;
  const n = m.results.length;
  const emptyKind = !m.all.length ? 'empty' : !m.hasQuery ? 'pick' : m.matched.length ? 'cat' : 'none';

  return (
    <div className="wide">
      <TopBar variant="tablet">
        <span className="spacer" />
        <Link to="/katalog" className="btn btn--ghost btn--r12">
          Z folderów
        </Link>
        <button type="button" className="btn btn--ghost btn--r12" onClick={m.openNew}>
          <Icon name="plus" size={18} />
          <span className="label-wide">Dodaj produkt</span>
        </button>
      </TopBar>
      <div className="md">
        <section aria-label="Lista produktów" className="md__list">
          <div className="md__list-head">
            <SearchField
              id="t-szukaj"
              value={m.query}
              onChange={m.setQuery}
              placeholder="Nazwa lub kod, np. kokos"
              label="Szukaj produktu po nazwie lub kodzie"
            />
            <CategoryChips value={m.cat} onChange={m.setCat} matched={m.matched} layout="scroll" />
          </div>
          <div className="md__list-body">
            {!m.hasQuery && <ExpiryBanner />}
            {needs.length > 0 && (
              <button type="button" className="banner" style={{ minHeight: 60, padding: '10px 14px' }} aria-pressed={m.panel === 'order'} onClick={m.showOrder}>
                <span className="banner__icon">
                  <Icon name="cart" size={20} />
                </span>
                <span className="stack-2" style={{ flex: 1 }}>
                  <span className="banner__title">
                    {needs.length} {plural(needs.length, 'produkt', 'produkty', 'produktów')} do zamówienia
                  </span>
                  <span className="banner__sub">
                    {outN} brak · {needs.length - outN} poniżej minimum
                  </span>
                </span>
                <Icon name="chevronRight" size={20} />
              </button>
            )}
            <div className="heading-row">
              <h2 className="eyebrow">{m.hasQuery ? countResults(n) : countProducts(n)}</h2>
              <span className="hint">
                stan z {formatDate(state.lastCount)}
                {stockValue(m.all).value > 0 ? ` · ${money(stockValue(m.all).value)}` : ''}
              </span>
            </div>
            {n > 0 && (
              <ul className="rows">
                {m.results.map((p) => {
                  const on = m.sel?.id === p.id;
                  return (
                    <li key={p.id} className={on ? 'is-selected' : undefined}>
                      <button type="button" className="row-link" aria-current={on ? 'true' : undefined} onClick={() => m.pick(p.id)}>
                        {p.image && <Thumb src={p.image} />}
                        <span className="stack-2" style={{ flex: 1 }}>
                          <span className="row-name">{p.name}</span>
                          <span className="code">{p.code}</span>
                        </span>
                        <span className="row-end">
                          <QtySmall n={p.qty} unit={p.unit} />
                          <StatusBadge p={p} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section aria-label="Szczegóły" className="md__detail">
          {m.sel && (
            <div className="md__panel">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                {m.sel.image && <Thumb src={m.sel.image} size="lg" />}
                <div className="stack-4" style={{ gap: 6, flex: 1 }}>
                  <h2 className="title-lg">{m.sel.name}</h2>
                  <span className="code" style={{ fontSize: 15, lineHeight: '20px' }}>
                    {m.sel.code} · {catLabel(m.sel.cat)}
                  </span>
                  {m.sel.brand && (
                    <span className="subtitle subtitle--lg">
                      {m.sel.brand} · {m.sel.size}
                    </span>
                  )}
                </div>
                <button type="button" className="btn btn--ghost btn--r12" onClick={m.openEdit}>
                  Edytuj dane
                </button>
              </div>
              <StatusBand p={m.sel} variant="xl" />
              <IncomingNote p={m.sel} />
              <div className="stat-grid">
                <div className="stat">
                  <span className="muted" style={{ fontSize: 14, lineHeight: '20px' }}>
                    {m.sel.uncounted ? 'Jeszcze nie liczony' : `Stan z ${formatDate(state.lastCount)}`}
                  </span>
                  <Qty n={m.sel.qty} unit={m.sel.unit} size={72} unitSize={20} />
                </div>
                <div className="stat stat--gap">
                  <label htmlFor="t-min" className="muted" style={{ fontSize: 14, lineHeight: '20px' }}>
                    Minimum na stanie
                  </label>
                  <Stepper id="t-min" value={m.sel.min} onChange={m.setMin} unit={m.sel.unit} label={MIN_LABELS} />
                  <p className="hint">Poniżej tej liczby produkt trafia na listę do zamówienia.</p>
                </div>
              </div>
              <LotsList lots={m.sel.lots ?? []} unit={m.sel.unit} headingLevel="h3" />
              <History
                p={m.sel}
                variant="lg"
                headingLevel="h3"
                emptyText={
                  <p className="empty__text" style={{ padding: 16, borderRadius: 14, border: '1px dashed var(--dashed)' }}>
                    Produkt nie był jeszcze liczony — stan pojawi się po najbliższej inwentaryzacji.
                  </p>
                }
              />
              <div>
                <button type="button" className="btn btn--quiet btn--r12" onClick={m.archive}>
                  Archiwizuj produkt
                </button>
              </div>
            </div>
          )}

          {m.panel === 'order' && (
            <div className="md__panel" style={{ gap: 20 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
                <div className="stack-4">
                  <h2 className="title-lg">Do zamówienia</h2>
                  <p className="subtitle subtitle--lg">Poniżej minimum, po odjęciu tego, co jest w drodze</p>
                </div>
              </div>
              <OrderSummary />
            </div>
          )}

          {m.panel === 'form' && (
            <div className="md__panel" style={{ gap: 20, maxWidth: 600 }}>
              <h2 className="title-lg">{m.editId ? 'Edytuj produkt' : 'Nowy produkt'}</h2>
              <ProductFields idPrefix="t-f" draft={m.draft} onChange={m.setDraft} layout="tablet" />
              {m.err && <p className="form-error">Podaj nazwę produktu.</p>}
              {!m.editId && (
                <p className="muted" style={{ fontSize: 14, lineHeight: '20px' }}>
                  Nowy produkt ma stan 0, dopóki nie policzysz go w inwentaryzacji.
                </p>
              )}
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" className="btn btn--primary btn--lg" onClick={m.submit}>
                  {m.editId ? 'Zapisz zmiany' : 'Dodaj produkt'}
                </button>
                <button type="button" className="btn btn--ghost btn--lg" style={{ fontWeight: 500, padding: '0 20px' }} onClick={m.cancel}>
                  Anuluj
                </button>
              </div>
            </div>
          )}

          {m.panel === 'product' && !m.sel && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14, maxWidth: 520, paddingTop: 32 }}>
              <h2 style={{ fontSize: 28, lineHeight: '34px', fontWeight: 700, letterSpacing: '-0.01em' }}>
                {emptyKind === 'empty'
                  ? 'Magazyn jest pusty'
                  : emptyKind === 'pick'
                    ? 'Wybierz produkt z listy'
                    : emptyKind === 'cat'
                      ? `Nic w kategorii „${chipLabel(m.cat)}”`
                      : `Nie ma „${m.query.trim()}” w bazie`}
              </h2>
              <p className="muted" style={{ fontSize: 16, lineHeight: '24px' }}>
                {emptyKind === 'empty'
                  ? 'Dodaj pierwszy produkt — pojawi się w następnej inwentaryzacji.'
                  : emptyKind === 'pick'
                    ? 'Zobaczysz tu stan, minimum i historię inwentaryzacji.'
                    : emptyKind === 'cat'
                      ? 'Pasujące produkty są w innych kategoriach.'
                      : 'Sprawdź pisownię albo kod. Jeśli to nowy produkt, dodaj go — pojawi się w następnej inwentaryzacji.'}
              </p>
              {emptyKind === 'empty' && (
                <Link to="/katalog" className="btn btn--outline btn--lg" style={{ padding: '0 20px' }}>
                  Dodaj produkty z folderów (domyślne)
                </Link>
              )}
              {(emptyKind === 'none' || emptyKind === 'empty') && (
                <button type="button" className="btn btn--primary btn--lg" style={{ padding: '0 20px' }} onClick={m.openNew}>
                  <Icon name="plus" size={18} />
                  Dodaj produkt
                </button>
              )}
              {emptyKind === 'cat' && (
                <button type="button" className="btn btn--outline btn--lg" style={{ padding: '0 20px' }} onClick={() => m.setCat('all')}>
                  Pokaż wszystkie kategorie
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
