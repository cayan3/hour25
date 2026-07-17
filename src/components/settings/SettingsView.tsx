import { useActiveLabels, useAllLabels } from '../../hooks/useLabels';
import { useCategories } from '../../hooks/useCategories';
import { useSettings, useUpdateSettings } from '../../hooks/useSettings';
import { LabelCreateForm } from '../labels/LabelCreateForm';
import { LabelList } from '../labels/LabelList';
import { DeletedLabelsPanel } from '../labels/DeletedLabelsPanel';
import { CategoryCreateForm } from '../categories/CategoryCreateForm';
import { CategoryList } from '../categories/CategoryList';
import { SleepWindowForm } from './SleepWindowForm';
import { SetAsidePanel } from '../sync/SetAsidePanel';

export function SettingsView({ userId }: { userId: string }) {
  const activeLabels = useActiveLabels(userId);
  const allLabels = useAllLabels(userId);
  const categories = useCategories(userId);
  const settings = useSettings(userId);
  const updateSettings = useUpdateSettings(userId);

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-4">
      <section>
        <h2 className="text-lg font-medium text-slate-900 dark:text-slate-50">Labels</h2>
        <div className="mt-3">
          <LabelCreateForm userId={userId} categories={categories.data ?? []} />
        </div>
        <div className="mt-4">
          <LabelList userId={userId} labels={activeLabels.data ?? []} categories={categories.data ?? []} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-slate-900 dark:text-slate-50">Categories</h2>
        <div className="mt-3">
          <CategoryCreateForm userId={userId} />
        </div>
        <div className="mt-4">
          <CategoryList userId={userId} categories={categories.data ?? []} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-slate-900 dark:text-slate-50">Sleep</h2>
        {settings.data && (
          <div className="mt-3">
            <SleepWindowForm
              labels={activeLabels.data ?? []}
              initialSleepLabelId={settings.data.sleep_label_id}
              initialSleepStart={settings.data.sleep_start}
              initialSleepEnd={settings.data.sleep_end}
              onSave={async (values) => {
                await updateSettings.mutateAsync({
                  sleep_label_id: values.sleepLabelId,
                  sleep_start: values.sleepStart,
                  sleep_end: values.sleepEnd,
                });
              }}
            />
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium text-slate-900 dark:text-slate-50">Deleted labels</h2>
        <div className="mt-3">
          <DeletedLabelsPanel userId={userId} allLabels={allLabels.data ?? []} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-slate-900 dark:text-slate-50">Set-aside entries</h2>
        <div className="mt-3">
          <SetAsidePanel userId={userId} />
        </div>
      </section>
    </div>
  );
}
