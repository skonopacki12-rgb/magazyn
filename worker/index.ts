import { joinParts, mergeLog, PART_NAMES, pickPart, splitState, validPart, type PartName } from '../src/lib/parts';
import { SEED_LAST_COUNT, SEED_PRODUCTS } from '../src/lib/seed';
import { hashPassword, PBKDF2_ITERATIONS, randomHex, safeEqual, sha256 } from './crypto';
import { dailyReminders, notifyUser, reminderFor, vapidKeys } from './reminders';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Optional comma-separated e-mails that may still register after the first account exists. */
  ALLOWED_EMAILS?: string;
  /** Optional VAPID contact (mailto: or https:), defaults to the app's address. */
  PUSH_SUBJECT?: string;
}

/**
 * The app is for one owner: registration is open only while there are no accounts,
 * or for addresses listed in the ALLOWED_EMAILS variable (Cloudflare dashboard → Settings → Variables).
 */
async function registrationOpen(env: Env, email?: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  if (!row?.n) return true;
  if (!email) return false;
  const allowed = (env.ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowed.some((a) => a === email || (a.startsWith('*@') && email.endsWith(a.slice(1))));
}

const COOKIE = 'magazyn_session';
const SESSION_DAYS = 30;

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

  if (!(await registrationOpen(env, email))) throw new HttpError(403, 'Rejestracja jest zamknięta. Zaloguj się na istniejące konto.');
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
    ...Object.entries(splitState(initial)).map(([part, data]) =>
      env.DB.prepare('INSERT INTO warehouse_parts (user_id, part, data, version, updated_at) VALUES (?, ?, ?, 1, ?)').bind(id, part, JSON.stringify(data), now),
    ),
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

const MAX_PART_BYTES = 1_900_000;

interface PartRow {
  part: string;
  data: string;
  version: number;
}

/** Loads the user's parts; on first use splits the old single document into parts. */
async function loadParts(env: Env, userId: string): Promise<PartRow[]> {
  const rows = (await env.DB.prepare('SELECT part, data, version FROM warehouse_parts WHERE user_id = ?').bind(userId).all<PartRow>()).results;
  if (rows.length) return rows;
  const old = await env.DB.prepare('SELECT data FROM warehouses WHERE user_id = ?').bind(userId).first<{ data: string }>();
  if (!old) throw new HttpError(404, 'Brak magazynu.');
  const parts = splitState(JSON.parse(old.data));
  const now = Date.now();
  await env.DB.batch(
    PART_NAMES.map((p) =>
      env.DB.prepare('INSERT OR IGNORE INTO warehouse_parts (user_id, part, data, version, updated_at) VALUES (?, ?, ?, 1, ?)').bind(userId, p, JSON.stringify(parts[p]), now),
    ),
  );
  return (await env.DB.prepare('SELECT part, data, version FROM warehouse_parts WHERE user_id = ?').bind(userId).all<PartRow>()).results;
}

async function getState(env: Env, req: Request) {
  const u = await requireUser(env, req);
  const rows = await loadParts(env, u.id);
  const parts: Record<string, Record<string, unknown>> = {};
  const versions: Record<string, number> = {};
  for (const r of rows) {
    parts[r.part] = JSON.parse(r.data);
    versions[r.part] = r.version;
  }
  for (const p of PART_NAMES) versions[p] ??= 0;
  return json({ data: joinParts(parts), versions });
}

/**
 * Saves changed parts. Each part is checked against its own version; a part changed meanwhile on
 * another device comes back in `conflicts` (the others are saved). The log is merged, never conflicts.
 */
async function putParts(env: Env, req: Request) {
  const u = await requireUser(env, req);
  const raw = await req.text();
  if (raw.length > PART_NAMES.length * MAX_PART_BYTES) throw new HttpError(413, 'Za dużo danych.');
  let b: { parts?: Record<string, { data?: Record<string, unknown>; version?: number }> };
  try {
    b = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Nieprawidłowe dane.');
  }
  await loadParts(env, u.id); // make sure rows exist (migration)
  const versions: Record<string, number> = {};
  const conflicts: Record<string, { data: unknown; version: number }> = {};
  const merged: Record<string, { data: unknown; version: number }> = {};
  const now = Date.now();

  for (const [name, part] of Object.entries(b.parts ?? {})) {
    if (!PART_NAMES.includes(name as PartName)) throw new HttpError(400, `Nieznana część: ${name}`);
    const p = name as PartName;
    const data = pickPart(part.data ?? {}, p);
    if (!validPart(p, data)) throw new HttpError(400, `Nieprawidłowe dane: ${name}`);
    if (typeof part.version !== 'number') throw new HttpError(400, 'Brak wersji.');
    const cur = await env.DB.prepare('SELECT data, version FROM warehouse_parts WHERE user_id = ? AND part = ?').bind(u.id, p).first<{ data: string; version: number }>();

    if (p === 'log') {
      const log = mergeLog((cur ? JSON.parse(cur.data).log : []) as { id: string; at: string }[], (data.log ?? []) as { id: string; at: string }[]);
      const text = JSON.stringify({ log });
      const v = (cur?.version ?? 0) + 1;
      await env.DB.prepare('INSERT INTO warehouse_parts (user_id, part, data, version, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, part) DO UPDATE SET data = excluded.data, version = excluded.version, updated_at = excluded.updated_at')
        .bind(u.id, p, text, v, now)
        .run();
      versions[p] = v;
      merged[p] = { data: { log }, version: v };
      continue;
    }

    const text = JSON.stringify(data);
    if (text.length > MAX_PART_BYTES) throw new HttpError(413, `Za dużo danych w części „${name}”.`);
    if (!cur) {
      await env.DB.prepare('INSERT INTO warehouse_parts (user_id, part, data, version, updated_at) VALUES (?, ?, ?, 1, ?)').bind(u.id, p, text, now).run();
      versions[p] = 1;
      continue;
    }
    const res = await env.DB.prepare('UPDATE warehouse_parts SET data = ?, version = version + 1, updated_at = ? WHERE user_id = ? AND part = ? AND version = ?')
      .bind(text, now, u.id, p, part.version)
      .run();
    if (res.meta.changes === 0) {
      const fresh = await env.DB.prepare('SELECT data, version FROM warehouse_parts WHERE user_id = ? AND part = ?').bind(u.id, p).first<{ data: string; version: number }>();
      conflicts[p] = { data: fresh ? JSON.parse(fresh.data) : {}, version: fresh?.version ?? 0 };
    } else versions[p] = part.version + 1;
  }
  return json({ versions, conflicts, merged });
}

/** Contact for push services (VAPID "sub"): the app's own address. */
const pushSubject = (req: Request | null, env: Env) => env.PUSH_SUBJECT ?? (req ? new URL(req.url).origin : 'https://magazyn.workers.dev');

async function pushSubscribe(env: Env, req: Request) {
  const u = await requireUser(env, req);
  const b = await body<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>(req);
  if (!b.endpoint?.startsWith('https://') && !b.endpoint?.startsWith('http://localhost')) throw new HttpError(400, 'Nieprawidłowa subskrypcja.');
  if (!b.keys?.p256dh || !b.keys?.auth) throw new HttpError(400, 'Brak kluczy subskrypcji.');
  await env.DB.prepare(
    'INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth',
  )
    .bind(b.endpoint, u.id, b.keys.p256dh, b.keys.auth, Date.now())
    .run();
  return json({ ok: true });
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
    case 'GET /api/push/key':
      return json({ publicKey: (await vapidKeys(env)).publicKey });
    case 'POST /api/push/subscribe':
      return pushSubscribe(env, req);
    case 'POST /api/push/unsubscribe': {
      const u = await requireUser(env, req);
      const b = await body<{ endpoint?: string }>(req);
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(b.endpoint ?? '', u.id).run();
      return json({ ok: true });
    }
    case 'POST /api/push/test': {
      const u = await requireUser(env, req);
      const msg = (await reminderFor(env, u.id)) ?? { title: 'Magazyn', body: 'Powiadomienia działają — nic dziś nie wymaga uwagi.', url: '/' };
      return json(await notifyUser(env, u.id, msg, pushSubject(req, env)));
    }
    case 'GET /api/auth/config':
      return json({ registration: await registrationOpen(env) });
    case 'GET /api/auth/me': {
      const u = await currentUser(env, req);
      return json({ user: u ? publicUser(u) : null });
    }
    case 'GET /api/state':
      return getState(env, req);
    case 'PUT /api/state/parts':
      return putParts(env, req);
    case 'PUT /api/state':
      throw new HttpError(410, 'Aplikacja została zaktualizowana — odśwież stronę.');
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
  /** Daily reminders (cron in wrangler.jsonc). */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      dailyReminders(env, pushSubject(null, env)).catch((e) => {
        console.error('daily reminders failed', e);
        throw e;
      }),
    );
  },
} satisfies ExportedHandler<Env>;
