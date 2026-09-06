import { z } from 'zod';
import { SLOTS_PER_DAY } from './constants';

// Zod validates exactly three surfaces: CSV import rows, JSON backup files,
// and user-facing forms — never db helpers or internal call paths, which
// trust their callers. These are the label/category/settings forms.

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Enter a 6-digit hex color, e.g. #4287f5');

// Exported standalone so any call site that only collects a name (label
// rename, restore-with-rename) validates against the same rule instead of
// reimplementing it — a bare `create`/`restore` db call has no length check
// of its own and will happily insert a blank name otherwise.
export const nameSchema = z.string().trim().min(1, 'Name is required').max(60, 'Keep it under 60 characters');

export const labelFormSchema = z.object({
  name: nameSchema,
  color: hexColor,
  categoryId: z.string().nullable().optional(),
});
export type LabelFormValues = z.infer<typeof labelFormSchema>;

export const categoryFormSchema = z.object({
  name: nameSchema,
  color: hexColor,
});
export type CategoryFormValues = z.infer<typeof categoryFormSchema>;

const slotIndex = z.number().int().min(0).max(SLOTS_PER_DAY - 1);

export const sleepWindowSchema = z
  .object({
    sleepLabelId: z.string().nullable(),
    sleepStart: slotIndex,
    sleepEnd: slotIndex,
  })
  .refine((v) => v.sleepStart !== v.sleepEnd, {
    message: 'Sleep start and end can’t be the same time',
    path: ['sleepEnd'],
  });
export type SleepWindowValues = z.infer<typeof sleepWindowSchema>;
