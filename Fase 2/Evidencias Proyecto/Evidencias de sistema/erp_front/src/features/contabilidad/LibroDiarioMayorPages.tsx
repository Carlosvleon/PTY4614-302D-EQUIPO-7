import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { KPI } from '@/components/common/KPI';
import { fmtCLP, fmtDate } from '@/lib/utils';
import { exportRowsToExcel } from '@/lib/exportTable';
import { useQueryScope, useEmpresaScopeId, useSyncedPeriodoInput, listQueryKey } from '@/hooks/useQueryScope';
import { PeriodoVistaToggle } from '@/components/common/PeriodoVistaToggle';
import { usePeriodoVista } from '@/hooks/usePeriodoVista';
import type { CuentaContable, LibroDiarioLinea, MayorCuenta } from '@/types/domain';
import { toast } from 'sonner';
import * as api from '@/services/api';
import { flattenCuentasTree, labelCuentaImputacion } from '@/lib/cuentasImputacion';

export function LibroDiarioPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const periodoVista = usePeriodoVista();
  const [periodo, setPeriodo, globalCodigo] = useSyncedPeriodoInput();
  const periodoEfectivo = periodoVista.todo ? periodo : globalCodigo;
  const periodosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'periodos-contables'),
    queryFn: api.getPeriodosContables,
  });
  const q = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'libro-diario', periodoVista.todo ? 'all' : periodoEfectivo),
    queryFn: async () => {
      if (!periodoVista.todo) return api.getLibroDiario(periodoEfectivo);
      const codigos = [...new Set((periodosQ.data ?? []).map((p) => p.codigo))];
      if (!codigos.length) return api.getLibroDiario(periodoEfectivo);
      const parts = await Promise.all(codigos.map((c) => api.getLibroDiario(c)));
      const lineas = parts.flatMap((p) => p.lineas ?? []);
      const debe = parts.reduce((s, p) => s + (p.totales?.debe ?? 0), 0);
      const haber = parts.reduce((s, p) => s + (p.totales?.haber ?? 0), 0);
      const asientos = parts.reduce((s, p) => s + (p.totales?.asientos ?? 0), 0);
      return {
        lineas,
        totales: { asientos, debe, haber, cuadrado: Math.abs(debe - haber) < 0.5 },
      };
    },
    enabled: periodoVista.todo ? !periodosQ.isLoading : Boolean(periodoEfectivo),
  });
  const lineas = q.data?.lineas ?? [];
  const cols: Column<LibroDiarioLinea & { id: string }>[] = [
    { key: 'fecha', header: 'Fecha', cell: (r) => fmtDate(r.fecha) },
    { key: 'asi', header: 'Asiento', cell: (r) => <span className="font-mono text-xs">{r.asientoNumero}</span> },
    { key: 'cta', header: 'Cuenta', cell: (r) => r.cuentaCodigo ? `${r.cuentaCodigo}` : '—' },
    { key: 'nombre', header: 'Nombre', cell: (r) => r.cuentaNombre ?? '—' },
    { key: 'glosa', header: 'Glosa', cell: (r) => r.lineaGlosa || r.glosa },
    { key: 'debe', header: 'Debe', align: 'right', cell: (r) => fmtCLP(r.debe) },
    { key: 'haber', header: 'Haber', align: 'right', cell: (r) => fmtCLP(r.haber) },
  ];
  const rows = lineas.map((l, i) => ({ ...l, id: `${l.asientoNumero}-${i}` }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Libro diario"
        breadcrumbs={['Contabilidad', 'Reportes']}
        action={(
          <Button
            leftIcon={<Download size={16} />}
            variant="secondary"
            disabled={!rows.length}
            onClick={() => {
              exportRowsToExcel(
                `libro-diario-${periodoVista.todo ? 'todos' : periodo}`,
                [
                  { key: 'fecha', header: 'Fecha', value: (r) => r.fecha },
                  { key: 'asiento', header: 'Asiento', value: (r) => r.asientoNumero },
                  { key: 'cuenta', header: 'Cuenta', value: (r) => r.cuentaCodigo ?? '' },
                  { key: 'nombre', header: 'Nombre', value: (r) => r.cuentaNombre ?? '' },
                  { key: 'glosa', header: 'Glosa', value: (r) => r.lineaGlosa || r.glosa },
                  { key: 'debe', header: 'Debe', value: (r) => r.debe },
                  { key: 'haber', header: 'Haber', value: (r) => r.haber },
                ],
                rows,
              );
              toast.success('Excel generado');
            }}
          >
            Exportar Excel/CSV
          </Button>
        )}
      />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Periodo">
          <Select value={periodoEfectivo} disabled={!periodoVista.todo} onChange={(e) => setPeriodo(e.target.value)}>
            {(periodosQ.data ?? []).map((p) => (
              <option key={p.id} value={p.codigo}>{p.codigo} · {p.estado}</option>
            ))}
            {!(periodosQ.data ?? []).some((p) => p.codigo === periodoEfectivo) && (
              <option value={periodoEfectivo}>{periodoEfectivo}</option>
            )}
          </Select>
        </Field>
        <Field label="o aaaa-mm">
          <Input value={periodoEfectivo} disabled={!periodoVista.todo} onChange={(e) => setPeriodo(e.target.value)} placeholder="2026-07" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <KPI label="Asientos" value={String(q.data?.totales.asientos ?? 0)} />
        <KPI label="Debe" value={fmtCLP(q.data?.totales.debe ?? 0)} />
        <KPI label="Haber" value={fmtCLP(q.data?.totales.haber ?? 0)} />
        <KPI label="Cuadrado" value={q.data?.totales.cuadrado ? 'Sí' : 'No'} />
      </div>
      {q.isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
      ) : (
        <DataTable
          tableKey="contabilidad.libro-diario"
          columns={cols}
          rows={rows}
          empty={periodoVista.todo ? 'Sin líneas' : `Sin líneas en ${periodoEfectivo}`}
          searchPlaceholder="Buscar glosa, cuenta…"
          toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
        />
      )}
    </div>
  );
}

