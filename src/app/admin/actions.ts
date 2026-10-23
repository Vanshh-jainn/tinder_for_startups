'use server';

import { hash } from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { FormState } from '@/components/ActionForm';
import { formatParticipantId, generateLoginCode } from '@/lib/security';
import { audit } from '@/server/audit';
import { requireAdmin } from '@/server/auth';
import { rpc } from '@/server/queries';
import { clearFailures, isLockedOut, recordFailure } from '@/server/rateLimit';
import { createSession, revokeSessions } from '@/server/session';
import { authClient, db } from '@/server/supabase';

const BCRYPT_COST = 10;

const loginSchema = z.object({ email: z.email().max(200), password: z.string().min(1).max(200) });

export async function adminLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Enter your email and password.' };

  const key = `admin:${parsed.data.email.toLowerCase()}`;
  if (await isLockedOut(key)) return { error: 'Too many wrong attempts. Wait 15 minutes.' };

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

const discoverySchema = z.object({ status: z.enum(['open', 'closed']) });

export async function setDiscovery(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const parsed = discoverySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Invalid status.' };

  const result = await rpc('set_discovery', { p_admin: adminId, p_status: parsed.data.status });
  if (result.error) return result;
  revalidatePath('/admin', 'layout');
  return { notice: `Matchmaking ${parsed.data.status}.` };
}
