import { useMemo } from 'react';
import type { CatFilter } from '../components/CategoryChips';
import { useStore } from '../store';
import { matches, tokenize } from './text';

/** Search by name/code (diacritics-insensitive), then filter by category chip. */
export function useStockSearch(query: string, cat: CatFilter) {
  const { products } = useStore();
  return useMemo(() => {
    const tokens = tokenize(query);
    const matched = products.filter((p) => matches(tokens, p.name, p.code));
    const results = cat === 'all' ? matched : matched.filter((p) => p.cat === cat);
    return { all: products, matched, results, hasQuery: tokens.length > 0 };
  }, [products, query, cat]);
}
