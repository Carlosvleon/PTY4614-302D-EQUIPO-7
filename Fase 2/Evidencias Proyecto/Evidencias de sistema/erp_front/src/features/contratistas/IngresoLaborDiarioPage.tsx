import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useQueryScope, useEmpresaScopeId, listQueryKey } from '@/hooks/useQueryScope';
import { KpiStatCard } from '@/components/common/KpiStatCard';
import { MockListPage, type MockFormField, mockEntityId } from '@/components/common/MockListPage';
import { PeriodoVistaToggle } from '@/components/common/PeriodoVistaToggle';
import { usePeriodoVista } from '@/hooks/usePeriodoVista';
import { Badge } from '@/components/ui/badge';
import { fmtCLP, fmtDate } from '@/lib/utils';
import type { IngresoLaborDiario, TarifaContratista } from '@/types/domain';
import * as api from '@/services/api';
import { useAuth } from '@/app/auth-context';
import { hasPermission } from '@/lib/permissions';
import { findTarifaVigente } from '@/features/contratistas/resolve-tarifa-vigente';
import { validateCantidadPositiva } from '@/features/contratistas/contratistas-form-validators';
import type { MockFormValues } from '@/components/common/MockListPage';

const TARIFA_FORM_KEYS = new Set([
  'fecha',
  'contratistaId',
  'centroCostoId',
  'laborId',
  'actividadId',
]);

function tarifaFromValues(tarifas: TarifaContratista[] | undefined, values: MockFormValues) {
  return findTarifaVigente(tarifas ?? [], {
    contratistaId: String(values.contratistaId ?? ''),
    centroCostoId: String(values.centroCostoId ?? ''),
    laborId: String(values.laborId ?? ''),
    actividadId: String(values.actividadId ?? ''),
    fecha: String(values.fecha ?? ''),
  });
}

function EstadoBadge({ estado }: { estado: IngresoLaborDiario['estado'] }) {
  const tone =
    estado === 'FACTURADO' ? 'success'
      : estado === 'ASOCIADO' ? 'warning'
        : estado === 'PENDIENTE_APROBACION' ? 'info'
          : 'muted';
  return <Badge tone={tone}>{estado.replace(/_/g, ' ')}</Badge>;
}

