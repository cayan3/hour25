// Generates the PWA icon set (SPEC §11) from one motif definition, so the
// icons are reproducible from source rather than binary blobs nobody can
// regenerate. Run: `node scripts/generate-icons.mjs`.
//
// The motif is the app itself: a 6×4 grid of half-hour slots, some filled,
// some empty — the same "empty slot is untracked" idea the day view draws.
// PNGs are encoded here with node's zlib rather than pulling in an image
// library for four flat-colour images.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public');

const BG = [2, 132, 199]; // sky-600 — reads on both light and dark home screens
const FILLED = [248, 250, 252]; // slate-50
const EMPTY = [56, 163, 217]; // a lighter wash of BG: present, but clearly not logged

const COLS = 6;
const ROWS = 4;
// Which cells are "logged". A fixed, deliberately uneven pattern — a full or
// checkerboard grid reads as decoration rather than as a tracked day.
const PATTERN = [
  [1, 1, 0, 1, 1, 1],
  [1, 0, 0, 1, 1, 0],
  [0, 1, 1, 1, 0, 0],
  [1, 1, 0, 0, 1, 1],
];

function drawIcon(size, inset) {
  const px = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    px[i * 4] = BG[0];
    px[i * 4 + 1] = BG[1];
    px[i * 4 + 2] = BG[2];
    px[i * 4 + 3] = 255;
  }

  // `inset` is the fraction of the canvas kept clear on each edge: the
  // maskable variant needs the motif inside the 80% safe zone, since the
  // platform is free to crop the corners to any shape it likes.
  const margin = Math.round(size * inset);
  const area = size - margin * 2;
  const gap = Math.max(1, Math.round(area * 0.02));
  const cellW = (area - gap * (COLS - 1)) / COLS;
  const cellH = (area - gap * (ROWS - 1)) / ROWS;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = PATTERN[r][c] ? FILLED : EMPTY;
      const x0 = Math.round(margin + c * (cellW + gap));
      const y0 = Math.round(margin + r * (cellH + gap));
      for (let y = y0; y < Math.round(y0 + cellH); y++) {
        for (let x = x0; x < Math.round(x0 + cellW); x++) {
          const i = (y * size + x) * 4;
          px[i] = color[0];
          px[i + 1] = color[1];
          px[i + 2] = color[2];
        }
      }
    }
  }
  return px;
}

// --- minimal PNG encoder (truecolour + alpha, no interlacing) ---

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // Each scanline is prefixed with its filter type byte; 0 = none.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg(size, inset) {
  const margin = size * inset;
  const area = size - margin * 2;
  const gap = area * 0.02;
  const cellW = (area - gap * (COLS - 1)) / COLS;
  const cellH = (area - gap * (ROWS - 1)) / ROWS;
  const rect = (c) => `rgb(${c.join(',')})`;
  const cells = PATTERN.flatMap((row, r) =>
    row.map(
      (on, c) =>
        `<rect x="${(margin + c * (cellW + gap)).toFixed(2)}" y="${(margin + r * (cellH + gap)).toFixed(2)}" width="${cellW.toFixed(2)}" height="${cellH.toFixed(2)}" fill="${rect(on ? FILLED : EMPTY)}"/>`,
    ),
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${rect(BG)}"/>${cells}</svg>\n`;
}

mkdirSync(OUT, { recursive: true });
for (const [name, size, inset] of [
  ['pwa-192x192.png', 192, 0.12],
  ['pwa-512x512.png', 512, 0.12],
  ['maskable-512x512.png', 512, 0.2],
  ['apple-touch-icon.png', 180, 0.12],
]) {
  writeFileSync(resolve(OUT, name), encodePng(size, drawIcon(size, inset)));
  console.log('wrote', name);
}
writeFileSync(resolve(OUT, 'favicon.svg'), svg(64, 0.08));
console.log('wrote favicon.svg');
