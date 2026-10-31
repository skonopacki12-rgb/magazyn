import { useMemo, useState } from 'react';
import { CATEGORIES } from '../lib/catalog';
import { digitsOnly, formatDate, todayIso } from '../lib/text';
import { cloneLots, newLot } from '../lib/fifo';
import { packSizeOf } from '../lib/pack';
import { bottleQty, formatVolume, volumeOf } from '../lib/volume';
import { Icon } from './Icon';
import type { Lot, StockedProduct } from '../lib/types';
import { useStore } from '../store';

export interface InvItem extends StockedProduct {
  prev: number;
  val: string;
  counted: boolean;
  isSame: boolean;
  diff: number | null;
  /** Batches entered in this inventory (FIFO). */
  countLots: Lot[];
  /** Batches from the previous inventory. */
  prevLots: Lot[];
}

/**
 * Shared inventory-count logic. After "Zakończ" the store writes the new stock and clears the
 * session; we keep a snapshot so the screen keeps showing what was just saved.
 */
export function useInventory() {
  const { products, state, setCount, setLots, finishInventory } = useStore();
  const [snapshot, setSnapshot] = useState<Record<string, string> | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'todo'>('all');
  const [todoIds, setTodoIds] = useState<string[]>([]);
  const counts = snapshot ?? state.counts;

  const items: InvItem[] = useMemo(
    () =>
      products.map((p) => {
        const val = counts[p.id] ?? '';
        const counted = val !== '';
        return {
          ...p,
          prev: p.qty,
          val,
          counted,
          isSame: counted && Number(val) === p.qty,
          diff: counted && !p.uncounted ? Number(val) - p.qty : null,
          countLots: snapshot ? (p.lots ?? []) : (state.countLots?.[p.id] ?? []),
          prevLots: p.lots ?? [],
        };
      }),
    [products, counts, snapshot, state.countLots],
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
    same: (p: InvItem) => {
      if (snapshot) setSnapshot(null);
      if (p.prevLots.length) {
        // Lots may cover only part of the stock (e.g. a delivery on top of a count without lots):
        // the rest goes in as a lot without details, so "Bez zmian" always equals the previous stock.
        const lots = cloneLots(p.prevLots);
        const rest = p.prev - lots.reduce((s, l) => s + l.qty, 0);
        setLots(p.id, rest > 0 ? [...lots, newLot({ qty: rest })] : lots);
      }
      else setCount(p.id, String(p.prev));
    },
    setLots: (p: InvItem, lots: Lot[]) => {
      if (snapshot) setSnapshot(null);
      setLots(p.id, lots);
    },
    /** "+ Pełna butelka": adds one closed full bottle (1 szt. or its content in ml) as a FIFO lot. */
    addBottle: (p: InvItem) => {
      if (snapshot) setSnapshot(null);
      const lots = p.countLots.length ? [...p.countLots] : p.counted && Number(p.val) > 0 ? [newLot({ qty: Number(p.val) })] : [];
      const tpl = lots[lots.length - 1] ?? p.prevLots[p.prevLots.length - 1];
      const add = bottleQty(p);
      const i = lots.findIndex((l) => !l.open && !l.pack && l.shelf === tpl?.shelf && l.expiresAt === (lots.length ? tpl?.expiresAt : undefined));
      if (i >= 0) lots[i] = { ...lots[i], qty: lots[i].qty + add };
      else lots.push(newLot({ qty: add, open: false, shelf: tpl?.shelf, expiresAt: lots.length ? tpl?.expiresAt : undefined }));
      setLots(p.id, lots);
    },
    /** "+ Otwarta butelka": adds an opened bottle (opened today) — 1 szt., or what's left in ml. */
    addOpen: (p: InvItem, qty: number) => {
      if (qty <= 0) return;
      if (snapshot) setSnapshot(null);
      const lots = p.countLots.length ? [...p.countLots] : p.counted && Number(p.val) > 0 ? [newLot({ qty: Number(p.val) })] : [];
      const tpl = lots[lots.length - 1] ?? p.prevLots[p.prevLots.length - 1];
      setLots(p.id, [...lots, newLot({ qty, open: true, openedAt: todayIso(), shelf: tpl?.shelf, expiresAt: lots.length ? tpl?.expiresAt : undefined })]);
    },
    /** "+ Zgrzewka": adds a full case (e.g. 12 mixers) as one lot. */
    addCase: (p: InvItem) => {
      const size = packSizeOf(p);
      if (!size) return;
      if (snapshot) setSnapshot(null);
      const lots = p.countLots.length ? [...p.countLots] : p.counted && Number(p.val) > 0 ? [newLot({ qty: Number(p.val) })] : [];
      const tpl = lots[lots.length - 1] ?? p.prevLots[p.prevLots.length - 1];
      setLots(p.id, [...lots, newLot({ qty: size, pack: true, open: false, shelf: tpl?.shelf, expiresAt: lots.length ? tpl?.expiresAt : undefined })]);
    },
    isExpanded: (p: InvItem) => expanded.has(p.id),
    toggleExpanded: (p: InvItem) =>
      setExpanded((s) => {
        const n = new Set(s);
        if (n.has(p.id)) n.delete(p.id);
        else n.add(p.id);
        return n;
      }),
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
  const fromLots = p.countLots.length > 0;
  return (
    <input
      id={id}
      className={`num-input${p.counted ? ' is-filled' : ''}${fromLots ? ' is-sum' : ''}`}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="–"
      value={p.val}
      readOnly={fromLots}
      title={fromLots ? 'Suma partii — zmień ilości w partiach' : undefined}
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

/** Quick-add buttons under a product in inventory: a closed full bottle, an opened bottle, a full case. */
export function QuickAdd({ m, p }: { m: InventoryModel; p: InvItem }) {
  const size = packSizeOf(p);
  const vol = volumeOf(p);
  const add = bottleQty(p);
  const inMl = p.unit === 'ml' && add > 1;
  const [asking, setAsking] = useState(false);
  const [ml, setMl] = useState('');
  const openAdd = (q: number) => {
    m.addOpen(p, q);
    setAsking(false);
    setMl('');
  };
  return (
    <span className="quick">
      <button type="button" className="quick__btn" onClick={() => m.addBottle(p)} aria-label={`Dodaj zamkniętą pełną butelkę: ${p.name}`}>
        <Icon name="plus" size={14} strokeWidth={2.6} />
        Pełna butelka{inMl ? ` ${add} ml` : vol ? ` · ${formatVolume(vol)}` : ''}
      </button>
      <button
        type="button"
        className="quick__btn quick__btn--open"
        aria-expanded={inMl ? asking : undefined}
        onClick={() => (inMl ? setAsking(!asking) : openAdd(1))}
        aria-label={`Dodaj otwartą butelkę: ${p.name}`}
      >
        <Icon name="plus" size={14} strokeWidth={2.6} />
        Otwarta butelka
      </button>
      {size && (
        <button type="button" className="quick__btn quick__btn--case" onClick={() => m.addCase(p)} aria-label={`Dodaj pełną zgrzewkę ${size} szt.: ${p.name}`}>
          <Icon name="plus" size={14} strokeWidth={2.6} />
          Zgrzewka ({size} szt.)
        </button>
      )}
      {asking && inMl && (
        <span className="quick__ask" role="group" aria-label="Ile zostało w otwartej butelce">
          <span className="hint" style={{ width: '100%' }}>
            Ile zostało w butelce ({add} ml)?
          </span>
          {[
            ['¾', 0.75],
            ['½', 0.5],
            ['¼', 0.25],
          ].map(([label, f]) => (
            <button key={label as string} type="button" className="quick__btn" onClick={() => openAdd(Math.round(add * (f as number)))}>
              {label} · {Math.round(add * (f as number))} ml
            </button>
          ))}
          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <label className="sr-only" htmlFor={`open-ml-${p.id}`}>
              Ile ml zostało
            </label>
            <input
              id={`open-ml-${p.id}`}
              className="input input--mono"
              style={{ width: 84, height: 34, padding: '0 8px', fontSize: 14 }}
              inputMode="numeric"
              placeholder="ml"
              value={ml}
              onChange={(e) => setMl(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && Number(ml) > 0 && openAdd(Math.min(Number(ml), add))}
            />
            <button type="button" className="quick__btn quick__btn--open" disabled={!(Number(ml) > 0)} onClick={() => openAdd(Math.min(Number(ml), add))}>
              Dodaj
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
