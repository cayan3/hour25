// crypto.randomUUID exists only in secure contexts — http://localhost counts,
// but plain-http LAN origins (http://192.168.x.x:5173, http://name.local:5173,
// used for phone testing against the dev server) do not, and every queue
// write threw there. crypto.getRandomValues works everywhere, so fall back to
// building a v4 UUID from it by hand.
export function randomUUID(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-');
}
