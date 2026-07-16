interface ClassifiedError {
  kind?: 'network' | 'auth' | 'permanent';
}

// Label/category writes are direct, online-only calls (not the write-ahead
// queue), so they don't get the queue's dedicated banners — but they can
// still throw (a classified Supabase error, or a plain Error from a
// zero-rows-affected guard), and the UI must show *something* rather than
// silently no-op.
export function toFriendlyErrorMessage(error: unknown): string {
  const kind = (error as ClassifiedError | null | undefined)?.kind;
  if (kind === 'network') return "You're offline — check your connection and try again.";
  if (kind === 'auth') return 'Please sign in again and try again.';
  return 'Something went wrong. Please try again.';
}
