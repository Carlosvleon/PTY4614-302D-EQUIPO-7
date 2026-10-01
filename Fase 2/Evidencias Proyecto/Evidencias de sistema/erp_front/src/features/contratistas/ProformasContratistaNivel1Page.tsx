import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/app/auth-context';
import { MockListPage, type MockFormField, type MockFormValues } from '@/components/common/MockListPage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Modal } from '@/components/ui/modal';
import { Checkbox } from '@/components/ui/checkbox';
import { Select } from '@/components/ui/input';
import { useEmpresaScopeId, usePeriodoYmOperativo, useQueryScope, listQueryKey } from '@/hooks/useQueryScope';
import { hasPermission } from '@/lib/permissions';
import { fmtCLP } from '@/lib/utils';
import type { IngresoLaborDiario, ProformaContratista, ProformaContratistaPreview } from '@/types/domain';
import * as api from '@/services/api';
import { validatePeriodoYm } from '@/features/contratistas/contratistas-form-validators';

function estadoBadge(estado: ProformaContratista['estado']) {
  const tone = estado === 'FACTURADA' ? 'success' : estado === 'DEFINITIVA' ? 'warning' : estado === 'RECHAZADA' ? 'danger' : 'muted';
  return <Badge tone={tone}>{estado}</Badge>;
}

function ingresoOptionLabel(row: IngresoLaborDiario): string {
  const labor = row.labor?.trim() || 'Sin labor';
  const actividad = row.actividad?.trim() || 'Sin actividad';
  const unidad = row.unidad?.trim() ? ` ${row.unidad}` : '';
  return `${row.fecha} · ${labor} / ${actividad} · ${row.cantidad}${unidad} · ${fmtCLP(row.monto)}`;
}

function filterPendingIngresos(
  rows: IngresoLaborDiario[],
  ctx: {
    contratistaId: string;
    tipoContratoId: string;
    periodo: string;
    editingId: string | number | null;
  },
): IngresoLaborDiario[] {
  const { contratistaId, tipoContratoId, periodo, editingId } = ctx;
  if (!contratistaId && editingId == null) return [];
  return rows.filter((row) =>
    (row.estado === 'PENDIENTE' || row.proformaId === String(editingId ?? ''))
    && row.contratistaId === contratistaId
    && (!tipoContratoId || row.tipoContratoId === tipoContratoId)
    && (!periodo || row.fecha.slice(0, 7) === periodo));
}

function AutoProformaPreview({
  editingId,
  values,
  preview,
  previewing,
  previewWarning,
  runPreview,
}: {
  editingId: string | number | null;
  values: MockFormValues;
  preview: ProformaContratistaPreview | null;
  previewing: boolean;
  previewWarning: string | null;
  runPreview: (values: MockFormValues) => Promise<void>;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (editingId != null) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void runPreview(values);
    }, 450);
    return () => window.clearTimeout(timer.current);
  }, [
    editingId,
    values.contratistaId,
    values.tipoContratoId,
    values.periodo,
    values.moneda,
    values.ingresoIds,
    runPreview,
    values,
  ]);

  if (editingId != null) return null;

  return (
    <div className="mt-4 rounded-lg border border-[var(--color-border)] p-3">
      <div className="text-sm font-medium">Cálculo de la proforma</div>
      <div className="text-xs text-[var(--color-muted)]">
        Suma de los ingresos marcados (se actualiza al cambiar la selección).
      </div>
      {previewing && (
        <p className="mt-2 text-sm text-[var(--color-muted)]">Validando con el servidor…</p>
      )}
      {!previewing && preview && (
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-border)] pb-2">
            <span>
              <strong>{preview.ingresos.length}</strong> ingreso(s) seleccionado(s)
            </span>
            <span>
              Monto neto: <strong>{fmtCLP(preview.montoNeto)}</strong>{' '}
              {String(values.moneda || 'CLP')}
            </span>
          </div>
          <ul className="max-h-40 space-y-1 overflow-auto text-xs text-[var(--color-muted)]">
            {preview.ingresos.map((row) => (
              <li key={row.id} className="flex justify-between gap-2">
                <span className="truncate">{ingresoOptionLabel(row)}</span>
              </li>
            ))}
          </ul>
          {previewWarning && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{previewWarning}</p>
          )}
        </div>
      )}
      {!previewing && !preview && String(values.contratistaId || '') && (
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Elija contratista y marque ingresos pendientes para ver el total.
        </p>
      )}
    </div>
  );
}

