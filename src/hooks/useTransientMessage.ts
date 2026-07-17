import { useCallback, useRef, useState, useEffect } from 'react';

// Transient "Saved"/"Added"/"Deleted" confirmations (Week 5 feedback: several
// Settings actions completed silently). A newer show() restarts the window,
// including for the same text twice in a row.
export function useTransientMessage(
  ms = 2_500,
): readonly [string | null, (message: string) => void] {
  const [current, setCurrent] = useState<{ text: string; id: number } | null>(null);
  const nonce = useRef(0);

  useEffect(() => {
    if (current === null) return;
    const timer = setTimeout(() => setCurrent(null), ms);
    return () => clearTimeout(timer);
  }, [current, ms]);

  const show = useCallback((text: string) => {
    nonce.current += 1;
    setCurrent({ text, id: nonce.current });
  }, []);

  return [current?.text ?? null, show] as const;
}
