'use server';

import { z } from 'zod';
import type { FormState } from '@/components/ActionForm';
import { ALGORITHM_VERSION, runMatching } from '@/lib/matching';
import { requireAdmin } from '@/server/auth';
import { adminResult, getActiveMemberships, getSwipes, rpc } from '@/server/queries';
import { db } from '@/server/supabase';

// Matches everyone not already in a team. Each matched pair becomes a team at once.
export async function runMatchingAction(): Promise<FormState> {
  const adminId = await requireAdmin();
  const [{ data: participants, error }, swipes, active] = await Promise.all([
    db().from('participants').select('id'),
    getSwipes(),
    getActiveMemberships(),
  ]);
  if (error) throw error;

  const eligible = participants.map((p) => p.id).filter((id) => !active.has(id));
  const result = runMatching(eligible, swipes);
  return adminResult(
    await rpc('save_matching_run', {
      p_admin: adminId,
      p_version: ALGORITHM_VERSION,
      p_total: result.totalScore,
      p_unassigned: result.unassigned,
      p_teams: result.teams,
    }),
    `${result.teams.length} team(s) formed, total score ${result.totalScore}, ${result.unassigned.length} not matched.`,
  );
}

// Pairs every free participant with a complete profile at random; an odd one out joins a team of 2.
export async function randomPairingAction(): Promise<FormState> {
  const adminId = await requireAdmin();
  return adminResult(await rpc('random_pairing', { p_admin: adminId }), 'Random teams formed.');
}

const teamSchema = z.object({ teamId: z.uuid() });

export async function dissolveTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = teamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid team.' };
  return adminResult(await rpc('dissolve_team', { p_admin: adminId, p_team: parsed.data.teamId }), 'Dissolved.');
}

const manualSchema = z.object({ a: z.uuid(), b: z.uuid() });

export async function createManualTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = manualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Pick two participants.' };
  return adminResult(
    await rpc('create_manual_team', { p_admin: adminId, p_a: parsed.data.a, p_b: parsed.data.b }),
    'Manual team created.',
  );
}
