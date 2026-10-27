'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// One client per browser tab, not per mount. No auth session: this only listens to a public signal.
let client: SupabaseClient | undefined;
const realtime = () =>
  (client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));

// Re-renders the page from the server whenever event_state changes: timer, phase, projector,
// teams, locks, settings. Use once per page.
// ~95 devices get each signal at once: a random 0.2–1.2 s delay spreads their requests, and
// signals arriving inside that window merge into one refresh. The device that acted already sees
// its own change from the server action's response.
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      pending ??= setTimeout(() => {
        pending = undefined;
        router.refresh();
      }, 200 + Math.random() * 1000);
    };

    let connectedBefore = false;
    const channel = realtime()
      .channel('event_state')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'event_state' }, refresh)
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (connectedBefore) refresh(); // reconnected: changes may have been missed
        connectedBefore = true;
      });
    return () => {
      clearTimeout(pending);
      void realtime().removeChannel(channel);
    };
  }, [router]);

  return null;
}
