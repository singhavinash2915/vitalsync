import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

const STORAGE_KEY = 'vitalsync-theme';
const ThemeContext = createContext({ theme: 'dark', toggle: () => {}, setTheme: () => {} });

const readInitial = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* private browsing */
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readInitial);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }

    // Keep the installed-app status bar in sync with the active theme.
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    const color = theme === 'dark' ? '#0b0f14' : '#f6f7f9';
    if (meta) {
      meta.setAttribute('content', color);
    } else {
      const el = document.createElement('meta');
      el.name = 'theme-color';
      el.content = color;
      document.head.appendChild(el);
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const value = useMemo(() => ({ theme, setTheme, toggle, isDark: theme === 'dark' }), [theme, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
