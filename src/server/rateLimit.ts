import 'server-only';
import { db } from './supabase';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

// ponytail: per-account key only, no per-IP limit — the whole venue shares one Wi-Fi IP,
// so an IP limit would lock everyone out. Add a high per-IP cap if attacks come from outside.
export async function isLockedOut(key: string): Promise<boolean> {
  const { count, error } = await db()
    .from('login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('key', key)
    .gt('attempted_at', new Date(Date.now() - WINDOW_MS).toISOString());
  if (error) throw error;
  return (count ?? 0) >= MAX_FAILURES;
}

export async function recordFailure(key: string) {
  const { error } = await db().from('login_attempts').insert({ key });
  if (error) throw error;
}

export async function clearFailures(key: string) {
  const { error } = await db().from('login_attempts').delete().eq('key', key);
  if (error) throw error;
}