export default function IngresoLaborDiarioPage() {
  const { user } = useAuth();
  const canCapture = hasPermission(user, 'contratistas:capture');
  const canOverride = hasPermission(user, 'contratistas:rate-override');
  const canFinalize = hasPermission(user, 'contratistas:finalize');
  const qc = useQueryClient();
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
  const ingresos = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'ingresos-labor-diario'),
    queryFn: api.getIngresosLaborDiario,
  });

  const periodoActual = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const kpiIngresos = useMemo(() => {
    const rows = ingresos.data ?? [];
    const delMes = rows.filter((r) => r.fecha.startsWith(periodoActual));
    const pendientes = rows.filter((r) => r.estado === 'PENDIENTE');
    const enProceso = rows.filter((r) => r.estado === 'ASOCIADO' || r.estado === 'FACTURADO');
    const overrides = rows.filter((r) => r.precioOverride);
    const sum = (list: typeof rows) => list.reduce((acc, r) => acc + Number(r.monto), 0);
    return {
      pendientesCount: pendientes.length,
      pendientesMonto: sum(pendientes),
      mesCount: delMes.length,
      mesMonto: sum(delMes),
      enProcesoCount: enProceso.length,
      enProcesoMonto: sum(enProceso),
      overridesCount: overrides.length,
    };
  }, [ingresos.data, periodoActual]);
  const tarifas = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'tarifas-contratista'),
    queryFn: () => api.getTarifasContratista(),
  });
  const tipos = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'tipos-contrato-contratista'),
    queryFn: api.getTiposContratoContratista,
  });
  const usuarios = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'usuarios-ingreso'),
    queryFn: api.getUsuarios,
  });
  const [laborFilter, setLaborFilter] = useState('');
  const actividades = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'actividades', laborFilter),
    queryFn: () => api.getActividades(laborFilter || undefined),
  });

  const formFields: MockFormField[] = [
    { name: 'fecha', label: 'Fecha', type: 'date', required: true, defaultValue: new Date().toISOString().slice(0, 10) },
    {
      name: 'contratistaId', label: 'Contratista / empresa', type: 'select', required: true,
      options: (contratistas.data ?? []).filter((c) => c.activo).map((c) => ({ value: c.id, label: c.razonSocial })),
    },
    {
      name: 'centroCostoId', label: 'Cuartel / centro de costo', type: 'select', required: true,
      options: (centros.data ?? []).map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nombre}` })),
    },
    {
      name: 'laborId', label: 'Labor', type: 'select', required: true,
      options: (labores.data ?? []).map((l) => ({ value: l.id, label: `${l.codigo} — ${l.nombre}` })),
    },
    {
      name: 'actividadId', label: 'Actividad (filtrada por labor)', type: 'select', required: true,
      options: (actividades.data ?? []).map((a) => ({ value: a.id, label: `${a.codigo} — ${a.nombre}` })),
    },
    {
      name: 'tipoJornada', label: 'Tipo', type: 'select', required: true, defaultValue: 'JORNADA',
      options: [
        { value: 'JORNADA', label: 'Jornada' },
        { value: 'TRATO', label: 'Trato' },
      ],
    },
    {
      name: 'cantidad',
      label: 'Cantidad (hrs / unidades)',
      type: 'number',
      required: true,
      validate: validateCantidadPositiva,
    },
    {
      name: 'tipoContratoId',
      label: 'Tipo contrato (si no hay tarifario)',
      type: 'select',
      options: (tipos.data ?? []).filter((t) => t.activa).map((t) => ({ value: t.id, label: `${t.codigo} — ${t.nombre}` })),
    },
    {
      name: 'precioUnitario',
      label: 'Precio unitario',
      type: 'number',
      hint: 'Opcional si hay tarifa vigente. Puede ser 0 para registrar asistencia/avance sin valorizar.',
    },
    {
      name: 'aprobadorId',
      label: 'Supervisor (aprobación)',
      type: 'select',
      options: (usuarios.data ?? []).filter((u) => u.activo).map((u) => ({ value: u.id, label: u.nombre })),
      hint: 'Obligatorio para digitación; jefatura puede omitirlo.',
    },
    {
      name: 'motivoOverride',
      label: 'Motivo de override',
      type: 'textarea',
      disabled: !canOverride,
      minLength: 5,
      hint: 'Obligatorio solo cuando el precio difiere de la tarifa vigente.',
    },
  ];

  return (
    <MockListPage<IngresoLaborDiario>
      title="Ingreso diario de labores"
      breadcrumbs={['Contratistas']}
      subtitle="Registro agrícola de jornadas/tratos. Sin tarifario puede grabarse con precio 0 o manual; requiere aprobación del supervisor."
      kpis={(
        <>
          <KpiStatCard
            label="Pendientes de proforma"
            value={kpiIngresos.pendientesCount}
            subtext={fmtCLP(kpiIngresos.pendientesMonto)}
            hint="Ingresos en estado PENDIENTE, listos para incluir en una proforma. El monto es la suma de sus totales."
          />
          <KpiStatCard
            label={`Monto ${periodoActual}`}
            value={fmtCLP(kpiIngresos.mesMonto)}
            subtext={`${kpiIngresos.mesCount} registro(s) en el mes calendario`}
            hint="Suma de montos de todos los ingresos cuya fecha cae en el mes actual (YYYY-MM), cualquier estado."
          />
          <KpiStatCard
            label="En proforma / facturado"
            value={kpiIngresos.enProcesoCount}
            subtext={fmtCLP(kpiIngresos.enProcesoMonto)}
            hint="Ingresos ASOCIADO (incluidos en proforma) o FACTURADO (con factura de proveedor registrada)."
          />
          <KpiStatCard
            label="Overrides de tarifa"
            value={kpiIngresos.overridesCount}
            subtext={kpiIngresos.overridesCount ? 'Revisar motivo en columna Precio' : 'Sin excepciones'}
            valueClassName={kpiIngresos.overridesCount ? 'text-[var(--color-warning)]' : undefined}
            hint="Cantidad de ingresos donde el precio unitario difiere de la tarifa vigente y quedó auditado con motivo."
          />
        </>
      )}
      queryKey="ingresos-labor-diario"
      queryFn={api.getIngresosLaborDiario}
      toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
      filterRows={(rows) => periodoVista.filter(rows, (r) => r.fecha)}
      createLabel="Nuevo ingreso"
      entityLabel="Ingreso"
      formFields={canCapture ? formFields : undefined}
      resolveFormFields={({ values }) => {
        const t = tarifaFromValues(tarifas.data, values);
        return formFields.map((field) => {
          if (field.name !== 'precioUnitario') return field;
          return {
            ...field,
            label: t
              ? `Precio unitario · ${fmtCLP(t.tarifa)} / ${t.unidad}`
              : 'Precio unitario',
            hint: t
              ? field.hint
              : 'Sin tarifa para esta combinación y fecha: el campo queda vacío hasta que exista tarifario.',
          };
        });
      }}
      formSize="xl"
      formValidate={(values) => {
        const t = tarifaFromValues(tarifas.data, values);
        const raw = values.precioUnitario;
        const precio = raw === '' || raw == null ? undefined : Number(raw);
        if (precio != null && t != null && Math.abs(precio - t.tarifa) > 0.01) {
          const m = String(values.motivoOverride ?? '').trim();
          if (m.length < 5) {
            return 'Indica un motivo de override de al menos 5 caracteres';
          }
        }
        return null;
      }}
      onFormOpen={(values) => setLaborFilter(String(values.laborId || ''))}
      onFieldChange={(name, value, values) => {
        let next: MockFormValues = { ...values, [name]: value };
        if (name === 'laborId') {
          const laborId = String(value || '');
          setLaborFilter(laborId);
          next = { ...next, actividadId: '', precioUnitario: '', motivoOverride: '' };
        }
        if (TARIFA_FORM_KEYS.has(name) || name === 'laborId') {
          const t = tarifaFromValues(tarifas.data, next);
          next = {
            ...next,
            precioUnitario: t ? t.tarifa : '',
            ...(name !== 'motivoOverride' ? { motivoOverride: '' } : {}),
          };
        }
        return next;
      }}
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'ILD'),
        fecha: String(v.fecha),
        contratistaId: String(v.contratistaId),
        contratista: '',
        centroCostoId: String(v.centroCostoId),
        centroCosto: '',
        laborId: String(v.laborId),
        labor: '',
        actividadId: String(v.actividadId),
        actividad: '',
        tipoJornada: v.tipoJornada as IngresoLaborDiario['tipoJornada'],
        cantidad: Number(v.cantidad),
        precioUnitario: Number(v.precioUnitario || 0),
        monto: Number(v.cantidad) * Number(v.precioUnitario || 0),
        estado: 'PENDIENTE',
      })}
      rowToFormValues={(r) => ({
        fecha: r.fecha,
        contratistaId: r.contratistaId,
        centroCostoId: r.centroCostoId,
        laborId: r.laborId,
        actividadId: r.actividadId,
        tipoJornada: r.tipoJornada,
        cantidad: r.cantidad,
        precioUnitario: r.precioUnitario ?? r.tarifaAplicada ?? '',
        motivoOverride: canOverride ? (r.motivoOverride ?? '') : '',
      })}
      onSave={async (values, id) => {
        const rawPrecio = values.precioUnitario;
        let precioUnitario = rawPrecio === '' || rawPrecio == null ? undefined : Number(rawPrecio);
        const tarifa = tarifaFromValues(tarifas.data, values);
        if (
          precioUnitario != null
          && tarifa != null
          && Math.abs(precioUnitario - tarifa.tarifa) <= 0.01
        ) {
          precioUnitario = undefined;
        }
        const override = precioUnitario != null && tarifa != null && Math.abs(precioUnitario - tarifa.tarifa) > 0.01;
        const motivoOverride = String(values.motivoOverride || '').trim();
        if (override && !canOverride) throw new Error('No tienes permiso para modificar la tarifa vigente');
        if (override && motivoOverride.length < 5) throw new Error('Indica un motivo de override de al menos 5 caracteres');
        const payload = {
          fecha: String(values.fecha),
          contratistaId: String(values.contratistaId),
          centroCostoId: String(values.centroCostoId),
          laborId: String(values.laborId),
          actividadId: String(values.actividadId),
          tipoJornada: String(values.tipoJornada) as 'JORNADA' | 'TRATO',
          cantidad: Number(values.cantidad),
          precioUnitario,
          tipoContratoId: String(values.tipoContratoId || '') || undefined,
          aprobadorId: String(values.aprobadorId || '') || undefined,
          motivoOverride: override ? motivoOverride : undefined,
        };
        if (id != null) await api.updateIngresoLaborDiario(String(id), payload);
        else await api.createIngresoLaborDiario(payload);
      }}
      onDelete={canCapture ? async (id) => { await api.deleteIngresoLaborDiario(String(id)); } : undefined}
      canEditRow={(row) => canCapture && (row.estado === 'PENDIENTE' || row.estado === 'PENDIENTE_APROBACION')}
      canDeleteRow={(row) => canCapture && (row.estado === 'PENDIENTE' || row.estado === 'PENDIENTE_APROBACION')}
      columns={[
        { key: 'fecha', header: 'Fecha', cell: (r) => fmtDate(r.fecha) },
        { key: 'ctr', header: 'Contratista', cell: (r) => r.contratista },
        { key: 'cc', header: 'CC', cell: (r) => r.centroCosto },
        { key: 'labor', header: 'Labor', cell: (r) => r.labor },
        { key: 'act', header: 'Actividad', cell: (r) => r.actividad },
        { key: 'tipo', header: 'Tipo', cell: (r) => r.tipoJornada },
        { key: 'cant', header: 'Cant.', cell: (r) => r.cantidad, align: 'right' },
        { key: 'tarifa', header: 'Tarifa aplicada', cell: (r) => `${fmtCLP(r.tarifaAplicada ?? r.precioUnitario)} / ${r.unidad ?? '—'}`, align: 'right' },
        {
          key: 'precio',
          header: 'Precio',
          cell: (r) => (
            <span className="inline-flex items-center gap-1">
              {fmtCLP(r.precioUnitario)}
              {r.precioOverride && (
                <span title={r.motivoOverride}>
                  <Badge tone="warning">Override</Badge>
                </span>
              )}
            </span>
          ),
          align: 'right',
        },
        { key: 'monto', header: 'Monto', cell: (r) => fmtCLP(r.monto), align: 'right' },
        { key: 'est', header: 'Estado', cell: (r) => <EstadoBadge estado={r.estado} /> },
        {
          key: 'acc',
          header: 'Acciones',
          sortable: false,
          filterable: false,
          cell: (r) => (
            canFinalize && r.estado === 'PENDIENTE_APROBACION' ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  void api.aprobarIngresoLaborDiario(r.id)
                    .then(async () => {
                      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'ingresos-labor-diario') });
                      toast.success('Ingreso aprobado');
                    })
                    .catch((err) => toast.error(err instanceof Error ? err.message : 'Error'));
                }}
              >
                Aprobar
              </Button>
            ) : '—'
          ),
        },
      ]}
    />
  );
}
