import { formatDate } from '../lib/text';
import type { StockedProduct } from '../lib/types';

interface Props {
  p: StockedProduct;
  variant: 'list' | 'lg' | 'compact';
  headingLevel?: 'h2' | 'h3';
  emptyText?: React.ReactNode;
}

/** "Historia inwentaryzacji": newest first, a bar per count with a mark at the minimum. */
export function History({ p, variant, headingLevel = 'h2', emptyText }: Props) {
  const H = headingLevel;
  const rows = [...p.hist].reverse();
  const top = Math.max(...p.hist.map((h) => h.qty), p.min, 1) + 1;
  const minPos = `calc(${Math.round((p.min / top) * 100)}% - 1px)`;
  const compact = variant === 'compact';
  return (
    <section className={`stack-4 hist hist--${variant}`} style={{ gap: compact ? 8 : 10 }}>
      <div className="heading-row">
        <H className={`eyebrow${compact ? ' eyebrow--sm' : ''}`}>Historia inwentaryzacji</H>
        <span className="hist__legend">
          <span aria-hidden="true" className="hist__legend-mark" />
          minimum
        </span>
      </div>
      {rows.length ? (
        <ul className={compact ? undefined : 'rows'}>
          {rows.map((h) => (
            <li key={h.date} className="hist-row">
              <span>{formatDate(h.date)}</span>
              <span aria-hidden="true" className="hist-bar">
                <span className={`hist-bar__fill${h.qty < p.min ? ' is-below' : ''}`} style={{ width: `${Math.round((h.qty / top) * 100)}%` }} />
                <span className="hist-bar__min" style={{ left: minPos }} />
              </span>
              <span className="hist-row__qty">
                {h.qty} {p.unit}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        emptyText
      )}
    </section>
  );
}
