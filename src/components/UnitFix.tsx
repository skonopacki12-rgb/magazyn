import { useState } from 'react';
import { useStore } from '../store';

/** Shown when products use a unit that doesn't fit how they're bought (e.g. mixers counted in ml). */
export function UnitFixBanner() {
  const { unitFixes, fixUnits } = useStore();
  const [open, setOpen] = useState(false);
  if (!unitFixes.length) return null;
  const groups = new Map<string, number>();
  for (const f of unitFixes) groups.set(`${f.p.unit} → ${f.unit}`, (groups.get(`${f.p.unit} → ${f.unit}`) ?? 0) + 1);
  return (
    <div className="card over-warn" role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: '1 1 260px', fontSize: 14, lineHeight: '20px' }}>
          <strong>{unitFixes.length} produktów ma złą jednostkę</strong> ({[...groups].map(([k, n]) => `${k}: ${n}`).join(', ')}). Napoje Lord of Taste
          liczymy w szt., susz i proszki w op., pompki w szt., syropy, sosy i puree 1883 w ml.
        </span>
        <button type="button" className="btn btn--ghost btn--md" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Ukryj listę' : 'Pokaż listę'}
        </button>
        <button
          type="button"
          className="btn btn--primary btn--md"
          onClick={() =>
            window.confirm(
              `Zmienić jednostkę ${unitFixes.length} produktów? Stany, minima, partie i oczekujące dostawy zostaną przeliczone (np. 400 ml mixera 200 ml → 2 szt.).`,
            ) && fixUnits()
          }
        >
          Popraw jednostki
        </button>
      </div>
      {open && (
        <ul className="hint" style={{ margin: 0, paddingLeft: 18, columns: '2 260px' }}>
          {unitFixes.map((f) => (
            <li key={f.p.id}>
              {f.p.name}: {f.p.unit} → {f.unit}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
