import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MockListPage, type MockFormField, mockEntityId } from '@/components/common/MockListPage';
import { EstadoGenericoBadge } from '@/components/common/Badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { fmtCLP, fmtDate } from '@/lib/utils';
import { useQueryScope, useEmpresaScopeId, listQueryKey } from '@/hooks/useQueryScope';
import { useAppSettings } from '@/app/app-settings-context';
import type { Insumo, Bodega, MovimientoBodega } from '@/types/domain';
import * as api from '@/services/api';
import { cn } from '@/lib/utils';
import { cuentasParaImputar, labelCuentaImputacion } from '@/lib/cuentasImputacion';

export function CatalogoInsumosPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const unidadesQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'unidades'),
    queryFn: api.getUnidades,
  });
  const cuentasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'cuentas'),
    queryFn: api.getCuentas,
  });
  const unidadOptions = (unidadesQ.data ?? [])
    .filter((u) => u.activa)
    .map((u) => ({ value: u.codigo, label: `${u.codigo} · ${u.nombre}` }));
  const cuentaOptions = useMemo(
    () =>
      cuentasParaImputar(cuentasQ.data).map((c) => ({
        value: c.id,
        label: labelCuentaImputacion(c),
      })),
    [cuentasQ.data],
  );

  const formFields: MockFormField[] = [
    { name: 'codigo', label: 'Código', required: true },
    { name: 'familia', label: 'Familia', required: true },
    { name: 'subfamilia', label: 'Subfamilia', required: true },
    { name: 'nombre', label: 'Nombre', required: true, hint: 'Sale en el DTE como nombre del ítem (NmbItem).' },
    {
      name: 'detalle',
      label: 'Detalle',
      type: 'textarea',
      maxLength: 1000,
      hint: 'Opcional. Si está vacío no se envía en el DTE (DscItem).',
    },
    {
      name: 'unidad', label: 'Unidad', type: 'select', required: true,
      options: unidadOptions.length
        ? unidadOptions
        : [
            { value: 'UN', label: 'Unidad' },
            { value: 'KG', label: 'Kilogramo' },
            { value: 'CAJ', label: 'Caja' },
            { value: 'LT', label: 'Litro' },
          ],
    },
    {
      name: 'precioCompra',
      label: 'Precio de compra',
      type: 'number',
      defaultValue: 0,
      hint: 'Piso de venta: no se puede vender bajo este precio. En 0 se usa el costo promedio.',
    },
    {
      name: 'cuentaContableId',
      label: 'Cuenta contable (centralización)',
      type: 'select',
      options: [{ value: '', label: '— Sin cuenta —' }, ...cuentaOptions],
    },
    { name: 'inventariable', label: 'Inventariable (mueve bodega)', type: 'checkbox', defaultValue: true },
  ];

  return (
    <MockListPage<Insumo>
      title="Maestro de artículos (insumos)"
      breadcrumbs={['Insumos / Bodega']}
      queryKey="insumos"
      queryFn={api.getInsumos}
      createLabel="Nuevo artículo"
      entityLabel="Artículo"
      formFields={formFields}
      formSize="lg"
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'INS'),
        codigo: String(v.codigo),
        familia: String(v.familia),
        subfamilia: String(v.subfamilia),
        nombre: String(v.nombre),
        detalle: String(v.detalle || '').trim() || undefined,
        unidad: String(v.unidad),
        stock: 0,
        costoPromedio: 0,
        precioCompra: Number(v.precioCompra || 0),
        cuentaContableId: String(v.cuentaContableId || '') || undefined,
        inventariable: v.inventariable !== false,
      })}
      rowToFormValues={(r) => ({
        codigo: r.codigo,
        familia: r.familia,
        subfamilia: r.subfamilia,
        nombre: r.nombre,
        detalle: r.detalle ?? '',
        unidad: r.unidad,
        precioCompra: r.precioCompra ?? 0,
        cuentaContableId: r.cuentaContableId ?? '',
        inventariable: r.inventariable !== false,
      })}
      onSave={async (values, id) => {
        const payload = {
          codigo: String(values.codigo),
          familia: String(values.familia),
          subfamilia: String(values.subfamilia),
          nombre: String(values.nombre),
          detalle: String(values.detalle || '').trim() || undefined,
          unidad: String(values.unidad),
          precioCompra: Number(values.precioCompra || 0),
          cuentaContableId: String(values.cuentaContableId || '') || undefined,
          inventariable: values.inventariable !== false,
        };
        if (id != null) await api.updateInsumo(String(id), payload);
        else await api.createInsumo(payload);
      }}
      columns={[
        { key: 'codigo', header: 'Código', cell: (r) => r.codigo },
        { key: 'fam', header: 'Familia', cell: (r) => r.familia },
        { key: 'sub', header: 'Subfamilia', cell: (r) => r.subfamilia },
        { key: 'nombre', header: 'Nombre', cell: (r) => r.nombre },
        {
          key: 'detalle',
          header: 'Detalle',
          cell: (r) => {
            const t = r.detalle?.trim();
            if (!t) return '—';
            return t.length > 60 ? `${t.slice(0, 57)}…` : t;
          },
        },
        { key: 'unidad', header: 'UM', cell: (r) => r.unidad },
        {
          key: 'precioCompra',
          header: 'Precio compra',
          cell: (r) => (r.precioCompra ? r.precioCompra.toLocaleString('es-CL') : '—'),
        },
        {
          key: 'cta',
          header: 'Cta. contable',
          cell: (r) => {
            const c = cuentaOptions.find((x) => x.value === r.cuentaContableId);
            return c ? c.label.split(' · ')[0] : (r.cuentaContableId ?? '—');
          },
        },
      ]}
    />
  );
}

