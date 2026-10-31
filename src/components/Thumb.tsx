/** Product photo in a fixed box; renders an empty placeholder when there's no image. */
export function Thumb({ src, size = 'sm', alt = '' }: { src?: string | null; size?: 'xs' | 'sm' | 'md' | 'lg'; alt?: string }) {
  return (
    <span className={`thumb thumb--${size}`} aria-hidden={alt ? undefined : true}>
      {src && <img src={src} alt={alt} loading="lazy" decoding="async" />}
    </span>
  );
}
