'use server';

import { z } from 'zod';
import type { FormState } from '@/components/ActionForm';
import { requireAdmin } from '@/server/auth';
import { adminResult, rpc } from '@/server/queries';

const urlSchema = z.object({
  url: z.union([z.literal(''), z.url().refine((u) => u.startsWith('https://'), 'Use an https:// link.')]),
});

export async function setFormUrl(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = urlSchema.safeParse({ url: String(formData.get('url') ?? '').trim() });
  if (!parsed.success) return { error: 'Enter a full https:// link, or leave empty to remove it.' };
  return adminResult(
    await rpc('set_form_url', { p_admin: adminId, p_url: parsed.data.url || null }),
    parsed.data.url ? 'Google Form link saved.' : 'Google Form link removed.',
  );
}

const pitchSchema = z.object({ teamId: z.uuid(), pitch: z.string().trim().min(1).max(2000) });

export async function adminSetPitch(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = pitchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Pitch must be 1–2,000 characters.' };
  return adminResult(
    await rpc('admin_set_pitch', { p_admin: adminId, p_team: parsed.data.teamId, p_pitch: parsed.data.pitch }),
    'Pitch updated.',
  );
}

const driverSchema = z.object({ teamId: z.uuid(), driver: z.union([z.literal(''), z.uuid()]) });

// Empty driver clears it, so the team gets the choice pop-up again.
export async function adminSetDriver(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = driverSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid driver.' };
  return adminResult(
    await rpc('set_driver', { p_actor: `admin:${adminId}`, p_team: parsed.data.teamId, p_driver: parsed.data.driver || null }),
    parsed.data.driver ? 'Driver changed.' : 'Driver cleared.',
  );
}