export function BodegasPage() {
  const { selectedEmpresa } = useAppSettings();
  const formFields: MockFormField[] = [
    { name: 'codigo', label: 'Código (único por empresa)', required: true },
    { name: 'nombre', label: 'Nombre', required: true },
    { name: 'activa', label: 'Activa', type: 'checkbox', defaultValue: true },
  ];

  return (
    <MockListPage<Bodega>
      title="Bodegas"
      breadcrumbs={['Insumos / Bodega']}
      queryKey="bodegas"
      queryFn={api.getBodegas}
      createLabel="Nueva bodega"
      entityLabel="Bodega"
      formFields={formFields}
      buildMockRow={(v, id) => ({
        id: mockEntityId(id, 'BOD'),
        codigo: String(v.codigo).toUpperCase(),
        nombre: String(v.nombre),
        empresaId: selectedEmpresa?.id ?? 'EMP-1',
        activa: Boolean(v.activa),
      })}
      rowToFormValues={(r) => ({ codigo: r.codigo, nombre: r.nombre, activa: r.activa })}
      onSave={async (values, id) => {
        const payload = {
          codigo: String(values.codigo).toUpperCase(),
          nombre: String(values.nombre),
          activa: Boolean(values.activa),
          empresaId: selectedEmpresa?.id ?? 'EMP-1',
        };
        if (id) await api.updateBodega(String(id), payload);
        else await api.createBodega(payload);
      }}
      columns={[
        { key: 'codigo', header: 'Código', filterType: 'text', filterValue: (r) => r.codigo, cell: (r) => <span className="font-mono">{r.codigo}</span> },
        { key: 'nombre', header: 'Nombre', filterType: 'text', filterValue: (r) => r.nombre, cell: (r) => r.nombre },
        { key: 'emp', header: 'Empresa', filterType: 'text', filterValue: (r) => r.empresaId, cell: (r) => r.empresaId },
        {
          key: 'activa',
          header: 'Estado',
          filterType: 'boolean',
          filterValue: (r) => r.activa,
          filterOptions: [
            { value: 'true', label: 'Activo' },
            { value: 'false', label: 'Inactivo' },
          ],
          cell: (r) => <EstadoGenericoBadge estado={r.activa ? 'ACTIVO' : 'INACTIVO'} />,
        },
      ]}
    />
  );
}

