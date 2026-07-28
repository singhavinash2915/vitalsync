import { forwardRef, useEffect } from 'react';
import clsx from 'clsx';
import { X, Loader2, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

/**
 * Small headless-ish component kit in the shadcn/ui spirit: unstyled-by-default
 * primitives composed with Tailwind, owned in-repo so they can be edited freely.
 */

// --- Card -------------------------------------------------------------------

export function Card({ className, children, delay = 0, as: Tag = 'div', ...props }) {
  return (
    <Tag
      className={clsx('surface rounded-xl2 shadow-card animate-fade-in-up', className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, icon: Icon, action, className }) {
  return (
    <div className={clsx('flex items-start justify-between gap-3 p-4 pb-2', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon ? <Icon size={16} className="shrink-0 text-accent" aria-hidden="true" /> : null}
          <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
        </div>
        {subtitle ? <p className="muted mt-0.5 text-xs">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export const CardBody = ({ className, children }) => (
  <div className={clsx('p-4 pt-2', className)}>{children}</div>
);

// --- Button -----------------------------------------------------------------

const VARIANTS = {
  primary:
    'bg-accent text-ink-900 hover:bg-accent-soft active:scale-[.98] disabled:bg-accent/40 font-semibold',
  secondary:
    'surface hover:border-accent/60 active:scale-[.98] disabled:opacity-50 font-medium',
  ghost: 'hover:bg-black/5 dark:hover:bg-white/5 active:scale-[.98] font-medium',
  danger: 'bg-score-poor text-white hover:bg-red-600 active:scale-[.98] font-semibold',
  success: 'bg-score-excellent text-ink-900 hover:bg-green-400 active:scale-[.98] font-semibold',
};

const SIZES = {
  sm: 'h-9 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-11 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-5 text-base rounded-xl gap-2',
  icon: 'h-10 w-10 rounded-xl justify-center',
};

export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    className,
    children,
    loading = false,
    disabled,
    icon: Icon,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center whitespace-nowrap transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        'focus-visible:ring-offset-[color:var(--bg)] disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      ) : Icon ? (
        <Icon size={16} aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
});

// --- Form controls ----------------------------------------------------------

const fieldClasses =
  'w-full rounded-xl border bg-[color:var(--bg-sunken)] px-3 py-2.5 text-sm outline-none ' +
  'transition-colors placeholder:text-[color:var(--text-muted)] ' +
  'focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-60';

export function Field({ label, hint, error, required, children, className }) {
  return (
    <label className={clsx('block', className)}>
      {label ? (
        <span className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium">
            {label}
            {required ? <span className="ml-0.5 text-score-poor">*</span> : null}
          </span>
          {hint ? <span className="muted text-[11px]">{hint}</span> : null}
        </span>
      ) : null}
      {children}
      {error ? <span className="mt-1 block text-[11px] text-score-poor">{error}</span> : null}
    </label>
  );
}

export const Input = forwardRef(function Input({ className, unit, ...props }, ref) {
  if (unit) {
    return (
      <div className="relative">
        <input
          ref={ref}
          className={clsx(fieldClasses, 'pr-12', className)}
          style={{ borderColor: 'var(--border)' }}
          {...props}
        />
        <span className="muted pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs">
          {unit}
        </span>
      </div>
    );
  }
  return (
    <input
      ref={ref}
      className={clsx(fieldClasses, className)}
      style={{ borderColor: 'var(--border)' }}
      {...props}
    />
  );
});

export const TextArea = forwardRef(function TextArea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={3}
      className={clsx(fieldClasses, 'resize-y', className)}
      style={{ borderColor: 'var(--border)' }}
      {...props}
    />
  );
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={clsx(fieldClasses, 'appearance-none pr-8', className)}
      style={{
        borderColor: 'var(--border)',
        backgroundImage:
          "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%238494a6' stroke-width='2'%3e%3cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3e%3c/svg%3e\")",
        backgroundPosition: 'right 0.6rem center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '1.1em 1.1em',
      }}
      {...props}
    >
      {children}
    </select>
  );
});

/** Big tappable on/off pill — the journal is built out of these. */
export function Toggle({ checked, onChange, label, description, icon: Icon, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all active:scale-[.99]',
        checked
          ? 'border-accent/70 bg-accent/10'
          : 'border-[color:var(--border)] bg-[color:var(--bg-sunken)]'
      )}
    >
      {Icon ? (
        <Icon
          size={18}
          className={clsx('shrink-0', checked ? 'text-accent' : 'muted')}
          aria-hidden="true"
        />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {description ? <span className="muted block text-xs">{description}</span> : null}
      </span>
      <span
        className={clsx(
          'relative h-6 w-10 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-[color:var(--track)]'
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5'
          )}
        />
      </span>
    </button>
  );
}

/** 1-5 / 1-10 rating strip used for sleep quality, stress, diet and intensity. */
export function RatingScale({ value, onChange, max = 5, labels, colorRamp = false }) {
  return (
    <div>
      <div className="flex gap-1.5">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
          const active = Number(value) === n;
          const ramp = colorRamp
            ? ['#22c55e', '#4ade80', '#eab308', '#f97316', '#ef4444'][
                Math.floor(((n - 1) / max) * 5)
              ]
            : null;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={active}
              aria-label={labels?.[n - 1] ?? `${n} of ${max}`}
              onClick={() => onChange(active ? null : n)}
              className={clsx(
                'h-11 flex-1 rounded-lg border text-sm font-semibold transition-all active:scale-95',
                active
                  ? 'border-transparent text-ink-900'
                  : 'border-[color:var(--border)] bg-[color:var(--bg-sunken)] hover:border-accent/50'
              )}
              style={active ? { background: ramp ?? '#38bdf8' } : undefined}
            >
              {n}
            </button>
          );
        })}
      </div>
      {labels ? (
        <div className="muted mt-1 flex justify-between text-[10px]">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Horizontal segmented control (range pickers, tabs). */
export function Segmented({ value, onChange, options, className, size = 'md' }) {
  return (
    <div
      className={clsx(
        'no-scrollbar inline-flex overflow-x-auto rounded-xl border p-1',
        size === 'sm' ? 'gap-0.5' : 'gap-1',
        className
      )}
      style={{ borderColor: 'var(--border)', background: 'var(--bg-sunken)' }}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={clsx(
              'whitespace-nowrap rounded-lg font-medium transition-all',
              size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
              active ? 'bg-accent text-ink-900 shadow' : 'muted hover:text-[color:var(--text)]'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// --- Modal ------------------------------------------------------------------

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={clsx(
          'surface relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-xl2 shadow-card',
          'safe-bottom animate-slide-up sm:animate-scale-in sm:rounded-xl2',
          widths[size]
        )}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
        >
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </Button>
        </div>
        <div className="p-4">{children}</div>
        {footer ? (
          <div
            className="sticky bottom-0 border-t p-4 backdrop-blur"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// --- Feedback ---------------------------------------------------------------

const ALERT_STYLES = {
  error: { cls: 'border-score-poor/40 bg-score-poor/10 text-score-poor', Icon: AlertTriangle },
  success: {
    cls: 'border-score-excellent/40 bg-score-excellent/10 text-score-excellent',
    Icon: CheckCircle2,
  },
  info: { cls: 'border-accent/40 bg-accent/10 text-accent', Icon: Info },
  warning: { cls: 'border-score-moderate/40 bg-score-moderate/10 text-score-moderate', Icon: AlertTriangle },
};

export function Alert({ tone = 'info', children, onDismiss, className }) {
  const { cls, Icon } = ALERT_STYLES[tone] ?? ALERT_STYLES.info;
  if (!children) return null;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={clsx(
        'flex animate-fade-in items-start gap-2 rounded-xl border px-3 py-2.5 text-xs',
        cls,
        className
      )}
    >
      <Icon size={15} className="mt-px shrink-0" aria-hidden="true" />
      <span className="flex-1 leading-relaxed">{children}</span>
      {onDismiss ? (
        <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

export const Badge = ({ children, color, className }) => (
  <span
    className={clsx(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
      className
    )}
    style={color ? { background: `${color}22`, color } : undefined}
  >
    {children}
  </span>
);

export const Skeleton = ({ className }) => <div className={clsx('skeleton', className)} />;

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {Icon ? (
        <div className="mb-3 rounded-2xl bg-[color:var(--bg-sunken)] p-3">
          <Icon size={22} className="muted" aria-hidden="true" />
        </div>
      ) : null}
      <p className="text-sm font-semibold">{title}</p>
      {body ? <p className="muted mt-1 max-w-xs text-xs leading-relaxed">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
