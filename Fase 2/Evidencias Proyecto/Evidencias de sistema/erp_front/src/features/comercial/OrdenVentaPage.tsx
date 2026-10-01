import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listQueryKey, useEmpresaScopeId, useQueryScope } from '@/hooks/useQueryScope';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { EstadoDocumentoBadge } from '@/components/common/Badges';
import { Button } from '@/components/ui/button';
import { fmtCLP, fmtDate } from '@/lib/utils';
import { toast } from 'sonner';
import type { DocumentoComercial } from '@/types/domain';
import { EMPTY_ARRAY } from '@/lib/empty';
import * as api from '@/services/api';
import { BorradoresDocumentosButton } from '@/features/comercial/BorradoresDocumentosButton';
import { RowActionIcons, RowActions } from '@/components/common/RowActions';
import { useAppSettings } from '@/app/app-settings-context';
import { printEmpresaDocumento, watermarkForEstado } from '@/lib/documentoPrint';
import { usePeriodoVista } from '@/hooks/usePeriodoVista';
import { PeriodoVistaToggle } from '@/components/common/PeriodoVistaToggle';
import {
  FILTRO_ESTADOS_OV,
  folioInternoSortValue,
  labelEstadoOv,
  ovEsFacturable,
  pathWizardOv,
  totalBrutoDocumento,
} from '@/features/comercial/emitir-ov-helpers';

const EMPTY_DOCS = EMPTY_ARRAY as DocumentoComercial[];

