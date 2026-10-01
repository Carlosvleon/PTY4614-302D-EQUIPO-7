import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { MontoInput } from '@/components/ui/monto-input';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/app/auth-context';
import { hasPermission } from '@/lib/permissions';
import { labelMes } from '@/lib/appSettings';
import { useQueryScope, useEmpresaScopeId, usePeriodoScopeCodigo, listQueryKey } from '@/hooks/useQueryScope';
import { PeriodoVistaToggle } from '@/components/common/PeriodoVistaToggle';
import { usePeriodoVista } from '@/hooks/usePeriodoVista';
import { toast } from 'sonner';
import type { IndicadorBc } from '@/types/domain';
import * as api from '@/services/api';
import { BANCOS_CARTOLA } from './cartola-periodo';
import {
  agruparFlujoPorConcepto,
  fmtMonedaNativa,
  labelMonedaChip,
  matchesMonedaFiltro,
  parseMonedaFiltro,
  type FlujoMonedaFiltro,
  type FlujoVistaFila,
} from './flujo-caja';
import {
  fmtEquivalenteClp,
  tcAplicado,
  type MonedaTc,
} from './tipo-cambio';

const CHIPS: FlujoMonedaFiltro[] = ['TODAS', 'CLP', 'USD', 'CNY'];

