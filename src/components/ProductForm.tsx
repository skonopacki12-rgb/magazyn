import { CATEGORIES, UNITS } from '../lib/catalog';
import type { Category, Unit } from '../lib/types';
import type { ProductDraft } from '../store';
import { MIN_LABELS, Stepper } from './Stepper';

export type Draft = Omit<ProductDraft, 'min'> & { min: string };

export function emptyDraft(partial?: Partial<Draft>): Draft {
  return { name: '', code: '', cat: 'syropy', unit: 'szt.', min: '2', ...partial };
}

export function draftToProduct(d: Draft): ProductDraft {
  return { ...d, name: d.name.trim(), code: d.code.trim().toUpperCase(), min: Math.max(0, Number(d.min) || 0) };
}

interface Props {
  idPrefix: string;
  draft: Draft;
  onChange: (d: Draft) => void;
  /** phone: stacked, 48px; tablet: code+category / unit+min in 2 columns; compact: laptop aside, 44px. */
  layout: 'phone' | 'tablet' | 'compact';
  placeholders?: boolean;
  minHint?: React.ReactNode;
}

export function ProductFields({ idPrefix, draft, onChange, layout, placeholders = true, minHint }: Props) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });
  const id = (s: string) => `${idPrefix}-${s}`;

  const name = (
    <div className="field">
      <label htmlFor={id('nazwa')} className="field__label">
        Nazwa
      </label>
      <input
        id={id('nazwa')}
        className="input"
        type="text"
        placeholder={placeholders ? 'np. Syrop Pistacja 0,7 l' : undefined}
        value={draft.name}
        onChange={(e) => set('name', e.target.value)}
      />
    </div>
  );
  const code = (
    <div className="field">
      <label htmlFor={id('kod')} className="field__label">
        Kod produktu
      </label>
      <input
        id={id('kod')}
        className="input input--mono input--upper"
        type="text"
        placeholder={placeholders ? 'np. SYR-008' : undefined}
        value={draft.code}
        onChange={(e) => set('code', e.target.value.toUpperCase())}
      />
    </div>
  );
  const cat = (
    <div className="field">
      <label htmlFor={id('kat')} className="field__label">
        Kategoria
      </label>
      <select id={id('kat')} className="select" value={draft.cat} onChange={(e) => set('cat', e.target.value as Category)}>
        {CATEGORIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );
  const unit = (
    <div className="field">
      <label htmlFor={id('jm')} className="field__label">
        Jednostka
      </label>
      <select id={id('jm')} className="select" value={draft.unit} onChange={(e) => set('unit', e.target.value as Unit)}>
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </div>
  );
  const min = (
    <div className="field">
      <label htmlFor={id('min')} className="field__label">
        Minimum na stanie
      </label>
      <Stepper
        id={id('min')}
        value={draft.min}
        onChange={(v) => set('min', v)}
        unit={layout === 'phone' ? draft.unit : undefined}
        small={layout === 'compact'}
        inputWidth={layout === 'tablet' ? 64 : undefined}
        label={MIN_LABELS}
      />
      {minHint}
    </div>
  );

  if (layout === 'tablet') {
    return (
      <>
        {name}
        <div className="grid-2" style={{ gap: 16 }}>
          {code}
          {cat}
          {unit}
          {min}
        </div>
      </>
    );
  }
  return (
    <>
      {name}
      {code}
      <div className="grid-2">
        {cat}
        {unit}
      </div>
      {min}
    </>
  );
}
