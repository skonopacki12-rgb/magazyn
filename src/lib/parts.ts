/**
 * The warehouse is stored as independent parts, each with its own version. A device only sends
 * parts it changed, so two devices working on different things (e.g. counting a shelf and receiving
 * a delivery) don't overwrite each other, and each part has its own size limit.
 * Shared by the app and the Worker.
 */
export const PARTS = {
  products: ['products'],
  inventory: ['lastCount', 'counts', 'countLots'],
  orders: ['ordered', 'orderDraft', 'pending'],
  training: ['training'],
  shelves: ['shelves', 'shelfAudit'],
  log: ['log'],
} as const;

export type PartName = keyof typeof PARTS;
export const PART_NAMES = Object.keys(PARTS) as PartName[];

/** Max movements kept in the log. */
export const LOG_LIMIT = 2000;

type AnyState = Record<string, unknown>;

export function pickPart(state: AnyState, part: PartName): AnyState {
  const out: AnyState = {};
  for (const k of PARTS[part]) if (state[k] !== undefined) out[k] = state[k];
  return out;
}

export function splitState(state: AnyState): Record<PartName, AnyState> {
  return Object.fromEntries(PART_NAMES.map((p) => [p, pickPart(state, p)])) as Record<PartName, AnyState>;
}

export function joinParts(parts: Partial<Record<PartName, AnyState>>): AnyState {
  return Object.assign({ products: [], lastCount: '', counts: {}, ordered: {} }, ...PART_NAMES.map((p) => parts[p] ?? {}));
}

/** True when some field of the part differs (by identity) between two states. */
export function partChanged(a: AnyState, b: AnyState, part: PartName): boolean {
  return PARTS[part].some((k) => a[k] !== b[k]);
}

interface LogEntry {
  id: string;
  at: string;
}

/** Union of two logs by id, newest first, capped. */
export function mergeLog<T extends LogEntry>(a: T[] = [], b: T[] = []): T[] {
  const byId = new Map<string, T>();
  for (const m of [...a, ...b]) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0)).slice(0, LOG_LIMIT);
}

/** Minimal shape checks before a part is stored. */
export function validPart(part: PartName, data: AnyState): boolean {
  switch (part) {
    case 'products':
      return Array.isArray(data.products);
    case 'inventory':
      return typeof data.lastCount === 'string' && typeof data.counts === 'object' && data.counts !== null;
    case 'log':
      return data.log === undefined || Array.isArray(data.log);
    default:
      return typeof data === 'object' && data !== null;
  }
}
