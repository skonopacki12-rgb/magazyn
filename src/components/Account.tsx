import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth';
import { useStore } from '../store';
import { Icon } from './Icon';
import { ResetDialog } from './ResetDialog';

/** Account button with a small menu: who is signed in, sync state, "Wyloguj". */
export function AccountMenu({ compact }: { compact?: boolean }) {
  const { user, logout } = useAuth();
  const { sync } = useStore();
  const [open, setOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const syncText = sync === 'saving' ? 'Zapisywanie…' : sync === 'error' ? 'Nie zapisano — brak połączenia' : 'Zapisano w chmurze';

  return (
    <div className="account" ref={ref}>
      <button
        type="button"
        className={compact ? 'icon-btn icon-btn--boxed' : 'account__trigger'}
        aria-label={compact ? `Konto: ${user.name}` : undefined}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="user" size={compact ? 22 : 18} />
        {!compact && <span>{user.name}</span>}
      </button>
      {open && (
        <div className="account__menu">
          <div className="stack-2">
            <span className="account__name">{user.name}</span>
            <span className="code">{user.email}</span>
          </div>
          <span className="sync-dot" role="status">
            {syncText}
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--block account__danger"
            onClick={() => {
              setOpen(false);
              setResetOpen(true);
            }}
          >
            Wyzeruj magazyn…
          </button>
          <button type="button" className="btn btn--ghost btn--block" onClick={logout}>
            Wyloguj się
          </button>
        </div>
      )}
      <ResetDialog open={resetOpen} onClose={() => setResetOpen(false)} />
    </div>
  );
}

/** Toast shown only when saving fails or another device's changes were loaded. */
export function SyncNotice() {
  const { sync, retrySync, dismissConflict } = useStore();
  if (sync === 'error')
    return (
      <div className="sync" role="alert">
        <span>Nie udało się zapisać zmian. Ponawiam…</span>
        <button type="button" onClick={retrySync}>
          Zapisz teraz
        </button>
      </div>
    );
  if (sync === 'conflict')
    return (
      <div className="sync" role="status">
        <span>Dane zmieniły się na innym urządzeniu — wczytano najnowszą wersję.</span>
        <button type="button" onClick={dismissConflict}>
          OK
        </button>
      </div>
    );
  return null;
}
