-- =============================================================================
-- VitalSync — 0008: date of birth, and a training plan
--
-- Two related additions.
--
-- Date of birth replaces a typed-in age. Age was entered once and then silently
-- rotted; it also feeds the VO2 max reference bands, whose thresholds step at
-- 40, so a stale value eventually mis-rates you. Storing the birth date makes
-- age a derived value that is always right.
--
-- The training plan is what turns a readiness number into an instruction. A
-- score of 52 means "cut the volume" before a gym session and something quite
-- different before a match you have already committed to playing — so the app
-- needs to know which kind of day it is.
-- =============================================================================

alter table public.users
  add column if not exists date_of_birth date
    check (date_of_birth is null or date_of_birth > '1900-01-01');

comment on column public.users.date_of_birth is
  'Age is derived from this. The `age` column is kept as a fallback for profiles that predate it.';

-- -----------------------------------------------------------------------------
-- training_plan — one row per weekday per plan period
--
-- Deliberately weekday-based rather than a calendar of individual sessions:
-- real amateur schedules repeat weekly, and a date-range lets a block ("gym
-- every morning in September") be replaced by the next one without editing
-- thirty rows.
-- -----------------------------------------------------------------------------
create table if not exists public.training_plan (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  name         text,
  starts_on    date not null,
  -- Null means "until further notice"; a later block simply takes over.
  ends_on      date,
  -- 0 = Sunday, matching JavaScript's getDay().
  weekday      integer not null check (weekday between 0 and 6),
  activity     text not null check (activity in ('gym', 'cricket', 'run', 'rest', 'other')),
  start_time   time,
  duration_mins integer check (duration_mins is null or (duration_mins between 5 and 600)),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One activity per weekday within a block.
  constraint training_plan_unique_slot unique (user_id, starts_on, weekday)
);

create index if not exists training_plan_user_idx
  on public.training_plan (user_id, starts_on desc, weekday);

drop trigger if exists set_updated_at on public.training_plan;
create trigger set_updated_at before update on public.training_plan
  for each row execute function public.touch_updated_at();

alter table public.training_plan enable row level security;

drop policy if exists "plan select own" on public.training_plan;
drop policy if exists "plan insert own" on public.training_plan;
drop policy if exists "plan update own" on public.training_plan;
drop policy if exists "plan delete own" on public.training_plan;

create policy "plan select own" on public.training_plan for select using (auth.uid() = user_id);
create policy "plan insert own" on public.training_plan for insert with check (auth.uid() = user_id);
create policy "plan update own" on public.training_plan for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "plan delete own" on public.training_plan for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.training_plan to authenticated;
