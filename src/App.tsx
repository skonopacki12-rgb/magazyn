import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { SyncNotice } from './components/Account';
import { ShelfOptions } from './components/Lots';
import { allShelves } from './lib/fifo';
import { useStore } from './store';
import { useBreakpoint } from './lib/useBreakpoint';
import { CatalogScreen } from './screens/CatalogScreen';
import { ExpiryScreen } from './screens/ExpiryScreen';
import { OrdersScreen } from './screens/OrdersScreen';
import { ShelfEditor, ShelvesScreen } from './screens/ShelvesScreen';
import { ShelfCount, ShelfCountList } from './screens/ShelfCountScreen';
import { TrainingScreen } from './screens/TrainingScreen';
import { PhoneInventory } from './screens/phone/Inventory';
import { PhoneProduct } from './screens/phone/Product';
import { PhoneSearch } from './screens/phone/Search';
import { LaptopInventory, TabletInventory } from './screens/wide/Inventory';
import { LaptopStock } from './screens/wide/LaptopStock';
import { TabletStock } from './screens/wide/TabletStock';
import type { StockPanelInit } from './screens/wide/useStockPanel';

/** On tablet/laptop, orders and product pages live inside the stock screen's side panel. */
function WideStock({ init }: { init?: StockPanelInit }) {
  const bp = useBreakpoint();
  const { key } = useLocation();
  const Screen = bp === 'laptop' ? LaptopStock : TabletStock;
  return <Screen key={key} init={init} />;
}

function ProductRoute() {
  const bp = useBreakpoint();
  const { id } = useParams();
  if (bp === 'phone') return <PhoneProduct key={id} />;
  return <WideStock init={{ panel: 'product', selected: id }} />;
}

function NewProductRoute() {
  const bp = useBreakpoint();
  const { search } = useLocation();
  if (bp === 'phone') return <PhoneProduct isNew />;
  return <WideStock init={{ panel: 'form', newName: new URLSearchParams(search).get('nazwa') ?? '' }} />;
}

export function App() {
  const bp = useBreakpoint();
  const { products, state } = useStore();
  const shelves = allShelves(products, Object.values(state.countLots ?? {}));
  return (
    <>
      <Routes>
        <Route path="/" element={bp === 'phone' ? <PhoneSearch /> : <WideStock />} />
        <Route path="/zamowienia" element={<OrdersScreen />} />
        <Route path="/inwentaryzacja" element={bp === 'phone' ? <PhoneInventory /> : bp === 'tablet' ? <TabletInventory /> : <LaptopInventory />} />
        <Route path="/katalog" element={<CatalogScreen />} />
        <Route path="/terminy" element={<ExpiryScreen />} />
        <Route path="/szkolenie" element={<TrainingScreen />} />
        <Route path="/polki" element={<ShelvesScreen />} />
        <Route path="/inwentaryzacja/polki" element={<ShelfCountList />} />
        <Route path="/inwentaryzacja/polki/:name" element={<ShelfCount />} />
        <Route path="/polki/:id" element={<ShelfEditor />} />
        <Route path="/produkt/nowy" element={<NewProductRoute />} />
        <Route path="/produkt/:id" element={<ProductRoute />} />
        <Route path="/logowanie" element={<Navigate to="/" replace />} />
        <Route path="/rejestracja" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SyncNotice />
      <ShelfOptions shelves={shelves} />
    </>
  );
}
