'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { FormState } from '@/components/ActionForm';
import { requireTeamMember } from '@/server/auth';
import { getEventState } from '@/server/queries';
import { db } from '@/server/supabase';

const pitchSchema = z.object({
  pitch: z.string().trim().min(1, 'Write your pitch first.').max(2000, 'Pitch: max 2,000 characters.'),
});

export async function savePitch(_prev: FormState, formData: FormData): Promise<FormState> {
  const { me, teamId } = await requireTeamMember();
  if ((await getEventState()).phase_idx !== 4) return { error: 'Pitch editing is only open during Startup Development.' };
  const parsed = pitchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await db()
    .from('submissions')
    .upsert({
      team_id: teamId,
      pitch: parsed.data.pitch,
      updated_by: `participant:${me.id}`,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
  revalidatePath('/team');
  return { notice: 'Pitch saved.' };
}
