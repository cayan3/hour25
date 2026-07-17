import { describe, it, expect } from 'vitest';
import { slotTimeShort, slotRangeLabel, slotAccessibleName } from '../../src/lib/slotNames';

describe('slotTimeShort', () => {
  it('renders hours without a leading zero', () => {
    expect(slotTimeShort(0)).toBe('0:00');
    expect(slotTimeShort(18)).toBe('9:00');
    expect(slotTimeShort(19)).toBe('9:30');
    expect(slotTimeShort(47)).toBe('23:30');
  });

  it('renders the end-of-day boundary as 24:00', () => {
    expect(slotTimeShort(48)).toBe('24:00');
  });
});

describe('slotRangeLabel', () => {
  it('formats a slot range', () => {
    expect(slotRangeLabel(18)).toBe('9:00 to 9:30');
    expect(slotRangeLabel(47)).toBe('23:30 to 24:00');
  });
});

describe('slotAccessibleName (DESIGN §10)', () => {
  it('empty cells read as untracked', () => {
    expect(slotAccessibleName(18, null, false)).toBe('9:00 to 9:30, untracked');
  });

  it('filled cells carry the label name', () => {
    expect(slotAccessibleName(18, { name: 'Deep work', deleted: false }, false)).toBe(
      '9:00 to 9:30, Deep work',
    );
  });

  it('appends has note', () => {
    expect(slotAccessibleName(18, { name: 'Deep work', deleted: false }, true)).toBe(
      '9:00 to 9:30, Deep work, has note',
    );
  });

  it('appends deleted label before the note flag', () => {
    expect(slotAccessibleName(18, { name: 'Old hobby', deleted: true }, true)).toBe(
      '9:00 to 9:30, Old hobby, deleted label, has note',
    );
  });
});
