import { describe, it, expect } from 'vitest';
import { contrastText } from '../../src/lib/color';

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
