import { Icon } from './Icon';

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  size?: 'lg' | 'md' | 'filter';
  style?: React.CSSProperties;
}

export function SearchField({ id, value, onChange, placeholder, label, size = 'lg', style }: Props) {
  const iconSize = size === 'lg' ? 22 : size === 'md' ? 20 : 18;
  return (
    <div className={`search search--${size}`} style={style}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <span className="search__icon" style={{ display: 'flex' }}>
        <Icon name="search" size={iconSize} strokeWidth={2.2} />
      </span>
      <input
        id={id}
        className="search__input"
        type="search"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {size !== 'filter' && value.trim() && (
        <button type="button" className="icon-btn icon-btn--muted search__clear" aria-label="Wyczyść wyszukiwanie" onClick={() => onChange('')}>
          <Icon name="close" size={size === 'lg' ? 20 : 18} />
        </button>
      )}
    </div>
  );
}
