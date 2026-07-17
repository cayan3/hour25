// MRU label list for the picker's Recent section (C-42): persisted per-user
// in localStorage and updated after each assignment, so Recents are warm on a
// fresh load of an empty day. The picker SNAPSHOTS this when it opens — it
// never reorders while open, so number keys don't shift under your fingers.

export const MRU_DISPLAY_LIMIT = 9; // number keys 1–9

// Keep more than we display so soft-deletes/filtering can't empty the section.
const MRU_STORED_LIMIT = 20;

const keyFor = (userId: string): string => `label-mru:${userId}`;

// Pure core: most recent first, deduped, capped.
export function pushMru(list: readonly string[], labelId: string, limit = MRU_STORED_LIMIT): string[] {
  return [labelId, ...list.filter((id) => id !== labelId)].slice(0, limit);
}

export function loadMru(userId: string): string[] {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return []; // corrupt storage is never worth breaking the picker over
  }
}

export function recordLabelUse(userId: string, labelId: string): void {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(pushMru(loadMru(userId), labelId)));
  } catch {
    // Quota/private-mode: MRU is a convenience, not data — drop silently.
  }
}
