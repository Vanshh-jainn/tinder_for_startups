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
    .select('id, number, display_name, phone, skills, preferences, summary')
    .eq('id', session.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) redirect('/login');
  return data;
}

// Team access goes through the member's own login; the team id always comes from the DB, never the request.
// driverId: the one member whose device may change team data (null until the team picks one).
export async function requireTeamMember() {
  const me = await requireParticipant();
  const { data, error } = await db()
    .from('team_members')
    .select('team_id, teams(driver_id)')
    .eq('participant_id', me.id)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  if (!data) redirect('/me');
  const driverId = (data.teams as unknown as { driver_id: string | null }).driver_id;
  return { me, teamId: data.team_id as string, driverId };
}
