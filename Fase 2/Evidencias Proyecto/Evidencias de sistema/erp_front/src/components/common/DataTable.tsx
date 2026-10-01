import { cn } from '@/lib/utils';
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Columns3,
  ArrowUp,
  ArrowDown,
  Filter,
  Search,
  X,
  Download,
} from 'lucide-react';
import { TablePagination } from './TablePagination';
import { useClientPagination, type PageSizeOption } from './useClientPagination';
import { useTablePreferences } from '@/hooks/useTablePreferences';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, Input, Select } from '@/components/ui/input';
import { INPUT_LIMITS } from '@/lib/inputValidation';
import { exportRowsToCsv, exportRowsToExcel } from '@/lib/exportTable';
import {
  type ColumnFilterState,
  type FilterDataType,
  type SortValue as FilterSortValue,
  defaultOpForType,
  inferFilterDataType,
  isFilterActive,
  rowMatchesColumnFilter,
  rowMatchesQuickSearch,
  stringifyFilterValue,
} from './tableFilter';

export type SortValue = FilterSortValue;

/**
 * Columna de DataTable.
 *
 * - `key`: identificador estable (se usa en preferencias de columnas y filtros).
 * - `sortable`: default `true` salvo columnas de acciones (`key` que empieza con `_`).
 * - `sortValue` / `filterValue`: si el `cell` es ReactNode o `key` ≠ campo, define el valor
 *   comparable / filtrable.
 * - `filterType`: fuerza el tipo de filtro avanzado (`text` | `number` | `date` | `boolean` | `select`).
 * - `filterOptions`: opciones para `filterType: 'select'` (o boolean etiquetado).
 * - `filterable`: default `true` salvo acciones; si false no entra en búsqueda avanzada.
 * - `hideable`: default `true` salvo acciones; si es false no aparece en el menú Columnas.
 *
 * Pantallas nuevas: pasar `tableKey` estable al DataTable (ej. `admin.usuarios`)
 * para persistir show/hide y orden de columnas por usuario.
 *
 * Búsqueda (client-side sobre filas cargadas):
 * - «Buscar» filtra al escribir (sin botón Aplicar); listas grandes usan debounce corto.
 * - «Filtros» avanzados (columnas) siguen requiriendo «Aplicar filtros».
 * - Panel estilo libro (ref Sergio): filtros por columna visible + buscador general.
 * - «Filtrar» aplica el borrador; la X limpia todo.
 *
 * @example
 * <DataTable
 *   tableKey="admin.usuarios"
 *   enableSearch // default true
 *   columns={[
 *     { key: 'nombre', header: 'Nombre', cell: (r) => r.nombre },
 *     { key: 'activo', header: 'Estado', filterType: 'boolean',
 *       filterValue: (r) => r.activo, cell: (r) => ... },
 *   ]}
 *   rows={data}
 * />
 */
export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  /** Valor usado para ordenar cuando `cell` no es un escalar. */
  sortValue?: (row: T) => SortValue;
  /** Valor usado para filtrar; por defecto `sortValue` o `row[key]`. */
  filterValue?: (row: T) => SortValue;
  /** Tipo de filtro avanzado. Si se omite, se infiere de los datos. */
  filterType?: FilterDataType;
  /** Opciones para filtros `select` (y opcionalmente boolean). */
  filterOptions?: { value: string; label: string }[];
  /** Si false, no participa en búsqueda avanzada. Default: key no empieza con `_`. */
  filterable?: boolean;
  /** Si false, la columna no se puede ocultar/reordenar (p.ej. acciones). Default: key no empieza con `_`. */
  hideable?: boolean;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

