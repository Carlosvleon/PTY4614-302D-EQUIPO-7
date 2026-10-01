import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useQueryScope,
  useEmpresaScopeId,
  usePeriodoScopeCodigo,
  listQueryKey,
  periodListQueryKey,
} from '@/hooks/useQueryScope';
import {
  Search, FileText, Check, ChevronRight, Plus, Trash2, Eye, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { EstadoDocumentoBadge } from '@/components/common/Badges';
import { InfoHint } from '@/components/common/InfoHint';
import { CollapsibleRightPanel } from '@/components/common/CollapsibleRightPanel';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { MontoInput } from '@/components/ui/monto-input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Modal } from '@/components/ui/modal';
import { cn, fmtCLP, fmtDate, fmtDateTime, fmtIso, fmtNumber, localIsoDate } from '@/lib/utils';
import { periodoSesionDistintoDeHoy } from '@/lib/periodo-trabajo';
import { useAuth } from '@/app/auth-context';
import { useAppSettings } from '@/app/app-settings-context';
import { printEmpresaDocumento, type PrintDocKind } from '@/lib/documentoPrint';
import type { Cliente, CuentaContable, DocumentoComercial, Insumo } from '@/types/domain';
import { esTipoEmision } from '@/types/domain';
import * as api from '@/services/api';
import { BorradoresDocumentosButton } from '@/features/comercial/BorradoresDocumentosButton';
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';
import { PeriodoVistaToggle } from '@/components/common/PeriodoVistaToggle';
import { usePeriodoVista } from '@/hooks/usePeriodoVista';
import {
  applyDocumentoCabecera,
  aplicarCuentaDesdeInsumo,
  aplicarDetalleDesdeInsumo,
  aplicarDefaultsComex,
  CODREF_OPTIONS,
  comexDesdeFacturaOrigen,
  comexFormDesdeDocumento,
  docsOrigenNcNd,
  docLineasToEmitirItems,
  emptyComexForm,
  esTipoDteReferencia,
  labelOrigenNcNd,
  emitirItemsToEmisionPayloadLineas,
  emitirItemsToOvPayloadLineas,
  emptyEmitirLine,
  esTipoCorreccionNcNd,
  esTipoEmisionSinOv,
  filterOvsMiasFacturables,
  itemsParaCorreccion,
  labelEstadoOv,
  labelIndicadorVenta,
  lineSubtotal,
  montosComexDesdeCajas,
  payloadComexDesdeWizard,
  patchComexSoloMontos,
  aplicarTipoCambioSugerido,
  tcBcchSugeridoDesdeKpi,
  textoHintTcBcchSugerido,
  precioUnitarioDesdeInsumo,
  pisoPrecioVentaInsumo,
  labelInsumoSelector,
  huecosComexFactura110,
  mensajeHuecosComexManual,
  violaPisoPrecioVenta,
  mensajePrecioBajoPiso,
  referenciaManualCompleta,
  referenciaSiiDesdeOrigen,
  ovAccionesVisibles,
  ovFormularioEditable,
  parseComexNumero,
  ovEsFacturable,
  folioInternoSortValue,
  mapTipoDteErp,
  mergeFacturaDraftConOv,
  pathEmitirFacturaOv,
  pathEmitirTipoLibre,
  pathLibroVentas,
  pathWizardOv,
  pathWizardOvItems,
  PATH_OV_WIZARD,
  PATH_EMITIR_DTE,
  prefijarObservacionTc,
  receptorFromCliente,
  resolverFolioSiiParaLibro,
  resumenPanelTotales,
  splitsParaValidar,
  quitarSplitBodega,
  bodegasConStock,
  stockDisponibleRow,
  tooltipOtraBodega,
  totalBrutoDocumento,
  TIPOS_DTE_REFERENCIA,
  TIPOS_EMISION_SIN_OV,
  type ComexForm,
  type EmitirLineItem,
  type StockBodegaRow,
} from '@/features/comercial/emitir-ov-helpers';
import {
  BULTOS_ADUANA,
  CLAUSULAS_ADUANA,
  COMEX_DEFAULTS_ADUANA,
  COMEX_IND_TRASLADO_DEFAULT,
  MODALIDADES_ADUANA,
  MONEDAS_ADUANA,
  PAISES_ADUANA,
  PUERTOS_ADUANA,
  VIAS_ADUANA,
  opcionesAduana,
  opcionesConCodigoLibre,
  isoMonedaComex,
  monedaCodigoDesdeTpo,
  etiquetaCatalogoAduana,
  codigoPuertoAduana,
  opcionesPuertosDesembarque,
} from '@/features/comercial/comex-aduana';
import { mensajeErrorEmisionDte, TOAST_EMIT_DTE_OPTS } from '@/features/comercial/dte-emit-error';
import { labelTipoDteSii } from '@/features/comercial/dte-tipo-sii';
import { sugerirSiguienteFolio } from '@/lib/folio';
import { validateFiscalId } from '@/lib/inputValidation';

function flattenCuentas(rows: CuentaContable[]): CuentaContable[] {
  const out: CuentaContable[] = [];
  const walk = (list: CuentaContable[]) => {
    for (const c of list) {
      out.push(c);
      if (c.children?.length) walk(c.children);
    }
  };
  walk(rows);
  return out;
}

function fechaEnPeriodo(fecha: string, codigoPeriodo: string): boolean {
  const f = (fecha || '').trim();
  if (/^\d{4}-\d{2}/.test(f)) return f.startsWith(codigoPeriodo);
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(f);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}` === codigoPeriodo;
  return false;
}

const TRANSMISION_HINT =
  'La emisión se envía al facturador (intermediario). Si el partner rechaza el DTE —por ejemplo CAF o rango de folios no cargado en el portal— el documento queda en borrador y no se contabiliza. No es DTE aceptado por el SII hasta confirmación del partner.';

function TransmisionHint() {
  return (
    <InfoHint label="Cómo funciona la transmisión al facturador">
      {TRANSMISION_HINT}
    </InfoHint>
  );
}

function ConfirmacionFacturarOv({ ov }: { ov: DocumentoComercial }) {
  const esExport = (ov.indicadorVenta || '').toUpperCase() === 'EXPORTACION';
  const iso = esExport ? isoMonedaComex(ov.tpoMoneda || ov.monedaCodigo) : undefined;
  const money = (n: number) => (iso ? fmtIso(n, iso) : fmtCLP(n));
  const lineas = (ov.lineas ?? []).filter((l) => l.descripcion?.trim() || l.insumoId);
  const tipoDte = mapTipoDteErp('FACTURA', ov.indicadorVenta);
  const comex = esExport ? comexFormDesdeDocumento(ov) : null;
  const total = ov.total ?? ov.neto + (ov.iva ?? 0);
  return (
    <div className="space-y-4 text-sm">
      <p className="text-[var(--color-muted)]">
        Se emitirá el DTE con los datos de la OV. Para cambiar precios, COMEX o ítems, cancele y use el lápiz.
      </p>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] text-[var(--color-muted)]">OV</dt>
          <dd className="font-mono">{ov.folio}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[var(--color-muted)]">DTE a emitir</dt>
          <dd>{labelTipoDteSii(tipoDte)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[var(--color-muted)]">Cliente</dt>
          <dd>{ov.cliente || '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[var(--color-muted)]">RUT</dt>
          <dd className="font-mono">{ov.receptorRut || '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[var(--color-muted)]">Indicador</dt>
          <dd>{labelIndicadorVenta(ov.indicadorVenta)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[var(--color-muted)]">Fecha OV</dt>
          <dd>{fmtDate(ov.fecha)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[var(--color-muted)]">{iso ? `Neto (${iso})` : 'Neto'}</dt>
          <dd className="tabular-nums">{money(ov.neto)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[var(--color-muted)]">{iso ? `Total (${iso})` : 'Total'}</dt>
          <dd className="tabular-nums font-medium">{money(total)}</dd>
        </div>
      </dl>
      {comex ? (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] text-[var(--color-muted)]">Moneda</dt>
            <dd>{etiquetaCatalogoAduana(MONEDAS_ADUANA, comex.tpoMoneda || '13')}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[var(--color-muted)]">Tipo de cambio</dt>
            <dd className="tabular-nums">{comex.tipoCambio || '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[var(--color-muted)]">País destino</dt>
            <dd>{etiquetaCatalogoAduana(PAISES_ADUANA, comex.paisDestino)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[var(--color-muted)]">Puerto dest.</dt>
            <dd>{etiquetaCatalogoAduana(PUERTOS_ADUANA, comex.puertoDesembarque)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[var(--color-muted)]">Cláusula</dt>
            <dd>{etiquetaCatalogoAduana(CLAUSULAS_ADUANA, comex.clausulaVenta)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[var(--color-muted)]">Vía</dt>
            <dd>{etiquetaCatalogoAduana(VIAS_ADUANA, comex.viaTransporte)}</dd>
          </div>
        </dl>
      ) : null}
      {lineas.length ? (
        <div className="max-h-48 overflow-auto rounded border border-[var(--color-border)]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--color-surface-2)] text-[var(--color-muted)]">
              <tr>
                <th className="p-2">Ítem</th>
                <th className="p-2 text-right">Cant.</th>
                <th className="p-2 text-right">P. unit.</th>
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={`${l.insumoId || l.descripcion}-${i}`} className="border-t border-[var(--color-border)]">
                  <td className="p-2">{l.descripcion || '—'}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNumber(l.cantidad)}</td>
                  <td className="p-2 text-right tabular-nums">{money(l.precioUnitario)}</td>
                  <td className="p-2 text-right tabular-nums">{money(l.total ?? l.cantidad * l.precioUnitario)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-[var(--color-muted)]">Sin detalle de ítems en el listado; se usarán los de la OV al emitir.</p>
      )}
    </div>
  );
}

function AvisosEmitirStrip({ items }: { items: string[] }) {
  const visibles = items.map((t) => t.trim()).filter(Boolean);
  if (!visibles.length) return null;
  return (
    <div
      role="status"
      className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] leading-snug text-amber-900 dark:text-amber-100"
    >
      {visibles.map((t, i) => (
        <span key={`${i}-${t}`}>
          {i > 0 ? <span className="mx-1.5 text-amber-700/50 dark:text-amber-200/40">·</span> : null}
          {t}
        </span>
      ))}
    </div>
  );
}

const PREVIEW_KIND: Partial<Record<DocumentoComercial['tipo'], PrintDocKind>> = {
  FACTURA: 'FACTURA',
  OC: 'OC',
  NC: 'NC',
  ND: 'ND',
  GUIA: 'GUIA',
  ORDEN_VENTA: 'ORDEN_VENTA',
};

const STEPS = [
  { id: 1, label: '1. Datos generales y receptor' },
  { id: 2, label: '2. Ítems' },
  { id: 3, label: '3. Referencias y pagos' },
] as const;

/** RUT fiscal extranjero fijo (manual COMEX / Acepta). */
const RUT_EXPORTACION_EXTRANJERO = '55.555.555-5';

interface ReceptorData {
  rut: string;
  razonSocial: string;
  giro: string;
  direccion: string;
  comuna: string;
  ciudad: string;
}

type LookupHint = 'idle' | 'found' | 'not_found' | 'error';

function normalizeRutKey(rut: string) {
  return rut.replace(/[.\s-]/g, '').toUpperCase();
}

function rutsMatch(a: string, b: string) {
  return normalizeRutKey(a) === normalizeRutKey(b);
}

const RECEPTOR_READONLY_CLASS = 'cursor-not-allowed bg-[var(--color-surface-2)] opacity-90';

const MSG_CLIENTE_NO_REGISTRADO =
  'Cliente no encontrado. Debe registrarlo en el menú de Clientes antes de emitir un documento.';

const COMPACT_CTRL = 'h-8 rounded-md px-2.5 text-xs';

function LineaEmitirRow({
  item,
  cuentaOptions,
  insumoOptions,
  insumos,
  onUpdate,
  onRemove,
  canRemove,
  modoOv,
  mostrarCuenta,
  lineaBloqueada,
  stockMap,
  onLoadStock,
  onUpdateSplits,
  notaEmisionDirecta,
  mostrarIncluirCorreccion,
  ignorarPrecioBodega,
  monedaIso,
}: {
  item: EmitirLineItem;
  cuentaOptions: { value: string; label: string }[];
  insumoOptions: { value: string; label: string }[];
  insumos: Insumo[];
  onUpdate: (id: string, patch: Partial<EmitirLineItem>) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
  modoOv?: boolean;
  mostrarCuenta?: boolean;
  /** OV no BORRADOR (p. ej. ya facturada): no muta producto/cantidad. */
  lineaBloqueada?: boolean;
  stockMap?: Record<string, StockBodegaRow[]>;
  onLoadStock?: (insumoId: string) => void;
  onUpdateSplits?: (id: string, splits: EmitirLineItem['splits']) => void;
  notaEmisionDirecta?: boolean;
  mostrarIncluirCorreccion?: boolean;
  /** COMEX: no precargar costo/precio de bodega (D16 no aplica). */
  ignorarPrecioBodega?: boolean;
  /** Factura/OV exportación: P. unit. y subtotal en la moneda COMEX. */
  monedaIso?: string;
}) {
  const bodegasStock = bodegasConStock(stockMap?.[item.insumoId]);
  const hintOtraBodega = tooltipOtraBodega(bodegasStock.length, item.descripcion);
  const colSpan = (mostrarCuenta ? 8 : 7) + (mostrarIncluirCorreccion ? 1 : 0);
  const muestraBodega = Boolean(modoOv && item.tipoLinea === 'PRODUCTO' && item.insumoId);
  const incluida = item.incluirEnCorreccion !== false;
  const insumoLinea = insumos.find((x) => x.id === item.insumoId);
  const pisoVenta = ignorarPrecioBodega ? 0 : pisoPrecioVentaInsumo(insumoLinea);
  const bajoPiso = item.tipoLinea === 'PRODUCTO'
    && violaPisoPrecioVenta(item.precioUnitario, pisoVenta);

  return (
    <>
      <tr className={cn(
        'border-t border-[var(--color-border)] align-top',
        mostrarIncluirCorreccion && !incluida && 'opacity-50',
      )}>
        {mostrarIncluirCorreccion && (
          <td className="px-1.5 py-1">
            <Checkbox
              checked={incluida}
              aria-label="Incluir en corrección"
              title="Incluir en corrección"
              onChange={(e) => onUpdate(item.id, { incluirEnCorreccion: e.target.checked })}
            />
          </td>
        )}
        <td className="px-1.5 py-1">
          <Select
            className={COMPACT_CTRL}
            aria-label="Tipo de línea"
            value={item.tipoLinea}
            disabled={lineaBloqueada}
            onChange={(e) => {
              const tipoLinea = e.target.value as EmitirLineItem['tipoLinea'];
              onUpdate(item.id, {
                tipoLinea,
                insumoId: '',
                descripcion: '',
                detalle: '',
                codigoProducto: '',
                unidadMedida: '',
                splits: [{ bodegaId: '', cantidad: String(item.cantidad || 1) }],
              });
            }}
          >
            <option value="PRODUCTO">Producto</option>
            <option value="SERVICIO">Servicio</option>
            <option value="FLETE">Flete</option>
          </Select>
        </td>
        <td className="min-w-[12rem] px-1.5 py-1">
          {item.tipoLinea === 'PRODUCTO' || !modoOv ? (
            <SearchableSelect
              value={item.insumoId}
              options={insumoOptions}
              placeholder="Buscar…"
              emptyLabel="Sin artículos"
              disabled={lineaBloqueada}
              buttonClassName="h-8 rounded-md px-2.5 text-xs"
              title={
                (insumoLinea?.detalle || item.detalle || '').trim()
                  || (item.insumoId ? 'Sin detalle DTE en el maestro de artículos' : undefined)
              }
              onChange={(id) => {
                const ins = insumos.find((x) => x.id === id);
                onUpdate(item.id, {
                  insumoId: id,
                  descripcion: ins ? `${ins.codigo} · ${ins.nombre}` : '',
                  detalle: ins?.detalle?.trim() || '',
                  codigoProducto: ins?.codigo ?? '',
                  unidadMedida: ins?.unidad ?? '',
                  precioUnitario: precioUnitarioDesdeInsumo(pisoPrecioVentaInsumo(ins), {
                    ignorarPrecioBodega,
                  }),
                  cuentaContableId: ins?.cuentaContableId || item.cuentaContableId,
                  splits: [{ bodegaId: '', cantidad: String(item.cantidad || 1) }],
                });
                if (modoOv && id) onLoadStock?.(id);
              }}
            />
          ) : (
            <Input
              className={COMPACT_CTRL}
              value={item.descripcion}
              onChange={(e) => onUpdate(item.id, { descripcion: e.target.value })}
              placeholder={item.tipoLinea === 'FLETE' ? 'Flete' : 'Servicio'}
              disabled={lineaBloqueada}
            />
          )}
          {notaEmisionDirecta && item.tipoLinea === 'PRODUCTO' && (
            <p className="mt-0.5 text-[10px] leading-tight text-amber-800 dark:text-amber-200">
              La emisión directa no descuenta stock.
            </p>
          )}
        </td>
        <td className="w-[5.5rem] px-1.5 py-1">
          <Input
            className={cn(COMPACT_CTRL, 'text-right', (item.bloqueado || lineaBloqueada) && RECEPTOR_READONLY_CLASS)}
            type="number"
            min={1}
            aria-label="Cantidad"
            value={item.cantidad}
            readOnly={item.bloqueado || lineaBloqueada}
            onChange={(e) => {
              const cantidad = Number(e.target.value) || 0;
              onUpdate(item.id, {
                cantidad,
                splits: item.splits.length === 1
                  ? [{ ...item.splits[0], cantidad: String(cantidad) }]
                  : item.splits,
              });
            }}
          />
        </td>
        <td className="w-[7rem] px-1.5 py-1">
          <MontoInput
            kind="precio"
            className={cn(
              COMPACT_CTRL,
              'text-right',
              bajoPiso && 'border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:ring-[var(--color-danger)]/20',
            )}
            aria-label={monedaIso ? `Precio unitario en ${monedaIso}` : 'Precio unitario'}
            title={bajoPiso
              ? mensajePrecioBajoPiso(insumoLinea?.codigo || item.codigoProducto || 'artículo', pisoVenta)
              : (monedaIso ? `Precio de venta en ${monedaIso} (no pesos)` : 'Precio unitario en pesos')}
            value={item.precioUnitario}
            disabled={lineaBloqueada}
            onChange={(v) => onUpdate(item.id, { precioUnitario: v ?? 0 })}
          />
          {bajoPiso ? (
            <p className="mt-0.5 text-[10px] leading-tight text-[var(--color-danger)]" role="alert">
              Mínimo {fmtCLP(pisoVenta)}
            </p>
          ) : null}
        </td>
        <td className="w-[4.5rem] px-1.5 py-1">
          <Input
            className={cn(COMPACT_CTRL, 'text-right', (item.bloqueado || lineaBloqueada) && RECEPTOR_READONLY_CLASS)}
            type="number"
            min={0}
            max={100}
            aria-label="Descuento porcentual"
            value={item.descuentoPct || ''}
            readOnly={item.bloqueado || lineaBloqueada}
            onChange={(e) => onUpdate(item.id, { descuentoPct: Number(e.target.value) || 0 })}
          />
        </td>
        {mostrarCuenta && (
          <td className="min-w-[10rem] px-1.5 py-1">
            <SearchableSelect
              value={item.cuentaContableId}
              options={cuentaOptions}
              placeholder="Cuenta…"
              emptyLabel="Sin cuentas"
              buttonClassName={COMPACT_CTRL}
              onChange={(cuentaContableId) => onUpdate(item.id, { cuentaContableId })}
            />
          </td>
        )}
        <td className="whitespace-nowrap px-1.5 py-1 text-right text-xs tabular-nums">
          <div className="flex h-8 items-center justify-end">
            {monedaIso ? fmtIso(lineSubtotal(item), monedaIso) : fmtCLP(lineSubtotal(item))}
          </div>
        </td>
        <td className="w-8 px-1 py-1">
          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 px-0 text-[var(--color-muted)] hover:text-[var(--color-danger)]"
              aria-label="Quitar línea"
              onClick={() => onRemove(item.id)}
            >
              <Trash2 size={14} />
            </Button>
          )}
        </td>
      </tr>
      {muestraBodega && (
        <tr className="bg-[var(--color-surface-2)]/40">
          <td colSpan={colSpan} className="px-1.5 pb-1.5 pt-0">
            <div className="flex flex-wrap items-center gap-1.5 pl-1">
              <span className="text-[10px] text-[var(--color-muted)]">
                Bodega
                {item.splits.length === 1
                  ? ` · se descuenta ${fmtNumber(item.cantidad)}`
                  : ` · suma ${fmtNumber(item.cantidad)}`}
              </span>
              {item.splits.map((s, si) => (
                <div key={`${item.id}-s-${si}`} className="flex items-center gap-1">
                  <Select
                    className="h-7 w-[14rem] max-w-full px-2 text-xs"
                    value={s.bodegaId}
                    title={s.bodegaId
                      ? (stockMap?.[item.insumoId] ?? []).find((b) => b.bodegaId === s.bodegaId)?.nombre
                      : undefined}
                    aria-label={item.splits.length > 1 ? `Bodega ${si + 1}` : 'Bodega de salida'}
                    onChange={(e) => {
                      const splits = item.splits.map((sp, j) => (
                        j === si
                          ? {
                            ...sp,
                            bodegaId: e.target.value,
                            cantidad: item.splits.length === 1 ? String(item.cantidad) : sp.cantidad,
                          }
                          : sp
                      ));
                      onUpdateSplits?.(item.id, splits);
                    }}
                  >
                    <option value="">Bodega…</option>
                    {(stockMap?.[item.insumoId] ?? []).map((b) => (
                      <option
                        key={b.bodegaId}
                        value={b.bodegaId}
                        title={`${b.codigo} · ${b.nombre}`}
                      >
                        {b.codigo} · disp. {fmtNumber(stockDisponibleRow(b))}
                      </option>
                    ))}
                  </Select>
                  {item.splits.length > 1 && (
                    <Input
                      type="number"
                      min={0}
                      className="h-7 w-[3.75rem] shrink-0 px-1.5 text-center text-xs"
                      value={s.cantidad}
                      aria-label={`Cantidad bodega ${si + 1}`}
                      onChange={(e) => {
                        const splits = item.splits.map((sp, j) => (
                          j === si ? { ...sp, cantidad: e.target.value } : sp
                        ));
                        onUpdateSplits?.(item.id, splits);
                      }}
                    />
                  )}
                  {item.splits.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 shrink-0 px-0 text-[var(--color-muted)] hover:text-[var(--color-danger)]"
                      aria-label="Quitar bodega"
                      onClick={() => onUpdateSplits?.(
                        item.id,
                        quitarSplitBodega(item.splits, si, item.cantidad),
                      )}
                    >
                      <Trash2 size={13} />
                    </Button>
                  )}
                </div>
              ))}
              <span className="inline-flex shrink-0" title={hintOtraBodega}>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={bodegasStock.length <= 1}
                  aria-label={hintOtraBodega ?? 'Otra bodega'}
                  onClick={() => onUpdateSplits?.(item.id, [
                    ...item.splits.map((sp, i) => (
                      i === 0 && item.splits.length === 1
                        ? { ...sp, cantidad: String(item.cantidad) }
                        : sp
                    )),
                    { bodegaId: '', cantidad: '0' },
                  ])}
                >
                  + Bodega
                </Button>
              </span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function EmitirDocumentoPage() {
  const { user } = useAuth();
  const { selectedEmpresa, demoMode } = useAppSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const draftParam = searchParams.get('draft') ?? '';
  const contextoParam = searchParams.get('contexto') ?? '';
  const origenParam = searchParams.get('origen') ?? '';
  const ovParam = searchParams.get('ov') ?? '';
  const tipoParam = (searchParams.get('tipo') ?? '').toUpperCase();
  const isRutaOv = location.pathname.startsWith(PATH_OV_WIZARD);
  const isModoOv = isRutaOv || contextoParam === 'ov' || Boolean(ovParam);
  const isModoFacturaOv = contextoParam === 'factura-ov' && Boolean(origenParam);
  const isModoLibreSinOv = esTipoEmisionSinOv(tipoParam);
  /** Sin factura-ov ni draft ni NC/ND/GUía: hay que elegir OV del usuario. */
  const needsOvPicker = !isModoOv && !isModoFacturaOv && !isModoLibreSinOv && !draftParam;

  useEffect(() => {
    if (contextoParam === 'factura-ov') return;
    if (location.pathname !== PATH_EMITIR_DTE) return;
    if (contextoParam !== 'ov' && !ovParam) return;
    navigate(pathWizardOv({
      ov: ovParam || undefined,
      draft: draftParam || undefined,
    }), { replace: true });
  }, [location.pathname, contextoParam, ovParam, draftParam, navigate]);

  const qc = useQueryClient();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const codigoPeriodo = usePeriodoScopeCodigo();
  const periodoVista = usePeriodoVista();
  const clientesQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'clientes'),
    queryFn: api.getClientes,
  });
  const clientes = clientesQ.data ?? [];
  const cuentasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'cuentas'),
    queryFn: api.getCuentas,
  });
  const insumosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'insumos'),
    queryFn: api.getInsumos,
  });
  const insumos = (insumosQ.data ?? []) as Insumo[];
  const [stockMap, setStockMap] = useState<Record<string, StockBodegaRow[]>>({});
  const [loadedEstado, setLoadedEstado] = useState<DocumentoComercial['estado'] | null>(null);
  const [origenOvId, setOrigenOvId] = useState('');
  const cuentaOptions = useMemo(() => {
    const flat = flattenCuentas((cuentasQ.data ?? []) as CuentaContable[]);
    return flat
      .filter((c) => !c.noImputable && c.activa !== false)
      .map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` }));
  }, [cuentasQ.data]);
  /** Cabecera solo para borradores antiguos / API contabilizar; la UI pide cuenta por ítem. */
  const [cuentaContableId, setCuentaContableId] = useState('');
  const [centroCostoId, setCentroCostoId] = useState('');
  const [saving, setSaving] = useState(false);
  /** Evita doble emisión mientras se navega al libro. */
  const [emitidoOk, setEmitidoOk] = useState(false);
  /** Borrador cargado desde bandeja (?draft=id). */
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftFolio, setDraftFolio] = useState<string | null>(null);
  const [draftWarning, setDraftWarning] = useState<string | null>(null);
  const [emitError, setEmitError] = useState<string | null>(null);

  const [step, setStep] = useState(1);
  const [tipoDocumento, setTipoDocumento] = useState<DocumentoComercial['tipo']>(
    isModoLibreSinOv ? (tipoParam as DocumentoComercial['tipo']) : 'FACTURA',
  );
  const [ovPickerSearch, setOvPickerSearch] = useState('');
  const [ovFacturar, setOvFacturar] = useState<DocumentoComercial | null>(null);
  const [ovFacturarBusy, setOvFacturarBusy] = useState(false);
  const [formaPago, setFormaPago] = useState('CREDITO');
  const [fechaEmision, setFechaEmision] = useState(localIsoDate());
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [indicadorVenta, setIndicadorVenta] = useState('VENTA');
  const insumoOptions = useMemo(
    () => insumos.map((ins) => ({
      value: ins.id,
      label: labelInsumoSelector(ins, { mostrarPiso: indicadorVenta !== 'EXPORTACION' }),
    })),
    [insumos, indicadorVenta],
  );
  const [descuentoGlobalPct, setDescuentoGlobalPct] = useState(0);
  const [receptor, setReceptor] = useState<ReceptorData>({
    rut: '',
    razonSocial: '',
    giro: '',
    direccion: '',
    comuna: '',
    ciudad: '',
  });
  const [clienteId, setClienteId] = useState('');
  const [lookupHint, setLookupHint] = useState<LookupHint>('idle');
  const lastLookupKey = useRef('');
  const tcBcchTocadoRef = useRef(false);
  const [items, setItems] = useState<EmitirLineItem[]>([emptyEmitirLine()]);

  useEffect(() => {
    if (!insumos.length) return;
    setItems((rows) => {
      const next = aplicarDetalleDesdeInsumo(aplicarCuentaDesdeInsumo(rows, insumos), insumos);
      const same = next.length === rows.length
        && next.every((n, i) =>
          n.cuentaContableId === rows[i]?.cuentaContableId
          && n.detalle === rows[i]?.detalle
        );
      return same ? rows : next;
    });
  }, [insumos]);
  const [referenciaTipo, setReferenciaTipo] = useState('');
  const [referenciaFolio, setReferenciaFolio] = useState('');
  const [origenDteTipo, setOrigenDteTipo] = useState('');
  const [origenDteFolio, setOrigenDteFolio] = useState('');
  const [origenDteFecha, setOrigenDteFecha] = useState('');
  const [referenciaCod, setReferenciaCod] = useState<1 | 2 | 3 | ''>(3);
  const [origenModo, setOrigenModo] = useState<'erp' | 'manual'>('erp');
  const [observaciones, setObservaciones] = useState('');
  const [documentoOrigenId, setDocumentoOrigenId] = useState('');
  const [comex, setComex] = useState<ComexForm>(emptyComexForm);

  const applyComexDefaults = () => {
    setComex((prev) => aplicarDefaultsComex(prev));
    setReceptor((r) => ({
      ...r,
      rut: r.rut.trim() || RUT_EXPORTACION_EXTRANJERO,
    }));
  };

  const documentosQ = useQuery({
    queryKey: periodListQueryKey(scope, empresaId, codigoPeriodo, 'documentos'),
    queryFn: () => api.getDocumentos(),
    enabled: tipoDocumento === 'NC' || tipoDocumento === 'ND',
  });
  const tcBcchQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'dashboard-kpis'),
    queryFn: api.getDashboardKPIs,
    enabled: indicadorVenta === 'EXPORTACION',
    meta: { suppressErrorToastStatuses: [403] },
  });
  const tcBcchSugerido = useMemo(
    () => tcBcchSugeridoDesdeKpi(tcBcchQ.data, isoMonedaComex(comex.tpoMoneda)),
    [tcBcchQ.data, comex.tpoMoneda],
  );
  const docsOrigen = useMemo(
    () => docsOrigenNcNd(documentosQ.data ?? []),
    [documentosQ.data],
  );
  const origenOptions = useMemo(
    () => docsOrigen.map((d) => ({ value: d.id, label: labelOrigenNcNd(d) })),
    [docsOrigen],
  );
  // P1-9: saldo disponible de la factura origen (total - NCs previas no
  // anuladas), solo informativo en el front; el backend siempre revalida.
  const saldoOrigenNc = useMemo(() => {
    if (tipoDocumento !== 'NC' || !documentoOrigenId) return null;
    const docs = documentosQ.data ?? [];
    const orig = docs.find((d) => d.id === documentoOrigenId);
    if (!orig) return null;
    const totalDoc = (d: DocumentoComercial) => d.total ?? Number(d.neto) + (d.iva ?? Number(d.neto) * 0.19);
    const totalOrigen = totalDoc(orig);
    const ncsPrevias = docs
      .filter((d) => d.tipo === 'NC' && d.documentoOrigenId === documentoOrigenId && d.estado !== 'ANULADO')
      .reduce((acc, d) => acc + totalDoc(d), 0);
    return { totalOrigen, disponible: totalOrigen - ncsPrevias };
  }, [tipoDocumento, documentoOrigenId, documentosQ.data]);

  useEffect(() => {
    if (isModoOv) setTipoDocumento('ORDEN_VENTA');
    if (isModoFacturaOv) setTipoDocumento('FACTURA');
    if (isModoLibreSinOv) setTipoDocumento(tipoParam as DocumentoComercial['tipo']);
  }, [isModoOv, isModoFacturaOv, isModoLibreSinOv, tipoParam]);

  const ovsMiasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'ordenes-venta-mias-facturables', user?.id ?? ''),
    queryFn: async () => {
      const docs = await api.getDocumentos({
        mias: true,
        tipo: 'ORDEN_VENTA',
        estado: 'CONFIRMADA,EMITIDO',
      }) as DocumentoComercial[];
      return filterOvsMiasFacturables(docs, user?.id);
    },
    enabled: needsOvPicker && Boolean(user?.id),
  });

  const ovsMiasFiltradas = useMemo(() => {
    const q = ovPickerSearch.trim().toLowerCase();
    const rows = [...(ovsMiasQ.data ?? [])]
      .filter((d) => periodoVista.inVista(d.fecha))
      .sort(
        (a, b) => folioInternoSortValue(b.folio) - folioInternoSortValue(a.folio),
      );
    if (!q) return rows;
    return rows.filter((d) => {
      const hay = `${d.folio} ${d.cliente} ${d.creadoPorNombre ?? ''} ${d.receptorRut ?? ''} ${d.estado} ${labelEstadoOv(d.estado)} ${labelIndicadorVenta(d.indicadorVenta)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [ovsMiasQ.data, ovPickerSearch, periodoVista.todo, periodoVista.codigo]);

  const elegirOvParaFacturar = (row: DocumentoComercial) => {
    if (!ovEsFacturable(row.estado)) {
      toast.error('Guarde la OV primero (valida stock). Luego facture desde aquí.');
      return;
    }
    setOvFacturar(row);
    void api.getDocumento(row.id).then((full) => {
      setOvFacturar(full as DocumentoComercial);
    }).catch(() => {
      /* el listado ya trae cabecera; el detalle de líneas es opcional */
    });
  };

  const confirmarFacturarOv = async () => {
    const ov = ovFacturar;
    if (!ov?.id) return;
    setOvFacturarBusy(true);
    setSaving(true);
    try {
      const res = await api.convertirDocumento(ov.id, { tipoDestino: 'FACTURA' }) as {
        convertido?: DocumentoComercial;
      };
      const factura = res.convertido;
      if (!factura?.id) {
        throw new Error('No se pudo crear la factura desde la OV');
      }
      const emitido = await api.emitirDocumentoFiscal(factura.id) as DocumentoComercial;
      await invalidateOvQueries();
      const folioSii = await resolverFolioSiiParaLibro(emitido, api);
      const tipoDte = mapTipoDteErp(emitido.tipo, emitido.indicadorVenta);
      toast.success(
        folioSii
          ? `Factura folio SII ${folioSii} emitida. Asigne cuentas en Libro de ventas.`
          : `Factura ${emitido.folio} enviada al facturador. Queda por contabilizar en Libro de ventas.`,
      );
      setOvFacturar(null);
      navigate(pathLibroVentas(folioSii, tipoDte));
    } catch (e) {
      const msg = mensajeErrorEmisionDte(e, { quedoBorrador: true });
      toast.error(msg, TOAST_EMIT_DTE_OPTS);
    } finally {
      setOvFacturarBusy(false);
      setSaving(false);
    }
  };

  const invalidateOvQueries = async () => {
    await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'ordenes-venta') });
    await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'documentos') });
    await qc.invalidateQueries({
      queryKey: periodListQueryKey(scope, empresaId, codigoPeriodo, 'documentos-borradores'),
    });
  };

  const loadStock = async (insumoId: string) => {
    if (!insumoId || stockMap[insumoId]) return;
    try {
      const st = await api.getInsumoStockBodegas(insumoId);
      setStockMap((s) => ({ ...s, [insumoId]: st.bodegas }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cargar stock');
    }
  };

  const hydrateDocumento = (
    doc: DocumentoComercial,
    opts?: { bloquearProductos?: boolean; skipTipo?: boolean },
  ) => {
    const cab = applyDocumentoCabecera(doc, clientes);
    setDraftId(cab.draftId);
    setDraftFolio(cab.draftFolio);
    setLoadedEstado(cab.loadedEstado);
    if (!opts?.skipTipo) setTipoDocumento(cab.tipoDocumento);
    setFechaEmision(cab.fechaEmision);
    setFechaVencimiento(cab.fechaVencimiento);
    setFormaPago(cab.formaPago);
    setIndicadorVenta(cab.indicadorVenta);
    setDescuentoGlobalPct(cab.descuentoGlobalPct);
    setClienteId(cab.clienteId);
    setCuentaContableId(cab.cuentaContableId);
    setCentroCostoId(cab.centroCostoId);
    setReferenciaTipo(esTipoDteReferencia(cab.referenciaTipo) ? '' : cab.referenciaTipo);
    setReferenciaFolio(esTipoDteReferencia(cab.referenciaTipo) ? '' : cab.referenciaFolio);
    if (esTipoDteReferencia(cab.referenciaTipo)) {
      setOrigenDteTipo(cab.referenciaTipo);
      setOrigenDteFolio(cab.referenciaFolio);
      setOrigenDteFecha(cab.comex.referenciaFecha || '');
      setOrigenModo(cab.documentoOrigenId ? 'erp' : 'manual');
    } else {
      setOrigenDteTipo('');
      setOrigenDteFolio('');
      setOrigenDteFecha('');
      setOrigenModo(cab.documentoOrigenId ? 'erp' : 'erp');
    }
    setReferenciaCod(cab.referenciaCod ?? 3);
    setObservaciones(cab.observaciones);
    setDocumentoOrigenId(cab.documentoOrigenId);
    tcBcchTocadoRef.current = Boolean(String(cab.comex.tipoCambio ?? '').trim());
    setComex(cab.comex);
    setReceptor(cab.receptor);
    if (cab.clienteId) {
      setLookupHint('found');
      lastLookupKey.current = normalizeRutKey(cab.receptor.rut || '');
    } else {
      setLookupHint('not_found');
    }
    const lineas = aplicarDetalleDesdeInsumo(
      aplicarCuentaDesdeInsumo(
        docLineasToEmitirItems(doc.lineas, {
          cuentaContableId: doc.cuentaContableId,
          centroCostoId: doc.centroCostoId,
          bloquearProductos: opts?.bloquearProductos,
        }),
        insumos,
      ),
      insumos,
    );
    setItems(lineas);
    if (isModoOv) {
      lineas.filter((l) => l.tipoLinea === 'PRODUCTO' && l.insumoId).forEach((l) => {
        void loadStock(l.insumoId);
      });
    }
    const paso = searchParams.get('paso');
    setStep(paso === '2' || paso === '3' ? Number(paso) : 1);
    setEmitidoOk(false);
  };

  const resetWizard = () => {
    setStep(1);
    setTipoDocumento('FACTURA');
    setFormaPago('CREDITO');
    setFechaEmision(localIsoDate());
    setFechaVencimiento('');
    setIndicadorVenta('VENTA');
    setDescuentoGlobalPct(0);
    setClienteId('');
    setLookupHint('idle');
    lastLookupKey.current = '';
    setCuentaContableId('');
    setCentroCostoId('');
    setReceptor({
      rut: '',
      razonSocial: '',
      giro: '',
      direccion: '',
      comuna: '',
      ciudad: '',
    });
    setItems([emptyEmitirLine()]);
    setReferenciaTipo('');
    setReferenciaFolio('');
    setObservaciones('');
    setDocumentoOrigenId('');
    tcBcchTocadoRef.current = false;
    setComex(emptyComexForm());
    setEmitidoOk(false);
    setDraftId(null);
    setDraftFolio(null);
    setDraftWarning(null);
    setEmitError(null);
    setLoadedEstado(null);
    setOrigenOvId('');
    setStockMap({});
    if (isModoOv) {
      navigate(pathWizardOv(), { replace: true });
      return;
    }
    if (searchParams.has('draft') || searchParams.has('ov') || searchParams.has('contexto')) {
      navigate(PATH_EMITIR_DTE, { replace: true });
      return;
    }
    if (searchParams.has('draft')) {
      const next = new URLSearchParams(searchParams);
      next.delete('draft');
      setSearchParams(next, { replace: true });
    }
  };
  void resetWizard;

  useEffect(() => {
    const loadId = ovParam || draftParam;
    if (!loadId && !isModoFacturaOv) return;
    let cancelled = false;

    const fail = (msg: string, target = PATH_EMITIR_DTE) => {
      toast.error(msg);
      navigate(target, { replace: true });
    };

    (async () => {
      try {
        if (isModoFacturaOv) {
          const origen = await api.getDocumento(origenParam) as DocumentoComercial;
          if (cancelled) return;
          if (origen.tipo !== 'ORDEN_VENTA') {
            fail('El origen debe ser una orden de venta confirmada');
            return;
          }
          if (origen.empresaId && origen.empresaId !== empresaId) {
            fail(`Esta OV es de otra empresa (${origen.empresaNombre ?? origen.empresaId}).`);
            return;
          }
          setOrigenOvId(origen.id);
          setDocumentoOrigenId(origen.id);
          setTipoDocumento('FACTURA');

          if (draftParam) {
            const facturaDraft = await api.getDocumento(draftParam) as DocumentoComercial;
            if (cancelled) return;
            const facturaPendienteDte =
              facturaDraft.tipo === 'FACTURA'
              && (
                facturaDraft.estado === 'BORRADOR'
                || (
                  facturaDraft.estado === 'EMITIDO'
                  && !facturaDraft.billingEmissionId
                  && !facturaDraft.asientoOriginal
                )
              );
            if (!facturaPendienteDte) {
              fail('El borrador de factura no es válido');
              return;
            }
            hydrateDocumento(mergeFacturaDraftConOv(origen, facturaDraft), {
              bloquearProductos: true,
              skipTipo: true,
            });
            setTipoDocumento('FACTURA');
            setOrigenOvId(origen.id);
            setDocumentoOrigenId(origen.id);
            toast.success(`Factura borrador ${facturaDraft.folio} cargada desde OV ${origen.folio}`);
          } else {
            hydrateDocumento(origen, { bloquearProductos: true, skipTipo: true });
            setTipoDocumento('FACTURA');
            setOrigenOvId(origen.id);
            setDocumentoOrigenId(origen.id);
            setDraftId(null);
            setDraftFolio(null);
            setLoadedEstado(null);
            toast.success(`Factura desde OV ${origen.folio} — cantidades bloqueadas`);
          }
          return;
        }

        if (!loadId) return;
        const doc = await api.getDocumento(loadId) as DocumentoComercial;
        if (cancelled) return;

        if (doc.empresaId && doc.empresaId !== empresaId) {
          fail(`Este documento es de otra empresa (${doc.empresaNombre ?? doc.empresaId}).`);
          return;
        }

        const isOvDoc = doc.tipo === 'ORDEN_VENTA';
        const ovMode = isModoOv || ovParam;

        if (isOvDoc && ovMode) {
          if (ovParam && doc.estado !== 'BORRADOR' && !loadedEstado) {
            // Permitir cargar OV en cualquier estado para acciones (confirmar/facturar)
          } else if (draftParam && doc.estado !== 'BORRADOR') {
            fail('Solo se pueden editar órdenes de venta en borrador', pathWizardOv());
            return;
          }
          const warnings: string[] = [];
          if (!fechaEnPeriodo(doc.fecha, codigoPeriodo)) {
            warnings.push(
              `Periodo (${doc.fecha.slice(0, 7)}) distinto al mes contable activo (${codigoPeriodo}).`,
            );
          }
          setDraftWarning(warnings.length ? warnings.join(' ') : null);
          hydrateDocumento(doc);
          if (warnings.length) toast.warning(warnings.join(' '));
          else toast.success(
            doc.estado === 'BORRADOR'
              ? `Orden de venta ${doc.folio} cargada`
              : `OV ${doc.folio} (${labelEstadoOv(doc.estado)})`,
          );
          if (ovParam && !searchParams.get('contexto')) {
            const next = new URLSearchParams(searchParams);
            next.set('contexto', 'ov');
            next.set('ov', ovParam);
            setSearchParams(next, { replace: true });
          }
          return;
        }

        if (isOvDoc && !ovMode) {
          navigate(pathWizardOv({ draft: doc.id }), { replace: true });
          return;
        }

        if (!draftParam) return;
        if (doc.estado !== 'BORRADOR') {
          fail('Solo se pueden cargar documentos en borrador');
          return;
        }
        // Factura borrador: debe venir de OV (factura-ov). Sin origen → selector.
        if (doc.tipo === 'FACTURA') {
          const origenId = doc.documentoOrigenId?.trim();
          if (origenId) {
            navigate(pathEmitirFacturaOv(origenId, { draft: doc.id }), { replace: true });
            return;
          }
          fail(
            'Debe facturar desde una orden de venta confirmada (stock descontado).',
            PATH_EMITIR_DTE,
          );
          return;
        }
        if (!esTipoEmision(doc.tipo)) {
          fail(
            'Este borrador no es un documento de emisión (NC, ND o Guía). Use Compras u Órdenes de venta.',
          );
          return;
        }
        const warnings: string[] = [];
        if (!fechaEnPeriodo(doc.fecha, codigoPeriodo)) {
          warnings.push(
            `Periodo del borrador (${doc.fecha.slice(0, 7)}) distinto al mes contable activo (${codigoPeriodo}).`,
          );
        }
        setDraftWarning(warnings.length ? warnings.join(' ') : null);
        hydrateDocumento(doc);
        if (warnings.length) toast.warning(warnings.join(' '));
        else toast.success(`Borrador ${doc.folio} cargado`);
        // NC/ND/GUÍA: marcar tipo libre en URL para no caer al selector al limpiar draft.
        if (esTipoEmisionSinOv(doc.tipo) && !tipoParam) {
          setSearchParams(
            { draft: doc.id, tipo: doc.tipo },
            { replace: true },
          );
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'No se pudo cargar el documento');
          navigate(isModoOv ? pathWizardOv() : PATH_EMITIR_DTE, { replace: true });
        }
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hidratar por params de URL
  }, [draftParam, ovParam, origenParam, isModoFacturaOv, isModoOv, empresaId, codigoPeriodo]);

  const clienteOptions = useMemo(
    () => clientes
      .filter((c) => c.activo !== false)
      .map((c) => ({ value: c.id, label: `${c.rut} · ${c.razonSocial}` })),
    [clientes],
  );

  const itemsActivos = useMemo(
    () => itemsParaCorreccion(items, tipoDocumento),
    [items, tipoDocumento],
  );

  const monedaExportIso = indicadorVenta === 'EXPORTACION' ? isoMonedaComex(comex.tpoMoneda) : '';

  const totals = useMemo(() => {
    const subtotal = itemsActivos.reduce((acc, it) => acc + lineSubtotal(it), 0);
    const montoDescuento = subtotal * (descuentoGlobalPct / 100);
    const neto = subtotal - montoDescuento;
    // Consistente con backend (esIndicadorExento): EXPORTACION / EXENTO sin IVA.
    const sinIva = indicadorVenta === 'EXPORTACION' || indicadorVenta === 'EXENTO';
    const iva = sinIva ? 0 : neto * 0.19;
    const exento = sinIva ? neto : 0;
    const total = neto + iva;
    return { subtotal, descuentoGlobalPct, montoDescuento, neto, iva, exento, total };
  }, [itemsActivos, descuentoGlobalPct, indicadorVenta]);

  const panelTotales = useMemo(
    () => resumenPanelTotales({
      indicadorVenta,
      totals,
      comex,
      items: itemsActivos,
      clienteNombre: receptor.razonSocial,
    }),
    [indicadorVenta, totals, comex, itemsActivos, receptor.razonSocial],
  );

  const montosComexCajas = useMemo(
    () => montosComexDesdeCajas(itemsActivos, parseComexNumero(comex.tipoCambio)),
    [itemsActivos, comex.tipoCambio],
  );

  useEffect(() => {
    if (indicadorVenta !== 'EXPORTACION') return;
    setComex((prev) => patchComexSoloMontos(prev, itemsActivos, parseComexNumero(prev.tipoCambio)));
  }, [indicadorVenta, itemsActivos, comex.tipoCambio]);

  useEffect(() => {
    if (indicadorVenta !== 'EXPORTACION') return;
    const tc = comex.tipoCambio.trim();
    if (!tc) return;
    setObservaciones((prev) => {
      const next = prefijarObservacionTc(prev, tc);
      return next === prev ? prev : next;
    });
  }, [indicadorVenta, comex.tipoCambio]);

  useEffect(() => {
    if (indicadorVenta !== 'EXPORTACION') return;
    const next = aplicarTipoCambioSugerido(
      comex.tipoCambio,
      tcBcchSugerido,
      tcBcchTocadoRef.current,
    );
    if (next == null) return;
    setComex((c) => (c.tipoCambio.trim() ? c : { ...c, tipoCambio: next }));
  }, [indicadorVenta, tcBcchSugerido, comex.tipoCambio]);

  const fillReceptorFromCliente = (c: Cliente) => {
    setClienteId(c.id);
    setReceptor(receptorFromCliente(c));
    lastLookupKey.current = normalizeRutKey(c.rut);
    setLookupHint('found');
  };

  const limpiarReceptorSinCliente = (rut: string) => {
    setClienteId('');
    setReceptor({
      rut,
      razonSocial: '',
      giro: '',
      direccion: '',
      comuna: '',
      ciudad: '',
    });
  };


  const updateItem = (id: string, patch: Partial<EmitirLineItem>) => {
    setItems((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const updateSplits = (id: string, splits: EmitirLineItem['splits']) => {
    setItems((rows) => rows.map((r) => {
      if (r.id !== id) return r;
      const suma = splits.reduce((acc, sp) => acc + (Number(sp.cantidad) || 0), 0);
      const cantidad = splits.length > 1
        ? suma
        : (Number(splits[0]?.cantidad) || r.cantidad);
      return { ...r, splits, cantidad };
    }));
  };

  const addItem = () => setItems((rows) => [...rows, emptyEmitirLine()]);
  const removeItem = (id: string) => setItems((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)));

  const validateStep = (s: number) => {
    if (s === 1) {
      if (clientesQ.isError) {
        toast.error('No se puede continuar porque falló la consulta de clientes.');
        return false;
      }
      const fiscalId = validateFiscalId(receptor.rut, {
        demoMode,
        allowForeign: indicadorVenta === 'EXPORTACION',
      });
      if (!fiscalId.valid) {
        toast.error(fiscalId.error ?? 'Identificador fiscal inválido.');
        return false;
      }
      if (!fechaEmision || (!draftId && !fechaEnPeriodo(fechaEmision, codigoPeriodo))) {
        toast.error(`La fecha de emisión debe pertenecer al periodo activo ${codigoPeriodo}.`);
        return false;
      }
      if (fechaVencimiento && fechaVencimiento < fechaEmision) {
        toast.error('La fecha de vencimiento no puede ser anterior a la fecha de emisión.');
        return false;
      }
      if (!clienteId) {
        toast.error(MSG_CLIENTE_NO_REGISTRADO);
        return false;
      }
      if (!receptor.rut || !receptor.razonSocial) {
        toast.error('Complete el RUT y busque un cliente registrado');
        return false;
      }
      if (indicadorVenta !== 'EXPORTACION' && (!receptor.direccion.trim() || !receptor.comuna.trim())) {
        toast.error(
          'El cliente no tiene dirección fiscal y comuna. Complételos en Ventas › Clientes (el SII rechaza el DTE sin esos datos).',
        );
        return false;
      }
      if (tipoDocumento === 'NC' || tipoDocumento === 'ND') {
        const manualOk = referenciaManualCompleta({
          tipo: origenDteTipo,
          folio: origenDteFolio,
          fecha: origenDteFecha,
          codRef: referenciaCod === '' ? null : referenciaCod,
        });
        if (origenModo === 'erp' && !documentoOrigenId && !manualOk) {
          toast.error('Busque el documento origen o use Registro manual (tipo SII, folio, fecha y CodRef)');
          return false;
        }
        if (origenModo === 'manual' && !manualOk) {
          toast.error('Registro manual: indique tipo SII, folio, fecha y CodRef del documento referenciado');
          return false;
        }
        if (referenciaCod !== 1 && referenciaCod !== 2 && referenciaCod !== 3) {
          toast.error('Seleccione el CodRef (1 anula, 2 texto, 3 montos)');
          return false;
        }
      }
    }
    if (s === 2) {
      if (insumosQ.isError) {
        toast.error('No se puede continuar porque falló la carga de catálogos requeridos.');
        return false;
      }
      if (isModoOv) {
        const detalle = items.filter((it) => it.insumoId || it.descripcion.trim() || it.tipoLinea === 'FLETE');
        if (!detalle.length) {
          toast.error('Agregue al menos una línea');
          return false;
        }
        for (const it of detalle) {
          if (it.tipoLinea === 'PRODUCTO') {
            if (!it.insumoId) {
              toast.error('Cada producto debe seleccionar un artículo del catálogo');
              return false;
            }
            const splits = splitsParaValidar(it);
            const splitQty = splits.reduce((a, s) => a + (Number(s.cantidad) || 0), 0);
            if (Math.abs(splitQty - it.cantidad) > 0.0001) {
              toast.error(
                `La suma por bodega (${fmtNumber(splitQty)}) debe coincidir con la cantidad de la línea (${fmtNumber(it.cantidad)}). El número en la lista de bodegas es stock disponible, no lo que se vende.`,
              );
              return false;
            }
            if (splits.some((s) => !s.bodegaId || Number(s.cantidad) <= 0)) {
              toast.error('Indique bodega de salida para cada producto');
              return false;
            }
            const stocks = it.insumoId ? (stockMap[it.insumoId] ?? []) : [];
            for (const s of splits) {
              const st = stocks.find((b) => b.bodegaId === s.bodegaId);
              const disp = st ? stockDisponibleRow(st) : 0;
              if (st && Number(s.cantidad) > disp + 1e-9) {
                toast.error(
                  `Stock insuficiente en ${st.codigo}: disponible ${fmtNumber(disp)}, a vender ${fmtNumber(Number(s.cantidad))}`,
                );
                return false;
              }
            }
          }
          if (it.precioUnitario <= 0 && it.tipoLinea !== 'FLETE') {
            toast.error('Indique precio en cada línea');
            return false;
          }
          if (it.tipoLinea === 'PRODUCTO' && indicadorVenta !== 'EXPORTACION') {
            const ins = insumos.find((x) => x.id === it.insumoId);
            const piso = pisoPrecioVentaInsumo(ins);
            if (violaPisoPrecioVenta(it.precioUnitario, piso)) {
              toast.error(
                mensajePrecioBajoPiso(ins?.codigo || it.codigoProducto || 'artículo', piso),
                TOAST_EMIT_DTE_OPTS,
              );
              return false;
            }
          }
        }
        return true;
      }
      const valid = itemsActivos.some((it) => it.insumoId && it.precioUnitario > 0);
      if (!valid) {
        toast.error(
          esTipoCorreccionNcNd(tipoDocumento)
            ? 'Incluya al menos una línea de la factura origen en la corrección'
            : 'Agregue al menos un ítem del catálogo con precio',
        );
        return false;
      }
      const sinCatalogo = itemsActivos.filter((it) => it.precioUnitario > 0 && !it.insumoId);
      if (sinCatalogo.length) {
        toast.error('Cada línea debe seleccionar un artículo del catálogo');
        return false;
      }
      if (indicadorVenta !== 'EXPORTACION') {
        for (const it of itemsActivos) {
          if (it.tipoLinea !== 'PRODUCTO' || !it.insumoId) continue;
          const ins = insumos.find((x) => x.id === it.insumoId);
          const piso = pisoPrecioVentaInsumo(ins);
          if (violaPisoPrecioVenta(it.precioUnitario, piso)) {
            toast.error(
              mensajePrecioBajoPiso(ins?.codigo || it.codigoProducto || 'artículo', piso),
              TOAST_EMIT_DTE_OPTS,
            );
            return false;
          }
        }
      }
      // P1-9: aviso temprano en el front; el backend siempre revalida el saldo.
      if (tipoDocumento === 'NC' && saldoOrigenNc && totals.total > saldoOrigenNc.disponible + 1) {
        toast.error(
          `La NC (${fmtCLP(totals.total)}) supera el saldo disponible de la factura origen `
          + `(${fmtCLP(Math.max(saldoOrigenNc.disponible, 0))})`,
        );
        return false;
      }
    }
    if (s === 3 && indicadorVenta === 'EXPORTACION') {
      const huecos = huecosComexFactura110(comex, montosComexCajas.cajas);
      if (huecos.length) {
        toast.error(mensajeHuecosComexManual(huecos));
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(3, s + 1));
  };

  const goPrev = () => setStep((s) => Math.max(1, s - 1));

  const applyOrigenErp = (id: string) => {
    setDocumentoOrigenId(id);
    setOrigenModo('erp');
    const orig = docsOrigen.find((d) => d.id === id);
    if (!orig) return;
    const sii = referenciaSiiDesdeOrigen(orig);
    setOrigenDteTipo(sii.tipo);
    setOrigenDteFolio(sii.folio);
    setOrigenDteFecha(sii.fecha);
    if (referenciaCod === '') setReferenciaCod(3);
    const inherited = comexDesdeFacturaOrigen(orig);
    if (inherited) {
      setIndicadorVenta(inherited.indicadorVenta);
      setOrigenDteTipo(inherited.referencia.tipo);
      setOrigenDteFolio(inherited.referencia.folio);
      setOrigenDteFecha(inherited.referencia.fecha);
      tcBcchTocadoRef.current = Boolean(String(inherited.comex.tipoCambio ?? '').trim());
      setComex(inherited.comex);
    } else {
      setIndicadorVenta(orig.indicadorVenta ?? 'VENTA');
    }
    const cli = orig.clienteId
      ? clientes.find((c) => c.id === orig.clienteId)
      : clientes.find((c) => orig.receptorRut && rutsMatch(c.rut, orig.receptorRut));
    if (cli) {
      fillReceptorFromCliente(cli);
    } else if (orig.clienteId) {
      setClienteId(orig.clienteId);
      setReceptor({
        rut: orig.receptorRut
          || ((orig.indicadorVenta || '').toUpperCase() === 'EXPORTACION'
            ? RUT_EXPORTACION_EXTRANJERO
            : ''),
        razonSocial: orig.cliente,
        giro: orig.receptorGiro ?? '',
        direccion: orig.receptorDireccion ?? '',
        comuna: orig.receptorComuna ?? '',
        ciudad: orig.receptorCiudad ?? '',
      });
      setLookupHint('found');
    } else {
      limpiarReceptorSinCliente(orig.receptorRut ?? '');
      setLookupHint('not_found');
    }
    if (orig.lineas?.length) {
      setItems(aplicarDetalleDesdeInsumo(
        docLineasToEmitirItems(orig.lineas, {
          cuentaContableId: orig.cuentaContableId,
          centroCostoId: orig.centroCostoId,
        }),
        insumos,
      ));
    }
  };

  const persistDocument = async (estado: DocumentoComercial['estado'], contabilizar = false) => {
    if (!validateStep(1) || !validateStep(2)) return undefined;
    if (contabilizar && !validateStep(3)) return undefined;
    if (isModoOv) {
      return persistOvDocument();
    }
    if (tipoDocumento === 'FACTURA' && !isModoFacturaOv) {
      toast.error(
        'Debe facturar desde una orden de venta confirmada (stock descontado).',
      );
      navigate(PATH_EMITIR_DTE);
      return undefined;
    }
    setSaving(true);
    if (contabilizar) setEmitError(null);
    let saved: DocumentoComercial | undefined;
    try {
      // P1-8: correlativo sugerido en base a los folios existentes de la
      // empresa (evita las colisiones frecuentes del Math.random() anterior).
      let folio = draftFolio;
      if (!folio) {
        try {
          const docs = await qc.ensureQueryData({
            queryKey: listQueryKey(scope, empresaId, 'documentos'),
            queryFn: () => api.getDocumentos(),
          });
          folio = sugerirSiguienteFolio((docs ?? []).map((d) => d.folio), 8000);
        } catch {
          folio = sugerirSiguienteFolio([], 8000);
        }
      }
      const payload = {
        folio,
        tipo: tipoDocumento,
        cliente: receptor.razonSocial,
        clienteId: clienteId || undefined,
        fecha: fechaEmision,
        neto: Math.round(totals.neto),
        iva: Math.round(totals.iva),
        estado: contabilizar ? 'BORRADOR' : estado,
        formaPago,
        fechaVencimiento: fechaVencimiento || '',
        indicadorVenta,
        descuentoGlobalPct,
        cuentaContableId: itemsActivos.find((it) => it.cuentaContableId)?.cuentaContableId || cuentaContableId || '',
        centroCostoId: centroCostoId || '',
        receptorRut: receptor.rut.trim(),
        receptorGiro: receptor.giro.trim(),
        receptorDireccion: receptor.direccion.trim(),
        receptorComuna: receptor.comuna.trim(),
        receptorCiudad: receptor.ciudad.trim(),
        referenciaTipo: (tipoDocumento === 'NC' || tipoDocumento === 'ND')
          ? (origenDteTipo || '')
          : (referenciaTipo || ''),
        referenciaFolio: (tipoDocumento === 'NC' || tipoDocumento === 'ND')
          ? origenDteFolio.trim()
          : referenciaFolio.trim(),
        ...(tipoDocumento === 'NC' || tipoDocumento === 'ND'
          ? {
              referenciaFecha: origenDteFecha || undefined,
              referenciaCod: referenciaCod === '' ? undefined : referenciaCod,
            }
          : {}),
        observaciones: observaciones.trim(),
        ...(indicadorVenta === 'EXPORTACION'
          ? payloadComexDesdeWizard(comex, montosComexCajas)
          : {}),
        ...(tipoDocumento === 'NC' || tipoDocumento === 'ND'
          ? {
              documentoOrigenId: origenModo === 'erp' && documentoOrigenId
                ? documentoOrigenId
                : undefined,
            }
          : {}),
        ...(isModoFacturaOv && origenOvId ? { documentoOrigenId: origenOvId } : {}),
        lineas: emitirItemsToEmisionPayloadLineas(itemsActivos),
      };
      const row = (
        draftId
          ? await api.updateDocumento(draftId, payload)
          : await api.createDocumento(payload)
      ) as DocumentoComercial;
      saved = row;
      if (row?.id) {
        setDraftId(row.id);
        setDraftFolio(row.folio);
      }
      if (contabilizar && row?.id) {
        const emitted = await api.emitirDocumentoFiscal(row.id) as DocumentoComercial;
        saved = emitted ?? row;
        await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'documentos') });
        await qc.invalidateQueries({
          queryKey: periodListQueryKey(scope, empresaId, codigoPeriodo, 'documentos-borradores'),
        });
        await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'clientes') });
        if (isModoFacturaOv) await invalidateOvQueries();
        return saved;
      }
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'documentos') });
      await qc.invalidateQueries({
        queryKey: periodListQueryKey(scope, empresaId, codigoPeriodo, 'documentos-borradores'),
      });
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'clientes') });
      if (isModoFacturaOv) await invalidateOvQueries();
      return row;
    } catch (e) {
      if (contabilizar) {
        const msg = mensajeErrorEmisionDte(e, { quedoBorrador: Boolean(saved?.id) });
        setEmitError(msg);
        toast.error(msg, TOAST_EMIT_DTE_OPTS);
      } else {
        toast.error(e instanceof Error ? e.message : 'Error al guardar documento');
      }
      return undefined;
    } finally {
      setSaving(false);
    }
  };

  const persistOvDocument = async () => {
    if (!validateStep(1) || !validateStep(2)) return undefined;
    setSaving(true);
    try {
      const detalle = emitirItemsToOvPayloadLineas(items);
      let folio = draftFolio;
      if (!folio) {
        try {
          const docs = await qc.ensureQueryData({
            queryKey: listQueryKey(scope, empresaId, 'ordenes-venta'),
            queryFn: async () => {
              const all = await api.getDocumentos();
              return (all as DocumentoComercial[]).filter((d) => d.tipo === 'ORDEN_VENTA');
            },
          });
          folio = sugerirSiguienteFolio((docs ?? []).map((d) => d.folio));
        } catch {
          folio = sugerirSiguienteFolio([]);
        }
      }
      const payload = {
        folio,
        tipo: 'ORDEN_VENTA' as const,
        cliente: receptor.razonSocial,
        clienteId: clienteId || undefined,
        fecha: fechaEmision,
        neto: Math.round(totals.neto),
        iva: Math.round(totals.iva),
        estado: (loadedEstado && ovEsFacturable(loadedEstado) ? loadedEstado : 'BORRADOR') as DocumentoComercial['estado'],
        formaPago,
        fechaVencimiento: fechaVencimiento || '',
        indicadorVenta,
        descuentoGlobalPct,
        receptorRut: receptor.rut.trim(),
        receptorGiro: receptor.giro.trim(),
        receptorDireccion: receptor.direccion.trim(),
        receptorComuna: receptor.comuna.trim(),
        receptorCiudad: receptor.ciudad.trim(),
        referenciaTipo: referenciaTipo || '',
        referenciaFolio: referenciaFolio.trim(),
        observaciones: observaciones.trim(),
        lineas: detalle,
        ...(indicadorVenta === 'EXPORTACION'
          ? payloadComexDesdeWizard(comex, montosComexCajas)
          : {}),
      };
      const row = (
        draftId
          ? await api.updateDocumento(draftId, payload)
          : await api.createDocumento(payload)
      ) as DocumentoComercial;
      setDraftId(row.id);
      setDraftFolio(row.folio);
      setLoadedEstado(row.estado);
      if (ovParam !== row.id) {
        setSearchParams({ contexto: 'ov', ov: row.id }, { replace: true });
      }
      await invalidateOvQueries();
      return row;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar orden de venta', TOAST_EMIT_DTE_OPTS);
      return undefined;
    } finally {
      setSaving(false);
    }
  };

  const ensureOvSaved = async () => {
    if (formEditableOv) {
      const row = await persistOvDocument();
      return row?.id;
    }
    return draftId ?? undefined;
  };

  const handleOvGuardar = async () => {
    if (!validateStep(1) || !validateStep(2)) return;
    if (indicadorVenta === 'EXPORTACION' && !validateStep(3)) return;
    const row = await persistOvDocument();
    if (!row) return;
    if (loadedEstado && ovEsFacturable(loadedEstado)) {
      toast.success(`Orden de venta ${row.folio} actualizada`);
      await invalidateOvQueries();
      navigate(PATH_EMITIR_DTE);
      return;
    }
    setSaving(true);
    try {
      await api.confirmarOrdenVenta(row.id);
      toast.success(`Orden de venta ${row.folio} guardada`);
      await invalidateOvQueries();
      navigate('/comercial/ordenes-venta');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No hay stock suficiente para guardar', TOAST_EMIT_DTE_OPTS);
    } finally {
      setSaving(false);
    }
  };

  const handleOvConfirmar = async () => {
    const id = await ensureOvSaved();
    if (!id) return;
    setSaving(true);
    try {
      const updated = await api.confirmarOrdenVenta(id) as DocumentoComercial;
      setLoadedEstado(updated?.estado ?? 'CONFIRMADA');
      toast.success(`OV ${draftFolio ?? updated?.folio ?? ''} confirmada (stock descontado)`);
      await invalidateOvQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo confirmar', TOAST_EMIT_DTE_OPTS);
    } finally {
      setSaving(false);
    }
  };

  const handleOvFacturar = async () => {
    const id = draftId;
    if (!id) {
      toast.error('Guarde la orden antes de facturar');
      return;
    }
    setSaving(true);
    try {
      const res = await api.convertirDocumento(id, { tipoDestino: 'FACTURA' }) as {
        convertido?: DocumentoComercial;
      };
      const factura = res.convertido;
      toast.success(`Factura ${factura?.folio ?? ''} creada (precio editable). En el wizard pulse Emitir para enviar al facturador.`);
      await invalidateOvQueries();
      if (factura?.id) {
        navigate(`${PATH_EMITIR_DTE}?contexto=factura-ov&origen=${encodeURIComponent(id)}&draft=${encodeURIComponent(factura.id)}`);
      } else {
        navigate(`${PATH_EMITIR_DTE}?contexto=factura-ov&origen=${encodeURIComponent(id)}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo facturar');
    } finally {
      setSaving(false);
    }
  };
  void handleOvConfirmar;
  void handleOvFacturar;

  const handleDraft = async () => {
    if (emitidoOk) return;
    if (isModoOv) {
      await handleOvGuardar();
      return;
    }
    const row = await persistDocument('BORRADOR');
    if (row) {
      toast.success(`Borrador ${row.folio} guardado. Puede completar COMEX y emitir, o retomarlo después.`);
    }
  };

  const handleEmit = async () => {
    if (emitidoOk) return;
    if (!validateStep(3)) return;
    const row = await persistDocument('EMITIDO', true);
    if (row) {
      setEmitidoOk(true);
      const folioPendiente = row.billingStatus === 'PENDING' && !row.folioOficial;
      const folioSii = await resolverFolioSiiParaLibro(row, api);
      toast.success(
        tipoDocumento === 'GUIA'
          ? `Guía ${row.folio} emitida (sin asiento contable)`
          : folioPendiente && !folioSii
            ? `Documento enviado al facturador. Queda por contabilizar en Libro de ventas.`
            : folioSii
              ? `Documento folio SII ${folioSii} emitido. Asigne cuentas en Libro de ventas.`
              : `Documento ${row.folio} emitido. Asigne cuentas en Libro de ventas.`,
      );
      navigate(pathLibroVentas(
        folioSii,
        mapTipoDteErp(row.tipo, row.indicadorVenta),
      ));
    }
  };

  const handlePreview = () => {
    if (!selectedEmpresa) {
      toast.error('Selecciona una empresa en el header');
      return;
    }
    const filas = itemsActivos.filter((it) => it.insumoId);
    if (!filas.length) {
      toast.error('Agregue al menos un ítem para previsualizar');
      return;
    }
    const refLabel = referenciaTipo === '801' ? 'OC'
      : referenciaTipo === '802' ? 'NP'
        : referenciaTipo || '';
    const obsParts = [
      `Forma de pago: ${formaPago}`,
      fechaVencimiento && `Vencimiento: ${fechaVencimiento}`,
      indicadorVenta && `Indicador: ${indicadorVenta}`,
      refLabel && referenciaFolio && `Ref. ${refLabel}: ${referenciaFolio}`,
      observaciones,
    ].filter(Boolean);
    try {
      printEmpresaDocumento({
        empresa: selectedEmpresa,
        kind: PREVIEW_KIND[tipoDocumento] ?? 'FACTURA',
        title: `${tipoLabel[tipoDocumento] ?? tipoDocumento} · Vista previa`,
        forceWatermark: 'BORRADOR',
        rows: [{
          folio: draftFolio ?? 'Automático',
          contraparte: receptor.razonSocial || '—',
          fecha: fechaEmision,
          neto: fmtCLP(totals.neto),
          netoNum: totals.neto,
          iva: fmtCLP(totals.iva),
          total: fmtCLP(totals.total),
          estado: 'BORRADOR',
          receptorRut: receptor.rut,
          receptorGiro: receptor.giro,
          receptorDireccion: receptor.direccion,
          receptorComuna: receptor.comuna,
          receptorCiudad: receptor.ciudad,
          observacion: obsParts.join('\n') || undefined,
          lineas: filas.map((it) => ({
            codigo: it.codigoProducto,
            descripcion: it.descripcion,
            cantidad: it.cantidad,
            unidad: it.unidadMedida,
            descuento: it.descuentoPct ? `${it.descuentoPct}%` : undefined,
            precioUnitario: fmtCLP(it.precioUnitario),
            total: fmtCLP(lineSubtotal(it)),
          })),
        }],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir la vista previa');
    }
  };

  const tipoLabel: Partial<Record<DocumentoComercial['tipo'], string>> = {
    OC: 'Orden de compra',
    FACTURA: 'Factura electrónica',
    NC: 'Nota de crédito',
    ND: 'Nota de débito',
    GUIA: 'Guía de despacho',
    ORDEN_VENTA: 'Orden de venta',
  };
  const emitirTipoLabel = tipoLabel[tipoDocumento] ?? tipoDocumento;

  const clienteRegistrado = Boolean(clienteId);
  const dependenciasError = clientesQ.isError
    || insumosQ.isError;
  const ovAcciones = ovAccionesVisibles(loadedEstado);
  const formEditableOv = isModoOv && ovFormularioEditable(loadedEstado);
  const pageTitle = isModoOv
    ? (draftId ? 'Editar orden de venta' : 'Nueva orden de venta')
    : isModoFacturaOv
      ? 'Factura electrónica'
      : needsOvPicker
        ? 'Seleccione orden de venta'
        : emitirTipoLabel;
  const pageBreadcrumbs = isModoOv
    ? ['Ventas']
    : ['Ventas', 'Emitir DTE', emitirTipoLabel];
  const pageSubtitle = isModoOv
    ? (ovFormularioEditable(loadedEstado) && loadedEstado && loadedEstado !== 'BORRADOR'
      ? 'Puede corregir ítems, precios y COMEX. Guardar reajusta el stock si cambian cantidades.'
      : 'Producto con stock por bodega. La cuenta contable se asigna en Libro de ventas después de facturar.')
    : isModoFacturaOv
      ? 'Factura desde OV confirmada. Cantidades y descuentos de productos bloqueados. La cuenta se asigna en Libro de ventas.'
      : needsOvPicker
        ? 'Debe facturar desde una orden de venta confirmada. Facturar emite el DTE; el lápiz abre la OV para editar.'
        : isModoLibreSinOv
          ? `Emisión de ${emitirTipoLabel.toLowerCase()}. La factura electrónica solo se emite desde una OV.`
          : 'Factura electrónica, NC, ND y guía. La orden de venta no es un DTE; la factura exige una OV confirmada.';

  const avisosEmitir = useMemo(() => {
    const items: string[] = [];
    if (needsOvPicker) {
                    items.push('Factura: confirme el resumen y se emite el DTE. El lápiz edita la OV.');
    } else if (isModoOv) {
      items.push('OV interna · no es DTE. Stock al confirmar.');
      if (loadedEstado === 'CONFIRMADA' || loadedEstado === 'APROBADO') {
        items.push('Confirmada: el lápiz permite editar antes de facturar.');
      } else if (loadedEstado && loadedEstado !== 'BORRADOR') {
        items.push(`Estado: ${labelEstadoOv(loadedEstado)}.`);
      }
    } else if (isModoFacturaOv) {
      items.push('Factura desde OV · cantidades fijas, precio editable.');
      if (origenOvId) items.push('Origen de la OV cargado.');
    } else {
      items.push(`${emitirTipoLabel} · la factura electrónica solo desde una OV confirmada.`);
    }
    if (periodoSesionDistintoDeHoy(codigoPeriodo)) {
      items.push(`Periodo de sesión ${codigoPeriodo}, no el mes calendario de hoy.`);
    }
    return items;
  }, [
    needsOvPicker, isModoOv, isModoFacturaOv, loadedEstado, origenOvId,
    emitirTipoLabel, codigoPeriodo,
  ]);

  useEffect(() => {
    const prev = document.title;
    document.title = isModoOv
      ? `${pageTitle} · Almahue ERP`
      : `${emitirTipoLabel} · Emitir DTE · Almahue ERP`;
    return () => {
      document.title = prev;
    };
  }, [isModoOv, pageTitle, emitirTipoLabel]);


  if (needsOvPicker) {
    return (
      <div className="-m-6 flex min-h-[calc(100vh-4rem)]">
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-6">
          <PageHeader
            title={pageTitle}
            breadcrumbs={pageBreadcrumbs}
            subtitle={pageSubtitle}
            action={isModoOv ? undefined : <BorradoresDocumentosButton />}
          />

          <AvisosEmitirStrip items={avisosEmitir} />

          <Card>
            <CardBody className="space-y-4">
              <div>
                <p className="mb-2 text-xs text-[var(--color-muted)]">
                  Otras emisiones (sin OV):
                </p>
                <div className="flex flex-wrap gap-2">
                  {TIPOS_EMISION_SIN_OV.map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(pathEmitirTipoLibre(t))}
                    >
                      {t === 'NC' ? 'Nota de crédito' : t === 'ND' ? 'Nota de débito' : 'Guía de despacho'}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/comercial/ordenes-venta')}
                  >
                    Ir a Órdenes de venta
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <Field label="Buscar OV" className="min-w-[16rem] flex-1">
                  <div className="relative">
                    <Search
                      size={14}
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
                    />
                    <Input
                      className="pl-8"
                      value={ovPickerSearch}
                      onChange={(e) => setOvPickerSearch(e.target.value)}
                      placeholder="Folio, cliente o RUT…"
                      aria-label="Buscar orden de venta"
                    />
                  </div>
                </Field>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void ovsMiasQ.refetch()}
                  disabled={ovsMiasQ.isFetching}
                >
                  Actualizar
                </Button>
                <div className="ml-auto flex h-8 items-center">
                  <PeriodoVistaToggle vista={periodoVista} />
                </div>
              </div>

              {ovsMiasQ.isError && (
                <QueryErrorAlert
                  error={ovsMiasQ.error}
                  onRetry={() => void ovsMiasQ.refetch()}
                />
              )}

              {ovsMiasQ.isLoading ? (
                <p className="text-sm text-[var(--color-muted)]">Cargando sus órdenes de venta…</p>
              ) : ovsMiasFiltradas.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">
                  {periodoVista.todo
                    ? 'No hay OV suyas listas para facturar. Cree una orden, pulse Guardar y vuelva aquí.'
                    : `No hay OV suyas de ${codigoPeriodo} listas para facturar. Pulsa Todo para ver otros meses.`}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
                  <table className="w-full min-w-[52rem] text-left text-sm">
                    <thead className="bg-[var(--color-surface-2)] text-xs uppercase text-[var(--color-muted)]">
                      <tr>
                        <th className="px-3 py-2 font-medium">Folio</th>
                        <th className="px-3 py-2 font-medium">Cliente</th>
                        <th className="px-3 py-2 font-medium">Tipo</th>
                        <th className="px-3 py-2 font-medium">Generado por</th>
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium">Estado</th>
                        <th className="px-3 py-2 font-medium text-right">Total</th>
                        <th className="px-3 py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {ovsMiasFiltradas.map((row) => (
                        <tr
                          key={row.id}
                          className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]/60"
                        >
                          <td className="px-3 py-2 font-mono text-xs">
                            {row.folio}
                          </td>
                          <td className="px-3 py-2">{row.cliente}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{labelIndicadorVenta(row.indicadorVenta)}</td>
                          <td className="px-3 py-2">{row.creadoPorNombre?.trim() || '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {row.createdAt ? fmtDateTime(row.createdAt) : fmtDate(row.fecha)}
                          </td>
                          <td className="px-3 py-2">
                            <EstadoDocumentoBadge estado={row.estado} label={labelEstadoOv(row.estado)} />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtCLP(totalBrutoDocumento(row))}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                title="Editar OV"
                                onClick={() => navigate(pathWizardOvItems(row.id))}
                              >
                                <Pencil size={14} />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                title="Confirmar y emitir DTE"
                                onClick={() => elegirOvParaFacturar(row)}
                                disabled={saving || ovFacturarBusy}
                              >
                                Facturar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
        <Modal
          open={Boolean(ovFacturar)}
          onClose={() => {
            if (!ovFacturarBusy) setOvFacturar(null);
          }}
          title="Confirmar facturación"
          size="lg"
          footer={(
            <>
              <Button
                variant="ghost"
                type="button"
                disabled={ovFacturarBusy}
                onClick={() => setOvFacturar(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => void confirmarFacturarOv()}
                disabled={ovFacturarBusy}
              >
                {ovFacturarBusy ? 'Emitiendo…' : 'Confirmar y emitir'}
              </Button>
            </>
          )}
        >
          {ovFacturar ? (
            <ConfirmacionFacturarOv ov={ovFacturar} />
          ) : null}
        </Modal>
      </div>
    );
  }

  return (
    <div className="-m-6 flex h-[calc(100vh-4rem)] overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-6">
        <PageHeader
          title={pageTitle}
          breadcrumbs={pageBreadcrumbs}
          subtitle={pageSubtitle}
        />

        <AvisosEmitirStrip items={avisosEmitir} />

        {draftId && (
          <div className="mb-4 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-3 py-2 text-sm text-[var(--color-text)]">
            Editando borrador <span className="font-mono font-semibold">{draftFolio}</span>.
            {isModoOv ? ' Al guardar se actualizará esta orden de venta.' : ' Al guardar se actualizará este documento (no se creará uno nuevo).'}
            {draftWarning ? (
              <div className="mt-1 text-amber-800 dark:text-amber-200">
                <strong>Advertencia:</strong> {draftWarning}
              </div>
            ) : null}
          </div>
        )}

        {emitError ? (
          <div
            role="alert"
            data-testid="emit-error-banner"
            className="mb-4 whitespace-pre-wrap rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100"
          >
            {emitError}
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap gap-2">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { if (s.id < step || validateStep(step)) setStep(s.id); }}
              className={cn(
                'rounded-full px-4 py-2 text-xs font-medium transition-colors',
                step === s.id
                  ? 'bg-[var(--color-accent)] text-white shadow-sm'
                  : step > s.id
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-2)]'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-text)]',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {step === 1 && (
          <Card>
            <CardBody className="space-y-6 p-6">
              <QueryErrorAlert
                error={clientesQ.error}
                isLoading={clientesQ.isLoading}
                resource="los clientes"
                onRetry={() => void clientesQ.refetch()}
              />
              <Field label="Cliente" className="max-w-full">
                <SearchableSelect
                  value={clienteId}
                  options={clienteOptions}
                  placeholder="Buscar cliente…"
                  disabled={clientesQ.isError || (isModoOv && !formEditableOv)}
                  onChange={(id) => {
                    const found = clientes.find((c) => c.id === id);
                    if (found) fillReceptorFromCliente(found);
                  }}
                />
              </Field>

              <div>
                <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Datos del receptor</h3>
                <div className="grid gap-4 sm:grid-cols-2">

                  <Field label="Razón social receptor">
                    <Input
                      value={receptor.razonSocial}
                      readOnly
                      className={RECEPTOR_READONLY_CLASS}
                      placeholder="Busque un RUT o seleccione cliente"
                    />
                  </Field>
                  <Field label="Giro receptor">
                    <Input
                      value={receptor.giro}
                      readOnly
                      className={RECEPTOR_READONLY_CLASS}
                      placeholder="—"
                    />
                  </Field>
                  <Field label="Dirección receptor">
                    <Input
                      value={receptor.direccion}
                      readOnly
                      className={RECEPTOR_READONLY_CLASS}
                      placeholder="—"
                    />
                  </Field>
                  <Field label="Comuna">
                    <Input
                      value={receptor.comuna}
                      readOnly
                      className={RECEPTOR_READONLY_CLASS}
                      placeholder="—"
                    />
                  </Field>
                  <Field label="Ciudad">
                    <Input
                      value={receptor.ciudad}
                      readOnly
                      className={RECEPTOR_READONLY_CLASS}
                      placeholder="—"
                    />
                  </Field>
                </div>
                {lookupHint === 'not_found' && (
                  <div
                    role="alert"
                    className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100"
                  >
                    {MSG_CLIENTE_NO_REGISTRADO}
                  </div>
                )}
                {lookupHint === 'error' && (
                  <div
                    role="alert"
                    className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100"
                  >
                    No se pudo consultar el RUT. Intente nuevamente o seleccione el cliente desde el selector.
                  </div>
                )}
                {clientes.length > 0 && (
                  <p className="mt-2 text-xs text-[var(--color-muted)]">
                    Demo: pruebe RUT {clientes[0].rut} ({clientes[0].razonSocial})
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Forma de pago">
                  <Select
                    value={formaPago}
                    disabled={isModoOv && !formEditableOv}
                    onChange={(e) => setFormaPago(e.target.value)}
                  >
                    <option value="CREDITO">Crédito</option>
                    <option value="CONTADO">Contado</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                  </Select>
                </Field>
                {(tipoDocumento === 'NC' || tipoDocumento === 'ND') && (
                  <Field
                    label="Documento a referenciar"
                    className="sm:col-span-2"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1">
                        <SearchableSelect
                          value={origenModo === 'erp' ? documentoOrigenId : ''}
                          onChange={(id) => applyOrigenErp(id)}
                          options={origenOptions}
                          placeholder="Buscar factura, NC, ND o guía…"
                          emptyLabel="No hay coincidencias en el ERP"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          setOrigenModo('manual');
                          setDocumentoOrigenId('');
                        }}
                      >
                        Registro manual
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      Si el DTE no está en el ERP, registre solo tipo SII, folio, fecha y CodRef. No se crea un documento fantasma.
                      La NC/ND no mueve stock.
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <Field label="Tipo SII del origen">
                        <Select
                          value={origenDteTipo}
                          disabled={origenModo === 'erp' && Boolean(documentoOrigenId)}
                          onChange={(e) => {
                            setOrigenModo('manual');
                            setDocumentoOrigenId('');
                            setOrigenDteTipo(e.target.value);
                          }}
                        >
                          <option value="">Seleccionar…</option>
                          {TIPOS_DTE_REFERENCIA.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Folio SII">
                        <Input
                          value={origenDteFolio}
                          readOnly={origenModo === 'erp' && Boolean(documentoOrigenId)}
                          onChange={(e) => {
                            setOrigenModo('manual');
                            setDocumentoOrigenId('');
                            setOrigenDteFolio(e.target.value);
                          }}
                          placeholder="Ej. 66"
                        />
                      </Field>
                      <Field label="Fecha del origen">
                        <Input
                          type="date"
                          value={origenDteFecha}
                          readOnly={origenModo === 'erp' && Boolean(documentoOrigenId)}
                          onChange={(e) => {
                            setOrigenModo('manual');
                            setDocumentoOrigenId('');
                            setOrigenDteFecha(e.target.value);
                          }}
                        />
                      </Field>
                    </div>
                    <Field label="CodRef (motivo SII)" className="mt-3">
                      <Select
                        value={referenciaCod === '' ? '' : String(referenciaCod)}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setReferenciaCod(n === 1 || n === 2 || n === 3 ? n : '');
                        }}
                      >
                        {CODREF_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </Select>
                    </Field>
                    {tipoDocumento === 'NC' && saldoOrigenNc && (
                      <p className={cn(
                        'mt-1 text-xs',
                        saldoOrigenNc.disponible <= 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-muted)]',
                      )}>
                        Saldo disponible para NC (solo si el origen es factura del ERP): {fmtCLP(Math.max(saldoOrigenNc.disponible, 0))}
                        {' '}de {fmtCLP(saldoOrigenNc.totalOrigen)}
                      </p>
                    )}
                  </Field>
                )}
                <Field label="Fecha de emisión">
                  <Input type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} />
                  {!draftId && fechaEmision && !fechaEnPeriodo(fechaEmision, codigoPeriodo) && (
                    <p role="alert" className="mt-1 text-xs font-medium text-[var(--color-danger)]">
                      Debe pertenecer al periodo contable activo {codigoPeriodo}.
                    </p>
                  )}
                </Field>
                <Field label="Fecha vencimiento">
                  <Input
                    type="date"
                    min={fechaEmision || undefined}
                    value={fechaVencimiento}
                    onChange={(e) => setFechaVencimiento(e.target.value)}
                  />
                  {fechaVencimiento && fechaVencimiento < fechaEmision && (
                    <p role="alert" className="mt-1 text-xs font-medium text-[var(--color-danger)]">
                      No puede ser anterior a la fecha de emisión.
                    </p>
                  )}
                </Field>
                <Field label="Indicador de venta">
                  <Select
                    value={indicadorVenta}
                    disabled={isModoOv && !formEditableOv}
                    onChange={(e) => {
                      const v = e.target.value;
                      setIndicadorVenta(v);
                      if (v === 'EXPORTACION') applyComexDefaults();
                    }}
                  >
                    <option value="VENTA">Venta</option>
                    <option value="SERVICIO">Servicio</option>
                    <option value="EXENTO">Exento</option>
                    <option value="EXPORTACION">Exportación</option>
                  </Select>
                </Field>
              </div>
            </CardBody>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardBody className="space-y-4 p-5">
              <QueryErrorAlert
                error={insumosQ.error}
                isLoading={insumosQ.isLoading}
                resource="los artículos y cuentas contables"
                onRetry={() => {
                  void insumosQ.refetch();
                  if (tipoDocumento !== 'GUIA') void cuentasQ.refetch();
                }}
              />
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Detalle de ítems</h3>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {indicadorVenta === 'EXPORTACION'
                    ? `Precio unitario y subtotal de cada línea van en ${monedaExportIso}. El Total CLP se calcula a la derecha con el tipo de cambio.`
                    : isModoOv
                    ? 'Seleccione productos con bodega, servicios o flete. La cuenta contable se asigna después, en Libro de ventas.'
                    : isModoFacturaOv
                      ? 'Factura desde OV: cantidad y descripción vienen de la orden. La cuenta se asigna en Libro de ventas al contabilizar.'
                      : esTipoCorreccionNcNd(tipoDocumento)
                        ? 'Marque “Incluir en corrección” en las líneas que van a la NC/ND. Los totales usan solo las incluidas.'
                        : 'Seleccione cada ítem desde el catálogo de insumos/servicios (sin texto libre).'}
                </p>
              </div>
              <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
                <table className="w-full min-w-[40rem] border-collapse text-sm">
                  <thead className="bg-[var(--color-surface-2)] text-left text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                    <tr>
                      {esTipoCorreccionNcNd(tipoDocumento) && (
                        <th className="px-1.5 py-1.5 font-medium" title="Incluir en corrección">Incluir</th>
                      )}
                      <th className="px-1.5 py-1.5 font-medium">Tipo</th>
                      <th className="px-1.5 py-1.5 font-medium">Artículo / servicio</th>
                      <th className="px-1.5 py-1.5 font-medium">Cant.</th>
                      <th
                        className="px-1.5 py-1.5 font-medium"
                        title={monedaExportIso ? `Precio de venta en ${monedaExportIso}` : 'Precio unitario en pesos'}
                      >
                        {monedaExportIso ? `P. unit. ${monedaExportIso}` : 'P. unit.'}
                      </th>
                      <th className="px-1.5 py-1.5 font-medium">Desc. %</th>
                      {false && <th className="px-1.5 py-1.5 font-medium">Cuenta</th>}
                      <th className="px-1.5 py-1.5 text-right font-medium">
                        {monedaExportIso ? `Subtotal ${monedaExportIso}` : 'Subtotal'}
                      </th>
                      <th className="w-8 px-1 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <LineaEmitirRow
                        key={it.id}
                        item={it}
                        cuentaOptions={cuentaOptions}
                        insumoOptions={insumoOptions}
                        insumos={insumos}
                        onUpdate={updateItem}
                        onRemove={removeItem}
                        canRemove={items.length > 1 && (!isModoOv || formEditableOv)}
                        modoOv={isModoOv}
                        mostrarCuenta={false}
                        lineaBloqueada={isModoOv && !formEditableOv}
                        stockMap={stockMap}
                        onLoadStock={loadStock}
                        onUpdateSplits={updateSplits}
                        notaEmisionDirecta={!isModoOv && !isModoFacturaOv}
                        mostrarIncluirCorreccion={esTipoCorreccionNcNd(tipoDocumento)}
                        ignorarPrecioBodega={indicadorVenta === 'EXPORTACION'}
                        monedaIso={monedaExportIso || undefined}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {(!isModoOv || formEditableOv) && (
                <Button type="button" variant="outline" size="sm" leftIcon={<Plus size={14} />} onClick={addItem}>
                  Agregar línea
                </Button>
              )}
            </CardBody>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardBody className="space-y-6 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tipo referencia (opcional)">
                  <Select value={referenciaTipo} onChange={(e) => setReferenciaTipo(e.target.value)}>
                    <option value="">Sin referencia</option>
                    <option value="801">Orden de compra</option>
                    <option value="802">Nota de pedido</option>
                    <option value="110">Factura exportación (DTE 110)</option>
                    <option value="HES">HES</option>
                  </Select>
                </Field>
                <Field label="Folio referencia">
                  <Input value={referenciaFolio} onChange={(e) => setReferenciaFolio(e.target.value)} placeholder="Ej. OC-2026-001" />
                </Field>
              </div>

              {indicadorVenta === 'EXPORTACION' && (
                <div className="space-y-5 rounded border border-[var(--color-border)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[var(--color-text)]">Datos COMEX / exportación</h3>
                    <Button type="button" variant="outline" size="sm" onClick={applyComexDefaults} disabled={isModoOv && !formEditableOv}>
                      Rellenar valores habituales
                    </Button>
                  </div>
                  <p className="text-xs text-[var(--color-muted)]">
                    Códigos Aduana (Anexo 51). Los campos con * son los del manual de facturación COMEX
                    (Almahue los trata como obligatorios aunque el SII no). Cajas = líneas producto; CLP = USD × TC.
                    En NC/ND de una factura 110 los datos vienen de esa factura.
                  </p>

                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Transporte</h4>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="Ind. traslado" required className="sm:col-span-2">
                        <Input
                          value={comex.indTraslado || COMEX_IND_TRASLADO_DEFAULT}
                          readOnly={
                            !comex.indTraslado
                            || comex.indTraslado === COMEX_IND_TRASLADO_DEFAULT
                          }
                          className={
                            !comex.indTraslado || comex.indTraslado === COMEX_IND_TRASLADO_DEFAULT
                              ? RECEPTOR_READONLY_CLASS
                              : undefined
                          }
                          onChange={(e) => setComex((c) => ({ ...c, indTraslado: e.target.value }))}
                        />
                      </Field>
                      <Field label="Vía" required>
                        <SearchableSelect
                          value={comex.viaTransporte}
                          onChange={(v) => setComex((c) => ({ ...c, viaTransporte: v }))}
                          options={opcionesAduana(VIAS_ADUANA)}
                          placeholder="Código vía"
                          allowCustom
                        />
                      </Field>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Aduana</h4>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="País receptor" required>
                        <SearchableSelect
                          value={comex.paisRecepCodigo}
                          onChange={(v) => setComex((c) => ({
                            ...c,
                            paisRecepCodigo: v,
                            paisDestino: c.paisDestino.trim() || v,
                          }))}
                          options={opcionesConCodigoLibre(PAISES_ADUANA, comex.paisRecepCodigo)}
                          placeholder="Código T7"
                          allowCustom
                        />
                      </Field>
                      <Field label="País destino" required>
                        <SearchableSelect
                          value={comex.paisDestino}
                          onChange={(v) => setComex((c) => ({ ...c, paisDestino: v }))}
                          options={opcionesConCodigoLibre(PAISES_ADUANA, comex.paisDestino)}
                          placeholder="Copia del receptor si vacío"
                          allowCustom
                        />
                      </Field>
                      <Field label="Cláusula" required>
                        <SearchableSelect
                          value={comex.clausulaVenta}
                          onChange={(v) => setComex((c) => ({ ...c, clausulaVenta: v }))}
                          options={opcionesAduana(CLAUSULAS_ADUANA)}
                          placeholder="FOB / CIF"
                          allowCustom
                        />
                      </Field>
                      <Field
                        required
                        label={
                          <span className="inline-flex items-center gap-1">
                            Modalidad venta
                            <InfoHint label="Modalidad de venta Aduana">
                              En la factura impresa aparece como Mod. Pago (p. ej. En consignación libre = 3).
                              No es CREDITO/CONTADO ni el catálogo Aduana de cobranzas/acreditivos.
                            </InfoHint>
                          </span>
                        }
                      >
                        <SearchableSelect
                          value={comex.modalidadVenta}
                          onChange={(v) => setComex((c) => ({ ...c, modalidadVenta: v }))}
                          options={opcionesAduana(MODALIDADES_ADUANA)}
                          placeholder="Modalidad"
                          allowCustom
                        />
                      </Field>
                      <Field label="Puerto embarque" required>
                        <SearchableSelect
                          value={comex.puertoEmbarque}
                          onChange={(v) => setComex((c) => ({ ...c, puertoEmbarque: codigoPuertoAduana(v) || v }))}
                          options={opcionesConCodigoLibre(PUERTOS_ADUANA, comex.puertoEmbarque)}
                          placeholder="Código o nombre (Chile)"
                          allowCustom
                        />
                      </Field>
                      <Field label="Puerto desembarque" required>
                        <SearchableSelect
                          value={comex.puertoDesembarque}
                          onChange={(v) => setComex((c) => ({ ...c, puertoDesembarque: codigoPuertoAduana(v) || v }))}
                          options={opcionesPuertosDesembarque(
                            comex.paisDestino || comex.paisRecepCodigo,
                            comex.puertoDesembarque,
                          )}
                          placeholder="Primero el país, después el resto"
                          allowCustom
                        />
                      </Field>
                      <Field label="Bulto tipo" required>
                        <SearchableSelect
                          value={comex.bultoTipoCodigo}
                          onChange={(v) => setComex((c) => ({ ...c, bultoTipoCodigo: v }))}
                          options={opcionesAduana(BULTOS_ADUANA)}
                          placeholder="22 caja cartón"
                          allowCustom
                        />
                      </Field>
                      <Field label="Cantidad bultos (cajas)" required>
                        <Input
                          type="number"
                          min={0}
                          readOnly
                          className={RECEPTOR_READONLY_CLASS}
                          value={montosComexCajas.cajas || ''}
                          aria-label="Cantidad de bultos"
                          title="Suma de cantidades de líneas producto. El cálculo de cajas solo carga montos."
                        />
                      </Field>
                      <Field label="Marca bulto" required>
                        <Input
                          value={comex.bultoMarca || COMEX_DEFAULTS_ADUANA.bultoMarca}
                          readOnly={!comex.bultoMarca || comex.bultoMarca === COMEX_DEFAULTS_ADUANA.bultoMarca}
                          className={
                            !comex.bultoMarca || comex.bultoMarca === COMEX_DEFAULTS_ADUANA.bultoMarca
                              ? RECEPTOR_READONLY_CLASS
                              : undefined
                          }
                          onChange={(e) => setComex((c) => ({ ...c, bultoMarca: e.target.value }))}
                        />
                      </Field>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Otra moneda</h4>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="Moneda" required>
                        <SearchableSelect
                          value={comex.tpoMoneda}
                          onChange={(v) => setComex((c) => ({
                            ...c,
                            tpoMoneda: v,
                            monedaCodigo: monedaCodigoDesdeTpo(v),
                          }))}
                          options={opcionesAduana(MONEDAS_ADUANA)}
                          placeholder="13 USD"
                          allowCustom
                        />
                      </Field>
                      <Field
                        required
                        label={
                          <span className="inline-flex items-center gap-1">
                            Tipo de cambio
                            <InfoHint label="Tipo de cambio sugerido BCCH">
                              {textoHintTcBcchSugerido(tcBcchSugerido)}
                            </InfoHint>
                          </span>
                        }
                      >
                        <MontoInput
                          kind="tc"
                          decimals={6}
                          className="text-right"
                          aria-label="Tipo de cambio"
                          value={comex.tipoCambio === '' ? null : parseComexNumero(comex.tipoCambio)}
                          onChange={(v) => {
                            tcBcchTocadoRef.current = true;
                            setComex((c) => ({ ...c, tipoCambio: v == null ? '' : String(v) }));
                          }}
                          placeholder={tcBcchSugerido ? String(tcBcchSugerido.valor) : 'TC factura'}
                        />
                      </Field>
                      <Field label="Monto dólar">
                        <MontoInput
                          kind="precio"
                          disabled
                          className={cn('text-right', RECEPTOR_READONLY_CLASS)}
                          aria-label="Monto dólar desde cajas"
                          value={montosComexCajas.usd}
                          onChange={() => undefined}
                        />
                      </Field>
                      <Field label="Monto pesos">
                        <MontoInput
                          kind="monto"
                          disabled
                          className={cn('text-right', RECEPTOR_READONLY_CLASS)}
                          aria-label="Monto pesos desde cajas y tipo de cambio"
                          value={montosComexCajas.clp}
                          onChange={() => undefined}
                        />
                      </Field>
                      <Field label="Fecha doc. referenciado">
                        <Input type="date" value={comex.referenciaFecha} onChange={(e) => setComex((c) => ({ ...c, referenciaFecha: e.target.value }))} />
                      </Field>
                    </div>
                  </div>
                </div>
              )}

              <Field label="Observaciones / condiciones de pago">
                <textarea
                  className="h-24 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Plazo de pago, TC, instrucciones de despacho…"
                />
              </Field>
              <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-sm">
                <p className="font-medium text-[var(--color-text)]">Resumen previo a emisión</p>
                <ul className="mt-2 space-y-1 text-[var(--color-muted)]">
                  <li>{tipoLabel[tipoDocumento] ?? tipoDocumento} · {formaPago} · {indicadorVenta}</li>
                  <li>Receptor: {receptor.razonSocial || '—'}</li>
                  <li>{itemsActivos.filter((i) => i.insumoId).length} ítem(s) · Total {monedaExportIso ? fmtIso(totals.total, monedaExportIso) : fmtCLP(totals.total)}</li>
                </ul>
              </div>
            </CardBody>
          </Card>
        )}

        <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] py-4">
          <Button type="button" variant="ghost" disabled={step === 1} onClick={goPrev}>
            Anterior
          </Button>
          {step < 3 ? (
            <Button
              type="button"
              rightIcon={<ChevronRight size={16} />}
              onClick={goNext}
              disabled={dependenciasError || (step === 1 && !clienteRegistrado)}
            >
              Siguiente
            </Button>
          ) : isModoOv && (ovAcciones.guardar || ovAcciones.guardarCuentas) ? (
            <Button
              type="button"
              leftIcon={<Check size={16} />}
              onClick={() => void handleOvGuardar()}
              disabled={saving || !clienteRegistrado || dependenciasError}
            >
              {saving ? 'Guardando…' : ovAcciones.guardar ? 'Guardar' : 'Guardar cuentas'}
            </Button>
          ) : (
            <span />
          )}
        </div>
      </div>

      <CollapsibleRightPanel
        title="Totales"
        collapsedSummary={panelTotales.collapsed}
        preferExpanded={panelTotales.esExport}
      >
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Cálculo de totales</h3>
            {panelTotales.esExport && (
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Exportación: montos en {monedaExportIso} (sin IVA). El panel solo resume moneda, TC y Total CLP.
              </p>
            )}
            <dl className="mt-3 space-y-2 text-sm" data-testid="panel-totales">
              {panelTotales.filas.map((fila) => {
                if (fila.key === 'descuento') {
                  return (
                    <div key="descuento-block" className="space-y-2">
                      <div className="flex items-end justify-between gap-2">
                        <dt className="pb-1.5 text-[var(--color-muted)]">Descuento global (%)</dt>
                        <dd className="w-24 shrink-0">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            className="h-8 px-2 text-right text-xs"
                            value={descuentoGlobalPct || ''}
                            aria-label="Descuento global porcentual"
                            onChange={(e) => setDescuentoGlobalPct(Number(e.target.value) || 0)}
                          />
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--color-muted)]">Descuento</dt>
                        <dd className="tabular-nums text-[var(--color-danger)]">{fila.valor}</dd>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={fila.key}
                    className={cn(
                      'flex justify-between gap-2',
                      fila.tone === 'strong' && 'border-t border-[var(--color-border)] pt-2 text-base font-bold',
                    )}
                  >
                    <dt
                      className={fila.tone === 'strong' ? undefined : 'text-[var(--color-muted)]'}
                      data-testid={`panel-totales-${fila.key}`}
                    >
                      {fila.label}
                    </dt>
                    <dd
                      className={cn(
                        'tabular-nums',
                        fila.tone === 'danger' && 'text-[var(--color-danger)]',
                        fila.tone === 'accent' && 'text-[var(--color-accent)]',
                        fila.tone === 'strong' && 'text-[var(--color-accent)]',
                      )}
                    >
                      {fila.valor}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {panelTotales.esExport && panelTotales.extra.length > 0 && (
              <div className="mt-4 border-t border-[var(--color-border)] pt-3" data-testid="panel-totales-export">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  Otra moneda
                </h4>
                <dl className="mt-2 space-y-2 text-sm">
                  {panelTotales.extra.map((fila) => (
                    <div key={fila.key} className="flex justify-between gap-2" data-testid={`panel-totales-export-${fila.key}`}>
                      <dt className="text-[var(--color-muted)]">{fila.label}</dt>
                      <dd
                        className={cn(
                          'tabular-nums text-right',
                          fila.tone === 'accent' && 'font-semibold text-[var(--color-accent)]',
                        )}
                      >
                        {fila.valor}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {isModoOv ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  leftIcon={<Eye size={16} />}
                  onClick={handlePreview}
                  disabled={saving || !clienteRegistrado || dependenciasError}
                >
                  Previsualizar documento
                </Button>
                {(ovAcciones.guardar || ovAcciones.guardarCuentas) && (
                  <Button
                    type="button"
                    className="w-full"
                    leftIcon={<FileText size={16} />}
                    onClick={() => void handleOvGuardar()}
                    disabled={saving || !clienteRegistrado || dependenciasError}
                  >
                    {saving ? 'Guardando…' : ovAcciones.guardar ? 'Guardar' : 'Guardar cuentas'}
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button type="button" variant="outline" className="w-full" leftIcon={<Eye size={16} />} onClick={handlePreview} disabled={saving || emitidoOk || !clienteRegistrado || dependenciasError}>
                  Previsualizar PDF
                </Button>
                <Button type="button" variant="outline" className="w-full" leftIcon={<FileText size={16} />} onClick={() => void handleDraft()} disabled={saving || emitidoOk || !clienteRegistrado || dependenciasError}>
                  {saving ? 'Guardando…' : 'Guardar como borrador'}
                </Button>
                <Button type="button" className="w-full" leftIcon={<Check size={16} />} onClick={() => void handleEmit()} disabled={saving || emitidoOk || !clienteRegistrado || step < 3 || dependenciasError}>
                  {saving || emitidoOk ? 'Procesando…' : 'Emitir documento'}
                </Button>
              </>
            )}
          </div>

          {!isModoOv && (
          <Card className="border-[var(--color-border)]">
            <CardBody className="p-3">
              <h4 className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                <span>Resumen de transmisión</span>
                <TransmisionHint />
              </h4>
              <dl className="mt-2 space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--color-muted)]">Tipo</dt>
                  <dd className="text-right font-medium">{tipoLabel[tipoDocumento] ?? tipoDocumento}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--color-muted)]">Emisor</dt>
                  <dd className="text-right">{user?.empresa ?? 'Almahue SpA'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--color-muted)]">Receptor</dt>
                  <dd className="max-w-[9rem] truncate text-right">{receptor.razonSocial || '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--color-muted)]">Forma pago</dt>
                  <dd className="text-right">{formaPago}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--color-muted)]">Fecha</dt>
                  <dd className="text-right">{fechaEmision}</dd>
                </div>
                <div className="flex justify-between gap-2 border-t border-[var(--color-border)] pt-1.5 font-semibold">
                  <dt>{monedaExportIso ? `Total ${monedaExportIso}` : 'Total'}</dt>
                  <dd className="tabular-nums text-[var(--color-accent)]">
                    {monedaExportIso ? fmtIso(totals.total, monedaExportIso) : fmtCLP(totals.total)}
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>
          )}
        </div>
      </CollapsibleRightPanel>
    </div>
  );
}
