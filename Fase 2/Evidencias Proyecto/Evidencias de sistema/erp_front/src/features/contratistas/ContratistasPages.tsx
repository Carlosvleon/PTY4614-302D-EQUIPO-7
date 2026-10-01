import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useQueryScope,
  useEmpresaScopeId,
  usePeriodoScopeCodigo,
  listQueryKey,
  periodListQueryKey,
} from '@/hooks/useQueryScope';
import { useAppSettings } from '@/app/app-settings-context';
import { settingsFromPeriodoCodigo } from '@/lib/appSettings';
import { toast } from 'sonner';
import { MockListPage, type MockFormField, mockEntityId } from '@/components/common/MockListPage';
import { PeriodoVistaToggle } from '@/components/common/PeriodoVistaToggle';
import { usePeriodoVista } from '@/hooks/usePeriodoVista';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { EstadoGenericoBadge } from '@/components/common/Badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Field, Select } from '@/components/ui/input';
import { MontoInput } from '@/components/ui/monto-input';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/modal';
import { fmtCLP, fmtDate, fmtRut } from '@/lib/utils';
import { formatRutDisplay, validateFiscalId } from '@/lib/inputValidation';
import { DateInput } from '@/components/ui/date-input';
import { useAuth } from '@/app/auth-context';
import { printEmpresaDocumento } from '@/lib/documentoPrint';
import type {
  CierreTraspasoContratista,
  Contratista,
  ProformaContratista,
  TarifaContratista,
} from '@/types/domain';
import * as api from '@/services/api';
import { hasPermission } from '@/lib/permissions';
import {
  validateTarifaPositiva,
  validateVigenciaTarifa,
} from '@/features/contratistas/contratistas-form-validators';

function matchesPeriodoProforma(proformaPeriodo: string, periodo: string) {
  const p = periodo.trim();
  if (!p) return true;
  return proformaPeriodo.includes(p);
}

function ProformaBadge({ estado }: { estado: string }) {
  const tone =
    estado === 'FACTURADA' ? 'success'
      : estado === 'DEFINITIVA' ? 'warning'
        : estado === 'PENDIENTE_APROBACION' ? 'info'
          : estado === 'RECHAZADA' ? 'danger'
            : 'muted';
  return <Badge tone={tone}>{estado.replace(/_/g, ' ')}</Badge>;
}

function VigenciaHistorialPanel({ contratistaId }: { contratistaId: string }) {
  const historial = useQuery({
    queryKey: ['contratista-vigencia-historial', contratistaId],
    queryFn: () => api.getContratistaVigenciaHistorial(contratistaId),
    enabled: Boolean(contratistaId),
  });
  if (historial.isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando historial de vigencia…</p>;
  }
  if (historial.isError) {
    return <p className="text-sm text-destructive">No se pudo cargar el historial.</p>;
  }
  const rows = historial.data ?? [];
  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin cambios registrados aún (se guarda cada vez que modificas vigencia o estado).
      </p>
    );
  }
  return (
    <div className="mt-4 space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">Historial de vigencia</p>
      <ul className="max-h-40 space-y-2 overflow-y-auto text-sm">
        {rows.map((h) => (
          <li key={h.id} className="flex flex-wrap gap-x-2 gap-y-1 border-b border-border/60 pb-2 last:border-0">
            <span>{fmtDate(h.registradoAt.slice(0, 10))}</span>
            <span>{h.activo ? 'Activo' : 'Inactivo'}</span>
            <span>{h.vigenciaHasta ? `hasta ${fmtDate(h.vigenciaHasta)}` : 'sin fecha fin'}</span>
            <span className="text-muted-foreground">· {h.usuarioNombre}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AvisoRutProveedor({
  editingId,
  values,
  rows,
  setField,
}: {
  editingId: string | number | null;
  values: Record<string, string | number | boolean>;
  rows: Contratista[];
  setField: (name: string, value: string | number | boolean) => void;
}) {
  const { demoMode } = useAppSettings();
  const rut = String(values.rut ?? '');
  const valido = Boolean(rut.trim()) && validateFiscalId(rut, { demoMode, allowForeign: true }).valid;
  const aplicado = useRef<string | null>(null);
  const encontrado = useQuery({
    queryKey: ['contraparte-por-rut', 'contratista', rut],
    queryFn: () => api.buscarContrapartePorRut(rut),
    enabled: editingId == null && valido,
  });
  useEffect(() => {
    const proveedor = encontrado.data?.proveedor;
    if (!proveedor || aplicado.current === proveedor.id) return;
    aplicado.current = proveedor.id;
    setField('razonSocial', proveedor.razonSocial);
  }, [encontrado.data?.proveedor, setField]);

  if (editingId != null) {
    const row = rows.find((item) => item.id === String(editingId));
    if (!row?.esProveedor) return null;
    return (
      <p role="status" className="mt-3 text-sm text-[var(--color-accent-2)]">
        Este contratista también está en Proveedores.
      </p>
    );
  }
  if (!encontrado.data?.proveedor) return null;
  return (
    <p role="status" className="mt-3 text-sm text-[var(--color-accent-2)]">
      Este RUT ya es proveedor. Se copió la razón social y, al guardar, quedarán asociados.
    </p>
  );
}

export function ContratistasListPage() {
  const { user } = useAuth();
  const canCatalogs = hasPermission(user, 'contratistas:catalogs');
  const formFields: MockFormField[] = [
    { name: 'rut', label: 'RUT', required: true, kind: 'rut' },
    { name: 'razonSocial', label: 'Razón social', required: true, kind: 'nombre' },
    { name: 'activo', label: 'Vigente', type: 'checkbox', defaultValue: true },
    { name: 'vigenciaHasta', label: 'Vigencia hasta (si deja de estar vigente)', type: 'date' },
  ];

  return (
    <MockListPage<Contratista>
      title="Contratistas"
      breadcrumbs={['Contratistas']}
      queryKey="contratistas"
      queryFn={api.getContratistas}
      createLabel="Nuevo contratista"
      entityLabel="Contratista"
      formFields={canCatalogs ? formFields : undefined}
      formSize="lg"
      invalidateKeys={['proveedores']}
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'CTR'),
        rut: String(v.rut),
        razonSocial: String(v.razonSocial),
        activo: Boolean(v.activo),
        vigenciaHasta: String(v.vigenciaHasta || '') || undefined,
      })}
      rowToFormValues={(r) => ({
        rut: formatRutDisplay(r.rut),
        razonSocial: r.razonSocial,
        activo: r.activo,
        vigenciaHasta: r.vigenciaHasta ?? '',
      })}
      onSave={async (values, id) => {
        const payload = {
          rut: String(values.rut),
          razonSocial: String(values.razonSocial),
          activo: Boolean(values.activo),
          vigenciaHasta: String(values.vigenciaHasta || '') || undefined,
        };
        if (id != null) await api.updateContratista(String(id), payload);
        else await api.createContratista(payload);
      }}
      formExtra={(ctx) => (
        <>
          <AvisoRutProveedor {...ctx} />
          {ctx.editingId != null ? (
            <VigenciaHistorialPanel contratistaId={String(ctx.editingId)} />
          ) : null}
        </>
      )}
      columns={[
        { key: 'rut', header: 'RUT', filterType: 'text', filterValue: (r) => r.rut, cell: (r) => fmtRut(r.rut) },
        {
          key: 'razonSocial',
          header: 'Razón social',
          filterType: 'text',
          filterValue: (r) => r.razonSocial,
          cell: (r) => (
            <span className="inline-flex flex-wrap items-center gap-2">
              {r.razonSocial}
              {r.esProveedor && <Badge tone="info">Proveedor</Badge>}
            </span>
          ),
        },
        {
          key: 'activo',
          header: 'Estado',
          filterType: 'boolean',
          filterValue: (r) => r.activo,
          filterOptions: [
            { value: 'true', label: 'Activo' },
            { value: 'false', label: 'Inactivo' },
          ],
          cell: (r) => <EstadoGenericoBadge estado={r.activo ? 'ACTIVO' : 'INACTIVO'} />,
        },
        {
          key: 'vig',
          header: 'Vigencia hasta',
          filterType: 'date',
          filterValue: (r) => r.vigenciaHasta,
          cell: (r) => (r.vigenciaHasta ? fmtDate(r.vigenciaHasta) : '—'),
        },
      ]}
    />
  );
}

