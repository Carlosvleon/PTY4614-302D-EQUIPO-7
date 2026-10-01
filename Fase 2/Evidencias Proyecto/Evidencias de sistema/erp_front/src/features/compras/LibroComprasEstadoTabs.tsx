import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

/** Filtro principal estilo SII del Libro de compras. */
export type LibroComprasTab = 'ACEPTADO' | 'PENDIENTE' | 'RECHAZADO' | 'TODOS';

export const LIBRO_COMPRAS_TAB_LABEL: Record<LibroComprasTab, string> = {
  ACEPTADO: 'Aceptados',
  PENDIENTE: 'Pendientes',
  RECHAZADO: 'Rechazados',
  TODOS: 'Todos',
};

const TAB_ORDER: LibroComprasTab[] = ['ACEPTADO', 'PENDIENTE', 'RECHAZADO', 'TODOS'];

export function isLibroComprasTab(value: unknown): value is LibroComprasTab {
  return typeof value === 'string' && TAB_ORDER.includes(value as LibroComprasTab);
}

type Props = {
  active: LibroComprasTab;
  onChange: (tab: LibroComprasTab) => void;
  counts: Record<LibroComprasTab, number>;
  isDefault: boolean;
  onSetDefault: () => void;
};

/** Tabs de filtro principal (Aceptados/Pendientes/Rechazados/Todos), estilo bandeja SII. */
export function LibroComprasEstadoTabs({ active, onChange, counts, isDefault, onSetDefault }: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-border)]">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filtro por estado GoSocket">
        {TAB_ORDER.map((tab) => {
          const isActive = active === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab)}
              className={cn(
                'relative flex items-center gap-2 rounded-t-lg border border-b-0 px-4 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-accent)]'
                  : 'border-transparent text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]',
              )}
            >
              {LIBRO_COMPRAS_TAB_LABEL[tab]}
              <Badge tone={isActive ? 'accent' : 'muted'}>{counts[tab] ?? 0}</Badge>
              {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--color-accent)]" />}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onSetDefault}
        disabled={isDefault}
        title={isDefault ? 'Este es tu filtro por defecto al entrar' : 'Fijar como filtro por defecto al entrar'}
        className={cn(
          'mb-1.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
          isDefault
            ? 'cursor-default text-[var(--color-accent)]'
            : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]',
        )}
      >
        <Star size={13} className={isDefault ? 'fill-current' : undefined} />
        {isDefault ? 'Filtro por defecto' : 'Fijar como filtro por defecto'}
      </button>
    </div>
  );
}
