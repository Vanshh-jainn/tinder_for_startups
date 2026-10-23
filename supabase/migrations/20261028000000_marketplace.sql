-- Phase 5: investment marketplace.
-- Window (OQ-13): during the Investment Marketplace phase, the first 10 minutes of the phase timer are
-- decision time (pick + allocate), the rest is confirmation time (confirm each; no edits).
-- A team's investments count only when every non-voided row is confirmed (spec §9).

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  investor_team_id uuid not null references public.teams (id),
  target_team_id uuid not null references public.teams (id),
  amount integer not null check (amount >= 200 and amount % 100 = 0), -- OQ-34: multiples of ₹100
  created_by text not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by text,
  voided_at timestamptz,
  check (investor_team_id <> target_team_id),
  check ((confirmed_at is null) = (confirmed_by is null))
);
-- Voided rows stay for the record; uniqueness applies to the live allocation only.
create unique index investments_one_per_target on public.investments (investor_team_id, target_team_id) where voided_at is null;
create unique index investments_distinct_amounts on public.investments (investor_team_id, amount) where voided_at is null;

-- Only fully confirmed submissions count; draft and partial ones never reach totals.
create view public.counted_investments with (security_invoker = true) as
select i.investor_team_id, i.target_team_id, i.amount
from public.investments i
where i.voided_at is null
  and not exists (
    select 1 from public.investments j
    where j.investor_team_id = i.investor_team_id and j.voided_at is null and j.confirmed_at is null
  );

alter table public.investments enable row level security;
revoke all on public.investments, public.counted_investments from anon, authenticated;

create trigger investments_touch after insert or update or delete on public.investments
  for each statement execute function public.touch_event_state();

alter table public.event_state drop constraint event_state_projector_screen_check;
alter table public.event_state add constraint event_state_projector_screen_check
  check (projector_screen in ('welcome', 'rules', 'matchmaking', 'teams', 'pitching', 'leaderboard'));

-- 'closed' | 'decision' | 'confirmation'. Mirrors marketplaceWindow() in src/lib/marketplace.ts.
create function public.marketplace_window() returns text
language sql stable as $$
  select case
    when phase_idx is distinct from 6 then 'closed'
    when elapsed_ms + case when timer_status = 'running'
                           then (extract(epoch from now() - started_at) * 1000)::bigint else 0 end < 600000
      then 'decision'
    else 'confirmation'
  end
  from event_state;
$$;

-- Startups a team may invest in: approved teams with a saved pitch, except itself (OQ-17).
create function public.investment_targets(p_team uuid) returns setof uuid
language sql stable as $$
  select t.id from teams t join submissions s on s.team_id = t.id
  where t.approval_state = 'approved' and t.id <> p_team;
$$;

-- Team actions (called by the server after requireTeamMember) -------------------

-- p_items: [{target, amount}]. Replaces the team's unconfirmed allocation.
create function public.save_allocation(p_actor text, p_team uuid, p_items jsonb) returns void
language plpgsql as $$
declare
  v_window text := marketplace_window();
  v_required integer;
  v_count integer := jsonb_array_length(p_items);
begin
  if not exists (select 1 from teams where id = p_team and approval_state = 'approved') then
    raise exception 'Your team is not approved.';
  end if;
  if v_window = 'closed' then raise exception 'The marketplace is not open.'; end if;
  if exists (select 1 from investments where investor_team_id = p_team and voided_at is null and confirmed_at is not null) then
    raise exception 'Your allocation is locked because confirmations have started.';
  end if;
  -- After decision time, only a team whose submission the admin voided may redo it.
  if v_window = 'confirmation'
     and not exists (select 1 from investments where investor_team_id = p_team and voided_at is not null) then
    raise exception 'Decision time is over; allocations can no longer change.';
  end if;

  -- OQ-35: pick 7, or every available startup if there are fewer.
  select least(7, count(*)) into v_required from investment_targets(p_team);
  if v_required = 0 then raise exception 'There are no startups to invest in.'; end if;
  if v_count <> v_required then raise exception 'Pick exactly % startups.', v_required; end if;

  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(target uuid, amount integer)
    where x.target not in (select investment_targets(p_team))
  ) then
    raise exception 'You can only invest in other teams that have a pitch.';
  end if;

  if (select count(distinct target) from jsonb_to_recordset(p_items) as x(target uuid, amount integer)) <> v_count then
    raise exception 'Each startup can be picked only once.';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_items) as x(target uuid, amount integer)
             where amount is null or amount < 200 or amount % 100 <> 0) then
    raise exception 'Each amount must be at least ₹200 and a multiple of ₹100.';
  end if;
  if (select count(distinct amount) from jsonb_to_recordset(p_items) as x(target uuid, amount integer)) <> v_count then
    raise exception 'Every amount must be different.';
  end if;
  if (select sum(amount) from jsonb_to_recordset(p_items) as x(target uuid, amount integer)) <> 5000 then
    raise exception 'The amounts must add up to exactly ₹5,000.';
  end if;

  delete from investments where investor_team_id = p_team and voided_at is null;
  insert into investments (investor_team_id, target_team_id, amount, created_by)
  select p_team, x.target, x.amount, p_actor from jsonb_to_recordset(p_items) as x(target uuid, amount integer);
end $$;

-- Idempotent: confirming an already-confirmed investment does nothing.
create function public.confirm_investment(p_actor text, p_team uuid, p_target uuid) returns void
language plpgsql as $$
begin
  if marketplace_window() <> 'confirmation' then
    raise exception 'Confirmations are only open during confirmation time.';
  end if;
  update investments set confirmed_at = now(), confirmed_by = p_actor
  where investor_team_id = p_team and target_team_id = p_target and voided_at is null and confirmed_at is null;
  if not found and not exists (
    select 1 from investments where investor_team_id = p_team and target_team_id = p_target and voided_at is null
  ) then
    raise exception 'That startup is not in your allocation.';
  end if;
end $$;

-- Admin action ------------------------------------------------------------------

-- Voids a team's whole live submission; totals recalculate through the view. The team may redo it (OQ-16).
create function public.void_investments(p_admin uuid, p_team uuid) returns void
language plpgsql as $$
declare
  v_before jsonb;
begin
  select jsonb_agg(jsonb_build_object('target', target_team_id, 'amount', amount, 'confirmed', confirmed_at is not null))
  into v_before
  from investments where investor_team_id = p_team and voided_at is null;
  if v_before is null then raise exception 'This team has no investments to void.'; end if;

  update investments set voided_at = now() where investor_team_id = p_team and voided_at is null;
  insert into audit_log (actor, action, entity, entity_id, before, after)
  values ('admin:' || p_admin, 'investments.void', 'teams', p_team, jsonb_build_object('investments', v_before), null);
end $$;

revoke execute on function
  public.marketplace_window(),
  public.investment_targets(uuid),
  public.save_allocation(text, uuid, jsonb),
  public.confirm_investment(text, uuid, uuid),
  public.void_investments(uuid, uuid)
from public, anon, authenticated;
