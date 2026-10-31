import type { Move } from './training';
import type { Product } from './types';

const DAY = 86_400_000;
const day = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/** All inventory dates (newest first). */
export function inventoryDates(products: Product[]): string[] {
  const set = new Set<string>();
  for (const p of products) for (const h of p.hist) set.add(h.date);
  return [...set].sort().reverse();
}

export interface ReportRow {
  p: Product;
  prev: number | null;
  cur: number | null;
  delivered: number;
  /** Thrown away / removed for another reason. */
  lost: number;
  /** Shelf corrections between the two inventories (+/-). */
  adjusted: number;
  /** What left the shelf: prev + delivered + adjusted − cur (includes losses). */
  out: number | null;
  /** out − lost: used for drinks / training. */
  used: number | null;
}

export interface Report {
  date: string;
  prevDate: string | null;
  days: number | null;
  rows: ReportRow[];
}

/** Movements of one product between two dates (exclusive start, inclusive end). */
function sumMoves(log: Move[], pid: string, from: string | null, to: string, kinds: Move['kind'][]): number {
  return log
    .filter((m) => m.productId === pid && kinds.includes(m.kind) && (!from || m.at.slice(0, 10) > from) && m.at.slice(0, 10) <= to)
    .reduce((s, m) => s + m.qty, 0);
}

/** Compares the inventory of `date` with the one before it. */
export function buildReport(products: Product[], log: Move[], date: string): Report {
  const dates = inventoryDates(products);
  const prevDate = dates.find((d) => d < date) ?? null;
  const rows = products
    .filter((p) => !p.archived)
    .map((p) => {
      const cur = p.hist.find((h) => h.date === date)?.qty ?? null;
      const prev = prevDate ? (p.hist.find((h) => h.date === prevDate)?.qty ?? null) : null;
      const delivered = sumMoves(log, p.id, prevDate, date, ['delivered']);
      const lost = sumMoves(log, p.id, prevDate, date, ['waste', 'other']);
      const adjusted = sumMoves(log, p.id, prevDate, date, ['adjusted']);
      const out = prev != null && cur != null ? prev + delivered + adjusted - cur : null;
      return { p, prev, cur, delivered, lost, adjusted, out, used: out != null ? Math.max(0, out - lost) : null };
    })
    .filter((r) => r.cur != null || r.prev != null);
  return { date, prevDate, days: prevDate ? Math.round((day(date) - day(prevDate)) / DAY) : null, rows };
}

/**
 * Average usage per 30 days from all consecutive inventories (deliveries and corrections in between
 * included). Null when there isn't a full interval yet.
 */
export function monthlyUsage(p: Product, log: Move[]): number | null {
  const hist = [...p.hist].sort((a, b) => (a.date < b.date ? -1 : 1));
  let out = 0;
  let days = 0;
  for (let i = 1; i < hist.length; i++) {
    const a = hist[i - 1];
    const b = hist[i];
    const d = Math.round((day(b.date) - day(a.date)) / DAY);
    if (d <= 0) continue;
    const delivered = sumMoves(log, p.id, a.date, b.date, ['delivered']);
    const adjusted = sumMoves(log, p.id, a.date, b.date, ['adjusted']);
    out += Math.max(0, a.qty + delivered + adjusted - b.qty);
    days += d;
  }
  return days ? (out / days) * 30 : null;
}

/** Minimum that covers `coverDays` of average usage (at least 1 when the product is used at all). */
export function suggestedMin(perMonth: number | null, coverDays: number): number | null {
  if (perMonth == null) return null;
  if (perMonth <= 0) return 0;
  return Math.max(1, Math.ceil((perMonth / 30) * coverDays));
}
