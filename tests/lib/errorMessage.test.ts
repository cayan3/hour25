import { describe, it, expect } from 'vitest';
import { toFriendlyErrorMessage } from '../../src/lib/errorMessage';

describe('toFriendlyErrorMessage', () => {
  it('gives a network-specific message for kind: network', () => {
    expect(toFriendlyErrorMessage({ kind: 'network' })).toMatch(/offline/i);
  });

  it('gives an auth-specific message for kind: auth', () => {
    expect(toFriendlyErrorMessage({ kind: 'auth' })).toMatch(/sign in/i);
  });

  it('falls back to a generic message for kind: permanent', () => {
    expect(toFriendlyErrorMessage({ kind: 'permanent' })).toMatch(/something went wrong/i);
  });

  it('falls back to a generic message for a plain Error with no kind', () => {
    // e.g. the "no matching active label" zero-rows-affected guard
    expect(toFriendlyErrorMessage(new Error('no matching active label'))).toMatch(/something went wrong/i);
  });

  it('falls back to a generic message for a non-object value', () => {
    expect(toFriendlyErrorMessage(undefined)).toMatch(/something went wrong/i);
    expect(toFriendlyErrorMessage('boom')).toMatch(/something went wrong/i);
  });
});
