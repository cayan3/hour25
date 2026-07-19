import { describe, expect, it } from 'vitest';
import { csvCell, entriesToCsv, toCsv } from '../../src/lib/csv';
import { SLOTS_PER_DAY } from '../../src/lib/constants';

const names = new Map([
  ['work', 'Work'],
  ['comma', 'Work, focused'],
  ['quote', 'Reading "deep"'],
  ['newline', 'Line one\nLine two'],
  ['emoji', '🏃 Run'],
]);

describe('csvCell', () => {
  it('leaves ordinary values unquoted', () => {
    expect(csvCell('Work')).toBe('Work');
  });

  it('quotes values containing a comma', () => {
    expect(csvCell('Work, focused')).toBe('"Work, focused"');
  });

  it('quotes and doubles embedded double quotes', () => {
    expect(csvCell('Reading "deep"')).toBe('"Reading ""deep"""');
  });

  it('quotes values containing a line break', () => {
    expect(csvCell('Line one\nLine two')).toBe('"Line one\nLine two"');
    expect(csvCell('Line one\r\nLine two')).toBe('"Line one\r\nLine two"');
  });

  it('leaves emoji unescaped — they need no quoting', () => {
    expect(csvCell('🏃 Run')).toBe('🏃 Run');
  });

  it('quotes an empty-looking value only when it actually needs it', () => {
    expect(csvCell('')).toBe('');
    expect(csvCell('"')).toBe('""""');
  });
});

describe('toCsv', () => {
  it('joins cells with commas and rows with CRLF', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d');
  });
});

describe('entriesToCsv', () => {
  it('emits a header of date plus 48 slot columns when there are no entries', () => {
    const csv = entriesToCsv([], names);
    expect(csv).toBe(`date,${Array.from({ length: SLOTS_PER_DAY }, (_, i) => i).join(',')}`);
  });

  it('writes label names into the right slot columns and leaves the rest empty', () => {
    const csv = entriesToCsv(
      [
        { date: '2026-07-01', slotIndex: 0, labelId: 'work' },
        { date: '2026-07-01', slotIndex: 47, labelId: 'emoji' },
      ],
      names,
    );
    const [, row] = csv.split('\r\n');
    const cells = row.split(',');
    expect(cells[0]).toBe('2026-07-01');
    expect(cells[1]).toBe('Work');
    expect(cells[48]).toBe('🏃 Run');
    expect(cells.slice(2, 48).every((c) => c === '')).toBe(true);
  });

  it('quotes label names containing commas, quotes or newlines', () => {
    const csv = entriesToCsv(
      [
        { date: '2026-07-01', slotIndex: 0, labelId: 'comma' },
        { date: '2026-07-01', slotIndex: 1, labelId: 'quote' },
        { date: '2026-07-01', slotIndex: 2, labelId: 'newline' },
      ],
      names,
    );
    expect(csv).toContain('2026-07-01,"Work, focused","Reading ""deep""","Line one\nLine two",');
  });

  it('fills gap days with empty rows so the date column is contiguous', () => {
    const csv = entriesToCsv(
      [
        { date: '2026-07-01', slotIndex: 0, labelId: 'work' },
        { date: '2026-07-03', slotIndex: 0, labelId: 'work' },
      ],
      names,
    );
    const rows = csv.split('\r\n');
    expect(rows).toHaveLength(4); // header + 3 days
    expect(rows[2]).toBe(`2026-07-02${','.repeat(SLOTS_PER_DAY)}`);
  });

  it('leaves the cell empty when the label id resolves to nothing', () => {
    const csv = entriesToCsv([{ date: '2026-07-01', slotIndex: 0, labelId: 'gone' }], names);
    expect(csv.split('\r\n')[1]).toBe(`2026-07-01${','.repeat(SLOTS_PER_DAY)}`);
  });
});
