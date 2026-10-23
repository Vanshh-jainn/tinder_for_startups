-- Phase 6: top-7 qualification + finalist reveal; the timer becomes display-only.
-- Marketplace confirmation time now starts when the admin says so (not at minute 10), and gets
-- its own 5-minute display timer. Nothing else depends on the clock.

alter table public.event_state
  add column market_confirmation boolean not null default false,
  add column revealed_count integer not null default 0 check (revealed_count >= 0);

alter table public.event_state drop constraint event_state_projector_screen_check;
alter table public.event_state add constraint event_state_projector_screen_check
  check (projector_screen in ('welcome', 'rules', 'matchmaking', 'teams', 'pitching', 'leaderboard', 'finalists'));

-- The marketplace phase timer now covers decision time only.
update public.phases set duration_seconds = 600 where idx = 6 and duration_seconds = 900;

create or replace function public.marketplace_window() returns text
language sql stable as $$
  select case
    when phase_idx is distinct from 6 then 'closed'
    when market_confirmation then 'confirmation'
    else 'decision'
  end
  from event_state;
$$;

-- Same as Phase 4, plus: advancing clears the marketplace confirmation flag.
create or replace function public.timer_action(p_admin uuid, p_action text, p_minutes integer default null) returns void
language plpgsql as $$
declare
  s event_state;
  v_next integer;
  v_after jsonb;
begin
  select * into s from event_state for update;

  case p_action
  when 'start' then -- also resumes
    if s.phase_idx is null then raise exception 'Advance to the first phase first.'; end if;
    if s.timer_status = 'running' then raise exception 'The timer is already running.'; end if;
    update event_state set timer_status = 'running', started_at = now();

  when 'pause' then
    if s.timer_status <> 'running' then raise exception 'The timer is not running.'; end if;
    update event_state set timer_status = 'paused', started_at = null,
      elapsed_ms = least(duration_ms, elapsed_ms + (extract(epoch from now() - s.started_at) * 1000)::bigint);

  when 'reset' then -- clock only; phase data is untouched (OQ-30)
    update event_state set timer_status = 'idle', started_at = null, elapsed_ms = 0;

  when 'end' then -- time's up now, without advancing
    update event_state set timer_status = 'idle', started_at = null, elapsed_ms = duration_ms;

  when 'extend' then -- current timer only; later phases keep their durations (OQ-22)
    if p_minutes is null or p_minutes not between 1 and 60 then raise exception 'Extend by 1–60 minutes.'; end if;
    update event_state set duration_ms = duration_ms + p_minutes * 60000;

  when 'advance' then -- one way: participants lose access to the previous phase (OQ-32)
    v_next := coalesce(s.phase_idx + 1, 0);
    if v_next > 8 then raise exception 'Final Pitching is the last phase.'; end if;
    if v_next = 2 then perform set_discovery(p_admin, 'open'); end if;
    if s.phase_idx = 2 then perform set_discovery(p_admin, 'closed'); end if;

    -- Final Pitching runs per-team 10-minute timers started with start_pitch().
    update event_state set
      phase_idx = v_next,
      timer_status = case when v_next = 8 then 'idle' else 'running' end,
      started_at = case when v_next = 8 then null else now() end,
      elapsed_ms = 0,
      duration_ms = case when v_next = 8 then 600000
                         else (select duration_seconds * 1000 from phases where idx = v_next) end,
      pitching_team_id = null,
      projector_screen = null,
      market_confirmation = false;

  else
    raise exception 'Unknown timer action.';
  end case;

  update event_state set updated_at = now() returning to_jsonb(event_state.*) into v_after;
  insert into audit_log (actor, action, entity, before, after)
  values ('admin:' || p_admin, 'timer.' || p_action, 'event_state', to_jsonb(s), v_after);
end $$;

create function public.start_confirmation(p_admin uuid) returns void
language plpgsql as $$
declare
  s event_state;
