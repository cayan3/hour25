import { useState, type FormEvent } from 'react';
import { sleepWindowSchema } from '../../lib/schemas';
import { slotIndexToLocalTime } from '../../lib/time';
import { SLOTS_PER_DAY } from '../../lib/constants';
import type { LabelRow } from '../../lib/db/labels';
import { toFriendlyErrorMessage } from '../../lib/errorMessage';

interface SleepWindowFormProps {
  labels: LabelRow[];
  initialSleepLabelId: string | null;
  initialSleepStart: number;
  initialSleepEnd: number;
  submitLabel?: string;
  onSave: (values: { sleepLabelId: string | null; sleepStart: number; sleepEnd: number }) => Promise<void> | void;
}

const SLOT_OPTIONS = Array.from({ length: SLOTS_PER_DAY }, (_, i) => i);

// Shared by onboarding step 2 and Settings → Sleep (DESIGN.md §5).
export function SleepWindowForm({
  labels,
  initialSleepLabelId,
  initialSleepStart,
  initialSleepEnd,
  submitLabel = 'Save',
  onSave,
}: SleepWindowFormProps) {
  const [sleepLabelId, setSleepLabelId] = useState<string | null>(initialSleepLabelId);
  const [sleepStart, setSleepStart] = useState(initialSleepStart);
  const [sleepEnd, setSleepEnd] = useState(initialSleepEnd);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = sleepWindowSchema.safeParse({ sleepLabelId, sleepStart, sleepEnd });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(parsed.data);
    } catch (e) {
      setError(toFriendlyErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="sleep-label" className="block text-sm text-slate-600 dark:text-slate-300">
          Sleep label
        </label>
        <select
          id="sleep-label"
          value={sleepLabelId ?? ''}
          onChange={(e) => setSleepLabelId(e.target.value || null)}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800"
        >
          <option value="">None</option>
          {labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="sleep-start" className="block text-sm text-slate-600 dark:text-slate-300">
            Sleep starts
          </label>
          <select
            id="sleep-start"
            value={sleepStart}
            onChange={(e) => setSleepStart(Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800"
          >
            {SLOT_OPTIONS.map((i) => (
              <option key={i} value={i}>
                {slotIndexToLocalTime(i)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor="sleep-end" className="block text-sm text-slate-600 dark:text-slate-300">
            Sleep ends
          </label>
          <select
            id="sleep-end"
            value={sleepEnd}
            onChange={(e) => setSleepEnd(Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800"
          >
            {SLOT_OPTIONS.map((i) => (
              <option key={i} value={i}>
                {slotIndexToLocalTime(i)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 dark:bg-slate-50 dark:text-slate-900"
      >
        {submitLabel}
      </button>
    </form>
  );
}
