-- 0010_public_read_private_write.sql
--
-- Splits reading from writing, and makes room for other people.
--
-- 0009 gave the anonymous role full access to one account so the app could work
-- without a sign-in. That also meant anyone holding the URL could delete seven
-- years of health history, on a plan with no backups and no point-in-time
-- recovery — permanently, and with no way for the database to tell the owner
-- from a stranger.
--
-- The fix is not to close the app but to narrow what an anonymous visitor may
-- do. Reading stays completely open: no account, no password, the dashboard
-- still loads for anybody. Writing now requires a session.
--
-- The second policy is what makes this more than a personal app. "You own the
-- rows where user_id = auth.uid()" is the same sentence for everyone, so a new
-- account gets its own private data. The owner's rows stay publicly readable
-- because the anon policy names that id specifically; nobody else's are,
-- because it names only that id.

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
  foreach t in array tables || array['users']
  loop
    for pol in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;

  -- The profile row is keyed by id rather than user_id.
  execute format(
    'create policy "public reads owner" on public.users
       for select to anon, authenticated using (id = %L)', owner_id);
  execute
    'create policy "own row" on public.users
       for all to authenticated
       using (id = auth.uid()) with check (id = auth.uid())';

  foreach t in array tables
  loop
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

-- Policies alone are not enough: a role also needs the table grant, and 0009
-- handed anon all four verbs. Take the destructive three back. Postgres has no
-- "revoke everything except select", so revoke all and re-grant select.
revoke all on all tables in schema public from anon;
grant usage on schema public to anon;
grant select on all tables in schema public to anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- sync_keys is the one exception worth stating: its plaintext keys are never
-- stored, only SHA-256 hashes, so a public read exposes nothing usable. The
-- health-sync function looks them up with the service role regardless.