export default function ProformasContratistaNivel1Page() {
  const { user } = useAuth();
  const canCapture = hasPermission(user, 'contratistas:capture');
  const canFinalize = hasPermission(user, 'contratistas:finalize');
  const canInvoice = hasPermission(user, 'contratistas:invoice');
  const canReverse = hasPermission(user, 'contratistas:reverse');
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const contratistas = useQuery({ queryKey: listQueryKey(scope, empresaId, 'contratistas'), queryFn: api.getContratistas });
  const tipos = useQuery({ queryKey: listQueryKey(scope, empresaId, 'tipos-contrato-contratista'), queryFn: api.getTiposContratoContratista });
  const ingresos = useQuery({ queryKey: listQueryKey(scope, empresaId, 'ingresos-labor-diario'), queryFn: api.getIngresosLaborDiario });
  const [estadoFiltro, setEstadoFiltro] = useState<'TODOS' | 'PENDIENTES' | 'FACTURADAS'>('TODOS');
  const proformas = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'proformas-contratista', estadoFiltro),
    queryFn: () => api.getProformasContratista(
      estadoFiltro === 'TODOS' ? undefined : { estado: estadoFiltro },
    ),
  });
  const usuarios = useQuery({ queryKey: listQueryKey(scope, empresaId, 'usuarios-aprob'), queryFn: api.getUsuarios });
  const [preview, setPreview] = useState<ProformaContratistaPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewWarning, setPreviewWarning] = useState<string | null>(null);
  const [siguienteNumero, setSiguienteNumero] = useState('PF-00001');
  const [definitiva, setDefinitiva] = useState<ProformaContratista | null>(null);
  const [aprobadorId, setAprobadorId] = useState('');
  const [factura, setFactura] = useState<ProformaContratista | null>(null);
  const [facturaIds, setFacturaIds] = useState<string[]>([]);
  const [registroCompraId, setRegistroCompraId] = useState('');
  const [facturaNumero, setFacturaNumero] = useState('');
  const [facturaFecha, setFacturaFecha] = useState(new Date().toISOString().slice(0, 10));
  const [reversa, setReversa] = useState<ProformaContratista | null>(null);
  const [pin, setPin] = useState('');
  const [reemision, setReemision] = useState<ProformaContratista | null>(null);
  const [numeroNuevo, setNumeroNuevo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [working, setWorking] = useState(false);
  const periodoOperativo = usePeriodoYmOperativo();

  const refreshSiguienteNumero = useCallback(async () => {
    try {
      const { numero } = await api.getSiguienteNumeroProforma();
      setSiguienteNumero(numero);
    } catch {
      /* demo / sin API */
    }
  }, []);

  useEffect(() => {
    void refreshSiguienteNumero();
  }, [refreshSiguienteNumero, proformas.dataUpdatedAt]);

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'proformas-contratista') }),
      qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'ingresos-labor-diario') }),
      qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'registros-compra') }),
    ]);
    await refreshSiguienteNumero();
  };

  const payloadFrom = (values: MockFormValues, editingId: string | number | null | undefined) => ({
    numero: editingId == null ? undefined : String(values.numero).trim(),
    contratistaId: String(values.contratistaId),
    tipoContratoId: String(values.tipoContratoId),
    periodo: String(values.periodo).trim(),
    moneda: String(values.moneda || 'CLP'),
    ingresoIds: String(values.ingresoIds || '').split(',').filter(Boolean),
  });

  const runPreview = useCallback(async (values: MockFormValues) => {
    const contratistaId = String(values.contratistaId || '').trim();
    const tipoContratoId = String(values.tipoContratoId || '').trim();
    const periodo = String(values.periodo || '').trim();
    const ingresoIds = String(values.ingresoIds || '').split(',').map((x) => x.trim()).filter(Boolean);

    if (!contratistaId || !ingresoIds.length) {
      setPreview(null);
      setPreviewWarning(null);
      return;
    }

    const selected = (ingresos.data ?? []).filter((row) => ingresoIds.includes(row.id));
    if (!selected.length) {
      setPreview(null);
      setPreviewWarning(null);
      return;
    }

    const contratistaRow = (contratistas.data ?? []).find((row) => row.id === contratistaId);
    const montoNeto = selected.reduce((sum, row) => sum + row.monto, 0);
    setPreview({
      empresaId: empresaId ?? '',
      contratista: contratistaRow ?? {
        id: contratistaId,
        razonSocial: selected[0]?.contratista ?? contratistaId,
        rut: '',
        activo: true,
      },
      periodo: periodo || selected[0]?.fecha.slice(0, 7) || '',
      ingresoIds,
      ingresos: selected,
      montoNeto,
    });

    const periodoOk = /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo);
    if (!tipoContratoId || !periodoOk) {
      setPreviewWarning('Complete tipo de contrato y período para validar antes de guardar.');
      return;
    }

    setPreviewing(true);
    setPreviewWarning(null);
    try {
      const payload = payloadFrom(values, null);
      const server = await api.previewProformaContratista(payload);
      setPreview({
        ...server,
        ingresos: selected,
        montoNeto: server.montoNeto,
      });
    } catch (error) {
      setPreviewWarning(
        error instanceof Error ? error.message : 'No se pudo validar la selección en el servidor.',
      );
    } finally {
      setPreviewing(false);
    }
  }, [contratistas.data, ingresos.data, empresaId]);

  const run = async (action: () => Promise<unknown>, success: string, close: () => void) => {
    setWorking(true);
    try {
      await action();
      await invalidate();
      close();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo completar la operación');
    } finally {
      setWorking(false);
    }
  };

  const baseFields: MockFormField[] = useMemo(() => [
    { name: 'contratistaId', label: 'Contratista', type: 'select', required: true, options: (contratistas.data ?? []).filter((row) => row.activo).map((row) => ({ value: row.id, label: row.razonSocial })) },
    { name: 'tipoContratoId', label: 'Tipo de contrato', type: 'select', required: true, options: (tipos.data ?? []).filter((row) => row.activa).map((row) => ({ value: row.id, label: `${row.codigo} — ${row.nombre}` })) },
    {
      name: 'periodo',
      label: 'Período contable',
      type: 'month',
      required: true,
      defaultValue: periodoOperativo,
      hint: 'Precargado con el periodo del menu superior (editable).',
      validate: (value) => validatePeriodoYm(value),
    },
    { name: 'moneda', label: 'Moneda', type: 'select', required: true, defaultValue: 'CLP', options: ['CLP', 'USD', 'EUR', 'CNY'].map((value) => ({ value, label: value })) },
  ], [contratistas.data, tipos.data, periodoOperativo]);

  const candidatasFactura = (proformas.data ?? []).filter((row) =>
    factura
    && row.estado === 'DEFINITIVA'
    && row.contratistaId === factura.contratistaId
    && row.moneda === factura.moneda
    && row.tipoContratoId === factura.tipoContratoId);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--color-muted)]">Filtrar:</span>
        <Select className="max-w-[200px]" value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value as typeof estadoFiltro)}>
          <option value="TODOS">Todas</option>
          <option value="PENDIENTES">Pendientes de facturar</option>
          <option value="FACTURADAS">Facturadas</option>
        </Select>
      </div>
      <MockListPage<ProformaContratista>
        title="Proformas y Registro de Compras"
        breadcrumbs={['Contratistas']}
        subtitle="Módulo agrícola: cuarteles (centros de costo) de la empresa activa. Monto desde ingresos autorizados."
        queryKey="proformas-contratista"
        queryFn={() => api.getProformasContratista(
          estadoFiltro === 'TODOS' ? undefined : { estado: estadoFiltro },
        )}
        createLabel="Nueva proforma"
        entityLabel="Proforma"
        formFields={canCapture ? baseFields : undefined}
        createDefaults={{ periodo: periodoOperativo, numero: siguienteNumero }}
        formSize="xl"
        resolveFormFields={({ editingId, values }) => {
          const contratistaId = String(values.contratistaId || '').trim();
          const tipoContratoId = String(values.tipoContratoId || '').trim();
          const periodo = String(values.periodo || '').trim();
          const numeroField: MockFormField = editingId == null
            ? {
                name: 'numero',
                label: 'Número',
                disabled: true,
                defaultValue: siguienteNumero,
                hint: 'Correlativo automático al guardar (PF-00001, PF-00002…).',
              }
            : { name: 'numero', label: 'Número', required: true };

          const candidates = filterPendingIngresos(ingresos.data ?? [], {
            contratistaId,
            tipoContratoId,
            periodo,
            editingId,
          });

          const ingresoField: MockFormField = {
            name: 'ingresoIds',
            label: 'Ingresos pendientes',
            type: 'multicheck',
            required: editingId == null,
            disabled: editingId != null || !contratistaId,
            autoSelectAll: editingId == null,
            selectionSyncKey: editingId == null
              ? `${contratistaId}|${tipoContratoId}|${periodo}|${candidates.map((row) => row.id).join(',')}`
              : undefined,
            options: candidates.map((row) => ({
              value: row.id,
              label: ingresoOptionLabel(row),
            })),
            hint: editingId
              ? 'Los ingresos de una proforma existente no se reasignan al editar.'
              : !contratistaId
                ? 'Seleccione primero un contratista; luego filtre por tipo y período.'
                : candidates.length
                  ? 'Todos los pendientes compatibles vienen marcados; desmarque los que no correspondan.'
                  : 'No hay ingresos pendientes para este contratista, tipo y período.',
          };

          return [numeroField, ...baseFields, ingresoField];
        }}
        buildMockRow={() => ({ id: '', numero: '', contratista: '', periodo: '', monto: 0, estado: 'BORRADOR' })}
        rowToFormValues={(row) => ({
          numero: row.numero, contratistaId: row.contratistaId ?? '', tipoContratoId: row.tipoContratoId ?? '',
          periodo: row.periodo, moneda: row.moneda ?? 'CLP',
          ingresoIds: (ingresos.data ?? []).filter((item) => item.proformaId === row.id).map((item) => item.id).join(','),
        })}
        onFormOpen={(_values, editingId) => {
          setPreview(null);
          setPreviewWarning(null);
          if (editingId == null) void refreshSiguienteNumero();
        }}
        onFieldChange={(name, _value, values) => {
          if (['contratistaId', 'tipoContratoId', 'periodo'].includes(name)) {
            setPreview(null);
            return { ...values, ingresoIds: '' };
          }
        }}
        formExtra={({ editingId, values }) => (
          <AutoProformaPreview
            editingId={editingId}
            values={values}
            preview={preview}
            previewing={previewing}
            previewWarning={previewWarning}
            runPreview={runPreview}
          />
        )}
        onSave={async (values, id) => {
          const payload = payloadFrom(values, id);
          if (id) {
            await api.updateProformaContratista(String(id), {
              ...payload,
              numero: String(values.numero).trim(),
            });
          } else {
            await api.createProformaContratista(payload);
          }
          setPreview(null);
        }}
        onDelete={canCapture ? async (id) => api.deleteProformaContratista(String(id)) : undefined}
        canEditRow={(row) => canCapture && row.estado === 'BORRADOR'}
        canDeleteRow={(row) => canCapture && row.estado === 'BORRADOR'}
        columns={[
          { key: 'numero', header: 'Número', cell: (row) => row.numero },
          { key: 'contratista', header: 'Contratista', cell: (row) => row.contratista },
          { key: 'tipo', header: 'Tipo contrato', cell: (row) => row.tipoContrato ?? row.tipoContratoCodigo ?? '—' },
          { key: 'periodo', header: 'Período', cell: (row) => row.periodo },
          { key: 'monto', header: 'Monto', align: 'right', cell: (row) => `${fmtCLP(row.monto)} ${row.moneda ?? 'CLP'}` },
          { key: 'estado', header: 'Estado', cell: (row) => estadoBadge(row.estado) },
          {
            key: 'factura', header: 'Compras', cell: (row) => {
              if (row.registroCompraId) {
                return (
                  <Link className="text-[var(--color-accent)] hover:underline" to={`/compras/registro?q=${encodeURIComponent(row.facturaAsociada ?? '')}`}>
                    {row.facturaAsociada ?? row.registroCompraId}
                  </Link>
                );
              }
              if (row.ordenCompraId) {
                const label = row.ordenCompraNumero ?? row.facturaAsociada ?? row.ordenCompraId;
                return (
                  <Link className="text-[var(--color-accent)] hover:underline" to={`/compras/ordenes?q=${encodeURIComponent(label)}`}>
                    {label}
                  </Link>
                );
              }
              return '—';
            },
          },
          {
            key: 'acciones', header: 'Acciones', sortable: false, filterable: false, hideable: false,
            cell: (row) => (
              <span className="inline-flex flex-wrap gap-1">
                {canFinalize && row.estado === 'BORRADOR' && <Button size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); setDefinitiva(row); setAprobadorId(''); }}>Solicitar aprobación</Button>}
                {canFinalize && row.estado === 'PENDIENTE_APROBACION' && <Button size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); void run(() => api.aprobarProformaDefinitiva(row.id), 'Proforma aprobada', () => undefined); }}>Aprobar</Button>}
                {canInvoice && row.estado === 'DEFINITIVA' && <Button size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); setFactura(row); setFacturaIds([row.id]); setFacturaNumero(''); setRegistroCompraId(''); }}>Facturar</Button>}
                {canReverse && row.estado === 'DEFINITIVA' && (
                  <>
                    <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); setReversa(row); setPin(''); }}>Reversar</Button>
                    <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); setReemision(row); setNumeroNuevo(''); setMotivo(''); }}>Reemitir</Button>
                  </>
                )}
              </span>
            ),
          },
        ]}
      />

      <Modal open={definitiva != null} onClose={() => setDefinitiva(null)} title="Solicitar aprobación de proforma" footer={<><Button variant="ghost" onClick={() => setDefinitiva(null)}>Cancelar</Button><Button disabled={working || !aprobadorId} onClick={() => definitiva && void run(() => api.marcarProformaDefinitiva(definitiva.id, { aprobadorId }), 'Solicitud enviada', () => setDefinitiva(null))}>Enviar</Button></>}>
        <p className="mb-3 text-sm">La proforma <strong>{definitiva?.numero}</strong> quedará pendiente hasta que el supervisor la autorice.</p>
        <Field label="Supervisor" required>
          <Select value={aprobadorId} onChange={(e) => setAprobadorId(e.target.value)} required>
            <option value="">Seleccionar…</option>
            {(usuarios.data ?? []).filter((u) => u.activo).map((u) => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </Select>
        </Field>
      </Modal>

      <Modal open={factura != null} onClose={() => { setFactura(null); setFacturaIds([]); }} title="Asociar factura / generar OC" size="xl" footer={<><Button variant="ghost" onClick={() => { setFactura(null); setFacturaIds([]); }}>Cancelar</Button><Button disabled={working || !facturaIds.length || (!registroCompraId.trim() && !facturaFecha.trim())} onClick={() => factura && void run(() => api.asociarFacturaProforma(factura.id, registroCompraId.trim() ? { registroCompraId: registroCompraId.trim(), proformaIds: facturaIds, numero: facturaNumero.trim() || undefined } : { numero: facturaNumero.trim() || undefined, fecha: facturaFecha, proformaIds: facturaIds }), registroCompraId.trim() ? 'Registro asociado' : 'Orden de compra generada', () => { setFactura(null); setFacturaIds([]); })}>{registroCompraId.trim() ? 'Asociar registro' : 'Generar OC'}</Button></>}>
        <div className="grid gap-3">
          <p className="text-sm text-[var(--color-muted)]">Puede generar OC o enlazar un registro de compra ya contabilizado. Varias proformas pueden cruzar meses si comparten contratista, moneda y tipo.</p>
          <Field label="ID registro compra existente (opcional)">
            <Input value={registroCompraId} onChange={(event) => setRegistroCompraId(event.target.value)} placeholder="Enlazar sin generar OC" />
          </Field>
          <Field label="Ref. documento proveedor (opcional)">
            <Input value={facturaNumero} onChange={(event) => setFacturaNumero(event.target.value)} placeholder="Folio factura del contratista" />
          </Field>
          <Field label="Fecha OC" required>
            <DateInput value={facturaFecha} onChange={setFacturaFecha} required />
          </Field>
          <Field label="Proformas compatibles" required>
            <div className="max-h-[min(50vh,22rem)] space-y-2 overflow-auto rounded border border-[var(--color-border)] p-2 text-sm">
              {candidatasFactura.map((row) => (
                <Checkbox
                  key={row.id}
                  checked={facturaIds.includes(row.id)}
                  disabled={row.id === factura?.id}
                  label={`${row.numero} · ${row.periodo} · ${fmtCLP(row.monto)} ${row.moneda ?? 'CLP'}`}
                  onChange={(event) => setFacturaIds((current) =>
                    event.target.checked
                      ? [...new Set([...current, row.id])]
                      : current.filter((id) => id !== row.id))}
                />
              ))}
            </div>
          </Field>
        </div>
      </Modal>

      <Modal open={reversa != null} onClose={() => setReversa(null)} title="Reversar proforma" footer={<><Button variant="ghost" onClick={() => setReversa(null)}>Cancelar</Button><Button variant="danger" disabled={working || pin.trim().length < 4} onClick={() => reversa && void run(() => api.reversarProforma(reversa.id, pin), 'Proforma reversada', () => setReversa(null))}>Reversar</Button></>}>
        <Field label="Clave de reversa (Mi Perfil)" required>
          <Input type="password" value={pin} onChange={(event) => setPin(event.target.value)} required />
        </Field>
      </Modal>

      <Modal open={reemision != null} onClose={() => setReemision(null)} title="Reemitir proforma" footer={<><Button variant="ghost" onClick={() => setReemision(null)}>Cancelar</Button><Button disabled={working || !numeroNuevo.trim() || motivo.trim().length < 5} onClick={() => reemision && void run(() => api.reemitirProforma(reemision.id, { numeroNuevo: numeroNuevo.trim(), motivo: motivo.trim() }), 'Proforma reemitida', () => setReemision(null))}>Reemitir</Button></>}>
        <div className="grid gap-3">
          <Field label="Número nuevo" required>
            <Input value={numeroNuevo} onChange={(event) => setNumeroNuevo(event.target.value)} required />
          </Field>
          <Field label="Motivo" required>
            <Textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} minLength={5} required />
            <p className="mt-1 text-[11px] text-[var(--color-muted)]">Mínimo 5 caracteres.</p>
          </Field>
        </div>
      </Modal>
    </>
  );
}