export function TarifasContratistaPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const periodoVista = usePeriodoVista();
  const contratistas = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'contratistas'),
    queryFn: api.getContratistas,
  });
  const centros = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'centros-costo'),
    queryFn: api.getCentrosCosto,
  });
  const labores = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'labores'),
    queryFn: () => api.getLabores(),
  });
  const [laborFilter, setLaborFilter] = useState('');
  const actividades = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'actividades', laborFilter),
    queryFn: () => api.getActividades(laborFilter || undefined),
  });

  const anioActual = new Date().getFullYear();
  const [filtroAnio, setFiltroAnio] = useState(() => periodoVista.codigo.slice(0, 4) || 'TODOS');
  const [filtroMes, setFiltroMes] = useState(() => periodoVista.codigo.slice(5, 7) || 'TODOS');
  const [filtroContratistaId, setFiltroContratistaId] = useState('TODOS');

  useEffect(() => {
    if (periodoVista.todo) {
      setFiltroAnio('TODOS');
      setFiltroMes('TODOS');
      return;
    }
    const [anio, mes] = periodoVista.codigo.split('-');
    if (anio) setFiltroAnio(anio);
    if (mes) setFiltroMes(mes);
  }, [periodoVista.codigo, periodoVista.todo]);
  const anioOptions = Array.from({ length: 5 }, (_, i) => String(anioActual - i));
  const meses = [
    { v: '01', l: 'Enero' }, { v: '02', l: 'Febrero' }, { v: '03', l: 'Marzo' },
    { v: '04', l: 'Abril' }, { v: '05', l: 'Mayo' }, { v: '06', l: 'Junio' },
    { v: '07', l: 'Julio' }, { v: '08', l: 'Agosto' }, { v: '09', l: 'Septiembre' },
    { v: '10', l: 'Octubre' }, { v: '11', l: 'Noviembre' }, { v: '12', l: 'Diciembre' },
  ];

  const formFields: MockFormField[] = [
    {
      name: 'contratistaId',
      label: 'Contratista',
      type: 'select',
      required: true,
      options: (contratistas.data ?? [])
        .filter((c) => c.activo)
        .map((c) => ({ value: c.id, label: c.razonSocial })),
    },
    {
      name: 'laborId',
      label: 'Labor (catálogo)',
      type: 'select',
      required: true,
      options: (labores.data ?? []).map((l) => ({
        value: l.id,
        label: `${l.codigo} — ${l.nombre}`,
      })),
    },
    {
      name: 'actividadId',
      label: 'Actividad (catálogo · filtrada por labor)',
      type: 'select',
      required: true,
      options: (actividades.data ?? []).map((a) => ({
        value: a.id,
        label: `${a.codigo} — ${a.nombre}`,
      })),
    },
    { name: 'tarifa', label: 'Tarifa', type: 'number', required: true, validate: validateTarifaPositiva },
    {
      name: 'unidad', label: 'Unidad', type: 'select', required: true,
      options: [
        { value: 'HR', label: 'Hora' },
        { value: 'HA', label: 'Hectárea' },
        { value: 'CAJ', label: 'Caja' },
      ],
    },
    {
      name: 'centroCostoId',
      label: 'Centro de costo (solo empresa activa)',
      type: 'select',
      required: true,
      options: (centros.data ?? []).map((c) => ({
        value: c.id,
        label: `${c.codigo} — ${c.nombre}`,
      })),
    },
    { name: 'vigenciaDesde', label: 'Vigencia desde', type: 'date', required: true },
    { name: 'vigenciaHasta', label: 'Vigencia hasta', type: 'date', validate: validateVigenciaTarifa },
  ];

  return (
    <MockListPage<TarifaContratista>
      title="Tarifas de contratista"
      breadcrumbs={['Contratistas']}
      queryKey="tarifas-contratista"
      queryFn={() => api.getTarifasContratista()}
      createLabel="Agregar tarifa"
      entityLabel="Tarifa"
      toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
      formFields={formFields}
      formSize="xl"
      filters={(
        <>
          <Select className="max-w-[110px]" value={filtroAnio} onChange={(e) => setFiltroAnio(e.target.value)}>
            <option value="TODOS">Año</option>
            {anioOptions.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
          <Select className="max-w-[150px]" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)}>
            <option value="TODOS">Mes</option>
            {meses.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
          </Select>
          <Select className="max-w-[220px]" value={filtroContratistaId} onChange={(e) => setFiltroContratistaId(e.target.value)}>
            <option value="TODOS">Todos los contratistas</option>
            {(contratistas.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.razonSocial}</option>
            ))}
          </Select>
        </>
      )}
      filterRows={(rows) => rows.filter((r) => {
        if (filtroContratistaId !== 'TODOS' && r.contratistaId !== filtroContratistaId) return false;
        if (filtroAnio === 'TODOS' && filtroMes === 'TODOS') return true;
        const efectivoAnio = filtroAnio !== 'TODOS' ? filtroAnio : String(anioActual);
        const efectivoMesDesde = filtroMes !== 'TODOS' ? filtroMes : '01';
        const efectivoMesHasta = filtroMes !== 'TODOS' ? filtroMes : '12';
        const desde = r.vigenciaDesde;
        const hasta = r.vigenciaHasta || '9999-12-31';
        const refDesde = `${efectivoAnio}-${efectivoMesDesde}-01`;
        const refHasta = `${efectivoAnio}-${efectivoMesHasta}-31`;
        return desde <= refHasta && hasta >= refDesde;
      })}
      onFormOpen={(values) => {
        setLaborFilter(String(values.laborId || ''));
      }}
      onFieldChange={(name, value, values) => {
        if (name !== 'laborId') return;
        const nextLabor = String(value || '');
        if (nextLabor === laborFilter) return;
        setLaborFilter(nextLabor);
        return { ...values, actividadId: '' };
      }}
      buildMockRow={(v, id) => {
        const ctr = (contratistas.data ?? []).find((c) => c.id === String(v.contratistaId));
        const cc = (centros.data ?? []).find((c) => c.id === String(v.centroCostoId));
        const lab = (labores.data ?? []).find((l) => l.id === String(v.laborId));
        const act = (actividades.data ?? []).find((a) => a.id === String(v.actividadId));
        return {
          id: mockEntityId(id, 'TAR'),
          contratistaId: String(v.contratistaId),
          contratista: ctr?.razonSocial ?? '',
          laborId: String(v.laborId),
          labor: lab?.nombre ?? '',
          actividadId: String(v.actividadId),
          actividad: act?.nombre ?? '',
          tarifa: Number(v.tarifa),
          unidad: String(v.unidad),
          centroCostoId: String(v.centroCostoId),
          centroCosto: cc?.nombre ?? '',
          empresaId: '',
          vigenciaDesde: String(v.vigenciaDesde),
          vigenciaHasta: String(v.vigenciaHasta || '') || undefined,
        };
      }}
      rowToFormValues={(r) => ({
        contratistaId: r.contratistaId,
        laborId: r.laborId,
        actividadId: r.actividadId,
        tarifa: r.tarifa,
        unidad: r.unidad,
        centroCostoId: r.centroCostoId,
        vigenciaDesde: r.vigenciaDesde,
        vigenciaHasta: r.vigenciaHasta ?? '',
      })}
      onSave={async (values, id) => {
        const payload = {
          contratistaId: String(values.contratistaId),
          laborId: String(values.laborId),
          actividadId: String(values.actividadId),
          tarifa: Number(values.tarifa),
          unidad: String(values.unidad),
          centroCostoId: String(values.centroCostoId),
          vigenciaDesde: String(values.vigenciaDesde),
          vigenciaHasta: String(values.vigenciaHasta || '') || undefined,
        };
        if (id != null) await api.updateTarifaContratista(String(id), payload);
        else await api.createTarifaContratista(payload);
      }}
      onDelete={async (id) => {
        await api.deleteTarifaContratista(String(id));
      }}
      columns={[
        { key: 'contratista', header: 'Contratista', cell: (r) => r.contratista },
        { key: 'labor', header: 'Labor', cell: (r) => r.labor },
        { key: 'actividad', header: 'Actividad', cell: (r) => r.actividad },
        { key: 'tarifa', header: 'Tarifa', cell: (r) => fmtCLP(r.tarifa), align: 'right' },
        { key: 'unidad', header: 'UM', cell: (r) => r.unidad },
        { key: 'cc', header: 'CC', cell: (r) => r.centroCosto },
        { key: 'desde', header: 'Desde', cell: (r) => r.vigenciaDesde },
        { key: 'hasta', header: 'Hasta', cell: (r) => r.vigenciaHasta ?? '—' },
      ]}
    />
  );
}

