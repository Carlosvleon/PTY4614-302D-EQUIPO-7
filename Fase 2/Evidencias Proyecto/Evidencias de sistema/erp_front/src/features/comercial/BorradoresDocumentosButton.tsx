import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileStack, Eye, Trash2, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import {
  useQueryScope,
  useEmpresaScopeId,
  usePeriodoScopeCodigo,
  listQueryKey,
  periodListQueryKey,
} from '@/hooks/useQueryScope';
import { useAppSettings } from '@/app/app-settings-context';
import { useAuth } from '@/app/auth-context';
import { PeriodoVistaToggle } from '@/components/common/PeriodoVistaToggle';
import { usePeriodoVista } from '@/hooks/usePeriodoVista';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Field, Select } from '@/components/ui/input';
import { fmtCLP, fmtDate } from '@/lib/utils';
import { printEmpresaDocumento, type PrintDocKind } from '@/lib/documentoPrint';
import type { DocumentoComercial } from '@/types/domain';
import { esTipoEmision } from '@/types/domain';
import * as api from '@/services/api';
import {
  etiquetaTipoDteBorrador,
  pathCargarBorradorEmision,
} from '@/features/comercial/emitir-ov-helpers';

const PREVIEW_KIND: Record<string, PrintDocKind> = {
  FACTURA: 'FACTURA',
  OC: 'OC',
  NC: 'NC',
  ND: 'ND',
  GUIA: 'GUIA',
  ORDEN_VENTA: 'ORDEN_VENTA',
};

function esBorradorVentas(tipo: string): boolean {
  return esTipoEmision(tipo) || tipo === 'ORDEN_VENTA';
}

function badgeLabel(n: number): string {
  if (n <= 0) return '';
  if (n > 9) return '+9';
  return String(n);
}

