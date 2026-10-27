import { z } from 'zod';

// Profile fields, shared by the participant's own form and the admin correction form.
// The DB column checks are the authority; this gives readable messages first.
export const profileSchema = z.object({
  phone: z
    .string()
    .transform((s) => s.replace(/[\s()-]/g, ''))
    .pipe(z.union([z.literal(''), z.string().regex(/^\+?\d{10,15}$/, 'Phone must be 10–15 digits, optionally starting with +.')])),
  skills: z.string().trim().max(200, 'Skills: max 200 characters.'),
  preferences: z.string().trim().max(200, 'Preferences: max 200 characters.'),
  summary: z.string().trim().max(160, 'Summary: max 160 characters.'),
});
