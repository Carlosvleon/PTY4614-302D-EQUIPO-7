import { Fragment, type ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueryScope, useEmpresaScopeId, listQueryKey } from '@/hooks/useQueryScope';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Field } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Modal } from '@/components/ui/modal';
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';
import {
  type InputKind,
  clampString,
  inferInputKind,
  isFiniteAmount,
  maxLengthForKind,
  validateFiscalId,
  validateFieldValue,
} from '@/lib/inputValidation';
import { useAppSettings } from '@/app/app-settings-context';
import { MontoInput, type MontoInputKind } from '@/components/ui/monto-input';
import { RutInput } from '@/components/ui/rut-input';
import { DateInput } from '@/components/ui/date-input';
import { formatRutDisplay } from '@/lib/inputValidation';

/**
 * Página CRUD de listado estándar del ERP.
 *
 * Incluye por defecto (vía DataTable):
 * - Búsqueda rápida (texto libre) + «Búsqueda avanzada» por columna visible
 *   (client-side sobre el dataset cargado; funciona en demo y modo real)
 * - Ordenamiento por columna (click en header)
 * - Scroll vertical + thead sticky
 * - Menú «Columnas» (mostrar/ocultar + reordenar) persistido por usuario
 *
 * Filtros de página: usar `filters` + `filterRows` para selects propios (empresa, período…).
 * La búsqueda genérica ya viene del DataTable; no hace falta cablear un Input «Buscar».
 *
 * @example
 * <MockListPage
 *   title="Usuarios"
 *   queryKey="usuarios"
 *   tableKey="admin.usuarios"  // preferir modulo.entidad
 *   queryFn={api.getUsuarios}
 *   columns={[
 *     { key: 'nombre', header: 'Nombre', cell: (r) => r.nombre },
 *     { key: 'email', header: 'Email', cell: (r) => r.email },
 *     { key: 'activo', header: 'Estado', filterType: 'boolean',
 *       filterValue: (r) => r.activo, cell: (r) => ... },
 *   ]}
 * />
 */
export type MockFormValue = string | number | boolean;
export type MockFormValues = Record<string, MockFormValue>;

export type MockFormField = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'checkbox' | 'multicheck' | 'date' | 'month' | 'textarea' | 'email' | 'password';
  /** Semántica de validación/límites; si se omite se infiere de `name`/`type`. */
  kind?: InputKind;
  /** Si `type=number`, fuerza MontoInput (es-CL). Si se omite, se infiere del `name`. */
  montoKind?: MontoInputKind;
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: MockFormValue;
  maxLength?: number;
  minLength?: number;
  /** Campo no editable (p.ej. rol master). */
  disabled?: boolean;
  /** Solo dígitos (código de centro, elemento o código financiero). */
  digitsOnly?: boolean;
  /** Texto de ayuda bajo el campo. */
  hint?: string;
  /** Agrupa el campo bajo un título a ancho completo (el formulario sigue en dos columnas). */
  section?: string;
  /** Checkbox que se dibuja a la derecha del título de `section`, no en la grilla. */
  sectionHeader?: boolean;
  /** Texto del interruptor de sección según esté encendido o apagado. */
  sectionHeaderText?: { on: string; off: string };
  /** multicheck: al cambiar `selectionSyncKey`, preselecciona todas las opciones visibles. */
  autoSelectAll?: boolean;
  selectionSyncKey?: string;
  /** Validación adicional; retorna mensaje de error o null. */
  validate?: (
    value: MockFormValue,
    all: MockFormValues,
    editingId: string | number | null,
  ) => string | null;
};

export function mockEntityId(id?: string | number, prefix = 'NEW'): string {
  return id != null ? String(id) : `${prefix}-${Date.now()}`;
}

