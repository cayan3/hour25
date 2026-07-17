import { useEffect } from 'react';
import { useUndo } from '../../hooks/useSlotActions';

const UNDO_WINDOW_MS = 6_000;

// C-30 / DESIGN §4: after any single-slot change a transient snackbar offers
// Undo for ~6s; it re-applies the previous state through the normal write
// path. Single level, latest action only.
export function UndoSnackbar({ userId }: { userId: string }) {
  const { lastAction, undo, dismiss } = useUndo(userId);

  useEffect(() => {
    if (!lastAction) return;
    const timer = setTimeout(dismiss, UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
    // Keyed on the action's nonce so a new action restarts the window.
  }, [lastAction?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⌘/Ctrl+Z while the snackbar is up (Week 5 feedback — Z is the universal
  // undo key). Living here means the listener exists exactly while undo is
  // available; once the window lapses the browser default returns. Text
  // fields keep their own native undo.
  useEffect(() => {
    if (!lastAction) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      undo();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lastAction?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lastAction) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-slate-50 shadow-lg dark:bg-slate-50 dark:text-slate-900"
    >
      <span>{lastAction.description}</span>
      <button
        type="button"
        onClick={undo}
        className="min-h-11 rounded px-2 font-medium text-sky-300 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-sky-700"
      >
        Undo
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="min-h-11 rounded px-1 text-slate-400 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-500"
      >
        ✕
      </button>
    </div>
  );
}
