import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Telescope, ChevronRight } from 'lucide-react';

import { discoverFindings } from '../lib/discover';
import { Card, CardBody } from './ui';

/**
 * Dashboard doorway into the findings mined from the full history.
 *
 * The Insights card directly above this one reads today; this one reads the
 * years behind it, so it leads with the single finding most likely to change
 * what he does rather than repeating the morning's numbers back at him.
 */
export default function DiscoveredFindingsCard({ health = [], sleep = [] }) {
  const findings = useMemo(() => discoverFindings({ health, sleep }), [health, sleep]);
  if (findings.length < 2) return null;

  // The first is always today's status, which the dashboard has already said.
  const lead = findings.find((f) => !f.statusOnly) ?? findings[0];

  return (
    <Link to="/insights" className="block">
      <Card delay={140}>
        <CardBody className="flex items-start gap-3 p-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15">
            <Telescope size={16} className="text-accent" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{lead.title}</p>
            <p className="muted mt-0.5 text-[11px] leading-relaxed">{lead.headline}</p>
            <p className="mt-1.5 text-[10px] font-medium text-accent">
              {findings.length} findings from {health.length.toLocaleString()} days of your own data
            </p>
          </div>
          <ChevronRight size={16} className="muted mt-1 shrink-0" />
        </CardBody>
      </Card>
    </Link>
  );
}
