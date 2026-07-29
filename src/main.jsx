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
