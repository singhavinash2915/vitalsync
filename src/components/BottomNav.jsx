import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { Home, Sparkles, Dumbbell, Moon, LineChart, HeartPulse } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/coach', label: 'Coach', icon: Sparkles },
  { to: '/workouts', label: 'Workouts', icon: Dumbbell },
  { to: '/sleep', label: 'Sleep', icon: Moon },
  { to: '/trends', label: 'Trends', icon: LineChart },
  { to: '/biology', label: 'Biology', icon: HeartPulse },
];

/** Mobile-first bottom tab bar; becomes a left rail from `md` up. */
export default function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className={clsx(
        'safe-bottom fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-xl',
        'md:inset-y-0 md:right-auto md:left-0 md:w-20 md:flex-col md:border-r md:border-t-0 md:pt-6'
      )}
      style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--bg-elevated) 88%, transparent)' }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1 md:h-full md:flex-col md:justify-start md:gap-2 md:px-2">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1 md:flex-none">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[9px] font-medium transition-all',
                  'active:scale-95',
                  isActive ? 'text-accent' : 'muted hover:text-[color:var(--text)]'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={clsx(
                      'rounded-lg px-2.5 py-1 transition-all',
                      isActive ? 'bg-accent/15' : 'bg-transparent'
                    )}
                  >
                    <Icon size={19} strokeWidth={isActive ? 2.4 : 1.9} aria-hidden="true" />
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
