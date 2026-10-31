import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useOrderDraft, type OrderLine } from '../components/Orders';
import { SearchField } from '../components/SearchField';
import { TabBar, TopBar } from '../components/Shell';
import { StatusBadge } from '../components/Status';
import { Stepper } from '../components/Stepper';
import { Thumb } from '../components/Thumb';
import { formatDate, matches, plural, tokenize } from '../lib/text';
import type { Pending, StockedProduct } from '../lib/types';
import { useBreakpoint } from '../lib/useBreakpoint';
import { useStore, type Receipt } from '../store';

const QTY_LABELS = { dec: 'Mniej', inc: 'Więcej' };

/**
 * Zamówienia: "Do zamówienia" builds the order (auto list + manual changes) and adds it as pending;
 * "W drodze" receives deliveries — quantity, shelf and best-before date.
 */
export function OrdersScreen() {
  const bp = useBreakpoint();
  const [params, setParams] = useSearchParams();
  const tab = params.get('widok') === 'w-drodze' ? 'pending' : 'draft';
  const { pending } = useStore();
  const m = useOrderDraft();
  const [placed, setPlaced] = useState<number | null>(null);

  const setTab = (t: 'draft' | 'pending') => setParams(t === 'pending' ? { widok: 'w-drodze' } : {}, { replace: true });

  return (
    <div className="catalog">
      {bp !== 'phone' && <TopBar variant={bp === 'laptop' ? 'laptop' : 'tablet'} />}
      <header className="catalog__head" style={bp !== 'phone' ? { paddingTop: 18 } : undefined}>
        <div className="catalog__inner" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 960 }}>
          <div className="stack-2">
            <h1 className="title-xl">Zamówienia</h1>
            <p className="subtitle subtitle--lg">
              {tab === 'draft'
                ? 'Lista tworzy się sama z produktów poniżej minimum. Zmień ilości, odznacz to, czego nie zamawiasz.'
                : 'Gdy przyjdzie dostawa: wpisz ile dotarło, na którą półkę i do kiedy ważne.'}
            </p>
          </div>
          <div className="seg" role="tablist" aria-label="Widok zamówień">
            <button
              type="button"
              role="tab"
              className="seg__btn"
              style={{ flex: 1 }}
              aria-selected={tab === 'draft'}
              aria-pressed={tab === 'draft'}
              onClick={() => setTab('draft')}
            >
              Do zamówienia ({m.chosen.length})
            </button>
            <button
              type="button"
              role="tab"
              className="seg__btn"
              style={{ flex: 1 }}
              aria-selected={tab === 'pending'}
              aria-pressed={tab === 'pending'}
              onClick={() => setTab('pending')}
            >
              W drodze ({pending.length})
            </button>
          </div>
        </div>
      </header>

      <main className="catalog__main">
        <div className="catalog__inner" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 960 }}>
          {tab === 'draft' ? <DraftTab m={m} placed={placed} onShowPending={() => setTab('pending')} /> : <PendingTab />}
        </div>
      </main>

      {tab === 'draft' && (
        <footer className="catalog__foot">
          <div className="catalog__inner catalog__foot-row" style={{ maxWidth: 960 }}>
            <button type="button" className="btn btn--ghost btn--md" disabled={!m.chosen.length} onClick={m.copy}>
              <Icon name={m.copied ? 'check' : 'copy'} size={18} />
              {m.copied ? 'Skopiowano kody' : 'Kopiuj kody'}
            </button>
            <button
              type="button"
              className="btn btn--primary btn--lg catalog__submit"
              disabled={!m.chosen.length}
              onClick={() => {
                setPlaced(m.chosen.length);
                m.place();
              }}
            >
              <Icon name="truck" size={20} />
              {m.chosen.length ? `Dodaj do stanów jako oczekujące (${m.chosen.length})` : 'Nic nie zaznaczono'}
            </button>
          </div>
        </footer>
      )}
      {bp === 'phone' && <TabBar />}
    </div>
  );
}

