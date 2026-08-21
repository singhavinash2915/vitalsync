-- =============================================================================
-- VitalSync — 0007: remember which formula stored scores were computed with
--
-- The dashboard always recomputes today live, but Trends and the weekly
-- summary read the stored `scores` table. After a change to the algorithm
-- those two disagree until history is rebuilt, and the only trigger for a
-- rebuild was a manual button most people would never find.
-- =============================================================================

alter table public.users
  add column if not exists scoring_version integer not null default 0;

comment on column public.users.scoring_version is
  'SCORING_VERSION from src/lib/scores.js at the time scores were last rebuilt.';
