import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';

import { useAuthStore } from '../store/useAuthStore';

/**
 * The one explanation of why a control is inert.
 *
 * Signed-out visitors can read everything, so hiding the edit controls would
 * make the app look broken rather than open. They stay visible and disabled,
 * with this underneath saying why and where to go — one sentence, in one place,
 * instead of a different apology on each screen.
 */
export default function EditGate({ className = '', children }) {
  const canEdit = useAuthStore((s) => s.canEdit);
  if (canEdit) return children ?? null;

  return (
    <p
      className={`flex items-start gap-2 rounded-xl px-2.5 py-2 text-[11px] leading-relaxed ${className}`}
      style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
    >
      <Lock size={13} className="mt-px shrink-0" aria-hidden="true" />
      <span>
        This is the public, read-only view.{' '}
        <Link to="/signin" className="font-semibold underline">
          Sign in
        </Link>{' '}
        to change anything, or to keep your own data here.
      </span>
    </p>
  );
}

/** True when the current visitor may write. Convenience for disabling controls. */
export const useCanEdit = () => useAuthStore((s) => s.canEdit);
