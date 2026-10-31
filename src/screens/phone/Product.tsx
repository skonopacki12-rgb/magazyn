import { volumeOf } from '../../lib/volume';
import { money } from '../../lib/money';
import { packSizeOf } from '../../lib/pack';
import { useEffect, useState } from 'react';
import { IncomingNote } from '../../components/Incoming';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { History } from '../../components/History';
import { Icon } from '../../components/Icon';
import { draftToProduct, emptyDraft, ProductFields, type Draft } from '../../components/ProductForm';
import { Qty, StatusBand } from '../../components/Status';
import { Thumb } from '../../components/Thumb';
import { LotsList } from '../../components/Lots';
import { catLabel } from '../../lib/catalog';
import { withStatus } from '../../lib/stock';
import { formatDate } from '../../lib/text';
import { useStore } from '../../store';

export function PhoneProduct({ isNew }: { isNew?: boolean }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { byId, updateProduct, addProduct, archiveProduct, state } = useStore();
  const stored = isNew ? undefined : byId(id);
  const [draft, setDraft] = useState<Draft>(() =>
    stored
      ? {
          name: stored.name,
          code: stored.code,
          cat: stored.cat,
          unit: stored.unit,
          min: String(stored.min),
          packSize: packSizeOf(stored) ? String(packSizeOf(stored)) : '',
          volume: volumeOf(stored) ? String(volumeOf(stored)!.value) : '',
          volumeUnit: volumeOf(stored)?.unit,
          price: stored.price != null ? String(stored.price).replace('.', ',') : '',
          ean: stored.ean ?? '',
        }
      : emptyDraft({ name: params.get('nazwa') ?? '' }),
  );
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(false);
  useEffect(() => setErr(false), [draft.name]);

  if (!isNew && !stored) return <Navigate to="/" replace />;

  const edit = (d: Draft) => {
    setDraft(d);
    setSaved(false);
  };
  // Live preview: status band and history react to the edited minimum before saving.
  const preview = stored
    ? withStatus({ ...stored, ...draftToProduct(draft), code: draft.code || stored.code, name: draft.name || stored.name }, stored.incoming)
    : null;

  const save = () => {
    const d = draftToProduct(draft);
    if (!d.name) return setErr(true);
    if (stored) {
      updateProduct(stored.id, { ...d, code: d.code || stored.code });
      setSaved(true);
    } else {
      const newId = addProduct(d);
      navigate(`/produkt/${encodeURIComponent(newId)}`, { replace: true });
    }
  };

  return (
    <div className="phone" style={{ height: 'auto', minHeight: '100dvh', overflow: 'visible' }}>
      <header style={{ flex: 'none', display: 'flex', alignItems: 'center', padding: '8px 8px 0' }}>
        <Link to="/" className="back-link">
          <Icon name="chevronLeft" size={22} />
          Magazyn
        </Link>
      </header>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, padding: '8px 16px 20px' }}>
        {isNew && (
          <Link to="/katalog" className="catalog-cta">
            <Icon name="clipboard" size={22} />
            <span style={{ flex: 1 }}>
              Dodaj produkty z folderów (domyślne)
              <br />
              <span className="hint">1883 i Lord of Taste — ze zdjęciami i kodami</span>
            </span>
            <Icon name="chevronRight" size={20} />
          </Link>
        )}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {preview?.image && <Thumb src={preview.image} size="lg" />}
          <div className="stack-4">
            <h1 className="title-md">{isNew ? 'Nowy produkt' : preview!.name}</h1>
            {preview && (
              <span className="code code--lg">
                {preview.code} · {catLabel(preview.cat)}
              </span>
            )}
            {preview?.brand && (
              <span className="subtitle">
                {preview.brand} · {preview.size}
                {preview.price ? ` · ${money(preview.price)} netto` : ''}
              </span>
            )}
          </div>
        </div>

        {preview && (
          <section aria-label="Stan magazynowy" className="card card--16" style={{ display: 'flex', flexDirection: 'column' }}>
            <StatusBand p={preview} variant="flush" />
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, padding: '14px 16px 16px' }}>
              <div className="stack-2">
                <span className="subtitle">{preview.uncounted ? 'Jeszcze nie liczony' : `Stan z ${formatDate(state.lastCount)}`}</span>
                <Qty n={preview.qty} unit={preview.unit} size={48} unitSize={16} />
              </div>
              <span className="muted" style={{ fontSize: 14, lineHeight: '20px', textAlign: 'right' }}>
                minimum {preview.min} {preview.unit}
              </span>
            </div>
          </section>
        )}

        {preview && <IncomingNote p={preview} />}
        {preview && <LotsList lots={preview.lots ?? []} unit={preview.unit} />}

        <section className="stack-4" style={{ gap: 14 }}>
          <h2 className="eyebrow">Dane produktu</h2>
          <ProductFields
            idPrefix="f"
            draft={draft}
            onChange={edit}
            layout="phone"
            placeholders={isNew}
            minHint={<p className="hint">Gdy stan spadnie poniżej tej liczby, produkt trafi na listę „Do zamówienia”.</p>}
          />
          {err && <p className="form-error">Podaj nazwę produktu.</p>}
          {isNew && <p className="hint">Nowy produkt ma stan 0, dopóki nie policzysz go w inwentaryzacji.</p>}
        </section>

        {preview && (
          <History
            p={preview}
            variant="list"
            emptyText={<p className="empty__text">Nie był jeszcze liczony — stan pojawi się po najbliższej inwentaryzacji.</p>}
          />
        )}
      </main>
      <div className="phone__footer phone__footer--last" style={{ position: 'sticky', bottom: 0 }}>
        {saved ? (
          <button type="button" className="btn btn--lg btn--success" onClick={save}>
            <Icon name="check" size={20} />
            Zapisano
          </button>
        ) : (
          <button type="button" className="btn btn--lg btn--primary" onClick={save}>
            {isNew ? 'Dodaj produkt' : 'Zapisz zmiany'}
          </button>
        )}
        {stored && (
          <button
            type="button"
            className="btn btn--quiet btn--r12"
            onClick={() => {
              archiveProduct(stored.id);
              navigate('/', { replace: true });
            }}
          >
            Archiwizuj produkt
          </button>
        )}
      </div>
    </div>
  );
}
