create table if not exists public.user_credits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  monthly_allowance integer not null default 10 check (monthly_allowance >= 0),
  plan_key text not null default 'free' check (plan_key in ('free', 'starter', 'pro', 'pro_plus')),
  current_period_start timestamptz not null default timezone('utc', now()),
  current_period_end timestamptz not null default timezone('utc', now() + interval '1 month'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (current_period_end > current_period_start)
);

create table if not exists public.credit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (event_type in ('grant', 'deduction', 'refund')),
  amount integer not null check (amount <> 0),
  balance_after integer not null check (balance_after >= 0),
  reason text not null,
  related_event_id uuid references public.credit_events (id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  check (
    (event_type = 'grant' and amount > 0 and related_event_id is null) or
    (event_type = 'deduction' and amount < 0 and related_event_id is null) or
    (event_type = 'refund' and amount > 0 and related_event_id is not null)
  )
);

create index if not exists credit_events_user_id_created_at_idx
  on public.credit_events (user_id, created_at desc);

create unique index if not exists credit_events_refund_related_event_idx
  on public.credit_events (related_event_id)
  where event_type = 'refund';

drop trigger if exists user_credits_touch_updated_at on public.user_credits;
create trigger user_credits_touch_updated_at
before update on public.user_credits
for each row
execute function public.billing_touch_updated_at();

create or replace function public.prevent_credit_events_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'credit_events is append-only';
end;
$$;

drop trigger if exists prevent_credit_events_update on public.credit_events;
create trigger prevent_credit_events_update
before update on public.credit_events
for each row
execute function public.prevent_credit_events_mutation();

drop trigger if exists prevent_credit_events_delete on public.credit_events;
create trigger prevent_credit_events_delete
before delete on public.credit_events
for each row
execute function public.prevent_credit_events_mutation();

create or replace function public.sync_user_credits(
  p_user_id uuid,
  p_plan_key text,
  p_monthly_allowance integer,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_reason text default 'billing_sync',
  p_metadata jsonb default '{}'::jsonb
)
returns public.user_credits
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_row public.user_credits%rowtype;
  updated_row public.user_credits%rowtype;
  balance_delta integer := 0;
  event_type text;
begin
  if p_plan_key not in ('free', 'starter', 'pro', 'pro_plus') then
    raise exception 'Invalid plan key: %', p_plan_key;
  end if;

  if p_monthly_allowance < 0 then
    raise exception 'monthly allowance cannot be negative';
  end if;

  if p_current_period_start is null or p_current_period_end is null then
    raise exception 'credit periods must be present';
  end if;

  if p_current_period_end <= p_current_period_start then
    raise exception 'credit period end must be after credit period start';
  end if;

  select *
  into existing_row
  from public.user_credits
  where user_id = p_user_id
  for update;

  if not found then
    insert into public.user_credits (
      user_id,
      balance,
      monthly_allowance,
      plan_key,
      current_period_start,
      current_period_end
    )
    values (
      p_user_id,
      p_monthly_allowance,
      p_monthly_allowance,
      p_plan_key,
      p_current_period_start,
      p_current_period_end
    )
    returning *
    into updated_row;

    insert into public.credit_events (
      user_id,
      event_type,
      amount,
      balance_after,
      reason,
      metadata
    )
    values (
      p_user_id,
      'grant',
      p_monthly_allowance,
      updated_row.balance,
      p_reason,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('sync_kind', 'initial')
    );

    return updated_row;
  end if;

  if existing_row.current_period_start is distinct from p_current_period_start
    or existing_row.current_period_end is distinct from p_current_period_end then
    balance_delta := p_monthly_allowance - existing_row.balance;

    update public.user_credits
    set balance = p_monthly_allowance,
        monthly_allowance = p_monthly_allowance,
        plan_key = p_plan_key,
        current_period_start = p_current_period_start,
        current_period_end = p_current_period_end
    where user_id = p_user_id
    returning *
    into updated_row;

    if balance_delta <> 0 then
      event_type := case when balance_delta > 0 then 'grant' else 'deduction' end;

      insert into public.credit_events (
        user_id,
        event_type,
        amount,
        balance_after,
        reason,
        metadata
      )
      values (
        p_user_id,
        event_type,
        balance_delta,
        updated_row.balance,
        p_reason,
        coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
          'previous_balance',
          existing_row.balance,
          'previous_monthly_allowance',
          existing_row.monthly_allowance,
          'sync_kind',
          'period_refresh'
        )
      );
    end if;

    return updated_row;
  end if;

  if p_monthly_allowance > existing_row.monthly_allowance then
    balance_delta := p_monthly_allowance - existing_row.monthly_allowance;

    update public.user_credits
    set balance = existing_row.balance + balance_delta,
        monthly_allowance = p_monthly_allowance,
        plan_key = p_plan_key,
        current_period_start = p_current_period_start,
        current_period_end = p_current_period_end
    where user_id = p_user_id
    returning *
    into updated_row;

    insert into public.credit_events (
      user_id,
      event_type,
      amount,
      balance_after,
      reason,
      metadata
    )
    values (
      p_user_id,
      'grant',
      balance_delta,
      updated_row.balance,
      p_reason,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'previous_monthly_allowance',
        existing_row.monthly_allowance,
        'sync_kind',
        'allowance_top_up'
      )
    );

    return updated_row;
  end if;

  update public.user_credits
  set monthly_allowance = p_monthly_allowance,
      plan_key = p_plan_key,
      current_period_start = p_current_period_start,
      current_period_end = p_current_period_end
  where user_id = p_user_id
  returning *
  into updated_row;

  return updated_row;
