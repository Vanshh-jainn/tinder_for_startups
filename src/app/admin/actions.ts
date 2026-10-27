'use server';

import { hash } from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { FormState } from '@/components/ActionForm';
import { profileSchema } from '@/lib/profile';
import { formatParticipantId, generateLoginCode } from '@/lib/security';
import { audit } from '@/server/audit';
import { requireAdmin } from '@/server/auth';
import { adminResult, rpc } from '@/server/queries';
import { clearFailures, lockoutMinutesLeft, recordFailure } from '@/server/rateLimit';
import { createSession, revokeSessions } from '@/server/session';
import { authClient, db } from '@/server/supabase';

const BCRYPT_COST = 10;

const loginSchema = z.object({ email: z.email().max(200), password: z.string().min(1).max(200) });

export async function adminLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Enter your email and password.' };

  const key = `admin:${parsed.data.email.toLowerCase()}`;
  const wait = await lockoutMinutesLeft(key);
  if (wait) return { error: `Too many wrong attempts. Try again in ${wait} min.` };

  const { data, error } = await authClient().auth.signInWithPassword(parsed.data);
  const userId = !error ? data.user?.id : undefined;
  const admin = userId && (await db().from('admins').select('user_id').eq('user_id', userId).maybeSingle()).data;
  if (!userId || !admin) {
    await recordFailure(key);
    return { error: 'Wrong email or password.' };
  }

  await clearFailures(key);
  await createSession({ type: 'admin', id: userId });
  redirect('/admin');
}

const createSchema = z.object({ displayName: z.string().trim().min(1).max(80) });

export async function createParticipant(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Name must be 1–80 characters.' };

  const code = generateLoginCode();
  const { data, error } = await db()
    .from('participants')
    .insert({ display_name: parsed.data.displayName, code_hash: await hash(code, BCRYPT_COST) })
    .select('id, number, display_name')
    .single();
  if (error) throw error;

  await audit(`admin:${adminId}`, 'participant.create', 'participants', data.id, null, data);
  revalidatePath('/admin');
  return {
    notice: `${formatParticipantId(data.number)} (${data.display_name}): code ${code}. Shown only once, so note it now.`,
  };
}

const resetSchema = z.object({ id: z.uuid() });

export async function resetParticipantCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid participant.' };
  const { id } = parsed.data;

  const code = generateLoginCode();
  const { data, error } = await db()
    .from('participants')
    .update({ code_hash: await hash(code, BCRYPT_COST) })
    .eq('id', id)
    .select('number')
    .maybeSingle();
  if (error) throw error;
  if (!data) return { error: 'Participant not found.' };

  await revokeSessions({ type: 'participant', id });
  await clearFailures(`participant:${data.number}`);
  await audit(`admin:${adminId}`, 'participant.code_reset', 'participants', id, null, null);
  return { notice: `New code ${code}. Shown only once.` };
}

export async function deleteParticipant(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid participant.' };
  return adminResult(await rpc('delete_participant', { p_admin: adminId, p_participant: parsed.data.id }), 'Deleted.');
}

const editSchema = profileSchema.extend({ id: z.uuid(), displayName: z.string().trim().min(1, 'Name is required.').max(80) });

// Authorised correction (spec §12): any time, audited with before/after in the same transaction.
export async function adminEditProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = editSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;
  return adminResult(
    await rpc('admin_update_profile', {
      p_admin: adminId,
      p_participant: p.id,
      p_name: p.displayName,
      p_phone: p.phone || null,
      p_skills: p.skills,
      p_preferences: p.preferences,
      p_summary: p.summary,
    }),
    'Profile updated.',
  );
}