function seedColumnFilters<T extends object>(
  columns: Column<T>[],
  initial: Record<string, string> | undefined,
): Record<string, ColumnFilterState> {
  const out: Record<string, ColumnFilterState> = {};
  if (!initial) return out;
  for (const [key, raw] of Object.entries(initial)) {
    const value = String(raw ?? '').trim();
    if (!value) continue;
    const col = columns.find((c) => c.key === key);
    if (!col || !defaultFilterable(col as Column<unknown>)) continue;
    const dataType = col.filterType ?? 'select';
    out[key] = { key, dataType, op: defaultOpForType(dataType), value };
  }
  return out;
}

function defaultSortable(col: Column<unknown>): boolean {
  if (col.sortable != null) return col.sortable;
  return !col.key.startsWith('_');
}

function defaultHideable(col: Column<unknown>): boolean {
  if (col.hideable != null) return col.hideable;
  return !col.key.startsWith('_');
}

function defaultFilterable(col: Column<unknown>): boolean {
  if (col.filterable != null) return col.filterable;
  // Acciones / selección / headers vacíos no generan filtros huérfanos.
  if (col.key.startsWith('_')) return false;
  const label = headerLabel(col).trim();
  if (!label) return false;
  return true;
}

function rawSortValue<T extends object>(row: T, col: Column<T>): SortValue {
  if (col.sortValue) return col.sortValue(row);
  const v = (row as Record<string, unknown>)[col.key];
  if (
    v == null
    || typeof v === 'string'
    || typeof v === 'number'
    || typeof v === 'boolean'
    || v instanceof Date
  ) {
    return v as SortValue;
  }
  return String(v);
}

function rawFilterValue<T extends object>(row: T, col: Column<T>): SortValue {
  if (col.filterValue) return col.filterValue(row);
  return rawSortValue(row, col);
}

function headerLabel(col: Column<unknown>): string {
  if (typeof col.header === 'string' || typeof col.header === 'number') return String(col.header);
  return col.key;
}

function compareValues(a: SortValue, b: SortValue): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : new Date(String(a)).getTime();
    const tb = b instanceof Date ? b.getTime() : new Date(String(b)).getTime();
    return ta - tb;
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}

