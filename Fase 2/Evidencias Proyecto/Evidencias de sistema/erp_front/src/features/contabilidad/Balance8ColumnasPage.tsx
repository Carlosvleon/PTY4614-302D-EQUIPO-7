import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/input';
import { fmtCLP } from '@/lib/utils';
import { exportRowsToExcel } from '@/lib/exportTable';
import { useQueryScope, useEmpresaScopeId, useSyncedPeriodoInput, listQueryKey } from '@/hooks/useQueryScope';
import { PeriodoVistaToggle } from '@/components/common/PeriodoVistaToggle';
import { usePeriodoVista } from '@/hooks/usePeriodoVista';
import { toast } from 'sonner';
import * as api from '@/services/api';

type FilaBalance = {
  id: string;
  codigo: string;
  nombre: string;
  sumasDebe: number;
  sumasHaber: number;
  saldoDeudor: number;
  saldoAcreedor: number;
  inventarioDeudor: number;
  inventarioAcreedor: number;
  resultadoDeudor: number;
  resultadoAcreedor: number;
};

export function Balance8ColumnasPage() {
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
    queryKey: listQueryKey(scope, empresaId, 'balance-8-columnas', periodoEfectivo),
    queryFn: () => api.getBalance8Columnas(periodoEfectivo),
    enabled: Boolean(periodoEfectivo),
  });

  const rows: FilaBalance[] = useMemo(
    () => (q.data?.filas ?? []).map((f, i) => ({
      id: f.cuentaId || `${f.codigo}-${i}`,
      codigo: f.codigo,
      nombre: f.nombre,
      sumasDebe: f.sumasDebe,
      sumasHaber: f.sumasHaber,
      saldoDeudor: f.saldoDeudor,
      saldoAcreedor: f.saldoAcreedor,
      inventarioDeudor: f.inventarioDeudor,
      inventarioAcreedor: f.inventarioAcreedor,
      resultadoDeudor: f.resultadoDeudor,
      resultadoAcreedor: f.resultadoAcreedor,
    })),
    [q.data],
  );

  const cols: Column<FilaBalance>[] = [
    { key: 'codigo', header: 'Código', cell: (r) => <span className="font-mono text-xs">{r.codigo}</span> },
    { key: 'nombre', header: 'Cuenta', cell: (r) => r.nombre },
    { key: 'sd', header: 'Sumas Debe', align: 'right', cell: (r) => fmtCLP(r.sumasDebe) },
    { key: 'sh', header: 'Sumas Haber', align: 'right', cell: (r) => fmtCLP(r.sumasHaber) },
    { key: 'deud', header: 'Saldo Deudor', align: 'right', cell: (r) => fmtCLP(r.saldoDeudor) },
    { key: 'acre', header: 'Saldo Acreedor', align: 'right', cell: (r) => fmtCLP(r.saldoAcreedor) },
    { key: 'invD', header: 'Inventario Activo', align: 'right', cell: (r) => fmtCLP(r.inventarioDeudor) },
    { key: 'invA', header: 'Inventario Pasivo', align: 'right', cell: (r) => fmtCLP(r.inventarioAcreedor) },
    { key: 'resD', header: 'Resultado Pérdida', align: 'right', cell: (r) => fmtCLP(r.resultadoDeudor) },
    { key: 'resA', header: 'Resultado Ganancia', align: 'right', cell: (r) => fmtCLP(r.resultadoAcreedor) },
  ];

  const t = q.data?.totales;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Balance de 8 columnas"
        breadcrumbs={['Contabilidad', 'Reportes']}
        subtitle="Sumas, saldos, inventario y resultados del periodo"
        action={(
          <Button
            leftIcon={<Download size={16} />}
            variant="secondary"
            disabled={!rows.length}
            onClick={() => {
              exportRowsToExcel(
                `balance-8-col-${periodoEfectivo}`,
                [
                  { key: 'codigo', header: 'Código', value: (r) => r.codigo },
                  { key: 'nombre', header: 'Cuenta', value: (r) => r.nombre },
                  { key: 'sumasDebe', header: 'Sumas Debe', value: (r) => r.sumasDebe },
                  { key: 'sumasHaber', header: 'Sumas Haber', value: (r) => r.sumasHaber },
                  { key: 'saldoDeudor', header: 'Saldo Deudor', value: (r) => r.saldoDeudor },
                  { key: 'saldoAcreedor', header: 'Saldo Acreedor', value: (r) => r.saldoAcreedor },
                  { key: 'invD', header: 'Inventario Activo', value: (r) => r.inventarioDeudor },
                  { key: 'invA', header: 'Inventario Pasivo', value: (r) => r.inventarioAcreedor },
                  { key: 'resD', header: 'Resultado Pérdida', value: (r) => r.resultadoDeudor },
                  { key: 'resA', header: 'Resultado Ganancia', value: (r) => r.resultadoAcreedor },
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
      </div>
      {t && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          {[
            ['Sumas D/H', `${fmtCLP(t.sumasDebe)} / ${fmtCLP(t.sumasHaber)}`],
            ['Saldos D/A', `${fmtCLP(t.saldoDeudor)} / ${fmtCLP(t.saldoAcreedor)}`],
            ['Inventario A/P', `${fmtCLP(t.inventarioDeudor)} / ${fmtCLP(t.inventarioAcreedor)}`],
            ['Resultado P/G', `${fmtCLP(t.resultadoDeudor)} / ${fmtCLP(t.resultadoAcreedor)}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-[var(--color-border)] px-3 py-2">
              <div className="text-[10px] uppercase text-[var(--color-muted)]">{label}</div>
              <div className="font-semibold tabular-nums">{value}</div>
            </div>
          ))}
        </div>
      )}
      {q.isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
      ) : (
        <DataTable
          columns={cols}
          rows={rows}
          empty="Sin movimientos en el periodo"
          tableKey="contabilidad.balance-8"
          pagination={{ storageKey: 'erp-balance-8' }}
          searchPlaceholder="Buscar cuenta…"
          toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
        />
      )}
    </div>
  );
}
