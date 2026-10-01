import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueryScope, useEmpresaScopeId, listQueryKey, scopedQueryKey } from '@/hooks/useQueryScope';
import { MockListPage, mockEntityId, type MockFormField } from '@/components/common/MockListPage';
import { CatalogExcelImport } from '@/components/common/CatalogExcelImport';
import { CATALOG_EXCEL_ELEMENTO_KEYS } from '@/components/common/catalog-excel-import.util';
import { descargarPlantillaElementos, exportarElementos } from '@/features/catalogos/catalog-excel-plantilla';
import { PageHeader } from '@/components/common/PageHeader';
import { EstadoGenericoBadge } from '@/components/common/Badges';
import { Badge } from '@/components/ui/badge';
import { KPI } from '@/components/common/KPI';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { FileSpreadsheet, Download, Upload, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ElementoCosto, FactorHonorario, IndicadorBc } from '@/types/domain';
import { fmtDate, localIsoDate } from '@/lib/utils';
import { exportRowsToExcel } from '@/lib/exportTable';
import { useAuth } from '@/app/auth-context';
import { hasPermission } from '@/lib/permissions';
import * as api from '@/services/api';
import { IndicadoresBcImport } from './IndicadoresBcImport';
import { faltaUsdBcDelDia } from '@/features/tesoreria/tipo-cambio';
import { HINT_CODIGO_SUGERIDO, siguienteCodigoNumerico } from '@/features/catalogos/siguiente-codigo';

function fmtIndicadorTc(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n)) || Number(n) <= 0) return '—';
  return Number(n).toFixed(2);
}

/** En UI mostramos origen oficial; el canal técnico puede ser un proxy del BC. */
function labelFuenteBc(fuente?: string | null) {
  const f = (fuente ?? '').trim().toLowerCase();
  if (f.includes('excel') || f.includes('import')) return 'Excel (histórico)';
  if (!f || f.includes('mindicador') || f === 'bcch' || f === 'bc') return 'Banco Central';
  return fuente!.trim();
}

export { PlanCuentasPage } from './PlanCuentasPage';
export { AsientosPage } from './AsientosPage';

