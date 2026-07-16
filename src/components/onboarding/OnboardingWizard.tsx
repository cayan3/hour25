import { useState } from 'react';
import { useUpdateSettings } from '../../hooks/useSettings';
import { StepCreateLabels } from './StepCreateLabels';
import { StepSleep } from './StepSleep';
import { StepLandOnToday } from './StepLandOnToday';

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
  const updateSettings = useUpdateSettings(userId);

  async function stampOnboarded() {
    await updateSettings.mutateAsync({ onboarded_at: new Date().toISOString() });
    onDone();
  }

  return (
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
  );
}
