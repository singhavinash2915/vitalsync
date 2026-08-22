import { create } from 'zustand';
import { supabase, describeError, isSupabaseConfigured, OWNER_ID } from '../lib/supabase';

/**
 * Who is looking, and whether they may change anything.
 *
 * The app is readable by anyone with the URL and writable only with a session,
 * which is the whole access model in one sentence. Two ideas do the work:
 *
 *   `user.id` is the *effective* account — the signed-in user when there is
 *   one, and the public owner otherwise. Every screen and every query already
 *   reads `user.id`, so they keep working untouched: signed out they load the
 *   owner's data, signed in they load yours.
 *
 *   `canEdit` is simply whether a session exists. The data store refuses every
 *   mutation without it, so a read-only visitor cannot write even if a button
 *   somehow reaches a save path.
 *
 * Sessions persist and refresh themselves, so signing in is a once-per-device
 * event rather than something seen on launch.
 */
export const useAuthStore = create((set, get) => ({
  session: null,
  profile: null,
  initialising: true,
  error: null,

  /** The account whose data is on screen: yours if signed in, else the owner's. */
  user: { id: OWNER_ID },
  canEdit: false,
  isOwner: true,

  /** Wires up the auth listener. Called once from App on mount. */
  init: async () => {
    if (!isSupabaseConfigured) {
      set({ initialising: false });
      return () => {};
    }

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      get().applySession(data.session);
      await get().loadProfile();
    } catch (error) {
      set({ error: describeError(error, 'Could not restore your session.') });
    } finally {
      set({ initialising: false });
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const before = get().user.id;
      get().applySession(session);
      // Only refetch when the effective account actually changed — a token
      // refresh fires this listener too, and reloading everything hourly for
      // no reason is worse than useless on a phone.
      if (get().user.id !== before) await get().loadProfile();
    });

    return () => subscription.unsubscribe();
  },

  applySession: (session) => {
    const id = session?.user?.id ?? OWNER_ID;
    set({
      session: session ?? null,
      user: { id, email: session?.user?.email ?? null },
      canEdit: Boolean(session),
      isOwner: id === OWNER_ID,
    });
  },

  loadProfile: async () => {
    const { user, canEdit } = get();
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;

      if (data) {
        set({ profile: data, error: null });
        return data;
      }

      // A signed-out visitor cannot create anything, and should not see an
      // error because the owner's profile row happens to be missing.
      if (!canEdit) {
        set({ profile: null });
        return null;
      }

      // First sign-in for a new account — create a stub so onboarding and the
      // settings form have a row to update.
      const { data: created, error: insertError } = await supabase
        .from('users')
        .upsert({ id: user.id, email: user.email }, { onConflict: 'id' })
        .select()
        .single();
      if (insertError) throw insertError;

      set({ profile: created, error: null });
      return created;
    } catch (error) {
      set({ error: describeError(error, 'Could not load your profile.') });
      return null;
    }
  },

  updateProfile: async (patch) => {
    const { user, canEdit } = get();
    if (!canEdit) return { ok: false, message: 'Sign in to change your profile.' };

    const { data, error } = await supabase
      .from('users')
      .upsert({ id: user.id, email: user.email, ...patch }, { onConflict: 'id' })
      .select()
      .single();

    if (error) return { ok: false, message: describeError(error) };
    set({ profile: data });
    return { ok: true, data };
  },

  signIn: async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, message: describeError(error) };
    return { ok: true };
  },

  signUp: async ({ email, password, name }) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name?.trim() ?? '' } },
    });
    if (error) return { ok: false, message: describeError(error) };

    // Supabase returns a session immediately only when email confirmation is off.
    if (!data.session) {
      return {
        ok: true,
        needsConfirmation: true,
        message: 'Account created. Confirm your email, then sign in.',
      };
    }
    return { ok: true };
  },

  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + import.meta.env.BASE_URL,
    });
    if (error) return { ok: false, message: describeError(error) };
    return { ok: true, message: 'Password reset link sent — check your email.' };
  },

  /** Signing out drops back to the public, read-only view of the owner. */
  signOut: async () => {
    await supabase.auth.signOut();
    get().applySession(null);
    set({ profile: null });
    await get().loadProfile();
  },

  /** Onboarding is complete once we know age, weight and a goal. */
  needsOnboarding: () => {
    const { profile, canEdit } = get();
    if (!canEdit || !profile) return false;
    return !profile.age || !profile.weight || !profile.fitness_goal;
  },
}));
