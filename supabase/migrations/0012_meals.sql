-- 0012_meals.sql
--
-- Meals become the single source of food data.
--
-- `nutrition_logs` already carries protein_g and calories_kcal per day, and
-- keeping those alongside a table of individual meals would mean two copies of
-- the same total, free to drift apart — the same mistake `scores` and a
-- proposed `readiness_logs` would have made. So the daily macros are always
-- derived from `meals`, and `nutrition_logs` keeps only what is not food:
-- supplements and notes.
--
-- The old protein_g / calories_kcal columns are left in place rather than
-- dropped, because they hold whatever was logged before this migration and a
-- backfill would invent meals that were never eaten. Nothing reads them now.
comment on column public.nutrition_logs.protein_g is
  'Superseded by the meals table. Retained only for entries made before migration 0012.';
comment on column public.nutrition_logs.calories_kcal is
  'Superseded by the meals table. Retained only for entries made before migration 0012.';

create table if not exists public.meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  date        date not null,

  description text not null,
  portion     text,

  protein_g   numeric check (protein_g between 0 and 500),
  carbs_g     numeric check (carbs_g between 0 and 1500),
  fat_g       numeric check (fat_g between 0 and 500),
  kcal        numeric check (kcal between 0 and 10000),

  -- Where the numbers came from, so an estimate never looks like a measurement.
  source      text not null default 'catalogue'
              check (source in ('catalogue', 'ai', 'manual', 'repeat', 'supplement')),
  confidence  text check (confidence in ('high', 'medium', 'low')),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists meals_user_date_idx on public.meals (user_id, date desc);
-- Powers "you have eaten this before": the meal history is the food library.
create index if not exists meals_user_desc_idx on public.meals (user_id, lower(description));

do $$
declare
  owner_id constant uuid := 'eb9b4bea-c04f-4906-a5fe-0acc54ffbb46';
  pol record;
begin
  alter table public.meals enable row level security;
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'meals'
  loop
    execute format('drop policy %I on public.meals', pol.policyname);
  end loop;

  execute format(
    'create policy "public reads owner" on public.meals
       for select to anon, authenticated using (user_id = %L)', owner_id);
  execute
    'create policy "own rows" on public.meals
       for all to authenticated
       using (user_id = auth.uid()) with check (user_id = auth.uid())';
end;
$$;

grant select on public.meals to anon;
grant select, insert, update, delete on public.meals to authenticated;
