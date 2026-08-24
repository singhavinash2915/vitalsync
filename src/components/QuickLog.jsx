import { Link } from 'react-router-dom';
import { Scale, Dumbbell, Beef, HeartPulse } from 'lucide-react';

import { Card, CardBody } from './ui';

/**
 * The four things worth logging, one tap from the dashboard.
 *
 * These pages are not in the bottom navigation on purpose — six tabs is
 * already the practical limit on a phone, and a seventh makes every one of
 * them harder to hit. They live here instead, at the top of the screen the app
 * actually opens on.
 */
const ACTIONS = [
  { to: '/nutrition', label: 'Protein', icon: Beef, color: 'var(--status-moderate)' },
  { to: '/strength', label: 'Lifts', icon: Dumbbell, color: 'var(--viz-2)' },
  { to: '/body', label: 'Body scan', icon: Scale, color: 'var(--viz-1)' },
  { to: '/log', label: 'Vitals', icon: HeartPulse, color: 'var(--status-excellent)' },
];

export default function QuickLog() {
  return (
    <Card delay={10}>
      <CardBody className="grid grid-cols-4 gap-1 p-2">
        {ACTIONS.map(({ to, label, icon: Icon, color }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 transition-colors active:scale-95"
          >
            <span
              className="grid h-9 w-9 place-items-center rounded-xl"
              style={{ background: `${color}1a`, color }}
            >
              <Icon size={17} aria-hidden="true" />
            </span>
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}
