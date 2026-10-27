'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { FormState } from '@/components/ActionForm';
import { requireTeamMember } from '@/server/auth';
import { getEventState, rpc } from '@/server/queries';
import { db } from '@/server/supabase';

const READ_ONLY = { error: "Read-only: only your team's driver device can make changes." };

const pitchSchema = z.object({
  pitch: z.string().trim().min(1, 'Write your pitch first.').max(2000, 'Pitch: max 2,000 characters.'),
});

export async function savePitch(_prev: FormState, formData: FormData): Promise<FormState> {
  const { me, teamId, driverId } = await requireTeamMember();
  if (driverId !== me.id) return READ_ONLY;
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

const allocationSchema = z
  .array(z.object({ target: z.uuid(), amount: z.number().int() }))
  .min(1)
  .max(7);

function parseItems(formData: FormData) {
  try {
    return allocationSchema.safeParse(JSON.parse(String(formData.get('items') ?? '')));
  } catch {
    return allocationSchema.safeParse(null);
  }
}

// Rules are enforced in SQL (save_allocation / lock_allocation); team id always comes from the session.
async function allocate(formData: FormData, fn: 'save_allocation' | 'lock_allocation', notice: string): Promise<FormState> {
  const { me, teamId, driverId } = await requireTeamMember();
  if (driverId !== me.id) return READ_ONLY;
  const parsed = parseItems(formData);
  if (!parsed.success) return { error: 'Pick your startups and enter whole-rupee amounts.' };

  const result = await rpc(fn, { p_actor: `participant:${me.id}`, p_team: teamId, p_items: parsed.data });
  if (result.error) return result;
  revalidatePath('/team');
  return { notice };
}

export async function saveAllocation(_prev: FormState, formData: FormData): Promise<FormState> {
  return allocate(formData, 'save_allocation', 'Draft saved. Lock it when your team is sure; only locked money counts.');
}

export async function lockAllocation(_prev: FormState, formData: FormData): Promise<FormState> {
  return allocate(formData, 'lock_allocation', 'Locked! Your investments now count on the leaderboard.');
}

const driverSchema = z.object({ driver: z.uuid() });

// First pick: any member. Later: only the current driver can hand over (enforced in set_driver).
export async function chooseDriver(_prev: FormState, formData: FormData): Promise<FormState> {
  const { me, teamId } = await requireTeamMember();
  const parsed = driverSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Choose a team member.' };
  const result = await rpc('set_driver', { p_actor: `participant:${me.id}`, p_team: teamId, p_driver: parsed.data.driver });
  if (result.error) return result;
  revalidatePath('/team');
  return { notice: 'Driver set.' };
}
