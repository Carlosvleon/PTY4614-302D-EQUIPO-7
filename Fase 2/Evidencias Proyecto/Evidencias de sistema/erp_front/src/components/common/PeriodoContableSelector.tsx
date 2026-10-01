import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAppSettings } from '@/app/app-settings-context';
import {
  codigoFromSettings,
  labelMes,
  MESES_CONTABLES,
  settingsFromPeriodoCodigo,
} from '@/lib/appSettings';
import { periodoMenuEstadoLabel, syncPeriodoPreferido } from '@/lib/periodoTrabajo';
import { cn } from '@/lib/utils';
import { listQueryKey, useEmpresaScopeId, useQueryScope } from '@/hooks/useQueryScope';
import * as api from '@/services/api';
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';

/** Ventana amplia + años que ya existan en periodos o en la sesión. */
function añosDisponibles(extras: Iterable<string | number> = []): string[] {
  const y = new Date().getFullYear();
  const set = new Set<number>();
  for (let i = y - 15; i <= y + 10; i++) set.add(i);
  for (const extra of extras) {
    const n = Number(String(extra).slice(0, 4));
    if (Number.isInteger(n) && n >= 1990 && n <= 2100) set.add(n);
  }
  return [...set].sort((a, b) => a - b).map(String);
}

export function PeriodoContableSelector() {
  const { periodoContable, setPeriodoContable, openPeriodoModal } = useAppSettings();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [anio, setAnio] = useState(() => codigoFromSettings(periodoContable).slice(0, 4));
  const [mes, setMes] = useState(() => codigoFromSettings(periodoContable).slice(5, 7));
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const periodosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'periodos-contables'),
    queryFn: api.getPeriodosContables,
    staleTime: 30_000,
    meta: { suppressErrorToastStatuses: [403] },
  });
  const periodos = useMemo(() => periodosQ.data ?? [], [periodosQ.data]);

  const codigoActivo = codigoFromSettings(periodoContable);
  const draftCodigo = `${anio}-${mes}`;
  const anios = useMemo(
    () => añosDisponibles([
      anio,
      codigoActivo.slice(0, 4),
      ...periodos.map((p) => p.codigo.slice(0, 4)),
    ]),
    [anio, codigoActivo, periodos],
  );

  const matchDraft = useMemo(
    () => periodos.find((p) => p.codigo === draftCodigo),
    [periodos, draftCodigo],
  );
  const matchActivo = useMemo(
    () => periodos.find((p) => p.codigo === codigoActivo),
    [periodos, codigoActivo],
  );

  useEffect(() => {
    if (!open) return;
    const codigo = codigoFromSettings(periodoContable);
    setAnio(codigo.slice(0, 4));
    setMes(codigo.slice(5, 7) || '01');
  }, [open, periodoContable]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const apply = async () => {
    const codigo = draftCodigo;
    const match = periodos.find((p) => p.codigo === codigo);
    setBusy(true);
    try {
      const changed = await syncPeriodoPreferido(match, api.updatePeriodoContable);
      if (changed) {
        void qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'periodos-contables') });
      }
    } catch (e) {
      toast.warning(e instanceof Error ? e.message : 'No se pudo marcar el periodo preferido');
    } finally {
      setBusy(false);
    }
    setPeriodoContable(
      match
        ? settingsFromPeriodoCodigo(match.codigo, match.id, periodoContable.mesRemuneracion || mes)
        : settingsFromPeriodoCodigo(codigo, undefined, periodoContable.mesRemuneracion || mes),
    );
    setOpen(false);
  };

  const estadoLabel = periodoMenuEstadoLabel(matchDraft);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onDoubleClick={openPeriodoModal}
        title="Periodo contable de trabajo (doble clic: opciones avanzadas)"
        className="flex max-w-[240px] items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)]"
      >
        <CalendarRange size={16} className="shrink-0 text-[var(--color-accent)]" />
        <span className="truncate text-left">
          <span className="block font-medium text-[var(--color-text)]">
            {codigoActivo}
          </span>
          <span className="block text-[10px] text-[var(--color-muted)]">
            {labelMes(periodoContable.mesContable)}
            {matchActivo ? ` · ${matchActivo.estado}` : ''}
          </span>
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xl">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Periodo de trabajo
          </p>
          <QueryErrorAlert
            error={periodosQ.error}
            isLoading={periodosQ.isLoading}
            resource="los periodos contables"
            onRetry={() => void periodosQ.refetch()}
            className="mb-3"
          />
          <div className="mb-3 grid grid-cols-2 gap-2">
            <label className="block text-xs text-[var(--color-muted)]">
              Año
              <select
                className="mt-1 h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-sm text-[var(--color-text)]"
                value={anio}
                onChange={(e) => setAnio(e.target.value)}
              >
                {anios.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-[var(--color-muted)]">
              Mes
              <select
                className="mt-1 h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-sm text-[var(--color-text)]"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
              >
                {MESES_CONTABLES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-2 text-xs">
            <div className="font-medium text-[var(--color-text)]">{draftCodigo}</div>
            <div className="text-[var(--color-muted)]">{estadoLabel}</div>
          </div>

          <button
            type="button"
            onClick={() => void apply()}
            disabled={periodosQ.isError || busy}
            className={cn(
              'flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold',
              'bg-[var(--color-accent-soft)] text-[var(--color-accent-2)] hover:opacity-90',
            )}
          >
            <Check size={14} />
            {busy ? 'Aplicando…' : `Aplicar ${draftCodigo}`}
          </button>
          <p className="mt-2 text-center text-[10px] text-[var(--color-muted)]">
            Historial completo en Contabilidad → Periodos
          </p>
        </div>
      )}
    </div>
  );
}
