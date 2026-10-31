import { useMemo, useState } from 'react';
import { CATEGORIES } from '../lib/catalog';
import { digitsOnly, formatDate, todayIso } from '../lib/text';
import type { StockedProduct } from '../lib/types';
import { useStore } from '../store';

export interface InvItem extends StockedProduct {
  prev: number;
  val: string;
  counted: boolean;
  isSame: boolean;
  diff: number | null;
}

/**
 * Shared inventory-count logic. After "Zakończ" the store writes the new stock and clears the
 * session; we keep a snapshot so the screen keeps showing what was just saved.
 */
export function useInventory() {
  const { products, state, setCount, finishInventory } = useStore();
  const [snapshot, setSnapshot] = useState<Record<string, string> | null>(null);
  const [filter, setFilter] = useState<'all' | 'todo'>('all');
  const [todoIds, setTodoIds] = useState<string[]>([]);
  const counts = snapshot ?? state.counts;

  const items: InvItem[] = useMemo(
    () =>
      products.map((p) => {
        const val = counts[p.id] ?? '';
        const counted = val !== '';
        return { ...p, prev: p.qty, val, counted, isSame: counted && Number(val) === p.qty, diff: counted && !p.uncounted ? Number(val) - p.qty : null };
      }),
    [products, counts],
  );

  const set = (p: InvItem, v: string) => {
    if (snapshot) setSnapshot(null);
    setCount(p.id, digitsOnly(v));
  };
  const counted = items.filter((p) => p.counted).length;
  const total = items.length;
  const complete = total > 0 && counted === total;
  const pct = total ? Math.round((counted / total) * 100) : 0;

  return {
    items,
    counted,
    total,
    left: total - counted,
    pct,
    complete,
    saved: !!snapshot,
    today: formatDate(todayIso()),
    previous: formatDate(state.lastCount),
    filter,
    showAll: () => setFilter('all'),
    /** "Niepoliczone" freezes the list at click time so rows don't vanish while typing. */
    showTodo: () => {
      setTodoIds(items.filter((p) => !p.counted).map((p) => p.id));
      setFilter('todo');
    },
    todoIds,
    set,
    same: (p: InvItem) => set(p, String(p.prev)),
    step: (p: InvItem, d: number) => set(p, String(Math.max(0, (p.counted ? Number(p.val) : p.prev) + d))),
    finish: () => {
      if (!complete) return;
      setSnapshot(Object.fromEntries(items.map((p) => [p.id, p.val])));
      finishInventory();
    },
  };
}

export type InventoryModel = ReturnType<typeof useInventory>;

export function groupByCategory(all: InvItem[], visible: InvItem[]) {
  return CATEGORIES.map((c) => {
    const inCat = all.filter((p) => p.cat === c.id);
    return {
      id: c.id,
      label: c.label,
      counted: inCat.filter((p) => p.counted).length,
      size: inCat.length,
      items: visible.filter((p) => p.cat === c.id),
    };
  }).filter((g) => g.items.length > 0);
}

export function Progress({ m, variant }: { m: InventoryModel; variant: 'card' | 'plain' | 'sm' }) {
  return (
    <div className={`progress${variant === 'card' ? ' progress--card' : ''}${variant === 'sm' ? ' progress--sm' : ''}`}>
      <div className="heading-row" style={{ gap: 12 }}>
        <span className="progress__label">
          Policzone {m.counted} z {m.total}
        </span>
        <span className="progress__pct">{m.pct}%</span>
      </div>
      <div
        className="progress__track"
        role="progressbar"
        aria-label="Postęp inwentaryzacji"
        aria-valuemin={0}
        aria-valuemax={m.total}
        aria-valuenow={m.counted}
      >
        <div className="progress__fill" style={{ width: `${m.pct}%` }} />
      </div>
    </div>
  );
}

export function SameButton({ p, onClick, variant }: { p: InvItem; onClick: () => void; variant?: 'tablet' | 'laptop' }) {
  return (
    <button
      type="button"
      className={`same-btn${variant ? ` same-btn--${variant}` : ''}`}
      aria-pressed={p.isSame}
      aria-label={`Bez zmian: ${p.name}, wpisz ${p.prev}`}
      onClick={onClick}
    >
      Bez zmian
    </button>
  );
}

export function CountInput({ id, p, onChange, style }: { id: string; p: InvItem; onChange: (v: string) => void; style?: React.CSSProperties }) {
  return (
    <input
      id={id}
      className={`num-input${p.counted ? ' is-filled' : ''}`}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="–"
      value={p.val}
      style={style}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Segmented({ m, small }: { m: InventoryModel; small?: boolean }) {
  return (
    <div className={`seg${small ? ' seg--sm' : ''}`} role="group" aria-label="Pokaż">
      <button type="button" className="seg__btn" aria-pressed={m.filter === 'all'} onClick={m.showAll}>
        Wszystkie ({m.total})
      </button>
      <button type="button" className="seg__btn" aria-pressed={m.filter === 'todo'} onClick={m.showTodo}>
        Niepoliczone ({m.left})
      </button>
    </div>
  );
}
