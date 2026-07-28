import { create } from 'zustand';
import { supabase, describeError, isSupabaseConfigured } from '../lib/supabase';

/**
 * Auth + user profile.
 *
 * The `users` table row is created lazily on first sign-in (the DB trigger in
 * the migration handles it too, but doing it here keeps the app working even
 * if the trigger was never installed).
 */
export const useAuthStore = create((set, get) => ({
  session: null,
  user: null,
  profile: null,
  initialising: true,
  error: null,

  /** Wires up the auth listener. Called once from App on mount. */
  init: async () => {
    if (!isSupabaseConfigured) {
      set({ initialising: false });
      return () => {};
    }

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      set({ session: data.session, user: data.session?.user ?? null });
      if (data.session?.user) await get().loadProfile(data.session.user);
    } catch (error) {
      set({ error: describeError(error, 'Could not restore your session.') });
    } finally {
      set({ initialising: false });
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      set({ session, user: session?.user ?? null });
      if (session?.user) {
        await get().loadProfile(session.user);
      } else {
        set({ profile: null });
      }
    });

    return () => subscription.unsubscribe();
  },

  loadProfile: async (user) => {
    const authUser = user ?? get().user;
    if (!authUser) return null;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();
      if (error) throw error;

      if (data) {
        set({ profile: data, error: null });
        return data;
      }

      // No row yet — create a stub so onboarding has something to update.
      const stub = {
        id: authUser.id,
        email: authUser.email,
        name: authUser.user_metadata?.name ?? '',
      };
      const { data: created, error: insertError } = await supabase
        .from('users')
        .upsert(stub, { onConflict: 'id' })
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

  signUp: async ({ email, password, name }) => {
    set({ error: null });
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name?.trim() ?? '' } },
    });
    if (error) return { ok: false, message: describeError(error) };

    // Supabase returns a session immediately when email confirmation is off.
    if (!data.session) {
      return {
        ok: true,
        needsConfirmation: true,
        message: 'Account created. Check your inbox to confirm your email, then sign in.',
      };
    }
    return { ok: true };
  },

  signIn: async ({ email, password }) => {
    set({ error: null });
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, message: describeError(error) };
    return { ok: true };
  },

  sendMagicLink: async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    });
    if (error) return { ok: false, message: describeError(error) };
    return { ok: true, message: 'Magic link sent — check your email.' };
  },

  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + import.meta.env.BASE_URL,
    });
    if (error) return { ok: false, message: describeError(error) };
    return { ok: true, message: 'Password reset link sent.' };
  },

  updateProfile: async (patch) => {
    const { user } = get();
    if (!user) return { ok: false, message: 'Not signed in.' };

    const { data, error } = await supabase
      .from('users')
      .upsert({ id: user.id, email: user.email, ...patch }, { onConflict: 'id' })
      .select()
      .single();

    if (error) return { ok: false, message: describeError(error) };
    set({ profile: data });
    return { ok: true, data };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null });
  },

  /** Onboarding is complete once we know age, weight and a goal. */
  needsOnboarding: () => {
    const { profile } = get();
    if (!profile) return false; // still loading — don't redirect prematurely
    return !profile.age || !profile.weight || !profile.fitness_goal;
  },
}));
