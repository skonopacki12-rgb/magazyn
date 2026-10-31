import { useEffect, useState } from 'react';
import type { CatalogItem } from './types';

let cache: Promise<CatalogItem[]> | null = null;

/** Loads the supplier-folder catalog (public/katalog/katalog.json) once per page load. */
export function useCatalog() {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    cache ??= fetch('/katalog/katalog.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ items: CatalogItem[] }>;
      })
      .then((d) => d.items);
    cache
      .then((d) => alive && setItems(d))
      .catch(() => {
        cache = null;
        if (alive) setError('Nie udało się wczytać listy produktów z folderów.');
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  return { items, error, retry: () => (setError(null), setAttempt((a) => a + 1)) };
}
