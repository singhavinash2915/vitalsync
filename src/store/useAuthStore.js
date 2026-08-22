import { create } from 'zustand';
import { supabase, describeError, isSupabaseConfigured, OWNER_ID } from '../lib/supabase';

/**
 * The owner's profile.
 *
 * There is no authentication. This app belongs to one person, runs on their own
 * phone, and opens straight onto the dashboard — so rather than a session, there
 * is a fixed owner id that every query pins itself to, and this store exists
 * only to carry the profile row (age, weight, goal, calorie target) that the
 * scoring needs.
 *
 * The name is kept because two dozen call sites read `user.id` and `profile`
 * from it, and those mean exactly what they meant before.
 */
const OWNER = { id: OWNER_ID };

export const useAuthStore = create((set, get) => ({
  user: OWNER,
  profile: null,
  initialising: true,
  error: null,

  /** Loads the profile. Called once from App on mount. */
  init: async () => {
    if (!isSupabaseConfigured) {
      set({ initialising: false });
      return () => {};
    }
    try {
      await get().loadProfile();
    } finally {
      set({ initialising: false });
    }
    return () => {};
  },

  loadProfile: async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', OWNER_ID)
        .maybeSingle();
      if (error) throw error;

      if (data) {
        set({ profile: data, error: null });
        return data;
      }

      // No row yet — create a stub so the settings form has something to update.
      const { data: created, error: insertError } = await supabase
        .from('users')
        .upsert({ id: OWNER_ID }, { onConflict: 'id' })
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
    const { data, error } = await supabase
      .from('users')
      .upsert({ id: OWNER_ID, ...patch }, { onConflict: 'id' })
      .select()
      .single();

    if (error) return { ok: false, message: describeError(error) };
    set({ profile: data });
    return { ok: true, data };
  },

  /** Onboarding is complete once we know age, weight and a goal. */
  needsOnboarding: () => {
    const { profile } = get();
    if (!profile) return false; // still loading — don't redirect prematurely
    return !profile.age || !profile.weight || !profile.fitness_goal;
  },
}));
