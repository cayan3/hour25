import { describe, it, expect } from 'vitest';
import { nameSchema, labelFormSchema, categoryFormSchema, sleepWindowSchema } from '../../src/lib/schemas';

describe('nameSchema', () => {
  it('rejects an empty string', () => {
    expect(nameSchema.safeParse('').success).toBe(false);
  });

  it('rejects a whitespace-only string', () => {
    // Regression: RestoreOrCreateDialog's create-new / rename-restore paths
    // used to call createLabel/restoreLabel directly with an unvalidated
    // name, so submitting blank silently created/renamed to "".
    expect(nameSchema.safeParse('   ').success).toBe(false);
  });

  it('trims and accepts a normal name', () => {
    const result = nameSchema.safeParse('  gaming  ');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('gaming');
  });

  it('rejects a name over 60 characters', () => {
    expect(nameSchema.safeParse('a'.repeat(61)).success).toBe(false);
  });
});

describe('labelFormSchema', () => {
  it('rejects a blank name even with a valid color', () => {
    expect(labelFormSchema.safeParse({ name: '', color: '#4287f5' }).success).toBe(false);
  });

  it('rejects a malformed hex color', () => {
    expect(labelFormSchema.safeParse({ name: 'Work', color: 'blue' }).success).toBe(false);
  });

  it('accepts a valid label', () => {
    expect(labelFormSchema.safeParse({ name: 'Work', color: '#4287f5', categoryId: null }).success).toBe(true);
  });
});

describe('categoryFormSchema', () => {
  it('rejects a blank name', () => {
    expect(categoryFormSchema.safeParse({ name: '', color: '#4287f5' }).success).toBe(false);
  });
});

describe('sleepWindowSchema', () => {
  it('rejects sleepStart === sleepEnd', () => {
    const result = sleepWindowSchema.safeParse({ sleepLabelId: null, sleepStart: 10, sleepEnd: 10 });
    expect(result.success).toBe(false);
  });

  it('accepts a valid distinct window', () => {
    const result = sleepWindowSchema.safeParse({ sleepLabelId: null, sleepStart: 46, sleepEnd: 14 });
    expect(result.success).toBe(true);
  });
});
