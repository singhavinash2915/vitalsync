-- =============================================================================
-- VitalSync — 0006: intraday snapshots
--
-- Readiness genuinely moves during a day: active calories accumulate, so the
-- load working against you grows from morning to night. The daily tables can't
-- show that, because each sync upserts the same row and the earlier reading is
-- overwritten — by evening the morning is gone.
--
-- A sync running every three hours is already producing eight observations a
-- day. This keeps them, so the curve can be drawn.
--
-- Only the INPUTS are stored, never the computed scores. The scoring lives in
-- one place (src/lib/scores.js) and the app recomputes each point from these
-- raw values, which means a change to the algorithm correctly re-scores
-- history instead of leaving stale numbers behind.
-- =============================================================================

create table if not exists public.health_snapshots (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  captured_at     timestamptz not null default now(),
  date            date not null,
  hrv             numeric(6, 2),
  resting_hr      integer,
  active_calories integer,
  steps           integer,
  sleep_hours     numeric(4, 2),
  source          text not null default 'health-sync'
);

create index if not exists health_snapshots_user_date_idx
  on public.health_snapshots (user_id, date, captured_at desc);

alter table public.health_snapshots enable row level security;

drop policy if exists "snapshots select own" on public.health_snapshots;
drop policy if exists "snapshots insert own" on public.health_snapshots;
drop policy if exists "snapshots delete own" on public.health_snapshots;

create policy "snapshots select own" on public.health_snapshots
  for select using (auth.uid() = user_id);
create policy "snapshots insert own" on public.health_snapshots
  for insert with check (auth.uid() = user_id);
create policy "snapshots delete own" on public.health_snapshots
  for delete using (auth.uid() = user_id);

grant select, insert, delete on public.health_snapshots to authenticated;

comment on table public.health_snapshots is
  'One row per sync. Inputs only — scores are always recomputed from these.';
