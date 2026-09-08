import { useEffect, useMemo, useState } from 'react';
import { useRangeEntries } from './useDayEntries';
import { useAllLabels } from './useLabels';
import { useCategories } from './useCategories';
import { useSettings } from './useSettings';
import {
  periodRange,
  previousPeriodNow,
  shiftPeriod,
  summarizePeriod,
  totalsByCategory,
  type PeriodKind,
  type PeriodSummary,
} from '../lib/stats';

export interface StatsLabelRow {
  labelId: string;
  name: string;
  color: string;
  deleted: boolean;
  isSleep: boolean;
  minutes: number;
  /** Share of the period's elapsed time, 0–100. */
  percent: number;
}

export interface StatsCategoryRow {
  categoryId: string | null;
  name: string;
  color: string;
  minutes: number;
  percent: number;
}

export interface StatsResult {
  loading: boolean;
  start: string;
  end: string;
  summary: PeriodSummary;
  rows: StatsLabelRow[];
  categoryRows: StatsCategoryRow[];
  /** True once the user has at least one category — the section is noise without. */
  hasCategories: boolean;
  /** Null when no sleep label is set, or when it no longer resolves. */
  sleepLabelName: string | null;
  sleepColor: string | null;
  /**
   * Change in the waking-day percentage against the same slice of the previous
   * period, in points. Null while that read is in flight or either side has no
   * waking time to measure.
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
  excludeSleepFromCategories = false,
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

  const deltaPoints = useMemo(() => {
    if (previous.isPending) return null;
    const before = summarizePeriod(
      previous.entries,
      previousRange,
      sleepLabelId,
      previousPeriodNow(kind, now),
    );
    if (summary.wakingPercent === null || before.wakingPercent === null) return null;
    return Math.round(summary.wakingPercent) - Math.round(before.wakingPercent);
  }, [previous.entries, previous.isPending, previousRange, sleepLabelId, kind, now, summary]);

  const labelById = useMemo(() => new Map((allLabels ?? []).map((l) => [l.id, l])), [allLabels]);

  // labels-all, never the picker's active list (§7.5): a slot logged under a
  // since-deleted label must keep its name and color in history.
  const rows = useMemo<StatsLabelRow[]>(() => {
    const denominator = summary.expectedMinutes;
    return summary.byLabel.map((total) => {
      const label = labelById.get(total.labelId);
      return {
        labelId: total.labelId,
        name: label?.name ?? 'Unknown label',
        color: label?.color ?? NO_CATEGORY_COLOR,
        deleted: label ? label.deleted_at !== null : false,
        isSleep: total.labelId === sleepLabelId,
        minutes: total.minutes,
        percent: denominator > 0 ? (total.minutes / denominator) * 100 : 0,
      };
    });
  }, [summary, labelById, sleepLabelId]);

  // C-24's exclude-sleep variant. When sleep is dropped the shares divide by
  // waking time instead of the whole elapsed period, so they still add up.
  const categoryRows = useMemo<StatsCategoryRow[]>(() => {
    const categoryOf = new Map([...labelById.values()].map((l) => [l.id, l.category_id]));
    const denominator = excludeSleepFromCategories
      ? summary.wakingExpectedMinutes
      : summary.expectedMinutes;
    const byId = new Map((categories ?? []).map((c) => [c.id, c]));
    return totalsByCategory(
      summary.byLabel,
      categoryOf,
      excludeSleepFromCategories ? sleepLabelId : null,
    ).map((total) => {
      const category = total.categoryId === null ? undefined : byId.get(total.categoryId);
      return {
        categoryId: total.categoryId,
        name: total.categoryId === null ? 'Uncategorized' : (category?.name ?? 'Unknown category'),
        color: category?.color ?? NO_CATEGORY_COLOR,
        minutes: total.minutes,
        percent: denominator > 0 ? (total.minutes / denominator) * 100 : 0,
      };
    });
  }, [summary, labelById, categories, sleepLabelId, excludeSleepFromCategories]);

  const sleepLabel = sleepLabelId === null ? undefined : labelById.get(sleepLabelId);

  return {
    loading: isPending || settings === undefined || allLabels === undefined,
    start: range.start,
    end: range.end,
    summary,
    rows,
    categoryRows,
    hasCategories: (categories ?? []).length > 0,
    sleepLabelName: sleepLabel?.name ?? null,
    sleepColor: sleepLabel?.color ?? null,
    deltaPoints,
  };
}
