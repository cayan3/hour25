import { useEffect, useMemo, useState } from 'react';
import { useRangeEntries } from './useDayEntries';
import type { DatedEntry } from '../lib/merge';
import { useAllLabels } from './useLabels';
import { useCategories } from './useCategories';
import { useSettings } from './useSettings';
import {
  compareByLabel,
  dayExtremes,
  periodRange,
  previousPeriodNow,
  shiftPeriod,
  summarizePeriod,
  totalsByCategory,
  weekdayWeekendSplit,
  type DayExtremes,
  type LabelChange,
  type PeriodKind,
  type PeriodSummary,
  type WeekdayWeekendSplit,
} from '../lib/stats';

export interface StatsLabelRow {
  labelId: string;
  name: string;
  color: string;
  deleted: boolean;
  isSleep: boolean;
  minutes: number;
  /** Minutes averaged over the period's tracked days. Equals `minutes` on a Day. */
  minutesPerDay: number;
  /** Share of the period's *logged* time, 0–100, so the rows account for all of it. */
  percent: number;
  /** Null while the previous period's read is in flight. */
  change: LabelChange | null;
}

export interface StatsCategoryRow {
  categoryId: string | null;
  name: string;
  color: string;
  minutes: number;
  minutesPerDay: number;
  percent: number;
}

export interface StatsResult {
  loading: boolean;
  start: string;
  end: string;
  summary: PeriodSummary;
  /** The period's merged entries, for surfaces that need slot-level detail. */
  entries: DatedEntry[];
  rows: StatsLabelRow[];
  categoryRows: StatsCategoryRow[];
  /** True once the user has at least one category — the section is noise without. */
  hasCategories: boolean;
  /** Null when no sleep label is set, or when it no longer resolves. */
  sleepLabelName: string | null;
  sleepColor: string | null;
  /** The divisor behind every `/day` figure, stated on the page because it moves. */
  trackedDays: number;
  /** The previous period's divisor, so a comparison can be read honestly. */
  previousTrackedDays: number;
  split: WeekdayWeekendSplit;
  extremes: DayExtremes;
  /**
   * Change in the waking-day percentage against the same slice of the previous
   * period, in points. A coverage figure, so it lives in the coverage
   * disclosure rather than the headline. Null while that read is in flight or
   * either side has no waking time to measure.
   */
  deltaPoints: number | null;
}

// Ticks so today's elapsed-slot count advances while the page sits open. A
// slot boundary is 30 minutes, so a minute of lag is invisible; recomputing a
// month of entries on each tick is trivial.
function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const NO_CATEGORY_COLOR = '#94a3b8';