export function ProformasContratistaPage() {
  const { user } = useAuth();
  const { selectedEmpresa } = useAppSettings();
  const qc = useQueryClient();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const periodoVista = usePeriodoVista();
  const [searchParams, setSearchParams] = useSearchParams();
  const contratistas = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'contratistas'),
    queryFn: api.getContratistas,
  });
  const proformasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'proformas-contratista'),
    queryFn: () => api.getProformasContratista(),
  });
  /** Proformas incluidas en la factura N:1 (todas equivalentes en UI). */
  const [facturaIds, setFacturaIds] = useState<string[]>([]);
  const [facturaNumero, setFacturaNumero] = useState('');
  const [facturaFecha, setFacturaFecha] = useState(new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<string[]>([]);
  const [workflowLoading, setWorkflowLoading] = useState<string | null>(null);

  /** Preview proforma o factura de contratista (ref Sergio: folio → representación). */
  const previewProforma = (row: ProformaContratista) => {
    if (!selectedEmpresa) {
      toast.error('Selecciona una empresa');
      return;
    }
    try {
      printEmpresaDocumento({
        empresa: selectedEmpresa,
        kind: 'PROFORMA',
        title: `Proforma ${row.numero}`,
        forceWatermark: row.estado === 'BORRADOR' || row.estado === 'PENDIENTE_APROBACION'
          ? row.estado.replace(/_/g, ' ')
          : undefined,
        rows: [{
          folio: row.numero,
          contraparte: row.contratista,
          fecha: row.periodo,
          neto: fmtCLP(row.monto),
          netoNum: row.monto,
          estado: row.estado,
          observacion: [
            row.periodo && `Periodo: ${row.periodo}`,
            row.solicitante && `Solicitante: ${row.solicitante}`,
            row.facturaAsociada && `Factura: ${row.facturaAsociada}`,
          ].filter(Boolean).join('\n') || undefined,
          lineas: [{
            descripcion: `Labores / proforma ${row.numero}`,
            cantidad: 1,
            precioUnitario: fmtCLP(row.monto),
            total: fmtCLP(row.monto),
          }],
        }],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir la vista previa');
    }
  };

  const previewFacturaContratista = (
    facturaNum: string,
    opts?: { fecha?: string; grupo?: ProformaContratista[] },
  ) => {
    if (!selectedEmpresa) {
      toast.error('Selecciona una empresa');
      return;
    }
    const grupo = opts?.grupo?.length
      ? opts.grupo
      : (proformasQ.data ?? []).filter((p) => p.facturaAsociada === facturaNum);
    if (!grupo.length) {
      toast.error('No hay proformas asociadas a esa factura');
      return;
    }
    const neto = grupo.reduce((a, p) => a + (Number(p.monto) || 0), 0);
    try {
      printEmpresaDocumento({
        empresa: selectedEmpresa,
        kind: 'FACTURA',
        title: `Factura contratista ${facturaNum}`,
        rows: [{
          folio: facturaNum,
          contraparte: grupo[0].contratista,
          fecha: opts?.fecha || new Date().toISOString().slice(0, 10),
          neto: fmtCLP(neto),
          netoNum: neto,
          estado: 'FACTURADA',
          observacion: `Proformas: ${grupo.map((p) => p.numero).join(', ')}`,
          lineas: grupo.map((p) => ({
            descripcion: `Proforma ${p.numero} · ${p.periodo}`,
            cantidad: 1,
            precioUnitario: fmtCLP(p.monto),
            total: fmtCLP(p.monto),
          })),
        }],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir la vista previa');
    }
  };
  const [confirmDefinitivaId, setConfirmDefinitivaId] = useState<string | null>(null);
  const [reversarId, setReversarId] = useState<string | null>(null);
  const [pinReversa, setPinReversa] = useState('');
  const [detalleProforma, setDetalleProforma] = useState<ProformaContratista | null>(null);

  const openId = searchParams.get('open');
  useEffect(() => {
    if (!openId || proformasQ.isLoading) return;
    const row = (proformasQ.data ?? []).find((p) => p.id === openId);
    if (row) setDetalleProforma(row);
  }, [openId, proformasQ.data, proformasQ.isLoading]);

  const closeDetalleProforma = () => {
    setDetalleProforma(null);
    if (!searchParams.get('open')) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('open');
      return next;
    }, { replace: true });
  };

  const formFields: MockFormField[] = [
    { name: 'numero', label: 'Número', required: true },
    {
      name: 'contratistaId',
      label: 'Contratista',
      type: 'select',
      required: true,
      options: (contratistas.data ?? []).map((c) => ({
        value: c.id,
        label: c.razonSocial,
      })),
    },
    { name: 'periodo', label: 'Periodo (YYYY-MM o multi-mes YYYY-MM/YYYY-MM)', required: true, placeholder: '2026-06/2026-07', defaultValue: periodoVista.codigo },
    { name: 'montoNeto', label: 'Monto neto', type: 'number', montoKind: 'monto', required: true },
    {
      name: 'moneda',
      label: 'Moneda',
      type: 'select',
      required: true,
      defaultValue: 'CLP',
      options: [
        { value: 'CLP', label: 'CLP' },
        { value: 'USD', label: 'USD' },
        { value: 'CNY', label: 'CNY' },
        { value: 'EUR', label: 'EUR' },
      ],
    },
  ];

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'proformas-contratista') });
    void qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'notificaciones') });
  };

  const toggleSel = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const handleDefinitiva = async (id: string) => {
    setWorkflowLoading(id);
    try {
      await api.marcarProformaDefinitiva(id);
      await invalidate();
      toast.success('Proforma definitiva');
      setConfirmDefinitivaId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al confirmar');
    } finally {
      setWorkflowLoading(null);
    }
  };

  const handleReversar = async (id: string) => {
    if (!/^\d{4}$/.test(pinReversa)) {
      toast.error('Ingresa tu PIN de aprobación (4 dígitos, Mi Perfil)');
      return;
    }
    setWorkflowLoading(id);
    try {
      await api.reversarProforma(id, pinReversa);
      await invalidate();
      toast.success('Proforma reversada a borrador');
      setReversarId(null);
      setPinReversa('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al reversar');
    } finally {
      setWorkflowLoading(null);
    }
  };

  const proformaConfirm = (proformasQ.data ?? []).find((p) => p.id === confirmDefinitivaId);
  const proformaReversar = (proformasQ.data ?? []).find((p) => p.id === reversarId);

  const handleFactura = async () => {
    if (!facturaIds.length) {
      toast.error('Marca al menos una proforma');
      return;
    }
    if (!facturaFecha.trim()) {
      toast.error('Ingresa la fecha de la orden de compra');
      return;
    }
    const anchor = facturaIds[0];
    setWorkflowLoading(anchor);
    try {
      const updated = await api.asociarFacturaProforma(anchor, {
        numero: facturaNumero.trim() || undefined,
        fecha: facturaFecha,
        proformaIds: facturaIds,
      });
      const ocNum = updated.ordenCompraNumero ?? updated.facturaAsociada ?? 'OC';
      const fechaFac = facturaFecha;
      const grupoPreview = (proformasQ.data ?? []).filter((p) => facturaIds.includes(p.id));
      await invalidate();
      toast.success(
        facturaIds.length > 1
          ? `Orden ${ocNum} generada con ${facturaIds.length} proformas`
          : `Orden ${ocNum} generada`,
      );
      setFacturaIds([]);
      setFacturaNumero('');
      setSelected([]);
      previewFacturaContratista(ocNum, { fecha: fechaFac, grupo: grupoPreview });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al generar orden de compra');
    } finally {
      setWorkflowLoading(null);
    }
  };

  /** Definitivas seleccionadas en la grilla (orden de marcado). */
  const selectedDefinitivas = useMemo(() => {
    const byId = new Map((proformasQ.data ?? []).map((p) => [p.id, p]));
    return selected
      .map((id) => byId.get(id))
      .filter((p): p is ProformaContratista => p != null && p.estado === 'DEFINITIVA');
  }, [proformasQ.data, selected]);

  const openFacturaModal = (ids: string[]) => {
    if (!ids.length) {
      toast.error('Selecciona al menos una proforma definitiva');
      return;
    }
    const byId = new Map((proformasQ.data ?? []).map((p) => [p.id, p]));
    const rows = ids.map((id) => byId.get(id)).filter((p): p is ProformaContratista => Boolean(p));
    const ref = rows[0];
    if (!ref) return;
    const mismo = rows.every(
      (p) => (p.contratistaId || p.contratista) === (ref.contratistaId || ref.contratista),
    );
    if (!mismo) {
      toast.error('Las proformas deben ser del mismo contratista');
      return;
    }
    setFacturaIds(ids);
    setFacturaNumero('');
    setFacturaFecha(new Date().toISOString().slice(0, 10));
  };

  const facturarSeleccion = () => {
    openFacturaModal(selectedDefinitivas.map((p) => p.id));
  };

  const refFactura = (proformasQ.data ?? []).find((p) => p.id === facturaIds[0]);
  /** Candidatas = definitivas del mismo contratista; todas se listan iguales (checkbox). */
  const candidatasFactura = (proformasQ.data ?? []).filter((p) => {
    if (p.estado !== 'DEFINITIVA' || !refFactura) return false;
    return (p.contratistaId || p.contratista)
      === (refFactura.contratistaId || refFactura.contratista);
  });
  const montoFacturaGrupo = candidatasFactura
    .filter((p) => facturaIds.includes(p.id))
    .reduce((a, p) => a + (Number(p.monto) || 0), 0);

  return (
    <>
      <MockListPage<ProformaContratista>
        title="Proformas y facturas"
        breadcrumbs={['Contratistas']}
        subtitle="Alta, confirmación definitiva, facturación N:1 y cierre. BORRADOR → DEFINITIVA requiere contratistas:write."
        queryKey="proformas-contratista"
        queryFn={() => api.getProformasContratista()}
        createLabel="Nueva proforma"
        entityLabel="Proforma"
        formFields={formFields}
        formSize="xl"
        onRowClick={(r) => setDetalleProforma(r)}
        filterRows={(rows) => (
          periodoVista.todo
            ? rows
            : rows.filter((r) => matchesPeriodoProforma(r.periodo, periodoVista.codigo))
        )}
        toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
        headerExtra={(
          <Button
            variant="outline"
            disabled={!selectedDefinitivas.length}
            title={selected.length > selectedDefinitivas.length
              ? `${selected.length} seleccionadas · ${selectedDefinitivas.length} definitivas`
              : 'Asociar factura a las proformas definitivas seleccionadas'}
            onClick={facturarSeleccion}
          >
            Generar OC ({selectedDefinitivas.length})
          </Button>
        )}
        onFormOpen={(_values, editingId) => {
          if (editingId) void contratistas.refetch();
        }}
        buildMockRow={() => ({ id: '', numero: '', contratista: '', periodo: '', monto: 0, estado: 'BORRADOR' })}
        rowToFormValues={(r) => ({
          numero: r.numero,
          contratistaId: r.contratistaId ?? '',
          periodo: r.periodo,
          montoNeto: r.monto,
          moneda: r.moneda ?? 'CLP',
        })}
        onSave={async (values, id) => {
          const payload = {
            numero: String(values.numero),
            contratistaId: String(values.contratistaId),
            periodo: String(values.periodo),
            montoNeto: Number(values.montoNeto),
            moneda: String(values.moneda ?? 'CLP'),
          };
          if (id != null) {
            await api.updateProformaContratista(String(id), payload);
          } else {
            await api.createProformaContratista(payload);
          }
        }}
        onDelete={async (id) => {
          await api.deleteProformaContratista(String(id));
        }}
        canEditRow={(r) => r.estado === 'BORRADOR'}
        canDeleteRow={(r) => r.estado === 'BORRADOR'}
        columns={[
          {
            key: 'sel',
            header: '',
            sortable: false,
            filterable: false,
            hideable: false,
            cell: (r) => (
              <Checkbox
                disabled={r.estado !== 'DEFINITIVA'}
                checked={selected.includes(r.id)}
                onChange={() => toggleSel(r.id)}
                onClick={(e) => e.stopPropagation()}
              />
            ),
          },
          {
            key: 'numero',
            header: 'Nº',
            filterType: 'text',
            filterValue: (r) => r.numero,
            cell: (r) => (
              <button
                type="button"
                className="font-mono text-xs text-[var(--color-accent)] underline-offset-2 hover:underline"
                title="Vista previa proforma"
                onClick={(e) => { e.stopPropagation(); previewProforma(r); }}
              >
                {r.numero}
              </button>
            ),
          },
          { key: 'contratista', header: 'Contratista', cell: (r) => r.contratista },
          {
            key: 'solicitante',
            header: 'Solicitante',
            cell: (r) => r.solicitante ?? r.creadoPorNombre ?? '—',
          },
          { key: 'periodo', header: 'Periodo', cell: (r) => r.periodo },
          { key: 'moneda', header: 'Mon.', cell: (r) => r.moneda ?? 'CLP' },
          { key: 'monto', header: 'Monto', cell: (r) => fmtCLP(r.monto), align: 'right' },
          { key: 'estado', header: 'Estado', cell: (r) => <ProformaBadge estado={r.estado} /> },
          {
            key: 'resueltoPor',
            header: 'Resuelto por',
            cell: (r) =>
              r.estado === 'BORRADOR'
                ? '—'
                : (r.aprobadoPorNombre || '—'),
          },
          {
            key: 'fac',
            header: 'Compras',
            filterType: 'text',
            filterValue: (r) => r.ordenCompraNumero ?? r.facturaAsociada ?? '',
            cell: (r) => {
              if (r.registroCompraId && r.facturaAsociada) {
                return (
                  <Link
                    className="font-mono text-xs text-[var(--color-accent)] hover:underline"
                    to={`/compras/registro?q=${encodeURIComponent(r.facturaAsociada)}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {r.facturaAsociada}
                  </Link>
                );
              }
              if (r.ordenCompraId) {
                const label = r.ordenCompraNumero ?? r.facturaAsociada ?? r.ordenCompraId;
                return (
                  <Link
                    className="font-mono text-xs text-[var(--color-accent)] hover:underline"
                    to={`/compras/ordenes?q=${encodeURIComponent(label)}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {label}
                  </Link>
                );
              }
              return '—';
            },
          },
          {
            key: 'flujo',
            header: 'Flujo',
            cell: (r) => (
              <span className="inline-flex flex-wrap gap-1">
                {r.estado === 'BORRADOR' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={workflowLoading === r.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDefinitivaId(String(r.id));
                    }}
                  >
                    Confirmar definitiva
                  </Button>
                )}
                {r.estado === 'DEFINITIVA' && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={workflowLoading === r.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        openFacturaModal([String(r.id)]);
                      }}
                    >
                      Generar OC
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={workflowLoading === r.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setReversarId(String(r.id));
                        setPinReversa('');
                      }}
                    >
                      Reversar
                    </Button>
                  </>
                )}
              </span>
            ),
          },
        ]}
      />

      <Modal
        open={confirmDefinitivaId != null}
        onClose={() => setConfirmDefinitivaId(null)}
        title="Confirmar proforma definitiva"
        size="md"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setConfirmDefinitivaId(null)}>Cancelar</Button>
            <Button
              onClick={() => confirmDefinitivaId && void handleDefinitiva(confirmDefinitivaId)}
              disabled={workflowLoading != null}
            >
              {workflowLoading ? 'Confirmando…' : 'Sí, confirmar definitiva'}
            </Button>
          </>
        )}
      >
        <div className="space-y-3 text-sm">
          {proformaConfirm && (
            <p>
              Estás a punto de marcar como definitiva la proforma{' '}
              <span className="font-mono font-semibold">{proformaConfirm.numero}</span>.
              ¿Estás seguro?
            </p>
          )}
          <p className="text-[var(--color-muted)]">
            No se requiere PIN ni bandeja de aprobación. Se registra quién confirma.
          </p>
          {proformaConfirm && (
            <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2,transparent)] p-3 space-y-1">
              <div><span className="text-[var(--color-muted)]">Nº:</span> <span className="font-mono">{proformaConfirm.numero}</span></div>
              <div><span className="text-[var(--color-muted)]">Contratista:</span> {proformaConfirm.contratista}</div>
              <div><span className="text-[var(--color-muted)]">Solicitante:</span> {proformaConfirm.solicitante ?? proformaConfirm.creadoPorNombre ?? '—'}</div>
              <div><span className="text-[var(--color-muted)]">Periodo:</span> {proformaConfirm.periodo}</div>
              <div><span className="text-[var(--color-muted)]">Monto:</span> {fmtCLP(proformaConfirm.monto)} {proformaConfirm.moneda ?? 'CLP'}</div>
              <div><span className="text-[var(--color-muted)]">Estado:</span> {proformaConfirm.estado} → DEFINITIVA</div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={reversarId != null}
        onClose={() => { setReversarId(null); setPinReversa(''); }}
        title="Reversar proforma definitiva"
        size="md"
        footer={(
          <>
            <Button variant="ghost" onClick={() => { setReversarId(null); setPinReversa(''); }}>Cancelar</Button>
            <Button
              variant="danger"
              disabled={workflowLoading != null || pinReversa.length !== 4}
              onClick={() => reversarId && void handleReversar(reversarId)}
            >
              {workflowLoading ? 'Procesando…' : 'Confirmar reversa'}
            </Button>
          </>
        )}
      >
        <div className="space-y-3 text-sm">
          {proformaReversar && (
            <p>
              Vas a devolver a borrador la proforma{' '}
              <span className="font-mono font-semibold">{proformaReversar.numero}</span>.
              Se requiere tu <strong>PIN de aprobación</strong> (el mismo de Mi Perfil).
            </p>
          )}
          <Field label="PIN de aprobación (4 dígitos)" required>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinReversa}
              onChange={(e) => setPinReversa(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder={user?.tienePinAprobacion ? '••••' : 'Registra tu PIN en Mi Perfil'}
              autoComplete="off"
              className="font-mono tracking-widest"
              required
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={facturaIds.length > 0}
        onClose={() => setFacturaIds([])}
        title="Generar orden de compra (N proformas → 1 OC)"
        size="xl"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setFacturaIds([])}>Cancelar</Button>
            <Button
              onClick={handleFactura}
              disabled={workflowLoading != null || facturaIds.length < 1 || !facturaFecha.trim()}
            >
              {workflowLoading ? 'Generando…' : `Generar OC (${facturaIds.length})`}
            </Button>
          </>
        )}
      >
        <div className="grid gap-4">
          <p className="text-sm text-[var(--color-muted)]">
            Se creará una orden de compra en el módulo Compras (aprobación, recepción y libro de compras).
            Marca las proformas definitivas del mismo contratista que compartirán la misma OC.
          </p>
          {refFactura && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
              <div className="text-xs text-[var(--color-muted)]">{refFactura.contratista}</div>
              <div className="mt-0.5 font-semibold tabular-nums">
                {facturaIds.length}
                {' '}
                proforma
                {facturaIds.length === 1 ? '' : 's'}
                {' · '}
                {fmtCLP(montoFacturaGrupo)}
              </div>
            </div>
          )}
          <Field label="Ref. documento proveedor (opcional)">
            <Input value={facturaNumero} onChange={(e) => setFacturaNumero(e.target.value)} placeholder="Folio factura del contratista, si ya lo tienes" />
          </Field>
          <Field label="Fecha OC" required>
            <DateInput value={facturaFecha} onChange={setFacturaFecha} required />
          </Field>
          <Field label="Proformas a incluir" required>
            <div className="max-h-[min(50vh,22rem)] space-y-2 overflow-auto rounded border border-[var(--color-border)] p-2 text-sm">
              {candidatasFactura.map((p) => {
                const checked = facturaIds.includes(p.id);
                return (
                  <Checkbox
                    key={p.id}
                    label={`${p.numero} · ${p.periodo} · ${fmtCLP(p.monto)}`}
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFacturaIds((prev) => (prev.includes(p.id) ? prev : [...prev, p.id]));
                        return;
                      }
                      setFacturaIds((prev) => {
                        if (prev.length <= 1) {
                          toast.message('Debe quedar al menos una proforma');
                          return prev;
                        }
                        return prev.filter((x) => x !== p.id);
                      });
                    }}
                  />
                );
              })}
              {candidatasFactura.length === 0 && (
                <p className="text-[var(--color-muted)]">Sin proformas definitivas disponibles.</p>
              )}
            </div>
          </Field>
        </div>
      </Modal>

      <Modal
        open={detalleProforma != null}
        onClose={closeDetalleProforma}
        title={detalleProforma ? `Proforma ${detalleProforma.numero}` : 'Detalle'}
        size="xl"
        footer={(
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={closeDetalleProforma}>Cerrar</Button>
            {detalleProforma?.estado === 'BORRADOR' && (
              <Button
                size="sm"
                onClick={() => {
                  setConfirmDefinitivaId(detalleProforma.id);
                  closeDetalleProforma();
                }}
              >
                Confirmar definitiva
              </Button>
            )}
          </div>
        )}
      >
        {detalleProforma && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-[var(--color-muted)]">Estado</dt><dd><ProformaBadge estado={detalleProforma.estado} /></dd></div>
            <div><dt className="text-[var(--color-muted)]">Periodo</dt><dd>{detalleProforma.periodo}</dd></div>
            <div className="col-span-2"><dt className="text-[var(--color-muted)]">Contratista</dt><dd>{detalleProforma.contratista}</dd></div>
            <div>
              <dt className="text-[var(--color-muted)]">Solicitante</dt>
              <dd>{detalleProforma.solicitante ?? detalleProforma.creadoPorNombre ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Resuelto por</dt>
              <dd>{detalleProforma.aprobadoPorNombre ?? '—'}</dd>
            </div>
            <div><dt className="text-[var(--color-muted)]">Monto</dt><dd className="font-mono">{fmtCLP(detalleProforma.monto)} {detalleProforma.moneda ?? 'CLP'}</dd></div>
            <div>
              <dt className="text-[var(--color-muted)]">Fecha</dt>
              <dd>{detalleProforma.createdAt ? fmtDate(detalleProforma.createdAt.slice(0, 10)) : '—'}</dd>
            </div>
          </dl>
        )}
      </Modal>
    </>
  );
}

