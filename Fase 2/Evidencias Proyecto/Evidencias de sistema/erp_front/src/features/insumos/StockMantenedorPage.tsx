import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { listQueryKey, useEmpresaScopeId, useQueryScope } from '@/hooks/useQueryScope';
import * as api from '@/services/api';
import type { Bodega, Insumo } from '@/types/domain';
import { EMPTY_ARRAY } from '@/lib/empty';

type Vista = 'bodega' | 'producto';

type StockProductoRow = {
  id: string;
  insumoId: string;
  codigo: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  reservado: number;
  disponible: number;
};

type StockBodegaRow = {
  id: string;
  bodegaId: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  reservado: number;
  disponible: number;
};

export function StockMantenedorPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const [vista, setVista] = useState<Vista>('bodega');
  const [bodegaId, setBodegaId] = useState('');
  const [insumoId, setInsumoId] = useState('');

  const bodegasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'bodegas'),
    queryFn: () => api.getBodegas() as Promise<Bodega[]>,
  });
  const insumosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'insumos'),
    queryFn: () => api.getInsumos() as Promise<Insumo[]>,
  });

  const stockBodegaQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'stock-por-bodega', bodegaId),
    queryFn: () => api.getStockPorBodega(bodegaId),
    enabled: vista === 'bodega' && Boolean(bodegaId),
  });

  const stockProductoQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'stock-bodegas', insumoId),
    queryFn: () => api.getInsumoStockBodegas(insumoId),
    enabled: vista === 'producto' && Boolean(insumoId),
  });

  const bodegas = (bodegasQ.data ?? EMPTY_ARRAY) as Bodega[];
  const insumos = useMemo(
    () => ((insumosQ.data ?? EMPTY_ARRAY) as Insumo[]).filter((i) => i.inventariable !== false),
    [insumosQ.data],
  );

  const colsProducto: Column<StockProductoRow>[] = [
    { key: 'codigo', header: 'Código', cell: (r) => <span className="font-mono">{r.codigo}</span> },
    { key: 'nombre', header: 'Producto', cell: (r) => r.nombre },
    { key: 'um', header: 'UM', cell: (r) => r.unidad },
    { key: 'cant', header: 'Actual', align: 'right', cell: (r) => r.cantidad },
    { key: 'res', header: 'Reservado', align: 'right', cell: (r) => r.reservado },
    { key: 'disp', header: 'Disponible', align: 'right', cell: (r) => r.disponible },
  ];

  const colsBodega: Column<StockBodegaRow>[] = [
    { key: 'codigo', header: 'Código', cell: (r) => <span className="font-mono">{r.codigo}</span> },
    { key: 'nombre', header: 'Bodega', cell: (r) => r.nombre },
    { key: 'cant', header: 'Actual', align: 'right', cell: (r) => r.cantidad },
    { key: 'res', header: 'Reservado', align: 'right', cell: (r) => r.reservado },
    { key: 'disp', header: 'Disponible', align: 'right', cell: (r) => r.disponible },
  ];

  const productos = ((stockBodegaQ.data?.productos ?? []) as Omit<StockProductoRow, 'id'>[]).map(
    (p) => ({ ...p, id: p.insumoId }),
  );
  const bodegasProducto = ((stockProductoQ.data?.bodegas ?? []) as Array<{
    bodegaId: string;
    codigo: string;
    nombre: string;
    cantidad: number;
    reservado?: number;
    disponible?: number;
  }>).map((b) => ({
    id: b.bodegaId,
    bodegaId: b.bodegaId,
    codigo: b.codigo,
    nombre: b.nombre,
    cantidad: b.cantidad,
    reservado: b.reservado ?? 0,
    disponible: b.disponible ?? Math.max(0, Number(b.cantidad) - Number(b.reservado ?? 0)),
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock por bodega / producto"
        breadcrumbs={['Insumos / Bodega']}
        subtitle="Actual = físico en bodega. Reservado = OV autorizadas (ACTIVA, no vencidas). Disponible = actual − reservado."
      />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div className="flex gap-2">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${vista === 'bodega' ? 'bg-[var(--color-accent)] text-white' : 'border border-[var(--color-border)]'}`}
            onClick={() => setVista('bodega')}
          >
            Por bodega
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${vista === 'producto' ? 'bg-[var(--color-accent)] text-white' : 'border border-[var(--color-border)]'}`}
            onClick={() => setVista('producto')}
          >
            Por producto
          </button>
        </div>

        {vista === 'bodega' ? (
          <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
            Bodega
            <select
              className="min-w-[220px] rounded-md border border-[var(--color-border)] bg-transparent px-2 py-1.5 text-sm text-[var(--color-text)]"
              value={bodegaId}
              onChange={(e) => setBodegaId(e.target.value)}
            >
              <option value="">Seleccione…</option>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.codigo} · {b.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
            Producto
            <select
              className="min-w-[280px] rounded-md border border-[var(--color-border)] bg-transparent px-2 py-1.5 text-sm text-[var(--color-text)]"
              value={insumoId}
              onChange={(e) => setInsumoId(e.target.value)}
            >
              <option value="">Seleccione…</option>
              {insumos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.codigo} · {i.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {vista === 'bodega' ? (
        !bodegaId ? (
          <p className="text-sm text-[var(--color-muted)]">Elija una bodega para ver productos y saldos.</p>
        ) : stockBodegaQ.isLoading ? (
          <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
        ) : (
          <DataTable
            tableKey="insumos.stock-bodega"
            columns={colsProducto}
            rows={productos}
            empty="Sin saldos en esta bodega"
          />
        )
      ) : !insumoId ? (
        <p className="text-sm text-[var(--color-muted)]">Elija un producto para ver bodegas y saldos.</p>
      ) : stockProductoQ.isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
      ) : (
        <DataTable
          tableKey="insumos.stock-producto"
          columns={colsBodega}
          rows={bodegasProducto}
          empty="Sin bodegas activas"
        />
      )}
    </div>
  );
}
