import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * True when both env vars are present. The UI uses this to show a setup
 * screen instead of throwing an opaque network error on every query.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    '[VitalSync] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local and restart the dev server.'
  );
}

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'vitalsync-auth',
    },
  }
);

/** Base URL for Edge Functions, e.g. `.../functions/v1/health-sync`. */
export const functionsBaseUrl = url ? `${url}/functions/v1` : '';

/**
 * Normalises the many shapes a Supabase/network failure can take into a
 * single readable string. Every query in the app funnels errors through
 * here so the UI never renders `[object Object]`.
 */
export function describeError(error, fallback = 'Something went wrong.') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;

  const message = error.message || error.error_description || error.error || '';

  if (!navigator.onLine) {
    return 'You appear to be offline. Changes will need to be re-sent when you reconnect.';
  }
  if (/Failed to fetch|NetworkError|fetch failed/i.test(message)) {
    return 'Could not reach Supabase. Check your connection and VITE_SUPABASE_URL.';
  }
  if (error.code === '23505' || /duplicate key/i.test(message)) {
    return 'An entry for that date already exists — it has been updated instead.';
  }
  if (error.code === '42501' || /row-level security/i.test(message)) {
    return 'Permission denied by row-level security. Make sure you are signed in.';
  }
  if (error.code === '42P01' || /relation .* does not exist/i.test(message)) {
    return 'Database tables are missing. Run supabase/migrations/0001_init.sql in the SQL editor.';
  }
  if (error.code === 'PGRST102' || /All object keys must match/i.test(message)) {
    return 'The rows being sent had mismatched fields, so the database rejected the batch. This is a bug — please report it.';
  }
  if (error.code === 'PGRST204' || /Could not find the .* column/i.test(message)) {
    return 'Your database is missing a column this build expects. Apply the latest migrations in supabase/migrations.';
  }
  if (error.code === '42P10' || /no unique or exclusion constraint matching/i.test(message)) {
    return 'The database is missing an index this import needs. Apply the latest migrations in supabase/migrations, then try again.';
  }
  if (error.code === '42703' || /column .* does not exist/i.test(message)) {
    return 'Your database schema is out of date — apply the latest migrations in supabase/migrations.';
  }
  if (error.code === '23514' || /violates check constraint/i.test(message)) {
    return 'One of those values is outside the allowed range and was rejected by the database.';
  }
  if (/Invalid login credentials/i.test(message)) {
    return 'Incorrect email or password.';
  }
  if (/Email not confirmed/i.test(message)) {
    return 'Check your inbox and confirm your email address before signing in.';
  }
  return message || fallback;
}
