import type { Product } from './types';

export interface Volume {
  value: number;
  unit: 'ml' | 'g';
}

/** "700 ml" → 700 ml, "1 l" → 1000 ml, "0,5 l" → 500 ml, "1,89 l" → 1890 ml, "1 kg" → 1000 g, "50 g" → 50 g. */
export function parseSize(size?: string): Volume | undefined {
  const m = size?.trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*(ml|l|kg|g)$/);
  if (!m) return undefined;
  const n = Number(m[1].replace(',', '.'));
  switch (m[2]) {
    case 'ml':
      return { value: Math.round(n), unit: 'ml' };
    case 'l':
      return { value: Math.round(n * 1000), unit: 'ml' };
    case 'kg':
      return { value: Math.round(n * 1000), unit: 'g' };
    default:
      return { value: Math.round(n), unit: 'g' };
  }
}

/** The product's bottle/pack content: set by hand, otherwise the catalog size, otherwise the end of the name ("… 0,7 l"). */
export function volumeOf(p: Pick<Product, 'volume' | 'volumeUnit' | 'size'> & { name?: string }): Volume | undefined {
  if (p.volume && p.volume > 0) return { value: p.volume, unit: p.volumeUnit ?? 'ml' };
  const fromSize = parseSize(p.size);
  if (fromSize) return fromSize;
  const m = p.name?.match(/(\d+(?:[.,]\d+)?\s*(?:ml|l|kg|g))(?:\s*\(PET\))?\s*$/i);
  return m ? parseSize(m[1]) : undefined;
}

export function formatVolume(v?: Volume): string {
  if (!v) return '';
  if (v.unit === 'ml' && v.value >= 1000) return `${String(v.value / 1000).replace('.', ',')} l`;
  if (v.unit === 'g' && v.value >= 1000) return `${String(v.value / 1000).replace('.', ',')} kg`;
  return `${v.value} ${v.unit}`;
}

/**
 * How much one full closed bottle adds to the count, in the product's counting unit:
 * 1 for szt./op., the bottle content for products counted in ml.
 */
export function bottleQty(p: Pick<Product, 'unit' | 'volume' | 'volumeUnit' | 'size'> & { name?: string }): number {
  const v = volumeOf(p);
  if (p.unit === 'ml' && v?.unit === 'ml') return v.value;
  return 1;
}
