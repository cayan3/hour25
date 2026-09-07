import { useEffect, useState } from 'react';

// Connectivity for the online-only Settings flows ONLY — import, restore and
// export — whose spec is "disabled offline with a hint" (C-36). Export joins
// the other two because it reads the whole entry range from the server: a read
// rather than a write, but just as impossible offline. This must never gate the
// entry write path — writes go to the queue regardless of connectivity, that's
// the whole architecture.
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
