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
        <Link to="/" className="topbar__link" aria-current={onInventory || pathname.startsWith('/zamowienia') ? undefined : 'page'}>
          <Icon name="search" size={iconSize} />
          Stany
        </Link>
        <Link to="/inwentaryzacja" className="topbar__link" aria-current={onInventory ? 'page' : undefined}>
          <Icon name="clipboard" size={iconSize} />
          Inwentaryzacja
        </Link>
        <Link to="/zamowienia" className="topbar__link" aria-current={pathname.startsWith('/zamowienia') ? 'page' : undefined}>
          <Icon name="cart" size={iconSize} />
          Zamówienia
          {pendingCount > 0 && <span className="live-pill">{pendingCount} w drodze</span>}
        </Link>
        <Link to="/szkolenie" className="topbar__link">
          <Icon name="glass" size={iconSize} />
          Szkolenie
          {training && <span className="live-pill">w trakcie</span>}
        </Link>
      </nav>
      {children ?? <span className="spacer" />}
      <AccountMenu />
    </header>
  );
}
