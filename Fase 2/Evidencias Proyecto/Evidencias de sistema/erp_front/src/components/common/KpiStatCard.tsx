import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function KpiStatCard({
  label,
  value,
  subtext,
  hint,
  className,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  subtext?: ReactNode;
  /** Texto al pasar el mouse sobre (?). */
  hint?: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={cn(
        'relative rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 shadow-sm',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
          {label}
        </div>
        {hint ? (
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-[var(--color-muted)] opacity-50 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)]"
            title={hint}
            aria-label={`Información: ${label}`}
            tabIndex={0}
          >
            <HelpCircle size={13} strokeWidth={2} />
          </button>
        ) : null}
      </div>
      <div className={cn('mt-1 text-xl font-semibold tabular-nums text-[var(--color-text)]', valueClassName)}>
        {value}
      </div>
      {subtext != null && subtext !== '' ? (
        <div className="mt-0.5 text-xs text-[var(--color-muted)]">{subtext}</div>
      ) : null}
    </div>
  );
}
