-- 0009_public_access.sql
--
-- Removes authentication from VitalSync.
--
-- Every policy so far pinned rows to auth.uid(), which requires a signed-in
-- session. The app no longer has one: it opens straight onto the dashboard and
-- talks to PostgREST as the anonymous role, so those policies would reject
-- every read and every write.
--
-- This replaces them with policies granting `anon` full access to exactly one
-- account's rows. Scoping to a single id is deliberate. It is not much of a
-- security control — that id ships inside the JavaScript bundle — but it does
-- mean adding a second account later will not silently expose it too.
--
-- WHAT THIS MEANS, PLAINLY: after applying this, anyone holding the project URL
-- and the anon key — both readable in the deployed bundle — can read, modify and
-- DELETE this account's entire health history. There is no undo and no backup.
-- This is a deliberate choice by the owner of this data. Do not apply it to a
-- database holding anybody else's.
--
-- To reverse: re-run the auth.uid() policies from 0001_init.sql (and the
-- per-table ones in 0002, 0006 and 0008), then revoke the grants at the bottom.

do $$
declare
  owner_id constant uuid := 'eb9b4bea-c04f-4906-a5fe-0acc54ffbb46';
  tables constant text[] := array[
    'health_logs', 'sleep_logs', 'workout_logs', 'journal_logs',
    'scores', 'health_snapshots', 'training_plan', 'sync_keys'
  ];
  t text;
  pol record;
begin
  -- Migrations 0002, 0006 and 0008 each named their policies differently
  -- ("sync keys select own", "snapshots insert own", "plan delete own"...), so
  -- clear whatever is actually there rather than guessing at the names.
  foreach t in array tables || array['users']
  loop
    for pol in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;

  -- The profile row is keyed by id, not user_id.
  execute format(
    'create policy "public owner row" on public.users
       for all to anon, authenticated
       using (id = %L) with check (id = %L)', owner_id, owner_id);

  foreach t in array tables
  loop
    execute format(
      'create policy "public owner rows" on public.%I
         for all to anon, authenticated
         using (user_id = %L) with check (user_id = %L)', t, owner_id, owner_id);
  end loop;
end;
$$;

-- Policies decide which rows are visible; grants decide whether the role may
-- touch the table at all. PostgREST returns a permission error without both.
grant usage on schema public to anon;
grant select, insert, update, delete on all tables in schema public to anon;
grant usage, select on all sequences in schema public to anon;
