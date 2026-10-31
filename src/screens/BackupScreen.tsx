import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { TabBar, TopBar } from '../components/Shell';
import { catLabel } from '../lib/catalog';
import { toCsv, download } from '../lib/csv';
import { expiryState, fifoSort } from '../lib/fifo';
import { MOVE_LABEL } from '../lib/training';
import { formatDate, plural, todayIso } from '../lib/text';
import { useBreakpoint } from '../lib/useBreakpoint';
import { useStore, type State } from '../store';

const stamp = () => todayIso();

/** Checks that a file looks like a backup of this app before restoring it. */
function parseBackup(text: string): State {
  const raw = JSON.parse(text) as { app?: string; data?: State } | State;
  const data = 'data' in raw && raw.data ? raw.data : (raw as State);
  if (!data || !Array.isArray(data.products) || typeof data.lastCount !== 'string' || typeof data.counts !== 'object')
    throw new Error('To nie jest kopia zapasowa Magazynu.');
  return data;
}

export function BackupScreen() {
  const bp = useBreakpoint();
  const { state, products, restore } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const active = state.products.filter((p) => !p.archived);

  const backup = () => {
    download(
      `magazyn-kopia-${stamp()}.json`,
      JSON.stringify({ app: 'magazyn', version: 1, exportedAt: new Date().toISOString(), data: state }, null, 1),
      'application/json',
    );
    setMsg({ ok: true, text: 'Pobrano pełną kopię. Trzymaj ją np. w iCloud albo na dysku.' });
  };

  const csvStock = () =>
    download(
      `magazyn-stany-${stamp()}.csv`,
      toCsv(
        [
          'Kod',
          'Nazwa',
          'Marka',
          'Kategoria',
          'Jednostka',
          'Stan',
          'Minimum',
          'Do zamówienia',
          'W drodze',
          'Półki',
          'Najbliższy termin',
          'Otwarte',
          'Cena netto',
          'Wartość netto',
        ],
        products.map((p) => {
          const lots = p.lots ?? [];
          const shelves = [...new Set(lots.map((l) => l.shelf).filter(Boolean))].join(', ');
          const next = fifoSort(lots.filter((l) => l.expiresAt)).sort((a, b) => (a.expiresAt! < b.expiresAt! ? -1 : 1))[0];
          const open = lots.filter((l) => l.open).reduce((s, l) => s + l.qty, 0);
          const price = (p as { price?: number }).price;
          return [
            p.code,
            p.name,
            p.brand ?? '',
            catLabel(p.cat),
            p.unit,
            p.qty,
            p.min,
            p.toOrder,
            p.incoming,
            shelves,
            next?.expiresAt ?? '',
            open || '',
            price ?? '',
            price != null ? Math.round(price * p.qty * 100) / 100 : '',
          ];
        }),
      ),
    );

  const csvLots = () =>
    download(
      `magazyn-partie-${stamp()}.csv`,
      toCsv(
        ['Kod', 'Nazwa', 'Ilość', 'Jednostka', 'Półka', 'Stan butelki', 'Otwarta dnia', 'Ważne do', 'Termin', 'Zgrzewka'],
        products.flatMap((p) =>
          fifoSort(p.lots ?? []).map((l) => {
            const ex = expiryState(l);
            return [
              p.code,
              p.name,
              l.qty,
              p.unit,
              l.shelf ?? '',
              l.open ? 'otwarta' : 'zamknięta',
              l.openedAt ?? '',
              l.expiresAt ?? '',
              ex === 'expired' ? 'po terminie' : ex === 'soon' ? 'kończy się' : '',
              l.pack ? 'tak' : '',
            ];
          }),
        ),
      ),
    );

  const csvLog = () =>
    download(
      `magazyn-dziennik-${stamp()}.csv`,
      toCsv(
        ['Data', 'Produkt', 'Ruch', 'Ilość', 'Jednostka', 'Uwagi'],
        (state.log ?? []).map((m) => [m.at.replace('T', ' ').slice(0, 16), m.name, MOVE_LABEL[m.kind], m.qty, m.unit, m.note ?? '']),
      ),
    );

  const csvHistory = () =>
    download(
      `magazyn-historia-${stamp()}.csv`,
      toCsv(
        ['Kod', 'Nazwa', 'Data inwentaryzacji', 'Stan', 'Jednostka'],
        active.flatMap((p) => p.hist.map((h) => [p.code, p.name, h.date, h.qty, p.unit])),
      ),
    );

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const data = parseBackup(await f.text());
      const n = data.products.filter((p) => !p.archived).length;
      if (
        !window.confirm(
          `Przywrócić kopię z pliku „${f.name}”? (${n} ${plural(n, 'produkt', 'produkty', 'produktów')}, ostatnia inwentaryzacja ${formatDate(data.lastCount)}).\n\nObecne dane zostaną zastąpione — najpierw pobierz kopię obecnego stanu, jeśli chcesz ją zachować.`,
        )
      )
        return;
      restore(data);
      setMsg({ ok: true, text: `Przywrócono kopię: ${n} ${plural(n, 'produkt', 'produkty', 'produktów')}. Zapisuje się w chmurze.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof SyntaxError ? 'Plik nie jest poprawnym plikiem JSON.' : (e as Error).message });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="catalog">
      {bp !== 'phone' && <TopBar variant={bp === 'laptop' ? 'laptop' : 'tablet'} />}
      <main className="catalog__main" style={{ paddingTop: bp === 'phone' ? 8 : 20 }}>
        <div className="catalog__inner" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
          <div style={{ margin: '0 -8px' }}>
            <Link to="/" className="back-link">
              <Icon name="chevronLeft" size={22} />
              Magazyn
            </Link>
          </div>
          <div className="stack-2">
            <h1 className="title-xl">Kopia zapasowa i eksport</h1>
            <p className="subtitle subtitle--lg">Dane są w chmurze Cloudflare. Kopia w pliku chroni przed pomyłką (np. wyzerowaniem magazynu).</p>
          </div>
          {msg && (
            <div className={msg.ok ? 'catalog__done' : 'card over-warn'} role="status">
              <span>{msg.text}</span>
            </div>
          )}

          <section className="card card--16 backup">
            <h2 className="empty__title empty__title--sm">Pełna kopia</h2>
            <p className="empty__text">Wszystko: produkty, partie, półki, zamówienia, szkolenie w toku, dziennik. Plik .json.</p>
            <div className="backup__actions">
              <button type="button" className="btn btn--primary btn--md" onClick={backup}>
                <Icon name="copy" size={18} />
                Pobierz kopię
              </button>
              <button type="button" className="btn btn--outline btn--md" onClick={() => fileRef.current?.click()}>
                Przywróć z pliku…
              </button>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            </div>
          </section>

          <section className="card card--16 backup">
            <h2 className="empty__title empty__title--sm">Eksport do Excela (CSV)</h2>
            <p className="empty__text">Pliki otwierają się w Excelu i Numbers (separator „;”, polskie znaki).</p>
            <div className="backup__actions">
              <button type="button" className="btn btn--ghost btn--md" onClick={csvStock}>
                Stany ({products.length})
              </button>
              <button type="button" className="btn btn--ghost btn--md" onClick={csvLots}>
                Partie i terminy
              </button>
              <button type="button" className="btn btn--ghost btn--md" onClick={csvHistory}>
                Historia inwentaryzacji
              </button>
              <button type="button" className="btn btn--ghost btn--md" onClick={csvLog}>
                Dziennik ruchów ({(state.log ?? []).length})
              </button>
            </div>
          </section>
        </div>
      </main>
      {bp === 'phone' && <TabBar />}
    </div>
  );
}
