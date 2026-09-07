// A bound on how long we are willing to await someone else's promise.
//
// This is not a cancellation: the underlying work keeps running, we just stop
// waiting on it. That is the point at the flush boundary — supabase-js's
// session refresh carries on in the background and caches its result, so the
// next caller finds it ready instead of starting over.
export const TIMED_OUT = Symbol('deadline exceeded');

export function withDeadline<T>(promise: PromiseLike<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      // A rejection is a real answer — pass it through so the caller's own
      // error handling (classifyError, and so on) still sees it.
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
