-- Repeated dry runs before the real event (user decision 2026-10-26):
-- delete one participant before Matchmaking opens, and reset a whole run.

-- Only before Matchmaking opens: after that the participant is in other people's decks.
create function public.delete_participant(p_admin uuid, p_participant uuid) returns void
language plpgsql as $$
declare
  p participants;
begin
  if (select status from discovery for update) <> 'not_started' then
    raise exception 'Participants can only be deleted before Matchmaking opens. Use Reset event to start over.';
  end if;
  select * into p from participants where id = p_participant for update;
  if not found then raise exception 'Participant not found.'; end if;
  if exists (select 1 from team_members where participant_id = p_participant) then
    raise exception 'This participant is in a team. Dissolving keeps the team record, so use Reset event instead.';
  end if;

  delete from sessions where subject_type = 'participant' and subject_id = p_participant;
  delete from login_attempts where key = 'participant:' || p.number;
  delete from participants where id = p_participant;
  insert into audit_log (actor, action, entity, entity_id, before)
  values ('admin:' || p_admin, 'participant.delete', 'participants', p_participant,
          jsonb_build_object('number', p.number, 'display_name', p.display_name));
end $$;

-- Wipes everything a run creates and returns to before Introduction. Numbering restarts at P1 and
-- Team 1. Kept: admins and their sessions, phase durations and rules, the Google Form link, and the
-- audit log (append-only), which gets one row with what was wiped.
create function public.reset_event(p_admin uuid) returns void
language plpgsql as $$
declare
  v_before jsonb;
begin
  perform 1 from event_state for update;
  v_before := jsonb_build_object(
    'participants', (select count(*) from participants),
    'teams', (select count(*) from teams),
    'investments', (select count(*) from investments),
    'phase_idx', (select phase_idx from event_state));

  update event_state set phase_idx = null, timer_status = 'idle', duration_ms = 0, elapsed_ms = 0,
    started_at = null, pitching_team_id = null, projector_screen = null, market_confirmation = false,
    revealed_count = 0, updated_at = now()
  where id;
  update discovery set status = 'not_started', updated_at = now() where id;

  delete from finalists where true;
  delete from investments where true;
  delete from submissions where true;
  delete from team_members where true;
  delete from teams where true;
  delete from matching_runs where true;
  delete from swipes where true;
  delete from sessions where subject_type = 'participant';
  delete from login_attempts where key like 'participant:%';
  delete from participants where true;
  perform setval(pg_get_serial_sequence('public.participants', 'number'), 1, false);
  perform setval('public.team_number_seq', 1, false);

  insert into audit_log (actor, action, entity, before)
  values ('admin:' || p_admin, 'event.reset', 'event_state', v_before);
end $$;

revoke execute on function
  public.delete_participant(uuid, uuid),
  public.reset_event(uuid)
from public, anon, authenticated;
