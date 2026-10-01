import { cn } from '@/lib/utils';
import type { HTMLAttributes, ReactNode } from 'react';

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm', className)} {...p} />
  );
}

export function CardHeader({
  title, subtitle, action, className,
}: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4', className)}>
      <div>
        {title && <h3 className="text-base font-semibold text-[var(--color-text)]">{title}</h3>}
        {subtitle && <p className="mt-0.5 text-xs text-[var(--color-muted)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...p} />;
}