export function MovimientosBodegaPage() {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const [detalle, setDetalle] = useState<MovimientoBodega | null>(null);
  const bodegasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'bodegas'),
    queryFn: api.getBodegas,
  });
  const insumosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'insumos'),
    queryFn: api.getInsumos,
  });
  const [bodegaFiltro, setBodegaFiltro] = useState<string>('TODAS');

  const bodegas = bodegasQ.data ?? [];
  const formFields: MockFormField[] = [
    { name: 'fecha', label: 'Fecha', type: 'date', required: true },
    {
      name: 'tipo', label: 'Tipo', type: 'select', required: true,
      options: [
        { value: 'ENTRADA_PROVEEDOR', label: 'Entrada proveedor' },
        { value: 'TRASLADO', label: 'Traslado entre bodegas' },
        { value: 'SALIDA_PROVEEDOR', label: 'Salida proveedor (genera 2 movs)' },
        { value: 'DEVOLUCION', label: 'Devolución' },
        { value: 'DEVOLUCION_NC', label: 'Devolución / NC' },
      ],
    },
    {
      name: 'estado', label: 'Estado', type: 'select', defaultValue: 'CONFIRMADO',
      options: [
        { value: 'BORRADOR', label: 'Borrador' },
        { value: 'CONFIRMADO', label: 'Confirmado' },
        { value: 'ANULADO', label: 'Anulado' },
      ],
    },
    {
      name: 'bodegaId', label: 'Bodega origen', type: 'select', required: true,
      options: bodegas.map((b) => ({ value: b.id, label: `${b.codigo} · ${b.nombre}` })),
    },
    {
      name: 'bodegaDestinoId', label: 'Bodega destino (traslado / salida)', type: 'select',
      options: [{ value: '', label: '—' }, ...bodegas.map((b) => ({ value: b.id, label: `${b.codigo} · ${b.nombre}` }))],
    },
    {
      name: 'insumoId', label: 'Artículo', type: 'select', required: true,
      options: (insumosQ.data ?? []).map((i) => ({ value: i.id, label: `${i.codigo} · ${i.nombre}` })),
    },
    { name: 'cantidad', label: 'Cantidad', type: 'number', required: true },
    { name: 'precioUnitario', label: 'Precio unitario', type: 'number', required: true },
    { name: 'facturaRef', label: 'Factura vinculada (NC)', placeholder: 'FAC-…' },
    { name: 'nota', label: 'Nota', type: 'textarea' },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div className="mb-2 text-xs font-medium text-[var(--color-muted)]">Selector de bodegas</div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Button
            size="sm"
            variant={bodegaFiltro === 'TODAS' ? 'primary' : 'outline'}
            onClick={() => setBodegaFiltro('TODAS')}
          >
            Todas
          </Button>
          {bodegas.map((b) => (
            <Button
              key={b.id}
              size="sm"
              variant={bodegaFiltro === b.id ? 'primary' : 'outline'}
              className={cn('shrink-0')}
              onClick={() => setBodegaFiltro(b.id)}
            >
              {b.codigo}
            </Button>
          ))}
        </div>
      </div>

      <MockListPage<MovimientoBodega>
        title="Movimientos de bodega"
        breadcrumbs={['Insumos / Bodega']}
        subtitle="Click en fila para ver detalle. Anular confirmados desde edición (estado)."
        queryKey={`movimientos-bodega-${bodegaFiltro}`}
        tableKey="insumos.movimientos-bodega"
        enableExport
        exportFilename="movimientos-bodega"
        queryFn={async () => {
          const rows = await api.getMovimientosBodega() as MovimientoBodega[];
          if (bodegaFiltro === 'TODAS') return rows;
          return rows.filter((r) => r.bodegaId === bodegaFiltro || r.bodegaDestinoId === bodegaFiltro);
        }}
        createLabel="Nuevo movimiento"
        entityLabel="Movimiento"
        formFields={formFields}
        formSize="lg"
        onRowClick={(r) => setDetalle(r)}
        buildMockRow={(v, id) => ({
          id: mockEntityId(id, 'MB'),
          fecha: String(v.fecha),
          tipo: String(v.tipo) as MovimientoBodega['tipo'],
          estado: String(v.estado || 'CONFIRMADO') as NonNullable<MovimientoBodega['estado']>,
          bodegaId: String(v.bodegaId),
          bodega: String(v.bodega || ''),
          bodegaDestinoId: String(v.bodegaDestinoId || '') || undefined,
          bodegaDestino: String(v.bodegaDestino || '') || undefined,
          insumoId: String(v.insumoId),
          articulo: String(v.articulo || ''),
          cantidad: Number(v.cantidad),
          precioUnitario: Number(v.precioUnitario),
          facturaRef: String(v.facturaRef || '') || undefined,
          nota: String(v.nota || ''),
        })}
        rowToFormValues={(r) => ({
          fecha: r.fecha,
          tipo: r.tipo,
          estado: r.estado ?? 'CONFIRMADO',
          bodegaId: r.bodegaId ?? '',
          bodegaDestinoId: r.bodegaDestinoId ?? '',
          insumoId: r.insumoId ?? '',
          cantidad: r.cantidad,
          precioUnitario: r.precioUnitario,
          facturaRef: r.facturaRef ?? '',
          nota: r.nota,
        })}
        onSave={async (values, id) => {
          const bodegaId = String(values.bodegaId);
          const bodegaDestinoId = String(values.bodegaDestinoId || '') || undefined;
          const insumoId = String(values.insumoId);
          const bodega = bodegas.find((row) => row.id === bodegaId);
          const bodegaDestino = bodegas.find((row) => row.id === bodegaDestinoId);
          const insumo = (insumosQ.data ?? []).find((row) => row.id === insumoId);
          const payload = {
            fecha: String(values.fecha),
            tipo: String(values.tipo) as MovimientoBodega['tipo'],
            estado: (String(values.estado || 'CONFIRMADO') as NonNullable<MovimientoBodega['estado']>),
            bodegaId,
            bodega: bodega ? `${bodega.codigo} · ${bodega.nombre}` : bodegaId,
            bodegaDestinoId,
            bodegaDestino: bodegaDestino ? `${bodegaDestino.codigo} · ${bodegaDestino.nombre}` : undefined,
            insumoId,
            articulo: insumo ? `${insumo.codigo} · ${insumo.nombre}` : insumoId,
            cantidad: Number(values.cantidad),
            precioUnitario: Number(values.precioUnitario),
            facturaRef: String(values.facturaRef || '') || undefined,
            nota: String(values.nota || ''),
            generarPar: String(values.tipo) === 'SALIDA_PROVEEDOR',
          };
          if (id) await api.updateMovimientoBodega(String(id), payload);
          else await api.createMovimientoBodega(payload);
        }}
        invalidateKeys={['insumos', 'movimientos-bodega', `movimientos-bodega-${bodegaFiltro}`]}
        columns={[
          { key: 'fecha', header: 'Fecha', sortValue: (r) => r.fecha, cell: (r) => fmtDate(r.fecha) },
          {
            key: 'tipo',
            header: 'Tipo',
            sortValue: (r) => r.tipo,
            filterValue: (r) => r.tipo,
            cell: (r) => (
              <Badge tone={r.tipo.includes('DEVOLUCION') || r.tipo === 'SALIDA_PROVEEDOR' ? 'warning' : 'info'}>
                {r.tipo.replace(/_/g, ' ')}
              </Badge>
            ),
          },
          {
            key: 'estado',
            header: 'Estado',
            sortValue: (r) => r.estado ?? 'CONFIRMADO',
            filterValue: (r) => r.estado ?? 'CONFIRMADO',
            cell: (r) => (
              <Badge tone={r.estado === 'CONFIRMADO' ? 'success' : r.estado === 'ANULADO' ? 'danger' : 'warning'}>
                {r.estado ?? 'CONFIRMADO'}
              </Badge>
            ),
          },
          { key: 'bodega', header: 'Origen', cell: (r) => r.bodega },
          { key: 'dest', header: 'Destino', cell: (r) => r.bodegaDestino ?? '—' },
          { key: 'art', header: 'Artículo', cell: (r) => r.articulo },
          { key: 'cant', header: 'Cant.', sortValue: (r) => r.cantidad, cell: (r) => r.cantidad, align: 'right' },
          { key: 'pu', header: 'P. unit.', sortValue: (r) => r.precioUnitario, cell: (r) => fmtCLP(r.precioUnitario), align: 'right' },
          { key: 'fac', header: 'Factura', cell: (r) => r.facturaRef ?? '—' },
          { key: 'par', header: 'Par', cell: (r) => r.parId ? 'Sí' : '—' },
          {
            key: '_ver',
            header: '',
            sortable: false,
            filterable: false,
            hideable: false,
            cell: (r) => (
              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDetalle(r); }}>
                Ver
              </Button>
            ),
          },
        ]}
      />

      <Modal
        open={detalle != null}
        onClose={() => setDetalle(null)}
        title={detalle ? `Movimiento · ${detalle.articulo}` : 'Detalle'}
        size="md"
        footer={<Button variant="ghost" onClick={() => setDetalle(null)}>Cerrar</Button>}
      >
        {detalle && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-[var(--color-muted)]">Fecha</dt><dd>{fmtDate(detalle.fecha)}</dd></div>
            <div><dt className="text-[var(--color-muted)]">Estado</dt><dd>{detalle.estado ?? 'CONFIRMADO'}</dd></div>
            <div className="col-span-2"><dt className="text-[var(--color-muted)]">Tipo</dt><dd>{detalle.tipo.replace(/_/g, ' ')}</dd></div>
            <div><dt className="text-[var(--color-muted)]">Origen</dt><dd>{detalle.bodega}</dd></div>
            <div><dt className="text-[var(--color-muted)]">Destino</dt><dd>{detalle.bodegaDestino ?? '—'}</dd></div>
            <div className="col-span-2"><dt className="text-[var(--color-muted)]">Artículo</dt><dd>{detalle.articulo}</dd></div>
            <div><dt className="text-[var(--color-muted)]">Cantidad</dt><dd>{detalle.cantidad}</dd></div>
            <div><dt className="text-[var(--color-muted)]">P. unit.</dt><dd className="font-mono">{fmtCLP(detalle.precioUnitario)}</dd></div>
            <div className="col-span-2"><dt className="text-[var(--color-muted)]">Factura</dt><dd>{detalle.facturaRef ?? '—'}</dd></div>
            <div className="col-span-2"><dt className="text-[var(--color-muted)]">Nota</dt><dd>{detalle.nota || '—'}</dd></div>
          </dl>
        )}
      </Modal>
    </div>
  );
}

/** Alias legacy route */
export function ContratistasPage() {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-muted)]">
      Contratistas se movió a <a className="text-[var(--color-accent-2)] underline" href="/contratistas">/contratistas</a>.
    </div>
  );
}
