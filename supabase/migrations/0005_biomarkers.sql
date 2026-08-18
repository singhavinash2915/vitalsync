-- =============================================================================
-- VitalSync — 0005: biomarkers
--
-- Metrics that describe the body's condition rather than a given day's effort.
-- All four were already present in the data and unparsed: VO2 max (51 records
-- in a real export), respiratory rate (368), body mass, and cardio recovery.
--
-- Body fat and lean mass are deliberately NOT added — they need a smart scale,
-- and a column that is always null is worse than no column at all.
-- =============================================================================

alter table public.health_logs
  add column if not exists vo2_max numeric(4, 1)
    check (vo2_max is null or (vo2_max between 10 and 100)),
  add column if not exists respiratory_rate numeric(4, 1)
    check (respiratory_rate is null or (respiratory_rate between 4 and 60)),
  add column if not exists weight_kg numeric(5, 2)
    check (weight_kg is null or (weight_kg between 20 and 400)),
  -- Beats the heart rate falls in the minute after peak effort. One of the
  -- better single markers of aerobic fitness, and it needs no extra hardware.
  add column if not exists cardio_recovery numeric(4, 1)
    check (cardio_recovery is null or (cardio_recovery between 0 and 100));

comment on column public.health_logs.vo2_max is
  'ml/(kg·min). Unlike HRV this IS comparable to population norms by age and sex.';

-- Sex is only used to pick the right VO2 max reference table. Nullable, and
-- the UI falls back to a personal-trend view when it is not set.
alter table public.users
  add column if not exists sex text
    check (sex is null or sex in ('male', 'female', 'unspecified'));