function DraftTab({ m, placed, onShowPending }: { m: ReturnType<typeof useOrderDraft>; placed: number | null; onShowPending: () => void }) {
  return (
    <>
      {placed !== null && (
        <div className="catalog__done" role="status">
          <Icon name="check" size={20} />
          <span style={{ flex: 1 }}>
            Dodano {placed} {plural(placed, 'pozycję', 'pozycje', 'pozycji')} jako oczekujące.
          </span>
          <button type="button" className="btn btn--success" style={{ padding: '0 12px', textDecoration: 'underline' }} onClick={onShowPending}>
            W drodze
          </button>
        </div>
      )}

      {m.groups.map((g) => (
        <section key={g.key} className="stack-4" style={{ gap: 8 }}>
          <div className="order-group__head">
            {g.status && <StatusBadge p={g.status} />}
            <h2 className="eyebrow">
              {g.label} · {g.items.length}
            </h2>
          </div>
          <ul className="rows">
            {g.items.map((l) => (
              <DraftRow key={l.p.id} l={l} m={m} />
            ))}
          </ul>
        </section>
      ))}

      {!m.lines.length && (
        <div className="card empty">
          <h2 className="empty__title empty__title--sm">Nic nie trzeba zamawiać</h2>
          <p className="empty__text">Wszystkie produkty są powyżej minimum (z uwzględnieniem tego, co jest w drodze). Możesz dopisać coś ręcznie poniżej.</p>
        </div>
      )}

      <AddExtra m={m} />

      {m.chosen.length > 0 && (
        <section className="stack-4" style={{ gap: 8 }}>
          <div className="heading-row">
            <h2 className="eyebrow">Kody do zamówienia</h2>
            <span className="hint">kod ⇥ ilość — wklej do maila lub arkusza</span>
          </div>
          <pre className="codes" aria-label="Lista kodów i ilości">
            {m.codesText}
          </pre>
        </section>
      )}
    </>
  );
}

