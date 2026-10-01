import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Printer, RefreshCw } from 'lucide-react';
import {
  labelDistribucionCc,
  labelLineaCc,
  ocPuedeEditar,
} from '@/features/compras/compras-oc-helpers';
import {
  LibroComprasEstadoTabs,
  LIBRO_COMPRAS_TAB_LABEL,
  isLibroComprasTab,
  type LibroComprasTab,
} from '@/features/compras/LibroComprasEstadoTabs';
import { RegistroCompraXmlModal } from '@/features/compras/RegistroCompraXmlModal';
import { RegistroCompraPdfModal } from '@/features/compras/RegistroCompraPdfModal';
import { AceptarDocumentoGoSocketModal } from '@/features/compras/AceptarDocumentoGoSocketModal';
import { SincronizarComprasGoSocketModal } from '@/features/compras/SincronizarComprasGoSocketModal';
import { RowActionIcons, RowActions } from '@/components/common/RowActions';
import { MockListPage, type MockFormField, mockEntityId } from '@/components/common/MockListPage';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { fmtCLP, fmtDate } from '@/lib/utils';
import { useQueryScope, useEmpresaScopeId, listQueryKey } from '@/hooks/useQueryScope';
import { canResolverOcPendiente } from '@/lib/workflowAprobacion';
import type { OrdenCompra, AprobacionOc, RecepcionOc, RegistroCompra } from '@/types/domain';
import { useAppSettings } from '@/app/app-settings-context';
import { useAuth } from '@/app/auth-context';
import { hasPermission } from '@/lib/permissions';
import { printEmpresaDocumento } from '@/lib/documentoPrint';
import { LibroResumenPanel } from '@/components/common/LibroResumenPanel';
import {
  ApprovalChainTimeline,
  buildApprovalTimelineSteps,
} from '@/components/aprobaciones/ApprovalChainVisual';
import { EMPTY_ARRAY } from '@/lib/empty';
import * as api from '@/services/api';
import { usePeriodoVista } from '@/hooks/usePeriodoVista';
import { fechaEnPeriodoYm } from '@/lib/periodoVista';
import { PeriodoVistaToggle } from '@/components/common/PeriodoVistaToggle';

const EMPTY_OC = EMPTY_ARRAY as OrdenCompra[];
const EMPTY_REGISTROS = EMPTY_ARRAY as RegistroCompra[];
const MOTIVO_RECHAZO_MIN = 5;
const GOSOCKET_PROVEEDOR_PLACEHOLDER = 'Proveedor GoSocket';

/** Razón social del emisor DTE; evita mostrar el placeholder legacy en grilla. */
function proveedorFacturaDisplay(r: RegistroCompra): string {
  const name = (r.proveedorFactura ?? '').trim();
  if (name && name !== GOSOCKET_PROVEEDOR_PLACEHOLDER) return name;
  const rut = r.gosocket?.rutEmisor?.trim();
  if (rut) return rut;
  return name || '—';
}

function MotivoRechazoBox({
  motivo,
  resueltoPor,
}: {
  motivo?: string | null;
  resueltoPor?: string | null;
}) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
      <p className="text-xs font-semibold uppercase tracking-wide">Motivo del rechazo</p>
      <p className="mt-1 whitespace-pre-wrap break-words">{motivo?.trim() || 'Sin motivo registrado.'}</p>
      {resueltoPor?.trim() ? (
        <p className="mt-1.5 text-xs opacity-90">Rechazado por {resueltoPor.trim()}</p>
      ) : null}
    </div>
  );
}

function nombreQuienRechazo(oc?: OrdenCompra | null, aprobacion?: AprobacionOc | null): string | undefined {
  const fromAp = aprobacion?.resueltoPorNombre?.trim();
  if (fromAp) return fromAp;
  for (const paso of oc?.aprobacionCadena ?? []) {
    const r = (paso.aprobadores ?? []).find((a) => a.estado === 'RECHAZADA');
    if (r?.nombre?.trim()) return r.nombre.trim();
  }
  return undefined;
}

function ocBandejaEstado(estado: string): 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'ANULADA' {
  if (estado === 'APROBADO' || estado === 'APROBADA' || estado === 'RECEPCIONADA' || estado === 'CONTABILIZADA' || estado === 'FACTURADO') {
    return 'APROBADA';
  }
  if (estado === 'RECHAZADO' || estado === 'RECHAZADA') return 'RECHAZADA';
  if (estado === 'ANULADO' || estado === 'ANULADA') return 'ANULADA';
  return 'PENDIENTE';
}

function DocBadge({ estado }: { estado: string }) {
  const labels: Record<string, string> = {
    PENDIENTE_APROBACION: 'Pendiente aprobación',
    CONTABILIZADA: 'Contabilizada',
    EMITIDO: 'Ingresada',
    EMISION_FALLIDA: 'Emisión rechazada (reintentar)',
    BORRADOR: 'Borrador',
    APROBADO: 'Aprobado',
    APROBADA: 'Aprobada',
    RECEPCIONADA: 'Recepcionada',
    RECHAZADO: 'Rechazado',
    RECHAZADA: 'Rechazada',
    OMITIDA: 'Omitida',
  };
  const map: Record<string, 'success' | 'warning' | 'danger' | 'muted' | 'info' | 'accent'> = {
    APROBADO: 'success',
    APROBADA: 'success',
    CONTABILIZADA: 'success',
    CONFIRMADA: 'success',
    EMITIDO: 'warning',
    PENDIENTE_APROBACION: 'warning',
    PENDIENTE: 'warning',
    BORRADOR: 'muted',
    EMISION_FALLIDA: 'danger',
    RECHAZADA: 'danger',
    RECHAZADO: 'danger',
    ANULADO: 'danger',
    ANULADA: 'danger',
    RECEPCIONADA: 'info',
    OMITIDA: 'muted',
  };
  return <Badge tone={map[estado] ?? 'muted'}>{labels[estado] ?? estado}</Badge>;
}

