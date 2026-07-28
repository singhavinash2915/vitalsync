-- =============================================================================
-- VitalSync — 0002: unattended sync keys + idempotent workout import
--
-- Problem this solves: the /health-sync endpoint authenticated with a Supabase
-- access token, which expires in an hour. That is fine for a manual test and
-- useless for a daily automation — the whole point is that it runs while you
-- are asleep.
--
-- A sync key is a long random secret, stored hashed, that maps to one user and
-- never expires. The Edge Function looks it up with the service-role key and
-- then writes as that user. Revoke it any time by deleting the row.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- sync_keys
-- -----------------------------------------------------------------------------
create table if not exists public.sync_keys (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  -- SHA-256 of the key. The plaintext is shown once, at creation, and never
  -- stored — a leaked database backup must not hand over working credentials.
  key_hash    text not null unique,
  -- First 8 chars, so the UI can say which key you are looking at.
  key_prefix  text not null,
  label       text,
  last_used_at timestamptz,
  use_count   integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists sync_keys_user_idx on public.sync_keys (user_id);
create index if not exists sync_keys_hash_idx on public.sync_keys (key_hash);

comment on table public.sync_keys is
  'Long-lived API keys for unattended Apple Health sync. Hashed; plaintext shown once.';

alter table public.sync_keys enable row level security;

-- The owner can list and revoke their keys. Note there is no INSERT policy:
-- keys are minted by the Edge Function using the service role, so the browser
-- can never write a hash it chose itself.
drop policy if exists "sync keys select own" on public.sync_keys;
drop policy if exists "sync keys delete own" on public.sync_keys;

create policy "sync keys select own" on public.sync_keys
  for select using (auth.uid() = user_id);
create policy "sync keys delete own" on public.sync_keys
  for delete using (auth.uid() = user_id);

grant select, delete on public.sync_keys to authenticated;

-- -----------------------------------------------------------------------------
-- workout_logs.external_id — makes re-importing the same export idempotent
--
-- Apple gives every workout a stable UUID. Without storing it, importing the
-- same file twice creates duplicate sessions and doubles your exertion score.
-- -----------------------------------------------------------------------------
alter table public.workout_logs
  add column if not exists external_id text;

alter table public.workout_logs
  add column if not exists source text not null default 'manual';

-- Partial unique index: only rows that actually came from an import are
-- constrained, so hand-logged workouts (external_id null) are unaffected.
create unique index if not exists workout_logs_user_external_key
  on public.workout_logs (user_id, external_id)
  where external_id is not null;

-- -----------------------------------------------------------------------------
-- Track where daily rows came from (manual entry, push sync, or file import)
-- -----------------------------------------------------------------------------
alter table public.health_logs add column if not exists source text not null default 'manual';
alter table public.sleep_logs  add column if not exists source text not null default 'manual';
