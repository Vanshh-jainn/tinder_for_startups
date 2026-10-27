-- Phase 7A (performance): every event_state bump makes every open page (~95 at the event) re-render.
-- Marketplace drafts (delete + insert) no longer bump it; only a lock (confirmed_at) or a void
-- (voided_at) changes what anyone else sees: the leaderboard, admin status, the team's read-only phones.

drop trigger investments_touch on public.investments;
create trigger investments_touch after update of confirmed_at, voided_at on public.investments
  for each statement execute function public.touch_event_state();
