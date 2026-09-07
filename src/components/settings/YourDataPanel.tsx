import { useState } from 'react';
import { useAccountActions, type AccountAction } from '../../hooks/useAccountActions';
import { useOnline } from '../../hooks/useOnline';

const DANGER_BUTTON =
  'min-h-11 rounded border border-red-400 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950';

const BUTTON =
  'min-h-11 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800';

const HINT = 'mt-1.5 text-sm text-slate-500 dark:text-slate-400';

// A typed word, not a second click: the two actions differ in reversibility
// (a reset survives if you hold a backup; a deletion does not), so neither may
// be reachable by muscle memory, and neither may be reachable from the other's
// confirmation.
function DestructiveAction({
  id,
  title,
  description,
  confirmWord,
  armLabel,
  confirmLabel,
  runningLabel,
  doneMessage,
  running,
  done,
  disabled,
  offline,
  onConfirm,
}: {
  id: string;
  title: string;
  description: string;
  confirmWord: string;
  armLabel: string;
  confirmLabel: string;
  runningLabel: string;
  doneMessage: string;
  running: boolean;
  done: boolean;
  disabled: boolean;
  offline: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState('');
  const inputId = `${id}-confirm`;
  const ready = typed.trim() === confirmWord;

  return (
    <div>
      <h3 className="text-base font-medium text-slate-900 dark:text-slate-50">{title}</h3>
      <p className={HINT}>{description}</p>

      {done ? (
        <p role="status" className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
          {doneMessage}
        </p>
      ) : !armed ? (
        <div className="mt-2">
          <button
            type="button"
            className={DANGER_BUTTON}
            disabled={disabled}
            onClick={() => setArmed(true)}
          >
            {armLabel}
          </button>
          {offline && (
            <p className={HINT}>
              You’re offline — this runs on the server, so it needs a connection.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <label htmlFor={inputId} className="block text-sm text-slate-900 dark:text-slate-50">
            Type <span className="font-mono font-semibold">{confirmWord}</span> to confirm
          </label>
          <input
            id={inputId}
            type="text"
            value={typed}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setTyped(e.target.value)}
            className="block min-h-11 w-full max-w-xs rounded border border-slate-300 bg-transparent px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={DANGER_BUTTON}
              disabled={!ready || running || disabled}
              onClick={onConfirm}
            >
              {running ? runningLabel : confirmLabel}
            </button>
            <button
              type="button"
              className={BUTTON}
              disabled={running}
              onClick={() => {
                setArmed(false);
                setTyped('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// future-features §2a: two separate actions under one heading, each with its
// own typed confirmation — not nested, not linked. Deleting the account must
// be findable on its own (burying it inside "reset" is the pattern regulators
// dislike), and someone who wanted a fresh start must never delete themselves
// by accident. Both are online-only, so they take C-36's disabled-with-hint
// treatment like import, restore and export.
export function YourDataPanel({ userId }: { userId: string }) {
  const { busy, done, error, resetData, deleteAccount } = useAccountActions(userId);
  const online = useOnline();

  const blocked = (action: AccountAction) => !online || (busy !== null && busy !== action);

  return (
    // Bordered and set apart from the rest of Settings: these are the only
    // controls on the page that destroy data on the server.
    <section
      aria-labelledby="your-data-heading"
      className="rounded border border-red-300 p-4 dark:border-red-900"
    >
      <h2 id="your-data-heading" className="text-lg font-medium text-slate-900 dark:text-slate-50">
        Your data
      </h2>
      <p className={HINT}>
        Two separate actions. Both are permanent and neither can be undone from inside the app —
        download a backup first if there is any chance you want this history back.
      </p>

      <div className="mt-4 space-y-6">
        <DestructiveAction
          id="reset-data"
          title="Reset my data"
          description="Deletes every entry, label and category in your account. You stay signed in and the app starts over at onboarding, so you can restore a backup afterwards."
          confirmWord="RESET"
          armLabel="Reset my data"
          confirmLabel="Reset everything"
          runningLabel="Resetting…"
          doneMessage="Your data has been reset."
          running={busy === 'reset'}
          done={done === 'reset'}
          disabled={blocked('reset')}
          offline={!online}
          onConfirm={() => void resetData()}
        />

        <DestructiveAction
          id="delete-account"
          title="Delete my account"
          description="Deletes everything above and the account itself, including your sign-in. You’ll be signed out, and nothing is kept — this cannot be reversed by anyone."
          confirmWord="DELETE"
          armLabel="Delete my account"
          confirmLabel="Delete everything and sign out"
          runningLabel="Deleting…"
          doneMessage="Your account has been deleted."
          running={busy === 'delete'}
          done={done === 'delete'}
          disabled={blocked('delete')}
          offline={!online}
          onConfirm={() => void deleteAccount()}
        />
      </div>

      <p role="alert" className="mt-4 text-sm text-red-600 empty:hidden dark:text-red-400">
        {error}
      </p>
    </section>
  );
}
