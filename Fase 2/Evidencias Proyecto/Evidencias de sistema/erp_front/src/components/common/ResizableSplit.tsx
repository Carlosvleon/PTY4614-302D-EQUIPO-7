import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

const MIN_RIGHT = 240;
const MAX_RIGHT = 720;
const DEFAULT_RIGHT = 352;

function clampRight(n: number, containerW: number) {
  const maxByContainer = Math.max(MIN_RIGHT, Math.floor(containerW * 0.55));
  const max = Math.min(MAX_RIGHT, maxByContainer);
  return Math.min(max, Math.max(MIN_RIGHT, Math.round(n)));
}

type ResizableSplitProps = {
  left: ReactNode;
  right: ReactNode;
  storageKey?: string;
  defaultRightWidth?: number;
  className?: string;
};

/** Layout horizontal con divisor vertical arrastrable (persistido en localStorage). */
export function ResizableSplit({
  left,
  right,
  storageKey = 'almahue-erp-aprobaciones-split',
  defaultRightWidth = DEFAULT_RIGHT,
  className,
}: ResizableSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rightWidth, setRightWidth] = useState(() => {
    const raw = Number(localStorage.getItem(storageKey));
    return Number.isFinite(raw) && raw > 0 ? raw : defaultRightWidth;
  });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    localStorage.setItem(storageKey, String(rightWidth));
  }, [rightWidth, storageKey]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      setRightWidth((prev) => clampRight(prev, w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startW: rightWidth };
      setDragging(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [rightWidth],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !containerRef.current) return;
    const containerW = containerRef.current.getBoundingClientRect().width;
    const delta = dragRef.current.startX - e.clientX;
    setRightWidth(clampRight(dragRef.current.startW + delta, containerW));
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex min-h-0 w-full flex-col gap-4 xl:flex-row xl:items-start xl:gap-0',
        dragging && 'select-none',
        className,
      )}
    >
      <div className="min-h-0 min-w-0 flex-1 xl:pr-3">{left}</div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar panel lateral"
        title="Arrastrar para redimensionar"
        className={cn(
          'relative z-10 hidden shrink-0 cursor-col-resize xl:block',
          'w-1.5 self-stretch min-h-[12rem] rounded-full bg-[var(--color-border)]/70',
          'hover:bg-[var(--color-accent)]/40',
          dragging && 'bg-[var(--color-accent)]/55',
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      <aside className="min-w-0 w-full xl:sticky xl:top-4 xl:w-auto xl:shrink-0 xl:self-start xl:pl-3">
        <div className="w-full xl:w-[var(--split-right)]" style={{ ['--split-right' as string]: `${rightWidth}px` }}>
          {right}
        </div>
      </aside>
    </div>
  );
}
