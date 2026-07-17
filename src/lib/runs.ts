import type { MergedEntry } from './merge';

// A maximal run of contiguous same-label slots within one day. Runs exist for
// filled slots only — an empty slot is not a run, it IS untracked time (C-31).
export interface LabelRun {
  start: number; // slot index, inclusive
  end: number; // slot index, inclusive
  labelId: string;
}

// Run merging is visual, not structural (C-41): these drive rendering only.
// Every slot keeps its own gridcell/hit target; a run just tells the surface
// which inner borders to suppress and where to paint the label name once.
export function computeRuns(entries: MergedEntry[]): LabelRun[] {
  const runs: LabelRun[] = [];
  for (const e of entries) {
    const last = runs[runs.length - 1];
    if (last && last.labelId === e.labelId && last.end === e.slotIndex - 1) {
      last.end = e.slotIndex;
    } else {
      runs.push({ start: e.slotIndex, end: e.slotIndex, labelId: e.labelId });
    }
  }
  return runs;
}

// A run clipped at row boundaries on the 4×12 desktop grid: a 23:00–07:00
// sleep run renders as two blocks (end of row 4, start of row 1) — correct,
// not a bug (DESIGN §2). runLength is the *unclipped* run's length, for the
// 1–2-slot abbreviation rule.
export interface RunSegment {
  start: number; // slot index, inclusive
  end: number; // slot index, inclusive
  labelId: string;
  runLength: number;
}

export function clipRunsToRows(runs: LabelRun[], slotsPerRow: number): RunSegment[] {
  const segments: RunSegment[] = [];
  for (const run of runs) {
    const runLength = run.end - run.start + 1;
    let start = run.start;
    while (start <= run.end) {
      const rowEnd = (Math.floor(start / slotsPerRow) + 1) * slotsPerRow - 1;
      const end = Math.min(run.end, rowEnd);
      segments.push({ start, end, labelId: run.labelId, runLength });
      start = end + 1;
    }
  }
  return segments;
}
