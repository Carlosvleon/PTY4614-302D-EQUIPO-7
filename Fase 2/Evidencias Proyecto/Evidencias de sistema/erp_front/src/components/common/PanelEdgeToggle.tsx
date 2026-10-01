import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Botón circular en el borde de un panel colapsable.
 * edge=left  → sidebar izquierdo (colapsa hacia la izquierda)
 * edge=right → panel derecho (colapsa hacia la derecha)
 */
export function PanelEdgeToggle({
  edge,
  collapsed,
  onClick,
  title,
  className,
}: {
  edge: 'left' | 'right';
  collapsed: boolean;
  onClick: () => void;
  title?: string;
  className?: string;
}) {
  const Icon = edge === 'left'
    ? (collapsed ? ChevronRight : ChevronLeft)
    : (collapsed ? ChevronLeft : ChevronRight);

  const position = edge === 'left'
    ? '-right-3 top-4'
    : '-left-3 top-4';

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        'absolute z-10 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] shadow-sm transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]',
        position,
        className,
      )}
    >
      <Icon size={14} strokeWidth={2.5} />
    </button>
  );
}