begin
  select * into s from event_state for update;
  if s.phase_idx is distinct from 6 then raise exception 'Confirmation time is part of the marketplace phase.'; end if;
  if s.market_confirmation then raise exception 'Confirmation time has already started.'; end if;

  update event_state set market_confirmation = true, timer_status = 'running', started_at = now(),
    elapsed_ms = 0, duration_ms = 300000, updated_at = now();
  insert into audit_log (actor, action, entity, before, after)
  values ('admin:' || p_admin, 'marketplace.start_confirmation', 'event_state',
          jsonb_build_object('market_confirmation', false), jsonb_build_object('market_confirmation', true));
end $$;

-- Qualification ------------------------------------------------------------------

-- position 1 = top. place = shared place among equal totals. Written only by confirm_finalists.
create table public.finalists (
  team_id uuid primary key references public.teams (id),
  position integer not null unique check (position >= 1),
  place integer not null check (place >= 1),
  total integer not null check (total > 0), -- OQ-19: ₹0 teams never qualify
  created_at timestamptz not null default now()
);
alter table public.finalists enable row level security;
revoke all on public.finalists from anon, authenticated;
create trigger finalists_touch after insert or update or delete on public.finalists
  for each statement execute function public.touch_event_state();

-- p_finalists: [{team, place, total}] in rank order, computed by src/lib/qualification.ts from the
-- counted totals, including the admin's choice for a tie across the cut. Replaces any earlier result.
create function public.confirm_finalists(p_admin uuid, p_finalists jsonb) returns void
language plpgsql as $$
declare
  v_before jsonb;
begin
  if coalesce((select phase_idx from event_state), -1) < 7 then
    raise exception 'Confirm the finalists after the marketplace closes.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_finalists) as x(team uuid, place integer, total integer)
    where not exists (select 1 from teams t where t.id = x.team and t.approval_state = 'approved')
  ) then
    raise exception 'Every finalist must be an approved team.';
  end if;

  select jsonb_agg(jsonb_build_object('team', team_id, 'place', place, 'total', total) order by position)
  into v_before from finalists;

  delete from finalists where true;
  insert into finalists (team_id, position, place, total)
  select x.team, x.n, x.place, x.total
  from rows from (jsonb_to_recordset(p_finalists) as (team uuid, place integer, total integer))
    with ordinality as x(team, place, total, n);

  update event_state set revealed_count = 0, updated_at = now();
  insert into audit_log (actor, action, entity, before, after)
  values ('admin:' || p_admin, 'qualification.confirm', 'finalists', v_before, p_finalists);
end $$;

-- Reveals one more finalist on the projector, from the lowest position up.
create function public.reveal_next_finalist(p_admin uuid) returns void
language plpgsql as $$
declare
  v_count integer := (select count(*) from finalists);
  v_revealed integer;
begin
  select revealed_count into v_revealed from event_state for update;
  if v_count = 0 then raise exception 'Confirm the finalists first.'; end if;
  if v_revealed >= v_count then raise exception 'All finalists are already revealed.'; end if;

  update event_state set revealed_count = v_revealed + 1, updated_at = now();
  insert into audit_log (actor, action, entity, after)
  values ('admin:' || p_admin, 'qualification.reveal', 'finalists', jsonb_build_object('revealed', v_revealed + 1));
end $$;

-- Only finalists pitch.
create or replace function public.start_pitch(p_admin uuid, p_team uuid) returns void
language plpgsql as $$
declare
  s event_state;
begin
  select * into s from event_state for update;
  if s.phase_idx is distinct from 8 then raise exception 'Pitch timers run during Final Pitching only.'; end if;
  if not exists (select 1 from finalists where team_id = p_team) then
    raise exception 'Only finalists pitch. Confirm the finalists first.';
  end if;

  update event_state set pitching_team_id = p_team, timer_status = 'running', started_at = now(),
    elapsed_ms = 0, duration_ms = 600000, updated_at = now();
  insert into audit_log (actor, action, entity, entity_id, before, after)
  values ('admin:' || p_admin, 'timer.start_pitch', 'teams', p_team,
          jsonb_build_object('pitching_team_id', s.pitching_team_id), jsonb_build_object('pitching_team_id', p_team));
end $$;

revoke execute on function
  public.start_confirmation(uuid),
  public.confirm_finalists(uuid, jsonb),
  public.reveal_next_finalist(uuid)
from public, anon, authenticated;
