-- =============================================================================
-- VitalSync — 0003: make the workout de-duplication index usable by upsert
--
-- 0002 created a PARTIAL unique index:
--
--   create unique index ... on workout_logs (user_id, external_id)
--     where external_id is not null;
--
-- Postgres will only infer a partial index for ON CONFLICT if the statement
-- repeats the index predicate (`on conflict (a, b) where ...`). PostgREST's
-- `on_conflict=` parameter emits no predicate, so every workout upsert failed:
--
--   42P10: there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- which aborted re-imports part-way — health and sleep rows landed, workouts
-- did not, and the UI reported a failure.
--
-- A plain unique index is inferable. It stays correct for hand-logged workouts
-- because Postgres treats NULLs as distinct in a unique index, so any number of
-- rows with external_id IS NULL can coexist. (Verified against this database:
-- the partial index raises 42P10, the plain index upserts fine and accepts
-- multiple NULL rows.)
-- =============================================================================

drop index if exists public.workout_logs_user_external_key;

-- Guard against pre-existing duplicates before the unique index goes on.
-- Keeps the earliest row for each (user_id, external_id) pair.
delete from public.workout_logs a
using public.workout_logs b
where a.external_id is not null
  and a.external_id = b.external_id
  and a.user_id = b.user_id
  and a.ctid > b.ctid;

create unique index if not exists workout_logs_user_external_key
  on public.workout_logs (user_id, external_id);

comment on index public.workout_logs_user_external_key is
  'Lets an import upsert on Apple''s workout UUID. Must NOT be partial — a '
  'partial index cannot be inferred by ON CONFLICT without its predicate.';
