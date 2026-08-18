import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

// Vite rewrites BASE_URL to the `base` in vite.config.js ('/vitalsync/'),
// which is exactly what React Router needs as its basename.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter basename={basename || '/'}>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);

/**
 * The Supabase session lives in localStorage, and iOS clears that for sites
 * not opened for about a week — which is precisely why a personal app you
 * check every few days keeps asking you to sign in again. Requesting
 * persistent storage exempts us from that eviction. Installed PWAs are granted
 * it silently; in a browser tab it may be refused, which is harmless.
 */
if (navigator.storage?.persist) {
  navigator.storage.persisted().then((already) => {
    if (!already) navigator.storage.persist().catch(() => {});
  });
}

// autoUpdate: a new deploy activates on the next navigation. Reloading here
// keeps a long-lived standalone PWA session from running stale code for days.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload();
  },
  onOfflineReady() {
    console.info('[VitalSync] Ready to work offline.');
  },
});

// An installed PWA is rarely reloaded, so it can sit on a cached build for
// days. Re-check whenever it comes back to the foreground.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') updateSW?.(true).catch(() => {});
});
