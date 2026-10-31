import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { TabBar, TopBar } from '../components/Shell';
import { useBreakpoint } from '../lib/useBreakpoint';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

function keyBytes(b64: string): Uint8Array {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function post(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as { error?: string }).error ?? `Błąd ${r.status}`);
  return d;
}

/** Daily push reminders: expiry dates, products to order, unfinished training. */
export function RemindersScreen() {
  const bp = useBreakpoint();
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ok = supported();

  useEffect(() => {
    if (!ok) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then(setSub)
      .catch(() => undefined);
  }, [ok]);

  const enable = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Powiadomienia są zablokowane. Zezwól na nie w ustawieniach przeglądarki / telefonu.');
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch('/api/push/key', { credentials: 'same-origin' })).json();
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      await post('/api/push/subscribe', s.toJSON());
      setSub(s);
      setMsg({ ok: true, text: 'Przypomnienia włączone na tym urządzeniu.' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!sub) return;
    setBusy(true);
    try {
      await post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
      await sub.unsubscribe();
      setSub(null);
      setMsg({ ok: true, text: 'Przypomnienia wyłączone na tym urządzeniu.' });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const r = (await post('/api/push/test')) as { sent: number };
      setMsg({
        ok: r.sent > 0,
        text: r.sent ? `Wysłano na ${r.sent} ${r.sent === 1 ? 'urządzenie' : 'urządzenia'}.` : 'Nie udało się wysłać — wyłącz i włącz przypomnienia ponownie.',
      });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="catalog">
      {bp !== 'phone' && <TopBar variant={bp === 'laptop' ? 'laptop' : 'tablet'} />}
      <main className="catalog__main" style={{ paddingTop: bp === 'phone' ? 8 : 20 }}>
        <div className="catalog__inner" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680 }}>
          <div style={{ margin: '0 -8px' }}>
            <Link to="/" className="back-link">
              <Icon name="chevronLeft" size={22} />
              Magazyn
            </Link>
          </div>
          <div className="stack-2">
            <h1 className="title-xl">Przypomnienia</h1>
            <p className="subtitle subtitle--lg">
              Codziennie rano (ok. 7:15) powiadomienie, jeśli coś wymaga uwagi: partie po terminie lub z kończącym się terminem, produkty do zamówienia,
              nierozliczone szkolenie. Gdy wszystko jest w porządku — cisza.
            </p>
          </div>
          {msg && (
            <div className={msg.ok ? 'catalog__done' : 'card over-warn'} role="status">
              <span>{msg.text}</span>
            </div>
          )}
          {!ok ? (
            <div className="card card--dashed empty">
              <p className="empty__text">
                {isIos() && !standalone()
                  ? 'Na iPhonie i iPadzie powiadomienia działają, gdy aplikacja jest dodana do ekranu głównego: Safari → Udostępnij → „Do ekranu początkowego”. Potem otwórz ją z ikony i wróć tutaj.'
                  : 'Ta przeglądarka nie obsługuje powiadomień.'}
              </p>
            </div>
          ) : (
            <section className="card card--16 backup">
              <h2 className="empty__title empty__title--sm">To urządzenie</h2>
              <p className="empty__text">{sub ? 'Przypomnienia są włączone.' : 'Przypomnienia są wyłączone.'}</p>
              <div className="backup__actions">
                {sub ? (
                  <>
                    <button type="button" className="btn btn--primary btn--md" disabled={busy} onClick={test}>
                      Wyślij testowe
                    </button>
                    <button type="button" className="btn btn--quiet btn--md" disabled={busy} onClick={disable}>
                      Wyłącz
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn--primary btn--md" disabled={busy} onClick={enable}>
                    Włącz przypomnienia
                  </button>
                )}
              </div>
              {isIos() && !standalone() && <p className="hint">Na iPhonie/iPadzie włącz je w aplikacji otwartej z ekranu głównego.</p>}
            </section>
          )}
        </div>
      </main>
      {bp === 'phone' && <TabBar />}
    </div>
  );
}
