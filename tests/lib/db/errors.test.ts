import { describe, it, expect } from 'vitest';
import { classifyError } from '../../../src/lib/db/errors';

describe('classifyError', () => {
  it('classifies 401 as auth', () => {
    expect(classifyError({ status: 401 })).toBe('auth');
  });

  it('classifies PGRST301 as auth', () => {
    expect(classifyError({ code: 'PGRST301' })).toBe('auth');
  });

  it('classifies 408 as network', () => {
    expect(classifyError({ status: 408 })).toBe('network');
  });

  it('classifies 429 as network', () => {
    expect(classifyError({ status: 429 })).toBe('network');
  });

  it('classifies Postgres data-exception codes (22xxx) as permanent', () => {
    expect(classifyError({ code: '22001' })).toBe('permanent');
  });

  it('classifies Postgres integrity-constraint codes (23xxx) as permanent', () => {
    expect(classifyError({ code: '23505' })).toBe('permanent');
  });

  it('classifies Postgres access/undefined codes (42xxx) as permanent', () => {
    expect(classifyError({ code: '42501' })).toBe('permanent');
  });

  it('classifies 403 as permanent (RLS denial on own data is a bug, not retry fodder)', () => {
    expect(classifyError({ status: 403 })).toBe('permanent');
  });

  it('classifies other 4xx as permanent', () => {
    expect(classifyError({ status: 404 })).toBe('permanent');
  });

  it('classifies 5xx as network (retriable)', () => {
    expect(classifyError({ status: 500 })).toBe('network');
  });

  it('classifies a thrown TypeError (e.g. fetch failure) as network', () => {
    expect(classifyError(new TypeError('Failed to fetch'))).toBe('network');
  });

  it('classifies null/unknown as network', () => {
    expect(classifyError(null)).toBe('network');
    expect(classifyError(undefined)).toBe('network');
  });

  it('never reads a NUMERIC code as a Postgres code — a raw DOMException timeout is network, not permanent', () => {
    // DOMException carries legacy numeric codes: TimeoutError = 23,
    // QuotaExceededError = 22. Coerced into the /^(22|23|42)/ test they'd
    // dead-letter healthy rows on a timeout; only string codes may match.
    expect(classifyError(new DOMException('signal timed out', 'TimeoutError'))).toBe('network');
    expect(classifyError(new DOMException('quota', 'QuotaExceededError'))).toBe('network');
    expect(classifyError({ code: 23 })).toBe('network');
  });
});