export function ElementosCostoPage() {
  const scope = useQueryScope();
  const empresaScope = useEmpresaScopeId();
  const listQ = useQuery({
    queryKey: listQueryKey(scope, empresaScope, 'elementos-costo'),
    queryFn: api.getElementosCosto,
  });
  const hoy = localIsoDate();
  const siguienteCodigo = useMemo(
    () => siguienteCodigoNumerico((listQ.data ?? []).map((r) => r.codigo)),
    [listQ.data],
  );

  const formFields: MockFormField[] = [
    { name: 'codigo', label: 'Código', required: true, placeholder: '1' },
    { name: 'nombre', label: 'Nombre', required: true },
    { name: 'departamento', label: 'Departamento', required: true },
    {
      name: 'vigenciaDesdeLabel',
      label: 'Vigente desde',
      disabled: true,
      defaultValue: hoy,
      hint: 'Fecha de alta (automática)',
    },
    {
      name: 'vigencia',
      label: 'Vigencia',
      type: 'select',
      defaultValue: 'VIGENTE',
      options: [
        { value: 'VIGENTE', label: 'Vigente' },
        { value: 'ANULADO', label: 'Anulado' },
      ],
    },
  ];

  return (
    <MockListPage<ElementoCosto>
      title="Elementos de costo"
      breadcrumbs={['Parametrización']}
      queryKey="elementos-costo"
      queryFn={api.getElementosCosto}
      createLabel="Nuevo elemento"
      entityLabel="Elemento"
      tableKey="contabilidad.elementos-costo"
      enableExport
      exportFilename="elementos-costo"
      createDefaults={{ codigo: siguienteCodigo, vigencia: 'VIGENTE', vigenciaDesdeLabel: hoy }}
      resolveFormFields={({ editingId, rows }) => {
        const isEdit = editingId != null;
        const row = isEdit ? rows.find((r) => r.id === editingId) : undefined;
        const vigenteDesde = isEdit
          ? (row?.createdAt ? String(row.createdAt).slice(0, 10) : '—')
          : hoy;
        return [
          {
            name: 'codigo',
            label: 'Código',
            required: true,
            placeholder: '1',
            disabled: isEdit,
            digitsOnly: !isEdit,
            hint: isEdit ? undefined : HINT_CODIGO_SUGERIDO,
            validate: (v, _all, id) => {
              if (id != null) return null;
              const c = String(v ?? '').trim();
              if (!c) return null;
              if (!/^\d+$/.test(c)) return 'El código solo admite dígitos (0-9)';
              return null;
            },
          },
          { name: 'nombre', label: 'Nombre', required: true },
          { name: 'departamento', label: 'Departamento', required: true },
          {
            name: 'vigenciaDesdeLabel',
            label: 'Vigente desde',
            disabled: true,
            defaultValue: vigenteDesde,
            hint: isEdit ? undefined : 'Fecha de alta (automática)',
          },
          ...(isEdit
            ? [{
                name: 'vigencia',
                label: 'Vigencia',
                type: 'select' as const,
                options: [
                  { value: 'VIGENTE', label: 'Vigente' },
                  { value: 'ANULADO', label: 'Anulado' },
                ],
              }]
            : []),
        ];
      }}
      headerExtra={
        <CatalogExcelImport
          queryKey="elementos-costo"
          title="Preview elementos de costo"
          hint="Descargue la plantilla (hoja Elementos de costo), reemplace la fila de ejemplo y súbala. Exportar baja lo cargado en ese mismo formato."
          onDescargarPlantilla={descargarPlantillaElementos}
          onExportar={() => exportarElementos(listQ.data ?? [])}
          columns={[
            { key: 'codigo', header: 'Código' },
            { key: 'nombre', header: 'Nombre' },
            { key: 'departamento', header: 'Depto' },
          ]}
          previewFn={api.previewElementosCostoExcel}
          importFn={api.importElementosCostoExcel}
          importKeys={CATALOG_EXCEL_ELEMENTO_KEYS}
          historialTipo="ELEMENTOS_COSTO"
        />
      }
      formFields={formFields}
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'EL'),
        codigo: String(v.codigo).trim(),
        nombre: String(v.nombre).trim().toUpperCase(),
        departamento: String(v.departamento),
        vigencia: (id == null ? 'VIGENTE' : String(v.vigencia)) as ElementoCosto['vigencia'],
        createdAt: id == null ? `${hoy}T00:00:00.000Z` : undefined,
      })}
      rowToFormValues={(r) => ({
        codigo: r.codigo,
        nombre: r.nombre,
        departamento: r.departamento,
        vigencia: r.vigencia,
        vigenciaDesdeLabel: r.createdAt ? String(r.createdAt).slice(0, 10) : '',
      })}
      onSave={async (values, id) => {
        const codigo = String(values.codigo).trim();
        if (id == null && !/^\d+$/.test(codigo)) {
          throw new Error('El código solo admite dígitos (0-9)');
        }
        const payload = {
          codigo,
          nombre: String(values.nombre).trim().toUpperCase(),
          departamento: String(values.departamento),
          vigencia: (id == null ? 'VIGENTE' : String(values.vigencia)) as ElementoCosto['vigencia'],
        };
        if (id != null) await api.updateElementoCosto(String(id), payload);
        else await api.createElementoCosto(payload);
      }}
      columns={[
        { key: 'codigo', header: 'Código', cell: (r) => r.codigo },
        { key: 'nombre', header: 'Nombre', cell: (r) => r.nombre },
        { key: 'depto', header: 'Depto', cell: (r) => r.departamento },
        {
          key: 'vig',
          header: 'Vigencia',
          sortValue: (r) => r.vigencia,
          filterValue: (r) => r.vigencia,
          cell: (r) => <Badge tone={r.vigencia === 'VIGENTE' ? 'success' : 'muted'}>{r.vigencia}</Badge>,
        },
      ]}
    />
  );
}

