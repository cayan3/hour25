import { useRegisterSW } from 'virtual:pwa-register/react';

// DESIGN §7 / C-40: the service worker registers with `registerType: 'prompt'`,
// so a new build waits in the wings until the user says so. Reloading on its
// own would throw away an open picker or a half-typed note — the one thing an
// always-open logging app must not do.
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-slate-50 shadow-lg dark:bg-slate-50 dark:text-slate-900"
    >
      <span>A new version is ready</span>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="min-h-11 rounded px-2 font-medium text-sky-300 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-sky-700"
      >
        Reload
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        aria-label="Dismiss"
        className="min-h-11 rounded px-1 text-slate-400 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-500"
      >
        ✕
      </button>
    </div>
  );
}
