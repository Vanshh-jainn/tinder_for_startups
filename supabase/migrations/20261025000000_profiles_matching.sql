-- Phase 2: profiles, discovery decks + swipes, matching runs, teams.
-- Multi-step changes live in SQL functions so they are atomic and audited in the same transaction.

-- Profiles: free text (OQ-5), phone entered by the participant and visible to admins only (OQ-3).
alter table public.participants
  add column phone text check (phone ~ '^\+?[0-9]{10,15}$'),
  add column skills text not null default '' check (char_length(skills) <= 200),
  add column preferences text not null default '' check (char_length(preferences) <= 200),
  add column summary text not null default '' check (char_length(summary) <= 160),
  add column profile_complete boolean generated always as (
    phone is not null and skills <> '' and preferences <> '' and summary <> ''
  ) stored;

-- Single row. Profiles lock once discovery leaves 'not_started' (OQ-6).
create table public.discovery (
  id boolean primary key default true check (id),
  status text not null default 'not_started' check (status in ('not_started', 'open', 'closed')),
  updated_at timestamptz not null default now()
);
insert into public.discovery default values;

-- One row per card in a participant's deck. rank = position in a random order (OQ-33).
-- direction is null until swiped; swipes are final (OQ-6).
create table public.swipes (
  viewer_id uuid not null references public.participants (id) on delete cascade,
  viewed_id uuid not null references public.participants (id) on delete cascade,
  rank integer not null check (rank >= 1),
  direction text check (direction in ('right', 'left')),
  swiped_at timestamptz,
  primary key (viewer_id, viewed_id),
  unique (viewer_id, rank),
  check (viewer_id <> viewed_id),
  check ((direction is null) = (swiped_at is null))
);

create table public.matching_runs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  algorithm_version text not null,
  team_count integer not null,
  total_score integer not null,
  unassigned uuid[] not null,
  created_at timestamptz not null default now()
);

-- Algorithm teams: rank_ab is Rank(a -> b) where a is the member with the smaller id.
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  formation_source text not null check (formation_source in ('algorithm', 'manual')),
  approval_state text not null
    check (approval_state in ('proposed', 'approved', 'rejected', 'superseded', 'dissolved')),
  matching_run_id uuid references public.matching_runs (id),
  rank_ab integer,
  rank_ba integer,
  pair_score integer,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  check ((formation_source = 'algorithm') =
    (matching_run_id is not null and rank_ab is not null and rank_ba is not null and pair_score is not null)),
  check (formation_source = 'algorithm' or approval_state in ('approved', 'dissolved'))
);

create table public.team_members (
  team_id uuid not null references public.teams (id),
  participant_id uuid not null references public.participants (id),
  status text not null check (status in ('proposed', 'active', 'ended')),
  primary key (team_id, participant_id)
);
create unique index team_members_one_active on public.team_members (participant_id) where status = 'active';

alter table public.discovery enable row level security;
alter table public.swipes enable row level security;
alter table public.matching_runs enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

revoke all on public.discovery, public.swipes, public.matching_runs, public.teams, public.team_members
  from anon, authenticated;

-- Admin actions ------------------------------------------------------------

create function public.set_discovery(p_admin uuid, p_status text) returns void
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

  update discovery set status = p_status, updated_at = now();
  insert into audit_log (actor, action, entity, before, after)
  values ('admin:' || p_admin, 'discovery.set', 'discovery',
          jsonb_build_object('status', v_before), jsonb_build_object('status', p_status));
end $$;

create function public.supersede_proposals() returns void
language sql as $$
  update team_members set status = 'ended'
  where status = 'proposed';
  update teams set approval_state = 'superseded'
  where approval_state = 'proposed';
$$;

-- p_teams: [{a, b, rankAB, rankBA, score}] from src/lib/matching. Re-checked here against swipes.
create function public.save_matching_run(
  p_admin uuid, p_version text, p_total integer, p_unassigned uuid[], p_teams jsonb
) returns uuid
language plpgsql as $$
declare
  v_run uuid;
  v_team uuid;
  t jsonb;