function fmtTc(n: number): string {
  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

function fmtFechaTc(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

function MontoEquivalente({
  texto,
  negrita,
  moneda,
  montoOriginal,
  tc,
  fechaTc,
}: {
  texto: string;
  negrita: boolean;
  moneda: string;
  montoOriginal: string;
  tc: number;
  fechaTc: string;
}) {
  const [caja, setCaja] = useState<DOMRect | null>(null);
  const arriba = (caja?.top ?? 0) > 120;
  return (
    <>
      <span
        tabIndex={0}
        className={`inline-flex cursor-help items-baseline justify-end gap-1 rounded px-1.5 py-0.5 tabular-nums shadow-[inset_0_0_0_1px_rgba(161,98,7,0.45),0_1px_2px_rgba(120,80,10,0.18)] bg-amber-100/90 text-amber-950 dark:bg-amber-950/55 dark:text-amber-50 ${
          negrita ? 'font-bold' : 'font-medium'
        }`}
        onMouseEnter={(e) => setCaja(e.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => setCaja(null)}
        onFocus={(e) => setCaja(e.currentTarget.getBoundingClientRect())}
        onBlur={() => setCaja(null)}
      >
        <span aria-hidden className="text-[10px] font-semibold tracking-wide opacity-70">≈</span>
        {texto}
      </span>
      {caja && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[80] w-60 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-left text-xs leading-5 text-[var(--color-text)] shadow-md"
          style={{
            top: arriba ? caja.top - 8 : caja.bottom + 8,
            left: Math.max(8, caja.right),
            transform: arriba ? 'translate(-100%, -100%)' : 'translateX(-100%)',
          }}
        >
          <div>Moneda original: {moneda === 'CNY' ? 'Yuan (CNY)' : moneda}</div>
          <div>Monto original: {montoOriginal}</div>
          <div>TC {fmtTc(tc)} del {fmtFechaTc(fechaTc)}</div>
          <div className="mt-1 text-[10px] text-[var(--color-muted)]">Solo visual. No cambia el saldo guardado.</div>
        </div>,
        document.body,
      )}
    </>
  );
}

function KpiMoneda({
  moneda,
  ingreso,
  egreso,
  saldo,
  emphasize,
}: {
  moneda: string;
  ingreso: number;
  egreso: number;
  saldo: number;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-[var(--color-surface)] px-3 py-3 ${
        emphasize ? 'border-[var(--color-accent)]/40' : 'border-[var(--color-border)]'
      }`}
    >
      <div className="mb-2 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
        Saldo caja · {moneda === 'CNY' ? 'Yuan (CNY)' : moneda}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-[10px] uppercase text-[var(--color-muted)]">Ingreso</div>
          <div className="font-semibold tabular-nums">{fmtMonedaNativa(ingreso, moneda)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-[var(--color-muted)]">Egreso</div>
          <div className="font-semibold tabular-nums">{fmtMonedaNativa(egreso, moneda)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-[var(--color-muted)]">Saldo</div>
          <div className="font-semibold tabular-nums">{fmtMonedaNativa(saldo, moneda)}</div>
        </div>
      </div>
    </div>
  );
}

export function FlujoCajaPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'tesoreria:write');
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const filtro = parseMonedaFiltro(params.get('moneda'));
  const headerPeriodo = usePeriodoScopeCodigo();
  const periodoVista = usePeriodoVista();
  const periodo = periodoVista.todo ? '' : headerPeriodo;
  const { data, isLoading, isError, error } = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'flujo-caja', periodo || 'all'),
    queryFn: () => api.getFlujoCaja(periodo ? { periodo } : {}),
  });
  const filas = data?.filas ?? [];
  const indicadoresQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'indicadores-bc'),
    queryFn: () => api.getIndicadoresBc({
      desde: '2026-01-01',
      hasta: new Date().toISOString().slice(0, 10),
    }),
  });
  const indicadores = (indicadoresQ.data ?? []) as IndicadorBc[];
  const [eqFecha, setEqFecha] = useState(false);
  const [verTotales, setVerTotales] = useState(true);

  const [aperturaOpen, setAperturaOpen] = useState(false);
  const [apertura, setApertura] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    banco: BANCOS_CARTOLA[0],
    moneda: 'CLP',
    ingreso: '',
  });
  const [saving, setSaving] = useState(false);
  const [corregir, setCorregir] = useState<{
    id: string;
    fecha: string;
    banco: string;
    moneda: string;
    ingreso: string;
    motivo: string;
    bancoGuardado: string;
  } | null>(null);

  const visibles = useMemo(
    () => filas.filter((r) => matchesMonedaFiltro(r.moneda, filtro)),
    [filas, filtro],
  );
  const kpis = useMemo(() => {
    const tot = data?.totalesMoneda;
    if (tot?.length) {
      return tot.filter((t) => matchesMonedaFiltro(t.moneda, filtro));
    }
    const by = new Map<string, { ingreso: number; egreso: number }>();
    for (const r of visibles) {
      const cur = by.get(r.moneda) ?? { ingreso: 0, egreso: 0 };
      cur.ingreso += r.ingreso;
      cur.egreso += r.egreso;
      by.set(r.moneda, cur);
    }
    return [...by.entries()].map(([moneda, v]) => ({
      moneda,
      ingreso: v.ingreso,
      egreso: v.egreso,
      saldo: v.ingreso - v.egreso,
    }));
  }, [data?.totalesMoneda, visibles, filtro]);

  const setFiltro = (next: FlujoMonedaFiltro) => {
    if (next === 'TODAS') params.delete('moneda');
    else params.set('moneda', next);
    setParams(params, { replace: true });
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'flujo-caja') });

  const registrarApertura = async () => {
    const ingreso = Number(apertura.ingreso);
    if (!(ingreso > 0)) {
      toast.error('Indica un saldo de apertura mayor a cero');
      return;
    }
    if (!apertura.banco.trim()) {
      toast.error('Indica el banco');
      return;
    }
    setSaving(true);
    try {
      await api.createMovimientoCaja({
        fecha: apertura.fecha,
        concepto: `Saldo de apertura ${apertura.moneda}`,
        ingreso,
        egreso: 0,
        banco: apertura.banco.trim(),
        moneda: apertura.moneda,
        esApertura: true,
      });
      toast.success('Apertura registrada (inmutable)');
      setAperturaOpen(false);
      await invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo registrar la apertura');
    } finally {
      setSaving(false);
    }
  };

  const guardarCorreccion = async () => {
    if (!corregir) return;
    const ingreso = Number(corregir.ingreso);
    if (!(ingreso > 0)) {
      toast.error('Indica un saldo de apertura mayor a cero');
      return;
    }
    if (corregir.motivo.trim().length < 3) {
      toast.error('Indica el motivo de la corrección');
      return;
    }
    setSaving(true);
    try {
      await api.corregirApertura(corregir.id, {
        fecha: corregir.fecha,
        banco: corregir.banco,
        moneda: corregir.moneda,
        ingreso,
        motivo: corregir.motivo.trim(),
      });
      toast.success('Saldo de apertura corregido');
      setCorregir(null);
      await invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo corregir la apertura');
    } finally {
      setSaving(false);
    }
  };

  const vista = useMemo(() => agruparFlujoPorConcepto(visibles), [visibles]);
  const filasTabla = useMemo(
    () => (verTotales ? vista : vista.filter((r) => r.kind !== 'totales')),
    [vista, verTotales],
  );

  const montoCelda = (r: FlujoVistaFila, valor: number, siempre: boolean) => {
    if (r.kind === 'titulo') return '';
    if (!siempre && !valor) return '—';
    const moneda = r.moneda || 'CLP';
    const nativo = fmtMonedaNativa(valor, moneda);
    const negrita = r.kind === 'totales';
    const extranjero = moneda === 'USD' || moneda === 'CNY' || moneda === 'EUR';
    if (!eqFecha || !extranjero) {
      if (!negrita) return nativo;
      return <span className="block text-right font-bold tabular-nums">{nativo}</span>;
    }
    const det = tcAplicado(indicadores, `${r.periodo}-01`, moneda as MonedaTc);
    if (!det) {
      return (
        <span className="text-xs text-[var(--color-muted)]" title="Sin tipo de cambio del Banco Central para este periodo">
          Sin TC
        </span>
      );
    }
    return (
      <MontoEquivalente
        texto={fmtEquivalenteClp(valor * det.tc)}
        negrita={negrita}
        moneda={moneda}
        montoOriginal={nativo}
        tc={det.tc}
        fechaTc={det.fecha}
      />
    );
  };

  const cols: Column<FlujoVistaFila>[] = [
    {
      key: 'periodo',
      header: 'Periodo',
      sortable: false,
      cell: (r) => {
        if (r.kind !== 'titulo') return '';
        const m = /^(\d{4})-(\d{2})$/.exec(r.periodo);
        return m ? `${labelMes(m[2])} ${m[1]}` : r.periodo;
      },
      filterValue: (r) => r.busqueda,
    },
    {
      key: 'concepto',
      header: 'Concepto',
      sortable: false,
      cell: (r) => (r.kind === 'titulo'
        ? <span className="font-semibold">{r.conceptoNombre}</span>
        : ''),
      filterValue: (r) => r.busqueda,
    },
    {
      key: 'codigo',
      header: 'Código financiero',
      sortable: false,
      cell: (r) => {
        if (r.kind === 'totales') return <span className="block text-right font-bold">Totales</span>;
        if (r.kind === 'linea' && r.esApertura) {
          const moneda = r.moneda === 'CNY' ? 'Yuan (CNY)' : r.moneda;
          return (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>{r.codigo} · {moneda}</span>
              {canWrite && r.aperturaId && (
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--color-accent)] underline"
                  onClick={() => setCorregir({
                    id: r.aperturaId!,
                    fecha: (r.fecha || `${r.periodo}-01`).slice(0, 10),
                    banco: (BANCOS_CARTOLA as readonly string[]).includes(r.codigo) ? r.codigo : BANCOS_CARTOLA[0],
                    moneda: r.moneda || 'CLP',
                    ingreso: String(r.ingreso),
                    motivo: '',
                    bancoGuardado: r.codigo,
                  })}
                >
                  Corregir
                </button>
              )}
            </span>
          );
        }
        return r.codigo;
      },
      filterValue: (r) => r.busqueda,
    },
    {
      key: 'moneda',
      header: 'Moneda',
      sortable: false,
      cell: (r) => {
        if (r.kind === 'titulo' || !r.moneda) return '';
        return r.moneda === 'CNY' ? 'Yuan (CNY)' : r.moneda;
      },
      filterValue: (r) => r.busqueda,
    },
    {
      key: 'ingreso',
      header: 'Ingreso',
      align: 'right',
      sortable: false,
      cell: (r) => montoCelda(r, r.ingreso, false),
      filterValue: (r) => (r.kind === 'titulo' ? '' : r.ingreso),
    },
    {
      key: 'egreso',
      header: 'Egreso',
      align: 'right',
      sortable: false,
      cell: (r) => montoCelda(r, r.egreso, false),
      filterValue: (r) => (r.kind === 'titulo' ? '' : r.egreso),
    },
    {
      key: 'saldo',
      header: 'Saldo periodo',
      align: 'right',
      sortable: false,
      cell: (r) => montoCelda(r, r.saldo, r.kind === 'totales'),
      filterValue: (r) => (r.kind === 'titulo' ? '' : r.saldo),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Flujo de caja"
        breadcrumbs={['Tesorería']}
        subtitle="Cada concepto es el título del bloque. Los códigos quedan a la derecha y Totales cierra el bloque, por moneda. Los saldos por banco están en Cartola."
        action={canWrite ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setApertura({
                fecha: new Date().toISOString().slice(0, 10),
                banco: BANCOS_CARTOLA[0],
                moneda: 'CLP',
                ingreso: '',
              });
              setAperturaOpen(true);
            }}
          >
            Registrar apertura
          </Button>
        ) : undefined}
      />

      {isError && (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {error instanceof Error ? error.message : 'No se pudo cargar el flujo de caja.'}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {!periodoVista.todo ? (
              <span className="text-xs text-[var(--color-muted)]">Periodo {headerPeriodo}</span>
            ) : (
              <span className="text-xs text-[var(--color-muted)]">Todos los periodos</span>
            )}
            <span className="text-xs text-[var(--color-muted)]">Moneda:</span>
            {CHIPS.map((id) => (
              <Button
                key={id}
                size="sm"
                variant={filtro === id ? 'primary' : 'outline'}
                onClick={() => setFiltro(id)}
              >
                {labelMonedaChip(id)}
              </Button>
            ))}
          </div>

          <div className="space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
            <Checkbox
              label="Ver la tabla en pesos (tipo de cambio del Banco Central del periodo). Solo visual."
              checked={eqFecha}
              onChange={(e) => setEqFecha(e.target.checked)}
            />
            <Checkbox
              label="Ver totales por concepto"
              checked={verTotales}
              onChange={(e) => setVerTotales(e.target.checked)}
            />
            {eqFecha && (
              <p className="text-xs text-[var(--color-muted)]">
                Los montos marcados con ≈ están en pesos. Pasa el mouse para ver la moneda original, el monto y el tipo de cambio. Los recuadros de arriba siguen en su moneda.
              </p>
            )}
            {indicadoresQ.isError && (
              <p role="alert" className="text-xs text-red-700">
                {indicadoresQ.error instanceof Error
                  ? indicadoresQ.error.message
                  : 'No se pudieron cargar los indicadores BC para el equivalente.'}
              </p>
            )}
          </div>

          <div className={`grid gap-3 ${kpis.length > 1 ? 'lg:grid-cols-3 sm:grid-cols-2' : ''}`}>
            {kpis.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">
                {periodoVista.todo
                  ? 'Sin movimientos contabilizados ni aperturas en esta moneda.'
                  : `Sin movimientos en ${headerPeriodo}. Marca Todos para ver otros meses.`}
              </p>
            ) : (
              kpis.map((k) => (
                <KpiMoneda
                  key={k.moneda}
                  moneda={k.moneda}
                  ingreso={k.ingreso}
                  egreso={k.egreso}
                  saldo={k.saldo}
                  emphasize={filtro !== 'TODAS'}
                />
              ))
            )}
          </div>

          <DataTable
            tableKey="tesoreria.flujo-caja"
            columns={cols}
            rows={filasTabla}
            empty="No hay movimientos de flujo para el filtro."
            toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
          />
        </div>
      )}

      <Modal
        open={aperturaOpen}
        onClose={() => setAperturaOpen(false)}
        title="Registrar saldo de apertura"
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => setAperturaOpen(false)}>Cancelar</Button>
            <Button disabled={saving} onClick={() => void registrarApertura()}>
              {saving ? 'Guardando…' : 'Registrar'}
            </Button>
          </>
        )}
      >
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          Un saldo por banco y moneda, con el mismo banco de la cartola. Después no se edita ni se borra. No uses esto para movimientos de cartola.
        </p>
        <div className="space-y-3">
          <Field label="Fecha" required>
            <Input
              type="date"
              value={apertura.fecha}
              onChange={(e) => setApertura((s) => ({ ...s, fecha: e.target.value }))}
            />
          </Field>
          <Field label="Banco" required>
            <Select
              value={apertura.banco}
              onChange={(e) => setApertura((s) => ({ ...s, banco: e.target.value }))}
            >
              {BANCOS_CARTOLA.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </Select>
          </Field>
          <Field label="Moneda" required>
            <Select
              value={apertura.moneda}
              onChange={(e) => setApertura((s) => ({ ...s, moneda: e.target.value }))}
            >
              <option value="CLP">CLP</option>
              <option value="USD">USD</option>
              <option value="CNY">Yuan (CNY)</option>
            </Select>
          </Field>
          <Field label="Saldo" required>
            <MontoInput
              kind={apertura.moneda === 'CLP' ? 'monto' : 'precio'}
              value={apertura.ingreso === '' ? null : Number(apertura.ingreso)}
              onChange={(v) => setApertura((s) => ({ ...s, ingreso: v == null ? '' : String(v) }))}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={corregir != null}
        onClose={() => setCorregir(null)}
        title="Corregir saldo de apertura"
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => setCorregir(null)}>Cancelar</Button>
            <Button disabled={saving || !corregir} onClick={() => void guardarCorreccion()}>
              {saving ? 'Guardando…' : 'Corregir'}
            </Button>
          </>
        )}
      >
        {corregir && (
          <>
            <p className="mb-3 text-xs text-[var(--color-muted)]">
              Quedó guardado como {corregir.bancoGuardado}. El monto anterior queda registrado con el motivo. No se borra la apertura.
            </p>
            <div className="space-y-3">
              <Field label="Fecha" required>
                <Input
                  type="date"
                  value={corregir.fecha}
                  onChange={(e) => setCorregir((s) => (s ? { ...s, fecha: e.target.value } : s))}
                />
              </Field>
              <Field label="Banco" required>
                <Select
                  value={corregir.banco}
                  onChange={(e) => setCorregir((s) => (s ? { ...s, banco: e.target.value } : s))}
                >
                  {BANCOS_CARTOLA.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Moneda" required>
                <Select
                  value={corregir.moneda}
                  onChange={(e) => setCorregir((s) => (s ? { ...s, moneda: e.target.value } : s))}
                >
                  <option value="CLP">CLP</option>
                  <option value="USD">USD</option>
                  <option value="CNY">Yuan (CNY)</option>
                </Select>
              </Field>
              <Field label="Saldo" required>
                <MontoInput
                  kind={corregir.moneda === 'CLP' ? 'monto' : 'precio'}
                  value={corregir.ingreso === '' ? null : Number(corregir.ingreso)}
                  onChange={(v) => setCorregir((s) => (s ? { ...s, ingreso: v == null ? '' : String(v) } : s))}
                />
              </Field>
              <Field label="Motivo" required>
                <Input
                  value={corregir.motivo}
                  onChange={(e) => setCorregir((s) => (s ? { ...s, motivo: e.target.value } : s))}
                  placeholder="Monto mal digitado"
                />
              </Field>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

export default FlujoCajaPage;
