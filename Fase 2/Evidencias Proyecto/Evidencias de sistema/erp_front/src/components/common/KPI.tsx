import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'accent' | 'brand' | 'danger' | 'success' | 'warning';

export function KPI({
  label, value, hint, icon, tone = 'accent', iconBg = 'green',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  iconBg?: 'green' | 'red' | 'amber' | 'blue';
}) {
  const tones: Record<Tone, string> = {
    default: 'text-[var(--color-text)]',
    accent: 'text-[var(--color-text)]',
    brand: 'text-[var(--color-brand)]',
    danger: 'text-[var(--color-danger)]',
    success: 'text-[var(--color-accent-2)]',
    warning: 'text-[var(--color-warning)]',
  };
  const iconStyles = {
    green: 'bg-[var(--color-accent-soft)] text-[var(--color-accent-2)]',
    red: 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]',
    amber: 'bg-[var(--color-kpi-amber-bg)] text-[var(--color-kpi-amber-text)]',
    blue: 'bg-[var(--color-kpi-blue-bg)] text-[var(--color-kpi-blue-text)]',
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-[var(--color-muted)]">{label}</div>
          <div className={cn('mt-2 text-3xl font-bold tabular-nums leading-tight', tones[tone])}>{value}</div>
          {hint && <div className="mt-1 text-xs text-[var(--color-muted)]">{hint}</div>}
        </div>
        {icon && (
          <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-full', iconStyles[iconBg])}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
