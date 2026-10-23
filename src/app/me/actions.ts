'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { FormState } from '@/components/ActionForm';
import { requireParticipant } from '@/server/auth';
import { getDiscoveryStatus } from '@/server/queries';
import { db } from '@/server/supabase';

const profileSchema = z.object({
  phone: z
    .string()
    .transform((s) => s.replace(/[\s()-]/g, ''))
    .pipe(z.union([z.literal(''), z.string().regex(/^\+?\d{10,15}$/, 'Phone must be 10–15 digits, optionally starting with +.')])),
  skills: z.string().trim().max(200, 'Skills: max 200 characters.'),
  preferences: z.string().trim().max(200, 'Preferences: max 200 characters.'),
  summary: z.string().trim().max(160, 'Summary: max 160 characters.'),
});

// Partial saves are allowed; the profile counts as complete once all four fields are filled.
export async function saveProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireParticipant();
  if ((await getDiscoveryStatus()) !== 'not_started') return { error: 'Discovery has started, so profiles are locked.' };

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { phone, ...rest } = parsed.data;
  const { error } = await db().from('participants').update({ ...rest, phone: phone || null }).eq('id', me.id);
  if (error) throw error;
  revalidatePath('/me');
  return { notice: 'Saved.' };
}

const swipeSchema = z.object({ viewedId: z.uuid(), direction: z.enum(['left', 'right']) });

// Swipes are final: the update only touches a card in the viewer's own deck that has not been swiped.
export async function swipe(formData: FormData) {
  const me = await requireParticipant();
  const parsed = swipeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || (await getDiscoveryStatus()) !== 'open') return revalidatePath('/me');

  const { error } = await db()
    .from('swipes')
    .update({ direction: parsed.data.direction, swiped_at: new Date().toISOString() })
    .eq('viewer_id', me.id)
    .eq('viewed_id', parsed.data.viewedId)
    .is('direction', null);
  if (error) throw error;
  revalidatePath('/me');
}
