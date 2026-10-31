import { useEffect, useMemo, useRef, useState } from 'react';
import { matches, tokenize } from '../lib/text';
import type { StockedProduct } from '../lib/types';
import { useStore } from '../store';
import { Icon } from './Icon';
import { SearchField } from './SearchField';
import { Thumb } from './Thumb';

/** Finds a product by scanned barcode (EAN) or by its own code. */
export function findByScan(products: StockedProduct[], text: string): StockedProduct | undefined {
  const t = text.trim().toUpperCase();
  return products.find((p) => p.ean === t) ?? products.find((p) => p.code.toUpperCase() === t || p.id.toUpperCase() === t);
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called for every recognised product. */
  onProduct: (p: StockedProduct) => string | void;
  /** Keep scanning after a hit (counting); otherwise close after the first product. */
  continuous?: boolean;
  title: string;
  /** Just read a code (no product lookup) — e.g. filling the EAN field. */
  onRaw?: (text: string) => void;
}

type Controls = { stop: () => void };

/**
 * Camera barcode scanner (ZXing — works in Safari on iPhone/iPad too). Unknown codes can be assigned
 * to a product once; later scans find it. Code can also be typed by hand.
 */
export function ScanDialog({ open, onClose, onProduct, continuous, title, onRaw }: Props) {
  const { products, updateProduct } = useStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<Controls | null>(null);
  const last = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const [error, setError] = useState<string | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [q, setQ] = useState('');
  const productsRef = useRef(products);
  productsRef.current = products;
  const handlers = useRef({ onProduct, continuous, onClose, onRaw });
  handlers.current = { onProduct, continuous, onClose, onRaw };

  const handle = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const now = Date.now();
    // The camera reports the same code many times per second. A code counts again only after it has
    // been out of view for a moment — so holding the phone on one bottle counts it once, and moving to
    // the next identical bottle counts again.
    if (last.current.text === text && now - last.current.at < 1200) {
      last.current.at = now;
      return;
    }
    last.current = { text, at: now };
    if (handlers.current.onRaw) {
      navigator.vibrate?.(60);
      handlers.current.onRaw(text);
      handlers.current.onClose();
      return;
    }
    const p = findByScan(productsRef.current, text);
    if (!p) {
      setUnknown(text);
      return;
    }
    navigator.vibrate?.(60);
    const msg = handlers.current.onProduct(p);
    setFeedback(msg || p.name);
    if (!handlers.current.continuous) handlers.current.onClose();
  };

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (!open) {
      controls.current?.stop();
      controls.current = null;
      if (d.open) d.close();
      return;
    }
    if (!d.open) d.showModal();
    setError(null);
    setUnknown(null);
    setFeedback(null);
    setManual('');
    let cancelled = false;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled || !video.current) return;
        const reader = new BrowserMultiFormatReader();
        controls.current = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video.current, (result) => {
          if (result) handle(result.getText());
        });
        if (cancelled) controls.current?.stop();
      } catch (e) {
        const name = (e as { name?: string }).name;
        setError(
          name === 'NotAllowedError'
            ? 'Brak zgody na aparat. Zezwól na dostęp do kamery w ustawieniach przeglądarki albo wpisz kod ręcznie.'
            : 'Nie udało się uruchomić aparatu. Możesz wpisać kod ręcznie.',
        );
      }
    })();
    return () => {
      cancelled = true;
      controls.current?.stop();
      controls.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const candidates = useMemo(() => {
    const t = tokenize(q);
    return (t.length ? products.filter((p) => matches(t, p.name, p.code, p.brand ?? '')) : products).slice(0, 40);
  }, [q, products]);

  return (
    <dialog ref={dialog} className="dialog scan" aria-labelledby="scan-title" onClose={onClose} onCancel={onClose}>
      <div className="dialog__body" style={{ gap: 12 }}>
        <div className="heading-row" style={{ alignItems: 'center' }}>
          <h2 id="scan-title" style={{ fontSize: 20, lineHeight: '26px', fontWeight: 700 }}>
            {title}
          </h2>
          <button type="button" className="icon-btn" aria-label="Zamknij skaner" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>

        {!unknown && (
          <div className="scan__view">
            <video ref={video} playsInline muted className="scan__video" />
            <span className="scan__frame" aria-hidden="true" />
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        {feedback && !unknown && (
          <div className="catalog__done" role="status">
            <Icon name="check" size={18} /> {feedback}
          </div>
        )}

        {unknown ? (
          <div className="stack-4" style={{ gap: 8 }}>
            <p style={{ fontSize: 15, lineHeight: '22px' }}>
              Nieznany kod <strong className="mono">{unknown}</strong>. Wybierz produkt — kod zostanie zapamiętany i następnym razem rozpozna się sam.
            </p>
            <SearchField id="scan-q" size="filter" value={q} onChange={setQ} placeholder="Szukaj produktu" label="Szukaj produktu dla kodu" />
            <ul className="rows picker__list">
              {candidates.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="row-link"
                    style={{ minHeight: 56 }}
                    onClick={() => {
                      updateProduct(p.id, { ean: unknown });
                      const code = unknown;
                      setUnknown(null);
                      setQ('');
                      navigator.vibrate?.(60);
                      const msg = handlers.current.onProduct({ ...p, ean: code });
                      setFeedback(msg || `${p.name} — kod zapisany`);
                      if (!handlers.current.continuous) handlers.current.onClose();
                    }}
                  >
                    <Thumb src={p.image} size="sm" />
                    <span className="stack-2" style={{ flex: 1 }}>
                      <span className="row-name" style={{ fontSize: 15 }}>
                        {p.name}
                      </span>
                      <span className="code">
                        {p.code}
                        {p.ean ? ` · EAN ${p.ean}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn--quiet" onClick={() => setUnknown(null)}>
              Anuluj — skanuj dalej
            </button>
          </div>
        ) : (
          <form
            style={{ display: 'flex', gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              last.current = { text: '', at: 0 };
              handle(manual);
              setManual('');
            }}
          >
            <label htmlFor="scan-manual" className="sr-only">
              Wpisz kod ręcznie
            </label>
            <input
              id="scan-manual"
              className="input input--mono"
              placeholder="lub wpisz kod / EAN"
              value={manual}
              autoComplete="off"
              onChange={(e) => setManual(e.target.value)}
            />
            <button type="submit" className="btn btn--ghost" disabled={!manual.trim()}>
              OK
            </button>
          </form>
        )}
        {continuous && !unknown && (
          <button type="button" className="btn btn--primary btn--md" onClick={onClose}>
            Gotowe
          </button>
        )}
      </div>
    </dialog>
  );
}

/** Small button that opens the scanner. */
export function ScanButton({ onClick, label = 'Skanuj kod', compact }: { onClick: () => void; label?: string; compact?: boolean }) {
  return compact ? (
    <button type="button" className="icon-btn icon-btn--boxed" aria-label={label} onClick={onClick}>
      <Icon name="scan" size={22} />
    </button>
  ) : (
    <button type="button" className="btn btn--ghost" onClick={onClick}>
      <Icon name="scan" size={18} />
      {label}
    </button>
  );
}
