import type { State } from '../store';
import type { PartName } from './parts';

export interface User {
  id: string;
  email: string;
  name: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public payload?: unknown) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Brak połączenia z serwerem.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Błąd ${res.status}`, data);
  return data as T;
}

export const api = {
  me: () => request<{ user: User | null }>('GET', '/api/auth/me'),
  config: () => request<{ registration: boolean }>('GET', '/api/auth/config'),
  login: (email: string, password: string) => request<{ user: User }>('POST', '/api/auth/login', { email, password }),
  register: (name: string, email: string, password: string) => request<{ user: User }>('POST', '/api/auth/register', { name, email, password }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
  getState: () => request<{ data: State; versions: Record<PartName, number> }>('GET', '/api/state'),
  putParts: (parts: Partial<Record<PartName, { data: unknown; version: number }>>) =>
    request<{
      versions: Partial<Record<PartName, number>>;
      conflicts: Partial<Record<PartName, { data: Partial<State>; version: number }>>;
      merged: Partial<Record<PartName, { data: Partial<State>; version: number }>>;
    }>('PUT', '/api/state/parts', { parts }),
};
