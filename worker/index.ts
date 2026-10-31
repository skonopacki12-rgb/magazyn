import { SEED_LAST_COUNT, SEED_PRODUCTS } from '../src/lib/seed';
import { hashPassword, PBKDF2_ITERATIONS, randomHex, safeEqual, sha256 } from './crypto';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const COOKIE = 'magazyn_session';
const SESSION_DAYS = 30;
const MAX_STATE_BYTES = 1_000_000;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Nieprawidłowe dane.');
  }
}

function sessionCookie(token: string, maxAge: number, secure: boolean) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function readCookie(req: Request): string | null {
  const raw = req.headers.get('cookie') ?? '';
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return m ? m[1] : null;
}

async function createSession(env: Env, userId: string, req: Request) {
  const token = randomHex(32);
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), userId, expires).run();
  return sessionCookie(token, SESSION_DAYS * 86_400, new URL(req.url).protocol === 'https:');
}

interface UserRow {
  id: string;
  email: string;
  name: string;
}

async function currentUser(env: Env, req: Request): Promise<UserRow | null> {
  const token = readCookie(req);
  if (!token) return null;
  return env.DB.prepare(
    'SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
  )
    .bind(await sha256(token), Date.now())
    .first<UserRow>();
}

async function requireUser(env: Env, req: Request): Promise<UserRow> {
  const u = await currentUser(env, req);
  if (!u) throw new HttpError(401, 'Zaloguj się.');
  return u;
}

const publicUser = (u: UserRow) => ({ id: u.id, email: u.email, name: u.name });
const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase();

async function register(env: Env, req: Request) {
  const b = await body<{ name?: string; email?: string; password?: string }>(req);
  const name = String(b.name ?? '').trim();
  const email = normEmail(b.email);
  const password = String(b.password ?? '');
  if (!name) throw new HttpError(400, 'Podaj imię lub nazwę.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Podaj poprawny adres e-mail.');
  if (password.length < 8) throw new HttpError(400, 'Hasło musi mieć co najmniej 8 znaków.');

  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first();
  if (exists) throw new HttpError(409, 'Konto z tym adresem już istnieje.');

  const id = crypto.randomUUID();
  const salt = randomHex(16);
  const hash = await hashPassword(password, salt, PBKDF2_ITERATIONS);
  const now = Date.now();
  const initial = { products: SEED_PRODUCTS, lastCount: SEED_LAST_COUNT, counts: {}, ordered: {} };
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id, email, name, password_hash, salt, iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
      id, email, name, hash, salt, PBKDF2_ITERATIONS, now,
    ),
    env.DB.prepare('INSERT INTO warehouses (user_id, data, version, updated_at) VALUES (?, ?, 1, ?)').bind(id, JSON.stringify(initial), now),
  ]);
  const cookie = await createSession(env, id, req);
  return json({ user: { id, email, name } }, 201, { 'set-cookie': cookie });
}

async function login(env: Env, req: Request) {
  const b = await body<{ email?: string; password?: string }>(req);
  const email = normEmail(b.email);
  const row = await env.DB.prepare('SELECT id, email, name, password_hash, salt, iterations FROM users WHERE email = ?')
    .bind(email)
    .first<UserRow & { password_hash: string; salt: string; iterations: number }>();
  // Hash even when the user doesn't exist so response time doesn't reveal registered e-mails.
  const hash = await hashPassword(String(b.password ?? ''), row?.salt ?? '00'.repeat(16), row?.iterations ?? PBKDF2_ITERATIONS);
  if (!row || !safeEqual(hash, row.password_hash)) throw new HttpError(401, 'Nieprawidłowy e-mail lub hasło.');
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').bind(row.id, Date.now()).run();
  const cookie = await createSession(env, row.id, req);
  return json({ user: publicUser(row) }, 200, { 'set-cookie': cookie });
}

async function logout(env: Env, req: Request) {
  const token = readCookie(req);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0, new URL(req.url).protocol === 'https:') });
}

async function getState(env: Env, req: Request) {
  const u = await requireUser(env, req);
  const row = await env.DB.prepare('SELECT data, version FROM warehouses WHERE user_id = ?').bind(u.id).first<{ data: string; version: number }>();
  if (!row) throw new HttpError(404, 'Brak magazynu.');
  return json({ data: JSON.parse(row.data), version: row.version });
}

async function putState(env: Env, req: Request) {
  const u = await requireUser(env, req);
  const raw = await req.text();
  if (raw.length > MAX_STATE_BYTES) throw new HttpError(413, 'Za dużo danych.');
  let b: { data?: unknown; version?: number };
  try {
    b = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Nieprawidłowe dane.');
  }
  const d = b.data as Record<string, unknown> | undefined;
  if (!d || !Array.isArray(d.products) || typeof d.lastCount !== 'string' || typeof d.counts !== 'object' || typeof d.ordered !== 'object')
    throw new HttpError(400, 'Nieprawidłowe dane magazynu.');
  if (typeof b.version !== 'number') throw new HttpError(400, 'Brak wersji.');

  const res = await env.DB.prepare('UPDATE warehouses SET data = ?, version = version + 1, updated_at = ? WHERE user_id = ? AND version = ?')
    .bind(JSON.stringify(d), Date.now(), u.id, b.version)
    .run();
  if (res.meta.changes === 0) {
    // Someone else (another device) saved first — hand back the current copy.
    const cur = await env.DB.prepare('SELECT data, version FROM warehouses WHERE user_id = ?').bind(u.id).first<{ data: string; version: number }>();
    return json({ error: 'Dane zmieniły się na innym urządzeniu.', data: cur ? JSON.parse(cur.data) : null, version: cur?.version ?? 0 }, 409);
  }
  return json({ version: b.version + 1 });
}

async function api(req: Request, env: Env, path: string): Promise<Response> {
  const route = `${req.method} ${path}`;
  // Basic CSRF guard: state-changing requests must come from this origin.
  if (req.method !== 'GET') {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin) throw new HttpError(403, 'Niedozwolone źródło żądania.');
  }
  switch (route) {
    case 'POST /api/auth/register':
      return register(env, req);
    case 'POST /api/auth/login':
      return login(env, req);
    case 'POST /api/auth/logout':
      return logout(env, req);
    case 'GET /api/auth/me': {
      const u = await currentUser(env, req);
      return json({ user: u ? publicUser(u) : null });
    }
    case 'GET /api/state':
      return getState(env, req);
    case 'PUT /api/state':
      return putState(env, req);
  }
  throw new HttpError(404, 'Nie znaleziono.');
}

export default {
  async fetch(req, env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await api(req, env, pathname);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Błąd serwera. Spróbuj ponownie.' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