export function OrdenVentaPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const { selectedEmpresa } = useAppSettings();
  const periodoVista = usePeriodoVista();
  const [busy, setBusy] = useState<string | null>(null);
  const [highlightOvId, setHighlightOvId] = useState<string | null>(null);
  const deepLinkHandled = useRef<string | null>(null);

  const docsQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'ordenes-venta'),
    queryFn: async () => {
      const docs = await api.getDocumentos();
      return (docs as DocumentoComercial[]).filter((d) => d.tipo === 'ORDEN_VENTA');
    },
  });
  const data = docsQ.data ?? EMPTY_DOCS;
  const dataVista = useMemo(
    () => periodoVista.filter(data, (r) => r.fecha),
    [data, periodoVista.todo, periodoVista.codigo],
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'ordenes-venta') });
  };

  const openWizardOv = (ovId?: string) => {
    navigate(pathWizardOv(ovId ? { ov: ovId } : undefined));
  };

  const confirmar = async (row: DocumentoComercial) => {
    setBusy(row.id);
    try {
      await api.confirmarOrdenVenta(row.id);
      toast.success(`OV ${row.folio} confirmada (reserva consumida · stock descontado)`);
      await invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo confirmar');
    } finally {
      setBusy(null);
    }
  };

  // Notificación OV_APROBADA → /ordenes-venta?ov={id}: resalta la fila y guía al solicitante.
  useEffect(() => {
    const ovId = searchParams.get('ov');
    if (!ovId || docsQ.isLoading || !docsQ.data) return;
    if (deepLinkHandled.current === ovId) return;
    const row = docsQ.data.find((d) => d.id === ovId);
    if (!row) return;
    deepLinkHandled.current = ovId;
    setHighlightOvId(ovId);
    const next = new URLSearchParams(searchParams);
    next.delete('ov');
    setSearchParams(next, { replace: true });
    if (ovEsFacturable(row.estado)) {
      toast.success(`OV ${row.folio} lista — facture desde Ventas › Emitir DTE.`);
    } else {
      toast.info(`OV ${row.folio} · ${labelEstadoOv(row.estado)}`);
    }
  }, [searchParams, docsQ.isLoading, docsQ.data, setSearchParams]);

  const printOv = (r: DocumentoComercial) => {
    if (!selectedEmpresa) {
      toast.error('Selecciona una empresa');
      return;
    }
    try {
      printEmpresaDocumento({
        empresa: selectedEmpresa,
        kind: 'ORDEN_VENTA',
        title: `Orden de venta ${r.folio}`,
        forceWatermark: watermarkForEstado(r.estado),
        rows: [{
          folio: r.folio,
          contraparte: r.cliente,
          fecha: r.fecha,
          neto: fmtCLP(r.neto),
          netoNum: r.neto,
          iva: r.iva != null ? fmtCLP(r.iva) : undefined,
          total: r.total != null ? fmtCLP(r.total) : undefined,
          estado: r.estado,
          receptorRut: r.receptorRut,
          receptorGiro: r.receptorGiro,
          receptorDireccion: r.receptorDireccion,
          receptorComuna: r.receptorComuna,
          receptorCiudad: r.receptorCiudad,
          observacion: r.observaciones || undefined,
          lineas: (r.lineas ?? []).map((l) => ({
            codigo: l.codigoProducto,
            descripcion: l.descripcion,
            cantidad: l.cantidad,
            unidad: l.unidadMedida,
            descuento: l.descuentoPct ? `${l.descuentoPct}%` : undefined,
            precioUnitario: fmtCLP(l.precioUnitario),
            total: fmtCLP(l.total),
          })),
        }],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo imprimir');
    }
  };

  const cols: Column<DocumentoComercial>[] = [
    { key: 'folio', header: 'Folio', filterType: 'text', filterValue: (r) => r.folio, sortValue: (r) => folioInternoSortValue(r.folio), cell: (r) => (
      <span className={highlightOvId === r.id ? 'font-semibold text-[var(--color-primary)]' : undefined}>
        {r.folio}
        {highlightOvId === r.id ? ' · ' : ''}
        {highlightOvId === r.id ? <span className="text-xs font-normal">desde notificación</span> : null}
      </span>
    ) },
    { key: 'cliente', header: 'Cliente', filterType: 'text', filterValue: (r) => r.cliente, cell: (r) => r.cliente },
    { key: 'fecha', header: 'Fecha', filterType: 'date', filterValue: (r) => r.fecha, cell: (r) => fmtDate(r.fecha) },
    { key: 'total', header: 'Total', filterType: 'number', filterValue: (r) => totalBrutoDocumento(r), cell: (r) => fmtCLP(totalBrutoDocumento(r)), align: 'right' },
    {
      key: 'estado',
      header: 'Estado',
      filterType: 'select',
      filterValue: (r) => r.estado,
      filterOptions: FILTRO_ESTADOS_OV,
      cell: (r) => <EstadoDocumentoBadge estado={r.estado} label={labelEstadoOv(r.estado)} />,
    },
    {
      key: 'acc',
      header: 'Acciones',
      sortable: false,
      filterable: false,
      cell: (r) => (
        <RowActions
          actions={[
            {
              key: 'print',
              label: 'Imprimir',
              icon: RowActionIcons.imprimir(),
              onClick: () => printOv(r),
            },
            ...(r.estado === 'BORRADOR' ? [{
              key: 'edit',
              label: 'Editar',
              icon: RowActionIcons.editar(),
              onClick: () => openWizardOv(r.id),
            }] : []),
            ...(r.estado === 'BORRADOR' ? [{
              key: 'conf',
              label: 'Confirmar (stock)',
              icon: RowActionIcons.emitir(),
              disabled: busy === r.id,
              onClick: () => void confirmar(r),
            }] : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Órdenes de venta"
        breadcrumbs={['Ventas']}
        subtitle="Guarde la orden (valida stock) y facture desde Emitir DTE."
        action={(
          <div className="flex flex-wrap justify-end gap-2">
            <BorradoresDocumentosButton />
            <Button onClick={() => openWizardOv()}>Nueva orden</Button>
          </div>
        )}
      />
      {docsQ.isLoading ? <p className="text-sm text-[var(--color-muted)]">Cargando…</p> : (
        <DataTable
          columns={cols}
          rows={dataVista}
          empty={periodoVista.empty('órdenes de venta')}
          tableKey="comercial.ov"
          defaultSort={{ key: 'folio', dir: 'desc' }}
          toolbarExtra={<PeriodoVistaToggle vista={periodoVista} />}
        />
      )}
    </div>
  );
}
