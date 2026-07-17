import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pushMru, loadMru, recordLabelUse, MRU_DISPLAY_LIMIT } from '../../src/lib/mru';

describe('pushMru (pure core)', () => {
  it('prepends a new id', () => {
    expect(pushMru(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('moves an existing id to the front instead of duplicating it', () => {
    expect(pushMru(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });

  it('caps the list length', () => {
    expect(pushMru(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });

  it('display limit stays at 9 — number keys 1–9 (C-42)', () => {
    expect(MRU_DISPLAY_LIMIT).toBe(9);
  });
});

describe('localStorage-backed load/record', () => {
  // vitest environment is 'node' — provide a minimal localStorage.
  const backing = new Map<string, string>();

  beforeEach(() => {
    backing.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
      removeItem: (k: string) => void backing.delete(k),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips uses per user', () => {
    recordLabelUse('user-1', 'a');
    recordLabelUse('user-1', 'b');
    recordLabelUse('user-2', 'z');
    expect(loadMru('user-1')).toEqual(['b', 'a']);
    expect(loadMru('user-2')).toEqual(['z']);
  });

  it('returns empty for a fresh user', () => {
    expect(loadMru('nobody')).toEqual([]);
  });

  it('tolerates corrupt storage instead of breaking the picker', () => {
    backing.set('label-mru:user-1', 'not json {');
    expect(loadMru('user-1')).toEqual([]);
    backing.set('label-mru:user-1', '{"a":1}');
    expect(loadMru('user-1')).toEqual([]);
    backing.set('label-mru:user-1', '["ok", 42, null, "fine"]');
    expect(loadMru('user-1')).toEqual(['ok', 'fine']);
  });
});
