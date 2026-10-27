-- Phase 7B (user decision 2026-10-27, spec §12 "authorised corrections"): an admin may correct any
-- participant's name and profile at any time (participants themselves stay locked once Matchmaking opens).
-- Decks are not rebuilt: completing a profile after Matchmaking opened only makes the person eligible
-- for random pairing. Column checks (lengths, phone format) still apply.

create function public.admin_update_profile(
  p_admin uuid, p_participant uuid, p_name text, p_phone text, p_skills text, p_preferences text, p_summary text
) returns void
language plpgsql as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  select jsonb_build_object('display_name', display_name, 'phone', phone, 'skills', skills,
                            'preferences', preferences, 'summary', summary)
  into v_before from participants where id = p_participant for update;
  if v_before is null then raise exception 'Participant not found.'; end if;

  update participants
  set display_name = p_name, phone = p_phone, skills = p_skills, preferences = p_preferences, summary = p_summary
  where id = p_participant
  returning jsonb_build_object('display_name', display_name, 'phone', phone, 'skills', skills,
                               'preferences', preferences, 'summary', summary)
  into v_after;

  insert into audit_log (actor, action, entity, entity_id, before, after)
  values ('admin:' || p_admin, 'participant.edit_profile', 'participants', p_participant, v_before, v_after);
end $$;

revoke execute on function public.admin_update_profile(uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;
