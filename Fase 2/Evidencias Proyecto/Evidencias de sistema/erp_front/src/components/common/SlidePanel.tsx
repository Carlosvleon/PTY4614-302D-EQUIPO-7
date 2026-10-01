import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { GripVertical, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBackdropDismiss } from '@/lib/useBackdropDismiss';

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** Ancho inicial en px (también al reabrir si no se persistió). */
  width?: number;
  /** Permite arrastrar el borde izquierdo hacia el centro para ampliar. */
  resizable?: boolean;
  minWidth?: number;
  /** Fracción máxima del viewport (0–1). */
  maxWidthRatio?: number;
  className?: string;
}

/**
 * Drawer lateral que desliza desde la derecha.
 * Backdrop opaco: cierra al hacer clic fuera o Escape.
 * Opcional: redimensionable y botón flotante de cierre en el borde.
 */
export function SlidePanel({
  open,
  onClose,
  title,
  children,
  width = 480,
  resizable = false,
  minWidth = 360,
  maxWidthRatio = 0.92,
  className,
}: SlidePanelProps) {
  const [panelWidth, setPanelWidth] = useState(width);
  const backdrop = useBackdropDismiss(onClose);

  useEffect(() => {
    if (!open) setPanelWidth(width);
  }, [width, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const clampWidth = useCallback(
    (w: number) => {
      const maxW = Math.floor(window.innerWidth * maxWidthRatio);
      return Math.min(maxW, Math.max(minWidth, w));
    },
    [maxWidthRatio, minWidth],
  );

  const onResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizable) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = panelWidth;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const delta = startX - ev.clientX; // arrastrar a la izquierda → más ancho
      setPanelWidth(clampWidth(startW + delta));
    };
    const onUp = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  return (
    <>
      {/* Backdrop más opaco */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px] transition-opacity duration-200',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onPointerDown={backdrop.onPointerDown}
        onPointerUp={backdrop.onPointerUp}
        onPointerCancel={backdrop.onPointerCancel}
        onClick={backdrop.onClick}
        aria-hidden
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Panel de configuración'}
        style={{ width: `min(${panelWidth}px, 100vw)` }}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex flex-col',
          'border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full',
          className,
        )}
      >
        {/* Asa de redimensionar (borde izquierdo → centro) */}
        {resizable && open && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar panel"
            title="Arrastre hacia el centro para ampliar"
            onPointerDown={onResizePointerDown}
            className={cn(
              'absolute inset-y-0 left-0 z-20 flex w-3 -translate-x-1/2 cursor-ew-resize items-center justify-center',
              'touch-none select-none',
            )}
          >
            <span className="flex h-16 w-1.5 items-center justify-center rounded-full bg-[var(--color-border)] shadow-sm transition-colors hover:bg-[var(--color-accent)]">
              <GripVertical size={12} className="text-[var(--color-muted)]" aria-hidden />
            </span>
          </div>
        )}

        {/* Botón flotante de cerrar (hacia el centro) */}
        {open && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel"
            title="Cerrar"
            className={cn(
              'absolute -left-5 top-4 z-30 flex h-10 w-10 items-center justify-center',
              'rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]',
              'text-[var(--color-text)] shadow-lg transition-colors',
              'hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
            )}
          >
            <X size={18} aria-hidden />
          </button>
        )}

        {/* Header */}
        {title != null && (
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 py-3 pl-5">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar panel"
              className="rounded p-1 text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  );
}
