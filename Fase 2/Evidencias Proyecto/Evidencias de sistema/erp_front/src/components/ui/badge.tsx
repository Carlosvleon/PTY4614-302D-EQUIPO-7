import { cn } from '@/lib/utils';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'accent';

const tones: Record<Tone, string> = {
  success: 'bg-[var(--color-badge-success-bg)] text-[var(--color-badge-success-text)] border-[var(--color-badge-success-border)]',
  warning: 'bg-[var(--color-badge-warning-bg)] text-[var(--color-badge-warning-text)] border-[var(--color-badge-warning-border)]',
  danger: 'bg-[var(--color-badge-danger-bg)] text-[var(--color-badge-danger-text)] border-[var(--color-badge-danger-border)]',
  info: 'bg-[var(--color-badge-info-bg)] text-[var(--color-badge-info-text)] border-[var(--color-badge-info-border)]',
  muted: 'bg-[var(--color-surface-2)] text-[var(--color-muted)] border-[var(--color-border)]',
  accent: 'bg-[var(--color-accent-soft)] text-[var(--color-accent-2)] border-[var(--color-accent)]/30',
};

export function Badge({ tone = 'muted', children, className }: {
  tone?: Tone; children: React.ReactNode; className?: string;
}) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
      tones[tone], className,
    )}>{children}</span>
  );
}
