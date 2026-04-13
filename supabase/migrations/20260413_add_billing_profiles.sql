create extension if not exists pgcrypto;

create table if not exists public.billing_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_key text not null default 'free' check (plan_key in ('free', 'starter', 'pro', 'pro_plus')),
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  monthly_credits integer not null default 10 check (monthly_credits >= 0),
  subscription_status text not null default 'free' check (
    subscription_status in (
      'free',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'incomplete',
      'incomplete_expired',
      'paused'
    )
  ),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  pending_plan_key text check (pending_plan_key in ('free', 'starter', 'pro', 'pro_plus')),
  pending_billing_interval text check (pending_billing_interval in ('month', 'year')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  livemode boolean not null default false,
  status text not null default 'received' check (status in ('received', 'processing', 'processed', 'failed')),
  processing_error text,
  received_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.billing_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists billing_profiles_touch_updated_at on public.billing_profiles;
create trigger billing_profiles_touch_updated_at
before update on public.billing_profiles
for each row
execute function public.billing_touch_updated_at();

drop trigger if exists billing_webhook_events_touch_updated_at on public.billing_webhook_events;
create trigger billing_webhook_events_touch_updated_at
before update on public.billing_webhook_events
for each row
execute function public.billing_touch_updated_at();

create or replace function public.handle_new_user_billing_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.billing_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_billing_profile on auth.users;
create trigger on_auth_user_created_billing_profile
after insert on auth.users
for each row
execute function public.handle_new_user_billing_profile();

insert into public.billing_profiles (user_id)
select users.id
from auth.users as users
on conflict (user_id) do nothing;

alter table public.billing_profiles enable row level security;
alter table public.billing_webhook_events enable row level security;

drop policy if exists "billing_profiles_select_own" on public.billing_profiles;
create policy "billing_profiles_select_own"
on public.billing_profiles
for select
to authenticated
using (auth.uid() = user_id);
