import { packSizeOf } from '../../lib/pack';
import { UnitFixBanner } from '../../components/UnitFix';
import { bottleQty } from '../../lib/volume';
import { useState } from 'react';
import { ScanButton, ScanDialog } from '../../components/Scanner';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { QuickAdd, CountInput, groupByCategory, Progress, SameButton, useInventory, type InventoryModel } from '../../components/Inventory';
import { TabBar } from '../../components/Shell';
import { Thumb } from '../../components/Thumb';
import { LotEditor, LotToggle } from '../../components/Lots';

/** Shown instead of the count list when the warehouse has no products. */
export function InventoryEmpty() {
  return (
    <div className="card card--18 card--dashed empty">
      <h2 className="empty__title empty__title--sm">Nie ma czego liczyć</h2>
      <p className="empty__text">Magazyn jest pusty. Dodaj produkty, a pojawią się tutaj do policzenia.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Link to="/katalog" className="btn btn--primary btn--md">
          Dodaj produkty z folderów (domyślne)
        </Link>
        <Link to="/produkt/nowy" className="btn btn--outline btn--md">
          <Icon name="plus" size={18} />
          Dodaj produkt
        </Link>
      </div>
    </div>
  );
}

export function FinishAction({ m, size, savedHref, savedLabel }: { m: InventoryModel; size: 'lg' | 'md'; savedHref: string; savedLabel: string }) {
  const cls = size === 'lg' ? 'btn btn--lg' : 'btn btn--md';
  if (!m.total && !m.saved) return null;
  if (m.saved)
    return (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link to={savedHref} className={`${cls} btn--success`}>
          <Icon name="check" size={size === 'lg' ? 20 : 18} />
          {savedLabel}
        </Link>
        <Link to="/raporty" className={`${cls} btn--ghost`}>
          Zobacz raport inwentaryzacji
        </Link>
      </span>
    );
  if (m.complete)
    return (
      <button type="button" className={`${cls} btn--primary`} onClick={m.finish}>
        Zakończ inwentaryzację
      </button>
    );
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch' }}>
      <button type="button" className={`${cls} btn--primary`} onClick={m.finish} disabled={!m.counted}>
        Zakończ i zapisz
      </button>
      <span className="hint" style={{ textAlign: 'center' }}>
        Niepoliczone: {m.left} — nie ma ich na stanie
      </span>
    </span>
  );
}

export function PhoneInventory() {
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
  const groups = groupByCategory(m.items, m.items);
  return (
    <div className="phone">
      <header className="phone__header">
        <div className="stack-2">
          <h1 className="title-xl">Inwentaryzacja</h1>
          <p className="subtitle">
            {m.today} · poprzednia {m.previous}
          </p>
        </div>
        <Progress m={m} variant="card" />
        <UnitFixBanner />
        <ScanButton onClick={() => setScanning(true)} label="Skanuj butelki (+1 za skan)" />
        <Link to="/inwentaryzacja/polki" className="catalog-cta" style={{ padding: '10px 14px' }}>
          <Icon name="shelf" size={20} />
          <span style={{ flex: 1 }}>Inwentaryzacja po półkach</span>
          <Icon name="chevronRight" size={18} />
        </Link>
      </header>
      <main className="phone__main phone__main--loose">
        <p className="muted" style={{ fontSize: 14, lineHeight: '20px' }}>
          Wpisz, ile sztuk leży na półce. „Bez zmian” przepisuje poprzedni stan.
        </p>
        {!m.total && <InventoryEmpty />}
        {groups.map((g) => (
          <section key={g.id} className="stack-4" style={{ gap: 8 }}>
            <div className="heading-row">
              <h2 className="eyebrow">{g.label}</h2>
              <span className="code">
                {g.counted}/{g.size}
              </span>
            </div>
            <ul className="rows">
              {g.items.map((p) => (
                <li key={p.id} id={`row-${p.id}`} className={`inv-row${flashId === p.id ? ' flash' : ''}`} style={{ flexWrap: 'wrap' }}>
                  {p.image && <Thumb src={p.image} size="xs" />}
                  <span className="stack-2" style={{ flex: 1 }}>
                    <label htmlFor={`inw-${p.id}`} className="row-name">
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
                      controls={`lots-${p.id}`}
                    />
                  </span>
                  {!p.uncounted && <SameButton p={p} onClick={() => m.same(p)} />}
                  <CountInput id={`inw-${p.id}`} p={p} onChange={(v) => m.set(p, v)} />
                  {m.isExpanded(p) && (
                    <LotEditor
                      id={`lots-${p.id}`}
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
      </main>
      <div className="phone__footer">
        <FinishAction m={m} size="lg" savedHref="/" savedLabel="Zapisano — nowe stany w wyszukiwarce" />
        <p className="hint hint--center">Postęp zapisuje się na bieżąco — możesz dokończyć później.</p>
      </div>
      <ScanDialog open={scanning} continuous title="Skanuj butelki" onClose={() => setScanning(false)} onProduct={onScan} />
      <TabBar />
    </div>
  );
}