end;
$$;

create or replace function public.consume_user_credit(
  p_user_id uuid,
  p_reason text default 'summary',
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  ok boolean,
  balance integer,
  event_id uuid,
  plan_key text,
  monthly_allowance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  credits_row public.user_credits%rowtype;
  updated_row public.user_credits%rowtype;
  inserted_event_id uuid;
begin
  select *
  into credits_row
  from public.user_credits
  where user_id = p_user_id
  for update;

  if not found then
    return query
    select false, 0, null::uuid, null::text, 0;
    return;
  end if;

  if credits_row.balance <= 0 then
    return query
    select false, credits_row.balance, null::uuid, credits_row.plan_key, credits_row.monthly_allowance;
    return;
  end if;

  update public.user_credits
  set balance = credits_row.balance - 1
  where user_id = p_user_id
  returning *
  into updated_row;

  insert into public.credit_events (
    user_id,
    event_type,
    amount,
    balance_after,
    reason,
    metadata
  )
  values (
    p_user_id,
    'deduction',
    -1,
    updated_row.balance,
    p_reason,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id
  into inserted_event_id;

  return query
  select true, updated_row.balance, inserted_event_id, updated_row.plan_key, updated_row.monthly_allowance;
end;
$$;

create or replace function public.refund_credit_event(
  p_event_id uuid,
  p_reason text default 'summary_failed',
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  ok boolean,
  balance integer,
  refund_event_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  original_event public.credit_events%rowtype;
  credits_row public.user_credits%rowtype;
  existing_refund_id uuid;
  inserted_refund_id uuid;
  refund_amount integer;
begin
  select *
  into original_event
  from public.credit_events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Credit event % was not found', p_event_id;
  end if;

  if original_event.event_type <> 'deduction' then
    raise exception 'Only deduction events can be refunded';
  end if;

  select *
  into credits_row
  from public.user_credits
  where user_id = original_event.user_id
  for update;

  select id
  into existing_refund_id
  from public.credit_events
  where related_event_id = p_event_id
    and event_type = 'refund';

  if existing_refund_id is not null then
    return query
    select false, credits_row.balance, existing_refund_id;
    return;
  end if;

  refund_amount := abs(original_event.amount);

  update public.user_credits
  set balance = credits_row.balance + refund_amount
  where user_id = original_event.user_id
  returning *
  into credits_row;

  insert into public.credit_events (
    user_id,
    event_type,
    amount,
    balance_after,
    reason,
    related_event_id,
    metadata
  )
  values (
    original_event.user_id,
    'refund',
    refund_amount,
    credits_row.balance,
    p_reason,
    p_event_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id
  into inserted_refund_id;

  return query
  select true, credits_row.balance, inserted_refund_id;
end;
$$;

revoke all on function public.sync_user_credits(uuid, text, integer, timestamptz, timestamptz, text, jsonb) from public, anon, authenticated;
revoke all on function public.consume_user_credit(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.refund_credit_event(uuid, text, jsonb) from public, anon, authenticated;

grant execute on function public.sync_user_credits(uuid, text, integer, timestamptz, timestamptz, text, jsonb) to service_role;
grant execute on function public.consume_user_credit(uuid, text, jsonb) to service_role;
grant execute on function public.refund_credit_event(uuid, text, jsonb) to service_role;

create or replace function public.handle_new_user_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_user_credits(
    new.id,
    'free',
    10,
    timezone('utc', now()),
    timezone('utc', now() + interval '1 month'),
    'signup_grant',
    jsonb_build_object('source', 'auth_trigger')
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_user_credits on auth.users;
create trigger on_auth_user_created_user_credits
after insert on auth.users
for each row
execute function public.handle_new_user_credits();

select public.sync_user_credits(
  users.id,
  coalesce(billing.plan_key, 'free'),
  coalesce(billing.monthly_credits, 10),
  case
    when billing.current_period_start is not null and billing.current_period_end is not null
      then billing.current_period_start
    else timezone('utc', now())
  end,
  case
    when billing.current_period_start is not null and billing.current_period_end is not null
      then billing.current_period_end
    else timezone('utc', now() + interval '1 month')
  end,
  'migration_backfill',
  jsonb_build_object('source', '20260420_add_user_credits')
)
from auth.users as users
left join public.billing_profiles as billing
  on billing.user_id = users.id;

alter table public.user_credits enable row level security;
alter table public.credit_events enable row level security;

drop policy if exists "user_credits_select_own" on public.user_credits;
create policy "user_credits_select_own"
on public.user_credits
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "credit_events_select_own" on public.credit_events;
create policy "credit_events_select_own"
on public.credit_events
for select
to authenticated
using (auth.uid() = user_id);
