import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { countProducts } from '../lib/text';
import { useStore, type ResetMode } from '../store';

const CONFIRM_WORD = 'ZERUJ';

/** Confirmation dialog for wiping the warehouse. The user picks what to reset and must type ZERUJ. */
export function ResetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { products, resetWarehouse } = useStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState<ResetMode>('products');
  const [word, setWord] = useState('');

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setWord('');
      setMode('products');
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  const ok = word.trim().toUpperCase() === CONFIRM_WORD;
  const confirm = () => {
    if (!ok) return;
    resetWarehouse(mode);
    onClose();
    navigate('/', { replace: true });
  };

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="reset-title" onClose={onClose} onCancel={onClose}>
      <form
        method="dialog"
        className="dialog__body"
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
        }}
      >
        <div className="stack-4" style={{ gap: 6 }}>
          <h2 id="reset-title" style={{ fontSize: 22, lineHeight: '28px', fontWeight: 700 }}>
            Wyzeruj magazyn
          </h2>
          <p className="muted" style={{ fontSize: 15, lineHeight: '22px' }}>
            Tej operacji nie można cofnąć. Dotyczy wszystkich Twoich urządzeń.
          </p>
        </div>

        <fieldset className="choice">
          <legend className="field__label">Co wyzerować?</legend>
          <label className={`choice__opt${mode === 'products' ? ' is-on' : ''}`}>
            <input type="radio" name="reset-mode" checked={mode === 'products'} onChange={() => setMode('products')} />
            <span className="stack-2">
              <span className="row-name">Usuń wszystkie produkty</span>
              <span className="hint">Pusty magazyn — zaczynasz od zera. Zniknie {countProducts(products.length)} z historią stanów.</span>
            </span>
          </label>
          <label className={`choice__opt${mode === 'stock' ? ' is-on' : ''}`}>
            <input type="radio" name="reset-mode" checked={mode === 'stock'} onChange={() => setMode('stock')} />
            <span className="stack-2">
              <span className="row-name">Wyzeruj tylko stany</span>
              <span className="hint">Produkty i minima zostają, każdy stan = 0. Historia inwentaryzacji zostaje.</span>
            </span>
          </label>
        </fieldset>

        <div className="field">
          <label htmlFor="reset-word" className="field__label">
            Wpisz {CONFIRM_WORD}, aby potwierdzić
          </label>
          <input
            id="reset-word"
            className="input input--mono input--upper"
            type="text"
            autoComplete="off"
            value={word}
            onChange={(e) => setWord(e.target.value)}
          />
        </div>

        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost btn--md" onClick={onClose}>
            Anuluj
          </button>
          <button type="submit" className="btn btn--danger btn--md" disabled={!ok}>
            {mode === 'products' ? 'Usuń wszystkie produkty' : 'Wyzeruj stany'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
