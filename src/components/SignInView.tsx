import { useState } from 'react';
import { signInWithGoogle } from '../lib/db/auth';

export function SignInView() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle(); // redirects the page on success; no further state change here
    } catch {
      setError('Sign-in failed. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 p-8 text-center dark:border-slate-700">
        <h1 className="mb-6 text-lg font-medium text-slate-900 dark:text-slate-50">Hour 25</h1>
        <button
          type="button"
          onClick={handleSignIn}
          disabled={loading}
          className="w-full rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 dark:border-slate-600 dark:text-slate-50 dark:hover:bg-slate-800"
        >
          {loading ? 'Signing in…' : 'Sign in with Google'}
        </button>
        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}
