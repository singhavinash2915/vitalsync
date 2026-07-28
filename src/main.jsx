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
registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload();
  },
  onOfflineReady() {
    console.info('[VitalSync] Ready to work offline.');
  },
});
