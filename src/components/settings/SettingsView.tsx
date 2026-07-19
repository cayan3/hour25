import { useEffect, useRef, useState } from 'react';
import { useActiveLabels, useAllLabels } from '../../hooks/useLabels';
import { useCategories } from '../../hooks/useCategories';
import { useSettings, useUpdateSettings } from '../../hooks/useSettings';
import { useTransientMessage } from '../../hooks/useTransientMessage';
import { LabelCreateForm } from '../labels/LabelCreateForm';
import { LabelList } from '../labels/LabelList';
import { DeletedLabelsPanel } from '../labels/DeletedLabelsPanel';
import { CategoryCreateForm } from '../categories/CategoryCreateForm';
import { CategoryList } from '../categories/CategoryList';
import { SleepWindowForm } from './SleepWindowForm';
import { ExportPanel } from './ExportPanel';
import { ImportPanel } from './ImportPanel';
import { RestorePanel } from './RestorePanel';
import { SetAsidePanel } from '../sync/SetAsidePanel';

// Rarely-used sections collapse by default (Week 5 feedback); the frequent
// ones stay open. Full information-architecture rework is O-13's job.
// Controlled `open` is optional — the set-aside section is forced open when
// the dead-letter toast's Details points here.
function CollapsedSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <details
      className="group"
      open={open}
      onToggle={(e) => onToggle?.((e.currentTarget as HTMLDetailsElement).open)}
    >
      {/* list-none + marker hide: the custom triangle replaces the native
          disclosure marker rather than doubling it (Week 5 round 3). */}
      <summary className="cursor-pointer list-none rounded text-lg font-medium text-slate-900 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-50 [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden="true" className="ml-2 text-sm text-slate-400 group-open:hidden">
          ▸
        </span>
        <span aria-hidden="true" className="ml-2 hidden text-sm text-slate-400 group-open:inline">
          ▾
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export function SettingsView({
  userId,
  revealSetAsideNonce = 0,
  onRevealSetAsideHandled,
}: {
  userId: string;
  // Bumped by the dead-letter toast's Details action: expands the set-aside
  // section and scrolls to it — Details was a silent no-op when the user was
  // already on Settings with the section collapsed.
  revealSetAsideNonce?: number;
  // Called after the reveal is consumed so the parent clears the nonce — a
  // stale nonce would re-trigger the jump on every later Settings mount.
  onRevealSetAsideHandled?: () => void;
}) {
  const activeLabels = useActiveLabels(userId);
  const allLabels = useAllLabels(userId);
  const categories = useCategories(userId);
  const settings = useSettings(userId);
  const updateSettings = useUpdateSettings(userId);
  const [labelNotice, showLabelNotice] = useTransientMessage();
  const [categoryNotice, showCategoryNotice] = useTransientMessage();
  const [setAsideOpen, setSetAsideOpen] = useState(false);
  const setAsideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (revealSetAsideNonce > 0) {
      setSetAsideOpen(true);
      setAsideRef.current?.scrollIntoView({ block: 'start' });
      onRevealSetAsideHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealSetAsideNonce]);

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-4">
      <section>
        <h2 className="text-lg font-medium text-slate-900 dark:text-slate-50">Labels</h2>
        <div className="mt-3">
          <LabelCreateForm
            userId={userId}
            categories={categories.data ?? []}
            onCreated={() => showLabelNotice('Label added')}
          />
          <span
            role="status"
            className="mt-2 block text-sm text-emerald-600 empty:hidden dark:text-emerald-400"
          >
            {labelNotice}
          </span>
        </div>
        <div className="mt-4">
          <LabelList userId={userId} labels={activeLabels.data ?? []} categories={categories.data ?? []} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-slate-900 dark:text-slate-50">Categories</h2>
        <div className="mt-3">
          <CategoryCreateForm userId={userId} onCreated={() => showCategoryNotice('Category added')} />
          <span
            role="status"
            className="mt-2 block text-sm text-emerald-600 empty:hidden dark:text-emerald-400"
          >
            {categoryNotice}
          </span>
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
        <CollapsedSection title="Deleted labels">
          <DeletedLabelsPanel userId={userId} allLabels={allLabels.data ?? []} />
        </CollapsedSection>
      </section>

      <section>
        <CollapsedSection title="Backup & export">
          <ExportPanel userId={userId} />
        </CollapsedSection>
      </section>

      <section>
        <CollapsedSection title="Import from CSV">
          <ImportPanel userId={userId} />
        </CollapsedSection>
      </section>

      <section>
        <CollapsedSection title="Restore from backup">
          <RestorePanel userId={userId} />
        </CollapsedSection>
      </section>

      <section ref={setAsideRef}>
        <CollapsedSection title="Set-aside entries" open={setAsideOpen} onToggle={setSetAsideOpen}>
          <SetAsidePanel userId={userId} />
        </CollapsedSection>
      </section>
    </div>
  );
}