begin
  perform supersede_proposals();

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

    insert into teams (formation_source, approval_state, matching_run_id, rank_ab, rank_ba, pair_score, created_by)
    values ('algorithm', 'proposed', v_run, (t->>'rankAB')::int, (t->>'rankBA')::int, (t->>'score')::int, p_admin)
    returning id into v_team;

    insert into team_members (team_id, participant_id, status)
    values (v_team, (t->>'a')::uuid, 'proposed'), (v_team, (t->>'b')::uuid, 'proposed');
  end loop;

  insert into audit_log (actor, action, entity, entity_id, after)
  values ('admin:' || p_admin, 'matching.run', 'matching_runs', v_run,
          jsonb_build_object('team_count', jsonb_array_length(p_teams), 'total_score', p_total));
  return v_run;
end $$;

create function public.reset_matching(p_admin uuid) returns void
language plpgsql as $$
begin
  perform supersede_proposals();
  insert into audit_log (actor, action, entity)
  values ('admin:' || p_admin, 'matching.reset', 'teams');
end $$;

-- A member already in another active team makes the unique index fail; the whole call rolls back.
create function public.decide_team(p_admin uuid, p_team uuid, p_approve boolean) returns void
language plpgsql as $$
declare
  v_state text;
  v_new text := case when p_approve then 'approved' else 'rejected' end;
begin
  select approval_state into v_state from teams where id = p_team for update;
  if v_state is distinct from 'proposed' then
    raise exception 'This team is not a pending proposal.';
  end if;

  update teams set approval_state = v_new, decided_by = p_admin, decided_at = now() where id = p_team;
  update team_members set status = case when p_approve then 'active' else 'ended' end where team_id = p_team;

  insert into audit_log (actor, action, entity, entity_id, before, after)
  values ('admin:' || p_admin, 'team.' || case when p_approve then 'approve' else 'reject' end, 'teams', p_team,
          jsonb_build_object('approval_state', v_state), jsonb_build_object('approval_state', v_new));
end $$;

create function public.create_manual_team(p_admin uuid, p_a uuid, p_b uuid) returns uuid
language plpgsql as $$
declare
  v_team uuid;
begin
  if p_a = p_b then
    raise exception 'Pick two different participants.';
  end if;

  insert into teams (formation_source, approval_state, created_by, decided_by, decided_at)
  values ('manual', 'approved', p_admin, p_admin, now())
  returning id into v_team;
  insert into team_members (team_id, participant_id, status)
  values (v_team, p_a, 'active'), (v_team, p_b, 'active');

  insert into audit_log (actor, action, entity, entity_id, after)
  values ('admin:' || p_admin, 'team.create_manual', 'teams', v_team,
          jsonb_build_object('members', jsonb_build_array(p_a, p_b)));
  return v_team;
end $$;

-- "Editing" a team = dissolve it, then create a manual team. Keeps algorithm records intact.
create function public.dissolve_team(p_admin uuid, p_team uuid) returns void
language plpgsql as $$
declare
  v_state text;
begin
  select approval_state into v_state from teams where id = p_team for update;
  if v_state is distinct from 'approved' then
    raise exception 'Only approved teams can be dissolved.';
  end if;

  update teams set approval_state = 'dissolved' where id = p_team;
  update team_members set status = 'ended' where team_id = p_team;

  insert into audit_log (actor, action, entity, entity_id, before, after)
  values ('admin:' || p_admin, 'team.dissolve', 'teams', p_team,
          jsonb_build_object('approval_state', v_state), jsonb_build_object('approval_state', 'dissolved'));
end $$;

-- Functions are executable by PUBLIC by default; only the server (service_role) may call these.
revoke execute on function
  public.set_discovery(uuid, text),
  public.supersede_proposals(),
  public.save_matching_run(uuid, text, integer, uuid[], jsonb),
  public.reset_matching(uuid),
  public.decide_team(uuid, uuid, boolean),
  public.create_manual_team(uuid, uuid, uuid),
  public.dissolve_team(uuid, uuid)
from public, anon, authenticated;
