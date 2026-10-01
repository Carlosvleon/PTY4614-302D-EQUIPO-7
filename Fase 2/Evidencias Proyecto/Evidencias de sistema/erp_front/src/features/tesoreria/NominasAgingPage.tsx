import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/modal';
import { fmtCLP } from '@/lib/utils';
import { exportRowsToCsv, exportRowsToExcel } from '@/lib/exportTable';
import { isDemoMode, labelMes } from '@/lib/appSettings';
import { useAuth } from '@/app/auth-context';
import { hasPermission } from '@/lib/permissions';
import { useQueryScope, useEmpresaScopeId, usePeriodoScopeCodigo, listQueryKey } from '@/hooks/useQueryScope';
import { toast } from 'sonner';
import type { DocumentoAging } from '@/types/domain';
import * as api from '@/services/api';
import {
  fmtYmd,
  nextPeriodWeek,
  parsePeriodWeek,
  resolvePeriodWeekParam,
  semanaDesdeBannerSiCorresponde,
  weeksOfPeriod,
  yearOptions,
} from './period-week';
import { NominaSemanaSelects } from './NominaSemanaSelects';
import {
  NOMINA_EXPORT_COLUMNS,
  hydrateDocumentoAging,
  kpisNomina,
  matchesNominaFiltro,
  nominaExportFilename,
  pickSemanaEnPeriodo,
  type NominaFiltro,
} from './nomina-semana';

