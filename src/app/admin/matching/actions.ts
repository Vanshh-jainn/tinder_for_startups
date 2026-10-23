'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { FormState } from '@/components/ActionForm';
import { ALGORITHM_VERSION, runMatching } from '@/lib/matching';
import { requireAdmin } from '@/server/auth';
import { getActiveMemberships, getSwipes, rpc } from '@/server/queries';
import { db } from '@/server/supabase';

async function done(result: { error?: string }, notice: string): Promise<FormState> {
  if (result.error) return result;
  revalidatePath('/admin', 'layout');
  return { notice };
}

// Matches everyone not already in an approved team. Replaces any pending proposals.
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
  return done(
    await rpc('save_matching_run', {
      p_admin: adminId,
      p_version: ALGORITHM_VERSION,
      p_total: result.totalScore,
      p_unassigned: result.unassigned,
      p_teams: result.teams,
    }),
    `${result.teams.length} team(s) proposed, total score ${result.totalScore}, ${result.unassigned.length} unassigned.`,
  );
}

export async function resetMatchingAction(): Promise<FormState> {
  const adminId = await requireAdmin();
  return done(await rpc('reset_matching', { p_admin: adminId }), 'Pending proposals cleared.');
}

const teamSchema = z.object({ teamId: z.uuid() });

export async function approveTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = teamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid team.' };
  return done(await rpc('decide_team', { p_admin: adminId, p_team: parsed.data.teamId, p_approve: true }), 'Approved.');
}

export async function rejectTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = teamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid team.' };
  return done(await rpc('decide_team', { p_admin: adminId, p_team: parsed.data.teamId, p_approve: false }), 'Rejected.');
}

export async function dissolveTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = teamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid team.' };
  return done(await rpc('dissolve_team', { p_admin: adminId, p_team: parsed.data.teamId }), 'Dissolved.');
}

const manualSchema = z.object({ a: z.uuid(), b: z.uuid() });

export async function createManualTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = manualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Pick two participants.' };
  return done(
    await rpc('create_manual_team', { p_admin: adminId, p_a: parsed.data.a, p_b: parsed.data.b }),
    'Manual team created.',
  );
}
