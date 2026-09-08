import { useEffect, useMemo, useState } from 'react';
import { useRangeEntries } from './useDayEntries';
import { useAllLabels } from './useLabels';
import { useSettings } from './useSettings';
import {
  periodRange,
  summarizePeriod,
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

export interface StatsResult {
  loading: boolean;
  start: string;
  end: string;
  summary: PeriodSummary;
  rows: StatsLabelRow[];
  /** Null when no sleep label is set, or when it no longer resolves. */
  sleepLabelName: string | null;
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

export function useStats(userId: string, kind: PeriodKind, anchor: string): StatsResult {
  const now = useNow();
  const range = useMemo(() => periodRange(kind, anchor), [kind, anchor]);
  const { entries, isPending } = useRangeEntries(userId, range.start, range.end);
  const { data: settings } = useSettings(userId);
  const { data: allLabels } = useAllLabels(userId);

  const sleepLabelId = settings?.sleep_label_id ?? null;

  const summary = useMemo(
    () => summarizePeriod(entries, range, sleepLabelId, now),
    [entries, range, sleepLabelId, now],
  );

  // labels-all, never the picker's active list (§7.5): a slot logged under a
  // since-deleted label must keep its name and color in history.
  const rows = useMemo<StatsLabelRow[]>(() => {
    const byId = new Map((allLabels ?? []).map((l) => [l.id, l]));
    const denominator = summary.expectedMinutes;
    return summary.byLabel.map((total) => {
      const label = byId.get(total.labelId);
      return {
        labelId: total.labelId,
        name: label?.name ?? 'Unknown label',
        color: label?.color ?? '#94a3b8',
        deleted: label ? label.deleted_at !== null : false,
        isSleep: total.labelId === sleepLabelId,
        minutes: total.minutes,
        percent: denominator > 0 ? (total.minutes / denominator) * 100 : 0,
      };
    });
  }, [summary, allLabels, sleepLabelId]);

  const sleepLabelName = useMemo(() => {
    if (!sleepLabelId) return null;
    return (allLabels ?? []).find((l) => l.id === sleepLabelId)?.name ?? null;
  }, [allLabels, sleepLabelId]);

  return {
    loading: isPending || settings === undefined || allLabels === undefined,
    start: range.start,
    end: range.end,
    summary,
    rows,
    sleepLabelName,
  };
}
