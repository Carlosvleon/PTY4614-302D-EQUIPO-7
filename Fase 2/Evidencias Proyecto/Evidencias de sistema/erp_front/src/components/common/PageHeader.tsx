import type { ReactNode } from 'react';

export function PageHeader({
  title, subtitle, breadcrumbs, action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: string[];
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        {breadcrumbs && (
          <div className="mb-1 text-xs text-[var(--color-muted)]">
            {breadcrumbs.map((b, i) => (
              <span key={i}>{b}{i < breadcrumbs.length - 1 && ' › '}</span>
            ))}
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
