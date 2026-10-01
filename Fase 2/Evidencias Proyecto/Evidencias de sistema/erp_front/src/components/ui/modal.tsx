import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBackdropDismiss } from '@/lib/useBackdropDismiss';

export function Modal({
  open, onClose, title, children, footer, size = 'md', className, footerClassName, overlayClassName,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
  /** Clases extra del footer (p. ej. layout centrado de totales). */
  footerClassName?: string;
  /** Clases extra del overlay (p. ej. z-index sobre otro modal). */
  overlayClassName?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const backdrop = useBackdropDismiss(onClose);

  if (!open) return null;
  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[min(98vw,96rem)]',
  };
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4',
        overlayClassName,
      )}
      onPointerDown={backdrop.onPointerDown}
      onPointerUp={backdrop.onPointerUp}
      onPointerCancel={backdrop.onPointerCancel}
      onClick={backdrop.onClick}
    >
      <div
        className={cn(
          'flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl',
          sizes[size],
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <h3 className="text-base font-semibold text-[var(--color-text)]">{title}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className={cn('flex shrink-0 items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3', footerClassName)}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
