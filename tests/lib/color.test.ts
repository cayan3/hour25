import { describe, it, expect } from 'vitest';
import { contrastText, contrastRatio, isLowContrast } from '../../src/lib/color';

describe('contrastText', () => {
  it('returns near-white text on a black background', () => {
    expect(contrastText('#000000')).toBe('#f8fafc');
  });

  it('returns near-black text on a white background', () => {
    expect(contrastText('#ffffff')).toBe('#0f172a');
  });

  it('returns near-black text on a bright yellow background', () => {
    expect(contrastText('#facc15')).toBe('#0f172a');
  });

  it('returns near-white text on a dark navy background', () => {
    expect(contrastText('#1e3a8a')).toBe('#f8fafc');
  });

  it('supports 3-digit hex shorthand', () => {
    expect(contrastText('#fff')).toBe('#0f172a');
    expect(contrastText('#000')).toBe('#f8fafc');
  });

  it('supports hex without a leading #', () => {
    expect(contrastText('ffffff')).toBe('#0f172a');
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black against white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('is 1:1 for identical colors', () => {
    expect(contrastRatio('#4287f5', '#4287f5')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#123456', '#abcdef')).toBeCloseTo(contrastRatio('#abcdef', '#123456'), 5);
  });
});

describe('isLowContrast', () => {
  it('flags a mid-gray custom color that cannot clear AA with either text color', () => {
    expect(isLowContrast('#787878')).toBe(true);
  });

  it('does not flag a saturated color that clears AA', () => {
    expect(isLowContrast('#0072b2')).toBe(false);
  });
});
