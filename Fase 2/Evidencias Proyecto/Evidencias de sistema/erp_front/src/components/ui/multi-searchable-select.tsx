import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import type { SearchableOption } from '@/components/ui/searchable-select';

type Props = {
  value: string[];
  onChange: (value: string[]) => void;
  options: SearchableOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  emptyLabel?: string;
};

/**
 * Select múltiple con filtro y pills de selección.
 * Portal a `document.body` (mismo criterio que SearchableSelect en modales).
 */
export function MultiSearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar…',
  disabled,
  className,
  emptyLabel = 'Sin resultados',
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const selectedOptions = useMemo(
    () => value.map((v) => options.find((o) => o.value === v)).filter(Boolean) as SearchableOption[],
    [value, options],
  );

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
      const maxListHeight = 280;
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

  const toggle = (optValue: string) => {
    if (selectedSet.has(optValue)) {
      onChange(value.filter((v) => v !== optValue));
    } else {
      onChange([...value, optValue]);
    }
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

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
      aria-multiselectable
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
      {value.length > 0 && (
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5">
          <span className="text-xs text-[var(--color-muted)]">{value.length} seleccionado(s)</span>
          <button
            type="button"
            className="text-xs text-[var(--color-accent)] hover:underline"
            onClick={() => onChange([])}
          >
            Limpiar
          </button>
        </div>
      )}
      <ul className="max-h-56 overflow-auto py-1">
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-sm text-[var(--color-muted)]">{emptyLabel}</li>
        ) : (
          filtered.map((o) => {
            const checked = selectedSet.has(o.value);
            return (
              <li key={o.value}>
                <label
                  className={cn(
                    'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--color-surface-2)]',
                    checked && 'bg-[var(--color-accent)]/10',
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onChange={() => toggle(o.value)}
                    aria-label={o.label}
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex min-h-10 w-full items-center justify-between gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-left text-sm outline-none transition-all shadow-sm',
          'focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {selectedOptions.length === 0 ? (
            <span className="truncate px-1 text-[var(--color-muted)]">{placeholder}</span>
          ) : (
            selectedOptions.map((o) => (
              <span
                key={o.value}
                className="inline-flex max-w-full items-center gap-0.5 rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--color-accent-2)]"
              >
                <span className="truncate">{o.label}</span>
                {!disabled && (
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-[var(--color-accent)]/20"
                    aria-label={`Quitar ${o.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(value.filter((v) => v !== o.value));
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            ))
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {value.length > 0 && !disabled && (
            <button
              type="button"
              className="rounded-full p-0.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              aria-label="Limpiar selección"
              onClick={clearAll}
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={16} className="text-[var(--color-muted)]" />
        </span>
      </button>

      {open && pos && typeof document !== 'undefined' ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
