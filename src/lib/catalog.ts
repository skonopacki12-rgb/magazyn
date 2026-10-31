import type { Category, Unit } from './types';

export const CATEGORIES: { id: Category; label: string; short: string }[] = [
  { id: 'syropy', label: 'Syropy', short: 'Syropy' },
  { id: 'puree', label: 'Puree', short: 'Puree' },
  { id: 'napoje', label: 'Napoje gazowane', short: 'Napoje' },
  { id: 'akcesoria', label: 'Akcesoria', short: 'Akcesoria' },
];

export const UNITS: Unit[] = ['szt.', 'op.', 'kg'];

export function catLabel(cat: Category): string {
  return CATEGORIES.find((c) => c.id === cat)?.label ?? cat;
}
