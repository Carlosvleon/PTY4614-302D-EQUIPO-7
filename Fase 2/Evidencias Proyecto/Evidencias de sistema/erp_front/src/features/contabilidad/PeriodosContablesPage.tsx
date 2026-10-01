import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listQueryKey, useEmpresaScopeId, useQueryScope } from '@/hooks/useQueryScope';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Field, Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { PeriodoContable } from '@/types/domain';
import { fmtDate } from '@/lib/utils';
import { labelMes, settingsFromPeriodoCodigo, codigoFromSettings } from '@/lib/appSettings';
import { syncPeriodoPreferido } from '@/lib/periodoTrabajo';
import { useAppSettings } from '@/app/app-settings-context';
import * as api from '@/services/api';

type PeriodoEvento = {
  id: string;
  periodoId: string;
  accion: string;
  estadoAntes?: string;
  estadoDespues: string;
  motivo?: string;
  usuarioId?: string;
  usuarioNombre?: string;
  createdAt: string;
};

export function PeriodosContablesPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const { setPeriodoContable, periodoContable } = useAppSettings();
  const [openCreate, setOpenCreate] = useState(false);
  const [confirmCerrar, setConfirmCerrar] = useState<PeriodoContable | null>(null);
  const [reabrirRow, setReabrirRow] = useState<PeriodoContable | null>(null);
  const [motivoReabrir, setMotivoReabrir] = useState('');
  const [historialRow, setHistorialRow] = useState<PeriodoContable | null>(null);
  const [busy, setBusy] = useState(false);
  const [codigo, setCodigo] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const { data = [], isLoading } = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'periodos-contables'),
    queryFn: api.getPeriodosContables,
  });

  const eventosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'periodo-eventos', historialRow?.id ?? ''),
    queryFn: () => api.getPeriodoContableEventos(historialRow!.id) as Promise<PeriodoEvento[]>,
    enabled: Boolean(historialRow?.id),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'periodos-contables') });

  const crear = async () => {
    const codigoNuevo = codigo.trim();
    const working = codigoFromSettings(periodoContable);
    try {
      await api.createPeriodoContable({
        codigo: codigoNuevo,
        activo: codigoNuevo === working,
      });
      toast.success(`Periodo ${codigoNuevo} creado`);
      setOpenCreate(false);
      if (codigoNuevo === working) {
        setPeriodoContable(settingsFromPeriodoCodigo(codigoNuevo));
      }
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear el periodo');
    }
  };

  const toggleEstado = async (row: PeriodoContable) => {
    if (row.estado === 'ABIERTO') {
      setConfirmCerrar(row);
      return;
    }
    setReabrirRow(row);
    setMotivoReabrir('');
  };

  const confirmarReabrir = async () => {
    if (!reabrirRow) return;
    if (!motivoReabrir.trim()) {
      toast.error('Indique el motivo de reapertura');
      return;
    }
    setBusy(true);
    try {
      await api.abrirPeriodoContable(reabrirRow.id, { motivo: motivoReabrir.trim() });
      toast.success(`Periodo ${reabrirRow.codigo} reabierto`);
      setReabrirRow(null);
      setMotivoReabrir('');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al reabrir periodo');
    } finally {
      setBusy(false);
    }
  };

  const confirmarCierre = async () => {
    if (!confirmCerrar) return;
    setBusy(true);
    try {
      await api.cerrarPeriodoContable(confirmCerrar.id);
      toast.success(`Periodo ${confirmCerrar.codigo} cerrado`);
      setConfirmCerrar(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cerrar periodo');
    } finally {
      setBusy(false);
    }
  };

  const usarPeriodo = async (row: PeriodoContable) => {
    try {
      await syncPeriodoPreferido(row, api.updatePeriodoContable);
    } catch (e) {
      toast.warning(e instanceof Error ? e.message : 'No se pudo marcar el periodo preferido');
    }
    setPeriodoContable(settingsFromPeriodoCodigo(row.codigo, row.id));
    refresh();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Períodos contables"
        breadcrumbs={['Contabilidad', 'Configuración']}
        action={<Button onClick={() => setOpenCreate(true)}>Nuevo periodo</Button>}
      />
      <DataTable
        tableKey="contabilidad.periodos"
        rows={isLoading ? [] : data}
        empty={isLoading ? 'Cargando…' : 'Sin periodos'}
        columns={[
          { key: 'codigo', header: 'Código', cell: (r) => r.codigo },
          {
            key: 'mes',
            header: 'Mes',
            cell: (r) => `${labelMes(String(r.mes).padStart(2, '0'))} ${r.anio}`,
          },
          {
            key: 'rango',
            header: 'Desde / Hasta',
            cell: (r) => `${fmtDate(r.fechaDesde)} — ${fmtDate(r.fechaHasta)}`,
          },
          {
            key: 'estado',
            header: 'Estado',
            cell: (r) => (
              <div className="flex flex-wrap gap-1">
                <Badge tone={r.estado === 'ABIERTO' ? 'success' : 'muted'}>{r.estado}</Badge>
                {r.activo ? <Badge tone="info">Preferido</Badge> : null}
              </div>
            ),
          },
          {
            key: 'acciones',
            header: '',
            cell: (r) => (
              <div className="flex flex-wrap gap-1 justify-end">
                <Button size="sm" variant="ghost" onClick={() => void usarPeriodo(r)}>
                  Usar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setHistorialRow(r)}>
                  Historial
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void toggleEstado(r)}>
                  {r.estado === 'ABIERTO' ? 'Cerrar' : 'Abrir'}
                </Button>
              </div>
            ),
          },
        ]}
      />

      <Modal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title="Nuevo periodo contable"
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setOpenCreate(false)}>Cancelar</Button>
            <Button onClick={() => void crear()}>Crear</Button>
          </>
        )}
      >
        <Field label="Código (aaaa-mm)">
          <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="2026-07" />
        </Field>
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Queda ABIERTO (se puede contabilizar). El mes del encabezado es el de trabajo; al Aplicarlo queda como preferido de la empresa.
        </p>
      </Modal>

      <Modal
        open={confirmCerrar != null}
        onClose={() => setConfirmCerrar(null)}
        title="Cerrar periodo contable"
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setConfirmCerrar(null)}>Cancelar</Button>
            <Button disabled={busy} onClick={() => void confirmarCierre()}>
              {busy ? 'Cerrando…' : 'Sí, cerrar periodo'}
            </Button>
          </>
        )}
      >
        <p className="text-sm">
          Vas a cerrar el periodo{' '}
          <strong className="font-mono">{confirmCerrar?.codigo}</strong>.
          No se podrán contabilizar asientos ni documentos en este periodo hasta reabrirlo.
        </p>
      </Modal>

      <Modal
        open={reabrirRow != null}
        onClose={() => { setReabrirRow(null); setMotivoReabrir(''); }}
        title="Reabrir periodo contable"
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => { setReabrirRow(null); setMotivoReabrir(''); }}>Cancelar</Button>
            <Button disabled={busy || !motivoReabrir.trim()} onClick={() => void confirmarReabrir()}>
              {busy ? 'Reabriendo…' : 'Reabrir periodo'}
            </Button>
          </>
        )}
      >
        <div className="space-y-3">
          <p className="text-sm">
            Vas a reabrir el periodo{' '}
            <strong className="font-mono">{reabrirRow?.codigo}</strong>.
            Debe indicar el motivo (queda en el historial).
          </p>
          <Field label="Motivo de reapertura">
            <Input
              value={motivoReabrir}
              onChange={(e) => setMotivoReabrir(e.target.value)}
              placeholder="Ej. Corrección de asiento post-cierre"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={historialRow != null}
        onClose={() => setHistorialRow(null)}
        title={historialRow ? `Historial · ${historialRow.codigo}` : 'Historial'}
        size="md"
        footer={<Button variant="ghost" onClick={() => setHistorialRow(null)}>Cerrar</Button>}
      >
        {eventosQ.isLoading ? (
          <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
        ) : (eventosQ.data ?? []).length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Sin eventos registrados para este periodo.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)] text-sm">
            {(eventosQ.data ?? []).map((ev) => (
              <li key={ev.id} className="py-2.5 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={ev.accion === 'CERRAR' ? 'muted' : 'info'}>{ev.accion}</Badge>
                  <span className="text-xs text-[var(--color-muted)]">
                    {new Date(ev.createdAt).toLocaleString('es-CL')}
                  </span>
                </div>
                <div className="mt-0.5 text-[var(--color-text)]">
                  {ev.usuarioNombre || 'Usuario'} · {ev.estadoAntes || '—'} → {ev.estadoDespues}
                </div>
                {ev.motivo ? (
                  <div className="mt-0.5 text-xs text-[var(--color-muted)]">Motivo: {ev.motivo}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
