import { z } from 'zod';
import { SLOTS_PER_DAY } from '../constants';
import { localDateString, parseLocalDate } from '../time';

// RFC 4180 reader — the inverse of csvCell/toCsv in src/lib/csv.ts. Quoted
// cells may contain commas, doubled quotes and line breaks, so a naive
// split-on-newline cannot parse our own export back.
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // A trailing newline yields one phantom all-empty row — drop empty rows
  // anywhere, they carry nothing in either format.
  return rows.filter((r) => r.some((c) => c !== ''));
}

export interface ImportDay {
  date: string; // YYYY-MM-DD
  cells: (string | null)[]; // length SLOTS_PER_DAY; null = untracked
}

export interface ParsedImportFile {
  format: 'app' | 'sheets';
  days: ImportDay[]; // sorted by date, each date unique
}

export type ParseImportResult =
  | { ok: true; file: ParsedImportFile }
  | { ok: false; error: string };

// The app's own export: `date,0,1,…,47`.
function isAppHeader(header: string[]): boolean {
  if (header.length < SLOTS_PER_DAY + 1 || header[0] !== 'date') return false;
  for (let i = 0; i < SLOTS_PER_DAY; i++) {
    if (header[i + 1] !== String(i)) return false;
  }
  return true;
}

// The weekly-banner Google Sheets grid: two empty cells, then 48 time
// strings `0:00`…`23:30` (col C = slot 0).
function isSheetsHeader(header: string[]): boolean {
  if (header.length < SLOTS_PER_DAY + 2 || header[0] !== '' || header[1] !== '') return false;
  for (let i = 0; i < SLOTS_PER_DAY; i++) {
    const expected = `${Math.floor(i / 2)}:${i % 2 ? '30' : '00'}`;
    if (header[i + 2].trim() !== expected) return false;
  }
  return true;
}

// Calendar validity without new Date() string parsing: parseLocalDate is the
// one sanctioned string→Date path, and the round-trip catches impossible
// dates (2026-02-31 rolls over, so it no longer formats back to itself).
// Shared with the JSON-backup schema (restore.ts) — same date discipline.
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => localDateString(parseLocalDate(s)) === s, 'not a real calendar date');

// Col B of the sheets format: `MM/DD/YYYY`, parsed with that exact format —
// never via new Date() (C-50 / CLAUDE.md).
const sheetsDateSchema = z
  .string()
  .regex(/^\d{1,2}\/\d{1,2}\/\d{4}$/)
  .transform((s) => {
    const [m, d, y] = s.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  })
  .refine((s) => localDateString(parseLocalDate(s)) === s, 'not a real calendar date');

function emptyCells(): (string | null)[] {
  return Array.from({ length: SLOTS_PER_DAY }, () => null);
}

// Missing trailing cells are empty (short-row tolerance); extra cells beyond
// slot 47 are ignored. `normalise` is the per-format cell rule.
function readCells(
  row: string[],
  firstSlotCol: number,
  normalise: (cell: string) => string,
): (string | null)[] {
  const cells = emptyCells();
  for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
    const raw = row[firstSlotCol + slot];
    if (raw === undefined) break;
    const value = normalise(raw);
    if (value !== '') cells[slot] = value;
  }
  return cells;
}

function collectDays(
  rows: string[][],
  parseRow: (row: string[], rowNumber: number) => ImportDay | null | { error: string },
): ParseImportResult {
  const byDate = new Map<string, ImportDay>();
  for (let i = 1; i < rows.length; i++) {
    const parsed = parseRow(rows[i], i + 1);
    if (parsed === null) continue;
    if ('error' in parsed) return { ok: false, error: parsed.error };
    if (byDate.has(parsed.date)) {
      return {
        ok: false,
        error: `The file lists ${parsed.date} more than once (row ${i + 1}) — fix the duplicate and re-import.`,
      };
    }
    byDate.set(parsed.date, parsed);
  }
  const days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return { ok: true, file: { format: 'app', days } };
}

export function parseImportFile(text: string): ParseImportResult {
  const rows = parseCsvText(text);
  if (rows.length === 0) return { ok: false, error: 'The file is empty.' };

  const header = rows[0];

  if (isAppHeader(header)) {
    return collectDays(rows, (row, rowNumber) => {
      const date = isoDateSchema.safeParse(row[0]);
      if (!date.success) {
        return { error: `Row ${rowNumber}: "${row[0]}" is not a valid YYYY-MM-DD date.` };
      }
      return { date: date.data, cells: readCells(row, 1, (c) => c.trim()) };
    });
  }

  if (isSheetsHeader(header)) {
    const result = collectDays(rows, (row, rowNumber) => {
      // Col A (row[0]) is the week banner: derived, redundant, historically
      // wrong — always ignored (C-50). Col B is the only date source.
      const rawDate = (row[1] ?? '').trim();
      if (rawDate === '') return null; // not a day row
      const date = sheetsDateSchema.safeParse(rawDate);
      if (!date.success) {
        return { error: `Row ${rowNumber}: "${rawDate}" is not a valid MM/DD/YYYY date.` };
      }
      return { date: date.data, cells: readCells(row, 2, (c) => c.trim().toLowerCase()) };
    });
    if (!result.ok) return result;
    return { ok: true, file: { ...result.file, format: 'sheets' } };
  }

  return {
    ok: false,
    error:
      'Unrecognised file: expected either this app’s CSV export (header "date,0,…,47") or the Google Sheets grid layout.',
  };
}
