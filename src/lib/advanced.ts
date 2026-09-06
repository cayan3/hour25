// Spreadsheet import/export is migration tooling, not a product feature. It
// exists so a spreadsheet-shaped history can be brought in once, and it is
// lossy by nature — CSV carries dates, slots and label names, and drops notes,
// colours, categories, soft-delete state and settings.
//
// Showing it beside the JSON backup invites the one mistake that actually costs
// data: treating a CSV as a backup, and finding out what it omits at the worst
// possible moment. That is the error C-37 already corrected once at the spec
// level; this keeps the UI from re-teaching it.
//
// The code stays shipped and tested rather than deleted — the parse/plan/commit
// pipeline is still the migration path, and still needed. Only the UI is
// hidden. Append `?advanced=1` to the URL to reach it.
export function advancedToolsEnabled(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('advanced') === '1';
  } catch {
    return false; // no window/search in a non-browser context — default to off
  }
}
