-- Rehearsal fix B (user decision 2026-10-27):
-- 1. Pairs from the matching algorithm become teams at once (no admin approval step).
-- 2. "Random pairing" pairs the participants with complete profiles who are still not in a team.
--    With an odd count, the last one joins a random 2-person team as its 3rd member (OQ-36).

alter table public.teams drop constraint teams_formation_source_check;
alter table public.teams add constraint teams_formation_source_check
  check (formation_source in ('algorithm', 'manual', 'random'));

-- Same checks as before; teams are inserted approved, with number + domain, members active.
create or replace function public.save_matching_run(
  p_admin uuid, p_version text, p_total integer, p_unassigned uuid[], p_teams jsonb
) returns uuid
language plpgsql as $$
declare
  v_run uuid;
  v_team uuid;
  v_number integer;
  v_domain text;
  v_created jsonb := '[]';
  t jsonb;
begin
  perform supersede_proposals(); -- clears proposals left from before this migration

  insert into matching_runs (admin_id, algorithm_version, team_count, total_score, unassigned)
  values (p_admin, p_version, jsonb_array_length(p_teams), p_total, p_unassigned)
  returning id into v_run;

  for t in select value from jsonb_array_elements(p_teams) loop
    if not exists (
      select 1 from swipes s1 join swipes s2
        on s2.viewer_id = s1.viewed_id and s2.viewed_id = s1.viewer_id
      where s1.viewer_id = (t->>'a')::uuid and s1.viewed_id = (t->>'b')::uuid
        and s1.direction = 'right' and s2.direction = 'right'
        and s1.rank = (t->>'rankAB')::int and s2.rank = (t->>'rankBA')::int
        and s1.rank * s2.rank = (t->>'score')::int
    ) then
      raise exception 'Proposed pair is not a mutual right-swipe with matching ranks.';
    end if;

    v_number := nextval('team_number_seq');
    v_domain := random_domain();
    insert into teams (formation_source, approval_state, matching_run_id, rank_ab, rank_ba, pair_score,
                       created_by, decided_by, decided_at, number, domain)
    values ('algorithm', 'approved', v_run, (t->>'rankAB')::int, (t->>'rankBA')::int, (t->>'score')::int,
            p_admin, p_admin, now(), v_number, v_domain)
    returning id into v_team;

    -- Someone already in an active team trips team_members_one_active; the whole run rolls back.
    insert into team_members (team_id, participant_id, status)
    values (v_team, (t->>'a')::uuid, 'active'), (v_team, (t->>'b')::uuid, 'active');
    v_created := v_created || jsonb_build_object('team', v_team, 'number', v_number, 'domain', v_domain);
  end loop;

  insert into audit_log (actor, action, entity, entity_id, after)
  values ('admin:' || p_admin, 'matching.run', 'matching_runs', v_run,
          jsonb_build_object('team_count', jsonb_array_length(p_teams), 'total_score', p_total, 'teams', v_created));
  return v_run;
end $$;

-- Pairs everyone with a complete profile who is not in an active team, in random order.
-- Only after swiping has closed, so nobody is pulled out of matchmaking mid-swipe.
create function public.random_pairing(p_admin uuid) returns integer
language plpgsql as $$
declare
  v_free uuid[];
  v_team uuid;
  v_number integer;
  v_domain text;
  v_created jsonb := '[]';
  v_joined jsonb;
  i integer := 1;
begin
  if (select status from discovery where id for update) <> 'closed' then
    raise exception 'Random pairing only works after Matchmaking has closed.';
  end if;

  select coalesce(array_agg(p.id order by random()), '{}') into v_free
  from participants p
  where p.profile_complete
    and not exists (select 1 from team_members m where m.participant_id = p.id and m.status = 'active');

  if cardinality(v_free) = 0 then
    raise exception 'Everyone with a complete profile is already in a team.';
  end if;

  while i + 1 <= cardinality(v_free) loop
    v_number := nextval('team_number_seq');
    v_domain := random_domain();
    insert into teams (formation_source, approval_state, created_by, decided_by, decided_at, number, domain)
    values ('random', 'approved', p_admin, p_admin, now(), v_number, v_domain)
    returning id into v_team;
    insert into team_members (team_id, participant_id, status)
    values (v_team, v_free[i], 'active'), (v_team, v_free[i + 1], 'active');
    v_created := v_created || jsonb_build_object('team', v_team, 'number', v_number,
                                                 'members', jsonb_build_array(v_free[i], v_free[i + 1]));
    i := i + 2;
  end loop;

  -- Odd one out: 3rd member of a random team that has exactly 2 active members (OQ-36).
  if i = cardinality(v_free) then
    select t.id into v_team
    from teams t
    where t.approval_state = 'approved'
      and (select count(*) from team_members m where m.team_id = t.id and m.status = 'active') = 2
    order by random()
    limit 1;
    if v_team is null then
      raise exception 'Only one participant is left and there is no team for them to join.';
    end if;
    insert into team_members (team_id, participant_id, status) values (v_team, v_free[i], 'active');
    v_joined := jsonb_build_object('team', v_team, 'participant', v_free[i]);
  end if;

  insert into audit_log (actor, action, entity, after)
  values ('admin:' || p_admin, 'team.random_pairing', 'teams',
          jsonb_build_object('teams', v_created, 'third_member', v_joined));
  return cardinality(v_free);
end $$;

revoke execute on function public.random_pairing(uuid) from public, anon, authenticated;
