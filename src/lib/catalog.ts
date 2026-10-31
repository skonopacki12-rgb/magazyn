import type { Category, Unit } from './types';

export const CATEGORIES: { id: Category; label: string; short: string }[] = [
  { id: 'syropy', label: 'Syropy', short: 'Syropy' },
  { id: 'puree', label: 'Puree', short: 'Puree' },
  { id: 'sosy', label: 'Sosy', short: 'Sosy' },
  { id: 'napoje', label: 'Napoje i tonik', short: 'Napoje' },
  { id: 'dodatki', label: 'Proszki, susz i matcha', short: 'Dodatki' },
  { id: 'akcesoria', label: 'Akcesoria', short: 'Akcesoria' },
];

export const UNITS: Unit[] = ['szt.', 'op.', 'ml', 'kg'];

export function catLabel(cat: Category): string {
  return CATEGORIES.find((c) => c.id === cat)?.label ?? cat;
}

/**
 * How a catalog product is counted:
 * - liquids opened and used little by little (1883 syrups, sauces, puree, Artonic) → ml,
 * - Lord of Taste drinks (mixers 200 ml) → szt. — bought and used whole,
 * - Lord of Taste puree / bases in 1 kg packs → szt.,
 * - powders, dried fruit, matcha → op., accessories (pumps) → szt.
 */
export function unitFor(it: { cat: Category; code?: string; brand?: string; name?: string; size?: string }): Unit {
  const lot = /lord of taste/i.test(`${it.brand ?? ''} ${it.name ?? ''}`) || /^LOT/i.test(it.code ?? '');
  switch (it.cat) {
    case 'akcesoria':
      return 'szt.';
    case 'dodatki':
      return 'op.';
    case 'napoje':
      return lot ? 'szt.' : 'ml';
    default:
      return /^\s*\d+(?:[.,]\d+)?\s*(ml|l)\s*$/i.test(it.size ?? '') ? 'ml' : 'szt.';
  }
}
