-- Phase 4: authoritative event timer, phase settings + rules, projector screen, live-update signal.
-- event_state is the only table browsers may read (anon SELECT, public-safe columns only). Clients
-- subscribe to it via Supabase Realtime and re-render from the server whenever it changes.

create table public.phases (
  idx integer primary key check (idx between 0 and 8),
  name text not null,
  duration_seconds integer not null check (duration_seconds between 60 and 4 * 3600),
  rules text not null default '' check (char_length(rules) <= 2000)
);
insert into public.phases (idx, name, duration_seconds) values
  (0, 'Introduction', 600),
  (1, 'Skill Filling', 300),
  (2, 'Matchmaking', 600),
  (3, 'Rest', 600),
  (4, 'Field Assignment & Startup Development', 3000),
  (5, 'Break', 300),
  (6, 'Investment Marketplace', 900),
  (7, 'Break & Top 7 Announcement', 300),
  (8, 'Final Pitching', 4200);

-- remaining = duration_ms - elapsed_ms - (running ? now - started_at : 0). Clients compute it.
create table public.event_state (
  id boolean primary key default true check (id),
  phase_idx integer references public.phases (idx), -- null = event not started
  timer_status text not null default 'idle' check (timer_status in ('idle', 'running', 'paused')),
  duration_ms bigint not null default 0 check (duration_ms >= 0),
  elapsed_ms bigint not null default 0 check (elapsed_ms >= 0),
  started_at timestamptz,
  pitching_team_id uuid references public.teams (id), -- Final Pitching: team on stage
  projector_screen text check (projector_screen in ('welcome', 'rules', 'matchmaking', 'teams', 'pitching')),
  updated_at timestamptz not null default now(),
  check ((timer_status = 'running') = (started_at is not null))
);
insert into public.event_state default values;

alter table public.phases enable row level security;
alter table public.event_state enable row level security;
revoke all on public.phases, public.event_state from anon, authenticated;

grant select on public.event_state to anon, authenticated;
create policy event_state_public_read on public.event_state for select to anon, authenticated using (true);
alter publication supabase_realtime add table public.event_state;

-- Changes that clients should see bump event_state.updated_at, which Realtime broadcasts.
create function public.touch_event_state() returns trigger
language plpgsql as $$
begin
  update event_state set updated_at = now();
  return null;
end $$;
create trigger teams_touch after insert or update or delete on public.teams
  for each statement execute function public.touch_event_state();
create trigger config_touch after update on public.config
  for each statement execute function public.touch_event_state();
create trigger phases_touch after update on public.phases
  for each statement execute function public.touch_event_state();

-- Admin actions ------------------------------------------------------------

create function public.timer_action(p_admin uuid, p_action text, p_minutes integer default null) returns void
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
      projector_screen = null;

  else
    raise exception 'Unknown timer action.';
  end case;

  update event_state set updated_at = now() returning to_jsonb(event_state.*) into v_after;
  insert into audit_log (actor, action, entity, before, after)
  values ('admin:' || p_admin, 'timer.' || p_action, 'event_state', to_jsonb(s), v_after);
end $$;

create function public.start_pitch(p_admin uuid, p_team uuid) returns void
language plpgsql as $$
declare
  s event_state;
begin
  select * into s from event_state for update;
  if s.phase_idx is distinct from 8 then raise exception 'Pitch timers run during Final Pitching only.'; end if;
  if not exists (select 1 from teams where id = p_team and approval_state = 'approved') then
    raise exception 'Team is not approved.';
  end if;

  update event_state set pitching_team_id = p_team, timer_status = 'running', started_at = now(),
    elapsed_ms = 0, duration_ms = 600000, updated_at = now();
  insert into audit_log (actor, action, entity, entity_id, before, after)
  values ('admin:' || p_admin, 'timer.start_pitch', 'teams', p_team,
          jsonb_build_object('pitching_team_id', s.pitching_team_id), jsonb_build_object('pitching_team_id', p_team));
end $$;

-- p_screen null = follow the phase's default screen.
create function public.set_projector_screen(p_admin uuid, p_screen text) returns void
language plpgsql as $$
declare
  v_before text;
begin
  select projector_screen into v_before from event_state for update;
  update event_state set projector_screen = p_screen, updated_at = now();
  insert into audit_log (actor, action, entity, before, after)
  values ('admin:' || p_admin, 'projector.set_screen', 'event_state',
          jsonb_build_object('projector_screen', v_before), jsonb_build_object('projector_screen', p_screen));
end $$;

create function public.update_phase(p_admin uuid, p_idx integer, p_minutes integer, p_rules text) returns void
language plpgsql as $$
declare
  p phases;
begin
  select * into p from phases where idx = p_idx for update;
  if not found then raise exception 'Unknown phase.'; end if;
  update phases set duration_seconds = p_minutes * 60, rules = p_rules where idx = p_idx;
  insert into audit_log (actor, action, entity, entity_id, before, after)
  values ('admin:' || p_admin, 'phase.update', 'phases', p_idx::text,
          jsonb_build_object('minutes', p.duration_seconds / 60, 'rules', p.rules),
          jsonb_build_object('minutes', p_minutes, 'rules', p_rules));
end $$;

revoke execute on function
  public.touch_event_state(),
  public.timer_action(uuid, text, integer),
  public.start_pitch(uuid, uuid),
  public.set_projector_screen(uuid, text),
  public.update_phase(uuid, integer, integer, text)
from public, anon, authenticated;
