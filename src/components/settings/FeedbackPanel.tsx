import { useOnline } from '../../hooks/useOnline';
import { usePendingCount } from '../../hooks/useSync';
import { useQueueStatusStore } from '../../store/queueStatus';

const FEEDBACK_EMAIL = 'hour25app@gmail.com';

const BUTTON =
  'inline-block min-h-11 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:hover:bg-slate-800';

// A mailto instead of a form that writes to the database bc a mail client 
// composes offline and sends on reconnect.
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
    'Hour 25 feedback',
  )}&body=${encodeURIComponent(body)}`;

  return (
    <div className="space-y-2">
      <a className={BUTTON} href={href}>
        Report a problem or send feedback
      </a>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Send an email about your issue and/or comments.
      </p>
    </div>
  );
}
