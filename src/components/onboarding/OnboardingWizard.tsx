import { useState } from 'react';
import { useUpdateSettings } from '../../hooks/useSettings';
import { StepCreateLabels } from './StepCreateLabels';
import { StepSleep } from './StepSleep';
import { StepLandOnToday } from './StepLandOnToday';
import { toFriendlyErrorMessage } from '../../lib/errorMessage';

interface OnboardingWizardProps {
  userId: string;
  initialSleepStart: number;
  initialSleepEnd: number;
  onDone: () => void;
}

// Three inline steps (DESIGN.md §5); finishing OR skipping stamps
// onboarded_at (C-38) so the wizard never re-triggers.
export function OnboardingWizard({ userId, initialSleepStart, initialSleepEnd, onDone }: OnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [finishError, setFinishError] = useState<string | null>(null);
  const updateSettings = useUpdateSettings(userId);

  async function stampOnboarded() {
    try {
      await updateSettings.mutateAsync({ onboarded_at: new Date().toISOString() });
      onDone();
    } catch (e) {
      setFinishError(toFriendlyErrorMessage(e));
    }
  }

  return (
    // This replaces the whole page (App.tsx renders it instead of the usual
    // AuthenticatedShell wrapper), so — unlike Today/Settings, which sit
    // inside that wrapper's own bg/text classes — it must set its own.
    // Tailwind dark: variants only flip colors that are declared explicitly;
    // without this, the page stayed on browser-default white/black no matter
    // what the `dark` class on <html> said, and text using dark:text-slate-50
    // (e.g. label names) went invisible against the still-white background.
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-50">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center p-4">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-slate-400">Step {step} of 3</p>
          {step < 3 && (
            <button
              type="button"
              onClick={stampOnboarded}
              className="rounded text-xs text-slate-400 underline focus-visible:ring-2 focus-visible:ring-offset-2 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Skip onboarding
            </button>
          )}
        </div>
        {finishError && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{finishError}</p>}

        {step === 1 && <StepCreateLabels userId={userId} onContinue={() => setStep(2)} />}
        {step === 2 && (
          <StepSleep
            userId={userId}
            initialSleepStart={initialSleepStart}
            initialSleepEnd={initialSleepEnd}
            onContinue={() => setStep(3)}
          />
        )}
        {step === 3 && <StepLandOnToday onFinish={stampOnboarded} />}
      </div>
    </div>
  );
}