export function MayorPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const periodoVista = usePeriodoVista();
  const [periodo, setPeriodo, globalCodigo] = useSyncedPeriodoInput();
  const periodoEfectivo = periodoVista.todo ? periodo : globalCodigo;
  const [cuentaId, setCuentaId] = useState('');
  const periodosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'periodos-contables'),
    queryFn: api.getPeriodosContables,
  });
  const cuentasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'cuentas'),
    queryFn: api.getCuentas,
  });
  const q = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'mayor', periodoEfectivo, cuentaId),
    queryFn: () => api.getMayor(periodoEfectivo, cuentaId || undefined),
    enabled: Boolean(periodoEfectivo),
  });
  const tipoById = useMemo(() => {
    const map = new Map<string, CuentaContable['tipo']>();
    for (const c of flattenCuentasTree(cuentasQ.data ?? [])) map.set(c.id, c.tipo);
    return map;
  }, [cuentasQ.data]);

  type MayorRow = {
    id: string;
    cuentaId?: string;
    cuentaCodigo: string;
    cuentaNombre: string;
    debe: number;
    haber: number;
    saldo: number;
    movimientos: MayorCuenta['movimientos'];
    deudor: number;
    acreedor: number;
    activo: number;
    pasivo: number;
  };

  const rows = useMemo<MayorRow[]>(() => {
    const cuentas = q.data?.cuentas ?? [];
    return cuentas.map((c, i) => {
      const deudor = c.saldo > 0 ? c.saldo : 0;
      const acreedor = c.saldo < 0 ? Math.abs(c.saldo) : 0;
      const tipo = (c.cuentaId && tipoById.get(c.cuentaId)) || undefined;
      const esActivo = tipo === 'ACTIVO' || tipo === 'GASTO';
      const esPasivo = tipo === 'PASIVO' || tipo === 'PATRIMONIO' || tipo === 'INGRESO';
      return {
        ...c,
        id: c.cuentaId || `${c.cuentaCodigo}-${i}`,
        deudor,
        acreedor,
        activo: esActivo ? Math.abs(c.saldo) : 0,
        pasivo: esPasivo ? Math.abs(c.saldo) : 0,
      };
    });
  }, [q.data?.cuentas, tipoById]);

  const cols: Column<MayorRow>[] = [
    { key: 'codigo', header: 'Cuenta', cell: (r) => <span className="font-mono text-xs">{r.cuentaCodigo}</span> },
    { key: 'nombre', header: 'Nombre', cell: (r) => r.cuentaNombre },
    { key: 'debe', header: 'Debe', align: 'right', cell: (r) => fmtCLP(r.debe) },
    { key: 'haber', header: 'Haber', align: 'right', cell: (r) => fmtCLP(r.haber) },
    { key: 'deudor', header: 'Deudor', align: 'right', cell: (r) => (r.deudor ? fmtCLP(r.deudor) : '—') },
    { key: 'acreedor', header: 'Acreedor', align: 'right', cell: (r) => (r.acreedor ? fmtCLP(r.acreedor) : '—') },
    { key: 'activo', header: 'Activo', align: 'right', cell: (r) => (r.activo ? fmtCLP(r.activo) : '—') },
    { key: 'pasivo', header: 'Pasivo', align: 'right', cell: (r) => (r.pasivo ? fmtCLP(r.pasivo) : '—') },
  ];

  const totDeudor = rows.reduce((s, r) => s + r.deudor, 0);
  const totAcreedor = rows.reduce((s, r) => s + r.acreedor, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Libro mayor"
        breadcrumbs={['Contabilidad', 'Reportes']}
        action={(
          <Button
            leftIcon={<Download size={16} />}
            variant="secondary"
            disabled={!rows.length}
            onClick={() => {
              exportRowsToExcel(
                `mayor-${periodoEfectivo}`,
                [
                  { key: 'codigo', header: 'Cuenta', value: (r) => r.cuentaCodigo },
                  { key: 'nombre', header: 'Nombre', value: (r) => r.cuentaNombre },
                  { key: 'debe', header: 'Debe', value: (r) => r.debe },
                  { key: 'haber', header: 'Haber', value: (r) => r.haber },
                  { key: 'deudor', header: 'Deudor', value: (r) => r.deudor },
                  { key: 'acreedor', header: 'Acreedor', value: (r) => r.acreedor },
                  { key: 'activo', header: 'Activo', value: (r) => r.activo },
                  { key: 'pasivo', header: 'Pasivo', value: (r) => r.pasivo },
                ],
                rows,
              );
              toast.success('Excel generado');
            }}
          >
            Exportar Excel/CSV
          </Button>
        )}
      />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Periodo">
          <Select value={periodoEfectivo} disabled={!periodoVista.todo} onChange={(e) => setPeriodo(e.target.value)}>
            {(periodosQ.data ?? []).map((p) => (
              <option key={p.id} value={p.codigo}>{p.codigo} · {p.estado}</option>
            ))}
            {!(periodosQ.data ?? []).some((p) => p.codigo === periodoEfectivo) && (
              <option value={periodoEfectivo}>{periodoEfectivo}</option>
            )}
          </Select>
        </Field>
        <Field label="Cuenta (opc.)">
          <Select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
            <option value="">Todas</option>
            {(flattenCuentasTree(cuentasQ.data ?? []))
              .filter((c) => !c.noImputable)
              .map((c) => (
                <option key={c.id} value={c.id}>{labelCuentaImputacion(c)}</option>
              ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <KPI label="Debe" value={fmtCLP(q.data?.totales.debe ?? 0)} />
        <KPI label="Haber" value={fmtCLP(q.data?.totales.haber ?? 0)} />
        <KPI label="Deudor" value={fmtCLP(totDeudor)} />
        <KPI label="Acreedor" value={fmtCLP(totAcreedor)} />
      </div>
      {q.isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
      ) : (
        <DataTable
          tableKey="contabilidad.mayor"
          pagination={{ storageKey: 'erp-mayor', defaultSize: 15 }}
          columns={cols}
          rows={rows}
          empty="Sin movimientos en el periodo"
          toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
        />
      )}
    </div>
  );
}
