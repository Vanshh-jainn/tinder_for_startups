import 'server-only';
import { revalidatePath } from 'next/cache';
import type { FormState } from '@/components/ActionForm';
import type { Swipe } from '@/lib/matching';
import { db } from './supabase';

const PAGE = 1000; // Supabase's default API row cap

// Pages through a query so results are never silently cut at the API row cap.
// The query must have a stable order.
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

// Runs an admin DB function. Rule violations come back as a message; anything else is a bug and throws.
export async function rpc(fn: string, args: Record<string, unknown>): Promise<{ error?: string }> {
  const { error } = await db().rpc(fn, args);
  if (!error) return {};
  if (error.code === 'P0001') return { error: error.message };
  if (error.code === '23505') return { error: 'Someone in this team is already in another active team.' };
  throw error;
}

// Turns an rpc() result into form feedback and refreshes every admin page on success.
export function adminResult(result: { error?: string }, notice: string): FormState {
  if (result.error) return result;
  revalidatePath('/admin', 'layout');
  return { notice };
}

export async function getDiscoveryStatus(): Promise<'not_started' | 'open' | 'closed'> {
  const { data, error } = await db().from('discovery').select('status').single();
  if (error) throw error;
  return data.status;
}

export async function getSwipes(): Promise<Swipe[]> {
  const rows = await fetchAll<{ viewer_id: string; viewed_id: string; rank: number; direction: Swipe['direction'] }>(
    (from, to) =>
      db().from('swipes').select('viewer_id, viewed_id, rank, direction').order('viewer_id').order('rank').range(from, to),
  );
  return rows.map((r) => ({ viewerId: r.viewer_id, viewedId: r.viewed_id, rank: r.rank, direction: r.direction }));
}

// participant id -> team id, for members of approved teams.
export async function getActiveMemberships(): Promise<Map<string, string>> {
  const { data, error } = await db().from('team_members').select('participant_id, team_id').eq('status', 'active');
  if (error) throw error;
  return new Map(data.map((m) => [m.participant_id, m.team_id]));
}
