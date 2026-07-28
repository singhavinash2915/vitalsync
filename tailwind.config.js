import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve content globs against this file rather than process.cwd(), so the
// build produces the same CSS no matter which directory Vite is invoked from.
const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [join(root, 'index.html'), join(root, 'src/**/*.{js,jsx}')],
  theme: {
    extend: {
      colors: {
        // Score bands — shared by rings, badges and charts.
        score: {
          excellent: '#22c55e',
          good: '#eab308',
          moderate: '#f97316',
          poor: '#ef4444',
        },
        // Surface ramp. Dark values are the "real" theme; light mode
        // overrides land via CSS variables in index.css.
        ink: {
          900: '#07090d',
          800: '#0b0f14',
          700: '#111820',
          600: '#18212b',
          500: '#22303d',
        },
        accent: {
          DEFAULT: '#38bdf8',
          soft: '#7dd3fc',
          deep: '#0284c7',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'Inter',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.04), 0 8px 24px -12px rgba(0,0,0,.25)',
        glow: '0 0 32px -8px rgba(56,189,248,.45)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        'fade-in-up': {
          '0%': { opacity: 0, transform: 'translateY(12px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: 0, transform: 'scale(.94)' },
          '100%': { opacity: 1, transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-500px 0' },
          '100%': { backgroundPosition: '500px 0' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in .35s ease-out both',
        'fade-in-up': 'fade-in-up .45s cubic-bezier(.22,1,.36,1) both',
        'scale-in': 'scale-in .3s cubic-bezier(.22,1,.36,1) both',
        shimmer: 'shimmer 1.6s linear infinite',
        'slide-up': 'slide-up .28s cubic-bezier(.22,1,.36,1) both',
      },
    },
  },
  plugins: [],
};
