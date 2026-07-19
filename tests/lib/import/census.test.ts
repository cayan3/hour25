import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseImportFile, type ParsedImportFile } from '../../../src/lib/import/parse';
import { addDays } from '../../../src/lib/time';
import { SLOTS_PER_DAY } from '../../../src/lib/constants';

const SYNTHETIC = resolve(__dirname, '../../fixtures/sheets-export-synthetic.csv');
const REAL = resolve(__dirname, '../../fixtures/local/sheets-export-real.csv');

// The SPEC §10 census: both the committed synthetic fixture and the owner's
// gitignored real export are constructed to these exact numbers, so one set
// of assertions covers both files.
function assertCensus(file: ParsedImportFile) {
  expect(file.format).toBe('sheets');
  expect(file.days).toHaveLength(112);
  expect(file.days[0].date).toBe('2026-03-16');
  expect(file.days[111].date).toBe('2026-07-05');

  // Consecutive: every day follows its predecessor by exactly one.
  for (let i = 1; i < file.days.length; i++) {
    expect(file.days[i].date).toBe(addDays(file.days[i - 1].date, 1));
  }

  const labels = new Set<string>();
  let filled = 0;
  let empty = 0;
  for (const day of file.days) {
    expect(day.cells).toHaveLength(SLOTS_PER_DAY);
    for (const cell of day.cells) {
      if (cell === null) empty++;
      else {
        filled++;
        labels.add(cell);
      }
    }
  }
  expect(labels.size).toBe(21);
  expect(empty).toBe(14);
  expect(filled).toBe(5362);
}

describe('sheets fixture census (SPEC §10)', () => {
  it('parses the committed synthetic fixture to the exact documented census', () => {
    const result = parseImportFile(readFileSync(SYNTHETIC, 'utf8'));
    expect(result.ok).toBe(true);
    if (result.ok) assertCensus(result.file);
  });
});

describe.skipIf(!existsSync(REAL))('real sheets export census (local only)', () => {
  it('parses the gitignored real export to the same census', () => {
    const result = parseImportFile(readFileSync(REAL, 'utf8'));
    expect(result.ok).toBe(true);
    if (result.ok) assertCensus(result.file);
  });
});
