-- 0013_backfill_legacy_protein.sql
--
-- Rescues protein logged before meals existed.
--
-- 0012 moved food into `meals` and left `nutrition_logs.protein_g` behind as
-- dead, on the reasoning that inventing meals for historical rows would be
-- worse than losing them. That was right about history and wrong about the
-- present: a day had already been logged on the old screen, and the new one
-- sums from `meals` alone, so a real 48 g simply vanished from the total.
--
-- Carried across as one honest row per day rather than as guessed meals. The
-- description says where the number came from, so it can never be mistaken for
-- a meal that was actually described.
insert into public.meals (user_id, date, description, portion, protein_g, carbs_g, fat_g, kcal, source, confidence)
select
  n.user_id,
  n.date,
  'Logged before meal tracking',
  null,
  n.protein_g,
  null,
  null,
  n.calories_kcal,
  'manual',
  'low'
from public.nutrition_logs n
where n.protein_g is not null
  and n.protein_g > 0
  -- Only where the day has no meals, so re-running this cannot double a total.
  and not exists (
    select 1 from public.meals m where m.user_id = n.user_id and m.date = n.date
  );
