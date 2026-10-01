import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import { PanelEdgeToggle } from '@/components/common/PanelEdgeToggle';

const STORAGE_KEY = 'almahue-erp-doc-panel-collapsed';
const WIDTH_KEY = 'almahue-erp-doc-panel-width';
const MIN_W = 240;
const MAX_W = 560;
const DEFAULT_W = 320;

function clampWidth(n: number) {
  return Math.min(MAX_W, Math.max(MIN_W, Math.round(n)));
}

export function CollapsibleRightPanel({
  title,
  children,
  collapsedSummary,
  preferExpanded,
}: {
  title: string;
  children: ReactNode;
  collapsedSummary?: ReactNode;
  /** Si pasa a true (p. ej. OV exportación), abre el panel para mostrar el detalle. */
  preferExpanded?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
  const [width, setWidth] = useState(() => {
    const raw = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(raw) && raw > 0 ? clampWidth(raw) : DEFAULT_W;
  });
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const preferPrev = useRef(false);
  useEffect(() => {
    if (preferExpanded && !preferPrev.current) setCollapsed(false);
    preferPrev.current = Boolean(preferExpanded);
  }, [preferExpanded]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width));
  }, [width]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: width };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [width]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const delta = dragRef.current.startX - e.clientX;
    setWidth(clampWidth(dragRef.current.startW + delta));
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <aside
      className={cn(
        'sticky top-0 z-20 flex h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] shrink-0 flex-col self-start border-l border-[var(--color-border)] bg-[var(--color-surface)] transition-[width] duration-200 ease-in-out',
        collapsed && 'w-12',
      )}
      style={collapsed ? undefined : { width }}
    >
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar panel"
          title="Arrastrar para redimensionar"
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-[var(--color-accent)]/30"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      )}
      <PanelEdgeToggle
        edge="right"
        collapsed={collapsed}
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Expandir panel' : 'Minimizar panel'}
      />

      {collapsed ? (
        <div className="flex flex-1 flex-col items-center gap-3 py-6">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)] [writing-mode:vertical-rl] rotate-180"
          >
            {title}
          </span>
          {collapsedSummary && (
            <div className="text-[10px] font-bold tabular-nums text-[var(--color-accent)] [writing-mode:vertical-rl] rotate-180">
              {collapsedSummary}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto p-4">{children}</div>
      )}
    </aside>
  );
}
