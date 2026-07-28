-- =============================================================================
-- VitalSync — initial schema
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query),
-- or with `supabase db push` if you use the CLI.
--
-- Every table is keyed by `user_id` and protected by row-level security, so a
-- signed-in user can only ever read or write their own rows — even though the
-- app talks to the database directly with the public anon key.
-- =============================================================================

-- Needed for gen_random_uuid() on older projects; a no-op on newer ones.
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- users — profile data mirroring auth.users
-- -----------------------------------------------------------------------------
create table if not exists public.users (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text,
  name           text,
  age            integer check (age is null or (age between 10 and 120)),
  weight         numeric(5, 2) check (weight is null or (weight between 20 and 400)),
  height         numeric(5, 1) check (height is null or (height between 80 and 250)),
  fitness_goal   text check (
                   fitness_goal is null or fitness_goal in
                   ('performance', 'endurance', 'strength', 'weight_loss', 'longevity')
                 ),
  calorie_target integer not null default 600 check (calorie_target between 100 and 5000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.users is 'VitalSync profile, one row per auth user.';
comment on column public.users.calorie_target is 'Daily active-calorie target driving the exertion score.';

-- -----------------------------------------------------------------------------
-- health_logs — one row per day of biometrics
-- -----------------------------------------------------------------------------
create table if not exists public.health_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  date            date not null,
  hrv             numeric(6, 2) check (hrv is null or (hrv between 1 and 400)),
  resting_hr      integer       check (resting_hr is null or (resting_hr between 25 and 150)),
  spo2            numeric(4, 1) check (spo2 is null or (spo2 between 50 and 100)),
  body_temp       numeric(4, 1) check (body_temp is null or (body_temp between 30 and 45)),
  active_calories integer       check (active_calories is null or (active_calories between 0 and 20000)),
  steps           integer       check (steps is null or (steps between 0 and 200000)),
  source          text not null default 'manual',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- One row per user per day; the app upserts on this constraint.
  constraint health_logs_user_date_key unique (user_id, date)
);

comment on column public.health_logs.source is 'manual | health-sync | shortcut — where the row came from.';

-- -----------------------------------------------------------------------------
-- sleep_logs
-- -----------------------------------------------------------------------------
create table if not exists public.sleep_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  date           date not null,
  duration_hours numeric(4, 2) check (duration_hours is null or (duration_hours between 0 and 24)),
  quality_rating integer       check (quality_rating is null or (quality_rating between 1 and 5)),
  bedtime        time,
  wake_time      time,
  source         text not null default 'manual',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint sleep_logs_user_date_key unique (user_id, date)
);

-- -----------------------------------------------------------------------------
-- workout_logs — many rows per day
-- -----------------------------------------------------------------------------
create table if not exists public.workout_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  date            date not null,
  type            text not null default 'other',
  duration_mins   integer not null check (duration_mins between 1 and 1440),
  intensity       integer not null default 5 check (intensity between 1 and 10),
  calories_burned integer check (calories_burned is null or (calories_burned between 0 and 20000)),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- journal_logs
-- -----------------------------------------------------------------------------
create table if not exists public.journal_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  date         date not null,
  notes        text,
  alcohol      boolean not null default false,
  travel       boolean not null default false,
  meditation   boolean not null default false,
  stress_level integer check (stress_level is null or (stress_level between 1 and 5)),
  diet_quality integer check (diet_quality is null or (diet_quality between 1 and 5)),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint journal_logs_user_date_key unique (user_id, date)
);

-- -----------------------------------------------------------------------------
-- scores — derived, but stored so trends stay fast and history is stable
-- -----------------------------------------------------------------------------
create table if not exists public.scores (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  date            date not null,
  recovery_score  integer check (recovery_score  between 0 and 100),
  sleep_score     integer check (sleep_score     between 0 and 100),
  exertion_score  integer check (exertion_score  between 0 and 100),
  readiness_score integer check (readiness_score between 0 and 100),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint scores_user_date_key unique (user_id, date)
);

-- -----------------------------------------------------------------------------
-- Indexes — every query in the app filters by user_id and orders by date desc
-- -----------------------------------------------------------------------------
create index if not exists health_logs_user_date_idx  on public.health_logs  (user_id, date desc);
create index if not exists sleep_logs_user_date_idx   on public.sleep_logs   (user_id, date desc);
create index if not exists workout_logs_user_date_idx on public.workout_logs (user_id, date desc);
create index if not exists journal_logs_user_date_idx on public.journal_logs (user_id, date desc);
create index if not exists scores_user_date_idx       on public.scores       (user_id, date desc);

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'health_logs', 'sleep_logs', 'workout_logs', 'journal_logs', 'scores'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.touch_updated_at()', t
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Auto-create a profile row when someone signs up
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Row-level security
--
-- The app ships the anon key to the browser, so RLS is the only thing standing
-- between one user and another's data. Every policy pins rows to auth.uid().
-- =============================================================================

alter table public.users        enable row level security;
alter table public.health_logs  enable row level security;
alter table public.sleep_logs   enable row level security;
alter table public.workout_logs enable row level security;
alter table public.journal_logs enable row level security;
alter table public.scores       enable row level security;

-- users: the row IS the user
drop policy if exists "users read own"   on public.users;
drop policy if exists "users insert own" on public.users;
drop policy if exists "users update own" on public.users;

create policy "users read own"   on public.users for select using  (auth.uid() = id);
create policy "users insert own" on public.users for insert with check (auth.uid() = id);
create policy "users update own" on public.users for update using  (auth.uid() = id)
                                                    with check (auth.uid() = id);

-- Every data table gets the same four policies keyed on user_id.
do $$
declare
  t text;
begin
  foreach t in array array['health_logs', 'sleep_logs', 'workout_logs', 'journal_logs', 'scores']
  loop
    execute format('drop policy if exists "own rows select" on public.%I', t);
    execute format('drop policy if exists "own rows insert" on public.%I', t);
    execute format('drop policy if exists "own rows update" on public.%I', t);
    execute format('drop policy if exists "own rows delete" on public.%I', t);

    execute format(
      'create policy "own rows select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format(
      'create policy "own rows insert" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format(
      'create policy "own rows update" on public.%I for update using (auth.uid() = user_id)
         with check (auth.uid() = user_id)', t);
    execute format(
      'create policy "own rows delete" on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants — RLS decides the rows, these decide the verbs.
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- The anon role is deliberately given no table access: every screen in the app
-- requires a signed-in session, so there is nothing for an anonymous caller to read.
