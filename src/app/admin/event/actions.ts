'use server';

import { z } from 'zod';
import type { FormState } from '@/components/ActionForm';
import { SCREENS } from '@/lib/timer';
import { requireAdmin } from '@/server/auth';
import { adminResult, rpc } from '@/server/queries';

const timerSchema = z.object({
  action: z.enum(['start', 'pause', 'reset', 'end', 'extend', 'advance']),
  minutes: z.coerce.number().int().min(1).max(60).optional(),
});

export async function timerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = timerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid timer action.' };
  return adminResult(
    await rpc('timer_action', { p_admin: adminId, p_action: parsed.data.action, p_minutes: parsed.data.minutes ?? null }),
    'Done.',
  );
}

const pitchSchema = z.object({ teamId: z.uuid() });

export async function startPitch(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = pitchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Choose a team.' };
  return adminResult(await rpc('start_pitch', { p_admin: adminId, p_team: parsed.data.teamId }), 'Pitch timer started.');
}

const screenSchema = z.object({ screen: z.union([z.literal('follow'), z.enum(SCREENS)]) });

export async function setProjectorScreen(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = screenSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid screen.' };
  const screen = parsed.data.screen === 'follow' ? null : parsed.data.screen;
  return adminResult(await rpc('set_projector_screen', { p_admin: adminId, p_screen: screen }), 'Projector updated.');
}

const phaseSchema = z.object({
  idx: z.coerce.number().int().min(0).max(8),
  minutes: z.coerce.number().int().min(1).max(240),
  rules: z.string().trim().max(2000),
});

export async function updatePhase(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = phaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Minutes must be 1–240; rules max 2,000 characters.' };
  const { idx, minutes, rules } = parsed.data;
  return adminResult(
    await rpc('update_phase', { p_admin: adminId, p_idx: idx, p_minutes: minutes, p_rules: rules }),
    'Saved.',
  );
}

// Moves the marketplace from decision time to confirmation time (allocations lock) and starts a 5-minute display timer.
export async function startConfirmation(): Promise<FormState> {
  const adminId = await requireAdmin();
  return adminResult(await rpc('start_confirmation', { p_admin: adminId }), 'Confirmation time started.');
}
