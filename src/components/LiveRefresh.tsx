'use client';

import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Re-renders the page from the server whenever event_state changes: timer, phase, projector,
// team approvals, settings. Use once per page.
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    let connectedBefore = false;
    const channel = supabase
      .channel('event_state')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'event_state' }, () => router.refresh())
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (connectedBefore) router.refresh(); // reconnected: changes may have been missed
        connectedBefore = true;
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
