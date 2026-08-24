-- 0011_body_strength_nutrition.sql
--
-- Body composition, strength logging, protein, and the subjective inputs that
-- an ACL makes necessary.
--
-- Three new tables rather than the six originally sketched, because three of
-- those would have duplicated something already here:
--
--   * a `readiness_logs` table would sit alongside `scores`, which already
--     stores a readiness value per day and is rebuilt from source whenever the
--     formula changes. Two copies of a score is exactly the drift the
--     scoring_version machinery exists to prevent, so soreness and knee
--     comfort go into `journal_logs` beside the other subjective inputs.
--   * `workout_sessions` would duplicate `workout_logs`, which already fills
--     itself from Apple Health — the app knows when you lifted, it only lacks
--     what. `strength_sets` hangs off that row.
--   * `supplement_logs` is two booleans on a day already keyed by date.

-- ---------------------------------------------------------------------------
-- Body composition — one row per InBody scan
-- ---------------------------------------------------------------------------
create table if not exists public.body_composition (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  date              date not null,
  source            text not null default 'inbody',

  weight_kg         numeric check (weight_kg between 20 and 400),
  body_fat_pct      numeric check (body_fat_pct between 1 and 80),
  body_fat_mass_kg  numeric check (body_fat_mass_kg between 0 and 200),
  skeletal_muscle_kg numeric check (skeletal_muscle_kg between 5 and 100),
  fat_free_mass_kg  numeric check (fat_free_mass_kg between 10 and 200),
  bmi               numeric check (bmi between 8 and 90),

  total_body_water_l numeric check (total_body_water_l between 5 and 120),
  protein_kg        numeric check (protein_kg between 1 and 50),
  mineral_kg        numeric check (mineral_kg between 0.5 and 20),

  visceral_fat_level integer check (visceral_fat_level between 1 and 30),
  waist_hip_ratio   numeric check (waist_hip_ratio between 0.4 and 2),
  bmr_kcal          integer check (bmr_kcal between 500 and 5000),
  smi               numeric check (smi between 2 and 20),
  inbody_score      integer check (inbody_score between 0 and 150),
  target_weight_kg  numeric check (target_weight_kg between 20 and 400),

  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists body_composition_user_date_idx
  on public.body_composition (user_id, date desc);

-- ---------------------------------------------------------------------------
-- Strength sets — what was actually lifted, against an existing session
-- ---------------------------------------------------------------------------
create table if not exists public.strength_sets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  date        date not null,
  -- Null when nothing synced from the watch that day and the set was logged
  -- on its own; set null rather than cascade so deleting a synced workout
  -- never silently destroys the record of what was lifted.
  workout_id  uuid references public.workout_logs (id) on delete set null,

  exercise    text not null,
  set_index   integer not null default 1 check (set_index between 1 and 50),
  reps        integer check (reps between 1 and 200),
  weight_kg   numeric check (weight_kg between 0 and 500),
  rpe         numeric check (rpe between 1 and 10),
  is_warmup   boolean not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists strength_sets_user_date_idx
  on public.strength_sets (user_id, date desc);
create index if not exists strength_sets_exercise_idx
  on public.strength_sets (user_id, exercise, date desc);

-- ---------------------------------------------------------------------------
-- Nutrition — one row per day, supplements included
-- ---------------------------------------------------------------------------
create table if not exists public.nutrition_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  date           date not null,
  protein_g      integer check (protein_g between 0 and 600),
  calories_kcal  integer check (calories_kcal between 0 and 12000),
  whey_scoops    numeric check (whey_scoops between 0 and 20),
  creatine_taken boolean,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists nutrition_logs_user_date_idx
  on public.nutrition_logs (user_id, date desc);

-- ---------------------------------------------------------------------------
-- Subjective inputs. NOT score inputs — see the note in src/lib/limits.js.
-- ---------------------------------------------------------------------------
alter table public.journal_logs
  add column if not exists soreness integer check (soreness between 1 and 5),
  add column if not exists knee_comfort integer check (knee_comfort between 1 and 5);

-- `calorie_target` on this table is the ACTIVE-CALORIE BURN target used by
-- calcExertionScore. It is not a dietary figure, which is why protein gets its
-- own column rather than borrowing it.
alter table public.users
  add column if not exists protein_target_g integer check (protein_target_g between 0 and 600),
  add column if not exists goal_weight_kg numeric check (goal_weight_kg between 20 and 400),
  add column if not exists training_limits text[];

-- ---------------------------------------------------------------------------
-- Same access model as 0010: the world may read the owner's rows, only a
-- signed-in user may write, and only its own.
-- ---------------------------------------------------------------------------
do $$
declare
  owner_id constant uuid := 'eb9b4bea-c04f-4906-a5fe-0acc54ffbb46';
  t text;
  pol record;
begin
  foreach t in array array['body_composition', 'strength_sets', 'nutrition_logs']
  loop
    execute format('alter table public.%I enable row level security', t);

    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    execute format(
      'create policy "public reads owner" on public.%I
         for select to anon, authenticated using (user_id = %L)', t, owner_id);
    execute format(
      'create policy "own rows" on public.%I
         for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end;
$$;

grant select on public.body_composition, public.strength_sets, public.nutrition_logs to anon;
grant select, insert, update, delete
  on public.body_composition, public.strength_sets, public.nutrition_logs to authenticated;
