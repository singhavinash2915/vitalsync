import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Scale, ChevronRight } from 'lucide-react';

import { useDataStore } from '../store/useDataStore';
import { useAuthStore } from '../store/useAuthStore';
import { bodySummary } from '../lib/body';
import { Card, CardBody } from './ui';

const TONE = { good: '#22c55e', bad: '#ef4444', info: '#38bdf8' };

/** Dashboard doorway into body composition. Silent until there is a scan. */
export default function BodyCard() {
  const scans = useDataStore((s) => s.bodyComposition);
  const profile = useAuthStore((s) => s.profile);

  const summary = useMemo(
    () => bodySummary(scans, profile?.goal_weight_kg),
    [scans, profile]
  );
  if (!summary) return null;

  const color = TONE[summary.tone] ?? TONE.info;

  return (
    <Link to="/body" className="block">
      <Card delay={130}>
        <CardBody className="flex items-start gap-3 p-4">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{ background: `${color}1a`, color }}
          >
            <Scale size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{summary.headline}</p>
            <p className="muted mt-0.5 line-clamp-2 text-[11px] leading-relaxed">{summary.detail}</p>
            {summary.goal?.toGo > 0 ? (
              <p className="mt-1.5 text-[10px] font-medium" style={{ color }}>
                {summary.goal.toGo} kg to {summary.goal.goal} kg
              </p>
            ) : null}
          </div>
          <ChevronRight size={16} className="muted mt-1 shrink-0" />
        </CardBody>
      </Card>
    </Link>
  );
}
