import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import Layout from './components/Layout';
import { useAuthStore } from './store/useAuthStore';
import { useDataStore } from './store/useDataStore';
import { isSupabaseConfigured } from './lib/supabase';

import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import LogHealth from './pages/LogHealth';
import Workouts from './pages/Workouts';
import Sleep from './pages/Sleep';
import Journal from './pages/Journal';
import Trends from './pages/Trends';
import Biomarkers from './pages/Biomarkers';
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

/** Gate for every authenticated screen; also forces onboarding to complete. */
function Protected({ children }) {
  const { user, profile, initialising } = useAuthStore();
  const location = useLocation();

  // Restoring a session is a local read plus a token refresh; showing the
  // login screen during it would make a signed-in user think they had been
  // signed out.
  if (initialising) return <FullScreenLoader message="Restoring your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (profile && useAuthStore.getState().needsOnboarding() && location.pathname !== '/welcome') {
    return <Navigate to="/welcome" replace />;
  }
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
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/welcome"
        element={
          !user ? (
            <Navigate to="/login" replace />
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
      <Route path="/settings" element={<Protected><Settings /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
