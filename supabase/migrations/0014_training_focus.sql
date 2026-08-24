-- 0014_training_focus.sql
--
-- What today's gym session was actually for.
--
-- Deliberately a column on `journal_logs` rather than a new table. That row is
-- already the per-day record of things the watch cannot know — soreness, knee
-- comfort, alcohol, stress — and a session's focus is exactly that kind of
-- fact. A separate table would be a fifth place to look for "what happened on
-- this date", which is how the schema got confusing the last time.
alter table public.journal_logs
  add column if not exists training_focus text
    check (training_focus in ('chest','back','legs','shoulders','arms','core','full body','cardio'));

comment on column public.journal_logs.training_focus is
  'Body part trained, chosen on the Lifts page. Drives the dashboard message and filters the exercise picker.';