function KpiCards({
  title,
  kpis,
  emphasize,
}: {
  title: string;
  kpis: ReturnType<typeof kpisNomina>;
  emphasize?: boolean;
}) {
  const items = [
    { label: 'A pagar', value: kpis.asignados },
    { label: 'Pagados', value: kpis.pagados },
    { label: 'Atrasados', value: kpis.atrasados, danger: true },
    { label: 'Adelantados', value: kpis.adelantados },
  ];
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{title}</div>
      <div className="grid gap-3 sm:grid-cols-4">
        {items.map((it) => (
          <div
            key={it.label}
            className={`rounded-lg border bg-[var(--color-surface)] px-3 py-2 ${
              emphasize ? 'border-[var(--color-accent)]/40' : 'border-[var(--color-border)]'
            }`}
          >
            <div className="text-[10px] uppercase text-[var(--color-muted)]">{it.label}</div>
            <div className={`text-lg font-semibold ${it.danger && it.value > 0 ? 'text-[var(--color-danger)]' : ''}`}>
              {fmtCLP(it.value)}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-[var(--color-muted)]">
        {kpis.docsPendientes} pendiente(s) · {kpis.docs} documento(s)
      </p>
    </div>
  );
}

export default function NominasAgingPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'tesoreria:write');
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const periodoHeader = usePeriodoScopeCodigo();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const semanaParam = params.get('semana');
  const semanaKey = resolvePeriodWeekParam(semanaParam, new Date(), periodoHeader);
  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'documentos-aging'),
    queryFn: api.getDocumentosAging,
  });
  const [syncTried, setSyncTried] = useState(false);
  const [estadoFiltro, setEstadoFiltro] = useState<NominaFiltro>('TODOS');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loteDestino, setLoteDestino] = useState(() => nextPeriodWeek(semanaKey) ?? semanaKey);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [ver, setVer] = useState<DocumentoAging | null>(null);
  const [mover, setMover] = useState<DocumentoAging | null>(null);
  const [moverDestino, setMoverDestino] = useState('');

  const parsed = parsePeriodWeek(semanaKey);
  const years = useMemo(() => {
    const yPeriodo = Number(periodoHeader.slice(0, 4));
    return yearOptions(new Date(), 1, 2, Number.isFinite(yPeriodo) ? yPeriodo : undefined);
  }, [periodoHeader]);
  const periodo = parsed ? `${parsed.year}-${String(parsed.month).padStart(2, '0')}` : '';
  const weeks = useMemo(() => (periodo ? weeksOfPeriod(periodo) : []), [periodo]);
  const selectedWeek = weeks.find((w) => w.key === semanaKey) ?? weeks[0] ?? null;
  const mesLabel = parsed ? `${labelMes(String(parsed.month).padStart(2, '0'))} ${parsed.year}` : '';

  const hydrated = useMemo(
    () => data.map(hydrateDocumentoAging).filter((r) => r.tipo === 'POR_PAGAR'),
    [data],
  );

  const delMes = useMemo(
    () => hydrated.filter((r) => weeks.some((w) => w.key === r.semanaCompromiso)),
    [hydrated, weeks],
  );

  const docsSemana = useMemo(
    () => (selectedWeek ? delMes.filter((r) => r.semanaCompromiso === selectedWeek.key) : []),
    [delMes, selectedWeek],
  );

  const filtrados = useMemo(
    () => docsSemana.filter((r) => matchesNominaFiltro(r, estadoFiltro)),
    [docsSemana, estadoFiltro],
  );

  const kpisMes = useMemo(() => kpisNomina(delMes), [delMes]);
  const kpisSemana = useMemo(() => kpisNomina(docsSemana), [docsSemana]);

  const otrasSemanas = useMemo(() => {
    const keys = [...new Set(
      hydrated.map((r) => r.semanaCompromiso).filter((k): k is string => Boolean(k)),
    )];
    return keys.filter((k) => k !== semanaKey).sort();
  }, [hydrated, semanaKey]);

  /** Primero semanas del mes del combo; si junio está vacío, las otras (ago, sep…) no quedan cortadas. */
  const otrasSemanasPrioridad = useMemo(() => {
    const delMesKeys = new Set(weeks.map((w) => w.key));
    const inMes = otrasSemanas.filter((k) => delMesKeys.has(k));
    const resto = otrasSemanas.filter((k) => !delMesKeys.has(k));
    return [...inMes, ...resto];
  }, [otrasSemanas, weeks]);

  const otrasSemanasVista = otrasSemanasPrioridad;

  const emptyNomina = hydrated.length === 0
    ? 'No hay documentos por pagar. Contabiliza facturas de compra y pulsa Sincronizar.'
    : docsSemana.length === 0
      ? `Sin documentos en ${semanaKey}. Cambia el mes o pulsa una semana con documentos.`
      : 'Sin pendientes en esta semana (cambia a Todos).';

  const prevHeaderRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevHeaderRef.current;
    const headerChanged = prev != null && prev !== periodoHeader;
    prevHeaderRef.current = periodoHeader;
    setParams((current) => {
      const next = semanaDesdeBannerSiCorresponde(current.get('semana'), periodoHeader, headerChanged);
      if (!next) return current;
      if (current.get('semana') === next) return current;
      const n = new URLSearchParams(current);
      n.set('semana', next);
      return n;
    }, { replace: true });
  }, [periodoHeader, setParams]);

  useEffect(() => {
    if (isDemoMode() || isLoading || isError || syncTried || !canWrite) return;
    if (data.length > 0) return;
    setSyncTried(true);
    void (async () => {
      try {
        await api.syncDocumentosAging();
        await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'documentos-aging') });
      } catch {
        /* el usuario puede pulsar Sincronizar */
      }
    })();
  }, [canWrite, data.length, empresaId, isError, isLoading, qc, scope, syncTried]);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'documentos-aging') });
  };

  const setSemana = (key: string) => {
    setSelected(new Set());
    const next = nextPeriodWeek(key);
    setLoteDestino(next && next !== key ? next : key);
    params.set('semana', key);
    setParams(params, { replace: true });
  };

  /** Al cambiar año/mes, no conservar S3 de septiembre si ese bloque del mes nuevo está vacío. */
  const setSemanaDesdeNav = (key: string) => {
    const next = parsePeriodWeek(key);
    const cur = parsePeriodWeek(semanaKey);
    const cambioMes = Boolean(next && cur && (next.year !== cur.year || next.month !== cur.month));
    if (!cambioMes || !next) {
      setSemana(key);
      return;
    }
    const periodoYm = `${next.year}-${String(next.month).padStart(2, '0')}`;
    setSemana(pickSemanaEnPeriodo(hydrated, periodoYm, key));
  };

  const snappedMesRef = useRef<string | null>(null);
  useEffect(() => {
    if (isLoading || !periodo) return;
    const next = pickSemanaEnPeriodo(hydrated, periodo, semanaKey);
    if (next === semanaKey) {
      snappedMesRef.current = periodo;
      return;
    }
    if (snappedMesRef.current === periodo) return;
    snappedMesRef.current = periodo;
    setSemana(next);
  }, [hydrated, isLoading, periodo, semanaKey]);

  const aplazarIds = async (ids: string[], destino?: string, revertir?: boolean) => {
    if (!ids.length) return;
    setSaving(true);
    try {
      await api.aplazarDocumentosAging({
        ids,
        semanaCompromiso: revertir ? undefined : destino,
        revertir,
      });
      await invalidate();
      setSelected(new Set());
      toast.success(revertir ? 'Compromiso vuelto al vencimiento' : `Compromiso → ${destino}`);
      setMover(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo aplazar');
    } finally {
      setSaving(false);
    }
  };

  const toggleSel = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const exportPeriodo = (kind: 'csv' | 'excel') => {
    const name = nominaExportFilename(semanaKey);
    if (kind === 'csv') exportRowsToCsv(name, NOMINA_EXPORT_COLUMNS, filtrados);
    else exportRowsToExcel(name, NOMINA_EXPORT_COLUMNS, filtrados, 'Nómina');
    toast.success(kind === 'csv' ? 'CSV generado' : 'Excel generado');
  };

  const pendientesSeleccionables = filtrados.filter((r) => r.nominaEstado === 'PENDIENTE');
  const allChecked = pendientesSeleccionables.length > 0
    && pendientesSeleccionables.every((r) => selected.has(r.id));

  const cols: Column<DocumentoAging>[] = [
    {
      key: '_sel',
      header: (
        <Checkbox
          checked={allChecked}
          disabled={!canWrite || pendientesSeleccionables.length === 0}
          onChange={(e) => {
            e.stopPropagation();
            if (e.target.checked) setSelected(new Set(pendientesSeleccionables.map((r) => r.id)));
            else setSelected(new Set());
          }}
          aria-label="Seleccionar pendientes"
        />
      ),
      sortable: false,
      filterable: false,
      hideable: false,
      cell: (r) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selected.has(r.id)}
            disabled={!canWrite || r.nominaEstado === 'PAGADA'}
            onChange={(e) => {
              toggleSel(r.id, e.target.checked);
            }}
            aria-label={`Seleccionar ${r.documento}`}
          />
        </span>
      ),
    },
    {
      key: 'doc',
      header: 'Documento',
      filterValue: (r) => r.documento,
      sortValue: (r) => r.documento,
      cell: (r) => <span className="font-mono text-xs">{r.documento}</span>,
    },
    {
      key: 'ctpte',
      header: 'Proveedor',
      filterValue: (r) => r.contraparte,
      sortValue: (r) => r.contraparte,
      cell: (r) => r.contraparte,
    },
    {
      key: 'rut',
      header: 'RUT',
      filterValue: (r) => r.rut ?? '',
      sortValue: (r) => r.rut ?? '',
      cell: (r) => r.rut ? <span className="font-mono text-xs">{r.rut}</span> : '—',
    },
    {
      key: 'venc',
      header: 'Vencimiento',
      filterType: 'date',
      filterValue: (r) => r.fechaVencimiento,
      sortValue: (r) => r.fechaVencimiento,
      cell: (r) => fmtYmd(r.fechaVencimiento),
    },
    {
      key: 'saldo',
      header: 'Saldo',
      filterType: 'number',
      filterValue: (r) => r.saldo,
      sortValue: (r) => r.saldo,
      align: 'right',
      cell: (r) => fmtCLP(r.saldo),
    },
    {
      key: 'dias',
      header: 'Días atraso',
      filterType: 'number',
      filterValue: (r) => r.diasAtraso,
      sortValue: (r) => r.diasAtraso,
      align: 'right',
      cell: (r) => (
        <span className={r.diasAtraso > 0 ? 'font-semibold text-[var(--color-danger)]' : undefined}>
          {r.diasAtraso}
        </span>
      ),
    },
    {
      key: 'est',
      header: 'Estado',
      filterType: 'select',
      filterValue: (r) => r.nominaEstado ?? 'PENDIENTE',
      sortValue: (r) => r.nominaEstado ?? '',
      filterOptions: [
        { value: 'PENDIENTE', label: 'Pendiente' },
        { value: 'PAGADA', label: 'Pagada' },
      ],
      cell: (r) => (
        <span className="inline-flex flex-wrap gap-1">
          <Badge tone={r.nominaEstado === 'PAGADA' ? 'success' : 'warning'}>
            {r.nominaEstado === 'PAGADA' ? 'Pagada' : 'Pendiente'}
          </Badge>
          {r.aplazada && <Badge tone="info">Aplazada</Badge>}
          {r.nominaEstado === 'PENDIENTE' && r.diasAtraso > 0 && r.estado !== 'CRITICO' && (
            <Badge tone="danger">Atrasada</Badge>
          )}
          {r.estado === 'CRITICO' && r.nominaEstado !== 'PAGADA' && (
            <Badge tone="danger">Crítico</Badge>
          )}
          {r.ocNoOperable && <Badge tone="warning">OC no operable</Badge>}
        </span>
      ),
    },
    {
      key: '_acc',
      header: '',
      cell: (r) => (
        <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => setVer(r)}>Ver</Button>
          {canWrite && r.nominaEstado === 'PENDIENTE' && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMover(r);
                  setMoverDestino(nextPeriodWeek(semanaKey) ?? semanaKey);
                }}
              >
                Mover
              </Button>
              {r.aplazada && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => void aplazarIds([r.id], undefined, true)}
                >
                  Volver a emisión
                </Button>
              )}
            </>
          )}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Nómina semanal de pagos"
        breadcrumbs={['Tesorería', mesLabel, selectedWeek ? `S${selectedWeek.semana}` : ''].filter(Boolean)}
        subtitle="Compromiso interno por semana. Aplazar no cambia el folio ni el vencimiento del DTE. El pago se registra en Tesorería › Pagos."
        action={(
          <>
            <Button
              variant="outline"
              disabled={saving || syncing}
              onClick={() => {
                setSyncing(true);
                void (async () => {
                  try {
                    await api.syncDocumentosAging();
                    await invalidate();
                    toast.success('Nómina sincronizada');
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'No se pudo sincronizar');
                  } finally {
                    setSyncing(false);
                  }
                })();
              }}
            >
              {syncing ? 'Sincronizando…' : 'Sincronizar'}
            </Button>
            <Button
              variant="outline"
              leftIcon={<Download size={14} />}
              disabled={filtrados.length === 0}
              onClick={() => exportPeriodo('csv')}
            >
              CSV
            </Button>
            <Button
              variant="outline"
              leftIcon={<Download size={14} />}
              disabled={filtrados.length === 0}
              onClick={() => exportPeriodo('excel')}
            >
              Excel
            </Button>
          </>
        )}
      />

      {isError && (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {error instanceof Error ? error.message : 'No se pudo cargar la nómina semanal.'}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <NominaSemanaSelects
                idPrefix="nomina"
                value={semanaKey}
                years={years}
                onChange={setSemanaDesdeNav}
              />
            </div>
            <p className="max-w-md text-xs text-[var(--color-muted)]">
              Al abrir se usa el mes del banner. Año y mes se pueden cambiar; el periodo contable no se modifica.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <KpiCards
              title={selectedWeek
                ? `Total semana S${selectedWeek.semana} · ${fmtYmd(selectedWeek.desde)} – ${fmtYmd(selectedWeek.hasta)}`
                : 'Total semana'}
              kpis={kpisSemana}
              emphasize
            />
            <KpiCards title={`Total mes ${mesLabel}`} kpis={kpisMes} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--color-muted)]">Ver:</span>
            {([
              ['PENDIENTES', 'Pendientes'],
              ['TODOS', 'Todos'],
            ] as const).map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={estadoFiltro === id ? 'primary' : 'outline'}
                onClick={() => setEstadoFiltro(id)}
              >
                {label}
              </Button>
            ))}
          </div>

          {!isLoading && docsSemana.length === 0 && otrasSemanasVista.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--color-muted)]">Semanas con documentos:</span>
              {otrasSemanasVista.map((k) => (
                <Button key={k} size="sm" variant="outline" onClick={() => setSemana(k)}>
                  {k}
                </Button>
              ))}
            </div>
          )}

          {canWrite && selected.size > 0 && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
              <span className="mb-2 text-sm">{selected.size} seleccionada(s) → aplazar a</span>
              <NominaSemanaSelects
                idPrefix="lote"
                value={loteDestino}
                years={years}
                onChange={setLoteDestino}
              />
              <Button
                size="sm"
                disabled={saving || !loteDestino || loteDestino === semanaKey}
                onClick={() => void aplazarIds([...selected], loteDestino)}
              >
                Aplazar seleccionadas
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={() => void aplazarIds([...selected], undefined, true)}
              >
                Volver a emisión
              </Button>
            </div>
          )}

          <DataTable
            columns={cols}
            rows={filtrados}
            empty={
              docsSemana.length === 0 && otrasSemanasVista.length > 0 ? (
                <div>
                  <p>{emptyNomina}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    {otrasSemanasVista.map((k) => (
                      <Button key={k} size="sm" variant="outline" onClick={() => setSemana(k)}>
                        {k}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : emptyNomina
            }
            tableKey="tesoreria.nomina-semana"
            pagination={{ storageKey: 'erp-nomina-semana' }}
            searchPlaceholder="Buscar folio, proveedor o RUT…"
            enableExport
            exportFilename={nominaExportFilename(semanaKey)}
            onRowClick={(r) => setVer(r)}
          />
        </div>
      )}

      <Modal
        open={ver != null}
        onClose={() => setVer(null)}
        title={ver ? `Documento ${ver.documento}` : 'Documento'}
        size="md"
        footer={<Button variant="ghost" onClick={() => setVer(null)}>Cerrar</Button>}
      >
        {ver && (
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-[var(--color-muted)]">Proveedor</dt>
            <dd>{ver.contraparte}</dd>
            <dt className="text-[var(--color-muted)]">RUT</dt>
            <dd className="font-mono text-xs">{ver.rut ?? '—'}</dd>
            <dt className="text-[var(--color-muted)]">Emisión</dt>
            <dd>{fmtYmd(ver.fechaEmision)}</dd>
            <dt className="text-[var(--color-muted)]">Vencimiento</dt>
            <dd>{fmtYmd(ver.fechaVencimiento)} <span className="text-xs text-[var(--color-muted)]">(DTE, no editable)</span></dd>
            <dt className="text-[var(--color-muted)]">Semana de emisión</dt>
            <dd>{ver.semanaNatural}</dd>
            <dt className="text-[var(--color-muted)]">Compromiso</dt>
            <dd>{ver.semanaCompromiso}{ver.aplazada ? ' · aplazada' : ''}</dd>
            <dt className="text-[var(--color-muted)]">Monto / saldo</dt>
            <dd>{fmtCLP(ver.monto)} / {fmtCLP(ver.saldo)}</dd>
            <dt className="text-[var(--color-muted)]">Días atraso</dt>
            <dd>{ver.diasAtraso}</dd>
            {ver.ocNumero && (
              <>
                <dt className="text-[var(--color-muted)]">OC</dt>
                <dd>
                  {ver.ocNumero}
                  {ver.ocNoOperable && <Badge className="ml-2" tone="warning">No operable · no se paga hasta aprobar</Badge>}
                </dd>
              </>
            )}
          </dl>
        )}
      </Modal>

      <Modal
        open={mover != null}
        onClose={() => setMover(null)}
        title={mover ? `Mover ${mover.documento}` : 'Mover'}
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setMover(null)}>Cancelar</Button>
            <Button
              disabled={saving || !moverDestino || moverDestino === semanaKey}
              onClick={() => mover && void aplazarIds([mover.id], moverDestino)}
            >
              Mover
            </Button>
          </>
        )}
      >
        <p className="mb-3 text-sm text-[var(--color-muted)]">
          Cambia solo la semana de compromiso. El vencimiento del documento no se modifica.
        </p>
        <NominaSemanaSelects
          idPrefix="mover"
          value={moverDestino || (nextPeriodWeek(semanaKey) ?? semanaKey)}
          years={years}
          onChange={setMoverDestino}
        />
      </Modal>
    </div>
  );
}
