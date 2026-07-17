function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function srgbToLinear(channel: number): number {
  const cs = channel / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

// The only sanctioned way to place text on a label color (DESIGN.md §6).
// Prefers near-white whenever near-white clears AA — a consistent default,
// per Week 5 feedback that the black/white mix felt arbitrary — and falls
// back to whichever color contrasts better (mid-lightness backgrounds
// mathematically can't give white 4.5:1; those keep dark text, and truly
// AA-impossible customs are flagged by isLowContrast below).
export function contrastText(hex: string): '#0f172a' | '#f8fafc' {
  const white = contrastRatio(hex, '#f8fafc');
  if (white >= AA_TEXT_CONTRAST) return '#f8fafc';
  return contrastRatio(hex, '#0f172a') >= white ? '#0f172a' : '#f8fafc';
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

const AA_TEXT_CONTRAST = 4.5;

// Drives the non-blocking warning on the custom-hex "advanced" disclosure
// (DESIGN.md §6) — checks the ratio against contrastText's own pick, so a
// custom color that can't clear AA with either near-black or near-white text
// gets flagged.
export function isLowContrast(hex: string): boolean {
  return contrastRatio(hex, contrastText(hex)) < AA_TEXT_CONTRAST;
}
