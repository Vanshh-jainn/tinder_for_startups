import 'server-only';
import { db } from './supabase';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

// ponytail: per-account key only, no per-IP limit — the whole venue shares one Wi-Fi IP,
// so an IP limit would lock everyone out. Add a high per-IP cap if attacks come from outside.
// Minutes until the key may try again; 0 when it isn't locked out.
export async function lockoutMinutesLeft(key: string): Promise<number> {
  const { data, error } = await db()
    .from('login_attempts')
    .select('attempted_at')
    .eq('key', key)
    .gt('attempted_at', new Date(Date.now() - WINDOW_MS).toISOString())
    .order('attempted_at', { ascending: false })
    .limit(MAX_FAILURES);
  if (error) throw error;
  if (data.length < MAX_FAILURES) return 0;
  const unlockAt = new Date(data[MAX_FAILURES - 1].attempted_at).getTime() + WINDOW_MS;
  return Math.max(1, Math.ceil((unlockAt - Date.now()) / 60_000));
}

export async function recordFailure(key: string) {
  const { error } = await db().from('login_attempts').insert({ key });
  if (error) throw error;
}

export async function clearFailures(key: string) {
  const { error } = await db().from('login_attempts').delete().eq('key', key);
  if (error) throw error;
}
