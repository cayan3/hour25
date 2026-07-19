import { describe, it, expect } from 'vitest';
import { parseCsvText, parseImportFile } from '../../../src/lib/import/parse';
import { entriesToCsv } from '../../../src/lib/csv';

const APP_HEADER = `date,${Array.from({ length: 48 }, (_, i) => i).join(',')}`;

const SHEETS_HEADER = `,,${Array.from(
  { length: 48 },
  (_, i) => `${Math.floor(i / 2)}:${i % 2 ? '30' : '00'}`,
).join(',')}`;

function sheetsRow(banner: string, date: string, cells: string[]): string {
  return [banner, date, ...cells].join(',');
}

describe('parseCsvText — RFC 4180 reader', () => {
  it('splits plain rows on commas and CRLF', () => {
    expect(parseCsvText('a,b,c\r\nd,e,f')).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('accepts bare LF line endings too', () => {
    expect(parseCsvText('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('reads quoted cells containing commas, doubled quotes and line breaks', () => {
    expect(parseCsvText('"a,b","say ""hi""","two\nlines",plain')).toEqual([
      ['a,b', 'say "hi"', 'two\nlines', 'plain'],
    ]);
  });

  it('drops a trailing empty line rather than emitting a phantom row', () => {
    expect(parseCsvText('a,b\r\n')).toEqual([['a', 'b']]);
  });
});

describe('parseImportFile — format auto-detect', () => {
  it('detects the app format from its date,0..47 header', () => {
    const result = parseImportFile(`${APP_HEADER}\r\n2026-07-01,work${','.repeat(47)}`);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file.format).toBe('app');
  });

  it('detects the sheets format from its two-empty-cells-then-times header', () => {
    const result = parseImportFile(
      `${SHEETS_HEADER}\r\n${sheetsRow('Week: 06/29/2026 - 07/05/2026', '07/01/2026', ['work'])}`,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file.format).toBe('sheets');
  });

  it('refuses a file whose header matches neither format', () => {
    const result = parseImportFile('name,hours\r\nwork,3');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/recogni[sz]/i);
  });

  it('refuses an empty file', () => {
    const result = parseImportFile('');
    expect(result.ok).toBe(false);
  });
});

describe('parseImportFile — app format', () => {
  it('round-trips the app CSV export byte-for-byte back into the same entries', () => {
    const names = new Map([
      ['l1', 'Deep work'],
      ['l2', 'a,b "quoted"'],
      ['l3', '🎮 games'],
    ]);
    const csv = entriesToCsv(
      [
        { date: '2026-07-01', slotIndex: 0, labelId: 'l1' },
        { date: '2026-07-01', slotIndex: 5, labelId: 'l2' },
        { date: '2026-07-03', slotIndex: 47, labelId: 'l3' },
      ],
      names,
    );
    const result = parseImportFile(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.days).toEqual([
      { date: '2026-07-01', cells: expect.anything() },
      { date: '2026-07-02', cells: expect.anything() },
      { date: '2026-07-03', cells: expect.anything() },
    ]);
    expect(result.file.days[0].cells[0]).toBe('Deep work');
    expect(result.file.days[0].cells[5]).toBe('a,b "quoted"');
    expect(result.file.days[0].cells[6]).toBeNull();
    expect(result.file.days[1].cells.every((c) => c === null)).toBe(true);
    expect(result.file.days[2].cells[47]).toBe('🎮 games');
  });

  it('treats missing trailing cells as empty (short-row tolerance)', () => {
    const result = parseImportFile(`${APP_HEADER}\r\n2026-07-01,work,rest`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.days[0].cells[1]).toBe('rest');
    expect(result.file.days[0].cells[47]).toBeNull();
  });

  it('refuses an invalid calendar date, naming the row', () => {
    const result = parseImportFile(`${APP_HEADER}\r\n2026-02-31,work`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/row 2/i);
  });

  it('refuses a duplicated date rather than silently merging it', () => {
    const result = parseImportFile(`${APP_HEADER}\r\n2026-07-01,work\r\n2026-07-01,rest`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/2026-07-01/);
  });
});

describe('parseImportFile — sheets format', () => {
  it('parses col B MM/DD/YYYY dates without new Date(), and never reads col A', () => {
    const result = parseImportFile(
      `${SHEETS_HEADER}\r\n${sheetsRow('Week: 03/16/2026 - 03/22/2026', '03/16/2026', ['sleep', 'sleep'])}`,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.days).toHaveLength(1);
    expect(result.file.days[0].date).toBe('2026-03-16');
    expect(result.file.days[0].cells[0]).toBe('sleep');
    expect(result.file.days[0].cells[1]).toBe('sleep');
    expect(result.file.days[0].cells[2]).toBeNull();
  });

  it('parses identically whatever col A contains: correct, wrong-year, mismatched or garbage banners', () => {
    const banners = [
      'Week: 07/01/2026 - 07/07/2026', // correct
      'Week: 07/01/2019 - 07/07/2019', // wrong year
      'Week: 01/01/2026 - 01/07/2026', // mismatched block
      '%%% not a banner at all @@@', // garbage
      '', // absent
    ];
    const results = banners.map((banner) =>
      parseImportFile(
        `${SHEETS_HEADER}\r\n${sheetsRow(banner, '07/01/2026', ['work', '', 'rest'])}`,
      ),
    );
    for (const result of results) {
      expect(result.ok).toBe(true);
    }
    const [first, ...rest] = results;
    if (!first.ok) return;
    for (const result of rest) {
      if (!result.ok) continue;
      expect(result.file).toEqual(first.file);
    }
  });

  it('skips rows whose col B is empty', () => {
    const csv = [
      SHEETS_HEADER,
      sheetsRow('Week: 07/01/2026 - 07/07/2026', '07/01/2026', ['work']),
      sheetsRow('some summary row', '', ['nonsense', 'ignored']),
    ].join('\r\n');
    const result = parseImportFile(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.days).toHaveLength(1);
  });

  it('trims and lowercases cells', () => {
    const result = parseImportFile(
      `${SHEETS_HEADER}\r\n${sheetsRow('', '07/01/2026', ['  Deep Work  ', 'REST'])}`,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.days[0].cells[0]).toBe('deep work');
    expect(result.file.days[0].cells[1]).toBe('rest');
  });

  it('treats whitespace-only cells as empty', () => {
    const result = parseImportFile(`${SHEETS_HEADER}\r\n${sheetsRow('', '07/01/2026', ['   ', 'work'])}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.days[0].cells[0]).toBeNull();
    expect(result.file.days[0].cells[1]).toBe('work');
  });

  it('refuses a non-empty col B that is not an MM/DD/YYYY date, naming the row', () => {
    const result = parseImportFile(`${SHEETS_HEADER}\r\n${sheetsRow('', 'Total', ['work'])}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/row 2/i);
  });

  it('refuses an impossible calendar date in col B', () => {
    const result = parseImportFile(`${SHEETS_HEADER}\r\n${sheetsRow('', '02/31/2026', ['work'])}`);
    expect(result.ok).toBe(false);
  });
});
