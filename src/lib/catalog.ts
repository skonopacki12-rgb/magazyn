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
