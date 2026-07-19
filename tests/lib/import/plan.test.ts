import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildImportPreview,
  buildImportRows,
  defaultResolutions,
} from '../../../src/lib/import/plan';
import type { ParsedImportFile } from '../../../src/lib/import/parse';
import { LABEL_PALETTE, resetPaletteCursor } from '../../../src/lib/palette';
import { SLOTS_PER_DAY } from '../../../src/lib/constants';

function day(date: string, filled: Record<number, string>): ParsedImportFile['days'][number] {
  const cells = Array.from({ length: SLOTS_PER_DAY }, (_, i) => filled[i] ?? null);
  return { date, cells };
}

function file(days: ParsedImportFile['days']): ParsedImportFile {
  return { format: 'sheets', days };
}

const ACTIVE = [
  { id: 'l-work', name: 'Work' },
  { id: 'l-rest', name: 'rest' },
];

describe('buildImportPreview', () => {
  it('counts filled slots, matches labels case-insensitively, and lists unknown names once', () => {
    const result = buildImportPreview(
      file([
        day('2026-07-01', { 0: 'work', 1: 'WORK', 2: 'gym', 3: 'gym', 4: 'Gym' }),
        day('2026-07-02', { 0: 'rest', 5: 'reading' }),
      ]),
      ACTIVE,
      [],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.totalSlots).toBe(7);
    expect(result.preview.dayCount).toBe(2);
    expect(result.preview.firstDate).toBe('2026-07-01');
    expect(result.preview.lastDate).toBe('2026-07-02');
    // Unknown names are distinct case-insensitively, keeping first spelling.
    expect(result.preview.unknownLabels).toEqual(['gym', 'reading']);
  });

  it('counts an existing server entry on an imported slot as an overwrite', () => {
    const result = buildImportPreview(
      file([day('2026-07-01', { 0: 'work', 1: 'work' })]),
      ACTIVE,
      [
        { date: '2026-07-01', slot_index: 0, label_id: 'l-rest', note: null, chunk_minutes: 30 },
        { date: '2026-07-01', slot_index: 7, label_id: 'l-rest', note: null, chunk_minutes: 30 },
      ],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Slot 0 collides; slot 7's existing entry is untouched by the import.
    expect(result.preview.willOverwrite).toBe(1);
  });

  it('refuses when one imported name matches multiple active labels (defense in depth)', () => {
    const result = buildImportPreview(
      file([day('2026-07-01', { 0: 'work' })]),
      [
        { id: 'l-1', name: 'Work' },
        { id: 'l-2', name: 'WORK' },
      ],
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/duplicate/i);
  });
});

describe('defaultResolutions — create with a palette color (C-46/C-58)', () => {
  beforeEach(() => resetPaletteCursor());

  it('defaults every unknown name to create, with successive distinct palette colors', () => {
    const resolutions = defaultResolutions(['gym', 'reading', 'chores']);
    expect(resolutions.get('gym')).toEqual({ action: 'create', color: LABEL_PALETTE[0].hex });
    expect(resolutions.get('reading')).toEqual({ action: 'create', color: LABEL_PALETTE[1].hex });
    expect(resolutions.get('chores')).toEqual({ action: 'create', color: LABEL_PALETTE[2].hex });
  });

  it('keys resolutions by the lowercased name', () => {
    const resolutions = defaultResolutions(['Gym']);
    expect(resolutions.has('gym')).toBe(true);
  });
});

describe('buildImportRows', () => {
  it('maps every filled cell to a direct entry row via the resolved label ids', () => {
    const rows = buildImportRows(
      file([day('2026-07-01', { 0: 'work', 3: 'gym' }), day('2026-07-02', { 47: 'work' })]),
      new Map([
        ['work', 'l-work'],
        ['gym', 'l-gym'],
      ]),
    );
    expect(rows).toEqual([
      { date: '2026-07-01', slotIndex: 0, labelId: 'l-work' },
      { date: '2026-07-01', slotIndex: 3, labelId: 'l-gym' },
      { date: '2026-07-02', slotIndex: 47, labelId: 'l-work' },
    ]);
  });

  it('omits slots whose label was resolved as skip (absent from the id map)', () => {
    const rows = buildImportRows(
      file([day('2026-07-01', { 0: 'work', 1: 'gym' })]),
      new Map([['work', 'l-work']]),
    );
    expect(rows).toEqual([{ date: '2026-07-01', slotIndex: 0, labelId: 'l-work' }]);
  });

  it('looks names up case-insensitively, matching the preview', () => {
    const rows = buildImportRows(
      file([day('2026-07-01', { 0: 'WoRk' })]),
      new Map([['work', 'l-work']]),
    );
    expect(rows).toEqual([{ date: '2026-07-01', slotIndex: 0, labelId: 'l-work' }]);
  });
});
