import { useSyncExternalStore } from 'react';

export type Breakpoint = 'phone' | 'tablet' | 'laptop';

const TABLET = '(min-width: 768px)';
const LAPTOP = '(min-width: 1280px)';

function subscribe(cb: () => void) {
  const qs = [matchMedia(TABLET), matchMedia(LAPTOP)];
  qs.forEach((q) => q.addEventListener('change', cb));
  return () => qs.forEach((q) => q.removeEventListener('change', cb));
}

function snapshot(): Breakpoint {
  if (matchMedia(LAPTOP).matches) return 'laptop';
  if (matchMedia(TABLET).matches) return 'tablet';
  return 'phone';
}

/** phone < 768px ≤ tablet < 1280px ≤ laptop */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, snapshot, () => 'phone');
}
