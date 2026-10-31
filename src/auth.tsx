import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { cachedUser, clearCopy, rememberUser } from './lib/offline';
import { api, ApiError, type User } from './lib/api';

interface Auth {
  user: User;
  logout: () => Promise<void>;
  /** Called when the API says the session is gone. */
  expired: () => void;
}

const Ctx = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAuth must be used inside <AuthGate>');
  return a;
}

/** Renders `signedOut` until someone logs in, then `children` with the user in context. */
export function AuthGate({ children, signedOut }: { children: ReactNode; signedOut: (onSignedIn: (u: User) => void) => ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(() => {
    setError(null);
    api
      .me()
      .then((r) => {
        rememberUser(r.user);
        setUser(r.user);
      })
      .catch((e: ApiError) => {
        // No network: carry on with the account remembered on this device (works offline).
        const cached = e.status === 0 ? cachedUser() : null;
        if (cached) setUser(cached);
        else setError(e.message);
      });
  }, []);
  useEffect(check, [check]);

  if (error) return <Splash text={error} retry={check} />;
  if (user === undefined) return <Splash text="Ładowanie…" />;
  if (!user)
    return (
      <>
        {signedOut((u) => {
          rememberUser(u);
          setUser(u);
        })}
      </>
    );
  return (
    <Ctx.Provider
      value={{
        user,
        logout: async () => {
          await api.logout().catch(() => undefined);
          clearCopy(user.id);
          rememberUser(null);
          setUser(null);
        },
        expired: () => {
          rememberUser(null);
          setUser(null);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function Splash({ text, retry }: { text: string; retry?: () => void }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 16 }}>
      <span className="title-xl">Magazyn</span>
      <p className="muted" role="status" style={{ fontSize: 15, textAlign: 'center' }}>
        {text}
      </p>
      {retry && (
        <button type="button" className="btn btn--outline btn--md" onClick={retry}>
          Spróbuj ponownie
        </button>
      )}
    </div>
  );
}
