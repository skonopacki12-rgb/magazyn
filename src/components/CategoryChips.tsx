import { CATEGORIES } from '../lib/catalog';
import type { Category } from '../lib/types';

export type CatFilter = Category | 'all';

interface Props {
  value: CatFilter;
  onChange: (c: CatFilter) => void;
  /** Products matching the current search — chip counts are computed from these. */
  matched: ReadonlyArray<{ cat: Category }>;
  layout: 'scroll' | 'wrap';
  /** Use the long label ("Napoje gazowane") instead of the short one. */
  longLabels?: boolean;
  small?: boolean;
}

export function CategoryChips({ value, onChange, matched, layout, longLabels, small }: Props) {
  const defs: { id: CatFilter; label: string }[] = [
    { id: 'all', label: 'Wszystko' },
    ...CATEGORIES.map((c) => ({ id: c.id, label: longLabels ? c.label : c.short })),
  ];
  return (
    <div className={`chips chips--${layout}${small ? ' chips--sm' : ''}`}>
      {defs.map((d) => {
        const n = d.id === 'all' ? matched.length : matched.filter((p) => p.cat === d.id).length;
        return (
          <button key={d.id} type="button" className="chip" aria-pressed={value === d.id} onClick={() => onChange(d.id)}>
            {d.label}
            <span className="chip__n">{n}</span>
          </button>
        );
      })}
    </div>
  );
}

export function chipLabel(c: CatFilter, long?: boolean): string {
  if (c === 'all') return 'Wszystko';
  const def = CATEGORIES.find((x) => x.id === c)!;
  return long ? def.label : def.short;
}
