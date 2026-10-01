import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { fmtCLP, fmtDate } from '@/lib/utils';
import { listQueryKey, useEmpresaScopeId, useQueryScope } from '@/hooks/useQueryScope';
import * as api from '@/services/api';
import type { LibroComercialRow } from '@/types/domain';
import { pathEmitirTipoLibre } from '@/features/comercial/emitir-ov-helpers';
import { EMPTY_ARRAY } from '@/lib/empty';
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';
import { PeriodoVistaToggle } from '@/components/common/PeriodoVistaToggle';
import { usePeriodoVista } from '@/hooks/usePeriodoVista';

const EMPTY = EMPTY_ARRAY as LibroComercialRow[];

export function GuiasDespachoPage() {
  const navigate = useNavigate();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const query = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'guias-despacho'),
    queryFn: () => api.getGuiasDespacho() as Promise<LibroComercialRow[]>,
  });
  const data = query.data ?? EMPTY;
  const periodoVista = usePeriodoVista();
  const dataVista = periodoVista.filter(data, (r) => r.fecha);
  const { isLoading } = query;

  const columns: Column<LibroComercialRow>[] = [
    { key: 'folio', header: 'Folio', cell: (r) => r.folio },
    { key: 'cliente', header: 'Cliente', cell: (r) => r.contraparte },
    { key: 'fecha', header: 'Fecha', cell: (r) => fmtDate(r.fecha) },
    {
      key: 'neto',
      header: 'Monto',
      cell: (r) => fmtCLP(r.neto),
    },
    { key: 'estado', header: 'Estado', cell: (r) => r.estado },
  ];

  return (
    <div>
      <PageHeader
        title="Libro de guías"
        breadcrumbs={['Ventas']}
        subtitle="Consulta de guías emitidas (no contabiliza). El alta DTE de una guía nueva está en Ventas › Emitir DTE."
        action={(
          <Button type="button" onClick={() => navigate(pathEmitirTipoLibre('GUIA'))}>
            Emitir guía
          </Button>
        )}
      />
      <QueryErrorAlert
        error={query.error}
        isLoading={isLoading}
        resource="las guías de despacho"
        onRetry={() => void query.refetch()}
        className="mb-3"
      />
      {!query.error && (
        <DataTable
          columns={columns}
          rows={isLoading ? [] : dataVista}
          empty={isLoading ? 'Cargando…' : periodoVista.empty('guías de despacho')}
          tableKey="comercial.guias-despacho"
          toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
        />
      )}
    </div>
  );
}