export function HonorariosPage() {
  return (
    <MockListPage<FactorHonorario>
      title="Factores de honorarios"
      breadcrumbs={['Contabilidad']}
      queryKey="factores-honorario"
      queryFn={api.getFactoresHonorario}
      createLabel="Nuevo factor"
      entityLabel="Factor"
      formFields={[
        { name: 'factorAnterior', label: 'Factor anterior', type: 'number', required: true },
        { name: 'factorNuevo', label: 'Factor nuevo', type: 'number', required: true },
        { name: 'vigenciaDesde', label: 'Vigencia desde', type: 'date', required: true },
        { name: 'vigenciaHasta', label: 'Vigencia hasta (opcional)', type: 'date' },
        { name: 'usuario', label: 'Usuario', required: true },
      ]}
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'FH'),
        factorAnterior: Number(v.factorAnterior),
        factorNuevo: Number(v.factorNuevo),
        vigenciaDesde: String(v.vigenciaDesde),
        vigenciaHasta: v.vigenciaHasta ? String(v.vigenciaHasta) : undefined,
        usuario: String(v.usuario),
      })}
      rowToFormValues={(r) => ({
        factorAnterior: r.factorAnterior,
        factorNuevo: r.factorNuevo,
        vigenciaDesde: r.vigenciaDesde,
        vigenciaHasta: r.vigenciaHasta ?? '',
        usuario: r.usuario,
      })}
      onSave={async (values, id) => {
        const payload = {
          factorAnterior: Number(values.factorAnterior),
          factorNuevo: Number(values.factorNuevo),
          vigenciaDesde: String(values.vigenciaDesde),
          ...(values.vigenciaHasta ? { vigenciaHasta: String(values.vigenciaHasta) } : {}),
          usuario: String(values.usuario),
        };
        if (id != null) await api.updateFactorHonorario(String(id), payload);
        else await api.createFactorHonorario(payload);
      }}
      columns={[
        { key: 'ant', header: 'Anterior', cell: (r) => r.factorAnterior, align: 'right' },
        { key: 'nuevo', header: 'Nuevo', cell: (r) => r.factorNuevo, align: 'right' },
        {
          key: 'desde',
          header: 'Vigencia',
          cell: (r) =>
            `${fmtDate(r.vigenciaDesde)}${r.vigenciaHasta ? ` → ${fmtDate(r.vigenciaHasta)}` : ''}`,
        },
        {
          key: 'vigente',
          header: 'Vigente',
          cell: (r) => (r.vigente ? 'Sí' : 'No'),
        },
        { key: 'user', header: 'Usuario', cell: (r) => r.usuario },
      ]}
    />
  );
}

function labelOrigenSync(origen?: string | null) {
  if (origen === 'auto') return 'Automática';
  if (origen === 'manual') return 'Manual';
  if (origen === 'import') return 'Excel';
  return origen ? origen : '—';
}

const FREQ_OPTIONS = [
  { value: 30, label: 'Cada 30 min' },
  { value: 60, label: 'Cada 1 hora' },
  { value: 120, label: 'Cada 2 horas' },
  { value: 180, label: 'Cada 3 horas' },
  { value: 240, label: 'Cada 4 horas' },
  { value: 360, label: 'Cada 6 horas' },
];