export function TraspasoContratistasPage() {
  const { user } = useAuth();
  const canClose = hasPermission(user, 'contratistas:transfer') && hasPermission(user, 'contratistas:close');
  const canReopen = hasPermission(user, 'contratistas:reopen');
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const periodoKey = usePeriodoScopeCodigo();
  const { setPeriodoContable } = useAppSettings();
  const qc = useQueryClient();
  const [glosa, setGlosa] = useState('');
  const [tipoCambio, setTipoCambio] = useState('');
  const [monedaTc, setMonedaTc] = useState('USD');
  const [saving, setSaving] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

  // Al cambiar empresa/periodo del header, limpiar borrador del formulario.
  useEffect(() => {
    setGlosa('');
    setTipoCambio('');
    setMonedaTc('USD');
  }, [empresaId, periodoKey]);

  const { data: proformas = [] } = useQuery({
    queryKey: periodListQueryKey(scope, empresaId, periodoKey, 'proformas-traspaso'),
    queryFn: () => api.getProformasContratista(),
  });

  const periodosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'periodos-contables'),
    queryFn: api.getPeriodosContables,
    staleTime: 15_000,
  });

  const cierreQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'cierre-traspaso', periodoKey || '_'),
    queryFn: () => (periodoKey ? api.getCierreTraspaso(periodoKey) : Promise.resolve(null)),
    enabled: Boolean(periodoKey),
    // Evita flash del cierre del periodo anterior al cambiar el del header.
    placeholderData: () => undefined,
  });

  const historialQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'cierres-traspaso'),
    queryFn: () => api.getCierresTraspaso(),
  });

  const delPeriodo = useMemo(
    () => proformas.filter((p) => matchesPeriodoProforma(p.periodo, periodoKey)),
    [proformas, periodoKey],
  );
  const elegibles = useMemo(
    () => delPeriodo.filter((p) => p.estado === 'DEFINITIVA' || p.estado === 'FACTURADA'),
    [delPeriodo],
  );
  const porRecibir = elegibles
    .filter((p) => p.estado === 'DEFINITIVA')
    .reduce((a, p) => a + p.monto, 0);
  const costoMo = elegibles.reduce((a, p) => a + p.monto, 0);
  const cierreActual = cierreQ.data ?? null;
  const traspasoHecho = Boolean(cierreActual?.cerrado);
  const periodoContableRow = useMemo(
    () => (periodosQ.data ?? []).find((p) => p.codigo === periodoKey),
    [periodosQ.data, periodoKey],
  );
  const periodoContableCerrado = periodoContableRow?.estado === 'CERRADO';
  const estadoCargando = cierreQ.isFetching || periodosQ.isFetching;
  const incluidasIds = useMemo(
    () => new Set(cierreActual?.proformaIds ?? []),
    [cierreActual],
  );

  const contabilidadLabel = (r: ProformaContratista) => {
    if (traspasoHecho && (incluidasIds.has(r.id) || elegibles.some((e) => e.id === r.id && incluidasIds.size === 0))) {
      return cierreActual?.asientoNumero
        ? `En cierre · ${cierreActual.asientoNumero}`
        : 'Incluida en cierre';
    }
    if (r.estado === 'DEFINITIVA') return 'Factura por recibir';
    if (r.estado === 'FACTURADA') return traspasoHecho ? 'Facturada' : 'Facturada · pend. cierre';
    return '—';
  };

  const irAPeriodoGlobal = (codigo: string) => {
    setPeriodoContable(settingsFromPeriodoCodigo(codigo));
  };

  const ejecutarTraspaso = async () => {
    if (!canClose) {
      toast.error('No tienes permisos para traspasar y cerrar');
      return;
    }
    if (!periodoKey) {
      toast.error('Selecciona un periodo en el menú superior');
      return;
    }
    if (traspasoHecho) {
      toast.error(`El traspaso de contratistas ${periodoKey} ya fue ejecutado`);
      return;
    }
    if (periodoContableCerrado) {
      toast.error(`El periodo contable ${periodoKey} está CERRADO. Ábrelo en Contabilidad → Periodos antes de traspasar.`);
      return;
    }
    if (!elegibles.length) {
      toast.error('No hay proformas DEFINITIVA/FACTURADA en ese periodo');
      return;
    }
    setSaving(true);
    try {
      const result = await api.traspasoCierre({
        periodo: periodoKey,
        glosa: glosa.trim() || undefined,
        tipoCambio: Number(tipoCambio) || undefined,
        monedaTc,
      });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'proformas-traspaso') });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'cierre-traspaso') });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'cierres-traspaso') });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'proformas-contratista') });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'asientos') });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'dashboard-kpis') });
      toast.success(
        result.asientoNumero
          ? `Periodo ${result.periodo} cerrado · asiento ${result.asientoNumero} · ${fmtCLP(result.montoTotal)}`
          : `Periodo ${result.periodo} cerrado · ${result.proformas} proforma(s)`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error en traspaso/cierre');
    } finally {
      setSaving(false);
    }
  };

  const reabrirCierre = async () => {
    if (!canReopen || !cierreActual?.cerrado) return;
    if (reopenReason.trim().length < 5) {
      toast.error('Indica un motivo de al menos 5 caracteres');
      return;
    }
    setReopening(true);
    try {
      await api.reabrirCierreContratista(periodoKey, reopenReason.trim());
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'cierre-traspaso') });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'cierres-traspaso') });
      setReopenReason('');
      toast.success(`Periodo ${periodoKey} reabierto`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo reabrir el cierre');
    } finally {
      setReopening(false);
    }
  };

  const historial: CierreTraspasoContratista[] = historialQ.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Traspaso contable y cierre de mes"
        breadcrumbs={['Contratistas']}
        subtitle={`Periodo de trabajo ${periodoKey} (selector del menú superior). Reconoce costo MO contratada contra facturas por recibir.`}
      />

      <div className="grid gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm md:grid-cols-4">
        <div>
          <div className="text-[var(--color-muted)]">Facturas por recibir (DEFINITIVA)</div>
          <div className="text-lg font-semibold">{fmtCLP(porRecibir)}</div>
        </div>
        <div>
          <div className="text-[var(--color-muted)]">A traspasar (DEFINITIVA + FACTURADA)</div>
          <div className="text-lg font-semibold">{fmtCLP(costoMo)}</div>
          <div className="text-xs text-[var(--color-muted)]">{elegibles.length} proforma(s)</div>
        </div>
        <div>
          <div className="text-[var(--color-muted)]">TC del periodo (centralizado)</div>
          <div className="font-medium">
            {traspasoHecho && cierreActual?.tipoCambio != null
              ? `${cierreActual.tipoCambio} ${cierreActual.monedaTc ?? monedaTc}/CLP`
              : `${tipoCambio || '—'} ${monedaTc}/CLP`}
          </div>
        </div>
        <div>
          <div className="text-[var(--color-muted)]">Estados · {periodoKey}</div>
          {estadoCargando ? (
            <div className="font-medium text-[var(--color-muted)]">Cargando…</div>
          ) : (
            <div className="space-y-0.5 text-sm">
              <div>
                <span className="text-[var(--color-muted)]">Periodo contable (global): </span>
                {!periodoContableRow ? (
                  <span className="text-[var(--color-muted)]">Sin crear</span>
                ) : periodoContableCerrado ? (
                  <span className="text-rose-600 dark:text-rose-300">CERRADO</span>
                ) : (
                  <span className="text-emerald-700 dark:text-emerald-300">ABIERTO</span>
                )}
              </div>
              <div>
                <span className="text-[var(--color-muted)]">Cierre Contratistas: </span>
                {traspasoHecho ? (
                  <span className="text-rose-600 dark:text-rose-300">CERRADO</span>
                ) : (
                  <span className="text-emerald-700 dark:text-emerald-300">ABIERTO</span>
                )}
              </div>
              <div>
                <span className="text-[var(--color-muted)]">Traspaso contable: </span>
                {traspasoHecho ? (
                  <span className="text-emerald-700 dark:text-emerald-300">Ejecutado</span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-300">Pendiente</span>
                )}
              </div>
            </div>
          )}
          {cierreActual?.asientoNumero && (
            <Link
              to="/contabilidad/asientos"
              className="text-xs text-[var(--color-accent)] underline-offset-2 hover:underline"
            >
              Asiento {cierreActual.asientoNumero}
            </Link>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-3 text-sm font-medium">
          Ejecutar traspaso / cierre · {periodoKey}
        </div>
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          Incluye proformas DEFINITIVA y FACTURADA del periodo del menú superior.
          El TC queda en la glosa del asiento. Requiere cierre Contratistas ABIERTO, periodo contable ABIERTO y traspaso aún pendiente (independiente del cierre de insumos).
        </p>
        {periodoContableCerrado && (
          <p className="mb-3 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            El periodo contable {periodoKey} está CERRADO (igual que en el menú superior).
            Ábrelo en Contabilidad → Periodos si necesitas ejecutar el traspaso.
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-[120px_120px_1fr_auto] md:items-end">
          <Field label="TC">
            <MontoInput
              kind="tc"
              value={tipoCambio === '' ? null : Number(tipoCambio)}
              onChange={(v) => setTipoCambio(v == null ? '' : String(v))}
              disabled={traspasoHecho || periodoContableCerrado}
            />
          </Field>
          <Field label="Moneda TC">
            <Select
              value={monedaTc}
              onChange={(e) => setMonedaTc(e.target.value)}
              disabled={traspasoHecho || periodoContableCerrado}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="CNY">CNY</option>
            </Select>
          </Field>
          <Field label="Glosa (opcional)">
            <Input
              value={glosa}
              onChange={(e) => setGlosa(e.target.value)}
              placeholder={`Traspaso/cierre contratistas ${periodoKey}`}
              disabled={traspasoHecho || periodoContableCerrado}
            />
          </Field>
          <Button
            disabled={!canClose || saving || traspasoHecho || !elegibles.length || estadoCargando}
            onClick={() => void ejecutarTraspaso()}
          >
            {saving
              ? 'Procesando…'
              : traspasoHecho
                ? 'Traspaso ya hecho'
                : periodoContableCerrado
                  ? 'Periodo cerrado'
                : canClose ? 'Traspasar y cerrar' : 'Sin permiso de cierre'}
          </Button>
        </div>
        {!traspasoHecho && !periodoContableCerrado && elegibles.length > 0 && (
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            Se incluirán <strong>{elegibles.length}</strong> proforma(s) por {fmtCLP(costoMo)}.
          </p>
        )}
        {cierreActual && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100">
            Cierre {cierreActual.periodo}
            {' · '}
            {cierreActual.proformas} proforma(s)
            {' · '}
            {fmtCLP(cierreActual.montoTotal)}
            {cierreActual.tipoCambio != null
              ? ` · TC ${cierreActual.tipoCambio} ${cierreActual.monedaTc ?? ''}`
              : ''}
            {cierreActual.tiposCambio
              ? ` · ${Object.entries(cierreActual.tiposCambio).map(([moneda, valor]) => `${moneda} ${valor}`).join(', ')}`
              : ''}
            {cierreActual.cerradoPorNombre ? ` · ${cierreActual.cerradoPorNombre}` : ''}
            {cierreActual.cerradoAt ? ` · ${new Date(cierreActual.cerradoAt).toLocaleString('es-CL')}` : ''}
            {cierreActual.asientoNumero ? (
              <>
                {' · '}
                <Link to="/contabilidad/asientos" className="underline underline-offset-2">
                  asiento {cierreActual.asientoNumero}
                </Link>
              </>
            ) : null}
          </div>
        )}
        {cierreActual?.cerrado && canReopen && (
          <div className="mt-3 grid gap-3 rounded-lg border border-amber-300/60 p-3 md:grid-cols-[1fr_auto] md:items-end">
            <Field label="Motivo (reabrir cierre Contratistas)" required>
              <Input
                value={reopenReason}
                onChange={(event) => setReopenReason(event.target.value)}
                placeholder="Motivo obligatorio (mín. 5 caracteres)"
                minLength={5}
                required
              />
            </Field>
            <Button variant="outline" disabled={reopening || reopenReason.trim().length < 5} onClick={() => void reabrirCierre()}>
              {reopening ? 'Reabriendo…' : 'Reabrir cierre Contratistas'}
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-sm font-medium">
            Proformas del periodo {periodoKey}
          </div>
          <div className="text-xs text-[var(--color-muted)]">
            {delPeriodo.length} en periodo · {elegibles.length} elegibles (DEFINITIVA/FACTURADA)
          </div>
        </div>
        <DataTable<ProformaContratista>
          rows={delPeriodo}
          columns={[
            { key: 'numero', header: 'Proforma', filterType: 'text', filterValue: (r) => r.numero, cell: (r) => r.numero },
            { key: 'periodo', header: 'Periodo', cell: (r) => r.periodo },
            { key: 'contratista', header: 'Contratista', cell: (r) => r.contratista },
            { key: 'moneda', header: 'Mon.', cell: (r) => r.moneda ?? 'CLP' },
            { key: 'monto', header: 'Monto', cell: (r) => fmtCLP(r.monto), align: 'right' },
            { key: 'estado', header: 'Estado', cell: (r) => <ProformaBadge estado={r.estado} /> },
            {
              key: 'pend',
              header: 'Contabilidad',
              filterType: 'text',
              filterValue: (r) => contabilidadLabel(r),
              cell: (r) => contabilidadLabel(r),
            },
          ]}
        />
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-3 text-sm font-medium">Histórico de cierres</div>
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          Clic en un periodo del histórico cambia el periodo de trabajo del sitio (menú superior).
        </p>
        <DataTable<CierreTraspasoContratista>
          rows={historial}
          columns={[
            {
              key: 'periodo',
              header: 'Periodo',
              cell: (r) => (
                <button
                  type="button"
                  className="text-[var(--color-accent)] underline-offset-2 hover:underline"
                  title="Usar este periodo en todo el sitio"
                  onClick={() => irAPeriodoGlobal(r.periodo)}
                >
                  {r.periodo}
                  {r.periodo === periodoKey ? ' · actual' : ''}
                </button>
              ),
            },
            { key: 'n', header: 'Proformas', cell: (r) => String(r.proformas), align: 'right' },
            { key: 'monto', header: 'Monto', cell: (r) => fmtCLP(r.montoTotal), align: 'right' },
            {
              key: 'tc',
              header: 'TC',
              cell: (r) => r.tiposCambio
                ? Object.entries(r.tiposCambio).map(([moneda, valor]) => `${moneda} ${valor}`).join(', ')
                : (r.tipoCambio != null ? `${r.tipoCambio} ${r.monedaTc ?? ''}` : '—'),
            },
            { key: 'cerradoPor', header: 'Cerrado por', cell: (r) => r.cerradoPorNombre ?? '—' },
            {
              key: 'asiento',
              header: 'Asiento',
              cell: (r) => (r.asientoNumero ? (
                <Link to="/contabilidad/asientos" className="text-[var(--color-accent)] underline-offset-2 hover:underline">
                  {r.asientoNumero}
                </Link>
              ) : '—'),
            },
            {
              key: 'estado',
              header: 'Traspaso',
              cell: (r) => (r.cerrado ? 'Ejecutado' : 'Pendiente'),
            },
          ]}
        />
      </div>
    </div>
  );
}
