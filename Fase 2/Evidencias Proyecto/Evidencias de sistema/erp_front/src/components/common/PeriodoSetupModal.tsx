import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/input';
import { useAppSettings } from '@/app/app-settings-context';
import {
  codigoFromSettings,
  MESES_CONTABLES,
  settingsFromPeriodoCodigo,
} from '@/lib/appSettings';
import { periodoMenuEstadoLabel, syncPeriodoPreferido } from '@/lib/periodoTrabajo';
import { listQueryKey, useEmpresaScopeId, useQueryScope } from '@/hooks/useQueryScope';
import * as api from '@/services/api';
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';

function añosDisponibles(): string[] {
  const y = new Date().getFullYear();
  return [String(y - 2), String(y - 1), String(y), String(y + 1)];
}

/** Modal post-login / al cambiar empresa: año + mes contable. */
export function PeriodoSetupModal() {
  const {
    periodoContable,
    setPeriodoContable,
    periodoModalOpen,
    closePeriodoModal,
    selectedEmpresa,
  } = useAppSettings();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const [anio, setAnio] = useState(() => codigoFromSettings(periodoContable).slice(0, 4));
  const [mes, setMes] = useState(() => codigoFromSettings(periodoContable).slice(5, 7));

  const periodosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'periodos-contables'),
    queryFn: api.getPeriodosContables,
    enabled: periodoModalOpen,
    meta: { suppressErrorToastStatuses: [403] },
  });
  const periodos = useMemo(() => periodosQ.data ?? [], [periodosQ.data]);

  const draftCodigo = `${anio}-${mes}`;
  const match = useMemo(
    () => periodos.find((p) => p.codigo === draftCodigo),
    [periodos, draftCodigo],
  );

  useEffect(() => {
    if (!periodoModalOpen) return;
    const codigo = codigoFromSettings(periodoContable)
      || periodos.find((p) => p.activo)?.codigo
      || periodos.find((p) => p.estado === 'ABIERTO')?.codigo
      || '';
    setAnio(codigo.slice(0, 4));
    setMes(codigo.slice(5, 7) || '01');
  }, [periodoModalOpen, periodoContable, periodos]);

  const confirm = async () => {
    try {
      const changed = await syncPeriodoPreferido(match, api.updatePeriodoContable);
      if (changed) {
        void qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'periodos-contables') });
      }
    } catch (e) {
      toast.warning(e instanceof Error ? e.message : 'No se pudo marcar el periodo preferido');
    }
    setPeriodoContable(
      match
        ? settingsFromPeriodoCodigo(match.codigo, match.id, mes)
        : settingsFromPeriodoCodigo(draftCodigo, undefined, mes),
    );
    closePeriodoModal();
  };

  return (
    <Modal
      open={periodoModalOpen}
      onClose={closePeriodoModal}
      title="Seleccionar periodo contable"
      size="md"
      footer={(
        <>
          <Button variant="ghost" onClick={closePeriodoModal}>Más tarde</Button>
          <Button disabled={periodosQ.isError} onClick={() => void confirm()}>Confirmar {draftCodigo}</Button>
        </>
      )}
    >
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        Empresa activa: <strong className="text-[var(--color-text)]">{selectedEmpresa?.razonSocial ?? '—'}</strong>.
        Este periodo aplica a todo el sitio (libros, asientos, traspaso, etc.).
      </p>
      <QueryErrorAlert
        error={periodosQ.error}
        isLoading={periodosQ.isLoading}
        resource="los periodos contables"
        onRetry={() => void periodosQ.refetch()}
        className="mb-4"
      />

      <div className="grid grid-cols-2 gap-4">
        <Field label="Año">
          <Select value={anio} onChange={(e) => setAnio(e.target.value)}>
            {añosDisponibles().map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </Field>
        <Field label="Mes contable">
          <Select value={mes} onChange={(e) => setMes(e.target.value)}>
            {MESES_CONTABLES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
        <div className="font-medium text-[var(--color-text)]">{draftCodigo}</div>
        <div className="text-xs text-[var(--color-muted)]">
          {match
            ? periodoMenuEstadoLabel(match)
            : 'Aún no existe en Contabilidad → Periodos (puedes crearlo allá)'}
        </div>
      </div>
    </Modal>
  );
}
