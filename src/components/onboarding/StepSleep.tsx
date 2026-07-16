import { useActiveLabels } from '../../hooks/useLabels';
import { useUpdateSettings } from '../../hooks/useSettings';
import { SleepWindowForm } from '../settings/SleepWindowForm';

interface StepSleepProps {
  userId: string;
  initialSleepStart: number;
  initialSleepEnd: number;
  onContinue: () => void;
}

export function StepSleep({ userId, initialSleepStart, initialSleepEnd, onContinue }: StepSleepProps) {
  const activeLabels = useActiveLabels(userId);
  const updateSettings = useUpdateSettings(userId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-medium text-slate-900 dark:text-slate-50">Set your sleep window</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Fill sleep stays disabled until you set a sleep label — you can always do this later in Settings.
        </p>
      </div>

      <SleepWindowForm
        labels={activeLabels.data ?? []}
        initialSleepLabelId={null}
        initialSleepStart={initialSleepStart}
        initialSleepEnd={initialSleepEnd}
        submitLabel="Save and continue"
        onSave={async (values) => {
          await updateSettings.mutateAsync({
            sleep_label_id: values.sleepLabelId,
            sleep_start: values.sleepStart,
            sleep_end: values.sleepEnd,
          });
          onContinue();
        }}
      />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onContinue}
          className="px-3 py-2 text-sm text-slate-500 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-400"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
