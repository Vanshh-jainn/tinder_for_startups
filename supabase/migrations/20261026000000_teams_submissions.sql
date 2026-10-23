-- Phase 3: team numbers + random domains on approval, startup pitches, Google Form link.
-- Team members reach the workspace through their own participant login (no shared team code).

create table public.config (
  id boolean primary key default true check (id),
  google_form_url text check (google_form_url ~ '^https://'),
  updated_at timestamptz not null default now()
);
insert into public.config default values;

create function public.random_domain() returns text
language sql volatile as $$
  select (array['Travel & Tourism', 'FinTech', 'EdTech', 'HealthTech', 'AI for Social Good', 'SaaS-Based Startups'])
    [1 + floor(random() * 6)::int];
$$;

-- Numbers are handed out on approval, so rejected proposals don't leave gaps ("Team 7").
create sequence public.team_number_seq;
alter table public.teams
  add column number integer unique,
  add column domain text check (domain in
    ('Travel & Tourism', 'FinTech', 'EdTech', 'HealthTech', 'AI for Social Good', 'SaaS-Based Startups'));

-- Teams approved before this migration get theirs now.
update public.teams set number = nextval('public.team_number_seq'), domain = public.random_domain()
where approval_state in ('approved', 'dissolved');

alter table public.teams add constraint teams_approved_have_number_and_domain
  check (approval_state not in ('approved', 'dissolved') or (number is not null and domain is not null));

-- Marketplace pitch. No product length limit; the cap only stops abuse.
create table public.submissions (
  team_id uuid primary key references public.teams (id),
  pitch text not null check (char_length(pitch) <= 2000),
  updated_by text not null, -- 'participant:<id>' or 'admin:<id>'
  updated_at timestamptz not null default now()
);

alter table public.config enable row level security;
alter table public.submissions enable row level security;
revoke all on public.config, public.submissions from anon, authenticated;
revoke all on sequence public.team_number_seq from anon, authenticated;

-- Approval and manual creation now assign number + domain ---------------------

create or replace function public.decide_team(p_admin uuid, p_team uuid, p_approve boolean) returns void
language plpgsql as $$
declare
  v_state text;
  v_new text := case when p_approve then 'approved' else 'rejected' end;
  v_number integer;
  v_domain text;
begin
  select approval_state into v_state from teams where id = p_team for update;
  if v_state is distinct from 'proposed' then
    raise exception 'This team is not a pending proposal.';
  end if;

  if p_approve then
    v_number := nextval('team_number_seq');
    v_domain := random_domain();
  end if;
  update teams set approval_state = v_new, decided_by = p_admin, decided_at = now(), number = v_number, domain = v_domain
  where id = p_team;
  update team_members set status = case when p_approve then 'active' else 'ended' end where team_id = p_team;

  insert into audit_log (actor, action, entity, entity_id, before, after)
  values ('admin:' || p_admin, 'team.' || case when p_approve then 'approve' else 'reject' end, 'teams', p_team,
          jsonb_build_object('approval_state', v_state),
          jsonb_build_object('approval_state', v_new, 'number', v_number, 'domain', v_domain));
end $$;

create or replace function public.create_manual_team(p_admin uuid, p_a uuid, p_b uuid) returns uuid
language plpgsql as $$
declare
  v_team uuid;
  v_number integer := nextval('team_number_seq');
  v_domain text := random_domain();
begin
  if p_a = p_b then
    raise exception 'Pick two different participants.';
  end if;

  insert into teams (formation_source, approval_state, created_by, decided_by, decided_at, number, domain)
  values ('manual', 'approved', p_admin, p_admin, now(), v_number, v_domain)
  returning id into v_team;
  insert into team_members (team_id, participant_id, status)
  values (v_team, p_a, 'active'), (v_team, p_b, 'active');

  insert into audit_log (actor, action, entity, entity_id, after)
  values ('admin:' || p_admin, 'team.create_manual', 'teams', v_team,
          jsonb_build_object('members', jsonb_build_array(p_a, p_b), 'number', v_number, 'domain', v_domain));
  return v_team;
end $$;

-- Admin actions ----------------------------------------------------------------

create function public.set_form_url(p_admin uuid, p_url text) returns void
language plpgsql as $$
declare
  v_before text;
begin
  select google_form_url into v_before from config for update;
  update config set google_form_url = p_url, updated_at = now();
  insert into audit_log (actor, action, entity, before, after)
  values ('admin:' || p_admin, 'config.google_form_url', 'config',
          jsonb_build_object('google_form_url', v_before), jsonb_build_object('google_form_url', p_url));
end $$;

create function public.admin_set_pitch(p_admin uuid, p_team uuid, p_pitch text) returns void
language plpgsql as $$
declare
  v_before text;
begin
  if not exists (select 1 from teams where id = p_team and approval_state = 'approved') then
    raise exception 'Team is not approved.';
  end if;
  select pitch into v_before from submissions where team_id = p_team for update;

  insert into submissions (team_id, pitch, updated_by) values (p_team, p_pitch, 'admin:' || p_admin)
  on conflict (team_id) do update set pitch = excluded.pitch, updated_by = excluded.updated_by, updated_at = now();

  insert into audit_log (actor, action, entity, entity_id, before, after)
  values ('admin:' || p_admin, 'submission.edit_pitch', 'submissions', p_team,
          jsonb_build_object('pitch', v_before), jsonb_build_object('pitch', p_pitch));
end $$;

revoke execute on function
  public.random_domain(),
  public.set_form_url(uuid, text),
  public.admin_set_pitch(uuid, uuid, text)
from public, anon, authenticated;
