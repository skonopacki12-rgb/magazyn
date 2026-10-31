import type { User } from './api';
import type { PartName } from './parts';

/**
 * Local copy for working without network: the signed-in user and the warehouse
 * (current state, last saved state and part versions — enough to merge on reconnect).
 */
const USER_KEY = 'magazyn:user';
const dataKey = (uid: string) => `magazyn:data:${uid}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — the app still works online */
  }
}

export const cachedUser = () => read<User>(USER_KEY);
export const rememberUser = (u: User | null) => write(USER_KEY, u);

export interface LocalCopy<S> {
  state: S;
  saved: S;
  versions: Record<PartName, number>;
  at: string;
}

export const loadCopy = <S>(uid: string) => read<LocalCopy<S>>(dataKey(uid));
export const saveCopy = <S>(uid: string, copy: Omit<LocalCopy<S>, 'at'>) => write(dataKey(uid), { ...copy, at: new Date().toISOString() });
export const clearCopy = (uid: string) => write(dataKey(uid), null);
