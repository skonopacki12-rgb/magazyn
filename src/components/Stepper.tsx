import { digitsOnly } from '../lib/text';
import { Icon } from './Icon';

interface Props {
  /** +/- move by this (e.g. 12 for full cases). */
  step?: number;
  id: string;
  value: number | string;
  onChange: (v: string) => void;
  unit?: string;
  small?: boolean;
  inputWidth?: number;
  label: { dec: string; inc: string };
}

/** −  [ n ]  +  for the "Minimum na stanie" value. */
export function Stepper({ id, value, onChange, unit, small, inputWidth, label, step = 1 }: Props) {
  const n = Number(value) || 0;
  return (
    <div className={`stepper${small ? ' stepper--sm' : ''}`}>
      <button type="button" className="stepper__btn" aria-label={label.dec} onClick={() => onChange(String(Math.max(0, Math.ceil(n / step) * step - step)))}>
        <Icon name="minus" size={small ? 18 : 20} />
      </button>
      <input
        id={id}
        className="stepper__input"
        type="text"
        inputMode="numeric"
        value={value}
        style={inputWidth ? { width: inputWidth } : undefined}
        onChange={(e) => onChange(digitsOnly(e.target.value))}
      />
      <button type="button" className="stepper__btn" aria-label={label.inc} onClick={() => onChange(String(Math.floor(n / step) * step + step))}>
        <Icon name="plus" size={small ? 18 : 20} />
      </button>
      {unit && <span className="stepper__unit">{unit}</span>}
    </div>
  );
}

export const MIN_LABELS = { dec: 'Zmniejsz minimum', inc: 'Zwiększ minimum' };