function fechaEnPeriodo(fecha: string, codigoPeriodo: string): boolean {
  const f = (fecha || '').trim();
  if (/^\d{4}-\d{2}/.test(f)) return f.startsWith(codigoPeriodo);
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(f);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}` === codigoPeriodo;
  return false;
}

export function BorradoresDocumentosButton() {
  const navigate = useNavigate();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { selectedEmpresa } = useAppSettings();
  const codigoPeriodo = usePeriodoScopeCodigo();
  const periodoVista = usePeriodoVista();
  const isAdmin = user?.rolId === 'ROL-1' || (user?.permisos?.includes('*') ?? false);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filtroUsuarioId, setFiltroUsuarioId] = useState('');

  const countQ = useQuery({
    queryKey: periodListQueryKey(scope, empresaId, codigoPeriodo, 'documentos-borradores', 'count'),
    queryFn: () => api.getDocumentosBorradores(),
  });
  const borradoresQ = useQuery({
    queryKey: periodListQueryKey(
      scope,
      empresaId,
      codigoPeriodo,
      'documentos-borradores',
      isAdmin ? (filtroUsuarioId || 'all') : 'own',
    ),
    queryFn: () => api.getDocumentosBorradores(
      isAdmin && filtroUsuarioId ? filtroUsuarioId : undefined,
    ),
    enabled: open,
  });
  const usuariosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'usuarios'),
    queryFn: api.getUsuarios,
    enabled: open && isAdmin,
  });
  const borradoresAll = useMemo(
    () => ((borradoresQ.data ?? countQ.data ?? []) as DocumentoComercial[])
      .filter((d) => esBorradorVentas(d.tipo)),
    [borradoresQ.data, countQ.data],
  );
  const borradores = periodoVista.filter(borradoresAll, (d) => d.fecha);

  const count = ((countQ.data ?? []) as DocumentoComercial[])
    .filter((d) => esBorradorVentas(d.tipo) && periodoVista.inVista(d.fecha)).length;
  const badge = badgeLabel(count);
  const otrosPeriodo = borradores.filter((d) => !fechaEnPeriodo(d.fecha, codigoPeriodo)).length;
  const otrasEmpresas = borradores.filter((d) => d.empresaId && d.empresaId !== empresaId).length;

  const invalidate = async () => {
    await qc.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey.includes('documentos-borradores'),
    });
    await qc.invalidateQueries({
      queryKey: periodListQueryKey(scope, empresaId, codigoPeriodo, 'documentos'),
    });
  };

  const ver = (r: DocumentoComercial) => {
    if (!selectedEmpresa) {
      toast.error('Selecciona una empresa');
      return;
    }
    try {
      printEmpresaDocumento({
        empresa: selectedEmpresa,
        kind: PREVIEW_KIND[r.tipo] ?? 'FACTURA',
        title: `${etiquetaTipoDteBorrador(r)} ${r.folio}`,
        rows: [{
          folio: r.folio,
          contraparte: r.cliente,
          fecha: r.fecha,
          neto: fmtCLP(r.neto),
          netoNum: r.neto,
          iva: r.iva != null ? fmtCLP(r.iva) : undefined,
          total: r.total != null ? fmtCLP(r.total) : undefined,
          estado: r.estado,
          receptorRut: r.receptorRut,
          receptorGiro: r.receptorGiro,
          receptorDireccion: r.receptorDireccion,
          receptorComuna: r.receptorComuna,
          receptorCiudad: r.receptorCiudad,
          observacion: r.observaciones,
          lineas: (r.lineas ?? []).map((l) => ({
            codigo: l.codigoProducto,
            descripcion: l.descripcion,
            cantidad: l.cantidad,
            unidad: l.unidadMedida,
            descuento: l.descuentoPct ? `${l.descuentoPct}%` : undefined,
            precioUnitario: fmtCLP(l.precioUnitario),
            total: fmtCLP(l.total),
          })),
        }],
        forceWatermark: 'BORRADOR',
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo abrir la vista previa');
    }
  };

  const cargar = (r: DocumentoComercial) => {
    if (r.empresaId && r.empresaId !== empresaId) {
      toast.error(
        `Este borrador es de otra empresa (${r.empresaNombre ?? r.empresaId}). Cambia la empresa en el header antes de cargarlo.`,
      );
      return;
    }
    if (!fechaEnPeriodo(r.fecha, codigoPeriodo)) {
      toast.warning(
        `Advertencia: el borrador es del periodo ${r.fecha.slice(0, 7)}, distinto al mes contable activo ${codigoPeriodo}.`,
      );
    }
    const dest = pathCargarBorradorEmision(r);
    if ('error' in dest) {
      toast.error(dest.error);
      navigate('/comercial/emitir');
      return;
    }
    setOpen(false);
    navigate(dest.path);
  };

  const borrar = async (r: DocumentoComercial) => {
    if (!window.confirm(`¿Eliminar borrador ${r.folio}? Esta acción no se puede deshacer.`)) return;
    setBusyId(r.id);
    try {
      await api.eliminarDocumentoBorrador(r.id);
      await invalidate();
      toast.success(`Borrador ${r.folio} eliminado`);
      if (borradores.length <= 1) setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
        title={count ? `${count} borrador(es) pendiente(s)` : 'Sin borradores'}
      >
        <FileStack size={16} className="text-[var(--color-muted)]" />
        Borradores
        {badge ? (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold leading-none text-white shadow"
            aria-label={`${count} borradores`}
          >
            {badge}
          </span>
        ) : null}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Borradores"
        size="lg"
        footer={(
          <Button variant="ghost" onClick={() => setOpen(false)}>Cerrar</Button>
        )}
      >
        {isAdmin && (
          <div className="mb-3">
            <Field label="Filtrar por usuario">
              <Select value={filtroUsuarioId} onChange={(e) => setFiltroUsuarioId(e.target.value)}>
                <option value="">Todos los usuarios</option>
                {(usuariosQ.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre} · {u.email}</option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        <div className="mb-3 flex h-8 items-center justify-end">
          <PeriodoVistaToggle vista={periodoVista} />
        </div>
        {(periodoVista.todo && (otrosPeriodo > 0 || otrasEmpresas > 0)) && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <strong>Advertencia:</strong>
            {otrosPeriodo > 0 && (
              <span> {otrosPeriodo} borrador(es) de un periodo distinto a <strong>{codigoPeriodo}</strong>.</span>
            )}
            {otrasEmpresas > 0 && (
              <span> {otrasEmpresas} borrador(es) de otra empresa (cambia el header para cargarlos/finalizarlos).</span>
            )}
          </div>
        )}
        {borradoresQ.isLoading ? (
          <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
        ) : borradores.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">No hay documentos en borrador.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {borradores.map((r) => {
              const otroPeriodo = !fechaEnPeriodo(r.fecha, codigoPeriodo);
              const otraEmpresa = Boolean(r.empresaId && r.empresaId !== empresaId);
              const emisionFallida = Boolean(
                r.billingStatus
                && /reject|fail|error|denied/i.test(String(r.billingStatus)),
              );
              return (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-[var(--color-accent-2)]">{r.folio}</span>
                      <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[var(--color-muted)]">
                        {etiquetaTipoDteBorrador(r)}
                      </span>
                      {emisionFallida && (
                        <span
                          className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800 dark:text-rose-200"
                          title={r.billingStatus ?? 'Partner rechazó el DTE'}
                        >
                          Emisión rechazada · reintentar
                        </span>
                      )}
                      {!emisionFallida && (
                        <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-muted)]">
                          Borrador
                        </span>
                      )}
                      {otroPeriodo && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                          Otro periodo
                        </span>
                      )}
                      {otraEmpresa && (
                        <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800 dark:text-rose-200">
                          Otra empresa
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-sm text-[var(--color-text)]">{r.cliente}</div>
                    <div className="text-xs text-[var(--color-muted)]">
                      {fmtDate(r.fecha)} · {fmtCLP(r.neto)}
                      {r.empresaNombre ? ` · ${r.empresaNombre}` : ''}
                      {isAdmin && r.creadoPorNombre ? ` · ${r.creadoPorNombre}` : ''}
                    </div>
                  </div>
                  <span className="inline-flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" leftIcon={<Eye size={14} />} onClick={() => ver(r)}>
                      Ver
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={<FolderOpen size={14} />}
                      disabled={otraEmpresa}
                      onClick={() => cargar(r)}
                    >
                      Cargar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={<Trash2 size={14} />}
                      disabled={busyId === r.id}
                      onClick={() => void borrar(r)}
                    >
                      {busyId === r.id ? '…' : 'Borrar'}
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </>
  );
}
