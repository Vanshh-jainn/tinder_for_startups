import 'server-only';
import { revalidatePath } from 'next/cache';
import { connection } from 'next/server';
import type { FormState } from '@/components/ActionForm';
import { rankTotals } from '@/lib/marketplace';
import type { Swipe } from '@/lib/matching';
import type { Screen, TimerState } from '@/lib/timer';
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

export type EventState = TimerState & {
  phase_idx: number | null;
  phase_name: string | null;
  rules: string;
  pitching_team_id: string | null;
  projector_screen: Screen | null;
  market_confirmation: boolean;
  revealed_count: number;
  serverNow: number; // lets clients correct for their own clock being off
};

export async function getEventState(): Promise<EventState> {
  await connection(); // live state: never prerender a page that reads it
  const { data, error } = await db()
    .from('event_state')
    .select('phase_idx, timer_status, duration_ms, elapsed_ms, started_at, pitching_team_id, projector_screen, market_confirmation, revealed_count, phases(name, rules)')
    .single();
  if (error) throw error;
  const { phases, ...state } = data;
  const phase = phases as unknown as { name: string; rules: string } | null;
  return { ...state, phase_name: phase?.name ?? null, rules: phase?.rules ?? '', serverNow: Date.now() };
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

export type Leaderboard = {
  rows: { teamId: string; number: number; total: number; rank: number }[];
  complete: number; // teams whose investments count
  teams: number; // approved teams (possible investors)
};

// Counted totals only: draft and partial submissions never appear (spec §9).
export async function getLeaderboard(): Promise<Leaderboard> {
  const [targetsRes, countedRes, teamsRes] = await Promise.all([
    db().from('teams').select('id, number, submissions!inner(team_id)').eq('approval_state', 'approved'),
    db().from('counted_investments').select('investor_team_id, target_team_id, amount'),
    db().from('teams').select('id', { count: 'exact', head: true }).eq('approval_state', 'approved'),
  ]);
  for (const res of [targetsRes, countedRes, teamsRes]) if (res.error) throw res.error;

  const totals = new Map<string, number>();
  for (const row of countedRes.data!) totals.set(row.target_team_id, (totals.get(row.target_team_id) ?? 0) + row.amount);
  return {
    rows: rankTotals(targetsRes.data!.map((t) => ({ teamId: t.id, number: t.number, total: totals.get(t.id) ?? 0 }))),
    complete: new Set(countedRes.data!.map((r) => r.investor_team_id)).size,
    teams: teamsRes.count ?? 0,
  };
}
