import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomUUID } from '../../src/lib/uuid';

const V4_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('randomUUID', () => {
  it('produces v4-shaped, unique ids', () => {
    const a = randomUUID();
    const b = randomUUID();
    expect(a).toMatch(V4_SHAPE);
    expect(a).not.toBe(b);
  });

  it('falls back to getRandomValues when crypto.randomUUID is missing (insecure origins)', () => {
    // Simulate an insecure-context crypto: getRandomValues but no randomUUID.
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 11) % 256;
        return arr;
      },
    });

    const id = randomUUID();
    expect(id).toMatch(V4_SHAPE);
  });
});
