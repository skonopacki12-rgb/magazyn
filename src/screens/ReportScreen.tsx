import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { TabBar, TopBar } from '../components/Shell';
import { Thumb } from '../components/Thumb';
import { download, toCsv } from '../lib/csv';
import { money, valueOf } from '../lib/money';
import { buildReport, inventoryDates, monthlyUsage, suggestedMin } from '../lib/report';
import { formatDate, plural } from '../lib/text';
import { useBreakpoint } from '../lib/useBreakpoint';
import { useStore } from '../store';

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');

/** Inventory report (differences vs the previous count) + usage per month and suggested minimums. */
export function ReportScreen() {
  const bp = useBreakpoint();
  const { state, products, updateProduct } = useStore();
  const log = state.log ?? [];
  const dates = inventoryDates(state.products);
  const [date, setDate] = useState(dates[0] ?? '');
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [cover, setCover] = useState(14);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<number | null>(null);

  const report = useMemo(() => (date ? buildReport(state.products, log, date) : null), [state.products, log, date]);
  const rows = (report?.rows ?? []).filter((r) => !onlyChanges || r.out || r.delivered || r.lost || r.adjusted || r.prev == null);
  const sum = (f: (r: (typeof rows)[number]) => number) => (report?.rows ?? []).reduce((s, r) => s + f(r), 0);
  const usedValue = sum((r) => valueOf(r.p, r.used ?? 0));
  const lostValue = sum((r) => valueOf(r.p, r.lost));
  const deliveredValue = sum((r) => valueOf(r.p, r.delivered));

  const usage = useMemo(
    () =>
      products
        .map((p) => {
          const perMonth = monthlyUsage(p, log);
          return { p, perMonth, suggested: suggestedMin(perMonth, cover) };
        })
        .filter((u) => u.perMonth != null)
        .sort((a, b) => (b.perMonth ?? 0) - (a.perMonth ?? 0)),
    [products, log, cover],
  );
  const changes = usage.filter((u) => u.suggested != null && u.suggested !== u.p.min);

  const exportCsv = () =>
    report &&
    download(
      `magazyn-raport-${report.date}.csv`,
      toCsv(
        [
          'Kod',
          'Nazwa',
          'Jednostka',
          `Stan ${report.prevDate ?? '—'}`,
          'Dostawy',
          'Korekty',
          'Straty',
          `Stan ${report.date}`,
          'Zużycie',
          'Zużycie / mies.',
          'Wartość zużycia netto',
          'Wartość strat netto',
        ],
        report.rows.map((r) => {
          const pm = monthlyUsage(r.p, log);
          return [
            r.p.code,
            r.p.name,
            r.p.unit,
            r.prev,
            r.delivered,
            r.adjusted,
            r.lost,
            r.cur,
            r.used,
            pm != null ? Math.round(pm * 10) / 10 : null,
            r.used != null ? Math.round(valueOf(r.p, r.used) * 100) / 100 : null,
            Math.round(valueOf(r.p, r.lost) * 100) / 100,
          ];
        }),
      ),
    );

  return (
    <div className="catalog">
      {bp !== 'phone' && <TopBar variant={bp === 'laptop' ? 'laptop' : 'tablet'} />}
      <main className="catalog__main" style={{ paddingTop: bp === 'phone' ? 8 : 20 }}>
        <div className="catalog__inner" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1100 }}>
          <div style={{ margin: '0 -8px' }}>
            <Link to="/" className="back-link">
              <Icon name="chevronLeft" size={22} />
              Magazyn
            </Link>
          </div>
          <div className="stack-2">
            <h1 className="title-xl">Raport inwentaryzacji</h1>
            <p className="subtitle subtitle--lg">Różnice względem poprzedniej inwentaryzacji, dostawy i straty w tym czasie oraz zużycie.</p>
          </div>

          {!dates.length ? (
            <div className="card card--dashed empty">
              <h2 className="empty__title empty__title--sm">Brak zakończonych inwentaryzacji</h2>
              <p className="empty__text">Raport pojawi się po pierwszej zakończonej inwentaryzacji.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
                <div className="field" style={{ gap: 4 }}>
                  <label htmlFor="rep-date" className="field__label">
                    Inwentaryzacja
                  </label>
                  <select id="rep-date" className="select" style={{ width: 200 }} value={date} onChange={(e) => setDate(e.target.value)}>
                    {dates.map((d) => (
                      <option key={d} value={d}>
                        {formatDate(d)}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="hint" style={{ paddingBottom: 14 }}>
                  {report?.prevDate
                    ? `porównanie z ${formatDate(report.prevDate)} · ${report.days} ${plural(report.days ?? 0, 'dzień', 'dni', 'dni')}`
                    : 'pierwsza inwentaryzacja'}
                </span>
                <span className="spacer" />
                <button type="button" className="btn btn--ghost btn--md" onClick={exportCsv}>
                  Eksport CSV
                </button>
              </div>

              <div className="kpis">
                <div className="kpi">
                  <span className="kpi__label">Zużycie</span>
                  <span className="kpi__value">{money(usedValue)}</span>
                  <span className="hint">netto, bez strat</span>
                </div>
                <div className="kpi">
                  <span className="kpi__label">Straty</span>
                  <span className="kpi__value" style={{ color: lostValue ? 'var(--out-bg)' : undefined }}>
                    {money(lostValue)}
                  </span>
                  <span className="hint">wyrzucone i inne</span>
                </div>
                <div className="kpi">
                  <span className="kpi__label">Dostawy</span>
                  <span className="kpi__value">{money(deliveredValue)}</span>
                  <span className="hint">w tym okresie</span>
                </div>
              </div>

              <label className="ret__check" style={{ fontSize: 14 }}>
                <input type="checkbox" checked={onlyChanges} onChange={() => setOnlyChanges(!onlyChanges)} />
                Tylko produkty ze zmianami
              </label>

              <div className="card table-wrap">
                <table className="rep">
                  <thead>
                    <tr>
                      <th>Produkt</th>
                      <th className="t-right">Było</th>
                      <th className="t-right">Dostawy</th>
                      <th className="t-right">Straty</th>
                      <th className="t-right">Jest</th>
                      <th className="t-right">Zużycie</th>
                      <th className="t-right">/ mies.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const pm = monthlyUsage(r.p, log);
                      return (
                        <tr key={r.p.id}>
                          <td>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {r.p.image && <Thumb src={r.p.image} size="xs" />}
                              <span className="stack-2">
                                <span className="t-name">{r.p.name}</span>
                                <span className="code">{r.p.code}</span>
                              </span>
                            </span>
                          </td>
                          <td className="t-num t-right">{r.prev ?? '—'}</td>
                          <td className="t-num t-right">{r.delivered ? `+${r.delivered}` : '—'}</td>
                          <td className="t-num t-right" style={{ color: r.lost ? 'var(--out-bg)' : undefined }}>
                            {r.lost ? `−${r.lost}` : '—'}
                          </td>
                          <td className="t-num t-right is-strong">{r.cur ?? '—'}</td>
                          <td className="t-num t-right is-strong">
                            {r.used ?? '—'}
                            {r.used && r.p.price ? (
                              <span className="hint" style={{ display: 'block' }}>
                                {money(valueOf(r.p, r.used))}
                              </span>
                            ) : null}
                          </td>
                          <td className="t-num t-right">{pm != null ? fmt1(pm) : '—'}</td>
                        </tr>
                      );
                    })}
                    {!rows.length && (
                      <tr>
                        <td colSpan={7} className="hint" style={{ padding: 16 }}>
                          Brak zmian w tym okresie.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <section className="stack-4" style={{ gap: 10 }}>
            <h2 className="eyebrow">Sugerowane minimum</h2>
            <p className="hint">
              Na podstawie średniego zużycia ze wszystkich inwentaryzacji. Minimum = zapas na wybraną liczbę dni (zamów, zanim spadnie poniżej).
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label htmlFor="cover" className="field__label">
                Zapas na
              </label>
              <select id="cover" className="select" style={{ width: 120 }} value={cover} onChange={(e) => setCover(Number(e.target.value))}>
                {[7, 14, 21, 30, 45].map((d) => (
                  <option key={d} value={d}>
                    {d} dni
                  </option>
                ))}
              </select>
            </div>
            {applied != null && (
              <div className="catalog__done" role="status">
                <Icon name="check" size={20} /> Ustawiono minimum dla {applied} {plural(applied, 'produktu', 'produktów', 'produktów')}.
              </div>
            )}
            {changes.length ? (
              <>
                <ul className="rows">
                  {changes.map((u) => (
                    <li key={u.p.id}>
                      <label className="draft" style={{ cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          className="draft__check"
                          checked={picked.has(u.p.id)}
                          onChange={() =>
                            setPicked((s) => {
                              const n = new Set(s);
                              if (n.has(u.p.id)) n.delete(u.p.id);
                              else n.add(u.p.id);
                              return n;
                            })
                          }
                        />
                        <span className="stack-2" style={{ flex: '1 1 180px' }}>
                          <span className="row-name draft__name">{u.p.name}</span>
                          <span className="code">
                            zużycie ≈ {fmt1(u.perMonth ?? 0)} {u.p.unit} / mies.
                          </span>
                        </span>
                        <span className="mono" style={{ fontWeight: 600 }}>
                          min {u.p.min} → {u.suggested}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn--ghost btn--md" onClick={() => setPicked(new Set(changes.map((u) => u.p.id)))}>
                    Zaznacz wszystkie ({changes.length})
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary btn--md"
                    disabled={!picked.size}
                    onClick={() => {
                      let n = 0;
                      for (const u of changes) if (picked.has(u.p.id) && u.suggested != null) updateProduct(u.p.id, { min: u.suggested }), n++;
                      setPicked(new Set());
                      setApplied(n);
                    }}
                  >
                    Ustaw zaznaczone minima ({picked.size})
                  </button>
                </div>
              </>
            ) : (
              <p className="muted" style={{ fontSize: 14 }}>
                {usage.length ? 'Obecne minima pasują do zużycia.' : 'Potrzebne są co najmniej dwie inwentaryzacje, żeby policzyć zużycie.'}
              </p>
            )}
          </section>
        </div>
      </main>
      {bp === 'phone' && <TabBar />}
    </div>
  );
}
