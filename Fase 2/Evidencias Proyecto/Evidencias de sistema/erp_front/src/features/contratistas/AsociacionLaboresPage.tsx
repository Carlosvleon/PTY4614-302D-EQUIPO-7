import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueryScope, useEmpresaScopeId, listQueryKey } from '@/hooks/useQueryScope';
import { PageHeader } from '@/components/common/PageHeader';
import { PeriodoVistaToggle } from '@/components/common/PeriodoVistaToggle';
import { usePeriodoVista } from '@/hooks/usePeriodoVista';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { fmtCLP, fmtDate } from '@/lib/utils';
import { toast } from 'sonner';
import type { IngresoLaborDiario } from '@/types/domain';
import * as api from '@/services/api';

export default function AsociacionLaboresPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const periodoVista = usePeriodoVista();
  const qc = useQueryClient();
  const ingresos = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'ingresos-labor-diario'),
    queryFn: api.getIngresosLaborDiario,
  });
  const proformas = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'proformas-contratista'),
    queryFn: () => api.getProformasContratista(),
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [proformaId, setProformaId] = useState('');
  const [loading, setLoading] = useState(false);

  const pendientes = useMemo(
    () => periodoVista.filter(
      (ingresos.data ?? []).filter((r) => r.estado === 'PENDIENTE'),
      (r) => r.fecha,
    ),
    [ingresos.data, periodoVista],
  );
  const montoSel = useMemo(
    () => pendientes.filter((r) => selected.includes(r.id)).reduce((a, r) => a + r.monto, 0),
    [pendientes, selected],
  );
  const prf = (proformas.data ?? []).find((p) => p.id === proformaId);
  const calceOk = prf ? Math.abs(prf.monto - montoSel) < 1 : false;

  const toggle = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const asociar = async () => {
    if (!selected.length || !proformaId) {
      toast.error('Selecciona labores y una proforma');
      return;
    }
    if (!calceOk) {
      toast.error(`Calce de monto: labores ${fmtCLP(montoSel)} ≠ proforma ${fmtCLP(prf?.monto ?? 0)}`);
      return;
    }
    setLoading(true);
    try {
      await api.asociarIngresosAProforma(selected, proformaId);
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'ingresos-labor-diario') });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'proformas-contratista') });
      toast.success('Labores asociadas a proforma');
      setSelected([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al asociar');
    } finally {
      setLoading(false);
    }
  };

  const cols: Column<IngresoLaborDiario>[] = [
    {
      key: '_sel',
      header: '',
      sortable: false,
      filterable: false,
      hideable: false,
      cell: (r) => (
        <Checkbox
          checked={selected.includes(r.id)}
          onChange={() => toggle(r.id)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    {
      key: 'fecha',
      header: 'Fecha',
      filterType: 'date',
      filterValue: (r) => r.fecha,
      sortValue: (r) => r.fecha,
      cell: (r) => fmtDate(r.fecha),
    },
    {
      key: 'contratista',
      header: 'Contratista',
      filterType: 'select',
      filterValue: (r) => r.contratista,
      cell: (r) => r.contratista,
    },
    {
      key: 'labor',
      header: 'Labor',
      filterType: 'select',
      filterValue: (r) => r.labor,
      cell: (r) => r.labor,
    },
    {
      key: 'actividad',
      header: 'Actividad',
      filterType: 'select',
      filterValue: (r) => r.actividad,
      cell: (r) => r.actividad,
    },
    {
      key: 'monto',
      header: 'Monto',
      filterType: 'number',
      filterValue: (r) => r.monto,
      sortValue: (r) => r.monto,
      cell: (r) => fmtCLP(r.monto),
      align: 'right',
    },
    {
      key: 'estado',
      header: 'Estado',
      filterType: 'select',
      filterValue: (r) => r.estado,
      cell: (r) => <Badge tone="muted">{r.estado}</Badge>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Asociación labores → proforma / factura"
        breadcrumbs={['Contratistas']}
        action={(
          <Button onClick={asociar} disabled={loading || !selected.length || !proformaId}>
            {loading ? 'Asociando…' : 'Asociar selección'}
          </Button>
        )}
      />

      <div className="grid gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-3">
        <Field label="Proforma destino">
          <Select value={proformaId} onChange={(e) => setProformaId(e.target.value)}>
            <option value="">Seleccionar…</option>
            {(proformas.data ?? [])
              .filter((p) => p.estado === 'DEFINITIVA' || p.estado === 'BORRADOR')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.numero} · {p.contratista} · {fmtCLP(p.monto)}
                </option>
              ))}
          </Select>
        </Field>
        <div className="text-sm">
          <div className="text-[var(--color-muted)]">Monto labores seleccionadas</div>
          <div className="text-lg font-semibold">{fmtCLP(montoSel)}</div>
        </div>
        <div className="text-sm">
          <div className="text-[var(--color-muted)]">Calce vs proforma</div>
          <div className={`text-lg font-semibold ${calceOk ? 'text-emerald-700' : 'text-amber-700'}`}>
            {prf ? (calceOk ? 'OK' : `Dif. ${fmtCLP(Math.abs((prf.monto ?? 0) - montoSel))}`) : '—'}
          </div>
        </div>
      </div>

      {ingresos.isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
      ) : (
        <DataTable
          columns={cols}
          rows={pendientes}
          empty={periodoVista.empty('labores pendientes de asociar')}
          tableKey="contratistas.asociacion-labores"
          pagination={{ storageKey: 'erp-asoc-labores' }}
          toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
        />
      )}
    </div>
  );
}
