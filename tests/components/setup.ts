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
