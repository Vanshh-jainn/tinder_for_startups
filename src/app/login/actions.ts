'use server';

import { compare } from 'bcryptjs';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { FormState } from '@/components/ActionForm';
import { normaliseCode, parseParticipantId } from '@/lib/security';
import { clearFailures, isLockedOut, recordFailure } from '@/server/rateLimit';
import { createSession } from '@/server/session';
import { db } from '@/server/supabase';

const schema = z.object({ participantId: z.string().max(10), code: z.string().max(32) });

export async function participantLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  const number = parsed.success ? parseParticipantId(parsed.data.participantId) : null;
  if (!parsed.success || number === null) return { error: 'Enter your participant ID (like P12) and code.' };

  const key = `participant:${number}`;
  if (await isLockedOut(key)) return { error: 'Too many wrong attempts. Wait 15 minutes or ask an organiser.' };

  const { data, error } = await db().from('participants').select('id, code_hash').eq('number', number).maybeSingle();
  if (error) throw error;
  if (!data || !(await compare(normaliseCode(parsed.data.code), data.code_hash))) {
    await recordFailure(key);
    return { error: 'Wrong participant ID or code.' };
  }

  await clearFailures(key);
  await createSession({ type: 'participant', id: data.id });
  redirect('/me');
}
