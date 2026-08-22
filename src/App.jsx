import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import Layout from './components/Layout';
import { useAuthStore } from './store/useAuthStore';
import { useDataStore } from './store/useDataStore';
import { isSupabaseConfigured } from './lib/supabase';

import Unlock from './pages/Unlock';
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
 * Gate for every screen.
 *
 * There is no sign-up, no account switching and no onboarding wall — this is a
 * single-user app, so the only question is whether this device already holds a
 * session. It nearly always does, and the unlock screen is a once-per-device
 * event rather than something seen on launch.
 */
function Protected({ children }) {
  const { user, initialising } = useAuthStore();
  const location = useLocation();

  // Restoring a session is a local read plus a token refresh; showing the
  // unlock screen during it would make a signed-in user think they had been
  // signed out.
  if (initialising) return <FullScreenLoader message="Opening VitalSync…" />;
  if (!user) return <Navigate to="/unlock" replace state={{ from: location }} />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { init, user, profile } = useAuthStore();
  const loadAll = useDataStore((s) => s.loadAll);
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
      loadAll(user.id);
    } else {
      reset();
    }
  }, [user?.id, loadAll, reset]);

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
      <Route path="/unlock" element={user ? <Navigate to="/" replace /> : <Unlock />} />
      {/* Reachable from Settings, never forced. Height, weight and goal sharpen
          the calorie target; nothing breaks while they are unset. */}
      <Route
        path="/welcome"
        element={
          !user ? (
            <Navigate to="/unlock" replace />
          ) : !profile ? (
            <FullScreenLoader message="Loading your profile…" />
          ) : (
            <Onboarding />
          )
        }
      />

      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/log" element={<Protected><LogHealth /></Protected>} />
      <Route path="/workouts" element={<Protected><Workouts /></Protected>} />
      <Route path="/sleep" element={<Protected><Sleep /></Protected>} />
      <Route path="/journal" element={<Protected><Journal /></Protected>} />
      <Route path="/trends" element={<Protected><Trends /></Protected>} />
      <Route path="/biology" element={<Protected><Biomarkers /></Protected>} />
      <Route path="/coach" element={<Protected><Coach /></Protected>} />
      <Route path="/insights" element={<Protected><Insights /></Protected>} />
      <Route path="/plan" element={<Protected><Plan /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
