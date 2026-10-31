import { Link } from 'react-router-dom';
import { bottleQty } from '../../lib/volume';
import { ScanButton, ScanDialog } from '../../components/Scanner';
import { packSizeOf } from '../../lib/pack';
import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { QuickAdd, CountInput, groupByCategory, Progress, SameButton, Segmented, useInventory } from '../../components/Inventory';
import { SearchField } from '../../components/SearchField';
import { TopBar } from '../../components/Shell';
import { Thumb } from '../../components/Thumb';
import { LotEditor, LotToggle } from '../../components/Lots';
import { formatDiff, matches, tokenize } from '../../lib/text';
import { FinishAction, InventoryEmpty } from '../phone/Inventory';

export function TabletInventory() {
  const m = useInventory();
  const [scanning, setScanning] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const onScan = (p: { id: string; name: string }) => {
    const it = m.items.find((x) => x.id === p.id);
    if (!it) return `${p.name} — nie ma go w inwentaryzacji`;
    m.addBottle(it);
    setFlashId(p.id);
    document.getElementById(`row-${p.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return `${p.name}: +1 pełna butelka`;
  };
  const visible = m.filter === 'todo' ? m.items.filter((p) => m.todoIds.includes(p.id)) : m.items;
  const groups = groupByCategory(m.items, visible);
  const todoDone = m.filter === 'todo' && visible.every((p) => p.counted);

  return (
    <div className="wide">
      <TopBar variant="tablet" />
      <ScanDialog open={scanning} continuous title="Skanuj butelki" onClose={() => setScanning(false)} onProduct={onScan} />
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 16, padding: '22px 24px 14px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div className="stack-2">
            <h1 className="title-lg">Inwentaryzacja</h1>
            <p className="subtitle subtitle--lg">
              {m.today} · poprzednia {m.previous}
            </p>
          </div>
          <div style={{ flex: 'none', width: 300 }}>
            <Progress m={m} variant="plain" />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Segmented m={m} />
          <ScanButton onClick={() => setScanning(true)} label="Skanuj butelki" />
          <Link to="/inwentaryzacja/polki" className="btn btn--ghost btn--r12">
            <Icon name="shelf" size={18} />
            Po półkach
          </Link>
          <p className="muted" style={{ fontSize: 14, lineHeight: '20px', textAlign: 'right' }}>
            „Bez zmian” przepisuje poprzedni stan, − / + liczą od niego.
          </p>
        </div>
      </div>
      <main className="scroll" style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '6px 24px 24px' }}>
        {!m.total && <InventoryEmpty />}
        {groups.map((g) => (
          <section key={g.id} style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="heading-row">
              <h2 className="eyebrow">{g.label}</h2>
              <span className="code">
                {g.counted}/{g.size}
              </span>
            </div>
            <ul className="inv-grid">
              {g.items.map((p) => (
                <li
                  key={p.id}
                  id={`row-${p.id}`}
                  className={`${flashId === p.id ? 'flash ' : ''}inv-card${p.counted ? ' is-filled' : ''}`}
                  style={m.isExpanded(p) ? { gridColumn: '1 / -1' } : undefined}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {p.image && <Thumb src={p.image} size="sm" />}
                    <div className="stack-2">
                      <label htmlFor={`tinw-${p.id}`} className="row-name">
                        {p.name}
                      </label>
                      <span className="code">
                        {p.code} · {p.uncounted ? 'nowy' : `poprz. ${p.prev}`}
                      </span>
                      <QuickAdd m={m} p={p} />
                      <LotToggle
                        lots={p.countLots}
                        packSize={packSizeOf(p)}
                        open={m.isExpanded(p)}
                        onClick={() => m.toggleExpanded(p)}
                        controls={`tlots-${p.id}`}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="stepper__btn"
                      aria-label={`Odejmij ${bottleQty(p) > 1 ? 'butelkę' : '1'}: ${p.name}`}
                                            onClick={() => m.step(p, -1)}
                    >
                      <Icon name="minus" size={20} />
                    </button>
                    <CountInput id={`tinw-${p.id}`} p={p} onChange={(v) => m.set(p, v)} />
                    <button
                      type="button"
                      className="stepper__btn"
                      aria-label={`Dodaj ${bottleQty(p) > 1 ? 'butelkę' : '1'}: ${p.name}`}
                                            onClick={() => m.step(p, 1)}
                    >
                      <Icon name="plus" size={20} />
                    </button>
                    <span className="spacer" />
                    {!p.uncounted && <SameButton p={p} variant="tablet" onClick={() => m.same(p)} />}
                  </div>
                  {m.isExpanded(p) && (
                    <LotEditor
                      id={`tlots-${p.id}`}
                      lots={p.countLots}
                      prevLots={p.prevLots}
                      unit={p.unit}
                      packSize={packSizeOf(p)}
                      count={Number(p.val) || 0}
                      bottle={bottleQty(p)}
                      onChange={(l) => m.setLots(p, l)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {todoDone && (
          <div
            style={{
              flex: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 12,
              padding: 24,
              borderRadius: 16,
              background: 'var(--ok-bg)',
              color: 'var(--ok-ink)',
            }}
          >
            <p style={{ fontSize: 18, lineHeight: '24px', fontWeight: 700 }}>Wszystko z tej listy policzone</p>
            <button type="button" className="btn" style={{ borderColor: 'var(--ok-ink)', color: 'var(--ok-ink)' }} onClick={m.showAll}>
              Pokaż wszystkie
            </button>
          </div>
        )}
      </main>
      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '14px 24px 18px',
          background: 'var(--bg)',
          borderTop: '1px solid var(--line)',
        }}
      >
        <p className="muted" style={{ flex: 1, fontSize: 14, lineHeight: '20px' }}>
          Postęp zapisuje się na bieżąco — możesz dokończyć później.
        </p>
        <FinishAction m={m} size="lg" savedHref="/" savedLabel="Zapisano — zobacz stany" />
      </div>
    </div>
  );
}

export function LaptopInventory() {
  const m = useInventory();
  const [scanning, setScanning] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const onScan = (p: { id: string; name: string }) => {
    const it = m.items.find((x) => x.id === p.id);
    if (!it) return `${p.name} — nie ma go w inwentaryzacji`;
    m.addBottle(it);
    setFlashId(p.id);
    document.getElementById(`row-${p.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return `${p.name}: +1 pełna butelka`;
  };
  const [query, setQuery] = useState('');
  const tokens = tokenize(query);
  const visible = m.items.filter((p) => (m.filter !== 'todo' || m.todoIds.includes(p.id)) && matches(tokens, p.name, p.code));
  const groups = groupByCategory(m.items, visible);

  return (
    <div className="wide">
      <TopBar variant="laptop" />
      <ScanDialog open={scanning} continuous title="Skanuj butelki" onClose={() => setScanning(false)} onProduct={onScan} />
      <div className="scroll">
        <div className="page page--narrow" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px 32px' }}>
            <div className="stack-2">
              <h1 className="title-md">Inwentaryzacja</h1>
              <p className="subtitle subtitle--lg">
                {m.today} · poprzednia {m.previous} · postęp zapisuje się na bieżąco
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px 20px' }}>
              <div style={{ width: 240 }}>
                <Progress m={m} variant="sm" />
              </div>
              <FinishAction m={m} size="md" savedHref="/" savedLabel="Zapisano — zobacz stany" />
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 16px' }}>
            <Segmented m={m} small />
            <ScanButton onClick={() => setScanning(true)} label="Skanuj butelki" />
            <Link to="/inwentaryzacja/polki" className="btn btn--ghost">
              <Icon name="shelf" size={18} />
              Po półkach
            </Link>
            <SearchField
              id="li-filtr"
              size="filter"
              value={query}
              onChange={setQuery}
              placeholder="Filtruj po nazwie lub kodzie"
              label="Filtruj listę po nazwie lub kodzie"
              style={{ flex: '0 1 320px', minWidth: 220 }}
            />
            <span className="hint">Tab przechodzi do następnego pola · „Bez zmian” wpisuje poprzedni stan</span>
          </div>
          {!m.total && <InventoryEmpty />}
          <div className="card table-wrap" hidden={!m.total}>
            <div className="table--inv">
              <div aria-hidden="true" className="trow trow--head trow--inv">
                <span>Produkt</span>
                <span>Kod</span>
                <span className="t-right">Poprzednio</span>
                <span className="t-center">Policzone</span>
                <span className="t-right">Różnica</span>
                <span />
              </div>
              {groups.map((g) => (
                <section key={g.id}>
                  <div className="inv-group-head">
                    <h2 className="eyebrow eyebrow--strong" style={{ fontWeight: 700 }}>
                      {g.label}
                    </h2>
                    <span className="code">
                      policzone {g.counted}/{g.size}
                    </span>
                  </div>
                  <ul>
                    {g.items.map((p) => (
                      <li key={p.id} id={`row-${p.id}`} className={`inv-line${flashId === p.id ? ' flash' : ''}`}>
                        <div className="trow trow--inv">
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {p.image && <Thumb src={p.image} size="xs" />}
                            <span className="stack-2">
                              <label htmlFor={`linw-${p.id}`} className="t-name">
                                {p.name}
                              </label>
                              <QuickAdd m={m} p={p} />
                              <LotToggle
                                lots={p.countLots}
                                packSize={packSizeOf(p)}
                                open={m.isExpanded(p)}
                                onClick={() => m.toggleExpanded(p)}
                                controls={`llots-${p.id}`}
                              />
                            </span>
                          </span>
                          <span className="code">{p.code}</span>
                          <span className="t-num t-right" style={{ color: 'var(--ink-2)' }}>
                            {p.uncounted ? '—' : `${p.prev} ${p.unit}`}
                          </span>
                          <span style={{ display: 'flex', justifyContent: 'center' }}>
                            <CountInput id={`linw-${p.id}`} p={p} onChange={(v) => m.set(p, v)} />
                          </span>
                          <span className={`t-num t-right ${p.diff ? 'is-strong' : 'is-quiet'}`}>{p.diff === null ? '—' : formatDiff(p.diff)}</span>
                          <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            {!p.uncounted && <SameButton p={p} variant="laptop" onClick={() => m.same(p)} />}
                          </span>
                        </div>
                        {m.isExpanded(p) && (
                          <div style={{ padding: '0 16px 12px' }}>
                            <LotEditor
                              id={`llots-${p.id}`}
                              lots={p.countLots}
                              prevLots={p.prevLots}
                              unit={p.unit}
                              packSize={packSizeOf(p)}
                              count={Number(p.val) || 0}
                              bottle={bottleQty(p)}
                              onChange={(l) => m.setLots(p, l)}
                            />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {groups.length === 0 && m.total > 0 && (
                <p className="empty__text" style={{ padding: '28px 16px' }}>
                  {tokens.length ? `Nic nie pasuje do „${query.trim()}”.` : 'Wszystko z tej listy jest już policzone.'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
