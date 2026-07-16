import { z } from 'zod';
import { SLOTS_PER_DAY } from './constants';

// Zod validates exactly three surfaces (CLAUDE.md): CSV import rows, JSON
// backup files, and user-facing forms. These are the label/category/settings
// forms.

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Enter a 6-digit hex color, e.g. #4287f5');

const name = z.string().trim().min(1, 'Name is required').max(60, 'Keep it under 60 characters');

export const labelFormSchema = z.object({
  name,
  color: hexColor,
  categoryId: z.string().nullable().optional(),
});
export type LabelFormValues = z.infer<typeof labelFormSchema>;

export const categoryFormSchema = z.object({
  name,
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
