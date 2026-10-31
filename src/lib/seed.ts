import type { Product } from './types';

const DATES = ['2026-07-04', '2026-08-01', '2026-09-05', '2026-10-03'];

type Row = [code: string, name: string, cat: Product['cat'], min: number, hist: number[], unit?: Product['unit']];

const ROWS: Row[] = [
  ['SYR-001', 'Syrop Wanilia 0,7 l', 'syropy', 4, [5, 7, 4, 6]],
  ['SYR-002', 'Syrop Karmel 0,7 l', 'syropy', 4, [6, 3, 5, 2]],
  ['SYR-003', 'Syrop Orzech laskowy 0,7 l', 'syropy', 3, [4, 6, 3, 5]],
  ['SYR-004', 'Syrop Kokos 0,7 l', 'syropy', 3, [3, 2, 1, 0]],
  ['SYR-005', 'Syrop Lawenda 0,7 l', 'syropy', 2, [2, 4, 3, 3]],
  ['SYR-006', 'Syrop Trawa cytrynowa 0,7 l', 'syropy', 2, [3, 2, 2, 1]],
  ['SYR-007', 'Syrop Grenadyna 0,7 l', 'syropy', 3, [5, 3, 4, 4]],
  ['PUR-001', 'Puree Marakuja 1 kg', 'puree', 2, [2, 4, 2, 3]],
  ['PUR-002', 'Puree Malina 1 kg', 'puree', 2, [3, 2, 1, 0]],
  ['PUR-003', 'Puree Mango 1 kg', 'puree', 2, [4, 3, 3, 2]],
  ['PUR-004', 'Puree Truskawka 1 kg', 'puree', 2, [2, 3, 2, 1]],
  ['NAP-001', 'Tonik 0,2 l', 'napoje', 12, [20, 30, 18, 24]],
  ['NAP-002', 'Ginger beer 0,2 l', 'napoje', 12, [16, 12, 14, 8]],
  ['NAP-003', 'Woda gazowana 0,2 l', 'napoje', 12, [24, 12, 20, 18]],
  ['NAP-004', 'Soda grejpfrutowa 0,2 l', 'napoje', 6, [6, 4, 2, 0]],
  ['AKC-001', 'Shaker bostoński', 'akcesoria', 2, [3, 3, 3, 3]],
  ['AKC-002', 'Podkładki pod szklankę', 'akcesoria', 2, [3, 2, 2, 1], 'op.'],
  ['AKC-003', 'Pompka do syropu', 'akcesoria', 4, [8, 6, 8, 7]],
];

export const SEED_PRODUCTS: Product[] = ROWS.map(([code, name, cat, min, hist, unit = 'szt.']) => ({
  id: code,
  code,
  name,
  cat,
  unit,
  min,
  qty: hist[hist.length - 1],
  hist: hist.map((qty, i) => ({ date: DATES[i], qty })),
}));

export const SEED_LAST_COUNT = DATES[DATES.length - 1];
