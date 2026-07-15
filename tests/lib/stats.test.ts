import { describe, it, expect } from 'vitest';
import { untrackedSlots } from '../../src/lib/stats';

describe('untrackedSlots', () => {
  it('is 48 minus filled for a past day', () => {
    const now = new Date(2026, 6, 15, 10, 0);
    expect(untrackedSlots('2026-07-01', 30, now)).toBe(48 - 30);
  });

  it('is currentSlotIndex + 1 minus filled for today-in-progress', () => {
    const now = new Date(2026, 6, 15, 10, 15); // 10:15am -> slot 20 -> expected 21
    expect(untrackedSlots('2026-07-15', 5, now)).toBe(21 - 5);
  });

  it('never goes negative when filled exceeds expected', () => {
    const now = new Date(2026, 6, 15, 10, 0);
    expect(untrackedSlots('2026-07-01', 100, now)).toBe(0);
  });
});
