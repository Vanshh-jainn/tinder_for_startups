-- Rehearsal fix D (user decision 2026-10-27, supersedes the confirmation-time design):
-- the marketplace is simply open during its phase. A team saves drafts, then locks its whole
-- allocation in one step; a locked allocation counts at once (counted_investments is unchanged:
-- every live row confirmed). Only the team's driver phone may save or lock (fix C).
-- event_state.market_confirmation is no longer used; timer_action/reset_event still clear it.
-- ponytail: column left in place to avoid rewriting those two functions; drop it in a later cleanup.

drop function public.confirm_investment(text, uuid, uuid);
drop function public.start_confirmation(uuid);

create or replace function public.marketplace_window() returns text
language sql stable as $$
  select case when phase_idx = 6 then 'open' else 'closed' end from event_state;
$$;

create function public.assert_team_driver(p_actor text, p_team uuid) returns void
language plpgsql as $$
begin
  if p_actor not like 'participant:%' or not exists (
    select 1 from teams where id = p_team and driver_id = split_part(p_actor, ':', 2)::uuid
  ) then
    raise exception 'Read-only: only your team''s driver phone can make changes.';
  end if;
end $$;

-- p_items: [{target, amount}]. Replaces the team's draft. Refused once the team has locked.
create or replace function public.save_allocation(p_actor text, p_team uuid, p_items jsonb) returns void
language plpgsql as $$
declare
  v_required integer;
  v_count integer := jsonb_array_length(p_items);
begin
  if not exists (select 1 from teams where id = p_team and approval_state = 'approved') then
    raise exception 'Your team is not approved.';
  end if;
  perform assert_team_driver(p_actor, p_team);
  if marketplace_window() <> 'open' then raise exception 'The marketplace is not open.'; end if;
  if exists (select 1 from investments where investor_team_id = p_team and voided_at is null and confirmed_at is not null) then
    raise exception 'Your investments are locked.';
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

-- Saves (all rules checked) and locks the whole allocation in one transaction. Final unless an admin voids it.
create function public.lock_allocation(p_actor text, p_team uuid, p_items jsonb) returns void
language plpgsql as $$
begin
  perform save_allocation(p_actor, p_team, p_items);
  update investments set confirmed_at = now(), confirmed_by = p_actor
  where investor_team_id = p_team and voided_at is null;
end $$;

revoke execute on function
  public.assert_team_driver(text, uuid),
  public.lock_allocation(text, uuid, jsonb)
from public, anon, authenticated;
