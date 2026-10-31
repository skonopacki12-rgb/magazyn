import { CopyButton, OrderGroups, useOrders } from '../../components/Orders';
import { TabBar } from '../../components/Shell';
import { formatDate } from '../../lib/text';
import { useStore } from '../../store';

export function PhoneOrders() {
  const { state } = useStore();
  const m = useOrders();
  return (
    <div className="phone">
      <header className="phone__header">
        <div className="stack-2">
          <h1 className="title-xl">Do zamówienia</h1>
          <p className="subtitle">Poniżej minimum wg inwentaryzacji z {formatDate(state.lastCount)}</p>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48, padding: '10px 14px' }}>
          <span style={{ fontSize: 15, lineHeight: '20px', fontWeight: 600 }}>
            Zamówione {m.doneCount} z {m.total}
          </span>
          <span className="hint">Odhacz po złożeniu zamówienia</span>
        </div>
      </header>
      <main className="phone__main phone__main--loose">
        {m.total ? (
          <OrderGroups m={m} variant="phone" />
        ) : (
          <div className="card card--18 empty">
            <h2 className="empty__title empty__title--sm">Nic do zamówienia</h2>
            <p className="empty__text">Wszystkie produkty są powyżej minimum.</p>
          </div>
        )}
      </main>
      <div className="phone__footer">
        <CopyButton m={m} className="btn btn--primary btn--lg btn--block" iconSize={20} />
        <p className="hint hint--center">Lista z ilościami trafia do schowka — wklej ją w maila lub SMS.</p>
      </div>
      <TabBar />
    </div>
  );
}
