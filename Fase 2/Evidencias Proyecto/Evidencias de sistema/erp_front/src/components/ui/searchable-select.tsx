import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SearchableOption = { value: string; label: string; group?: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Clases del botón disparador (p.ej. compacto `h-8 rounded-md` en grillas). */
  buttonClassName?: string;
  emptyLabel?: string;
  /** Permite confirmar el texto filtrado como código/valor libre (países/puertos Aduana). */
  allowCustom?: boolean;
  /** Tooltip nativo del botón (p.ej. detalle del producto). */
  title?: string;
};

/**
 * Select con filtro por texto (escribir para buscar).
 * Compatible con forms de MockListPage (value/onChange string).
 *
 * El listado de opciones se renderiza en un portal a `document.body` con
 * posición `fixed` calculada desde el botón: dentro de modales, el body es
 * `overflow-y-auto` y un dropdown `absolute` normal quedaba recortado / no
 * clickeable cuando el campo caía cerca del borde inferior del formulario.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar…',
  disabled,
  id,
  className,
  buttonClassName,
  emptyLabel = 'Sin resultados',
  allowCustom = false,
  title,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null);

  const selected = options.find((o) => o.value === value)
    ?? (value ? { value, label: value } : undefined);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const compute = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const maxListHeight = 240; // ~ max-h-56 del contenedor + margen
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < maxListHeight && rect.top > spaceBelow;
      setPos({
        top: openUp ? rect.top - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        openUp,
      });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const dropdown = open && pos && (
    <div
      ref={listRef}
      className="fixed z-[100] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
      style={{
        top: pos.openUp ? undefined : pos.top,
        bottom: pos.openUp ? window.innerHeight - pos.top : undefined,
        left: pos.left,
        width: pos.width,
      }}
      role="listbox"
      id={listId}
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <Search size={14} className="text-[var(--color-muted)]" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Escribe para filtrar…"
          className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-muted)]"
        />
      </div>
      <ul className="max-h-64 overflow-y-auto py-1">
        <li>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            {placeholder}
          </button>
        </li>
        {filtered.length === 0 && !(allowCustom && query.trim()) ? (
          <li className="px-3 py-2 text-sm text-[var(--color-muted)]">{emptyLabel}</li>
        ) : (
          <>
          {allowCustom && query.trim() && !options.some((o) => o.value === query.trim()) && (
            <li>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-2)]"
                onClick={() => {
                  onChange(query.trim());
                  setOpen(false);
                }}
              >
                Usar código «{query.trim()}»
              </button>
            </li>
          )}
          {filtered.map((o, i) => {
            const showGroup = Boolean(o.group && o.group !== filtered[i - 1]?.group);
            return (
              <Fragment key={o.value}>
                {showGroup ? (
                  <li className="sticky top-0 z-[1] bg-[var(--color-surface-2)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    {o.group}
                  </li>
                ) : null}
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    className={cn(
                      'w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-2)]',
                      o.value === value && 'bg-[var(--color-accent)]/10 font-medium',
                    )}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    {o.label}
                  </button>
                </li>
              </Fragment>
            );
          })}
          </>
        )}
      </ul>
    </div>
  );

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        title={title}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-left text-sm text-[var(--color-text)] outline-none transition-all shadow-sm',
          'focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20',
          disabled && 'opacity-60 cursor-not-allowed',
          buttonClassName,
        )}
      >
        <span className={cn('truncate', !selected && 'text-[var(--color-muted)]')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown size={16} className="shrink-0 text-[var(--color-muted)]" />
      </button>

      {open && pos && typeof document !== 'undefined' ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