export function useStats(
  userId: string,
  kind: PeriodKind,
  anchor: string,
  excludeSleep = false,
): StatsResult {
  const now = useNow();
  const range = useMemo(() => periodRange(kind, anchor), [kind, anchor]);
  const previousRange = useMemo(
    () => periodRange(kind, shiftPeriod(kind, anchor, -1)),
    [kind, anchor],
  );

  const { entries, isPending } = useRangeEntries(userId, range.start, range.end);
  const previous = useRangeEntries(userId, previousRange.start, previousRange.end);
  const { data: settings } = useSettings(userId);
  const { data: allLabels } = useAllLabels(userId);
  const { data: categories } = useCategories(userId);

  const sleepLabelId = settings?.sleep_label_id ?? null;

  const summary = useMemo(
    () => summarizePeriod(entries, range, sleepLabelId, now),
    [entries, range, sleepLabelId, now],
  );

  // Measured to the same wall-clock moment one period back, so a Wednesday
  // morning is compared against a Wednesday morning (C-81). Comparing against
  // the whole of the previous period would penalize every period in progress
  // by however much of it has not happened yet.
  const previousSummary = useMemo(
    () => summarizePeriod(previous.entries, previousRange, sleepLabelId, previousPeriodNow(kind, now)),
    [previous.entries, previousRange, sleepLabelId, kind, now],
  );

  const changes = useMemo(
    () =>
      previous.isPending
        ? new Map<string, LabelChange>()
        : compareByLabel(summary, previousSummary),
    [previous.isPending, summary, previousSummary],
  );

  const split = useMemo(() => weekdayWeekendSplit(summary.byDate), [summary.byDate]);
  const extremes = useMemo(() => dayExtremes(summary.byDate), [summary.byDate]);

  const deltaPoints = useMemo(() => {
    if (previous.isPending) return null;
    if (summary.wakingPercent === null || previousSummary.wakingPercent === null) return null;
    return Math.round(summary.wakingPercent) - Math.round(previousSummary.wakingPercent);
  }, [previous.isPending, summary, previousSummary]);

  const labelById = useMemo(() => new Map((allLabels ?? []).map((l) => [l.id, l])), [allLabels]);

  // Shares divide by *logged* time, not elapsed time, so the rows account for
  // all of it and sum to 100%. Dividing by elapsed would charge untracked time
  // against every label, which penalizes anyone who tracks only some days —
  // the defect this surface was reworked to remove.
  const loggedDenominator = excludeSleep
    ? summary.filledMinutes - summary.sleepMinutes
    : summary.filledMinutes;

  // labels-all, never the picker's active list (§7.5): a slot logged under a
  // since-deleted label must keep its name and color in history.
  const rows = useMemo<StatsLabelRow[]>(() => {
    return summary.byLabel
      .filter((total) => !(excludeSleep && total.labelId === sleepLabelId))
      .map((total) => {
        const label = labelById.get(total.labelId);
        return {
          labelId: total.labelId,
          name: label?.name ?? 'Unknown label',
          color: label?.color ?? NO_CATEGORY_COLOR,
          deleted: label ? label.deleted_at !== null : false,
          isSleep: total.labelId === sleepLabelId,
          minutes: total.minutes,
          minutesPerDay: summary.trackedDays > 0 ? total.minutes / summary.trackedDays : 0,
          percent: loggedDenominator > 0 ? (total.minutes / loggedDenominator) * 100 : 0,
          change: changes.get(total.labelId) ?? null,
        };
      });
  }, [summary, labelById, sleepLabelId, excludeSleep, loggedDenominator, changes]);

  // C-24's exclude-sleep variant, now governing the whole page rather than
  // this section alone: sleep drops out and the shares divide by logged waking
  // time, so they still add up.
  const categoryRows = useMemo<StatsCategoryRow[]>(() => {
    const categoryOf = new Map([...labelById.values()].map((l) => [l.id, l.category_id]));
    const byId = new Map((categories ?? []).map((c) => [c.id, c]));
    return totalsByCategory(summary.byLabel, categoryOf, excludeSleep ? sleepLabelId : null).map(
      (total) => {
        const category = total.categoryId === null ? undefined : byId.get(total.categoryId);
        return {
          categoryId: total.categoryId,
          name:
            total.categoryId === null ? 'Uncategorized' : (category?.name ?? 'Unknown category'),
          color: category?.color ?? NO_CATEGORY_COLOR,
          minutes: total.minutes,
          minutesPerDay: summary.trackedDays > 0 ? total.minutes / summary.trackedDays : 0,
          percent: loggedDenominator > 0 ? (total.minutes / loggedDenominator) * 100 : 0,
        };
      },
    );
  }, [summary, labelById, categories, sleepLabelId, excludeSleep, loggedDenominator]);

  const sleepLabel = sleepLabelId === null ? undefined : labelById.get(sleepLabelId);

  return {
    loading: isPending || settings === undefined || allLabels === undefined,
    start: range.start,
    end: range.end,
    summary,
    entries,
    rows,
    categoryRows,
    hasCategories: (categories ?? []).length > 0,
    sleepLabelName: sleepLabel?.name ?? null,
    sleepColor: sleepLabel?.color ?? null,
    trackedDays: summary.trackedDays,
    previousTrackedDays: previousSummary.trackedDays,
    split,
    extremes,
    deltaPoints,
  };
}
