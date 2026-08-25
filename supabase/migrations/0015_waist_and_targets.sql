-- Waist, and the targets the 12-week programme is measured against.
--
-- Waist is the coach's most important indicator and it replaces the weekly
-- progress photos he asks for: this app is publicly readable, so physique
-- photos are not something to put behind a URL anyone can open. A tape measure
-- is a weekly ritual and a full InBody scan is not, so the column has to be
-- writable on its own — every other field in body_composition is already
-- nullable, so a weight-and-waist row is a valid row.

alter table public.body_composition
  add column if not exists waist_cm numeric;

comment on column public.body_composition.waist_cm is
  'Waist at the navel, cm. Recorded weekly; the scan fields stay null on tape-measure-only rows.';

-- Sleep and steps were tracked with nothing to hit. The coach names sleep as
-- the single biggest opportunity, so it gets a target like protein has one.
alter table public.users
  add column if not exists sleep_target_hours numeric,
  add column if not exists step_target integer;

-- -----------------------------------------------------------------------------
-- The programme's own settings.
--
-- These are data, not schema, but they belong with the migration that made room
-- for them: the app reads all four to decide what to tell someone, and half of
-- the numbers currently in the row contradict the coach.
-- -----------------------------------------------------------------------------
do $$
declare
  owner_id constant uuid := 'eb9b4bea-c04f-4906-a5fe-0acc54ffbb46';
  block_start constant date := date '2026-08-31';  -- the first Monday
  block_end   constant date := date '2026-11-22';  -- twelve weeks later
  cricket_from constant date := date '2026-10-01';
begin
  update public.users
     set
       -- 82 was chasing a number. The coach explicitly warns against driving
       -- 86 down to 80 and would rather see 83-84 with strength going up, so
       -- the app should stop congratulating a fall past that point.
       goal_weight_kg = 83.5,
       -- Was computed from fat-free mass and landed at 155 g, above the range
       -- he actually set. An explicit target wins over a derived one.
       protein_target_g = 140,
       sleep_target_hours = 7.5,
       step_target = 8000,
       -- Squats to full depth now: the coach has seen the knee and programmes
       -- barbell squats and Bulgarian split squats. The jump and sprint bans
       -- stay, because nothing in the programme needs either.
       training_limits = array['no_plyometrics', 'no_sprinting']
   where id = owner_id;

  -- Close any block still in force, then clear anything starting later, so
  -- this can be re-run without stacking duplicate weeks.
  update public.training_plan
     set ends_on = block_start - 1
   where user_id = owner_id
     and starts_on < block_start
     and (ends_on is null or ends_on >= block_start);

  delete from public.training_plan
   where user_id = owner_id and starts_on >= block_start;

  -- Weeks 1-5: five gym days, weekend off. The old block ran Mon-Sat, which is
  -- a sixth session the programme does not ask for.
  insert into public.training_plan (user_id, name, starts_on, ends_on, weekday, activity, duration_mins, notes)
  values
    (owner_id, '12-week programme', block_start, cricket_from - 1, 1, 'gym',  60, 'Legs — strength'),
    (owner_id, '12-week programme', block_start, cricket_from - 1, 2, 'gym',  60, 'Push — chest, shoulders, triceps'),
    (owner_id, '12-week programme', block_start, cricket_from - 1, 3, 'gym',  60, 'Pull + core'),
    (owner_id, '12-week programme', block_start, cricket_from - 1, 4, 'gym',  60, 'Legs + core — hypertrophy'),
    (owner_id, '12-week programme', block_start, cricket_from - 1, 5, 'gym',  60, 'Full body + conditioning'),
    (owner_id, '12-week programme', block_start, cricket_from - 1, 6, 'rest', null, 'Walk'),
    (owner_id, '12-week programme', block_start, cricket_from - 1, 0, 'rest', null, 'Walk');

  -- Weeks 6-12: cricket takes Tue/Thu/Sat, so the gym compresses to three days.
  -- This costs about a third of the weekly leg volume, which is why Monday
  -- picks up an extra split-squat block in `programme.js`.
  insert into public.training_plan (user_id, name, starts_on, ends_on, weekday, activity, duration_mins, notes)
  values
    (owner_id, '12-week programme — cricket blend', cricket_from, block_end, 1, 'gym',     60, 'Legs — strength'),
    (owner_id, '12-week programme — cricket blend', cricket_from, block_end, 2, 'cricket', null, null),
    (owner_id, '12-week programme — cricket blend', cricket_from, block_end, 3, 'gym',     60, 'Push'),
    (owner_id, '12-week programme — cricket blend', cricket_from, block_end, 4, 'cricket', null, null),
    (owner_id, '12-week programme — cricket blend', cricket_from, block_end, 5, 'gym',     60, 'Pull + core'),
    (owner_id, '12-week programme — cricket blend', cricket_from, block_end, 6, 'cricket', null, null),
    (owner_id, '12-week programme — cricket blend', cricket_from, block_end, 0, 'rest',    null, 'Walk');
end $$;
