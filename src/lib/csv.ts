import { SLOTS_PER_DAY } from './constants';
import { addDays } from './time';

// RFC 4180. A cell needs quoting iff it contains a comma, a double quote, or
// a line break; embedded quotes double up. Label names are free text — all
// three characters are legal in one, so this is the only correct writer.
// Emoji need no escaping: they ride through as UTF-8 and, with no BOM
// prepended, the file round-trips cleanly through our own importer.
export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// CRLF per the spec; every consumer (Sheets, Excel, our importer) accepts it.
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export interface CsvExportEntry {
  date: string;
  slotIndex: number;
  labelId: string;
}

// SPEC §10: header `date,0,…,47`, one row per day, cells = label name
// strings, empty slot = empty string (which faithfully means untracked per
// C-31, so round-trips are stable). Notes are deliberately not in CSV — the
// JSON backup carries those.
//
// Rows span every calendar day from the first entry to the last, gaps
// included: a fully untracked day is real information, and a date column
// with holes in it reads as missing data in a spreadsheet.
export function entriesToCsv(entries: CsvExportEntry[], labelNames: Map<string, string>): string {
  const header = ['date', ...Array.from({ length: SLOTS_PER_DAY }, (_, i) => String(i))];
  if (entries.length === 0) return toCsv([header]);

  const byDate = new Map<string, string[]>();
  for (const e of entries) {
    let row = byDate.get(e.date);
    if (!row) {
      row = Array.from({ length: SLOTS_PER_DAY }, () => '');
      byDate.set(e.date, row);
    }
    // An id with no matching label leaves the cell empty rather than emitting
    // a raw uuid — it can only mean the label row is genuinely gone.
    row[e.slotIndex] = labelNames.get(e.labelId) ?? '';
  }

  const dates = [...byDate.keys()].sort();
  const rows = [header];
  for (let date = dates[0]; date <= dates[dates.length - 1]; date = addDays(date, 1)) {
    rows.push([date, ...(byDate.get(date) ?? Array.from({ length: SLOTS_PER_DAY }, () => ''))]);
  }
  return toCsv(rows);
}
