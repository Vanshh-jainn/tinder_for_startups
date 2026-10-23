import 'server-only';
import { createClient } from '@supabase/supabase-js';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };

// Secret-key client: bypasses RLS. Every caller must check permissions first.
export function db() {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), options);
}

// Publishable-key client, used only to verify admin passwords against Supabase Auth.
export function authClient() {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), options);
}
