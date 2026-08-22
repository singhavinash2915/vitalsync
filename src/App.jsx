import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import Layout from './components/Layout';
import { useAuthStore } from './store/useAuthStore';
import { useDataStore } from './store/useDataStore';
import { isSupabaseConfigured } from './lib/supabase';

import SignIn from './pages/SignIn';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import LogHealth from './pages/LogHealth';
import Workouts from './pages/Workouts';
import Sleep from './pages/Sleep';
import Journal from './pages/Journal';
import Trends from './pages/Trends';
import Biomarkers from './pages/Biomarkers';
import Coach from './pages/Coach';
import Insights from './pages/Insights';
import Plan from './pages/Plan';
import Settings from './pages/Settings';
import SetupRequired from './pages/SetupRequired';

function FullScreenLoader({ message = 'Loading VitalSync…' }) {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 size={28} className="animate-spin text-accent" aria-hidden="true" />
        <p className="muted text-xs">{message}</p>
      </div>
    </div>
  );
}

/**
 * Wrapper for every screen.
 *
 * There is no sign-in and nothing to gate on — the app opens straight onto the
 * dashboard. All this still does is hold the frame back until the profile has
 * loaded, so the scoring is not run against a missing calorie target for a
 * frame and then corrected.
 */
function Shell({ children }) {
  const initialising = useAuthStore((s) => s.initialising);
  if (initialising) return <FullScreenLoader message="Opening VitalSync…" />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { init, user, profile } = useAuthStore();
  const loadAll = useDataStore((s) => s.loadAll);
  const loadFullHistory = useDataStore((s) => s.loadFullHistory);
  const reset = useDataStore((s) => s.reset);

  useEffect(() => {
    let cleanup;
    init().then((unsubscribe) => {
      cleanup = unsubscribe;
    });
    return () => cleanup?.();
  }, [init]);

  // Load (and clear) health data as the signed-in user changes.
  useEffect(() => {
    if (user?.id) {
      // The windowed load paints the dashboard; the full history trails it in
      // the background for the findings, which nothing above the fold needs.
      loadAll(user.id).then(() => loadFullHistory(user.id));
    } else {
      reset();
    }
  }, [user?.id, loadAll, loadFullHistory, reset]);

  // Once the data and profile are both present, bring stored scores up to date
  // with the current formula. No-ops unless the algorithm actually changed.
  useEffect(() => {
    if (!user?.id || !profile) return;
    const { rebuildIfScoringChanged } = useDataStore.getState();
    rebuildIfScoringChanged(user.id, profile).then((r) => {
      if (r?.rebuilt) {
        useAuthStore.getState().loadProfile(user);
        console.info(`[VitalSync] Rebuilt ${r.rebuilt} days for the new scoring formula.`);
      }
    });
  }, [user?.id, profile?.scoring_version, profile, user]);

  // Refresh in the background when the app is brought back to the foreground —
  // an iOS Shortcut may have POSTed new Apple Watch data while it was closed.
  useEffect(() => {
    if (!user?.id) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadAll(user.id, { silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [user?.id, loadAll]);

  if (!isSupabaseConfigured) return <SetupRequired />;

  return (
    <Routes>
      {/* Reachable from Settings, never forced. Height, weight and goal sharpen
          the calorie target; nothing breaks while they are unset. */}
      <Route path="/signin" element={<SignIn />} />
      <Route
        path="/welcome"
        element={!profile ? <FullScreenLoader message="Loading your profile…" /> : <Onboarding />}
      />

      <Route path="/" element={<Shell><Dashboard /></Shell>} />
      <Route path="/log" element={<Shell><LogHealth /></Shell>} />
      <Route path="/workouts" element={<Shell><Workouts /></Shell>} />
      <Route path="/sleep" element={<Shell><Sleep /></Shell>} />
      <Route path="/journal" element={<Shell><Journal /></Shell>} />
      <Route path="/trends" element={<Shell><Trends /></Shell>} />
      <Route path="/biology" element={<Shell><Biomarkers /></Shell>} />
      <Route path="/coach" element={<Shell><Coach /></Shell>} />
      <Route path="/insights" element={<Shell><Insights /></Shell>} />
      <Route path="/plan" element={<Shell><Plan /></Shell>} />
      <Route path="/settings" element={<Shell><Settings /></Shell>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