function ColumnPrefsMenu<T>({
  columns,
  order,
  visible,
  setVisible,
  moveColumn,
}: {
  columns: Column<T>[];
  order: string[];
  visible: Set<string>;
  setVisible: (key: string, show: boolean) => void;
  moveColumn: (key: string, dir: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const managedKeys = order.filter((k) => {
    const col = byKey.get(k);
    return col ? defaultHideable(col as Column<unknown>) : false;
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (managedKeys.length === 0) return null;

  return (
    <div className="relative" ref={rootRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        leftIcon={<Columns3 size={14} />}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Columnas
      </Button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg"
          role="menu"
        >
          <div className="mb-1 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
            Mostrar / ordenar
          </div>
          <ul className="max-h-72 space-y-0.5 overflow-y-auto">
            {managedKeys.map((key, idx) => {
              const col = byKey.get(key);
              const label = col ? headerLabel(col as Column<unknown>) : key;
              const checked = visible.has(key);
              return (
                <li
                  key={key}
                  className="flex items-center gap-1 rounded px-1 py-1 hover:bg-[var(--color-surface-2)]"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      className="h-3.5 w-3.5"
                      checked={checked}
                      disabled={checked && visible.size <= 1}
                      onChange={(e) => setVisible(key, e.target.checked)}
                    />
                    <span className="truncate">{label}</span>
                  </label>
                  <button
                    type="button"
                    title="Subir"
                    disabled={idx === 0}
                    className="rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] disabled:opacity-30"
                    onClick={() => moveColumn(key, -1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    title="Bajar"
                    disabled={idx === managedKeys.length - 1}
                    className="rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] disabled:opacity-30"
                    onClick={() => moveColumn(key, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function isRutColumn(col: Column<unknown>): boolean {
  const label = headerLabel(col).toLowerCase();
  return /rut/.test(col.key) || /rut/.test(label);
}

/**
 * Panel de filtros estilo libro (ref Sergio Reu5): reemplaza «Búsqueda avanzada».
 * Buscador general siempre visible; el resto se expande hacia abajo.
 */
function LibroStyleFilterPanel<T extends object>({
  columns,
  visibleKeys,
  rows,
  draftFilters,
  draftQuickQ,
  searchPlaceholder,
  onDraftFilterChange,
  onDraftQuickQChange,
  onApply,
  onClear,
}: {
  columns: Column<T>[];
  visibleKeys: Set<string>;
  rows: T[];
  draftFilters: Record<string, ColumnFilterState>;
  draftQuickQ: string;
  searchPlaceholder: string;
  onDraftFilterChange: (key: string, next: ColumnFilterState) => void;
  onDraftQuickQChange: (q: string) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const metas = useMemo(() => {
    return columns
      .filter((c) => defaultFilterable(c as Column<unknown>) && visibleKeys.has(c.key))
      .map((c) => {
        const samples = rows.slice(0, 80).map((r) => rawFilterValue(r, c));
        const dataType = c.filterType ?? inferFilterDataType(samples);
        const options = c.filterOptions
          ?? (dataType === 'boolean'
            ? [
                { value: 'true', label: 'Activo' },
                { value: 'false', label: 'Inactivo' },
              ]
            : dataType === 'select'
              ? [...new Set(samples.map((s) => stringifyFilterValue(s)).filter(Boolean))]
                  .slice(0, 40)
                  .map((v) => ({ value: v, label: v }))
              : undefined);
        return { col: c, dataType, options, label: headerLabel(c as Column<unknown>) };
      });
  }, [columns, visibleKeys, rows]);

  const dateMetas = metas.filter((m) => m.dataType === 'date');
  const primaryDate = dateMetas[0] ?? null;
  const extraDates = dateMetas.slice(1);
  const selectMetas = metas.filter((m) => m.dataType === 'select' || m.dataType === 'boolean');
  const numberMetas = metas.filter((m) => m.dataType === 'number');
  /** Textos por columna (contiene); RUT con placeholder propio. */
  const textMetas = metas.filter((m) => m.dataType === 'text' && !isRutColumn(m.col as Column<unknown>));
  const rutMeta = metas.find((m) => m.dataType === 'text' && isRutColumn(m.col as Column<unknown>)) ?? null;

  const ensure = (key: string, dataType: FilterDataType): ColumnFilterState => {
    const existing = draftFilters[key];
    if (existing && existing.dataType === dataType) return existing;
    return { key, dataType, op: defaultOpForType(dataType), value: '', valueTo: '' };
  };

  const setFilter = (key: string, dataType: FilterDataType, patch: Partial<ColumnFilterState>) => {
    const f = ensure(key, dataType);
    onDraftFilterChange(key, { ...f, ...patch, dataType, key });
  };

  const advancedFields: ReactNode[] = [];

  if (primaryDate) {
    const f = ensure(primaryDate.col.key, 'date');
    const range = { ...f, op: 'between' as const };
    advancedFields.push(
      <Field key={`${primaryDate.col.key}-desde`} label="Fecha desde">
        <Input
          type="date"
          value={range.value}
          onChange={(e) => setFilter(primaryDate.col.key, 'date', { op: 'between', value: e.target.value, valueTo: range.valueTo ?? '' })}
        />
      </Field>,
      <Field key={`${primaryDate.col.key}-hasta`} label="Fecha hasta">
        <Input
          type="date"
          value={range.valueTo ?? ''}
          onChange={(e) => setFilter(primaryDate.col.key, 'date', { op: 'between', value: range.value, valueTo: e.target.value })}
        />
      </Field>,
    );
  }

  for (const m of extraDates) {
    const f = ensure(m.col.key, 'date');
    advancedFields.push(
      <Field key={m.col.key} label={m.label}>
        <Input
          type="date"
          value={f.value}
          onChange={(e) => setFilter(m.col.key, 'date', { op: 'eq', value: e.target.value })}
        />
      </Field>,
    );
  }

  for (const m of selectMetas) {
    const f = ensure(m.col.key, m.dataType);
    advancedFields.push(
      <Field key={m.col.key} label={m.label}>
        <Select
          value={f.value}
          onChange={(e) => setFilter(m.col.key, m.dataType, { op: 'eq', value: e.target.value })}
        >
          <option value="">Todos</option>
          {(m.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </Field>,
    );
  }

  for (const m of numberMetas) {
    const f = ensure(m.col.key, 'number');
    advancedFields.push(
      <Field key={`${m.col.key}-from`} label={`${m.label} desde`}>
        <Input
          type="number"
          value={f.value}
          onChange={(e) => setFilter(m.col.key, 'number', {
            op: 'between',
            value: e.target.value,
            valueTo: f.valueTo ?? '',
          })}
        />
      </Field>,
      <Field key={`${m.col.key}-to`} label={`${m.label} hasta`}>
        <Input
          type="number"
          value={f.valueTo ?? ''}
          onChange={(e) => setFilter(m.col.key, 'number', {
            op: 'between',
            value: f.value,
            valueTo: e.target.value,
          })}
        />
      </Field>,
    );
  }

  for (const m of textMetas) {
    const f = ensure(m.col.key, 'text');
    advancedFields.push(
      <Field key={m.col.key} label={m.label}>
        <Input
          value={f.value}
          maxLength={INPUT_LIMITS.search}
          placeholder={`${m.label}…`}
          onChange={(e) => setFilter(m.col.key, 'text', { op: 'contains', value: e.target.value })}
        />
      </Field>,
    );
  }

  if (rutMeta) {
    const f = ensure(rutMeta.col.key, 'text');
    advancedFields.push(
      <Field key={rutMeta.col.key} label={rutMeta.label || 'RUT'}>
        <Input
          value={f.value}
          maxLength={INPUT_LIMITS.search}
          placeholder="76.543.210-K"
          onChange={(e) => setFilter(rutMeta.col.key, 'text', { op: 'contains', value: e.target.value })}
        />
      </Field>,
    );
  }

  const hasAdvanced = advancedFields.length > 0;
  const activeAdvancedCount = Object.values(draftFilters).filter(isFilterActive).length;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onApply();
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-3"
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Buscar" className="min-w-[220px] flex-1">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
            />
            <Input
              className="pl-8"
              value={draftQuickQ}
              maxLength={INPUT_LIMITS.search}
              onChange={(e) => onDraftQuickQChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label="Buscar"
            />
          </div>
        </Field>
        <div className="ml-auto flex items-center gap-2 pb-0.5">
          {hasAdvanced && (
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              aria-expanded={advancedOpen}
              title={advancedOpen ? 'Ocultar filtros' : 'Más filtros'}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
                advancedOpen || activeAdvancedCount > 0
                  ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text)] hover:bg-[var(--color-border)]',
              )}
            >
              <Filter size={14} />
              Filtros
              {activeAdvancedCount > 0 ? ` (${activeAdvancedCount})` : ''}
              {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          {hasAdvanced && (
            <button
              type="submit"
              title="Aplicar filtros por columna"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-4 text-sm font-semibold text-white shadow-[0_0_16px_color-mix(in_srgb,var(--color-accent)_45%,transparent)] hover:opacity-95"
            >
              <Filter size={15} />
              Aplicar filtros
            </button>
          )}
          <button
            type="button"
            title="Limpiar"
            aria-label="Limpiar filtros"
            onClick={onClear}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text)] hover:bg-[var(--color-border)]"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {hasAdvanced && advancedOpen && (
        <div className="grid gap-3 border-t border-[var(--color-border)] pt-3 sm:grid-cols-2 lg:grid-cols-4">
          {advancedFields}
        </div>
      )}
    </form>
  );
}

/**
 * Tabla compartida del ERP.
 *
 * Capacidades por defecto:
 * - Panel de filtros estilo libro (client-side; ver `enableSearch`).
 * - Ordenamiento ASC/DESC al click en encabezado (toggle).
 * - Scroll vertical (`max-height`) con `thead` sticky.
 * - Menú Columnas (show/hide + reordenar) si se pasa `tableKey`.
 * - Los filtros solo consideran columnas visibles.
 */
export function DataTable<T extends { id: string | number }>({
  columns,
  rows,
  empty,
  onRowClick,
  dense,
  pagination,
  tableKey,
  maxHeight = 'min(70vh, 40rem)',
  showColumnMenu = true,
  toolbarExtra,
  enableSearch = true,
  searchPlaceholder = 'Buscar…',
  initialSearch = '',
  initialColumnFilters,
  quickSearchKeys,
  enableExport = false,
  exportFilename,
  onFilteredRowsChange,
  defaultSort = null,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  dense?: boolean;
  pagination?: boolean | { storageKey?: string; defaultSize?: PageSizeOption };
  /**
   * Clave estable de la lista (ej. `admin.usuarios`, `catalogos.monedas`).
   * Habilita persistencia de columnas visibles/orden por usuario.
   */
  tableKey?: string;
  /** Altura máxima del contenedor scrolleable. */
  maxHeight?: string;
  /** Mostrar botón Columnas (requiere tableKey). Default true. */
  showColumnMenu?: boolean;
  /** Contenido extra a la izquierda del menú Columnas. */
  toolbarExtra?: ReactNode;
  /**
   * Panel de filtros estilo libro (client-side sobre `rows`).
   * Default true. Desactivar en widgets embebidos (p.ej. dashboard).
   */
  enableSearch?: boolean;
  searchPlaceholder?: string;
  /** Semilla de búsqueda rápida (p.ej. `?q=` desde otra pantalla). */
  initialSearch?: string;
  /** Semilla de filtros por columna (p.ej. `?tipo=112` en el libro). */
  initialColumnFilters?: Record<string, string>;
  /**
   * Columnas que participan en el buscador general. Default: todas las
   * filtrables visibles. En el libro de ventas se limita a folio SII / cliente
   * para que `?q=60` no matchee fechas ni montos.
   */
  quickSearchKeys?: string[];
  /** Botones export CSV / Excel de las filas filtradas. */
  enableExport?: boolean;
  exportFilename?: string;
  /** Notifica filas tras aplicar filtros (p.ej. totales / imprimir). */
  onFilteredRowsChange?: (rows: T[]) => void;
  /** Orden inicial (p.ej. folio más reciente arriba). */
  defaultSort?: SortState;
}) {
  const [sort, setSort] = useState<SortState>(defaultSort);
  const [draftQuickQ, setDraftQuickQ] = useState(initialSearch);
  const [quickQ, setQuickQ] = useState(initialSearch);
  const [draftAdvFilters, setDraftAdvFilters] = useState<Record<string, ColumnFilterState>>(
    () => seedColumnFilters(columns, initialColumnFilters),
  );
  const [advFilters, setAdvFilters] = useState<Record<string, ColumnFilterState>>(
    () => seedColumnFilters(columns, initialColumnFilters),
  );
  const quickApplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDraftQuickQChange = (value: string) => {
    setDraftQuickQ(value);
    if (quickApplyTimerRef.current) clearTimeout(quickApplyTimerRef.current);
    const delay = rows.length > 600 ? 160 : 0;
    if (delay === 0) {
      setQuickQ(value);
      return;
    }
    quickApplyTimerRef.current = setTimeout(() => setQuickQ(value), delay);
  };

  useEffect(
    () => () => {
      if (quickApplyTimerRef.current) clearTimeout(quickApplyTimerRef.current);
    },
    [],
  );

  const initialFiltersSig = JSON.stringify(initialColumnFilters ?? {});
  useEffect(() => {
    setDraftQuickQ(initialSearch);
    setQuickQ(initialSearch);
    const seeded = seedColumnFilters(columns, initialColumnFilters);
    setDraftAdvFilters(seeded);
    setAdvFilters(seeded);
    // Solo re-sembrar cuando cambia la URL (`q` / `tipo`), no en cada render de `columns`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearch, initialFiltersSig]);

  const preferenceKeys = useMemo(
    () => columns.filter((c) => defaultHideable(c as Column<unknown>)).map((c) => c.key),
    [columns],
  );

  const prefs = useTablePreferences(tableKey, preferenceKeys);

  const orderedColumns = useMemo(() => {
    const byKey = new Map(columns.map((c) => [c.key, c]));
    const fixed = columns.filter((c) => !defaultHideable(c as Column<unknown>));
    const managed = prefs.order
      .map((k) => byKey.get(k))
      .filter((c): c is Column<T> => Boolean(c))
      .filter((c) => prefs.visible.has(c.key));
    return [...managed, ...fixed];
  }, [columns, prefs.order, prefs.visible]);

  /** Columnas filtrables y actualmente visibles (ocultar columna → no aplica su filtro). */
  const visibleFilterKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const c of columns) {
      if (!defaultFilterable(c as Column<unknown>)) continue;
      if (defaultHideable(c as Column<unknown>) && !prefs.visible.has(c.key)) continue;
      keys.add(c.key);
    }
    return keys;
  }, [columns, prefs.visible]);

  const filteredRows = useMemo(() => {
    let list = rows;
    const q = quickQ.trim();
    if (q) {
      const searchCols = columns.filter((c) => {
        if (quickSearchKeys?.length) return quickSearchKeys.includes(c.key);
        return visibleFilterKeys.has(c.key);
      });
      list = list.filter((row) => {
        const vals = searchCols.map((c) => rawFilterValue(row, c));
        return rowMatchesQuickSearch(row, q, vals);
      });
    }
    const active = Object.values(advFilters).filter(
      (f) => visibleFilterKeys.has(f.key) && isFilterActive(f),
    );
    if (active.length > 0) {
      const byKey = new Map(columns.map((c) => [c.key, c]));
      list = list.filter((row) =>
        active.every((f) => {
          const col = byKey.get(f.key);
          if (!col) return true;
          return rowMatchesColumnFilter(rawFilterValue(row, col), f);
        }),
      );
    }
    return list;
  }, [rows, quickQ, advFilters, columns, visibleFilterKeys, quickSearchKeys]);

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col || !defaultSortable(col as Column<unknown>)) return filteredRows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filteredRows].sort((ra, rb) => dir * compareValues(rawSortValue(ra, col), rawSortValue(rb, col)));
  }, [filteredRows, sort, columns]);

  const paginationConfig = pagination === true ? {} : pagination === false ? undefined : pagination;
  const pag = useClientPagination(sortedRows, paginationConfig);
  const displayRows = paginationConfig ? pag.pageRows : sortedRows;

  const toggleSort = (col: Column<T>) => {
    if (!defaultSortable(col as Column<unknown>)) return;
    setSort((prev) => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: 'asc' };
      if (prev.dir === 'asc') return { key: col.key, dir: 'desc' };
      return { key: col.key, dir: 'asc' };
    });
  };

  // Parents often pass unstable `columns` → filteredRows is a new array every render.
  // Notify only when the filtered identity (ids) actually changes to avoid update loops.
  const filteredIdsSig = useMemo(
    () => filteredRows.map((r) => String((r as { id?: string | number }).id ?? '')).join('\0'),
    [filteredRows],
  );
  const lastFilteredNotifySig = useRef<string | null>(null);
  useEffect(() => {
    if (!onFilteredRowsChange) return;
    if (lastFilteredNotifySig.current === filteredIdsSig) return;
    lastFilteredNotifySig.current = filteredIdsSig;
    onFilteredRowsChange(filteredRows);
  }, [filteredIdsSig, filteredRows, onFilteredRowsChange]);

  const applyFilters = () => {
    if (quickApplyTimerRef.current) clearTimeout(quickApplyTimerRef.current);
    setQuickQ(draftQuickQ);
    setAdvFilters(draftAdvFilters);
  };

  const clearFilters = () => {
    if (quickApplyTimerRef.current) clearTimeout(quickApplyTimerRef.current);
    setDraftQuickQ('');
    setQuickQ('');
    setDraftAdvFilters({});
    setAdvFilters({});
  };

  const menu = tableKey && showColumnMenu ? (
    <ColumnPrefsMenu
      columns={columns}
      order={prefs.order}
      visible={prefs.visible}
      setVisible={prefs.setVisible}
      moveColumn={prefs.moveColumn}
    />
  ) : null;

  const exportBtns = enableExport ? (
    <div className="flex gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        leftIcon={<Download size={14} />}
        onClick={() => {
          const cols = orderedColumns
            .filter((c) => !c.key.startsWith('_'))
            .map((c) => ({
              key: c.key,
              header: typeof c.header === 'string' ? c.header : c.key,
              value: (row: T) => {
                const v = c.sortValue?.(row) ?? c.filterValue?.(row);
                if (v != null) return v as string | number;
                const raw = (row as Record<string, unknown>)[c.key];
                return raw == null ? '' : String(raw);
              },
            }));
          exportRowsToCsv(exportFilename ?? tableKey ?? 'export', cols, sortedRows);
        }}
      >
        CSV
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        leftIcon={<Download size={14} />}
        onClick={() => {
          const cols = orderedColumns
            .filter((c) => !c.key.startsWith('_'))
            .map((c) => ({
              key: c.key,
              header: typeof c.header === 'string' ? c.header : c.key,
              value: (row: T) => {
                const v = c.sortValue?.(row) ?? c.filterValue?.(row);
                if (v != null) return v as string | number;
                const raw = (row as Record<string, unknown>)[c.key];
                return raw == null ? '' : String(raw);
              },
            }));
          exportRowsToExcel(exportFilename ?? tableKey ?? 'export', cols, sortedRows);
        }}
      >
        Excel
      </Button>
    </div>
  ) : null;

  const filterPanel = enableSearch ? (
    <LibroStyleFilterPanel
      columns={columns}
      visibleKeys={visibleFilterKeys}
      rows={rows}
      draftFilters={draftAdvFilters}
      draftQuickQ={draftQuickQ}
      searchPlaceholder={searchPlaceholder}
      onDraftFilterChange={(key, next) => setDraftAdvFilters((s) => ({ ...s, [key]: next }))}
      onDraftQuickQChange={handleDraftQuickQChange}
      onApply={applyFilters}
      onClear={clearFilters}
    />
  ) : null;

  const appliedChips = useMemo(() => {
    const chips: { id: string; label: string; clear: () => void }[] = [];
    if (quickQ.trim()) {
      chips.push({
        id: '_q',
        label: `Buscar: ${quickQ.trim()}`,
        clear: () => {
          setQuickQ('');
          setDraftQuickQ('');
        },
      });
    }
    const byKey = new Map(columns.map((c) => [c.key, c]));
    for (const f of Object.values(advFilters)) {
      if (!visibleFilterKeys.has(f.key) || !isFilterActive(f)) continue;
      const col = byKey.get(f.key);
      const name = col ? headerLabel(col as Column<unknown>) : f.key;
      const val = f.op === 'between' && f.valueTo ? `${f.value} – ${f.valueTo}` : f.value;
      chips.push({
        id: f.key,
        label: `${name}: ${val}`,
        clear: () => {
          setAdvFilters((s) => {
            const next = { ...s };
            delete next[f.key];
            return next;
          });
          setDraftAdvFilters((s) => {
            const next = { ...s };
            delete next[f.key];
            return next;
          });
        },
      });
    }
    return chips;
  }, [quickQ, advFilters, columns, visibleFilterKeys]);

  const toolbar = (filterPanel || menu || toolbarExtra || exportBtns) ? (
    <div className="mb-2 space-y-2">
      {filterPanel}
      {appliedChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--color-muted)]">Filtrando:</span>
          {appliedChips.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] px-2 py-0.5 text-xs text-[var(--color-accent-2)]"
            >
              {c.label}
              <button
                type="button"
                className="opacity-70 hover:opacity-100"
                aria-label={`Quitar ${c.label}`}
                onClick={c.clear}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {(menu || toolbarExtra || exportBtns) && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {toolbarExtra}
          {exportBtns}
          {menu}
        </div>
      )}
    </div>
  ) : null;

  if (filteredRows.length === 0) {
    return (
      <div>
        {toolbar}
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-muted)]">
          {rows.length === 0
            ? (empty ?? 'Sin datos')
            : 'Sin resultados para la búsqueda / filtros'}
        </div>
      </div>
    );
  }

  return (
    <div>
      {toolbar}
      <div
        className="overflow-auto rounded-lg border border-[var(--color-border)]"
        style={{ maxHeight }}
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)] text-xs uppercase tracking-wide text-[var(--color-muted)] shadow-[0_1px_0_var(--color-border)]">
            <tr>
              {orderedColumns.map((c) => {
                const canSort = defaultSortable(c as Column<unknown>);
                const active = sort?.key === c.key;
                const canDrag = Boolean(tableKey) && defaultHideable(c as Column<unknown>);
                return (
                  <th
                    key={c.key}
                    draggable={canDrag}
                    onDragStart={(e) => {
                      if (!canDrag) return;
                      e.dataTransfer.setData('text/plain', c.key);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      if (!canDrag) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      if (!canDrag) return;
                      e.preventDefault();
                      const from = e.dataTransfer.getData('text/plain');
                      if (from) prefs.reorderColumn(from, c.key);
                    }}
                    className={cn(
                      'px-3 py-2 text-left font-medium whitespace-nowrap',
                      c.align === 'right' && 'text-right',
                      c.align === 'center' && 'text-center',
                      c.className,
                      canSort && 'cursor-pointer select-none hover:text-[var(--color-text)]',
                      canDrag && 'cursor-grab active:cursor-grabbing',
                      active && 'bg-[var(--color-surface)] text-[var(--color-text)]',
                    )}
                    onClick={() => toggleSort(c)}
                    title={canDrag ? 'Arrastra para reordenar columna' : undefined}
                    aria-sort={
                      !active ? undefined : sort!.dir === 'asc' ? 'ascending' : 'descending'
                    }
                  >
                    <span className={cn('inline-flex items-center gap-1', c.align === 'right' && 'justify-end w-full')}>
                      {c.header}
                      {canSort && active && (
                        sort!.dir === 'asc'
                          ? <ChevronUp size={14} className="shrink-0 opacity-80" />
                          : <ChevronDown size={14} className="shrink-0 opacity-80" />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, idx) => (
              <tr
                key={`${String(row.id)}-${idx}`}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  'border-t border-[var(--color-border)] bg-[var(--color-surface)] transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-[var(--color-surface-2)]',
                )}
              >
                {orderedColumns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      dense ? 'px-3 py-1.5' : 'px-3 py-2.5',
                      c.align === 'right' && 'text-right tabular-nums',
                      c.align === 'center' && 'text-center',
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginationConfig && (
        <TablePagination
          total={pag.total}
          pageSize={pag.pageSize}
          offset={pag.offset}
          onPageSizeChange={pag.setPageSize}
          onOffsetChange={pag.setOffset}
          storageKey={paginationConfig.storageKey}
        />
      )}
    </div>
  );
}
