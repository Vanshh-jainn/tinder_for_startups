'use server';

import { compare } from 'bcryptjs';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { FormState } from '@/components/ActionForm';
import { formatParticipantId, normaliseCode, parseParticipantId } from '@/lib/security';
import { clearFailures, lockoutMinutesLeft, recordFailure } from '@/server/rateLimit';
import { createSession } from '@/server/session';
import { db } from '@/server/supabase';

const schema = z.object({ participantId: z.string().max(10), code: z.string().max(32) });

// Each failure gets its own message so a participant (or an organiser looking at their phone) can see
// what went wrong. IDs are sequential (P1, P2, …), so "ID not found" reveals nothing new.
export async function participantLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  const number = parsed.success ? parseParticipantId(parsed.data.participantId) : null;
  if (!parsed.success || number === null) return { error: 'Enter your participant ID (like P12) and code.' };
  const id = formatParticipantId(number);

  try {
    const key = `participant:${number}`;
    const wait = await lockoutMinutesLeft(key);
    if (wait) return { error: `Too many wrong codes for ${id}. Try again in ${wait} min, or ask an organiser to reset your code.` };

    const { data, error } = await db().from('participants').select('id, code_hash').eq('number', number).maybeSingle();
    if (error) throw error;
    if (!data) return { error: `There is no participant ${id}. Check the ID on your slip.` };
    if (!(await compare(normaliseCode(parsed.data.code), data.code_hash))) {
      await recordFailure(key);
      return { error: `Wrong code for ${id}. Check it and try again.` };
    }

    await clearFailures(key);
    await createSession({ type: 'participant', id: data.id });
  } catch (err) {
    console.error('participant login failed', err instanceof Error ? err.message : err);
    return { error: 'Could not reach the server. Check your connection and try again.' };
  }
  redirect('/me');
}
