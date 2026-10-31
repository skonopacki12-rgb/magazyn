/**
 * Three-way merge used when another device saved the same part first.
 * base = what this device last saved/loaded, mine = local state, theirs = server copy.
 * Different items changed on each side are combined; the server wins only when both sides
 * changed the very same item.
 */

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const hasIds = (v: unknown): v is { id: string }[] => Array.isArray(v) && v.every((x) => isObj(x) && typeof x.id === 'string');

export interface MergeResult<T> {
  value: T;
  /** Both sides changed the same item — the server copy was kept for it. */
  clash: boolean;
}

function mergeById(base: { id: string }[], mine: { id: string }[], theirs: { id: string }[]): MergeResult<{ id: string }[]> {
  const b = new Map(base.map((x) => [x.id, x]));
  const m = new Map(mine.map((x) => [x.id, x]));
  const t = new Map(theirs.map((x) => [x.id, x]));
  const ids = [...theirs.map((x) => x.id), ...mine.map((x) => x.id).filter((id) => !t.has(id))];
  let clash = false;
  const out: { id: string }[] = [];
  for (const id of ids) {
    const bi = b.get(id);
    const mi = m.get(id);
    const ti = t.get(id);
    if (same(mi, bi)) {
      if (ti) out.push(ti); // unchanged here → server
    } else if (same(ti, bi)) {
      if (mi) out.push(mi); // changed only here → mine (also: deleted here)
    } else {
      clash = true;
      if (ti) out.push(ti);
    }
  }
  return { value: out, clash };
}

function mergeMap(base: Record<string, unknown>, mine: Record<string, unknown>, theirs: Record<string, unknown>): MergeResult<Record<string, unknown>> {
  const keys = new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)]);
  const out: Record<string, unknown> = {};
  let clash = false;
  for (const k of keys) {
    const r = mergeValue(base[k], mine[k], theirs[k]);
    clash ||= r.clash;
    if (r.value !== undefined) out[k] = r.value;
  }
  return { value: out, clash };
}

export function mergeValue(base: unknown, mine: unknown, theirs: unknown): MergeResult<unknown> {
  if (same(mine, base)) return { value: theirs, clash: false };
  if (same(theirs, base)) return { value: mine, clash: false };
  if (same(mine, theirs)) return { value: theirs, clash: false };
  if (hasIds(mine) && hasIds(theirs) && (base === undefined || hasIds(base))) return mergeById((base as { id: string }[]) ?? [], mine, theirs);
  if (isObj(mine) && isObj(theirs) && (base === undefined || isObj(base)) && !('stage' in mine)) return mergeMap((base as Record<string, unknown>) ?? {}, mine, theirs);
  return { value: theirs, clash: true };
}
