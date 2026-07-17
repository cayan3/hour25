import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Vitest globals are off, so Testing Library can't auto-register its cleanup —
// do it here or every render leaks into the next test's DOM.
afterEach(cleanup);

// jsdom doesn't implement scrollIntoView (the picker keeps its active option
// in view with it); a no-op is fine — nothing scrolls in jsdom anyway.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Node ≥22 ships an experimental global localStorage that is undefined unless
// --localstorage-file is passed, and it shadows jsdom's — and vitest's jsdom
// environment doesn't replace pre-existing Node globals, so window.localStorage
// is undefined here too. Give components (MRU, last-sync) a real in-memory
// Storage instead.
if (globalThis.localStorage == null) {
  const store = new Map<string, string>();
  const stub: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? (store.get(k) as string) : null),
    key: (i) => [...store.keys()][i] ?? null,
    removeItem: (k) => {
      store.delete(k);
    },
    setItem: (k, v) => {
      store.set(k, String(v));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true });
}
