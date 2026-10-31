import { useState } from 'react';
import type { CatFilter } from '../../components/CategoryChips';
import { draftToProduct, emptyDraft, type Draft } from '../../components/ProductForm';
import { useStockSearch } from '../../lib/useStockSearch';
import { useStore } from '../../store';

export type Panel = 'order' | 'product' | 'form';

export interface StockPanelInit {
  panel?: Panel;
  selected?: string | null;
  newName?: string;
}

/**
 * Master–detail state shared by tablet and laptop stock screens:
 * search + category on the left, and a panel on the right showing the order list,
 * the selected product, or the add/edit form.
 */
export function useStockPanel(defaultPanel: 'order' | 'product', init: StockPanelInit = {}) {
  const store = useStore();
  const [query, setQueryRaw] = useState('');
  const [cat, setCat] = useState<CatFilter>('all');
  const [panel, setPanel] = useState<Panel>(init.panel ?? (init.selected ? 'product' : defaultPanel));
  const [selected, setSelected] = useState<string | null>(init.selected ?? null);
  const [draft, setDraftRaw] = useState<Draft>(emptyDraft({ name: init.newName ?? '' }));
  const [editId, setEditId] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const search = useStockSearch(query, cat);
  const { results, hasQuery, matched } = search;

  // While searching, the panel follows the first hit unless the selected product is still in the results.
  let sel = null;
  if (panel === 'product') {
    const pool = hasQuery ? results : search.all;
    sel = pool.find((p) => p.id === selected) ?? (hasQuery ? results[0] ?? null : null);
  }

  const back = () => (selected ? 'product' : defaultPanel);

  return {
    ...search,
    query,
    setQuery: (v: string) => {
      setQueryRaw(v);
      setPanel(v.trim() || selected ? 'product' : defaultPanel);
    },
    cat,
    setCat,
    panel,
    sel,
    pick: (id: string) => {
      setSelected(id);
      setPanel('product');
    },
    showOrder: () => setPanel('order'),
    close: () => {
      setSelected(null);
      setPanel('order');
    },
    draft,
    setDraft: (d: Draft) => {
      setDraftRaw(d);
      setErr(false);
    },
    err,
    editId,
    openNew: () => {
      setEditId(null);
      setErr(false);
      setDraftRaw(emptyDraft({ name: hasQuery && !matched.length ? query.trim() : '', cat: cat !== 'all' ? cat : 'syropy' }));
      setPanel('form');
    },
    openEdit: () => {
      if (!sel) return;
      setEditId(sel.id);
      setErr(false);
      setDraftRaw({ name: sel.name, code: sel.code, cat: sel.cat, unit: sel.unit, min: String(sel.min) });
      setPanel('form');
    },
    cancel: () => {
      setErr(false);
      setPanel(editId ? 'product' : back());
    },
    submit: () => {
      const d = draftToProduct(draft);
      if (!d.name) return setErr(true);
      if (editId) {
        const cur = store.byId(editId);
        store.updateProduct(editId, { ...d, code: d.code || cur?.code || editId });
        setSelected(editId);
      } else {
        const id = store.addProduct(d);
        setSelected(id);
        setQueryRaw('');
        setCat('all');
      }
      setErr(false);
      setPanel('product');
    },
    setMin: (v: string) => sel && store.updateProduct(sel.id, { min: Math.max(0, Number(v) || 0) }),
    archive: () => {
      if (!sel) return;
      store.archiveProduct(sel.id);
      setSelected(null);
      setPanel(defaultPanel);
    },
  };
}

export type StockPanelModel = ReturnType<typeof useStockPanel>;
