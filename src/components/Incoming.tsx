import { Link } from 'react-router-dom';
import type { StockedProduct } from '../lib/types';
import { Icon } from './Icon';

/** "W drodze: 3 szt." — shown on product views when part of an order hasn't arrived yet. */
export function IncomingNote({ p }: { p: StockedProduct }) {
  if (!p.incoming) return null;
  return (
    <Link to="/zamowienia?widok=w-drodze" className="incoming">
      <Icon name="truck" size={18} />
      <span style={{ flex: 1 }}>
        W drodze: {p.incoming} {p.unit}
      </span>
      <span className="hint" style={{ color: 'inherit' }}>
        przyjmij dostawę ›
      </span>
    </Link>
  );
}
