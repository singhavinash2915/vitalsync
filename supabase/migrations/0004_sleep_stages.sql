-- =============================================================================
-- VitalSync — 0004: keep the sleep stages
--
-- Both data sources already carry them and we were throwing them away. Health
-- Auto Export sends core/deep/rem/awake alongside totalSleep, and Apple's
-- export.xml records every stage as its own AsleepCore/AsleepDeep/AsleepREM
-- segment. Until now all of that collapsed into a single duration_hours.
--
-- Storing the split matters for two reasons beyond the pretty chart: it gives
-- an OBJECTIVE quality measure for anyone who never remembers to rate their
-- sleep by hand (which is most people, and currently leaves 40% of the sleep
-- score permanently unused), and deep-sleep percentage is the part of a night
-- that actually tracks with recovery.
-- =============================================================================

alter table public.sleep_logs
  add column if not exists deep_hours  numeric(4, 2) check (deep_hours  is null or (deep_hours  between 0 and 24)),
  add column if not exists rem_hours   numeric(4, 2) check (rem_hours   is null or (rem_hours   between 0 and 24)),
  add column if not exists core_hours  numeric(4, 2) check (core_hours  is null or (core_hours  between 0 and 24)),
  add column if not exists awake_hours numeric(4, 2) check (awake_hours is null or (awake_hours between 0 and 24)),
  -- Time in bed is not the same as time asleep; efficiency is the ratio.
  add column if not exists in_bed_hours numeric(4, 2) check (in_bed_hours is null or (in_bed_hours between 0 and 24));

comment on column public.sleep_logs.core_hours is
  'Light/N1-N2 sleep. Apple calls this "Core".';
comment on column public.sleep_logs.awake_hours is
  'Time awake DURING the sleep window — drives sleep efficiency, not duration.';
