export const CHUNK_MINUTES = 30;
export const SLOTS_PER_DAY = 48;
export const MAX_FLUSH_ATTEMPTS = 8; // poison-isolation path only (C-29)
export const FLUSH_BATCH_SIZE = 25;
export const IMPORT_BATCH_SIZE = 500; // direct import path only (C-36)
export const CACHE_BUSTER = 'v1'; // bump to invalidate the persisted query cache
// Set-aside (dead-letter) rows this old are purged during flush — the review
// list must not grow forever with failures nobody is coming back for (Week 5).
export const DEAD_LETTER_TTL_MS = 30 * 24 * 3600 * 1000;
