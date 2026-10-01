import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export function InfoHint({
  label,
  children,
  iconClassName,
}: {
  label: string;
  children: ReactNode;
  iconClassName?: string;
}) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [suppressed, setSuppressed] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
  const visible = !suppressed && (pinned || hovered || focused);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!visible || !btnRef.current) {
      setCoords(null);
      return;
    }
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      setCoords({ top: r.top, left: r.left + r.width / 2 });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || bubbleRef.current?.contains(t)) return;
      setPinned(false);
      setSuppressed(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinned(false);
        setSuppressed(true);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [visible]);

  return (
    <div
      ref={wrapRef}
      className="relative inline-flex"
      onMouseEnter={() => {
        setHovered(true);
        if (!focused) setSuppressed(false);
      }}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        ref={btnRef}
        type="button"
        className={cn(
          'rounded-full p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
          iconClassName ?? 'text-[var(--color-muted)] hover:text-[var(--color-text)]',
        )}
        aria-label={label}
        aria-expanded={visible}
        aria-describedby={visible ? tooltipId : undefined}
        onFocus={() => {
          setFocused(true);
          setSuppressed(false);
        }}
        onBlur={() => {
          setFocused(false);
          setSuppressed(false);
        }}
        onClick={() => {
          if (pinned) {
            setPinned(false);
            setSuppressed(true);
          } else {
            setPinned(true);
            setSuppressed(false);
          }
        }}
      >
        <Info size={14} />
      </button>
      {visible && coords && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={bubbleRef}
              id={tooltipId}
              role="tooltip"
              style={{ top: coords.top, left: coords.left }}
              className="pointer-events-auto fixed z-[80] w-64 -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-md border border-amber-500/40 bg-[var(--color-surface)] px-2 py-1.5 text-[10px] leading-snug text-amber-800 shadow-lg dark:text-amber-200"
              onMouseEnter={() => {
                setHovered(true);
                if (!focused) setSuppressed(false);
              }}
              onMouseLeave={() => setHovered(false)}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
