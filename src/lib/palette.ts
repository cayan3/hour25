// Curated 16-swatch label palette (DESIGN.md §6). Built from the Okabe–Ito
// colorblind-safe categorical set (7 hues, chosen to stay distinguishable
// under deuteranopia) rendered at two lightness tiers, plus a neutral gray
// pair. Every swatch clears AA (4.5:1) via contrastText — see
// tests/lib/palette.test.ts.
export interface PaletteSwatch {
  name: string;
  hex: string;
}

export const LABEL_PALETTE: PaletteSwatch[] = [
  { name: 'orange-dark', hex: '#936600' },
  { name: 'orange-light', hex: '#f4d48c' },
  { name: 'sky-dark', hex: '#377395' },
  { name: 'sky-light', hex: '#b3ddf5' },
  { name: 'green-dark', hex: '#00654a' },
  { name: 'green-light', hex: '#8cd3c0' },
  { name: 'yellow-dark', hex: '#9a922a' },
  { name: 'yellow-light', hex: '#f8f3aa' },
  { name: 'blue-dark', hex: '#004972' },
  { name: 'blue-light', hex: '#8cc0dc' },
  { name: 'vermillion-dark', hex: '#883c00' },
  { name: 'vermillion-light', hex: '#ecb78c' },
  { name: 'purple-dark', hex: '#834d6b' },
  { name: 'purple-light', hex: '#e8c3d7' },
  { name: 'neutral-dark', hex: '#5a5a5a' },
  { name: 'neutral-light', hex: '#cbcbcb' },
];

let cursor = 0;

// Auto-assigned colors (onboarding suggestion chips, import resolution's
// create-with-palette-color default) cycle through the palette in order.
export function nextPaletteColor(): string {
  const hex = LABEL_PALETTE[cursor % LABEL_PALETTE.length].hex;
  cursor += 1;
  return hex;
}

export function resetPaletteCursor(): void {
  cursor = 0;
}
