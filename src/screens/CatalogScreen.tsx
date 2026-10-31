import { useMemo, useState } from 'react';
import { money } from '../lib/money';
import { Link, useNavigate } from 'react-router-dom';
import { CategoryChips, type CatFilter } from '../components/CategoryChips';
import { Icon } from '../components/Icon';
import { SearchField } from '../components/SearchField';
import { MIN_LABELS, Stepper } from '../components/Stepper';
import { Thumb } from '../components/Thumb';
import { UNITS } from '../lib/catalog';
import { countProducts, matches, plural, tokenize } from '../lib/text';
import type { CatalogItem, Unit } from '../lib/types';
import { useCatalog } from '../lib/useCatalog';
import { useStore } from '../store';

const BRANDS = ['1883 Maison Routin', 'Lord of Taste', 'Artonic'] as const;
type BrandFilter = 'all' | (typeof BRANDS)[number];
const BRAND_LABEL: Record<BrandFilter, string> = { all: 'Wszystkie marki', '1883 Maison Routin': '1883', 'Lord of Taste': 'Lord of Taste', Artonic: 'Artonic' };

/** "Dodaj produkty z folderów" — pick products from the supplier folders and add them to the warehouse. */
export function CatalogScreen() {
  const { items, error, retry } = useCatalog();
  const { products, addFromCatalog } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState<BrandFilter>('all');
  const [cat, setCat] = useState<CatFilter>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [min, setMin] = useState('2');
  const [unit, setUnit] = useState<Unit>('szt.');
  const [added, setAdded] = useState<number | null>(null);

  const inStock = useMemo(() => new Set(products.map((p) => p.catalogId).filter(Boolean)), [products]);
  const tokens = tokenize(query);
  const byBrand = (items ?? []).filter((i) => brand === 'all' || i.brand === brand);
  const matched = byBrand.filter((i) => matches(tokens, i.name, i.code, i.brand, i.size));
  const visible = cat === 'all' ? matched : matched.filter((i) => i.cat === cat);
  const selectable = visible.filter((i) => !inStock.has(i.id));
  const allVisiblePicked = selectable.length > 0 && selectable.every((i) => picked.has(i.id));
  const pickedItems = (items ?? []).filter((i) => picked.has(i.id) && !inStock.has(i.id));

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleVisible = () =>
    setPicked((s) => {
      const n = new Set(s);
      selectable.forEach((i) => (allVisiblePicked ? n.delete(i.id) : n.add(i.id)));
      return n;
    });
  const submit = () => {
    if (!pickedItems.length) return;
    const n = addFromCatalog(pickedItems, { min: Math.max(0, Number(min) || 0), unit });
    setPicked(new Set());
    setAdded(n);
  };

  return (
    <div className="catalog">
      <header className="catalog__head">
        <div className="catalog__inner" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '0 -8px' }}>
            <button type="button" className="back-link" style={{ border: 0, background: 'none', color: 'var(--accent)' }} onClick={() => navigate(-1)}>
              <Icon name="chevronLeft" size={22} />
              Wróć
            </button>
          </div>
          <div className="stack-2">
            <h1 className="title-xl">Dodaj produkty z folderów</h1>
            <p className="subtitle subtitle--lg">
              Domyślna lista: 1883 Maison Routin (cennik 03/2026) i Lord of Taste (folder 10/2026)
              {items ? ` · ${countProducts(items.length)}` : ''}
            </p>
          </div>
          <SearchField id="kat-szukaj" value={query} onChange={setQuery} placeholder="Nazwa, smak lub kod, np. karmel" label="Szukaj w folderach" size="md" />
          <div className="chips chips--scroll chips--sm" style={{ ['--chips-bleed' as string]: 'var(--catalog-gutter)' }}>
            {(['all', ...BRANDS] as BrandFilter[]).map((b) => (
              <button key={b} type="button" className="chip" aria-pressed={brand === b} onClick={() => setBrand(b)}>
                {BRAND_LABEL[b]}
                <span className="chip__n">{(items ?? []).filter((i) => b === 'all' || i.brand === b).length}</span>
              </button>
            ))}
          </div>
          <div style={{ ['--chips-bleed' as string]: 'var(--catalog-gutter)' }}>
            <CategoryChips value={cat} onChange={setCat} matched={matched} layout="scroll" small />
          </div>
        </div>
      </header>

      <main className="catalog__main">
        <div className="catalog__inner" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {added !== null && (
            <div className="catalog__done" role="status">
              <Icon name="check" size={20} />
              <span style={{ flex: 1 }}>
                {added ? `Dodano ${countProducts(added)} do magazynu. Stan 0 — policz je w najbliższej inwentaryzacji.` : 'Te produkty są już w magazynie.'}
              </span>
              <Link to="/" className="btn btn--success" style={{ padding: '0 12px', textDecoration: 'underline' }}>
                Do magazynu
              </Link>
            </div>
          )}

          {error && (
            <div className="card empty">
              <p className="empty__text">{error}</p>
              <button type="button" className="btn btn--outline btn--md" onClick={retry}>
                Spróbuj ponownie
              </button>
            </div>
          )}
          {!items && !error && (
            <p className="muted" role="status">
              Wczytywanie listy…
            </p>
          )}

          {items && (
            <div className="heading-row" style={{ alignItems: 'center' }}>
              <h2 className="eyebrow">
                {visible.length} {plural(visible.length, 'pozycja', 'pozycje', 'pozycji')}
                {visible.length !== selectable.length ? ` · ${visible.length - selectable.length} już w magazynie` : ''}
              </h2>
              {selectable.length > 0 && (
                <button type="button" className="link-btn" style={{ fontSize: 14 }} onClick={toggleVisible}>
                  {allVisiblePicked ? 'Odznacz widoczne' : `Zaznacz widoczne (${selectable.length})`}
                </button>
              )}
            </div>
          )}

          {items && visible.length === 0 && (
            <div className="card card--dashed empty">
              <h2 className="empty__title empty__title--sm">Nic nie pasuje</h2>
              <p className="empty__text">Zmień wyszukiwanie albo filtr marki i kategorii.</p>
            </div>
          )}

          <ul className="catalog__grid">
            {visible.map((i) => (
              <CatalogRow key={i.id} item={i} have={inStock.has(i.id)} checked={picked.has(i.id)} onToggle={() => toggle(i.id)} />
            ))}
          </ul>
        </div>
      </main>

      <footer className="catalog__foot">
        <div className="catalog__inner catalog__foot-row">
          <div className="catalog__opts">
            <div className="field" style={{ gap: 4 }}>
              <label htmlFor="kat-min" className="hint" style={{ fontWeight: 600, color: 'var(--ink)' }}>
                Minimum dla nowych
              </label>
              <Stepper id="kat-min" value={min} onChange={setMin} small label={MIN_LABELS} />
            </div>
            <div className="field" style={{ gap: 4 }}>
              <label htmlFor="kat-jm" className="hint" style={{ fontWeight: 600, color: 'var(--ink)' }}>
                Licz w
              </label>
              <select id="kat-jm" className="select" style={{ height: 44, width: 96 }} value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="button" className="btn btn--primary btn--lg catalog__submit" disabled={!pickedItems.length} onClick={submit}>
            <Icon name="plus" size={20} />
            {pickedItems.length ? `Dodaj zaznaczone (${pickedItems.length})` : 'Zaznacz produkty'}
          </button>
        </div>
      </footer>
    </div>
  );
}

function CatalogRow({ item, have, checked, onToggle }: { item: CatalogItem; have: boolean; checked: boolean; onToggle: () => void }) {
  const id = `kat-${item.id}`;
  return (
    <li className={`catalog__item${checked ? ' is-on' : ''}${have ? ' is-have' : ''}`}>
      <label htmlFor={id} className="catalog__label">
        <input id={id} type="checkbox" checked={have || checked} disabled={have} onChange={onToggle} />
        <Thumb src={item.image} size="md" />
        <span className="stack-2" style={{ flex: 1 }}>
          <span className="catalog__name">{item.name}</span>
          <span className="code">
            {item.code} · {item.size}
            {item.price ? ` · ${money(item.price)} netto` : ''}
          </span>
          {have && (
            <span className="badge is-ok" style={{ alignSelf: 'flex-start', marginTop: 4 }}>
              W magazynie
            </span>
          )}
        </span>
      </label>
    </li>
  );
}
