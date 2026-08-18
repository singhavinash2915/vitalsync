import { Link, useLocation } from 'react-router-dom';
import { Activity, Moon, Sun, Settings as SettingsIcon, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import BottomNav from './BottomNav';
import { useTheme } from '../context/ThemeContext';
import { Alert } from './ui';
import { useDataStore } from '../store/useDataStore';

const TITLES = {
  '/': 'VitalSync',
  '/workouts': 'Workouts',
  '/sleep': 'Sleep',
  '/journal': 'Journal',
  '/trends': 'Trends',
  '/biology': 'Biology',
  '/log': 'Log health data',
  '/settings': 'Settings',
};

function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const { isDark, toggle } = useTheme();
  const online = useOnlineStatus();
  const error = useDataStore((s) => s.error);
  const setError = () => useDataStore.setState({ error: null });

  return (
    <div className="min-h-full md:pl-20">
      <header
        className="safe-top sticky top-0 z-30 border-b backdrop-blur-xl"
        style={{
          borderColor: 'var(--border)',
          background: 'color-mix(in srgb, var(--bg) 85%, transparent)',
        }}
      >
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 pb-3 pt-1 md:max-w-3xl">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent/15">
              <Activity size={17} className="text-accent" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold tracking-tight">
              {TITLES[pathname] ?? 'VitalSync'}
            </span>
          </Link>

          <div className="flex items-center gap-1">
            {!online ? (
              <span className="flex items-center gap-1 rounded-full bg-score-moderate/15 px-2 py-1 text-[10px] font-semibold text-score-moderate">
                <WifiOff size={11} aria-hidden="true" /> Offline
              </span>
            ) : null}
            <button
              onClick={toggle}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="grid h-9 w-9 place-items-center rounded-xl transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            >
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <Link
              to="/settings"
              aria-label="Settings"
              className="grid h-9 w-9 place-items-center rounded-xl transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            >
              <SettingsIcon size={17} />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-28 pt-4 md:max-w-3xl md:pb-10">
        {error ? (
          <Alert tone="error" className="mb-4" onDismiss={setError}>
            {error}
          </Alert>
        ) : null}
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