/** R1-06/07 — OC con distribución por centro de costo. */
export function OrdenesCompraPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedEmpresa } = useAppSettings();
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'compras:write');
  const periodoVista = usePeriodoVista();
  const { data = EMPTY_OC, isLoading } = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'ordenes-compra'),
    queryFn: api.getOrdenesCompra,
  });
  const ccQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'centros-costo'),
    queryFn: api.getCentrosCosto,
  });
  const proveedoresQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'proveedores'),
    queryFn: api.getProveedores,
  });
  const usuariosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'usuarios'),
    queryFn: api.getUsuarios,
  });
  const [saving, setSaving] = useState(false);
  const [confirmAnular, setConfirmAnular] = useState<OrdenCompra | null>(null);
  const [detalle, setDetalle] = useState<OrdenCompra | null>(null);

  const openId = searchParams.get('open');
  const initialSearch = searchParams.get('q')?.trim() || '';
  useEffect(() => {
    if (!openId || isLoading) return;
    const row = data.find((o) => o.id === openId);
    if (row) setDetalle(row);
  }, [openId, data, isLoading]);

  const userNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of usuariosQ.data ?? []) m.set(u.id, u.nombre);
    return m;
  }, [usuariosQ.data]);

  const timelineStepsForOc = (oc: OrdenCompra) =>
    buildApprovalTimelineSteps({
      solicitanteNombre: oc.solicitante || oc.creadoPorNombre || '—',
      cadenaIds: oc.aprobacionCadenaIds ?? [],
      cadena: oc.aprobacionCadena,
      nameForId: (id) => userNameById.get(id) ?? (id === oc.aprobadorId ? (oc.aprobadorNombre ?? id) : id),
      pasoActual: oc.aprobacionPasoActual ?? 1,
      bandejaEstado: ocBandejaEstado(oc.estado),
      aprobadorFallback: oc.aprobadorId,
      motivoRechazo: oc.motivoRechazo,
    });

  const closeDetalle = () => {
    setDetalle(null);
    if (!searchParams.get('open')) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('open');
      return next;
    }, { replace: true });
  };

  const centros = ccQ.data ?? [];

  const anularOc = async (row: OrdenCompra) => {
    if (['RECEPCIONADA', 'CONTABILIZADA', 'FACTURADO', 'ANULADO'].includes(row.estado)) {
      toast.error('No se puede anular esta OC en su estado actual');
      return;
    }
    if (!['BORRADOR', 'EMITIDO', 'PENDIENTE_APROBACION', 'RECHAZADO'].includes(row.estado)) {
      toast.error('Solo se puede anular en Borrador, Pendiente de aprobación o Rechazado');
      return;
    }
    setConfirmAnular(row);
  };

  const doAnularOc = async () => {
    const row = confirmAnular;
    if (!row) return;
    setSaving(true);
    try {
      const { id, ...rest } = row;
      await api.updateOrdenCompra(id, { ...rest, estado: 'ANULADO' });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'ordenes-compra') });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'aprobaciones-oc') });
      toast.success(`OC ${row.numero} anulada`);
      setConfirmAnular(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo anular');
    } finally {
      setSaving(false);
    }
  };

  const printOc = (r: OrdenCompra) => {
    if (!selectedEmpresa) {
      toast.error('Selecciona una empresa');
      return;
    }
    const prov = (proveedoresQ.data ?? []).find((p) => p.id === r.proveedorId);
    const obsParts = [
      r.solicitante && `Solicitante: ${r.solicitante}`,
      r.departamento && `Depto: ${r.departamento}`,
      r.distribucionCc?.length
        ? `CC:\n${r.distribucionCc.map((d) => {
          const { label, pct } = labelDistribucionCc(d, centros, r.neto);
          return `${label}: ${fmtCLP(d.monto)} (${pct}%)`;
        }).join('\n')}`
        : '',
    ].filter(Boolean);
    try {
      printEmpresaDocumento({
        empresa: selectedEmpresa,
        kind: 'OC',
        title: `Orden de compra ${r.numero}`,
        rows: [{
          folio: r.numero,
          contraparte: r.proveedor,
          fecha: r.fecha,
          neto: r.moneda === 'CLP' ? fmtCLP(r.neto) : `${r.neto} ${r.moneda}`,
          netoNum: r.neto,
          estado: r.estado,
          afacto: r.afacto,
          receptorRut: prov?.rut,
          receptorGiro: prov?.giro,
          observacion: obsParts.join('\n') || undefined,
          lineas: (r.lineas ?? []).map((l) => ({
            descripcion: l.centroCostoId || l.centroCosto
              ? `${l.descripcion} · CC ${labelLineaCc(l, centros)}`
              : l.descripcion,
            cantidad: l.cantidad,
            precioUnitario: r.moneda === 'CLP' ? fmtCLP(l.precioUnitario) : String(l.precioUnitario),
            total: r.moneda === 'CLP' ? fmtCLP(l.total) : String(l.total),
          })),
        }],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo imprimir');
    }
  };

  const dataVista = useMemo(
    () => periodoVista.filter(data, (r) => r.fecha),
    [data, periodoVista.todo, periodoVista.codigo],
  );
  const [dataFiltrada, setDataFiltrada] = useState<OrdenCompra[]>([]);
  useEffect(() => {
    setDataFiltrada(dataVista);
  }, [dataVista]);

  const cols: Column<OrdenCompra>[] = [
    {
      key: 'numero',
      header: 'Documento',
      filterType: 'text',
      filterValue: (r) => r.numero,
      cell: (r) => (
        <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); printOc(r); }}>
          <span className="font-mono text-xs text-[var(--color-accent)]">#{r.numero}</span>
          <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-[var(--color-muted)]">OrdenCompra</span>
        </button>
      ),
    },
    {
      key: 'fecha',
      header: 'Fecha emisión',
      filterType: 'date',
      filterValue: (r) => r.fecha,
      sortValue: (r) => r.fecha,
      cell: (r) => fmtDate(r.fecha),
    },
    {
      key: 'proveedor',
      header: 'Razón social',
      filterType: 'text',
      filterValue: (r) => r.proveedor,
      cell: (r) => r.proveedor,
    },
    {
      key: 'solicitante',
      header: 'Solicitante',
      filterType: 'text',
      filterValue: (r) => r.solicitante,
      cell: (r) => r.solicitante,
    },
    {
      key: 'neto',
      header: 'Total neto',
      filterType: 'number',
      filterValue: (r) => r.neto,
      sortValue: (r) => r.neto,
      cell: (r) => (r.moneda === 'CLP' ? fmtCLP(r.neto) : `${r.neto} ${r.moneda}`),
      align: 'right',
    },
    {
      key: 'estado',
      header: 'Estado',
      filterType: 'select',
      filterValue: (r) => r.estado,
      filterOptions: [
        { value: 'BORRADOR', label: 'Borrador' },
        { value: 'PENDIENTE_APROBACION', label: 'Pendiente aprobación' },
        { value: 'EMITIDO', label: 'Emitido (legado)' },
        { value: 'APROBADO', label: 'Aprobado' },
        { value: 'RECEPCIONADA', label: 'Recepcionada' },
        { value: 'ANULADO', label: 'Anulado' },
      ],
      cell: (r) => <DocBadge estado={r.estado} />,
    },
    {
      key: 'cadena',
      header: 'Cadena',
      sortable: false,
      filterable: false,
      cell: (r) => (
        r.aprobacionCadena?.length || r.aprobacionCadenaIds?.length || r.aprobadorId
          ? <ApprovalChainTimeline steps={timelineStepsForOc(r)} compact />
          : <span className="text-[var(--color-muted)]">—</span>
      ),
    },
    {
      key: 'acc',
      header: 'Acciones',
      sortable: false,
      filterable: false,
      hideable: false,
      cell: (r) => {
        // Anular solo donde la API lo acepta (no APROBADO: hay que recepcionar / libro).
        const canAnular = canWrite && ['BORRADOR', 'EMITIDO', 'PENDIENTE_APROBACION', 'RECHAZADO'].includes(r.estado);
        const canEmitirWizard = canWrite && ocPuedeEditar(r);
        const canRecepcionar = canWrite && r.estado === 'APROBADO';
        return (
          <RowActions
            actions={[
              {
                key: 'ver',
                label: 'Ver',
                icon: RowActionIcons.ver(),
                onClick: () => setDetalle(r),
              },
              ...(canEmitirWizard ? [{
                key: 'emitir',
                label: 'Editar',
                icon: RowActionIcons.emitir(),
                tone: 'accent' as const,
                onClick: () => navigate(`/compras/ordenes/${r.id}/editar`),
              }] : []),
              ...(canRecepcionar ? [{
                key: 'recepcion',
                label: 'Recepcionar',
                icon: RowActionIcons.detalle(),
                tone: 'success' as const,
                onClick: () => {
                  navigate(`/compras/recepciones?oc=${encodeURIComponent(r.numero)}`);
                  toast.message(`OC ${r.numero} aprobada`, {
                    description: 'Registre la recepción para luego asociar la factura en Libro de compras.',
                  });
                },
              }] : []),
              {
                key: 'print',
                label: 'Imprimir',
                icon: RowActionIcons.imprimir(),
                onClick: () => printOc(r),
              },
              ...(canAnular ? [{
                key: 'anular',
                label: 'Anular',
                icon: RowActionIcons.anular(),
                tone: 'danger' as const,
                disabled: saving,
                onClick: () => void anularOc(r),
              }] : []),
            ]}
          />
        );
      },
    },
  ];

  const printAll = () => {
    if (!selectedEmpresa) {
      toast.error('Selecciona una empresa');
      return;
    }
    try {
      printEmpresaDocumento({
        empresa: selectedEmpresa,
        kind: 'OC',
        title: 'Órdenes de compra',
        rows: dataFiltrada.map((r) => {
          const prov = (proveedoresQ.data ?? []).find((p) => p.id === r.proveedorId);
          return {
            folio: r.numero,
            contraparte: r.proveedor,
            fecha: r.fecha,
            neto: r.moneda === 'CLP' ? fmtCLP(r.neto) : `${r.neto} ${r.moneda}`,
            netoNum: r.neto,
            estado: r.estado,
            afacto: r.afacto,
            receptorRut: prov?.rut,
            receptorGiro: prov?.giro,
            observacion: [r.solicitante && `Solicitante: ${r.solicitante}`, r.departamento && `Depto: ${r.departamento}`]
              .filter(Boolean)
              .join('\n') || undefined,
            lineas: (r.lineas ?? []).map((l) => ({
              descripcion: l.centroCostoId || l.centroCosto
                ? `${l.descripcion} · CC ${labelLineaCc(l, centros)}`
                : l.descripcion,
              cantidad: l.cantidad,
              precioUnitario: r.moneda === 'CLP' ? fmtCLP(l.precioUnitario) : String(l.precioUnitario),
              total: r.moneda === 'CLP' ? fmtCLP(l.total) : String(l.total),
            })),
          };
        }),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo imprimir');
    }
  };

  return (
    <div>
      <PageHeader
        title="Órdenes de compra"
        breadcrumbs={['Compras']}
        subtitle="Sin firmas en la cadena → Editar. Aprobada → Recepcionar."
        action={(
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" leftIcon={<Printer size={16} />} onClick={printAll} disabled={!dataFiltrada.length} title="Imprimir">
              Imprimir
            </Button>
            {canWrite && (
              <Button leftIcon={<Plus size={16} />} onClick={() => navigate('/compras/ordenes/nueva')} title="Nueva OC">Nueva</Button>
            )}
          </div>
        )}
      />
      {isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
      ) : (
        <DataTable
          columns={cols}
          rows={dataVista}
          empty={periodoVista.empty('OC')}
          tableKey="compras.ordenes"
          pagination={{ storageKey: 'erp-ordenes-compra' }}
          onRowClick={(r) => setDetalle(r)}
          searchPlaceholder="Buscar por N° OC, proveedor, solicitante…"
          initialSearch={initialSearch}
          onFilteredRowsChange={setDataFiltrada}
          toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
        />
      )}

      <Modal
        open={detalle != null}
        onClose={closeDetalle}
        title={detalle ? `OC ${detalle.numero}` : 'Detalle OC'}
        size="lg"
        footer={detalle ? (
          <>
            {canWrite && ocPuedeEditar(detalle) && (
              <Button
                onClick={() => {
                  closeDetalle();
                  navigate(`/compras/ordenes/${detalle.id}/editar`);
                }}
              >
                Editar orden de compra
              </Button>
            )}
            <Button variant="secondary" onClick={() => printOc(detalle)}>
              Imprimir
            </Button>
            <Button variant="ghost" onClick={closeDetalle}>
              Cerrar
            </Button>
          </>
        ) : undefined}
      >
        {detalle && (
          <div className="space-y-4 text-sm">
            {canWrite && detalle.estado === 'APROBADO' && (
              <Button
                className="w-full"
                onClick={() => {
                  closeDetalle();
                  navigate(`/compras/recepciones?oc=${encodeURIComponent(detalle.numero)}`);
                }}
              >
                Siguiente: recepcionar OC
              </Button>
            )}
            <dl className="grid grid-cols-2 gap-3">
              <div><dt className="text-[var(--color-muted)]">Estado</dt><dd><DocBadge estado={detalle.estado} /></dd></div>
              <div><dt className="text-[var(--color-muted)]">Fecha</dt><dd>{fmtDate(detalle.fecha)}</dd></div>
              <div className="col-span-2"><dt className="text-[var(--color-muted)]">Proveedor</dt><dd>{detalle.proveedor}</dd></div>
              <div><dt className="text-[var(--color-muted)]">Solicitante</dt><dd>{detalle.solicitante}</dd></div>
              <div><dt className="text-[var(--color-muted)]">Creado por</dt><dd>{detalle.creadoPorNombre ?? '—'}</dd></div>
              <div><dt className="text-[var(--color-muted)]">Solicitado a</dt><dd>{detalle.aprobadorNombre ?? '—'}</dd></div>
              <div><dt className="text-[var(--color-muted)]">Depto</dt><dd>{detalle.departamento}</dd></div>
              <div><dt className="text-[var(--color-muted)]">Moneda / Neto</dt><dd className="font-mono">{detalle.moneda} · {fmtCLP(detalle.neto)}</dd></div>
              <div><dt className="text-[var(--color-muted)]">Afecto</dt><dd>{detalle.afacto}</dd></div>
            </dl>

            {detalle.estado === 'RECHAZADO' && (
              <MotivoRechazoBox
                motivo={detalle.motivoRechazo}
                resueltoPor={nombreQuienRechazo(detalle)}
              />
            )}

            {(detalle.aprobacionCadena?.length || detalle.aprobacionCadenaIds?.length || detalle.aprobadorId || ['PENDIENTE_APROBACION', 'EMITIDO', 'APROBADO', 'RECHAZADO'].includes(detalle.estado)) && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  Progreso de aprobación
                  {detalle.aprobacionPasosTotal
                    ? ` · paso ${detalle.aprobacionPasoActual ?? 1} de ${detalle.aprobacionPasosTotal}`
                    : ''}
                </p>
                <ApprovalChainTimeline steps={timelineStepsForOc(detalle)} />
                {detalle.estado === 'PENDIENTE_APROBACION' || detalle.estado === 'EMITIDO' ? (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      closeDetalle();
                      navigate('/compras/aprobaciones');
                    }}
                  >
                    Ir a bandeja de aprobaciones
                  </Button>
                ) : null}
              </div>
            )}

            {detalle.lineas && detalle.lineas.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">Líneas</p>
                <div className="overflow-x-auto rounded border border-[var(--color-border)]">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-[var(--color-muted)]">
                      <tr>
                        <th className="p-2">Descripción</th>
                        <th className="p-2">Centro de costo</th>
                        <th className="p-2">Cant.</th>
                        <th className="p-2">P. unit.</th>
                        <th className="p-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.lineas.map((l, i) => (
                        <tr key={`${detalle.id}-l-${i}`} className="border-t border-[var(--color-border)]">
                          <td className="p-2">{l.descripcion}</td>
                          <td className="p-2 text-xs">{labelLineaCc(l, centros)}</td>
                          <td className="p-2">{l.cantidad}</td>
                          <td className="p-2">{fmtCLP(l.precioUnitario)}</td>
                          <td className="p-2 text-right font-mono">{fmtCLP(l.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {detalle.distribucionCc && detalle.distribucionCc.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">Centros de costo</p>
                <ul className="space-y-1 rounded border border-[var(--color-border)] p-3">
                  {detalle.distribucionCc.map((cc) => {
                    const { label, pct } = labelDistribucionCc(cc, centros, detalle.neto);
                    return (
                      <li key={cc.centroCostoId} className="flex justify-between gap-2">
                        <span>{label}</span>
                        <span className="font-mono text-xs">{fmtCLP(cc.monto)} ({pct}%)</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirmAnular}
        onClose={() => setConfirmAnular(null)}
        title="Anular orden de compra"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setConfirmAnular(null)}>Cancelar</Button>
            <Button variant="danger" disabled={saving} onClick={() => void doAnularOc()}>Anular</Button>
          </>
        )}
      >
        <p className="text-sm text-[var(--color-muted)]">
          ¿Confirmas anular la OC <strong className="text-[var(--color-text)]">{confirmAnular?.numero}</strong>?
        </p>
      </Modal>
    </div>
  );
}

export function AprobacionesOcPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const soloPendientes = searchParams.get('estado') === 'PENDIENTE';
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<AprobacionOc | null>(null);
  const [vistaOc, setVistaOc] = useState<{ id: string; at: string; modificada: boolean } | null>(null);
  const [pending, setPending] = useState<{
    row: AprobacionOc;
    decision: 'APROBADO' | 'RECHAZADO';
  } | null>(null);
  const [pinAprobacion, setPinAprobacion] = useState('');
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const requierePin = Boolean(user?.aprobarConPin);
  const periodoVista = usePeriodoVista();

  const listQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'aprobaciones-oc'),
    queryFn: api.getAprobacionesOc,
  });
  const ocQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'ordenes-compra'),
    queryFn: api.getOrdenesCompra,
  });
  const ccQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'centros-costo'),
    queryFn: api.getCentrosCosto,
  });
  const usuariosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'usuarios'),
    queryFn: api.getUsuarios,
  });
  const centros = ccQ.data ?? [];
  const userNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of usuariosQ.data ?? []) m.set(u.id, u.nombre);
    return m;
  }, [usuariosQ.data]);

  const openId = searchParams.get('open');
  useEffect(() => {
    if (!openId || listQ.isLoading) return;
    const row = (listQ.data ?? []).find((r) => r.id === openId);
    if (row) setDetalle(row);
  }, [openId, listQ.data, listQ.isLoading]);

  const closeDetalle = () => {
    if (loadingId) return;
    setDetalle(null);
    if (!searchParams.get('open')) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('open');
      return next;
    }, { replace: true });
  };

  const rows = useMemo(() => {
    const all = listQ.data ?? [];
    const base = soloPendientes ? all.filter((r) => r.estado === 'PENDIENTE') : all;
    return periodoVista.filter(base, (r) => r.fecha);
  }, [listQ.data, soloPendientes, periodoVista.todo, periodoVista.codigo]);

  const resolveOc = (row: AprobacionOc): OrdenCompra | undefined =>
    (row.ocId ? (ocQ.data ?? []).find((o) => o.id === row.ocId) : undefined)
    ?? (ocQ.data ?? []).find((o) => o.numero === row.ocNumero);

  const ocDetalle = detalle ? resolveOc(detalle) : undefined;

  const ocModificada = Boolean(detalle && vistaOc?.id === detalle.id && vistaOc.modificada);

  useEffect(() => {
    if (!detalle || !ocDetalle?.updatedAt) return;
    const at = ocDetalle.updatedAt;
    const detalleId = detalle.id;
    setVistaOc((prev) => {
      if (!prev || prev.id !== detalleId) return { id: detalleId, at, modificada: false };
      if (prev.modificada) return prev;
      if (prev.at !== at) return { ...prev, modificada: true };
      return prev;
    });
  }, [detalle?.id, ocDetalle?.updatedAt]);

  const recargarDetalleAprobacion = async () => {
    const refreshed = await ocQ.refetch();
    await listQ.refetch();
    if (!detalle) return;
    const fresh = (detalle.ocId ? refreshed.data?.find((o) => o.id === detalle.ocId) : undefined)
      ?? refreshed.data?.find((o) => o.numero === detalle.ocNumero);
    setVistaOc({
      id: detalle.id,
      at: fresh?.updatedAt ?? vistaOc?.at ?? '',
      modificada: false,
    });
  };

  const timelineStepsFor = (row: AprobacionOc, oc?: OrdenCompra) =>
    buildApprovalTimelineSteps({
      solicitanteNombre: row.solicitante || oc?.solicitante || '—',
      cadenaIds: oc?.aprobacionCadenaIds ?? [],
      cadena: oc?.aprobacionCadena ?? row.aprobacionCadena,
      nameForId: (id) => (
        userNameById.get(id)
        ?? oc?.aprobacionCadena?.flatMap((p) => p.aprobadores).find((a) => a.id === id)?.nombre
        ?? row.aprobacionCadena?.flatMap((p) => p.aprobadores).find((a) => a.id === id)?.nombre
        ?? (id === row.aprobadorId ? row.aprobadorNombre : undefined)
        ?? id
      ),
      pasoActual: oc?.aprobacionPasoActual ?? row.aprobacionPasoActual ?? 1,
      bandejaEstado: oc
        ? ocBandejaEstado(oc.estado)
        : ocBandejaEstado(row.ocEstado ?? row.estado),
      aprobadorFallback: row.aprobadorId ?? oc?.aprobadorId,
      motivoRechazo: oc?.motivoRechazo ?? row.motivoRechazo,
    });

  const decide = async (row: AprobacionOc, decision: 'APROBADO' | 'RECHAZADO') => {
    const oc = resolveOc(row);
    if (!oc) {
      toast.error(`No se encontró la OC ${row.ocNumero}`);
      return;
    }
    if (oc.estado === 'ANULADO') {
      toast.error('Esta OC ya está anulada; no se puede aprobar ni rechazar');
      return;
    }
    if (requierePin && !/^\d{4}$/.test(pinAprobacion)) {
      toast.error('Ingresa tu PIN de 4 dígitos (Mi Perfil)');
      return;
    }
    if (decision === 'RECHAZADO' && motivoRechazo.trim().length < MOTIVO_RECHAZO_MIN) {
      toast.error('El motivo del rechazo es obligatorio (mínimo 5 caracteres).');
      return;
    }
    setLoadingId(row.id);
    try {
      // Payload limpio: evitar null/undefined que rompen el DTO Nest (400).
      const updated = await api.updateOrdenCompra(oc.id, {
        numero: oc.numero,
        fecha: oc.fecha,
        proveedor: oc.proveedor,
        ...(oc.proveedorId ? { proveedorId: oc.proveedorId } : {}),
        solicitante: oc.solicitante,
        ...(oc.aprobadorId ? { aprobadorId: oc.aprobadorId } : {}),
        ...(oc.aprobadorNombre ? { aprobadorNombre: oc.aprobadorNombre } : {}),
        moneda: oc.moneda,
        neto: oc.neto,
        afacto: oc.afacto,
        estado: decision,
        departamento: oc.departamento,
        ...(oc.cuentaContableId ? { cuentaContableId: oc.cuentaContableId } : {}),
        ...(oc.centroCostoId ? { centroCostoId: oc.centroCostoId } : {}),
        ...(oc.elementoCostoId ? { elementoCostoId: oc.elementoCostoId } : {}),
        ...(oc.distribucionCc?.length ? { distribucionCc: oc.distribucionCc } : {}),
        ...(oc.lineas?.length ? { lineas: oc.lineas } : {}),
        ...(decision === 'RECHAZADO' ? { motivoRechazo: motivoRechazo.trim() } : {}),
        ...(requierePin ? { pinAprobacion } : {}),
        ...(oc.updatedAt ? { updatedAtVisto: oc.updatedAt } : {}),
      }) as { estado?: string; numero?: string };
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'ordenes-compra') });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'aprobaciones-oc') });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'dashboard-kpis') });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'notificaciones') });
      const estadoNuevo = String(updated?.estado ?? '');
      if (decision === 'RECHAZADO') {
        toast.success('OC rechazada');
      } else if (estadoNuevo === 'PENDIENTE_APROBACION') {
        toast.success('Firma registrada. Falta otra firma en este paso.');
      } else if (estadoNuevo === 'APROBADO') {
        toast.success('OC aprobada');
      } else {
        toast.success('OC actualizada');
      }
      setPinAprobacion('');
      setMotivoRechazo('');
      setPending(null);
      closeDetalle();
      if (decision === 'APROBADO' && estadoNuevo === 'APROBADO') {
        toast.message(`Siguiente paso · OC ${oc.numero}`, {
          description: 'Recepcione la mercadería; después asocie la factura recibida del proveedor en Libro de compras.',
          action: {
            label: 'Recepcionar',
            onClick: () => navigate(`/compras/recepciones?oc=${encodeURIComponent(oc.numero)}`),
          },
          duration: 14_000,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar aprobación';
      if (/modificad/i.test(msg) && detalle) {
        setVistaOc((prev) => prev
          ? { ...prev, modificada: true }
          : { id: detalle.id, at: oc.updatedAt ?? '', modificada: true });
      }
      toast.error(msg);
    } finally {
      setLoadingId(null);
    }
  };

  const openDecision = async (row: AprobacionOc, decision: 'APROBADO' | 'RECHAZADO') => {
    const previa = resolveOc(row);
    const refreshed = await ocQ.refetch();
    const fresh = (row.ocId ? refreshed.data?.find((o) => o.id === row.ocId) : undefined)
      ?? refreshed.data?.find((o) => o.numero === row.ocNumero);
    const marcaVista = (vistaOc?.id === row.id ? vistaOc.at : undefined) ?? previa?.updatedAt;
    if (marcaVista && fresh?.updatedAt && fresh.updatedAt !== marcaVista) {
      setDetalle(row);
      setVistaOc({ id: row.id, at: marcaVista, modificada: true });
      toast.error('La orden fue modificada. Recarga el detalle antes de firmar.');
      return;
    }
    setMotivoRechazo('');
    setPinAprobacion('');
    setPending({ row, decision });
  };

  const quickActions = (r: AprobacionOc) => {
    const oc = resolveOc(r);
    const ocAnulada = oc?.estado === 'ANULADO';
    const canResolve =
      r.estado === 'PENDIENTE' && !ocAnulada && canResolverOcPendiente(user, r);
    return r.estado === 'PENDIENTE' ? (
      <span className="inline-flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
        <Button
          size="sm"
          variant="ghost"
          disabled={loadingId === r.id || ocQ.isLoading}
          onClick={() => setDetalle(r)}
        >
          Ver
        </Button>
        {canResolve && (
          <>
            <Button
              size="sm"
              disabled={loadingId === r.id || ocQ.isLoading}
              onClick={() => void openDecision(r, 'APROBADO')}
            >
              Aprobar
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={loadingId === r.id || ocQ.isLoading}
              onClick={() => void openDecision(r, 'RECHAZADO')}
            >
              Rechazar
            </Button>
          </>
        )}
      </span>
    ) : (
      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDetalle(r); }}>
        Ver
      </Button>
    );
  };

  const cols: Column<AprobacionOc>[] = [
    { key: 'oc', header: 'OC', cell: (r) => <span className="font-mono text-xs">{r.ocNumero}</span> },
    { key: 'proveedor', header: 'Proveedor', cell: (r) => r.proveedor },
    { key: 'solicitante', header: 'Solicitante', cell: (r) => r.solicitante || '—' },
    {
      key: 'solicitadoA',
      header: 'Solicitado a',
      cell: (r) => r.aprobadorNombre || (r.aprobadorId ? 'Asignado' : '—'),
    },
    {
      key: 'progreso',
      header: 'Cadena',
      sortable: false,
      cell: (r) => (
        <ApprovalChainTimeline
          steps={timelineStepsFor(r, resolveOc(r))}
          compact
        />
      ),
    },
    { key: 'monto', header: 'Monto', cell: (r) => fmtCLP(r.monto), align: 'right' },
    { key: 'fecha', header: 'Fecha', cell: (r) => fmtDate(r.fecha) },
    { key: 'estado', header: 'Estado', cell: (r) => <DocBadge estado={r.estado} /> },
    {
      key: 'resueltoPor',
      header: 'Resuelto por',
      cell: (r) => (r.estado === 'PENDIENTE' ? '—' : (r.resueltoPorNombre || '—')),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      sortable: false,
      filterable: false,
      hideable: false,
      cell: quickActions,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Aprobación de OC"
        breadcrumbs={['Compras']}
        subtitle={
          soloPendientes
            ? 'Solo pendientes · click en una fila para ver el detalle completo de la OC'
            : 'Lista mínima · detalle de la OC al abrir · acceso rápido a aprobar/rechazar'
        }
        action={(
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Checkbox
            label="Solo pendientes"
            className="text-sm font-normal text-[var(--color-text)]"
            checked={soloPendientes}
            onChange={(e) => {
              if (e.target.checked) setSearchParams({ estado: 'PENDIENTE' });
              else setSearchParams({});
            }}
          />
          </div>
        )}
      />

      {listQ.isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
      ) : (
        <DataTable
          columns={cols}
          rows={rows}
          empty={periodoVista.empty('aprobaciones')}
          tableKey="compras.aprobaciones-oc"
          pagination={{ storageKey: 'erp-aprobaciones-oc' }}
          searchPlaceholder="Buscar OC, proveedor, solicitante o jefe…"
          onRowClick={(r) => setDetalle(r)}
          toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
        />
      )}

      <Modal
        open={detalle != null}
        onClose={closeDetalle}
        title={detalle ? `OC ${detalle.ocNumero}` : 'Detalle OC'}
        size="lg"
        footer={(
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={!!loadingId} onClick={closeDetalle}>
              Cerrar
            </Button>
            {detalle?.estado === 'PENDIENTE'
              && ocDetalle?.estado !== 'ANULADO'
              && canResolverOcPendiente(user, detalle) && (
              <>
                <Button
                  variant="danger"
                  disabled={!!loadingId || ocQ.isLoading || ocModificada}
                  onClick={() => void openDecision(detalle, 'RECHAZADO')}
                >
                  Rechazar
                </Button>
                <Button
                  disabled={!!loadingId || ocQ.isLoading || ocModificada}
                  onClick={() => void openDecision(detalle, 'APROBADO')}
                >
                  Aprobar OC
                </Button>
              </>
            )}
          </div>
        )}
      >
        {detalle && (
          <div className="space-y-5 text-sm">
            {ocModificada && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                <p>Esta orden fue modificada después de abrir la aprobación. Los datos de esta pantalla ya no coinciden.</p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  onClick={() => void recargarDetalleAprobacion()}
                >
                  Recargar
                </Button>
              </div>
            )}
            {ocDetalle?.estado === 'ANULADO' && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
                Esta OC está <strong>anulada</strong>. No corresponde aprobar ni rechazar; la bandeja debería cerrarse como ANULADA.
              </div>
            )}
            <dl className="grid grid-cols-2 gap-3">
              <div><dt className="text-[var(--color-muted)]">Estado aprobación</dt><dd><DocBadge estado={detalle.estado} /></dd></div>
              <div><dt className="text-[var(--color-muted)]">Monto bandeja</dt><dd className="font-mono">{fmtCLP(detalle.monto)}</dd></div>
              <div className="col-span-2"><dt className="text-[var(--color-muted)]">Proveedor</dt><dd>{detalle.proveedor}</dd></div>
              <div><dt className="text-[var(--color-muted)]">Solicitante</dt><dd>{detalle.solicitante}</dd></div>
              <div><dt className="text-[var(--color-muted)]">Solicitado a</dt><dd>{detalle.aprobadorNombre ?? '—'}</dd></div>
              <div><dt className="text-[var(--color-muted)]">Fecha</dt><dd>{fmtDate(detalle.fecha)}</dd></div>
              <div>
                <dt className="text-[var(--color-muted)]">Resuelto por</dt>
                <dd>{detalle.estado === 'PENDIENTE' ? '—' : (detalle.resueltoPorNombre || '—')}</dd>
              </div>
            </dl>

            {(detalle.estado === 'RECHAZADA' || ocDetalle?.estado === 'RECHAZADO') && (
              <MotivoRechazoBox
                motivo={detalle.motivoRechazo ?? ocDetalle?.motivoRechazo}
                resueltoPor={nombreQuienRechazo(ocDetalle, detalle)}
              />
            )}

            {detalle && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  Progreso de aprobación
                  {ocDetalle?.aprobacionPasosTotal
                    ? ` · paso ${ocDetalle.aprobacionPasoActual ?? 1} de ${ocDetalle.aprobacionPasosTotal}`
                    : ''}
                </p>
                <ApprovalChainTimeline steps={timelineStepsFor(detalle, ocDetalle)} />
              </div>
            )}

            {ocDetalle ? (
              <>
                <dl className="grid grid-cols-2 gap-3 rounded border border-[var(--color-border)] p-3">
                  <div className="col-span-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                    Orden de compra
                  </div>
                  <div><dt className="text-[var(--color-muted)]">Nº</dt><dd className="font-mono">{ocDetalle.numero}</dd></div>
                  <div><dt className="text-[var(--color-muted)]">Estado OC</dt><dd><DocBadge estado={ocDetalle.estado} /></dd></div>
                  <div><dt className="text-[var(--color-muted)]">Fecha</dt><dd>{fmtDate(ocDetalle.fecha)}</dd></div>
                  <div><dt className="text-[var(--color-muted)]">Depto</dt><dd>{ocDetalle.departamento}</dd></div>
                  <div><dt className="text-[var(--color-muted)]">Creado por</dt><dd>{ocDetalle.creadoPorNombre ?? '—'}</dd></div>
                  <div><dt className="text-[var(--color-muted)]">Solicitante</dt><dd>{ocDetalle.solicitante}</dd></div>
                  <div><dt className="text-[var(--color-muted)]">Moneda</dt><dd>{ocDetalle.moneda}</dd></div>
                  <div><dt className="text-[var(--color-muted)]">Neto</dt><dd className="font-mono">{fmtCLP(ocDetalle.neto)}</dd></div>
                  <div><dt className="text-[var(--color-muted)]">Afecto</dt><dd>{ocDetalle.afacto}</dd></div>
                </dl>

                {ocDetalle.lineas && ocDetalle.lineas.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                      Líneas ({ocDetalle.lineas.length})
                    </p>
                    <div className="overflow-x-auto rounded border border-[var(--color-border)]">
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs text-[var(--color-muted)]">
                          <tr>
                            <th className="p-2">Descripción</th>
                            <th className="p-2">Cant.</th>
                            <th className="p-2">P. unit.</th>
                            <th className="p-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ocDetalle.lineas.map((l, i) => (
                            <tr key={`${ocDetalle.id}-l-${i}`} className="border-t border-[var(--color-border)]">
                              <td className="p-2">{l.descripcion}</td>
                              <td className="p-2">{l.cantidad}</td>
                              <td className="p-2">{fmtCLP(l.precioUnitario)}</td>
                              <td className="p-2 text-right font-mono">{fmtCLP(l.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {ocDetalle.distribucionCc && ocDetalle.distribucionCc.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                      Distribución centros de costo
                    </p>
                    <ul className="space-y-1 rounded border border-[var(--color-border)] p-3">
                      {ocDetalle.distribucionCc.map((cc) => {
                        const { label, pct } = labelDistribucionCc(cc, centros, ocDetalle.neto);
                        return (
                          <li key={cc.centroCostoId} className="flex justify-between gap-2">
                            <span>{label}</span>
                            <span className="font-mono text-xs">
                              {fmtCLP(cc.monto)} ({pct}%)
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-[var(--color-muted)]">
                {ocQ.isLoading ? 'Cargando detalle de la OC…' : 'No se encontró el detalle de la orden de compra asociada.'}
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={pending != null}
        onClose={() => {
          if (loadingId) return;
          setPending(null);
          setPinAprobacion('');
          setMotivoRechazo('');
        }}
        title={pending?.decision === 'APROBADO' ? 'Confirmar aprobación' : 'Confirmar rechazo'}
        size="md"
        footer={(
          <>
            <Button
              variant="ghost"
              disabled={!!loadingId}
              onClick={() => {
                setPending(null);
                setPinAprobacion('');
                setMotivoRechazo('');
              }}
            >
              Cancelar
            </Button>
            <Button
              variant={pending?.decision === 'RECHAZADO' ? 'danger' : 'primary'}
              disabled={
                !!loadingId
                || ocQ.isLoading
                || (requierePin && pinAprobacion.length !== 4)
                || (pending?.decision === 'RECHAZADO' && motivoRechazo.trim().length < MOTIVO_RECHAZO_MIN)
              }
              onClick={() => pending && void decide(pending.row, pending.decision)}
            >
              {loadingId
                ? 'Procesando…'
                : pending?.decision === 'APROBADO'
                  ? 'Sí, aprobar OC'
                  : 'Sí, rechazar OC'}
            </Button>
          </>
        )}
      >
        {pending && (
          <div className="space-y-3 text-sm">
            <p>
              Estás a punto de{' '}
              <strong>{pending.decision === 'APROBADO' ? 'aprobar' : 'rechazar'}</strong>
              {' '}la orden de compra{' '}
              <span className="font-mono font-semibold">{pending.row.ocNumero}</span>.
              ¿Estás seguro?
            </p>
            <div className="rounded border border-[var(--color-border)] p-3 space-y-1">
              <div><span className="text-[var(--color-muted)]">Proveedor:</span> {pending.row.proveedor}</div>
              <div><span className="text-[var(--color-muted)]">Monto:</span> {fmtCLP(pending.row.monto)}</div>
              <div><span className="text-[var(--color-muted)]">Solicitante:</span> {pending.row.solicitante}</div>
              <div>
                <span className="text-[var(--color-muted)]">Solicitado a:</span>{' '}
                {pending.row.aprobadorNombre ?? '—'}
              </div>
            </div>
            {pending.decision === 'RECHAZADO' && (
              <Field label="Motivo del rechazo">
                <Textarea
                  value={motivoRechazo}
                  onChange={(e) => setMotivoRechazo(e.target.value)}
                  placeholder="Explica por qué se rechaza esta OC (mínimo 5 caracteres)"
                  required
                  aria-required="true"
                />
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Obligatorio · mínimo {MOTIVO_RECHAZO_MIN} caracteres
                  {motivoRechazo.trim().length > 0
                    ? ` · ${motivoRechazo.trim().length}`
                    : ''}
                </p>
              </Field>
            )}
            {requierePin && (
              <Field label="PIN de aprobación (4 dígitos)">
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinAprobacion}
                  onChange={(e) => setPinAprobacion(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder={user?.tienePinAprobacion ? '••••' : 'Registra tu PIN en Mi Perfil'}
                  autoComplete="off"
                  className="font-mono tracking-widest"
                />
              </Field>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export function RecepcionesOcPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const [searchParams] = useSearchParams();
  const ocPrefill = searchParams.get('oc')?.trim() || '';
  const periodoVista = usePeriodoVista();
  const [detalle, setDetalle] = useState<RecepcionOc | null>(null);
  const ocQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'ordenes-compra'),
    queryFn: api.getOrdenesCompra,
  });
  const recQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'recepciones-oc'),
    queryFn: api.getRecepcionesOc,
  });
  const monedasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'monedas'),
    queryFn: api.getMonedas,
  });
  const monedaOptions = (monedasQ.data ?? []).filter((m) => m.activa).map((m) => ({
    value: m.codigo,
    label: `${m.codigo} · ${m.nombre}`,
  }));
  const ocOptions = useMemo(() => {
    const rows = ocQ.data ?? [];
    const elegibles = rows.filter(
      (o) => ['APROBADO', 'RECEPCIONADA'].includes(o.estado) || (ocPrefill && o.numero === ocPrefill),
    );
    const list = elegibles.length ? elegibles : rows;
    return list.map((o) => ({
      value: o.numero,
      label: `${o.numero} · ${o.proveedor} · ${o.estado}`,
    }));
  }, [ocQ.data, ocPrefill]);

  const today = new Date().toISOString().slice(0, 10);

  const defaultsForOc = (numero: string) => {
    const oc = (ocQ.data ?? []).find((o) => o.numero === numero);
    const recibido = (recQ.data ?? [])
      .filter((r) => r.ocNumero === numero && r.estado === 'CONFIRMADA')
      .reduce((a, r) => a + Number(r.monto), 0);
    const neto = Number(oc?.neto ?? 0);
    const pendiente = Math.max(Math.round((neto - recibido) * 100) / 100, 0);
    return {
      ocNumero: numero,
      fecha: today,
      tcAplicado: 1,
      moneda: oc?.moneda || 'CLP',
      monto: pendiente > 0 ? pendiente : neto || '',
    };
  };

  const createDefaults = useMemo(() => {
    if (ocPrefill && (ocQ.data?.length || ocQ.isFetched)) {
      return defaultsForOc(ocPrefill);
    }
    const unicas = (ocQ.data ?? []).filter((o) => o.estado === 'APROBADO');
    if (unicas.length === 1) {
      return defaultsForOc(unicas[0].numero);
    }
    return {
      fecha: today,
      tcAplicado: 1,
      moneda: 'CLP',
      monto: '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocPrefill, ocQ.data, ocQ.isFetched, recQ.data, today]);

  const formFields: MockFormField[] = [
    {
      name: 'ocNumero', label: 'Nº OC', type: 'select', required: true,
      defaultValue: ocPrefill || undefined,
      options: ocOptions,
    },
    {
      name: 'fecha',
      label: 'Fecha recepción',
      type: 'date',
      required: true,
      defaultValue: today,
    },
    {
      name: 'tcAplicado',
      label: 'TC que se aplicará',
      type: 'number',
      montoKind: 'tc',
      required: true,
      defaultValue: 1,
    },
    {
      name: 'moneda', label: 'Moneda', type: 'select', defaultValue: 'CLP', required: true,
      options: monedaOptions.length
        ? monedaOptions
        : [
            { value: 'CLP', label: 'CLP' },
            { value: 'USD', label: 'USD' },
            { value: 'CNY', label: 'CNY' },
            { value: 'EUR', label: 'EUR' },
          ],
    },
    {
      name: 'monto',
      label: 'Monto (neto pendiente de la OC)',
      type: 'number',
      montoKind: 'monto',
      required: true,
    },
  ];

  return (
    <>
      <MockListPage<RecepcionOc>
        title="Recepción de OC"
        breadcrumbs={['Compras']}
        subtitle={
          ocPrefill
            ? `Prefill OC ${ocPrefill}. Revisá fecha/monto (neto pendiente) y Crear.`
            : 'Alta con Recepcionar: elige OC aprobada; monto = neto pendiente. Luego Libro de compras.'
        }
        queryKey="recepciones-oc"
        queryFn={api.getRecepcionesOc}
        toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
        filterRows={(rows) => periodoVista.filter(rows, (r) => r.fecha)}
        createLabel="Recepcionar"
        entityLabel="Recepción"
        formFields={formFields}
        formSize="lg"
        createDefaults={createDefaults}
        autoOpenCreate={Boolean(ocPrefill && ocQ.isFetched)}
        onFieldChange={(name, value, values) => {
          if (name !== 'ocNumero') return;
          const num = String(value ?? '').trim();
          if (!num) return;
          return { ...values, ...defaultsForOc(num) };
        }}
        onRowClick={(r) => setDetalle(r)}
        buildMockRow={(v, id) => ({
          id: mockEntityId(id, 'REC'),
          ocNumero: String(v.ocNumero),
          fecha: String(v.fecha),
          tcAplicado: Number(v.tcAplicado),
          moneda: String(v.moneda),
          monto: Number(v.monto),
          estado: 'BORRADOR',
        })}
        rowToFormValues={(r) => ({
          ocNumero: r.ocNumero,
          fecha: r.fecha,
          tcAplicado: r.tcAplicado,
          moneda: r.moneda,
          monto: r.monto,
        })}
        onSave={async (values, id) => {
          const payload = {
            ocNumero: String(values.ocNumero),
            fecha: String(values.fecha),
            tcAplicado: Number(values.tcAplicado),
            moneda: String(values.moneda),
            monto: Number(values.monto),
            estado: 'CONFIRMADA' as const,
          };
          if (id != null) {
            await api.updateRecepcionOc(String(id), {
              fecha: payload.fecha,
              tcAplicado: payload.tcAplicado,
              moneda: payload.moneda,
              monto: payload.monto,
              estado: payload.estado,
            });
          } else {
            await api.createRecepcionOc(payload);
          }
        }}
        invalidateKeys={['ordenes-compra', 'movimientos-bodega', 'insumos']}
        columns={[
          { key: 'oc', header: 'OC', cell: (r) => r.ocNumero },
          { key: 'fecha', header: 'Fecha', cell: (r) => fmtDate(r.fecha) },
          { key: 'tc', header: 'TC', cell: (r) => r.tcAplicado },
          { key: 'moneda', header: 'Mon.', cell: (r) => r.moneda },
          { key: 'monto', header: 'Monto', cell: (r) => fmtCLP(r.monto), align: 'right' },
          { key: 'estado', header: 'Estado', cell: (r) => <DocBadge estado={r.estado} /> },
          {
            key: 'ver',
            header: '',
            sortable: false,
            filterable: false,
            hideable: false,
            cell: (r) => (
              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDetalle(r); }}>
                Ver
              </Button>
            ),
          },
        ]}
      />
      <Modal
        open={detalle != null}
        onClose={() => setDetalle(null)}
        title={detalle ? `Recepción · ${detalle.ocNumero}` : 'Detalle'}
        size="lg"
        footer={<Button variant="ghost" onClick={() => setDetalle(null)}>Cerrar</Button>}
      >
        {detalle && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <div><dt className="text-[var(--color-muted)]">OC</dt><dd className="font-mono">{detalle.ocNumero}</dd></div>
              <div><dt className="text-[var(--color-muted)]">Estado</dt><dd><DocBadge estado={detalle.estado} /></dd></div>
              <div><dt className="text-[var(--color-muted)]">Fecha</dt><dd>{fmtDate(detalle.fecha)}</dd></div>
              <div><dt className="text-[var(--color-muted)]">TC / Moneda</dt><dd>{detalle.tcAplicado} · {detalle.moneda}</dd></div>
              <div className="col-span-2"><dt className="text-[var(--color-muted)]">Monto</dt><dd className="font-mono">{fmtCLP(detalle.monto)}</dd></div>
            </dl>
            {detalle.lineas && detalle.lineas.length > 0 ? (
              <div className="overflow-x-auto rounded border border-[var(--color-border)]">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-[var(--color-muted)]">
                    <tr>
                      <th className="p-2">Descripción</th>
                      <th className="p-2">Cant.</th>
                      <th className="p-2">P. unit.</th>
                      <th className="p-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.lineas.map((l, i) => (
                      <tr key={`${detalle.id}-l-${i}`} className="border-t border-[var(--color-border)]">
                        <td className="p-2">{l.descripcion}</td>
                        <td className="p-2">{l.cantidad}</td>
                        <td className="p-2">{fmtCLP(l.precioUnitario)}</td>
                        <td className="p-2 text-right font-mono">{fmtCLP(l.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[var(--color-muted)]">Sin líneas registradas en esta recepción.</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

/** G5 — Alerta afecto/exento OC vs factura. */
const LIBRO_COMPRAS_TAB_STORAGE_KEY = 'erp-libro-compras-filtro-default';

function ocReferenciasDisplay(r: RegistroCompra): string[] {
  if (r.ocReferencias?.length) return r.ocReferencias;
  if (r.ocNumero?.trim()) return [r.ocNumero.trim()];
  return [];
}

function OcAsociadaCell({ r }: { r: RegistroCompra }) {
  const refs = ocReferenciasDisplay(r);
  if (!refs.length) {
    return <span className="text-xs text-[var(--color-muted)]">Sin OC en XML</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {refs.map((oc) => (
        <span key={oc} className="font-mono text-xs">{oc}</span>
      ))}
      {refs.length > 1 ? <Badge tone="info">{refs.length} OC</Badge> : null}
      {r.ocNoAprobada ? <Badge tone="warning">OC sin aprobar</Badge> : null}
    </span>
  );
}

export function RegistroCompraPage() {
  const navigate = useNavigate();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { selectedEmpresa } = useAppSettings();
  const canWrite = hasPermission(user, 'compras:write');
  const periodoVista = usePeriodoVista();
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get('q')?.trim() || '';
  const ocFromUrl = searchParams.get('oc')?.trim() || '';
  const { data = EMPTY_REGISTROS, isLoading } = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'registros-compra'),
    queryFn: api.getRegistrosCompra,
  });
  const ocQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'ordenes-compra'),
    queryFn: api.getOrdenesCompra,
  });
  const [saving, setSaving] = useState(false);

  // --- GoSocket (Libro de compras) — filtro principal, ver XML/PDF, aceptar/rechazar, sincronizar ---
  const [defaultTab, setDefaultTab] = useState<LibroComprasTab>(() => {
    const saved = localStorage.getItem(LIBRO_COMPRAS_TAB_STORAGE_KEY);
    return isLibroComprasTab(saved) ? saved : 'TODOS';
  });
  const [tab, setTab] = useState<LibroComprasTab>(defaultTab);
  const setAsDefaultTab = () => {
    localStorage.setItem(LIBRO_COMPRAS_TAB_STORAGE_KEY, tab);
    setDefaultTab(tab);
    toast.success(`"${LIBRO_COMPRAS_TAB_LABEL[tab]}" fijado como filtro por defecto`);
  };
  const [xmlRow, setXmlRow] = useState<RegistroCompra | null>(null);
  const [pdfRow, setPdfRow] = useState<RegistroCompra | null>(null);
  const [aceptarRow, setAceptarRow] = useState<RegistroCompra | null>(null);
  const [aceptarSaving, setAceptarSaving] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncSaving, setSyncSaving] = useState(false);

  const doAceptarGoSocket = async (comentario: string) => {
    if (!aceptarRow) return;
    setAceptarSaving(true);
    try {
      await api.aceptarRegistroCompraGoSocket(aceptarRow.id, { comentario, usuarioNombre: user?.nombre });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'registros-compra') });
      toast.success(`Documento ${aceptarRow.factura} aceptado`);
      setAceptarRow(null);
    } catch (e) {
      toast.error(
        e instanceof Error && e.message !== 'Operación no disponible'
          ? e.message
          : 'Aceptación GoSocket aún no disponible en este ambiente',
      );
    } finally {
      setAceptarSaving(false);
    }
  };

  const doRechazarGoSocket = async (comentario: string) => {
    if (!aceptarRow) return;
    setAceptarSaving(true);
    try {
      await api.rechazarRegistroCompraGoSocket(aceptarRow.id, { comentario, usuarioNombre: user?.nombre });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'registros-compra') });
      toast.success(`Documento ${aceptarRow.factura} rechazado/reclamado`);
      setAceptarRow(null);
    } catch (e) {
      toast.error(
        e instanceof Error && e.message !== 'Operación no disponible'
          ? e.message
          : 'Rechazo GoSocket aún no disponible en este ambiente',
      );
    } finally {
      setAceptarSaving(false);
    }
  };

  const doSyncGoSocket = async (desde: string, hasta: string) => {
    setSyncSaving(true);
    try {
      const res = (await api.syncRegistrosCompraGoSocket({ desde, hasta, estado: tab })) as {
        resumen: { total: number; aceptados: number; pendientes: number; rechazados: number };
      };
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'registros-compra') });
      const r = res.resumen;
      toast.success(
        `${r.total} documento(s) sincronizado(s): ${r.pendientes} pendiente(s), ${r.aceptados} aceptado(s), ${r.rechazados} rechazado(s)`,
      );
      setSyncOpen(false);
    } catch (e) {
      toast.error(
        e instanceof Error && e.message !== 'Operación no disponible'
          ? e.message
          : 'Sincronización GoSocket aún no disponible en este ambiente',
      );
    } finally {
      setSyncSaving(false);
    }
  };
  useEffect(() => {
    if (!ocFromUrl) return;
    toast.info(
      'El libro de compras se alimenta desde GoSocket. Las OC se leen del XML del documento al sincronizar.',
    );
    navigate('/compras/registro', { replace: true });
  }, [ocFromUrl, navigate]);

  const dataPeriodo = useMemo(() => {
    if (periodoVista.todo) return data;
    const ocFecha = new Map((ocQ.data ?? []).map((o) => [o.numero, o.fecha]));
    return data.filter((r) => {
      const fecha = r.fecha || ocFecha.get(r.ocNumero);
      // Sin fecha no hay mes que aplicar: ocultarlos deja el conteo de la pestaña y la grilla en desacuerdo.
      if (!fecha) return true;
      return fechaEnPeriodoYm(fecha, periodoVista.codigo);
    });
  }, [data, ocQ.data, periodoVista.todo, periodoVista.codigo]);
  const tabCounts = useMemo<Record<LibroComprasTab, number>>(() => ({
    ACEPTADO: dataPeriodo.filter((r) => r.gosocket?.estado === 'ACEPTADO').length,
    PENDIENTE: dataPeriodo.filter((r) => r.gosocket?.estado === 'PENDIENTE').length,
    RECHAZADO: dataPeriodo.filter((r) => r.gosocket?.estado === 'RECHAZADO').length,
    TODOS: dataPeriodo.length,
  }), [dataPeriodo]);
  // "Todos" no filtra por aceptación. Las demás pestañas filtran por el estado GoSocket.
  const dataTab = useMemo(
    () => (tab === 'TODOS' ? dataPeriodo : dataPeriodo.filter((r) => r.gosocket?.estado === tab)),
    [dataPeriodo, tab],
  );

  const alertasInconsistentes = dataTab.filter((r) => !r.afactoOk);
  const ocSinAprobarCount = dataTab.filter((r) => r.ocNoAprobada && r.estado !== 'ANULADO').length;
  const [previewRow, setPreviewRow] = useState<RegistroCompra | null>(null);
  const [ocsProveedor, setOcsProveedor] = useState<OrdenCompra[]>([]);

  const openPreview = (r: RegistroCompra) => {
    setPreviewRow(r);
    const key = (r.proveedorFactura || r.proveedorOc || '').trim().toLowerCase();
    const all = ocQ.data ?? [];
    const refNums = new Set(ocReferenciasDisplay(r));
    const vinculada = all.filter((o) => refNums.has(o.numero) || o.numero === r.ocNumero);
    const otras = all.filter((o) => {
      if (o.numero === r.ocNumero) return false;
      const prov = (o.proveedor || '').trim().toLowerCase();
      return Boolean(key) && (prov === key || prov.includes(key) || key.includes(prov));
    });
    // Primero la OC ya asociada a esta factura; luego otras del mismo proveedor.
    setOcsProveedor([...vinculada, ...otras]);
  };

  const contabilizarRegistro = async (row: RegistroCompra) => {
    if (row.estado === 'CONTABILIZADA') {
      toast.message('Esta factura ya está contabilizada');
      return;
    }
    if (row.estado === 'ANULADO') {
      toast.error('No se puede contabilizar un registro anulado');
      return;
    }
    if (row.ocNoAprobada) {
      toast.error('No se puede contabilizar: la OC aún no está aprobada');
      return;
    }
    setSaving(true);
    try {
      await api.updateRegistroCompra(row.id, {
        ocNumero: row.ocNumero,
        factura: row.factura,
        proveedorOc: row.proveedorOc,
        proveedorFactura: row.proveedorFactura,
        proveedorId: row.proveedorId,
        monto: row.monto,
        afactoOc: row.afactoOc,
        afactoFactura: row.afactoFactura,
        afactoOk: row.afactoOk,
        estado: 'CONTABILIZADA',
        lineas: row.lineas,
      });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'registros-compra') });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'ordenes-compra') });
      toast.success(`Factura ${row.factura} contabilizada`, {
        description: 'Siguiente opcional: Registrar pago en Tesorería cuando efectivamente paguen.',
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo contabilizar');
    } finally {
      setSaving(false);
    }
  };

  const dataLibro = dataTab;
  const [dataFiltrada, setDataFiltrada] = useState<RegistroCompra[]>([]);
  useEffect(() => {
    setDataFiltrada(dataLibro);
  }, [dataLibro]);

  // Libro por factura (Reu4 OC4): Factura / proveedor fac. primero; OC queda como vínculo.
  const cols: Column<RegistroCompra>[] = [
    {
      key: 'fac',
      header: 'Documento',
      filterType: 'text',
      filterValue: (r) => r.factura,
      cell: (r) => (
        <button type="button" className="text-left" onClick={() => openPreview(r)}>
          <span className="font-mono text-xs text-[var(--color-accent)]">#{r.factura}</span>
          <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Factura compra</span>
        </button>
      ),
    },
    {
      key: 'pfac',
      header: 'Razón social',
      filterType: 'text',
      filterValue: (r) => proveedorFacturaDisplay(r),
      cell: (r) => proveedorFacturaDisplay(r),
    },
    {
      key: 'oc',
      header: 'OC en XML',
      filterType: 'text',
      filterValue: (r) => ocReferenciasDisplay(r).join(' '),
      cell: (r) => <OcAsociadaCell r={r} />,
    },
    {
      key: 'monto',
      header: 'Total neto',
      filterType: 'number',
      filterValue: (r) => r.monto,
      sortValue: (r) => r.monto,
      cell: (r) => fmtCLP(r.monto),
      align: 'right',
    },
    {
      key: 'match3',
      header: 'Match',
      filterable: false,
      cell: (r) => (r.matchOk === false
        ? (
          <Badge tone="danger">
            Dif. {fmtCLP(Math.abs(r.matchDiff ?? 0))}
          </Badge>
        )
        : <Badge tone="success">OK</Badge>),
    },
    {
      key: 'aceptacion',
      header: 'Aceptación',
      filterType: 'select',
      filterValue: (r) => r.aceptacionEstado ?? 'PENDIENTE',
      filterOptions: [
        { value: 'PENDIENTE', label: 'Pendiente' },
        { value: 'ACEPTADA_PLAZO', label: 'Aceptada (plazo)' },
        { value: 'RECLAMADA', label: 'Reclamada' },
      ],
      cell: (r) => {
        if (r.gosocket) {
          if (r.gosocket.estado === 'ACEPTADO') {
            return (
              <div className="space-y-0.5">
                <Badge tone="success">Aceptado</Badge>
                <p className="text-[11px] text-[var(--color-muted)]">
                  {r.aceptadaPorNombre ? `por ${r.aceptadaPorNombre}` : ''}
                  {r.aceptadaAt ? ` · ${fmtDate(r.aceptadaAt)}` : ''}
                </p>
              </div>
            );
          }
          if (r.gosocket.estado === 'RECHAZADO') {
            const label = r.gosocket.rechazoOrigen === 'SII' ? 'Rechazado por el SII' : 'Rechazado (reclamo)';
            return (
              <div className="max-w-[220px] space-y-0.5">
                <Badge tone="danger">{label}</Badge>
                {r.gosocket.rechazoMotivo && (
                  <p className="truncate text-[11px] text-[var(--color-muted)]" title={r.gosocket.rechazoMotivo}>
                    {r.gosocket.rechazoMotivo}
                  </p>
                )}
              </div>
            );
          }
          return <Badge tone="muted">Pendiente</Badge>;
        }
        const est = r.aceptacionEstado ?? 'PENDIENTE';
        if (est === 'ACEPTADA_PLAZO') return <Badge tone="info">Aceptada (plazo)</Badge>;
        if (est === 'RECLAMADA') return <Badge tone="danger">Reclamada</Badge>;
        return <Badge tone="muted">Pendiente</Badge>;
      },
    },
    {
      key: 'estado',
      header: 'Estado',
      filterType: 'select',
      filterValue: (r) => r.estado,
      filterOptions: [
        { value: 'EMITIDO', label: 'Ingresada' },
        { value: 'CONTABILIZADA', label: 'Contabilizada' },
        { value: 'ANULADO', label: 'Anulado' },
      ],
      cell: (r) => <DocBadge estado={r.estado} />,
    },
    {
      key: '_act',
      header: 'Acciones',
      sortable: false,
      filterable: false,
      hideable: false,
      cell: (r) => (
        <RowActions
          actions={[
            {
              key: 'ver',
              label: 'Ver',
              icon: RowActionIcons.ver(),
              onClick: () => openPreview(r),
            },
            ...(r.gosocket ? [{
              key: 'xml',
              label: 'Ver XML',
              icon: RowActionIcons.dteXml(),
              onClick: () => setXmlRow(r),
            }] : []),
            ...(r.gosocket ? [{
              key: 'pdf',
              label: 'Ver PDF',
              icon: RowActionIcons.dtePdf(),
              onClick: () => setPdfRow(r),
            }] : []),
            ...(r.gosocket?.estado === 'PENDIENTE' ? [{
              key: 'aceptar-gosocket',
              label: 'Aceptar / Rechazar documento',
              icon: RowActionIcons.aceptar(),
              tone: 'success' as const,
              onClick: () => setAceptarRow(r),
            }] : []),
            ...(canWrite && r.estado !== 'ANULADO' && r.estado !== 'CONTABILIZADA' ? [{
              key: 'contabilizar',
              label: r.ocNoAprobada
                ? 'Contabilizar (OC aún no aprobada)'
                : 'Contabilizar (siguiente paso)',
              icon: RowActionIcons.facturar(),
              tone: 'accent' as const,
              filled: true,
              disabled: saving || Boolean(r.ocNoAprobada),
              onClick: () => void contabilizarRegistro(r),
            }] : []),
            ...(r.estado === 'CONTABILIZADA' ? [{
              key: 'pago',
              label: 'Registrar pago (tesorería)',
              icon: RowActionIcons.pago(),
              tone: 'success' as const,
              filled: true,
              onClick: () => {
                const q = new URLSearchParams({
                  folio: r.factura || r.id,
                  contraparte: r.proveedorFactura || '',
                  monto: String(r.monto ?? ''),
                });
                if (r.proveedorId) q.set('proveedorId', r.proveedorId);
                navigate(`/tesoreria/pagos?${q.toString()}`);
              },
            }] : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Libro de compras"
        breadcrumbs={['Compras']}
        subtitle="Documentos recibidos vía GoSocket: sincronizar, aceptar o rechazar, contabilizar y (opcional) pagar en Tesorería."
        action={(
          <span className="inline-flex flex-wrap justify-end gap-2">
            {tab !== 'TODOS' && (
              <Button
                variant="outline"
                leftIcon={<RefreshCw size={16} />}
                onClick={() => setSyncOpen(true)}
                title={`Sincronizar documentos ${LIBRO_COMPRAS_TAB_LABEL[tab].toLowerCase()} con GoSocket`}
              >
                Sincronizar {LIBRO_COMPRAS_TAB_LABEL[tab]}
              </Button>
            )}
          </span>
        )}
      />

      <LibroComprasEstadoTabs
        active={tab}
        onChange={setTab}
        counts={tabCounts}
        isDefault={tab === defaultTab}
        onSetDefault={setAsDefaultTab}
      />

      <LibroResumenPanel
        rows={dataFiltrada.map((r) => ({
          id: r.id,
          tipo: 'FACTURA',
          neto: Number(r.monto) || 0,
          afactoFactura: r.afactoFactura,
          estado: r.estado,
        }))}
        title="Resumen por tipo de documento"
      />

      {alertasInconsistentes.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
          <strong>Alerta afecto/exento:</strong> hay {alertasInconsistentes.length} registro(s) donde el tipo
          tributario de la factura no calza con la OC.
        </div>
      )}
      {ocSinAprobarCount > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
          <strong>OC aún no aprobada:</strong> hay {ocSinAprobarCount} factura(s) ligadas a una OC
          que aún no está Aprobada. No se puede contabilizar ni pagar hasta que la OC esté Aprobada
          (o posterior).
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
      ) : (
        <DataTable
          columns={cols}
          rows={dataLibro}
          empty={tab === 'TODOS' ? periodoVista.empty('registros') : `Sin documentos ${LIBRO_COMPRAS_TAB_LABEL[tab].toLowerCase()}`}
          tableKey="compras.libro-facturas"
          pagination={{ storageKey: 'erp-registros-compra' }}
          onRowClick={(r) => setPreviewRow(r)}
          initialSearch={initialSearch}
          searchPlaceholder="Buscar factura, proveedor, OC…"
          onFilteredRowsChange={setDataFiltrada}
          toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
        />
      )}

      <Modal
        open={Boolean(previewRow)}
        onClose={() => setPreviewRow(null)}
        title={previewRow ? `Factura ${previewRow.factura}` : 'Preview factura'}
        size="lg"
        footer={<Button variant="ghost" onClick={() => setPreviewRow(null)}>Cerrar</Button>}
      >
        {previewRow && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-2 rounded-lg border border-[var(--color-border)] p-3">
              <div>
                <span className="text-[var(--color-muted)]">OC en XML:</span>{' '}
                {ocReferenciasDisplay(previewRow).length
                  ? ocReferenciasDisplay(previewRow).join(', ')
                  : '—'}
                {previewRow.ocNoAprobada ? (
                  <span className="ml-2"><Badge tone="warning">OC sin aprobar</Badge></span>
                ) : null}
              </div>
              <div><span className="text-[var(--color-muted)]">Monto:</span> {fmtCLP(previewRow.monto)}</div>
              <div><span className="text-[var(--color-muted)]">Prov. OC:</span> {previewRow.proveedorOc}</div>
              <div><span className="text-[var(--color-muted)]">Prov. factura:</span> {previewRow.proveedorFactura}</div>
              <div><span className="text-[var(--color-muted)]">A/E:</span> {previewRow.afactoOc ?? '—'} → {previewRow.afactoFactura ?? '—'}</div>
              <div><span className="text-[var(--color-muted)]">Estado:</span> {previewRow.estado}</div>
              <div>
                <span className="text-[var(--color-muted)]">Aceptación:</span>{' '}
                {previewRow.aceptacionEstado === 'ACEPTADA_PLAZO'
                  ? 'Aceptada (plazo)'
                  : previewRow.aceptacionEstado === 'RECLAMADA'
                    ? 'Reclamada'
                    : 'Pendiente'}
              </div>
            </div>
            <div>
              <div className="mb-2 font-medium">
                OC vinculada y otras del proveedor
                {previewRow.proveedorFactura ? ` (${previewRow.proveedorFactura})` : ''}
              </div>
              {ocsProveedor.length === 0 ? (
                <p className="text-[var(--color-muted)]">
                  No se encontró la OC {previewRow.ocNumero} en el catálogo (puede haberse anulado o filtrado).
                  La factura igual queda asociada por número.
                </p>
              ) : (
                <div className="max-h-48 overflow-auto rounded border border-[var(--color-border)]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[var(--color-surface-2)] text-xs text-[var(--color-muted)]">
                      <tr>
                        <th className="p-2">Nº</th>
                        <th className="p-2">Proveedor</th>
                        <th className="p-2">Estado</th>
                        <th className="p-2 text-right">Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ocsProveedor.map((o) => {
                        const esVinculo = o.numero === previewRow.ocNumero;
                        return (
                          <tr key={o.id} className={esVinculo ? 'bg-[var(--color-accent-soft)]' : undefined}>
                            <td className="p-2 font-mono text-xs">
                              {o.numero}
                              {esVinculo ? (
                                <span className="ml-2 text-[10px] uppercase text-[var(--color-accent)]">vinculada</span>
                              ) : null}
                            </td>
                            <td className="p-2">{o.proveedor}</td>
                            <td className="p-2">{o.estado}</td>
                            <td className="p-2 text-right">{fmtCLP(o.neto)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <RegistroCompraXmlModal registro={xmlRow} onClose={() => setXmlRow(null)} />
      <RegistroCompraPdfModal registro={pdfRow} onClose={() => setPdfRow(null)} />
      <AceptarDocumentoGoSocketModal
        registro={aceptarRow}
        onClose={() => setAceptarRow(null)}
        onAceptar={(comentario) => void doAceptarGoSocket(comentario)}
        onRechazar={(comentario) => void doRechazarGoSocket(comentario)}
        saving={aceptarSaving}
      />
      <SincronizarComprasGoSocketModal
        open={syncOpen}
        tab={tab}
        rutReceptor={selectedEmpresa?.rut}
        razonSocialReceptor={selectedEmpresa?.razonSocial}
        onClose={() => setSyncOpen(false)}
        onSync={(desde, hasta) => void doSyncGoSocket(desde, hasta)}
        saving={syncSaving}
      />
    </div>
  );
}
