import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from './supabase';

const COOKIE = 'sid';
const TTL_SECONDS = 12 * 60 * 60; // covers the 3-hour event with room for setup

export type Subject = { type: 'admin' | 'participant'; id: string };

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(subject: Subject) {
  const token = randomBytes(32).toString('base64url');
  const { error } = await db()
    .from('sessions')
    .insert({
      token_hash: hash(token),
      subject_type: subject.type,
      subject_id: subject.id,
      expires_at: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
    });
  if (error) throw error;

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_SECONDS,
  });
}

export async function getSession(): Promise<Subject | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  const { data, error } = await db()
    .from('sessions')
    .select('subject_type, subject_id')
    .eq('token_hash', hash(token))
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data && { type: data.subject_type, id: data.subject_id };
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    await db().from('sessions').update({ revoked_at: new Date().toISOString() }).eq('token_hash', hash(token));
  }
  store.delete(COOKIE);
}

export async function revokeSessions(subject: Subject) {
  const { error } = await db()
    .from('sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('subject_type', subject.type)
    .eq('subject_id', subject.id)
    .is('revoked_at', null);
  if (error) throw error;
}
