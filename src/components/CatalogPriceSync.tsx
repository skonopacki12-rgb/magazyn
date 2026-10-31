import { useEffect } from 'react';
import { useCatalog } from '../lib/useCatalog';
import { useStore } from '../store';

/** Products added from the folders before prices existed get them filled in once the catalog loads. */
function Loader() {
  const { items } = useCatalog();
  const { fillCatalogPrices } = useStore();
  useEffect(() => {
    if (items) fillCatalogPrices(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  return null;
}

export function CatalogPriceSync() {
  const { state } = useStore();
  const missing = state.products.some((p) => p.catalogId && p.price == null);
  return missing ? <Loader /> : null;
}