type MockListPageProps<T extends { id: string | number }> = {
  title: string;
  subtitle?: string;
  breadcrumbs?: string[];
  /** Si true, no renderiza PageHeader (útil cuando el título vive fuera). */
  hideHeader?: boolean;
  queryKey: string | readonly unknown[];
  /**
   * Clave estable para preferencias de columnas (show/hide + orden).
   * Preferir formato `modulo.entidad` (ej. `admin.usuarios`).
   * Si se omite, se usa `queryKey` (solo si es string).
   */
  tableKey?: string;
  queryFn: () => Promise<T[]>;
  columns: Column<T>[];
  /**
   * Controles de filtro propios de la pantalla (selects, toggles).
   * La búsqueda rápida/avanzada la aporta DataTable; este slot es adicional.
   */
  filters?: ReactNode;
  /** Filtra filas en cliente antes de la tabla (usar con el slot `filters`). */
  filterRows?: (rows: T[]) => T[];
  kpis?: ReactNode;
  createLabel?: string;
  entityLabel?: string;
  formFields?: MockFormField[];
  /**
   * Ajusta campos al editar/crear (p.ej. deshabilitar rol de usuario master).
   * Si se omite, se usan `formFields` tal cual.
   */
  resolveFormFields?: (ctx: {
    editingId: string | number | null;
    rows: T[];
    values: MockFormValues;
  }) => MockFormField[];
  formSize?: 'sm' | 'md' | 'lg' | 'xl';
  buildMockRow?: (values: MockFormValues, id?: string | number) => T;
  rowToFormValues?: (row: T) => MockFormValues;
  onSave?: (values: MockFormValues, id?: string | number) => Promise<void>;
  onDelete?: (id: string | number) => Promise<void>;
  /** Si retorna false, oculta lápiz de editar en esa fila. */
  canEditRow?: (row: T) => boolean;
  /** Si retorna false, oculta basura de eliminar en esa fila. */
  canDeleteRow?: (row: T) => boolean;
  /**
   * Otras query keys a invalidar tras guardar (sinergias A→B).
   * Ej. tras crear cliente: `['clientes']` ya se invalida; pasar `[['documentos']]` no hace falta
   * si B lee `clientes`. Usar para KPIs/aprobaciones derivadas: `['aprobaciones-oc','dashboard-kpis']`.
   */
  invalidateKeys?: readonly (string | readonly unknown[])[];
  /** Permite cascada (p.ej. labor → actividad) al cambiar un campo. */
  onFieldChange?: (
    name: string,
    value: MockFormValue,
    values: MockFormValues,
  ) => MockFormValues | void;
  /** Se llama al abrir create/edit (p.ej. sincronizar filtros de selects dependientes). */
  onFormOpen?: (values: MockFormValues, editingId: string | number | null) => void;
  headerAction?: ReactNode;
  /** Acciones extra junto al botón Crear (no reemplaza create). */
  headerExtra?: ReactNode;
  /** Extra en la barra de la tabla, a la izquierda de Columnas. */
  toolbarExtra?: ReactNode;
  /** Valores iniciales al crear (se fusionan con defaults del form). */
  createDefaults?: MockFormValues;
  /** Abre el formulario de alta al montar (p.ej. deep-link desde cartola). */
  autoOpenCreate?: boolean;
  /** Click en fila. Si se omite y hay form, abre edición. */
  onRowClick?: (row: T) => void;
  includeAuthzError?: boolean;
  /**
   * Bloque extra bajo el formulario (historial, acciones acotadas).
   * Recibe el estado actual del modal.
   */
  formExtra?: (ctx: {
    editingId: string | number | null;
    values: MockFormValues;
    rows: T[];
    setField: (name: string, value: MockFormValue) => void;
  }) => ReactNode;
  /** Semilla de búsqueda rápida del DataTable (p.ej. `?q=`). */
  initialSearch?: string;
  searchPlaceholder?: string;
  enableExport?: boolean;
  exportFilename?: string;
  /** Validación cruzada antes de guardar (override, fechas, etc.). */
  formValidate?: (
    values: MockFormValues,
    editingId: string | number | null,
  ) => string | null;
};

const MONTO_KIND_SKIP = /anio|año|dias|cantidad|factor|movimientos|plazo/i;

