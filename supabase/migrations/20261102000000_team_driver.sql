-- Rehearsal fix C (user decision 2026-10-27): only one device per team acts, the "driver".
-- The other members' team page is read-only. Updating teams already refreshes every page live.

alter table public.teams add column driver_id uuid references public.participants (id);

-- p_actor: 'participant:<id>' (from the server session) or 'admin:<id>'.
-- First pick (no driver yet): any active member may choose any active member; the row lock makes the
-- first choice win. After that only the current driver (handing over) or an admin may change it.
-- An admin may also clear it (p_driver null), which shows the choice pop-up again.
create function public.set_driver(p_actor text, p_team uuid, p_driver uuid) returns void
language plpgsql as $$
declare
  v_before uuid;
  v_actor uuid := split_part(p_actor, ':', 2)::uuid;
  v_is_admin boolean := p_actor like 'admin:%';
begin
  select driver_id into v_before from teams where id = p_team and approval_state = 'approved' for update;
  if not found then raise exception 'Team not found.'; end if;

  if not v_is_admin then
    if not exists (select 1 from team_members where team_id = p_team and participant_id = v_actor and status = 'active') then
      raise exception 'You are not in this team.';
    end if;
    if v_before is not null and v_before <> v_actor then
      raise exception 'Only the current driver or an organiser can change the driver.';
    end if;
  end if;

  if p_driver is null then
    if not v_is_admin then raise exception 'Choose a team member.'; end if;
  elsif not exists (select 1 from team_members where team_id = p_team and participant_id = p_driver and status = 'active') then
    raise exception 'The driver must be a member of this team.';
  end if;

  update teams set driver_id = p_driver where id = p_team;
  insert into audit_log (actor, action, entity, entity_id, before, after)
  values (p_actor, 'team.set_driver', 'teams', p_team,
          jsonb_build_object('driver_id', v_before), jsonb_build_object('driver_id', p_driver));
end $$;

revoke execute on function public.set_driver(text, uuid, uuid) from public, anon, authenticated;
