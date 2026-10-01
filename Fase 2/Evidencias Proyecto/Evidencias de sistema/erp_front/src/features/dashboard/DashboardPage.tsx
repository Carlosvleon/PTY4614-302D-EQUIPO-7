import { useQuery } from '@tanstack/react-query';
import { useQueryScope, useEmpresaScopeId, listQueryKey } from '@/hooks/useQueryScope';
import { Link } from 'react-router-dom';
import { ClipboardCheck, FileWarning, Receipt, DollarSign } from 'lucide-react';
import { KPI } from '@/components/common/KPI';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Badge } from '@/components/ui/badge';
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';
import { fmtCLP, fmtDate } from '@/lib/utils';
import { useAuth } from '@/app/auth-context';
import { hasAnyPermission, hasPermission } from '@/lib/permissions';
import * as api from '@/services/api';
import type { AprobacionOc, ProformaContratista } from '@/types/domain';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

export default function DashboardPage() {
  const { user } = useAuth();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const canCompras = hasPermission(user, 'compras:read');
  const canContratistas = hasPermission(user, 'contratistas:read');
  const canTendencia = hasAnyPermission(user, ['contabilidad:read', 'reportes:read']);
  const canTc = hasAnyPermission(user, ['contabilidad:read', 'tesoreria:read', 'catalogos:read']);

  const kpis = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'dashboard-kpis'),
    queryFn: api.getDashboardKPIs,
    meta: { suppressErrorToastStatuses: [403] },
  });
  const tendencia = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'tendencia'),
    queryFn: api.getTendenciaMensual,
    enabled: canTendencia,
    meta: { suppressErrorToastStatuses: [403] },
  });
  const aprob = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'aprobaciones-oc'),
    queryFn: api.getAprobacionesOc,
    enabled: canCompras,
    meta: { suppressErrorToastStatuses: [403] },
  });
  const proformas = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'proformas-contratista'),
    queryFn: () => api.getProformasContratista(),
    enabled: canContratistas,
    meta: { suppressErrorToastStatuses: [403] },
  });

  const pendientes = (aprob.data ?? []).filter((a) => a.estado === 'PENDIENTE').slice(0, 5);
  const sinFactura = (proformas.data ?? []).filter((p) => p.estado !== 'FACTURADA').slice(0, 5);

  const aprobCols: Column<AprobacionOc>[] = [
    { key: 'oc', header: 'OC', cell: (r) => <span className="font-mono text-xs">{r.ocNumero}</span> },
    { key: 'proveedor', header: 'Proveedor', cell: (r) => r.proveedor },
    { key: 'monto', header: 'Monto', cell: (r) => fmtCLP(r.monto), align: 'right' },
    { key: 'fecha', header: 'Fecha', cell: (r) => fmtDate(r.fecha) },
    { key: 'estado', header: 'Estado', cell: (r) => <Badge tone="warning">{r.estado}</Badge> },
  ];

  const prfCols: Column<ProformaContratista>[] = [
    { key: 'n', header: 'Proforma', cell: (r) => <span className="font-mono text-xs">{r.numero}</span> },
    { key: 'c', header: 'Contratista', cell: (r) => r.contratista },
    { key: 'm', header: 'Monto', cell: (r) => fmtCLP(r.monto), align: 'right' },
    {
      key: 'e',
      header: 'Estado',
      cell: (r) => <Badge tone={r.estado === 'DEFINITIVA' ? 'warning' : 'muted'}>{r.estado}</Badge>,
    },
  ];

  const firstName = user?.nombre?.split(' ')[0] ?? '';
  const dashboardError = kpis.error;
  const dashboardLoading = kpis.isLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hola, {firstName}</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Panel operativo · empresa activa: <strong className="text-[var(--color-text)]">{user?.empresa}</strong>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {canCompras && (
          <Link to="/compras/aprobaciones?estado=PENDIENTE">
            <KPI
              label="OC por aprobar"
              value={kpis.data?.ocPorAprobar ?? 0}
              icon={<ClipboardCheck size={22} />}
              iconBg="amber"
              hint="Mis pendientes en bandeja"
            />
          </Link>
        )}
        {canContratistas && (
          <Link to="/contratistas/proformas">
            <KPI
              label="Proformas sin factura"
              value={kpis.data?.proformasSinFactura ?? 0}
              icon={<FileWarning size={22} />}
              iconBg="red"
              hint="Sin factura asociada"
            />
          </Link>
        )}
        {canCompras && (
          <KPI
            label="Facturas por recibir"
            value={kpis.data?.facturasPorRecibir ?? 0}
            icon={<Receipt size={22} />}
            iconBg="blue"
            hint="Recepciones pendientes"
          />
        )}
        {canTc && (
          hasAnyPermission(user, ['contabilidad:read']) ? (
            <Link to="/contabilidad/indicadores-bc">
              <KPI
                label="TC USD hoy"
                value={kpis.data?.tcUsdHoy?.toFixed(1) ?? '—'}
                icon={<DollarSign size={22} />}
                iconBg="green"
                hint="Banco Central"
              />
            </Link>
          ) : (
            <KPI
              label="TC USD hoy"
              value={kpis.data?.tcUsdHoy?.toFixed(1) ?? '—'}
              icon={<DollarSign size={22} />}
              iconBg="green"
              hint="Banco Central"
            />
          )
        )}
      </div>

      {!canCompras && !canContratistas && !canTendencia && (
        <p className="text-sm text-[var(--color-muted)]">
          No hay bandejas ni gráficos para las pantallas de tu rol. Usa el menú para abrir lo que sí tienes habilitado.
        </p>
      )}

      {kpis.error && (
        <QueryErrorAlert
          error={dashboardError}
          isLoading={dashboardLoading}
          resource="el panel operativo"
          onRetry={() => {
            void kpis.refetch();
          }}
        />
      )}

      {canTendencia && (
        <Card>
          <CardHeader title="Gasto operativo (MM$)" subtitle="Últimos meses" />
          <CardBody>
            {tendencia.error ? (
              <QueryErrorAlert error={tendencia.error} resource="la tendencia mensual" onRetry={() => void tendencia.refetch()} />
            ) : (tendencia.data ?? []).length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={tendencia.data ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
                    <XAxis dataKey="mes" tick={{ fontSize: 12, fill: 'var(--color-muted)' }} stroke="var(--color-border)" />
                    <YAxis tick={{ fontSize: 12, fill: 'var(--color-muted)' }} stroke="var(--color-border)" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '0.75rem',
                        color: 'var(--color-text)',
                      }}
                    />
                    <Legend wrapperStyle={{ color: 'var(--color-muted)' }} />
                    <Line type="monotone" dataKey="gastos" name="Gastos" stroke="var(--color-chart-gastos)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-[var(--color-muted)]">Sin datos</div>
            )}
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {canCompras && (
          <Card>
            <CardHeader
              title="Aprobaciones OC pendientes"
              subtitle={<Link className="text-[var(--color-accent-2)] underline" to="/compras/aprobaciones?estado=PENDIENTE">Ver pendientes</Link>}
            />
            <CardBody className="p-0">
              {aprob.error
                ? <QueryErrorAlert error={aprob.error} resource="las aprobaciones pendientes" onRetry={() => void aprob.refetch()} className="m-3" />
                : <DataTable columns={aprobCols} rows={pendientes} empty="Sin datos" maxHeight="16rem" enableSearch={false} />}
            </CardBody>
          </Card>
        )}
        {canContratistas && (
          <Card>
            <CardHeader
              title="Proformas contratista abiertas"
              subtitle={<Link className="text-[var(--color-accent-2)] underline" to="/contratistas/proformas">Ver todas</Link>}
            />
            <CardBody className="p-0">
              {proformas.error
                ? <QueryErrorAlert error={proformas.error} resource="las proformas abiertas" onRetry={() => void proformas.refetch()} className="m-3" />
                : <DataTable columns={prfCols} rows={sinFactura} empty="Sin datos" maxHeight="16rem" enableSearch={false} />}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
