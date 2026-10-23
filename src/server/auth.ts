import 'server-only';
import { redirect } from 'next/navigation';
import { getSession } from './session';
import { db } from './supabase';

// Call first in every admin page and admin server action.
// Re-checks the admins table so removing an admin takes effect immediately.
export async function requireAdmin(): Promise<string> {
  const session = await getSession();
  if (session?.type !== 'admin') redirect('/admin/login');

  const { data, error } = await db().from('admins').select('user_id').eq('user_id', session.id).maybeSingle();
  if (error) throw error;
  if (!data) redirect('/admin/login');
  return session.id;
}

export async function requireParticipant() {
  const session = await getSession();
  if (session?.type !== 'participant') redirect('/login');

  const { data, error } = await db()
    .from('participants')
    .select('id, number, display_name')
    .eq('id', session.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) redirect('/login');
  return data;
}
