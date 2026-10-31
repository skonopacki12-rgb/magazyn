import { CategoryChips, chipLabel } from '../../components/CategoryChips';
import { History } from '../../components/History';
import { Icon } from '../../components/Icon';
import { CopyButton, OrderGroups, useOrders } from '../../components/Orders';
import { ProductFields } from '../../components/ProductForm';
import { SearchField } from '../../components/SearchField';
import { TopBar } from '../../components/Shell';
import { Thumb } from '../../components/Thumb';
import { Link } from 'react-router-dom';
import { MIN_LABELS, Stepper } from '../../components/Stepper';
import { StatusBadge, StatusBand, Qty } from '../../components/Status';
import { catLabel } from '../../lib/catalog';
import { countProducts, formatDate } from '../../lib/text';
import { useStore } from '../../store';
import { useStockPanel, type StockPanelInit } from './useStockPanel';

export function LaptopStock({ init }: { init?: StockPanelInit }) {
  const { state, needs } = useStore();
  const m = useStockPanel('order', init);
  const orders = useOrders();
  const n = m.results.length;
  const emptyKind = !m.all.length ? 'empty' : m.matched.length ? 'cat' : 'none';
  const showOrder = m.panel === 'order' || (m.panel === 'product' && !m.sel);

  return (
    <div className="wide">
      <TopBar variant="laptop">
        <span className="spacer" />
        <span className="subtitle">Stan z inwentaryzacji: {formatDate(state.lastCount)}</span>
        <Link to="/katalog" className="btn btn--ghost">
          Dodaj produkty z folderów (domyślne)
        </Link>
        <button type="button" className="btn btn--primary" onClick={m.openNew}>
          <Icon name="plus" size={18} />
          Dodaj produkt
        </button>
      </TopBar>
      <div className="scroll">
        <div className="page split">
          <section aria-label="Stany magazynowe" className="split__main">
            <div className="page-head">
              <div className="stack-2">
                <h1 className="title-md">Stany magazynowe</h1>
                <p className="subtitle subtitle--lg">
                  {countProducts(m.all.length)} · {needs.length} do zamówienia
                </p>
              </div>
              <SearchField
                id="l-szukaj"
                size="md"
                value={m.query}
                onChange={m.setQuery}
                placeholder="Szukaj po nazwie lub kodzie"
                label="Szukaj produktu po nazwie lub kodzie"
                style={{ flex: '0 1 460px', minWidth: 260 }}
              />
            </div>
            <CategoryChips value={m.cat} onChange={m.setCat} matched={m.matched} layout="wrap" longLabels small />

            {n > 0 ? (
              <div className="card table-wrap">
                <div className="table--stock">
                  <div aria-hidden="true" className="trow trow--head trow--stock">
                    <span>Produkt</span>
                    <span>Kod</span>
                    <span>Kategoria</span>
                    <span className="t-right">Stan</span>
                    <span className="t-right">Minimum</span>
                    <span>Status</span>
                    <span className="t-right">Zamów</span>
                  </div>
                  <ul className="flat-rows">
                    {m.results.map((p) => {
                      const on = m.sel?.id === p.id;
                      const status = p.uncounted ? 'jeszcze nie liczony' : p.isOut ? 'brak' : p.isLow ? 'mało' : 'jest';
                      return (
                        <li key={p.id} className={on ? 'is-selected' : undefined}>
                          <button
                            type="button"
                            className="trow trow--stock"
                            aria-current={on ? 'true' : undefined}
                            aria-label={`${p.name}, ${p.code}, stan ${p.qty} ${p.unit}, minimum ${p.min}, ${status}`}
                            onClick={() => m.pick(p.id)}
                            style={on ? { background: 'transparent' } : undefined}
                          >
                            <span className="t-name" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {p.image && <Thumb src={p.image} size="xs" />}
                              <span>{p.name}</span>
                            </span>
                            <span className="code">{p.code}</span>
                            <span style={{ fontSize: 14, lineHeight: '20px', color: 'var(--ink-2)' }}>{catLabel(p.cat)}</span>
                            <span className="qty qty--sm" style={{ justifyContent: 'flex-end' }}>
                              <span className="qty__n" style={{ fontSize: 17, lineHeight: '22px' }}>
                                {p.qty}
                              </span>
                              <span className="qty__u" style={{ fontSize: 12, lineHeight: '16px' }}>
                                {p.unit}
                              </span>
                            </span>
                            <span className="t-num is-quiet t-right">{p.min}</span>
                            <span style={{ display: 'flex' }}>
                              <StatusBadge p={p} />
                            </span>
                            <span className={`t-num t-right ${p.needs ? 'is-strong' : 'is-quiet'}`}>{p.needs ? `${p.toOrder} ${p.unit}` : '—'}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="card card--dashed empty" style={{ padding: '28px 24px' }}>
                <h2 style={{ fontSize: 22, lineHeight: '28px', fontWeight: 700 }}>
                  {emptyKind === 'empty'
                    ? 'Magazyn jest pusty'
                    : emptyKind === 'cat'
                      ? `Nic w kategorii „${chipLabel(m.cat, true)}”`
                      : `Nie ma „${m.query.trim()}” w bazie`}
                </h2>
                <p className="empty__text">
                  {emptyKind === 'empty'
                    ? 'Dodaj pierwszy produkt — pojawi się w następnej inwentaryzacji.'
                    : emptyKind === 'cat'
                      ? 'Pasujące produkty są w innych kategoriach.'
                      : 'Sprawdź pisownię albo kod. Jeśli to nowy produkt, dodaj go — pojawi się w następnej inwentaryzacji.'}
                </p>
                {emptyKind !== 'cat' ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {emptyKind === 'empty' && (
                      <Link to="/katalog" className="btn btn--primary btn--md">
                        Dodaj produkty z folderów (domyślne)
                      </Link>
                    )}
                    <button type="button" className={`btn ${emptyKind === 'empty' ? 'btn--outline' : 'btn--primary'} btn--md`} onClick={m.openNew}>
                      <Icon name="plus" size={18} />
                      Dodaj produkt
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn btn--outline btn--md" onClick={() => m.setCat('all')}>
                    Pokaż wszystkie kategorie
                  </button>
                )}
              </div>
            )}
          </section>

          <aside className="split__aside card card--16">
            {showOrder && (
              <div>
                <div className="stack-4" style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--line)' }}>
                  <h2 style={{ fontSize: 20, lineHeight: '26px', fontWeight: 700 }}>Do zamówienia</h2>
                  <p className="subtitle">
                    Poniżej minimum · zamówione {orders.doneCount} z {orders.total}
                  </p>
                </div>
                {orders.total ? (
                  <OrderGroups m={orders} variant="aside" headingLevel="h3" />
                ) : (
                  <p className="empty__text" style={{ padding: '16px 20px 18px' }}>
                    {m.all.length ? 'Wszystkie produkty są powyżej minimum.' : 'Nic do zamówienia.'}
                  </p>
                )}
                {orders.total > 0 && (
                  <div style={{ padding: '14px 20px 18px', borderTop: '1px solid var(--line)', marginTop: 8 }}>
                    <CopyButton m={orders} className="btn btn--primary btn--md btn--block" short />
                  </div>
                )}
              </div>
            )}

            {m.sel && (
              <div>
                <div className="aside-head">
                  <span className="eyebrow eyebrow--sm">Produkt</span>
                  <button type="button" className="icon-btn" aria-label="Zamknij i wróć do listy do zamówienia" onClick={m.close}>
                    <Icon name="close" size={18} />
                  </button>
                </div>
                <div className="aside-body">
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    {m.sel.image && <Thumb src={m.sel.image} size="md" />}
                    <div className="stack-4">
                      <h2 style={{ fontSize: 22, lineHeight: '28px', fontWeight: 700 }}>{m.sel.name}</h2>
                      <span className="code">
                        {m.sel.code} · {catLabel(m.sel.cat)}
                      </span>
                    </div>
                  </div>
                  <StatusBand p={m.sel} variant="rounded" />
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                    <div className="stack-2">
                      <span className="subtitle">{m.sel.uncounted ? 'Jeszcze nie liczony' : `Stan z ${formatDate(state.lastCount)}`}</span>
                      <Qty n={m.sel.qty} unit={m.sel.unit} size={52} unitSize={16} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <label htmlFor="l-min" className="subtitle">
                        Minimum
                      </label>
                      <Stepper id="l-min" value={m.sel.min} onChange={m.setMin} small label={MIN_LABELS} />
                    </div>
                  </div>
                  <History
                    p={m.sel}
                    variant="compact"
                    headingLevel="h3"
                    emptyText={
                      <p className="muted" style={{ fontSize: 14, lineHeight: '20px' }}>
                        Nie był jeszcze liczony — stan pojawi się po najbliższej inwentaryzacji.
                      </p>
                    }
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button type="button" className="btn btn--outline" style={{ fontSize: 14 }} onClick={m.openEdit}>
                      Edytuj dane
                    </button>
                    <button type="button" className="btn btn--quiet" style={{ fontSize: 14 }} onClick={m.archive}>
                      Archiwizuj
                    </button>
                  </div>
                </div>
              </div>
            )}

            {m.panel === 'form' && (
              <div>
                <div className="aside-head">
                  <h2 style={{ fontSize: 18, lineHeight: '24px', fontWeight: 700 }}>{m.editId ? 'Edytuj produkt' : 'Nowy produkt'}</h2>
                  <button type="button" className="icon-btn" aria-label="Anuluj" onClick={m.cancel}>
                    <Icon name="close" size={18} />
                  </button>
                </div>
                <div className="aside-body form--compact" style={{ gap: 14 }}>
                  <ProductFields idPrefix="l-f" draft={m.draft} onChange={m.setDraft} layout="compact" />
                  {m.err && <p className="form-error">Podaj nazwę produktu.</p>}
                  {!m.editId && <p className="hint">Nowy produkt ma stan 0, dopóki nie policzysz go w inwentaryzacji.</p>}
                  <button type="button" className="btn btn--primary btn--md" onClick={m.submit}>
                    {m.editId ? 'Zapisz zmiany' : 'Dodaj produkt'}
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
