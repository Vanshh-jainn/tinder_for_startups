'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { FormState } from '@/components/ActionForm';
import { profileSchema } from '@/lib/profile';
import { requireParticipant } from '@/server/auth';
import { getDiscoveryStatus, getEventState } from '@/server/queries';
import { db } from '@/server/supabase';

// Partial saves are allowed; the profile counts as complete once all four fields are filled.
export async function saveProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireParticipant();
  // Profiles open when the admin starts the event (Introduction) and lock when Matchmaking opens.
  if ((await getEventState()).phase_idx === null) return { error: "The event hasn't started yet. Profiles open when it starts." };
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
