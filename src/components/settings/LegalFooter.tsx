// The privacy policy and terms are static files served by Cloudflare before the
// SPA rewrite applies, so these are ordinary navigations rather than routes;
// each page carries its own link back. The extension-less paths are canonical —
// /privacy.html 308-redirects to /privacy — so link the destination directly
// instead of paying for the hop.
const LEGAL_LINK =
  'inline-flex min-h-11 items-center rounded text-slate-500 underline underline-offset-2 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-400 dark:hover:text-slate-50';

export function LegalFooter() {
  return (
    <footer className="border-t border-slate-200 pt-2 dark:border-slate-700">
      <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-6 text-sm">
        <a className={LEGAL_LINK} href="/privacy">
          Privacy policy
        </a>
        <a className={LEGAL_LINK} href="/terms">
          Terms of use
        </a>
      </nav>
    </footer>
  );
}