function DraftRow({ l, m }: { l: OrderLine; m: ReturnType<typeof useOrderDraft> }) {
  const p = l.p;
  const id = `ord-${p.id}`;
  return (
    <li className={`draft${l.include ? '' : ' is-skipped'}`}>
      <input
        id={id}
        type="checkbox"
        className="draft__check"
        checked={l.include}
        onChange={() => m.edit(l, { include: !l.include })}
        aria-label={`Zamów: ${p.name}`}
      />
      {p.image && <Thumb src={p.image} />}
      <label htmlFor={id} className="stack-2 draft__info">
        <span className="row-name draft__name">{p.name}</span>
        <span className="code">
          {p.code} · masz {p.qty} / min {p.min}
          {p.incoming ? ` · w drodze ${p.incoming}` : ''}
        </span>
      </label>
      <div className="draft__qty">
        <Stepper id={`${id}-q`} value={l.qty} small unit={p.unit} label={QTY_LABELS} onChange={(v) => m.edit(l, { qty: Number(v) || 0, include: true })} />
        {l.extra && (
          <button type="button" className="icon-btn icon-btn--muted" aria-label={`Usuń z zamówienia: ${p.name}`} onClick={() => m.remove(l)}>
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
    </li>
  );
}

function AddExtra({ m }: { m: ReturnType<typeof useOrderDraft> }) {
  const { products } = useStore();
  const [q, setQ] = useState('');
  const hits = useMemo(() => {
    const t = tokenize(q);
    if (!t.length) return [];
    return products.filter((p) => !m.inList(p.id) && matches(t, p.name, p.code)).slice(0, 6);
  }, [q, products, m]);
  return (
    <section className="stack-4" style={{ gap: 8 }}>
      <h2 className="eyebrow">Dopisz inny produkt</h2>
      <SearchField id="ord-add" size="filter" value={q} onChange={setQ} placeholder="Nazwa lub kod produktu z magazynu" label="Dopisz produkt do zamówienia" />
      {hits.length > 0 && (
        <ul className="rows">
          {hits.map((p: StockedProduct) => (
            <li key={p.id}>
              <button
                type="button"
                className="row-link"
                style={{ minHeight: 56 }}
                onClick={() => {
                  m.addExtra(p);
                  setQ('');
                }}
              >
                {p.image && <Thumb src={p.image} size="xs" />}
                <span className="stack-2" style={{ flex: 1 }}>
                  <span className="row-name" style={{ fontSize: 15 }}>
                    {p.name}
                  </span>
                  <span className="code">
                    {p.code} · masz {p.qty} {p.unit}
                  </span>
                </span>
                <span className="btn btn--ghost" style={{ minHeight: 36, fontSize: 14 }}>
                  <Icon name="plus" size={16} />
                  Dodaj
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim() && !hits.length && <p className="hint">Brak pasujących produktów (albo już są na liście).</p>}
    </section>
  );
}

function lastShelf(p: StockedProduct | undefined): string {
  const lots = p?.lots ?? [];
  return [...lots].reverse().find((l) => l.shelf)?.shelf ?? '';
}

function PendingTab() {
  const { pending, byId, receive, cancelPending } = useStore();
  const [forms, setForms] = useState<Record<string, Receipt[]>>({});
  const [received, setReceived] = useState<string[]>([]);
  const partsFor = (x: Pending): Receipt[] => forms[x.id] ?? [{ qty: x.qty, shelf: lastShelf(byId(x.productId)), expiresAt: '' }];
  const setParts = (x: Pending, parts: Receipt[]) => setForms((f) => ({ ...f, [x.id]: parts }));
  const setPart = (x: Pending, i: number, patch: Partial<Receipt>) => setParts(x, partsFor(x).map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const byDay = new Map<string, Pending[]>();
  for (const x of [...pending].sort((a, b) => (a.orderedAt < b.orderedAt ? 1 : -1))) {
    const day = x.orderedAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), x]);
  }

  const take = (x: Pending) => {
    const p = byId(x.productId);
    const parts = partsFor(x).filter((r) => r.qty > 0);
    receive(x.id, parts);
    setForms((f) => {
      const { [x.id]: _done, ...rest } = f;
      return rest;
    });
    const lines = parts.map(
      (r) =>
        `${p?.name ?? x.productId}: +${r.qty} ${p?.unit ?? ''}${r.shelf ? ` → półka ${r.shelf}` : ''}${r.expiresAt ? ` · do ${formatDate(r.expiresAt)}` : ''}`,
    );
    setReceived((prev) => [...lines, ...prev].slice(0, 8));
  };

  /** "Podziel na partie": take one unit (or what's left) off the last part into a new part. */
  const split = (x: Pending) => {
    const parts = partsFor(x);
    const sum = parts.reduce((s, r) => s + r.qty, 0);
    const last = parts[parts.length - 1];
    if (sum < x.qty) return setParts(x, [...parts, { qty: x.qty - sum, shelf: last.shelf, expiresAt: '' }]);
    if (last.qty <= 1) return setParts(x, [...parts, { qty: 0, shelf: last.shelf, expiresAt: '' }]);
    const moveQty = Math.floor(last.qty / 2);
    setParts(x, [...parts.slice(0, -1), { ...last, qty: last.qty - moveQty }, { qty: moveQty, shelf: last.shelf, expiresAt: '' }]);
  };

  return (
    <>
      {received.length > 0 && (
        <div className="catalog__done" role="status" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Icon name="check" size={20} /> Przyjęto na stan
          </span>
          <ul style={{ fontWeight: 500, fontSize: 14 }}>
            {received.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {!pending.length && (
        <div className="card empty">
          <h2 className="empty__title empty__title--sm">Nic nie czeka na dostawę</h2>
          <p className="empty__text">Pozycje pojawią się tutaj po kliknięciu „Dodaj do stanów jako oczekujące” w zakładce Do zamówienia.</p>
        </div>
      )}
      {[...byDay.entries()].map(([day, items]) => (
        <section key={day} className="stack-4" style={{ gap: 8 }}>
          <h2 className="eyebrow">
            Zamówione {formatDate(day)} · {items.length}
          </h2>
          <ul className="return-list">
            {items.map((x) => {
              const p = byId(x.productId);
              if (!p) return null;
              const parts = partsFor(x);
              const sum = parts.reduce((s, r) => s + r.qty, 0);
              const many = parts.length > 1;
              return (
                <li key={x.id} className="card card--16 ret">
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {p.image && <Thumb src={p.image} />}
                    <span className="stack-2" style={{ flex: 1 }}>
                      <span className="row-name">{p.name}</span>
                      <span className="code">
                        {p.code} · zamówiono {x.qty} {p.unit} · na stanie {p.qty}
                      </span>
                    </span>
                    <span className="badge is-new">Oczekuje</span>
                  </div>

                  {parts.map((f, i) => (
                    <div key={i} className={many ? 'part' : undefined}>
                      {many && (
                        <div className="heading-row" style={{ alignItems: 'center' }}>
                          <span className="eyebrow eyebrow--sm">Partia {i + 1}</span>
                          <button
                            type="button"
                            className="icon-btn icon-btn--muted"
                            aria-label={`Usuń partię ${i + 1}`}
                            onClick={() => {
                              const rest = parts.filter((_, j) => j !== i);
                              rest[Math.max(0, i - 1)] = { ...rest[Math.max(0, i - 1)], qty: rest[Math.max(0, i - 1)].qty + f.qty };
                              setParts(x, rest);
                            }}
                          >
                            <Icon name="close" size={16} />
                          </button>
                        </div>
                      )}
                      <div className="ret__grid">
                        <div className="field" style={{ gap: 4 }}>
                          <label htmlFor={`rq-${x.id}-${i}`} className="field__label">
                            {many ? 'Ilość' : 'Dostarczono'}
                          </label>
                          <Stepper id={`rq-${x.id}-${i}`} value={f.qty} small unit={p.unit} label={QTY_LABELS} onChange={(v) => setPart(x, i, { qty: Number(v) || 0 })} />
                        </div>
                        <div className="field" style={{ gap: 4 }}>
                          <label htmlFor={`rs-${x.id}-${i}`} className="field__label">
                            Półka
                          </label>
                          <input
                            id={`rs-${x.id}-${i}`}
                            className="input input--mono"
                            list="shelf-options"
                            autoComplete="off"
                            placeholder="np. A2"
                            value={f.shelf ?? ''}
                            onChange={(e) => setPart(x, i, { shelf: e.target.value })}
                          />
                        </div>
                        <div className="field" style={{ gap: 4 }}>
                          <label htmlFor={`re-${x.id}-${i}`} className="field__label">
                            Data ważności
                          </label>
                          <input id={`re-${x.id}-${i}`} className="input" type="date" value={f.expiresAt ?? ''} onChange={(e) => setPart(x, i, { expiresAt: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="heading-row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <button type="button" className="btn btn--ghost" onClick={() => split(x)}>
                      <Icon name="plus" size={16} />
                      Podziel na partie
                    </button>
                    <span className="hint" style={sum < x.qty ? { color: '#8a5a00', fontWeight: 600 } : sum > x.qty ? { color: 'var(--out-bg)', fontWeight: 600 } : undefined}>
                      {sum < x.qty
                        ? `Razem ${sum} z ${x.qty} — brakujące ${x.qty - sum} ${p.unit} zostaną jako oczekujące`
                        : sum > x.qty
                          ? `Razem ${sum} — więcej niż zamówiono (${x.qty})`
                          : many
                            ? `Razem ${sum} z ${x.qty}`
                            : 'Różne daty lub półki? Podziel na partie.'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn--quiet"
                      onClick={() => window.confirm(`Anulować oczekujące: ${p.name} (${x.qty} ${p.unit})?`) && cancelPending(x.id)}
                    >
                      Anuluj zamówienie
                    </button>
                    <button type="button" className="btn btn--primary btn--md" disabled={sum <= 0} onClick={() => take(x)}>
                      <Icon name="check" size={18} />
                      Przyjmij {sum} {p.unit}
                      {many ? ` (${parts.filter((r) => r.qty > 0).length} partie)` : ''}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