function resolveMontoKind(name: string, explicit?: MontoInputKind): MontoInputKind | null {
  if (explicit) return explicit;
  if (MONTO_KIND_SKIP.test(name)) return null;
  const n = name.toLowerCase();
  if (
    n.includes('preciocompra')
    || n.includes('preciounitario')
    || n.includes('precio')
    || n.includes('tarifa')
  ) {
    return 'precio';
  }
  if (n.includes('tcmanual') || n.includes('tcaplicado') || n.includes('tc')) {
    return 'tc';
  }
  if (n.includes('monto') || n.includes('credito') || n.includes('crédito')) {
    return 'monto';
  }
  return null;
}

function mockMontoValue(v: MockFormValue | undefined): number | null {
  if (v === '' || v === undefined || typeof v === 'boolean') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function initialValues(fields: MockFormField[]): MockFormValues {
  return Object.fromEntries(
    fields.map((f) => [
      f.name,
      f.defaultValue ?? (f.type === 'checkbox' ? false : f.type === 'multicheck' ? '' : ''),
    ]),
  );
}

export function MockListPage<T extends { id: string | number }>({
  title,
  subtitle,
  breadcrumbs,
  hideHeader = false,
  queryKey,
  tableKey,
  queryFn,
  columns,
  filters,
  filterRows,
  kpis,
  createLabel = 'Nuevo',
  entityLabel,
  formFields,
  resolveFormFields,
  formSize = 'md',
  buildMockRow,
  rowToFormValues,
  onSave,
  onDelete,
  canEditRow,
  canDeleteRow,
  invalidateKeys,
  onFieldChange,
  onFormOpen,
  headerAction,
  headerExtra,
  toolbarExtra,
  createDefaults,
  autoOpenCreate,
  formExtra,
  onRowClick,
  includeAuthzError = false,
  initialSearch,
  searchPlaceholder,
  enableExport = false,
  exportFilename,
  formValidate,
}: MockListPageProps<T>) {
  const qc = useQueryClient();
  const { demoMode } = useAppSettings();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const parts = Array.isArray(queryKey) ? [...queryKey] : [queryKey];
  const rqKey = listQueryKey(scope, empresaId, ...parts);
  const prefsKey = tableKey ?? (typeof queryKey === 'string' ? queryKey : String(queryKey[0] ?? 'list'));
  const query = useQuery({
    queryKey: rqKey,
    queryFn,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const data = query.data ?? [];
  const { isLoading } = query;
  const hasBlockingQueryError = query.isError && query.data == null;
  const rows = filterRows ? filterRows(data) : data;
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [formValues, setFormValues] = useState<MockFormValues>({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | number | null>(null);

  const label = entityLabel ?? title.replace(/s$/, '').toLowerCase();
  const canForm = Boolean(formFields?.length && buildMockRow);
  const activeFormFields = resolveFormFields
    ? resolveFormFields({ editingId, rows: data, values: formValues })
    : (formFields ?? []);
  const multicheckSyncRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!formOpen || editingId != null) return;
    let patch: MockFormValues | null = null;
    for (const f of activeFormFields) {
      if (f.type !== 'multicheck' || !f.autoSelectAll || !f.selectionSyncKey) continue;
      const opts = f.options ?? [];
      if (!opts.length) continue;
      if (multicheckSyncRef.current[f.name] === f.selectionSyncKey) continue;
      multicheckSyncRef.current[f.name] = f.selectionSyncKey;
      patch = { ...(patch ?? {}), [f.name]: opts.map((o) => o.value).join(',') };
    }
    if (patch) {
      setFormValues((prev) => ({ ...prev, ...patch! }));
    }
  }, [formOpen, editingId, activeFormFields]);

  const openCreate = () => {
    if (!formFields) return;
    multicheckSyncRef.current = {};
    const values = { ...initialValues(formFields), ...createDefaults };
    setEditingId(null);
    setFormValues(values);
    onFormOpen?.(values, null);
    setFormOpen(true);
  };

  const createDefaultsKey = createDefaults
    ? Object.entries(createDefaults).map(([k, v]) => `${k}:${String(v)}`).join('|')
    : '';

  useEffect(() => {
    if (autoOpenCreate && canForm) openCreate();
    // Deep-link: abrir al llegar o cuando cambian los defaults
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenCreate, createDefaultsKey]);

  const openEdit = (row: T) => {
    if (!formFields || !rowToFormValues) return;
    const values = rowToFormValues(row);
    setEditingId(row.id);
    setFormValues(values);
    onFormOpen?.(values, row.id);
    setFormOpen(true);
  };

  const setField = useCallback((name: string, value: MockFormValue) => {
    setFormValues((s) => {
      const next = { ...s, [name]: value };
      const patched = onFieldChange?.(name, value, next);
      return patched ?? next;
    });
  }, [onFieldChange]);

  const handleSave = async () => {
    if (!formFields || !buildMockRow) return;
    const fields = activeFormFields.length ? activeFormFields : formFields;
    const sanitized: MockFormValues = { ...formValues };
    // En edición: no revalidar checksum de un RUT ya persistido si el usuario no lo cambió
    // (ADM-RUT-01: desactivar empresa no debe fallar por DV histórico inválido).
    const originalValues =
      editingId != null && rowToFormValues
        ? (() => {
            const row = data.find((r) => r.id === editingId);
            return row ? rowToFormValues(row) : null;
          })()
        : null;

    for (const f of fields) {
      if (f.type === 'select' || f.type === 'checkbox' || f.type === 'multicheck' || f.type === 'date' || f.type === 'month') continue;

      const raw = formValues[f.name];
      if (f.type === 'number') {
        if (f.required && (raw === '' || raw === undefined || raw === null)) {
          toast.error(`Completa el campo «${f.label}»`);
          return;
        }
        if (raw !== '' && raw !== undefined && raw !== null && !isFiniteAmount(Number(raw))) {
          toast.error(`«${f.label}» debe ser un número válido`);
          return;
        }
        continue;
      }

      const kind = inferInputKind(f.name, f.type, f.kind);
      const maxLen = f.maxLength ?? maxLengthForKind(kind);
      const str = clampString(String(raw ?? ''), maxLen);
      sanitized[f.name] = str;

      if (f.required && !str.trim()) {
        toast.error(`Completa el campo «${f.label}»`);
        return;
      }

      // Password opcional en edición: solo valida si hay valor
      if (kind === 'password' && !str) continue;

      const err = validateFieldValue(kind, str, {
        required: f.required,
        minLength: f.minLength,
        maxLength: maxLen,
      });
      if (err) {
        toast.error(`«${f.label}»: ${err.message}`);
        return;
      }
      if (kind === 'rut') {
        if (!str.trim()) continue;
        const originalRut = originalValues ? String(originalValues[f.name] ?? '').trim() : '';
        const rutUnchanged =
          editingId != null
          && originalRut.length > 0
          && originalRut.replace(/[.\s-]/g, '').toUpperCase()
            === str.replace(/[.\s-]/g, '').toUpperCase();
        if (rutUnchanged) continue;
        const fiscalId = validateFiscalId(str, { demoMode, allowForeign: true });
        if (!fiscalId.valid) {
          toast.error(`«${f.label}»: ${fiscalId.error}`);
          return;
        }
        if (fiscalId.warning) toast.warning(`«${f.label}»: ${fiscalId.warning}`);
      }
    }

    // required en select/date/checkbox/multicheck
    for (const f of fields) {
      if (!f.required) continue;
      if (f.type === 'number' || f.type === 'checkbox') continue;
      if (f.type === 'select' || f.type === 'date' || f.type === 'month' || f.type === 'multicheck') {
        const v = sanitized[f.name];
        if (v === '' || v === undefined || v === null) {
          toast.error(`Completa el campo «${f.label}»`);
          return;
        }
      }
    }

    for (const f of fields) {
      if (f.kind === 'rut' || inferInputKind(f.name, f.type, f.kind) === 'rut') {
        const raw = String(sanitized[f.name] ?? '').trim();
        if (raw) sanitized[f.name] = formatRutDisplay(raw);
      }
    }

    for (const f of fields) {
      if (!f.validate) continue;
      const err = f.validate(sanitized[f.name], sanitized, editingId);
      if (err) {
        toast.error(`«${f.label}»: ${err}`);
        return;
      }
    }
    if (formValidate) {
      const cross = formValidate(sanitized, editingId);
      if (cross) {
        toast.error(cross);
        return;
      }
    }

    setFormValues(sanitized);
    setSaving(true);
    try {
      if (onSave) {
        await onSave(sanitized, editingId ?? undefined);
        const key = rqKey;
        await qc.invalidateQueries({ queryKey: key });
        await qc.refetchQueries({ queryKey: key });
        if (invalidateKeys?.length) {
          for (const k of invalidateKeys) {
            const parts = Array.isArray(k) ? [...k] : [k];
            await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, ...parts) });
          }
        }
        toast.success(editingId ? `${label} actualizado` : `${label} creado`);
      } else {
        const row = buildMockRow(sanitized, editingId ?? undefined);
        qc.setQueryData<T[]>(rqKey, (old = []) => {
          if (editingId != null) {
            return old.map((r) => (r.id === editingId ? { ...r, ...row, id: editingId } : r));
          }
          return [row, ...old];
        });
        toast.success(editingId ? `${label} actualizado` : `${label} creado`);
      }
      setFormOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string | number) => {
    if (!onDelete) return;
    setConfirmDeleteId(id);
  };

  const doDelete = async () => {
    if (!onDelete || confirmDeleteId == null) return;
    const id = confirmDeleteId;
    setDeletingId(id);
    try {
      await onDelete(id);
      await qc.invalidateQueries({ queryKey: rqKey });
      toast.success(`${label} eliminado`);
      setConfirmDeleteId(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar';
      toast.error(msg);
    } finally {
      setDeletingId(null);
    }
  };

  const tableColumns: Column<T>[] = canForm && rowToFormValues
    ? [
        ...columns,
        {
          key: '_actions',
          header: 'Acciones',
          align: 'right',
          sortable: false,
          filterable: false,
          hideable: false,
          cell: (r) => {
            const editable = !canEditRow || canEditRow(r);
            const deletable = Boolean(onDelete) && (!canDeleteRow || canDeleteRow(r));
            const editTitle = editable ? 'Editar' : 'No editable en este estado';
            return (
            <span className="inline-flex items-center gap-0.5">
              <button
                type="button"
                title={editTitle}
                disabled={!editable}
                className="rounded-full p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[var(--color-muted)]"
                onClick={(e) => { e.stopPropagation(); if (editable) openEdit(r); }}
              >
                <Pencil size={14} />
              </button>
              {onDelete && (
                <button
                  type="button"
                  title={deletable ? 'Eliminar' : 'No se puede eliminar en este estado'}
                  disabled={!deletable || deletingId === r.id}
                  className="rounded-full p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[var(--color-muted)]"
                  onClick={(e) => { e.stopPropagation(); if (deletable) void handleDelete(r.id); }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </span>
            );
          },
        },
      ]
    : columns;

  return (
    <div>
      {!hideHeader && (
        <PageHeader
          title={title}
          subtitle={subtitle}
          breadcrumbs={breadcrumbs}
          action={
            headerAction ?? (
              (canForm || headerExtra) ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {headerExtra}
                  {canForm && (
                    <Button leftIcon={<Plus size={16} />} onClick={openCreate}>
                      {createLabel}
                    </Button>
                  )}
                </span>
              ) : undefined
            )
          }
        />
      )}
      {kpis && <div className="mb-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">{kpis}</div>}
      {filters && (
        <div className="mb-3 flex flex-wrap gap-3">
          {filters}
        </div>
      )}
      <QueryErrorAlert
        error={query.error}
        data={query.data}
        isLoading={isLoading}
        resource={title.toLowerCase()}
        onRetry={() => void query.refetch()}
        className="mb-3"
        includeAuthzError={includeAuthzError}
      />
      {isLoading ? (
        <div className="rounded-lg border border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-muted)]">Cargando…</div>
      ) : !hasBlockingQueryError ? (
        <DataTable
          columns={tableColumns}
          rows={rows}
          empty="Sin datos"
          tableKey={prefsKey}
          pagination={{ storageKey: `erp-${queryKey}` }}
          onRowClick={onRowClick ?? (canForm && rowToFormValues ? openEdit : undefined)}
          initialSearch={initialSearch}
          searchPlaceholder={searchPlaceholder}
          enableExport={enableExport}
          exportFilename={exportFilename}
          toolbarExtra={toolbarExtra}
        />
      ) : null}

      {canForm && (
        <Modal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title={editingId ? `Editar ${label}` : createLabel}
          size={formSize}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear'}
              </Button>
            </>
          )}
        >
          {activeFormFields.some((f) => f.required) ? (
            <p className="mb-3 text-xs text-[var(--color-muted)]">
              Los campos marcados con <span className="text-[var(--color-danger)]">*</span> son obligatorios.
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {activeFormFields.map((f, index) => {
              const showSection = Boolean(f.section) && f.section !== activeFormFields[index - 1]?.section;
              const sectionToggle = showSection
                ? activeFormFields.find((candidate) => candidate.section === f.section && candidate.sectionHeader && candidate.type === 'checkbox')
                : undefined;
              if (f.sectionHeader) {
                if (!showSection) return null;
              }
              const kind = inferInputKind(f.name, f.type, f.kind);
              const maxLen = f.maxLength ?? maxLengthForKind(kind);
              const montoKind = f.type === 'number' ? resolveMontoKind(f.name, f.montoKind) : null;
              const htmlType =
                f.type === 'number' ? 'number'
                  : f.type === 'date' ? 'date'
                    : f.type === 'email' || kind === 'email' ? 'email'
                      : f.type === 'password' || kind === 'password' ? 'password'
                        : 'text';
              return (
              <Fragment key={f.name}>
              {showSection ? (
                <div className={`sm:col-span-2 flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-1 ${index > 0 ? 'mt-2' : ''}`}>
                  <h3 className="text-sm font-semibold text-[var(--color-text)]">
                    {f.section}
                  </h3>
                  {sectionToggle ? (
                    <label className="flex items-center gap-3">
                      <span className="text-base font-bold text-[var(--color-text)]">
                        {formValues[sectionToggle.name]
                          ? (sectionToggle.sectionHeaderText?.on ?? sectionToggle.label)
                          : (sectionToggle.sectionHeaderText?.off ?? sectionToggle.label)}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={Boolean(formValues[sectionToggle.name])}
                        aria-label={formValues[sectionToggle.name]
                          ? (sectionToggle.sectionHeaderText?.on ?? sectionToggle.label)
                          : (sectionToggle.sectionHeaderText?.off ?? sectionToggle.label)}
                        disabled={sectionToggle.disabled}
                        onClick={() => setField(sectionToggle.name, !formValues[sectionToggle.name])}
                        className="relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ backgroundColor: formValues[sectionToggle.name] ? '#1a5c2e' : '#b0192b' }}
                      >
                        <span
                          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
                            formValues[sectionToggle.name] ? 'left-5' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </label>
                  ) : null}
                </div>
              ) : null}
              {f.sectionHeader ? null : (
              <Field
                label={f.label}
                required={f.required}
                className={f.type === 'textarea' || f.type === 'multicheck' ? 'sm:col-span-2' : undefined}
              >
                {f.type === 'select' ? (
                  <SearchableSelect
                    value={String(formValues[f.name] ?? '')}
                    onChange={(v) => setField(f.name, v)}
                    options={f.options ?? []}
                    placeholder="Seleccionar…"
                    disabled={f.disabled}
                  />
                ) : f.type === 'multicheck' ? (
                  <div className="max-h-[min(50vh,22rem)] space-y-2 overflow-auto rounded border border-[var(--color-border)] p-2 text-sm">
                    {(f.options ?? []).map((opt) => {
                      const selected = String(formValues[f.name] ?? '')
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean);
                      const checked = selected.includes(opt.value);
                      return (
                        <Checkbox
                          key={opt.value}
                          label={opt.label}
                          labelClassName="text-sm leading-snug break-words"
                          checked={checked}
                          disabled={f.disabled}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selected, opt.value]
                              : selected.filter((x) => x !== opt.value);
                            setField(f.name, next.join(','));
                          }}
                        />
                      );
                    })}
                    {!(f.options ?? []).length && (
                      <p className="text-xs text-[var(--color-muted)]">Sin opciones</p>
                    )}
                  </div>
                ) : f.type === 'checkbox' ? (
                  <Checkbox
                    label="Activo"
                    checked={Boolean(formValues[f.name])}
                    disabled={f.disabled}
                    onChange={(e) => setField(f.name, e.target.checked)}
                  />
                ) : f.type === 'textarea' ? (
                  <Textarea
                    value={String(formValues[f.name] ?? '')}
                    placeholder={f.placeholder}
                    maxLength={maxLen}
                    disabled={f.disabled}
                    onChange={(e) => setField(f.name, e.target.value)}
                  />
                ) : kind === 'rut' ? (
                  <RutInput
                    value={String(formValues[f.name] ?? '')}
                    placeholder={f.placeholder}
                    disabled={f.disabled}
                    onChange={(v) => setField(f.name, v)}
                  />
                ) : f.type === 'date' ? (
                  <DateInput
                    mode="date"
                    value={String(formValues[f.name] ?? '')}
                    disabled={f.disabled}
                    onChange={(v) => setField(f.name, v)}
                  />
                ) : f.type === 'month' ? (
                  <DateInput
                    mode="month"
                    value={String(formValues[f.name] ?? '')}
                    disabled={f.disabled}
                    onChange={(v) => setField(f.name, v)}
                  />
                ) : montoKind ? (
                  <MontoInput
                    kind={montoKind}
                    value={mockMontoValue(formValues[f.name])}
                    placeholder={f.placeholder}
                    disabled={f.disabled}
                    allowNegative={/diferencia/i.test(f.name)}
                    onChange={(v) => setField(f.name, v ?? '')}
                  />
                ) : (
                  <Input
                    type={htmlType}
                    value={String(formValues[f.name] ?? '')}
                    placeholder={f.placeholder}
                    maxLength={f.type === 'number' ? undefined : maxLen}
                    autoComplete={kind === 'password' ? 'new-password' : undefined}
                    disabled={f.disabled}
                    inputMode={f.digitsOnly ? 'numeric' : undefined}
                    onChange={(e) => {
                      const raw = f.digitsOnly ? e.target.value.replace(/\D/g, '') : e.target.value;
                      setField(f.name, f.type === 'number' ? Number(raw) : raw);
                    }}
                  />
                )}
                {f.hint && (
                  <p className="mt-1 text-[11px] text-[var(--color-muted)]">{f.hint}</p>
                )}
              </Field>
              )}
              </Fragment>
              );
            })}
          </div>
          {formExtra?.({ editingId, values: formValues, rows, setField })}
        </Modal>
      )}

      <Modal
        open={confirmDeleteId != null}
        onClose={() => setConfirmDeleteId(null)}
        title={`Eliminar ${label}`}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>Cancelar</Button>
            <Button variant="danger" disabled={deletingId != null} onClick={() => void doDelete()}>
              Eliminar
            </Button>
          </>
        )}
      >
        <p className="text-sm text-[var(--color-muted)]">¿Eliminar este {label}?</p>
      </Modal>
    </div>
  );
}
