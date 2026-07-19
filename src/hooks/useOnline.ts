import { useEffect, useState } from 'react';

// Connectivity for C-36's import/restore buttons ONLY: those are the two
// sanctioned online-only flows, and their spec is "disabled offline with a
// hint". This must never gate the entry write path — writes go to the queue
// regardless of connectivity, that's the whole architecture.
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return online;
}
