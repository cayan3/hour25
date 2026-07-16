import { describe, it, expect, beforeEach } from 'vitest';
import { LABEL_PALETTE, nextPaletteColor, resetPaletteCursor } from '../../src/lib/palette';
import { isLowContrast } from '../../src/lib/color';

describe('LABEL_PALETTE', () => {
  it('has exactly 16 swatches', () => {
    expect(LABEL_PALETTE).toHaveLength(16);
  });

  it('every swatch is a valid 6-digit hex color', () => {
    for (const swatch of LABEL_PALETTE) {
      expect(swatch.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('every swatch clears AA contrast (DESIGN.md §6)', () => {
    for (const swatch of LABEL_PALETTE) {
      expect(isLowContrast(swatch.hex)).toBe(false);
    }
  });

  it('has no duplicate hex values', () => {
    const hexes = LABEL_PALETTE.map((s) => s.hex.toLowerCase());
    expect(new Set(hexes).size).toBe(hexes.length);
  });
});

describe('nextPaletteColor', () => {
  beforeEach(() => resetPaletteCursor());

  it('cycles through the palette in order', () => {
    const colors = Array.from({ length: LABEL_PALETTE.length }, () => nextPaletteColor());
    expect(colors).toEqual(LABEL_PALETTE.map((s) => s.hex));
  });

  it('wraps back to the first swatch after a full cycle', () => {
    for (let i = 0; i < LABEL_PALETTE.length; i++) nextPaletteColor();
    expect(nextPaletteColor()).toBe(LABEL_PALETTE[0].hex);
  });
});
