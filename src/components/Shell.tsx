import { Link, NavLink, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { AccountMenu } from './Account';
import { Icon } from './Icon';

/** Bottom tab bar on phones. */
export function TabBar({ toOrderCount }: { toOrderCount?: number }) {
  const { needs, state } = useStore();
  const badge = toOrderCount ?? needs.length;
  return (
    <nav aria-label="Menu główne" className="tabbar">
      <NavLink to="/" end className="tabbar__item">
        <Icon name="search" />
        <span>Szukaj</span>
      </NavLink>
      <NavLink to="/zamowienia" className="tabbar__item">
        <span className="tabbar__icon">
          <Icon name="cart" />
          {badge > 0 && <span className="count-dot">{badge}</span>}
        </span>
        <span>Do zamówienia</span>
      </NavLink>
      <NavLink to="/inwentaryzacja" className="tabbar__item">
        <Icon name="clipboard" />
        <span>Inwentaryzacja</span>
      </NavLink>
      <NavLink to="/szkolenie" className="tabbar__item">
        <span className="tabbar__icon">
          <Icon name="glass" />
          {state.training && <span className="count-dot count-dot--live" aria-label="w trakcie" />}
        </span>
        <span>Szkolenie</span>
      </NavLink>
    </nav>
  );
}

/** Top bar on tablet and laptop. "Stany" covers stock, orders and product views. */
export function TopBar({ variant, children }: { variant: 'tablet' | 'laptop'; children?: React.ReactNode }) {
  const { pathname } = useLocation();
  const onInventory = pathname.startsWith('/inwentaryzacja');
  const { state: st, pending } = useStore();
  const training = st.training;
  const pendingCount = pending.length;
  const iconSize = variant === 'tablet' ? 20 : 18;
  return (
    <header className={`topbar topbar--${variant}`}>
      <span className="topbar__brand">Magazyn</span>
      <nav aria-label="Menu główne" className="topbar__nav">
        <Link to="/" className="topbar__link" aria-current={onInventory || /^\/(zamowienia|polki|szkolenie)/.test(pathname) ? undefined : 'page'}>
          <Icon name="search" size={iconSize} />
          <span className="label-wide">Stany</span>
        </Link>
        <Link to="/inwentaryzacja" className="topbar__link" aria-current={onInventory ? 'page' : undefined}>
          <Icon name="clipboard" size={iconSize} />
          <span className="label-wide">Inwentaryzacja</span>
        </Link>
        <Link to="/zamowienia" className="topbar__link" aria-current={pathname.startsWith('/zamowienia') ? 'page' : undefined}>
          <Icon name="cart" size={iconSize} />
          <span className="label-wide">Zamówienia</span>
          {pendingCount > 0 && <span className="live-pill">{pendingCount} w drodze</span>}
        </Link>
        <Link to="/szkolenie" className="topbar__link" aria-current={pathname.startsWith('/szkolenie') ? 'page' : undefined}>
          <Icon name="glass" size={iconSize} />
          <span className="label-wide">Szkolenie</span>
          {training && <span className="live-pill">w trakcie</span>}
        </Link>
        <Link to="/polki" className="topbar__link" aria-current={pathname.startsWith('/polki') ? 'page' : undefined}>
          <Icon name="shelf" size={iconSize} />
          <span className="label-wide">Półki</span>
        </Link>
      </nav>
      {children ?? <span className="spacer" />}
      <AccountMenu />
    </header>
  );
}
