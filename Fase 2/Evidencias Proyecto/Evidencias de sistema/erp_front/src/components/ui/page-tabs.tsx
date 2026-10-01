import { cn } from '@/lib/utils';

export type PageTabItem = {
  id: string;
  label: string;
  badge?: string | number;
};

export function PageTabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: PageTabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Secciones"
      className={cn(
        'flex flex-wrap gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1',
        className,
      )}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              selected
                ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm ring-1 ring-[var(--color-border)]'
                : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)]/80 hover:text-[var(--color-text)]',
            )}
          >
            {tab.label}
            {tab.badge != null && tab.badge !== '' ? (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                  selected
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-2)]'
                    : 'bg-[var(--color-border)] text-[var(--color-muted)]',
                )}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
