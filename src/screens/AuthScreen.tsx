import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, type User } from '../lib/api';

type Mode = 'login' | 'register';

export function AuthScreen({ onSignedIn }: { onSignedIn: (u: User) => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const mode: Mode = pathname === '/rejestracja' ? 'register' : 'login';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Registration closes once the owner's account exists.
  const [canRegister, setCanRegister] = useState(true);
  useEffect(() => {
    api
      .config()
      .then((c) => setCanRegister(c.registration))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!canRegister && pathname === '/rejestracja') navigate('/logowanie', { replace: true });
  }, [canRegister, pathname, navigate]);

  const switchTo = (m: Mode) => {
    setError(null);
    navigate(m === 'register' ? '/rejestracja' : '/logowanie', { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'register') {
      if (!name.trim()) return setError('Podaj imię lub nazwę.');
      if (password.length < 8) return setError('Hasło musi mieć co najmniej 8 znaków.');
      if (password !== password2) return setError('Hasła nie są takie same.');
    }
    setBusy(true);
    try {
      const r = mode === 'register' ? await api.register(name.trim(), email.trim(), password) : await api.login(email.trim(), password);
      navigate('/', { replace: true });
      onSignedIn(r.user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__card card card--18">
        <div className="stack-4">
          <h1 className="title-xl">Magazyn</h1>
          <p className="subtitle subtitle--lg">
            {mode === 'login' ? 'Zaloguj się, aby zobaczyć stany magazynowe.' : 'Załóż konto — dostaniesz magazyn z przykładowymi produktami.'}
          </p>
        </div>

        {canRegister && (
          <div className="seg" role="group" aria-label="Rodzaj formularza">
            <button type="button" className="seg__btn" style={{ flex: 1 }} aria-pressed={mode === 'login'} onClick={() => switchTo('login')}>
              Logowanie
            </button>
            <button type="button" className="seg__btn" style={{ flex: 1 }} aria-pressed={mode === 'register'} onClick={() => switchTo('register')}>
              Rejestracja
            </button>
          </div>
        )}

        <form className="stack-4" style={{ gap: 14 }} onSubmit={submit} noValidate>
          {mode === 'register' && (
            <div className="field">
              <label htmlFor="a-name" className="field__label">
                Imię lub nazwa
              </label>
              <input id="a-name" className="input" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="a-email" className="field__label">
              E-mail
            </label>
            <input
              id="a-email"
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="a-pass" className="field__label">
              Hasło
            </label>
            <input
              id="a-pass"
              className="input"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={mode === 'register' ? 'a-pass-hint' : undefined}
            />
            {mode === 'register' && (
              <p id="a-pass-hint" className="hint">
                Co najmniej 8 znaków.
              </p>
            )}
          </div>
          {mode === 'register' && (
            <div className="field">
              <label htmlFor="a-pass2" className="field__label">
                Powtórz hasło
              </label>
              <input
                id="a-pass2"
                className="input"
                type="password"
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy}>
            {busy ? 'Chwileczkę…' : mode === 'login' ? 'Zaloguj się' : 'Załóż konto'}
          </button>
        </form>

        {canRegister && (
          <p className="hint hint--center">
            {mode === 'login' ? 'Nie masz konta? ' : 'Masz już konto? '}
            <button type="button" className="link-btn" onClick={() => switchTo(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Zarejestruj się' : 'Zaloguj się'}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
