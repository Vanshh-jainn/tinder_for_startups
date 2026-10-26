-- Supabase rejects UPDATE/DELETE without a WHERE ("UPDATE requires a WHERE clause", safeupdate),
-- even inside functions. The single-row tables (event_state, discovery, config) get `where id`.
-- Bodies are unchanged otherwise; create or replace keeps the existing grants.

create or replace function public.set_discovery(p_admin uuid, p_status text) returns void
language plpgsql as $$
declare
  v_before text;
begin
  if p_status not in ('open', 'closed') then
    raise exception 'Discovery can only be opened or closed.';
  end if;
  select status into v_before from discovery for update;

  -- First open: build a random deck for every complete profile, of every other complete profile.
  if p_status = 'open' and not exists (select 1 from swipes) then
    insert into swipes (viewer_id, viewed_id, rank)
    select v.id, w.id, row_number() over (partition by v.id order by random())
    from participants v
    join participants w on w.id <> v.id
    where v.profile_complete and w.profile_complete;
  end if;

  update discovery set status = p_status, updated_at = now() where id;
  insert into audit_log (actor, action, entity, before, after)
  values ('admin:' || p_admin, 'discovery.set', 'discovery',
          jsonb_build_object('status', v_before), jsonb_build_object('status', p_status));
end $$;

create or replace function public.set_form_url(p_admin uuid, p_url text) returns void
language plpgsql as $$
declare
  v_before text;
begin
  select google_form_url into v_before from config for update;
  update config set google_form_url = p_url, updated_at = now() where id;
  insert into audit_log (actor, action, entity, before, after)
  values ('admin:' || p_admin, 'config.google_form_url', 'config',
          jsonb_build_object('google_form_url', v_before), jsonb_build_object('google_form_url', p_url));
end $$;

create or replace function public.touch_event_state() returns trigger
language plpgsql as $$
begin
  update event_state set updated_at = now() where id;
  return null;
end $$;

create or replace function public.set_projector_screen(p_admin uuid, p_screen text) returns void
language plpgsql as $$
declare
  v_before text;
begin
  select projector_screen into v_before from event_state for update;
  update event_state set projector_screen = p_screen, updated_at = now() where id;
  insert into audit_log (actor, action, entity, before, after)
  values ('admin:' || p_admin, 'projector.set_screen', 'event_state',
          jsonb_build_object('projector_screen', v_before), jsonb_build_object('projector_screen', p_screen));
end $$;

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
    update event_state set timer_status = 'running', started_at = now() where id;

  when 'pause' then
    if s.timer_status <> 'running' then raise exception 'The timer is not running.'; end if;
    update event_state set timer_status = 'paused', started_at = null,
      elapsed_ms = least(duration_ms, elapsed_ms + (extract(epoch from now() - s.started_at) * 1000)::bigint)
    where id;

  when 'reset' then -- clock only; phase data is untouched (OQ-30)
    update event_state set timer_status = 'idle', started_at = null, elapsed_ms = 0 where id;

  when 'end' then -- time's up now, without advancing
    update event_state set timer_status = 'idle', started_at = null, elapsed_ms = duration_ms where id;

  when 'extend' then -- current timer only; later phases keep their durations (OQ-22)
    if p_minutes is null or p_minutes not between 1 and 60 then raise exception 'Extend by 1–60 minutes.'; end if;
    update event_state set duration_ms = duration_ms + p_minutes * 60000 where id;

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
      market_confirmation = false
    where id;

  else
    raise exception 'Unknown timer action.';
  end case;

  update event_state set updated_at = now() where id returning to_jsonb(event_state.*) into v_after;
  insert into audit_log (actor, action, entity, before, after)
  values ('admin:' || p_admin, 'timer.' || p_action, 'event_state', to_jsonb(s), v_after);
end $$;

create or replace function public.start_confirmation(p_admin uuid) returns void
language plpgsql as $$
declare
  s event_state;
begin
  select * into s from event_state for update;
  if s.phase_idx is distinct from 6 then raise exception 'Confirmation time is part of the marketplace phase.'; end if;
  if s.market_confirmation then raise exception 'Confirmation time has already started.'; end if;

  update event_state set market_confirmation = true, timer_status = 'running', started_at = now(),
    elapsed_ms = 0, duration_ms = 300000, updated_at = now()
  where id;
  insert into audit_log (actor, action, entity, before, after)
  values ('admin:' || p_admin, 'marketplace.start_confirmation', 'event_state',
          jsonb_build_object('market_confirmation', false), jsonb_build_object('market_confirmation', true));
end $$;

create or replace function public.confirm_finalists(p_admin uuid, p_finalists jsonb) returns void
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

  update event_state set revealed_count = 0, updated_at = now() where id;
  insert into audit_log (actor, action, entity, before, after)
  values ('admin:' || p_admin, 'qualification.confirm', 'finalists', v_before, p_finalists);
end $$;

create or replace function public.reveal_next_finalist(p_admin uuid) returns void
language plpgsql as $$
declare
  v_count integer := (select count(*) from finalists);
  v_revealed integer;
begin
  select revealed_count into v_revealed from event_state for update;
  if v_count = 0 then raise exception 'Confirm the finalists first.'; end if;
  if v_revealed >= v_count then raise exception 'All finalists are already revealed.'; end if;

  update event_state set revealed_count = v_revealed + 1, updated_at = now() where id;
  insert into audit_log (actor, action, entity, after)
  values ('admin:' || p_admin, 'qualification.reveal', 'finalists', jsonb_build_object('revealed', v_revealed + 1));
end $$;

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
    elapsed_ms = 0, duration_ms = 600000, updated_at = now()
  where id;
  insert into audit_log (actor, action, entity, entity_id, before, after)
  values ('admin:' || p_admin, 'timer.start_pitch', 'teams', p_team,
          jsonb_build_object('pitching_team_id', s.pitching_team_id), jsonb_build_object('pitching_team_id', p_team));
end $$;
