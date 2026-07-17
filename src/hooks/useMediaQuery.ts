import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange(); // re-sync in case the viewport changed between render and effect
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

// DESIGN §§2–3: ≥768px gets the 4×12 grid, below it the vertical slot list.
// Rendered via JS rather than CSS visibility so only one surface (and one
// picker instance, with unique ARIA ids) exists at a time.
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)');
}