export function IndicadoresBcPage() {
  const { user } = useAuth();
  const canWriteBc = hasPermission(user, 'catalogos:write') || hasPermission(user, 'contabilidad:write');
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const meta = useQuery({ queryKey: scopedQueryKey(scope, 'sync-bc-meta'), queryFn: api.getSyncBcMeta });
  const series = useQuery({ queryKey: scopedQueryKey(scope, 'bc-series'), queryFn: api.getBcSeries });
  const indicadoresQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'indicadores-bc'),
    queryFn: () => api.getIndicadoresBc(),
  });
  const faltaUsdHoy = useMemo(
    () => faltaUsdBcDelDia(indicadoresQ.data ?? [], localIsoDate()),
    [indicadoresQ.data],
  );
  const [syncDesde, setSyncDesde] = useState('');
  const [syncHasta, setSyncHasta] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncOpen, setSyncOpen] = useState(true);

  const [modo, setModo] = useState<'auto' | 'manual'>('manual');
  const [scheduleKind, setScheduleKind] = useState<'horarios' | 'intervalo'>('horarios');
  const [horarios, setHorarios] = useState<string[]>(['09:00']);
  const [frecuenciaMinutos, setFrecuenciaMinutos] = useState(60);
  const [ventanaInicio, setVentanaInicio] = useState('09:00');
  const [ventanaFin, setVentanaFin] = useState('18:00');
  const [diasHabiles, setDiasHabiles] = useState(true);

  useEffect(() => {
    const m = meta.data;
    if (!m) return;
    setModo(m.modo ?? 'manual');
    const freq = m.frecuenciaMinutos ?? null;
    setScheduleKind(freq ? 'intervalo' : 'horarios');
    setHorarios(m.horarios?.length ? m.horarios : [m.horaProgramada || '09:00']);
    setFrecuenciaMinutos(freq && freq > 0 ? freq : 60);
    setVentanaInicio(m.ventanaInicio || '09:00');
    setVentanaFin(m.ventanaFin || '18:00');
    setDiasHabiles(m.diasHabiles ?? true);
  }, [meta.data]);

  const ultimaSyncLabel = meta.data?.ultimaSync
    ? new Date(meta.data.ultimaSync).toLocaleString('es-CL')
    : '—';

  const saveProgramacion = async (nextModo?: 'auto' | 'manual') => {
    setSaving(true);
    try {
      await api.updateSyncBcMeta({
        modo: nextModo ?? modo,
        horarios: scheduleKind === 'horarios' ? horarios.filter(Boolean) : undefined,
        horaProgramada: scheduleKind === 'horarios' ? horarios[0] : undefined,
        frecuenciaMinutos: scheduleKind === 'intervalo' ? frecuenciaMinutos : null,
        ventanaInicio,
        ventanaFin,
        diasHabiles,
      });
      await qc.invalidateQueries({ queryKey: scopedQueryKey(scope, 'sync-bc-meta') });
      toast.success('Programación guardada');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Indicadores Banco Central"
        breadcrumbs={['Parametrización']}
        subtitle="Tipos de cambio oficiales del Banco Central de Chile (USD, Yuan, EUR). Importá el histórico de Mario; no se inventan 19 mil filas."
        action={canWriteBc ? <IndicadoresBcImport /> : undefined}
      />

      {(meta.isError || series.isError) && (
        <p role="alert" className="text-sm text-red-700">
          {(meta.error instanceof Error ? meta.error.message : null)
            || (series.error instanceof Error ? series.error.message : null)
            || 'No se pudo cargar la programación o las series BC.'}
        </p>
      )}

      {faltaUsdHoy && (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
          No hay tipo de cambio USD del Banco Central para hoy. En local el cron solo corre
          si el API está levantado. Sincronice ahora (botón de esta pantalla) o deje el
          proceso encendido en horario hábil.
        </div>
      )}

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--color-surface-2)]"
          onClick={() => setSyncOpen((v) => !v)}
          aria-expanded={syncOpen}
        >
          <div className="min-w-0 flex items-start gap-2">
            {syncOpen ? (
              <ChevronDown size={16} className="mt-0.5 shrink-0 text-[var(--color-muted)]" />
            ) : (
              <ChevronRight size={16} className="mt-0.5 shrink-0 text-[var(--color-muted)]" />
            )}
            <div className="min-w-0">
              <div className="font-medium text-[var(--color-text)]">Sincronización Banco Central</div>
              <div className="truncate text-[var(--color-muted)]">
                {modo === 'auto' ? 'Automática activa' : 'Solo manual'} · Última sync: {ultimaSyncLabel}
                {meta.data?.lastStatus ? ` · ${meta.data.lastStatus}` : ''}
              </div>
            </div>
          </div>
        </button>

        {syncOpen && (
          <div className="space-y-4 border-t border-[var(--color-border)] px-4 py-3">
            {!canWriteBc ? (
              <p className="text-xs text-[var(--color-muted)]">
                Solo lectura. Importar histórico o sincronizar requiere permiso de escritura en Parametrización o Contabilidad.
              </p>
            ) : (
              <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Checkbox
                label="Sincronización automática"
                className="cursor-pointer"
                checked={modo === 'auto'}
                onChange={async (e) => {
                  const next = e.target.checked ? 'auto' : 'manual';
                  setModo(next);
                  await saveProgramacion(next);
                }}
              />
              <Button
                size="sm"
                leftIcon={<Upload size={14} />}
                disabled={syncing}
                onClick={async () => {
                  setSyncing(true);
                  try {
                    const res = await api.syncIndicadoresBc(
                      syncDesde && syncHasta
                        ? { desde: syncDesde, hasta: syncHasta }
                        : undefined,
                    );
                    await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'indicadores-bc') });
                    await qc.invalidateQueries({ queryKey: scopedQueryKey(scope, 'sync-bc-meta') });
                    toast.success(
                      `Consulta manual OK (${typeof res === 'object' && res && 'count' in res ? res.count : 1} día/s)`,
                    );
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Error');
                  } finally {
                    setSyncing(false);
                  }
                }}
              >
                {syncing ? 'Consultando…' : 'Consultar ahora (manual)'}
              </Button>
            </div>

            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="mb-1 block text-xs text-[var(--color-muted)]">Rango manual desde</label>
                <Input type="date" value={syncDesde} onChange={(e) => setSyncDesde(e.target.value)} className="w-40" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--color-muted)]">Hasta</label>
                <Input type="date" value={syncHasta} onChange={(e) => setSyncHasta(e.target.value)} className="w-40" />
              </div>
              <p className="text-xs text-[var(--color-muted)] pb-2">
                Vacío = solo hoy. Máx. ~60 días por consulta.
              </p>
            </div>

            <div className="rounded-md border border-[var(--color-border)] p-3 space-y-3">
              <div className="font-medium">Programación automática</div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="bc-schedule-kind"
                    checked={scheduleKind === 'horarios'}
                    onChange={() => setScheduleKind('horarios')}
                  />
                  Horas fijas del día
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="bc-schedule-kind"
                    checked={scheduleKind === 'intervalo'}
                    onChange={() => setScheduleKind('intervalo')}
                  />
                  Cada cierto intervalo
                </label>
              </div>

              {scheduleKind === 'horarios' ? (
                <div className="space-y-2">
                  <div className="text-xs text-[var(--color-muted)]">
                    Se consulta en cada hora indicada (zona America/Santiago).
                  </div>
                  {horarios.map((h, i) => (
                    <div key={`${i}-${h}`} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={h}
                        onChange={(e) => {
                          const next = [...horarios];
                          next[i] = e.target.value;
                          setHorarios(next);
                        }}
                        className="w-36"
                      />
                      {horarios.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setHorarios(horarios.filter((_, j) => j !== i))}
                          leftIcon={<Trash2 size={14} />}
                        >
                          Quitar
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    leftIcon={<Plus size={14} />}
                    onClick={() => setHorarios([...horarios, '12:00'])}
                  >
                    Agregar hora
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="mb-1 block text-xs text-[var(--color-muted)]">Frecuencia</label>
                    <select
                      className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
                      value={frecuenciaMinutos}
                      onChange={(e) => setFrecuenciaMinutos(Number(e.target.value))}
                    >
                      {FREQ_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--color-muted)]">Desde</label>
                    <Input type="time" value={ventanaInicio} onChange={(e) => setVentanaInicio(e.target.value)} className="w-36" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--color-muted)]">Hasta</label>
                    <Input type="time" value={ventanaFin} onChange={(e) => setVentanaFin(e.target.value)} className="w-36" />
                  </div>
                </div>
              )}

              <Checkbox
                label="Solo días hábiles (lunes a viernes)"
                className="cursor-pointer"
                checked={diasHabiles}
                onChange={(e) => setDiasHabiles(e.target.checked)}
              />

              <Button size="sm" variant="secondary" disabled={saving} onClick={() => saveProgramacion()}>
                {saving ? 'Guardando…' : 'Guardar programación'}
              </Button>

              {(meta.data?.lastError || (meta.data?.failStreak ?? 0) > 0) && (
                <p className="text-xs text-[var(--color-danger)]">
                  {meta.data?.failStreak ? `${meta.data.failStreak} fallo(s) seguido(s). ` : ''}
                  {meta.data?.lastError ?? ''}
                </p>
              )}
            </div>
              </>
            )}

            {series.data && series.data.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-[var(--color-muted)]">Series disponibles</div>
                <div className="flex flex-wrap gap-1.5">
                  {series.data.filter((s) => s.seleccionable).map((s) => (
                    <span
                      key={s.codigo}
                      className="rounded-full border border-[var(--color-border)] px-2.5 py-0.5 text-xs"
                      title={s.nombre}
                    >
                      {s.mapeoErp}: {s.nombre}
                      {s.valorActual != null ? ` · ${s.valorActual}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <MockListPage<IndicadorBc>
        title="Historial"
        hideHeader
        queryKey="indicadores-bc"
        tableKey="catalogos.indicadores-bc"
        queryFn={() => api.getIndicadoresBc()}
        includeAuthzError
        columns={[
          { key: 'fecha', header: 'Fecha indicador', cell: (r) => fmtDate(r.fecha) },
          { key: 'usd', header: 'USD', cell: (r) => fmtIndicadorTc(r.usd), align: 'right' },
          { key: 'eur', header: 'EUR', cell: (r) => fmtIndicadorTc(r.eur), align: 'right' },
          { key: 'cny', header: 'Yuan (CNY)', cell: (r) => fmtIndicadorTc(r.cny), align: 'right' },
          { key: 'fuente', header: 'Fuente', cell: (r) => labelFuenteBc(r.fuente) },
          {
            key: 'origen',
            header: 'Origen',
            cell: (r) => labelOrigenSync(r.origenSync),
          },
          {
            key: 'consultado',
            header: 'Consultado',
            cell: (r) => (r.consultadoEn ? new Date(r.consultadoEn).toLocaleString('es-CL') : '—'),
          },
          {
            key: 'fer',
            header: 'Feriado/dom.',
            cell: (r) => (r.completadoFeriado ? <Badge tone="warning">Completado</Badge> : <Badge tone="success">BC</Badge>),
          },
        ]}
      />
    </div>
  );
}

export function ReportesContablesPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const { data = [] } = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'reportes-contables'),
    queryFn: api.getReportesContables,
  });
  const disponibles = data.filter((r) => r.estado === 'DISPONIBLE').length;

  return (
    <div>
      <PageHeader
        title="Reportes contables"
        breadcrumbs={['Contabilidad']}
        action={
          <Button
            leftIcon={<Download size={16} />}
            variant="secondary"
            onClick={() => {
              exportRowsToExcel(
                'reportes-contables',
                [
                  { key: 'nombre', header: 'Reporte', value: (r) => r.nombre },
                  { key: 'periodo', header: 'Periodo', value: (r) => r.periodo },
                  { key: 'estado', header: 'Estado', value: (r) => r.estado },
                ],
                data,
              );
              toast.success('Excel generado');
            }}
          >
            Exportar Excel
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link className="text-[var(--color-accent-2)] underline" to="/contabilidad/libro-diario">Libro diario</Link>
        <span>·</span>
        <Link className="text-[var(--color-accent-2)] underline" to="/contabilidad/mayor">Mayor por cuenta</Link>
      </div>
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <KPI label="Reportes disponibles" value={disponibles} icon={<FileSpreadsheet size={20} />} iconBg="green" />
        <KPI label="Periodo activo" value={data[0]?.periodo ?? '—'} icon={<FileSpreadsheet size={20} />} iconBg="blue" />
        <KPI label="Asientos del mes" value={data.length} icon={<FileSpreadsheet size={20} />} iconBg="amber" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {data.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-muted)]">
            Sin datos
          </div>
        ) : (
          data.map((r) => (
            <Card key={r.id}>
              <CardBody className="flex items-center justify-between gap-4 p-4">
                <div>
                  <div className="font-semibold text-[var(--color-text)]">{r.nombre}</div>
                  <div className="text-sm text-[var(--color-muted)]">{r.periodo}</div>
                </div>
                <div className="flex items-center gap-2">
                  <EstadoGenericoBadge estado={r.estado === 'DISPONIBLE' ? 'ACTIVO' : 'BORRADOR'} />
                  <Button size="sm" variant="ghost" onClick={() => toast.success(`Vista previa: ${r.nombre}`)}>Ver</Button>
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
