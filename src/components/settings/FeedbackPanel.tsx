import { useOnline } from '../../hooks/useOnline';
import { usePendingCount } from '../../hooks/useSync';
import { useQueueStatusStore } from '../../store/queueStatus';

// The address published in the privacy policy. The OAuth consent screen
// requires a contact address anyway, so this should be that same mailbox
// rather than a second one to monitor.
const FEEDBACK_EMAIL = '';

const BUTTON =
  'inline-block min-h-11 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:hover:bg-slate-800';

// A mailto rather than a form that writes to the database, deliberately: the
// reports most worth having here are about offline behaviour, and a form that
// needs the network to submit is exactly the wrong shape for telling someone
// the network path is broken. A mail client composes offline and sends on
// reconnect.
//
// The prefilled body is the point. People report "it broke", never the state
// the app was in when it did — and for this app the state that matters is
// whether anything was still waiting to sync.
export function FeedbackPanel({ userId }: { userId: string }) {
  const online = useOnline();
  const pending = usePendingCount(userId);
  const setAside = useQueueStatusStore((s) => s.deadCount);

  if (!FEEDBACK_EMAIL) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        A contact address hasn’t been set for this deployment yet.
      </p>
    );
  }

  const body = [
    'What happened:',
    '',
    'What you expected instead:',
    '',
    '',
    '--- details below help with debugging; delete them if you’d rather not send them ---',
    `connection: ${online ? 'online' : 'offline'}`,
    `waiting to sync: ${pending}`,
    `set aside: ${setAside}`,
    `timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    `screen: ${window.innerWidth}×${window.innerHeight}`,
    `build: ${import.meta.env.MODE}`,
    `account: ${userId}`,
    `browser: ${navigator.userAgent}`,
  ].join('\n');

  const href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(
    'Time Tracker feedback',
  )}&body=${encodeURIComponent(body)}`;

  return (
    <div className="space-y-2">
      <a className={BUTTON} href={href}>
        Report a problem or send feedback
      </a>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Opens an email with a few technical details filled in — what your connection was doing and
        whether anything was still waiting to sync. Delete any of it you’d rather not send.
      </p>
    </div>
  );
}
