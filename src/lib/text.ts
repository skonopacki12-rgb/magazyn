/** Lowercase, strip Polish diacritics so "orzech" matches "Orzech", "lawenda" etc. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function tokenize(query: string): string[] {
  return norm(query).split(/\s+/).filter(Boolean);
}

export function matches(tokens: string[], ...fields: string[]): boolean {
  if (!tokens.length) return true;
  const hay = norm(fields.join(' '));
  return tokens.every((t) => hay.includes(t));
}

/** Polish plural: 1 produkt, 2 produkty, 5 produktów. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10;
  const h = n % 100;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
}

export const countProducts = (n: number) => `${n} ${plural(n, 'produkt', 'produkty', 'produktów')}`;
export const countResults = (n: number) => `${n} ${plural(n, 'wynik', 'wyniki', 'wyników')}`;

const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

/** "2026-10-03" → "3 paź 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '');

/** "+2", "−3", "0" (typographic minus, as in the design). */
export function formatDiff(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}
