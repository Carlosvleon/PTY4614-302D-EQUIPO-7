import type { Cliente, DocumentoComercial, DocumentoLinea, Insumo } from '@/types/domain';
import {
  COMEX_DEFAULTS_ADUANA,
  codigoClausulaAduana,
  codigoModalidadAduana,
  codigoMonedaAduana,
  codigoPaisAduana,
  codigoPuertoAduana,
  codigoBultoAduana,
  codigoViaAduana,
  etiquetaCatalogoAduana,
  monedaCodigoDesdeTpo,
  isoMonedaComex,
  MONEDAS_ADUANA,
} from './comex-aduana.ts';
import { esCodigoTipoDteListado, labelTipoDteSii } from './dte-tipo-sii.ts';

/** Wizard OV (comercial, no DTE). Distinto de `/comercial/emitir`. */
export const PATH_OV_WIZARD = '/comercial/ordenes-venta/nueva';
export const PATH_EMITIR_DTE = '/comercial/emitir';
export const PATH_LIBRO_VENTAS = '/comercial/libro';

/** Estados de OV desde los que se puede facturar (mismo criterio que OrdenVentaPage). Distinto de APROBADO de la OC. */
export const ESTADOS_OV_FACTURABLES = ['CONFIRMADA', 'EMITIDO'] as const;

const LABELS_ESTADO_OV: Record<string, string> = {
  BORRADOR: 'Borrador',
  CONFIRMADA: 'Confirmada',
  APROBADO: 'Confirmada',
  EMITIDO: 'Emitida',
  FACTURADO: 'Facturada',
  ANULADO: 'Anulada',
  RECHAZADO: 'Rechazada',
};

export const FILTRO_ESTADOS_OV: { value: string; label: string }[] = [
  { value: 'BORRADOR', label: 'Borrador' },
  { value: 'CONFIRMADA', label: 'Confirmada' },
  { value: 'EMITIDO', label: 'Emitida' },
  { value: 'ANULADO', label: 'Anulada' },
];

export function labelEstadoOv(estado: string): string {
  return LABELS_ESTADO_OV[estado] ?? estado;
}

const LABELS_INDICADOR_VENTA: Record<string, string> = {
  VENTA: 'Venta',
  SERVICIO: 'Servicio',
  EXENTO: 'Exento',
  EXPORTACION: 'Exportación',
};

export function labelIndicadorVenta(indicador: string | null | undefined): string {
  const key = (indicador || 'VENTA').toUpperCase();
  return LABELS_INDICADOR_VENTA[key] ?? indicador ?? 'Venta';
}

export type EstadoOvFacturable = (typeof ESTADOS_OV_FACTURABLES)[number];

/** NC / ND / Guía pueden emitirse sin OV; la factura electrónica no. */
export const TIPOS_EMISION_SIN_OV = ['NC', 'ND', 'GUIA'] as const;

export function pathWizardOv(params?: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (!v || k === 'contexto') continue;
      qs.set(k, v);
    }
  }
  const s = qs.toString();
  return s ? `${PATH_OV_WIZARD}?${s}` : PATH_OV_WIZARD;
}

/** Factura DTE desde OV confirmada (`contexto=factura-ov`). */
export function pathEmitirFacturaOv(
  origenId: string,
  opts?: { draft?: string },
): string {
  const qs = new URLSearchParams({
    contexto: 'factura-ov',
    origen: origenId,
  });
  if (opts?.draft) qs.set('draft', opts.draft);
  return `${PATH_EMITIR_DTE}?${qs.toString()}`;
}

export function pathEmitirTipoLibre(tipo: (typeof TIPOS_EMISION_SIN_OV)[number]): string {
  return `${PATH_EMITIR_DTE}?tipo=${tipo}`;
}

/** Etiqueta de bandeja: `110 · Factura exportación`. */
export function etiquetaTipoDteBorrador(d: {
  tipo?: string | null;
  indicadorVenta?: string | null;
}): string {
  const tipo = String(d.tipo ?? '').toUpperCase();
  if (tipo === 'ORDEN_VENTA') return 'OV · Orden de venta';
  if (tipo === 'FACTURA' || tipo === 'NC' || tipo === 'ND' || tipo === 'GUIA') {
    return labelTipoDteSii(mapTipoDteErp(tipo, d.indicadorVenta));
  }
  return tipo || 'DOC';
}

/** Ruta para retomar un borrador en el mismo wizard que el alta. */
export function pathCargarBorradorEmision(d: {
  id: string;
  tipo: string;
  documentoOrigenId?: string | null;
}): { path: string } | { error: string } {
  const tipo = (d.tipo || '').toUpperCase();
  if (tipo === 'ORDEN_VENTA') return { path: pathWizardOv({ ov: d.id }) };
  if (tipo === 'FACTURA') {
    const origen = d.documentoOrigenId?.trim();
    if (!origen) {
      return { error: 'Debe facturar desde una orden de venta confirmada (stock descontado).' };
    }
    return { path: pathEmitirFacturaOv(origen, { draft: d.id }) };
  }
  if (tipo === 'NC' || tipo === 'ND' || tipo === 'GUIA') {
    return { path: `${PATH_EMITIR_DTE}?draft=${encodeURIComponent(d.id)}&tipo=${tipo}` };
  }
  return { error: 'Este borrador no es un documento de emisión (NC, ND, Guía o factura desde OV).' };
}

function preferComexField<T>(draftVal: T | null | undefined, ovVal: T | null | undefined): T | undefined {
  if (draftVal != null && String(draftVal).trim() !== '') return draftVal;
  if (ovVal != null && String(ovVal).trim() !== '') return ovVal;
  return draftVal ?? ovVal ?? undefined;
}

/** Factura borrador pisa la OV; COMEX vacío del draft no borra el de la OV. */
export function mergeFacturaDraftConOv(
  ov: DocumentoComercial,
  draft: DocumentoComercial,
): DocumentoComercial {
  return {
    ...ov,
    ...draft,
    tipo: 'FACTURA',
    indicadorVenta: draft.indicadorVenta || ov.indicadorVenta || 'VENTA',
    documentoOrigenId: ov.id,
    folioOrigen: draft.folioOrigen || ov.folio,
    clienteId: draft.clienteId || ov.clienteId,
    receptorRut: preferComexField(draft.receptorRut, ov.receptorRut),
    receptorGiro: preferComexField(draft.receptorGiro, ov.receptorGiro),
    receptorDireccion: preferComexField(draft.receptorDireccion, ov.receptorDireccion),
    receptorComuna: preferComexField(draft.receptorComuna, ov.receptorComuna),
    receptorCiudad: preferComexField(draft.receptorCiudad, ov.receptorCiudad),
    monedaCodigo: preferComexField(draft.monedaCodigo, ov.monedaCodigo),
    tpoMoneda: preferComexField(draft.tpoMoneda, ov.tpoMoneda),
    tipoCambio: draft.tipoCambio ?? ov.tipoCambio,
    paisRecepCodigo: preferComexField(draft.paisRecepCodigo, ov.paisRecepCodigo),
    paisDestino: preferComexField(draft.paisDestino, ov.paisDestino),
    puertoEmbarque: preferComexField(draft.puertoEmbarque, ov.puertoEmbarque),
    puertoDesembarque: preferComexField(draft.puertoDesembarque, ov.puertoDesembarque),
    clausulaVenta: preferComexField(draft.clausulaVenta, ov.clausulaVenta),
    viaTransporte: preferComexField(draft.viaTransporte, ov.viaTransporte),
    modalidadVenta: preferComexField(draft.modalidadVenta, ov.modalidadVenta),
    indTraslado: preferComexField(draft.indTraslado, ov.indTraslado),
    bultoTipoCodigo: preferComexField(draft.bultoTipoCodigo, ov.bultoTipoCodigo),
    bultoCantidad: draft.bultoCantidad ?? ov.bultoCantidad,
    bultoMarca: preferComexField(draft.bultoMarca, ov.bultoMarca),
    montoOtraMoneda: draft.montoOtraMoneda ?? ov.montoOtraMoneda,
    montoExentoOtraMoneda: draft.montoExentoOtraMoneda ?? ov.montoExentoOtraMoneda,
    lineas: draft.lineas?.length ? draft.lineas : ov.lineas,
  };
}

export function ovEsFacturable(estado: string | null | undefined): boolean {
  const e = estado === 'APROBADO' ? 'CONFIRMADA' : estado;
  return ESTADOS_OV_FACTURABLES.includes(e as EstadoOvFacturable);
}

/** OV confirmada pendiente de facturar (listado OV / Emitir DTE). */
export function esOvPorFacturar(d: { tipo?: string | null; estado?: string | null }): boolean {
  const tipo = (d.tipo || '').toUpperCase();
  const estado = d.estado === 'APROBADO' ? 'CONFIRMADA' : d.estado;
  return tipo === 'ORDEN_VENTA' && estado === 'CONFIRMADA';
}

/** @deprecated usar esOvPorFacturar */
export function esOvPorContabilizar(d: { tipo?: string | null; estado?: string | null }): boolean {
  return esOvPorFacturar(d);
}

/** DTE emitido al facturador, aún sin asiento. */
export function esDtePorContabilizar(d: { tipo?: string | null; estado?: string | null }): boolean {
  const tipo = (d.tipo || '').toUpperCase();
  return (tipo === 'FACTURA' || tipo === 'NC' || tipo === 'ND') && d.estado === 'EMITIDO';
}

/** Filas del libro: solo DTE emitidos/contabilizados. La OV vive en Órdenes de venta. */
export function esFilaLibroVentas(d: { tipo?: string | null; estado?: string | null }): boolean {
  const tipo = (d.tipo || '').toUpperCase();
  return (
    (tipo === 'FACTURA' || tipo === 'NC' || tipo === 'ND' || tipo === 'GUIA')
    && (d.estado === 'EMITIDO' || d.estado === 'CONTABILIZADA')
  );
}

/** Correlativo interno numérico (1012 > 1011). Folios de prueba no numéricos van al final. */
export function folioInternoSortValue(folio: string | null | undefined): number {
  const s = String(folio ?? '').trim();
  if (/^\d+$/.test(s)) return Number(s);
  return Number.NEGATIVE_INFINITY;
}

/** Folio SII (GoSocket), no el correlativo interno FA-…. */
export function folioSiiDeDocumento(
  doc: { folioOficial?: string | null } | null | undefined,
): string {
  return String(doc?.folioOficial ?? '').trim();
}

/** Tras emitir: busca folio SII y, si viene, el tipo DTE (33/110/112…) para no mezclar CAF distintos. */
export function pathLibroVentas(
  folioSii?: string | null,
  tipoDte?: string | null,
): string {
  const qs = new URLSearchParams();
  const q = String(folioSii ?? '').trim();
  const tipo = String(tipoDte ?? '').trim();
  if (q) qs.set('q', q);
  if (esCodigoTipoDteListado(tipo)) qs.set('tipo', tipo);
  const s = qs.toString();
  return s ? `${PATH_LIBRO_VENTAS}?${s}` : PATH_LIBRO_VENTAS;
}

/** Tras emitir, el folio oficial a veces llega en el sync inmediato. */
export async function resolverFolioSiiParaLibro(
  doc: DocumentoComercial | null | undefined,
  fetchers: {
    syncDocumentoDte: (id: string) => Promise<unknown>;
    getDocumento: (id: string) => Promise<unknown>;
  },
): Promise<string> {
  if (!doc?.id) return '';
  let current = doc;
  const pick = () => folioSiiDeDocumento(current);
  if (pick()) return pick();
  if (current.billingEmissionId && !current.billingStub) {
    try {
      current = (await fetchers.syncDocumentoDte(current.id)) as DocumentoComercial;
    } catch {
      /* el libro puede sincronizar después */
    }
  }
  if (pick()) return pick();
  try {
    current = (await fetchers.getDocumento(current.id)) as DocumentoComercial;
  } catch {
    /* ignore */
  }
  return pick();
}

/** OVs del usuario (creadoPorId) en estados facturables. */
export function filterOvsMiasFacturables(
  docs: DocumentoComercial[],
  userId: string | null | undefined,
): DocumentoComercial[] {
  if (!userId) return [];
  return docs.filter(
    (d) =>
      d.tipo === 'ORDEN_VENTA'
      && d.creadoPorId === userId
      && ovEsFacturable(d.estado),
  );
}

export function esTipoEmisionSinOv(tipo: string | null | undefined): boolean {
  return TIPOS_EMISION_SIN_OV.includes(
    (tipo ?? '').toUpperCase() as (typeof TIPOS_EMISION_SIN_OV)[number],
  );
}

export type OvSplitForm = { bodegaId: string; cantidad: string };

export type StockBodegaRow = {
  bodegaId: string;
  codigo: string;
  nombre: string;
  /** Cantidad física en bodega. */
  cantidad: number;
  /** Suma reservas ACTIVA no vencidas. */
  reservado?: number;
  /** cantidad − reservado (lo que se puede vender / mostrar en OV). */
  disponible?: number;
};

export interface EmitirLineItem {
  id: string;
  tipoLinea: 'PRODUCTO' | 'SERVICIO' | 'FLETE';
  insumoId: string;
  descripcion: string;
  /** Detalle DTE (DscItem). Vacío = no se envía. */
  detalle: string;
  cantidad: number;
  precioUnitario: number;
  descuentoPct: number;
  codigoProducto: string;
  unidadMedida: string;
  cuentaContableId: string;
  centroCostoId: string;
  splits: OvSplitForm[];
  /** factura-ov: cantidad y descuento bloqueados en productos */
  bloqueado?: boolean;
  /** NC/ND: si es false, la línea no entra al payload ni a los totales. Default true. */
  incluirEnCorreccion?: boolean;
}

export function emptyEmitirLine(defaults?: {
  cuentaContableId?: string;
  centroCostoId?: string;
}): EmitirLineItem {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tipoLinea: 'PRODUCTO',
    insumoId: '',
    descripcion: '',
    detalle: '',
    cantidad: 1,
    precioUnitario: 0,
    descuentoPct: 0,
    codigoProducto: '',
    unidadMedida: '',
    cuentaContableId: defaults?.cuentaContableId ?? '',
    centroCostoId: defaults?.centroCostoId ?? '',
    splits: [{ bodegaId: '', cantidad: '1' }],
    incluirEnCorreccion: true,
  };
}

/** SII DscItem: máx. 1000. Vacío = no se envía en el DTE. */
export const DSC_ITEM_MAX = 1000;

export function detalleDteOpcional(raw: string | null | undefined): string | undefined {
  const t = String(raw ?? '').trim();
  if (!t) return undefined;
  return t.length <= DSC_ITEM_MAX ? t : t.slice(0, DSC_ITEM_MAX);
}

export function lineSubtotal(item: EmitirLineItem) {
  const bruto = item.cantidad * item.precioUnitario;
  return bruto * (1 - item.descuentoPct / 100);
}

export function docLineasToEmitirItems(
  lineas: DocumentoLinea[] | undefined,
  opts?: {
    cuentaContableId?: string;
    centroCostoId?: string;
    bloquearProductos?: boolean;
  },
): EmitirLineItem[] {
  if (!lineas?.length) {
    return [emptyEmitirLine({
      cuentaContableId: opts?.cuentaContableId,
      centroCostoId: opts?.centroCostoId,
    })];
  }
  return lineas.map((l) => {
    const tipoLinea = (l.tipoLinea === 'SERVICIO' || l.tipoLinea === 'FLETE'
      ? l.tipoLinea
      : 'PRODUCTO') as EmitirLineItem['tipoLinea'];
    const cantidad = l.cantidad;
    const splits = l.splits?.length
      ? l.splits.map((s) => ({ bodegaId: s.bodegaId, cantidad: String(s.cantidad) }))
      : l.bodegaId
        ? [{ bodegaId: l.bodegaId, cantidad: String(cantidad) }]
        : [{ bodegaId: '', cantidad: String(cantidad) }];
    return {
      id: `item-${Math.random().toString(36).slice(2, 8)}`,
      tipoLinea,
      insumoId: l.insumoId ?? '',
      descripcion: l.descripcion,
      detalle: String(l.detalle ?? '').trim(),
      cantidad,
      precioUnitario: l.precioUnitario,
      descuentoPct: l.descuentoPct ?? 0,
      codigoProducto: l.codigoProducto ?? '',
      unidadMedida: l.unidadMedida ?? '',
      cuentaContableId: l.cuentaContableId ?? opts?.cuentaContableId ?? '',
      centroCostoId: l.centroCostoId ?? opts?.centroCostoId ?? '',
      splits,
      bloqueado: opts?.bloquearProductos && tipoLinea === 'PRODUCTO',
      incluirEnCorreccion: true,
    };
  });
}

export function esTipoCorreccionNcNd(tipo: string | null | undefined): boolean {
  const t = (tipo ?? '').toUpperCase();
  return t === 'NC' || t === 'ND';
}

/** En NC/ND solo las líneas marcadas; en el resto, todas. */
export function itemsParaCorreccion(
  items: EmitirLineItem[],
  tipo: string | null | undefined,
): EmitirLineItem[] {
  if (!esTipoCorreccionNcNd(tipo)) return items;
  return items.filter((it) => it.incluirEnCorreccion !== false);
}

export function sumaCantidadProducto(items: EmitirLineItem[]): number {
  return items
    .filter((it) => it.tipoLinea === 'PRODUCTO')
    .reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0);
}

export function sumaTotalesLineasUsd(items: EmitirLineItem[]): number {
  return items.reduce((acc, it) => acc + lineSubtotal(it), 0);
}

export function montoClpDesdeUsd(usd: number, tipoCambio: number): number {
  if (!Number.isFinite(usd) || !Number.isFinite(tipoCambio) || tipoCambio <= 0) return 0;
  return Math.round(usd * tipoCambio);
}

/** Cajas (qty producto) → solo montos USD y CLP. No toca bultos ni otros COMEX. */
export function montosComexDesdeCajas(
  items: EmitirLineItem[],
  tipoCambio: number,
): { cajas: number; usd: number; clp: number } {
  const cajas = sumaCantidadProducto(items);
  const usd = Math.round(sumaTotalesLineasUsd(items) * 100) / 100;
  return { cajas, usd, clp: montoClpDesdeUsd(usd, tipoCambio) };
}

export type FilaResumenTotales = {
  key: string;
  label: string;
  valor: string;
  tone?: 'muted' | 'danger' | 'accent' | 'strong';
};

function fmtUsdLocal(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

function fmtClpLocal(n: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

function fmtMonedaLocal(n: number, iso: string): string {
  const code = String(iso || 'USD').toUpperCase();
  if (code === 'CLP') return fmtClpLocal(n);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n : 0);
  } catch {
    return `${code} ${fmtUsdLocal(n).replace('$', '').trim()}`;
  }
}

/** Totales del panel derecho: en exportación muestra moneda COMEX + conversión CLP. */
export function resumenPanelTotales(opts: {
  indicadorVenta: string;
  totals: {
    subtotal: number;
    montoDescuento: number;
    neto: number;
    iva: number;
    exento: number;
    total: number;
  };
  comex: ComexForm;
  items: EmitirLineItem[];
  clienteNombre?: string | null;
}): { esExport: boolean; collapsed: string; filas: FilaResumenTotales[]; extra: FilaResumenTotales[] } {
  const esExport = (opts.indicadorVenta || '').toUpperCase() === 'EXPORTACION';
  const iso = esExport ? isoMonedaComex(opts.comex.tpoMoneda) : 'CLP';
  const money = esExport ? (n: number) => fmtMonedaLocal(n, iso) : fmtClpLocal;
  const suf = esExport ? ` ${iso}` : '';
  const cliente = String(opts.clienteNombre ?? '').trim() || 'Sin cliente';
  const filas: FilaResumenTotales[] = [
    { key: 'cliente', label: 'Cliente', valor: cliente },
    { key: 'subtotal', label: esExport ? `Subtotal${suf}` : 'Subtotal', valor: money(opts.totals.subtotal) },
    {
      key: 'descuento',
      label: 'Descuento',
      valor: `-${money(opts.totals.montoDescuento)}`,
      tone: 'danger',
    },
    { key: 'neto', label: esExport ? `Monto neto${suf}` : 'Monto neto', valor: money(opts.totals.neto) },
    { key: 'exento', label: esExport ? `Exento${suf}` : 'Exento', valor: money(opts.totals.exento) },
    {
      key: 'iva',
      label: esExport || opts.totals.iva === 0 ? 'IVA' : 'IVA (19%)',
      valor: money(opts.totals.iva),
    },
    {
      key: 'total',
      label: esExport ? `Total${suf}` : 'Total',
      valor: money(opts.totals.total),
      tone: 'strong',
    },
  ];
  if (!esExport) {
    return { esExport: false, collapsed: fmtClpLocal(opts.totals.total), filas, extra: [] };
  }
  const tc = parseComexNumero(opts.comex.tipoCambio);
  const montos = montosComexDesdeCajas(opts.items, tc);
  const extra: FilaResumenTotales[] = [
    { key: 'moneda', label: 'Moneda', valor: etiquetaCatalogoAduana(MONEDAS_ADUANA, opts.comex.tpoMoneda || '13') },
    { key: 'tc', label: 'Tipo de cambio', valor: tc > 0 ? String(tc) : '—' },
    { key: 'clp', label: 'Total CLP', valor: fmtClpLocal(montos.clp), tone: 'accent' },
  ];
  return {
    esExport: true,
    collapsed: `${iso} ${fmtMonedaLocal(opts.totals.total, iso)} · CLP ${fmtClpLocal(montos.clp)}`,
    filas,
    extra,
  };
}

export function payloadComexDesdeWizard(
  comex: ComexForm,
  montos: { cajas: number; usd: number },
): Record<string, unknown> {
  const c = rellenarCamposSiempreComex(comex);
  return {
    monedaCodigo: c.monedaCodigo || COMEX_DEFAULTS_ADUANA.monedaCodigo,
    tpoMoneda: c.tpoMoneda || COMEX_DEFAULTS_ADUANA.tpoMoneda,
    tipoCambio: c.tipoCambio ? parseComexNumero(c.tipoCambio) : undefined,
    paisRecepCodigo: c.paisRecepCodigo || COMEX_DEFAULTS_ADUANA.paisRecepCodigo,
    paisDestino: c.paisDestino || c.paisRecepCodigo || COMEX_DEFAULTS_ADUANA.paisRecepCodigo,
    puertoEmbarque: c.puertoEmbarque || undefined,
    puertoDesembarque: c.puertoDesembarque || undefined,
    clausulaVenta: c.clausulaVenta || undefined,
    viaTransporte: c.viaTransporte || undefined,
    modalidadVenta: c.modalidadVenta || undefined,
    indTraslado: c.indTraslado || COMEX_DEFAULTS_ADUANA.indTraslado,
    bultoTipoCodigo: c.bultoTipoCodigo || COMEX_DEFAULTS_ADUANA.bultoTipoCodigo,
    bultoCantidad: montos.cajas || undefined,
    bultoMarca: c.bultoMarca.trim() || COMEX_DEFAULTS_ADUANA.bultoMarca,
    montoOtraMoneda: montos.usd || undefined,
    montoExentoOtraMoneda: montos.usd || undefined,
  };
}

export function patchComexSoloMontos<T extends { montoOtraMoneda: string }>(
  prev: T,
  items: EmitirLineItem[],
  tipoCambio: number,
): T {
  const { usd } = montosComexDesdeCajas(items, tipoCambio);
  if (Math.abs(parseComexNumero(prev.montoOtraMoneda) - usd) < 1e-9) return prev;
  return { ...prev, montoOtraMoneda: String(usd) };
}

/** D16: piso nacional = precioCompra del maestro; si no está cargado, costoPromedio. */
export function pisoPrecioVentaInsumo(ins: {
  precioCompra?: number | null;
  costoPromedio?: number | null;
} | null | undefined): number {
  const compra = Number(ins?.precioCompra);
  if (Number.isFinite(compra) && compra > 0) return compra;
  const costo = Number(ins?.costoPromedio);
  return Number.isFinite(costo) && costo > 0 ? costo : 0;
}

export function labelInsumoSelector(
  ins: { codigo: string; nombre: string; precioCompra?: number | null; costoPromedio?: number | null },
  opts?: { mostrarPiso?: boolean },
): string {
  const base = `${ins.codigo} · ${ins.nombre}`;
  if (!opts?.mostrarPiso) return base;
  const piso = pisoPrecioVentaInsumo(ins);
  if (!(piso > 0)) return base;
  const txt = Number.isInteger(piso) ? String(piso) : piso.toFixed(2);
  return `${base} · piso $${txt}`;
}

/** D16 nacional: true si el precio de venta queda bajo el piso. */
export function violaPisoPrecioVenta(
  precioUnitario: number,
  piso: number,
  opts?: { ignorarPrecioBodega?: boolean },
): boolean {
  if (opts?.ignorarPrecioBodega) return false;
  if (!(piso > 0)) return false;
  return Number(precioUnitario) + 1e-6 < piso;
}

export function mensajePrecioBajoPiso(codigo: string, piso: number): string {
  const txt = Number.isInteger(piso) ? String(piso) : piso.toFixed(2);
  return `No se puede vender ${codigo} bajo el piso de bodega/maestro ($${txt})`;
}

/** D16: en exportación no se usa el precio/piso de bodega del maestro. */
export function precioUnitarioDesdeInsumo(
  pisoOCosto: number | null | undefined,
  opts: { ignorarPrecioBodega?: boolean; precioActual?: number },
): number {
  if (opts.ignorarPrecioBodega) return opts.precioActual && opts.precioActual > 0 ? opts.precioActual : 0;
  if (opts.precioActual && opts.precioActual > 0) return opts.precioActual;
  return pisoOCosto != null && Number.isFinite(Number(pisoOCosto))
    ? Number(pisoOCosto)
    : 0;
}

export function parseComexNumero(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const n = Number(String(raw ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Completa cuenta de ingreso desde el maestro de insumo (la OV no la exige). */
export function aplicarCuentaDesdeInsumo(
  items: EmitirLineItem[],
  insumos: Insumo[],
): EmitirLineItem[] {
  return items.map((it) => {
    if (it.cuentaContableId || !it.insumoId) return it;
    const cuenta = insumos.find((x) => x.id === it.insumoId)?.cuentaContableId ?? '';
    return cuenta ? { ...it, cuentaContableId: cuenta } : it;
  });
}

/** El detalle DTE sale del maestro de insumos; la línea no se edita. */
export function aplicarDetalleDesdeInsumo(
  items: EmitirLineItem[],
  insumos: Insumo[],
): EmitirLineItem[] {
  return items.map((it) => {
    if (!it.insumoId) {
      return it.detalle ? { ...it, detalle: '' } : it;
    }
    const detalle = detalleDteOpcional(insumos.find((x) => x.id === it.insumoId)?.detalle) ?? '';
    return it.detalle === detalle ? it : { ...it, detalle };
  });
}

/** Una sola bodega: la cantidad a descontar es siempre la de la línea. */
export function splitsParaValidar(item: EmitirLineItem): OvSplitForm[] {
  if (item.tipoLinea !== 'PRODUCTO') return item.splits;
  if (item.splits.length === 1) {
    return [{ ...item.splits[0], cantidad: String(item.cantidad) }];
  }
  return item.splits;
}

/** Quita una fila de “Otra bodega”. Si queda una sola, esa cantidad pasa a ser la de la línea. */
export function quitarSplitBodega(
  splits: OvSplitForm[],
  index: number,
  cantidadLinea: number,
): OvSplitForm[] {
  if (splits.length <= 1 || index < 0 || index >= splits.length) return splits;
  const next = splits.filter((_, i) => i !== index);
  if (next.length === 1) {
    return [{ ...next[0], cantidad: String(cantidadLinea) }];
  }
  return next;
}

export function bodegasConStock(rows: StockBodegaRow[] | undefined): StockBodegaRow[] {
  return (rows ?? []).filter((b) => {
    const disp = b.disponible ?? Math.max(0, Number(b.cantidad) - Number(b.reservado ?? 0));
    return disp > 0;
  });
}

export function stockDisponibleRow(b: StockBodegaRow): number {
  if (b.disponible != null) return Number(b.disponible);
  return Math.max(0, Number(b.cantidad) - Number(b.reservado ?? 0));
}

export function tooltipOtraBodega(
  cantidadConStock: number,
  nombreProducto: string,
): string | undefined {
  if (cantidadConStock > 1) return undefined;
  const nombre = nombreProducto.trim() || 'este producto';
  if (cantidadConStock <= 0) {
    return `Ninguna bodega con stock del producto "${nombre}"`;
  }
  return `Solo una bodega con stock del producto "${nombre}"`;
}

export function emitirItemsToOvPayloadLineas(items: EmitirLineItem[]): DocumentoLinea[] {
  return items
    .filter((l) => l.insumoId || l.descripcion.trim() || l.tipoLinea === 'FLETE')
    .map((l) => {
      const detalle = detalleDteOpcional(l.detalle);
      return {
      descripcion: l.descripcion.trim() || (l.tipoLinea === 'FLETE' ? 'Flete' : ''),
        ...(detalle ? { detalle } : {}),
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      descuentoPct: l.descuentoPct,
      total: Math.round(lineSubtotal(l) * 100) / 100,
      tipoLinea: l.tipoLinea,
      insumoId: l.insumoId || undefined,
      codigoProducto: l.codigoProducto || undefined,
      unidadMedida: l.unidadMedida || undefined,
        cuentaContableId: l.cuentaContableId || undefined,
        centroCostoId: l.centroCostoId || undefined,
      splits: l.tipoLinea === 'PRODUCTO'
        ? splitsParaValidar(l)
            .filter((s) => s.bodegaId && Number(s.cantidad) > 0)
            .map((s) => ({ bodegaId: s.bodegaId, cantidad: Number(s.cantidad) }))
        : undefined,
      };
    });
}

export function emitirItemsToEmisionPayloadLineas(items: EmitirLineItem[]) {
  return items.filter((it) => it.insumoId).map((it) => {
    const detalle = detalleDteOpcional(it.detalle);
    return {
    descripcion: it.descripcion,
      ...(detalle ? { detalle } : {}),
    cantidad: it.cantidad,
    precioUnitario: it.precioUnitario,
    descuentoPct: it.descuentoPct,
    total: Math.round(lineSubtotal(it) * 1e6) / 1e6,
    tipoLinea: it.tipoLinea,
    insumoId: it.insumoId,
    codigoProducto: it.codigoProducto || undefined,
    unidadMedida: it.unidadMedida || undefined,
    cuentaContableId: it.cuentaContableId || undefined,
    centroCostoId: it.centroCostoId || undefined,
    };
  });
}

export function receptorFromCliente(c: Cliente) {
  const dir = c.direcciones?.find((d) => d.principal) ?? c.direcciones?.[0];
  return {
    rut: c.rut,
    razonSocial: c.razonSocial,
    giro: (c.giro ?? '').trim(),
    direccion: (c.direccion || dir?.linea || '').trim(),
    comuna: (c.comuna || dir?.comuna || '').trim(),
    ciudad: (c.ciudad || dir?.ciudad || '').trim(),
  };
}

export type ComexForm = {
  monedaCodigo: string;
  tpoMoneda: string;
  tipoCambio: string;
  paisRecepCodigo: string;
  paisDestino: string;
  puertoEmbarque: string;
  puertoDesembarque: string;
  clausulaVenta: string;
  viaTransporte: string;
  modalidadVenta: string;
  indTraslado: string;
  bultoTipoCodigo: string;
  bultoCantidad: string;
  bultoMarca: string;
  montoOtraMoneda: string;
  montoExentoOtraMoneda: string;
  referenciaFecha: string;
};

export function emptyComexForm(): ComexForm {
  return {
    monedaCodigo: '',
    tpoMoneda: '',
    tipoCambio: '',
    paisRecepCodigo: '',
    paisDestino: '',
    puertoEmbarque: '',
    puertoDesembarque: '',
    clausulaVenta: '',
    viaTransporte: '',
    modalidadVenta: '',
    indTraslado: '',
    bultoTipoCodigo: '',
    bultoCantidad: '',
    bultoMarca: '',
    montoOtraMoneda: '',
    montoExentoOtraMoneda: '',
    referenciaFecha: '',
  };
}

export function comexFormDesdeDocumento(doc: {
  monedaCodigo?: string | null;
  tpoMoneda?: string | null;
  tipoCambio?: number | null;
  paisRecepCodigo?: string | null;
  paisDestino?: string | null;
  puertoEmbarque?: string | null;
  puertoDesembarque?: string | null;
  clausulaVenta?: string | null;
  viaTransporte?: string | null;
  modalidadVenta?: string | null;
  indTraslado?: string | null;
  bultoTipoCodigo?: string | null;
  bultoCantidad?: number | null;
  bultoMarca?: string | null;
  montoOtraMoneda?: number | null;
  montoExentoOtraMoneda?: number | null;
  referenciaFecha?: string | null;
}): ComexForm {
  const tpo = codigoMonedaAduana(doc.tpoMoneda || doc.monedaCodigo) || '';
  const paisRecep = codigoPaisAduana(doc.paisRecepCodigo);
  const paisDestino = codigoPaisAduana(doc.paisDestino) || paisRecep;
  return {
    monedaCodigo: monedaCodigoDesdeTpo(tpo || doc.monedaCodigo),
    tpoMoneda: tpo,
    tipoCambio: doc.tipoCambio != null ? String(doc.tipoCambio) : '',
    paisRecepCodigo: paisRecep,
    paisDestino,
    puertoEmbarque: codigoPuertoAduana(doc.puertoEmbarque),
    puertoDesembarque: codigoPuertoAduana(doc.puertoDesembarque),
    clausulaVenta: codigoClausulaAduana(doc.clausulaVenta),
    viaTransporte: codigoViaAduana(doc.viaTransporte),
    modalidadVenta: codigoModalidadAduana(doc.modalidadVenta),
    indTraslado: doc.indTraslado ?? '',
    bultoTipoCodigo: codigoBultoAduana(doc.bultoTipoCodigo) || (doc.bultoTipoCodigo ?? ''),
    bultoCantidad: doc.bultoCantidad != null ? String(doc.bultoCantidad) : '',
    bultoMarca: doc.bultoMarca ?? '',
    montoOtraMoneda: doc.montoOtraMoneda != null ? String(doc.montoOtraMoneda) : '',
    montoExentoOtraMoneda:
      doc.montoExentoOtraMoneda != null ? String(doc.montoExentoOtraMoneda) : '',
    referenciaFecha: doc.referenciaFecha ?? '',
  };
}

export type TcBcchSugerido = { fecha: string; valor: number };

export function tcBcchSugeridoDesdeKpi(
  kpi: {
    tcUsdHoy?: number | null;
    tcCnyHoy?: number | null;
    tcEurHoy?: number | null;
    tcUsdHoyFecha?: string | null;
  } | null | undefined,
  iso?: string | null,
): TcBcchSugerido | null {
  const m = String(iso || 'USD').toUpperCase();
  const valor = m === 'CNY'
    ? Number(kpi?.tcCnyHoy)
    : m === 'EUR'
      ? Number(kpi?.tcEurHoy)
      : Number(kpi?.tcUsdHoy);
  if (!Number.isFinite(valor) || valor <= 0) return null;
  const fecha = String(kpi?.tcUsdHoyFecha ?? '').slice(0, 10);
  return { fecha, valor };
}

/** Rellena TC con BCCH de la moneda COMEX. No pisa si el operador ya escribió. */
export function aplicarTipoCambioSugerido(
  tipoCambioActual: string,
  sugerido: TcBcchSugerido | null,
  tocado: boolean,
): string | null {
  if (tocado) return null;
  if (!sugerido || !(sugerido.valor > 0)) return null;
  const next = String(sugerido.valor);
  if (String(tipoCambioActual ?? '').trim() === next) return null;
  return next;
}

function fechaHintDdMmYyyy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return iso.trim() || '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function fmtClpDosDecimales(n: number): string {
  const [entero, dec] = n.toFixed(2).split('.');
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${conMiles},${dec}`;
}

export function textoHintTcBcchSugerido(sugerido: TcBcchSugerido | null): string {
  if (!sugerido) return 'No hay tipo de cambio BCCH disponible para sugerir.';
  const fecha = sugerido.fecha ? fechaHintDdMmYyyy(sugerido.fecha) : '—';
  return `tipo de cambio sugerido al día ${fecha} a ${fmtClpDosDecimales(sugerido.valor)}`;
}

export function aplicarDefaultsComex(prev: ComexForm): ComexForm {
  const tpo = prev.tpoMoneda || COMEX_DEFAULTS_ADUANA.tpoMoneda;
  const paisRecep = prev.paisRecepCodigo.trim() || COMEX_DEFAULTS_ADUANA.paisRecepCodigo;
  return {
    ...prev,
    tpoMoneda: tpo,
    monedaCodigo: monedaCodigoDesdeTpo(tpo),
    indTraslado: prev.indTraslado || COMEX_DEFAULTS_ADUANA.indTraslado,
    bultoTipoCodigo: prev.bultoTipoCodigo || COMEX_DEFAULTS_ADUANA.bultoTipoCodigo,
    bultoMarca: prev.bultoMarca || COMEX_DEFAULTS_ADUANA.bultoMarca,
    clausulaVenta: prev.clausulaVenta || COMEX_DEFAULTS_ADUANA.clausulaVenta,
    viaTransporte: prev.viaTransporte || COMEX_DEFAULTS_ADUANA.viaTransporte,
    modalidadVenta: prev.modalidadVenta || COMEX_DEFAULTS_ADUANA.modalidadVenta,
    puertoEmbarque: prev.puertoEmbarque.trim() || COMEX_DEFAULTS_ADUANA.puertoEmbarque,
    paisRecepCodigo: paisRecep,
    paisDestino: prev.paisDestino.trim() || paisRecep,
  };
}

/** Pts 19, 27, 29 del manual: siempre los mismos; no se piden al operador si vienen vacíos. */
export function rellenarCamposSiempreComex<T extends Partial<ComexForm>>(comex: T): T {
  return {
    ...comex,
    indTraslado: String(comex.indTraslado ?? '').trim() || COMEX_DEFAULTS_ADUANA.indTraslado,
    bultoTipoCodigo: String(comex.bultoTipoCodigo ?? '').trim() || COMEX_DEFAULTS_ADUANA.bultoTipoCodigo,
    bultoMarca: String(comex.bultoMarca ?? '').trim() || COMEX_DEFAULTS_ADUANA.bultoMarca,
    tpoMoneda: String(comex.tpoMoneda ?? '').trim() || COMEX_DEFAULTS_ADUANA.tpoMoneda,
    monedaCodigo: String(comex.monedaCodigo ?? '').trim()
      || monedaCodigoDesdeTpo(String(comex.tpoMoneda ?? '').trim() || COMEX_DEFAULTS_ADUANA.tpoMoneda),
  };
}

/**
 * Campos del manual de NC/ND COMEX (pts 19–32) que Almahue pide como obligatorios
 * aunque el SII no los marque. Los “siempre” (traslado, bulto 22, marca -, USD) se rellenan.
 */
export function huecosComexFactura110(
  comex: Partial<ComexForm>,
  cajas: number,
): string[] {
  const c = rellenarCamposSiempreComex(comex);
  const huecos: string[] = [];
  const missing = (v: unknown) => !String(v ?? '').trim();
  if (missing(c.indTraslado)) huecos.push('indicador de traslado');
  if (missing(c.modalidadVenta)) huecos.push('modalidad de venta');
  if (missing(c.paisDestino)) huecos.push('país destino');
  if (missing(c.paisRecepCodigo)) huecos.push('país receptor');
  if (missing(c.clausulaVenta)) huecos.push('cláusula');
  if (missing(c.viaTransporte)) huecos.push('vía de transporte');
  if (missing(c.puertoEmbarque)) huecos.push('puerto de embarque');
  if (missing(c.puertoDesembarque)) huecos.push('puerto de desembarque');
  if (missing(c.bultoTipoCodigo)) huecos.push('tipo de bulto');
  const cant = cajas > 0 ? cajas : parseComexNumero(c.bultoCantidad);
  if (!(cant > 0)) huecos.push('cantidad de bultos');
  if (missing(c.bultoMarca)) huecos.push('marca de bulto');
  if (missing(c.tpoMoneda) && missing(c.monedaCodigo)) huecos.push('tipo de moneda');
  if (!(parseComexNumero(c.tipoCambio) > 0)) huecos.push('tipo de cambio');
  return huecos;
}

export function mensajeHuecosComexManual(huecos: string[]): string {
  return `Faltan datos COMEX del manual de facturación: ${huecos.join(', ')}.`;
}

/** Prefija `TC {tc}` sin borrar el resto. Si ya empieza con TC, actualiza ese token. */
export function prefijarObservacionTc(obs: string, tipoCambio: string | number | null | undefined): string {
  const tc = String(tipoCambio ?? '').trim();
  if (!tc) return obs;
  const prefix = `TC ${tc}`;
  const trimmed = String(obs ?? '');
  if (!trimmed.trim()) return prefix;
  if (/^TC\b/i.test(trimmed.trimStart())) {
    return trimmed.replace(/^\s*TC\s*\S*/i, prefix);
  }
  return `${prefix} ${trimmed}`;
}

export function esOrigenFacturaExportacion(doc: {
  tipo?: string | null;
  indicadorVenta?: string | null;
} | null | undefined): boolean {
  if (!doc) return false;
  const tipo = String(doc.tipo ?? '').trim().toUpperCase();
  if (tipo === '110') return true;
  return tipo === 'FACTURA' && (
    (doc.indicadorVenta || '').toUpperCase() === 'EXPORTACION'
    || mapTipoDteErp(tipo, doc.indicadorVenta) === '110'
  );
}

/** NC/ND: COMEX + referencia 110 desde la factura de exportación origen. */
export function comexDesdeFacturaOrigen(doc: DocumentoComercial | null | undefined): {
  indicadorVenta: 'EXPORTACION';
  comex: ComexForm;
  referencia: { tipo: string; folio: string; fecha: string };
} | null {
  if (!esOrigenFacturaExportacion(doc) || !doc) return null;
  const comex = aplicarDefaultsComex(comexFormDesdeDocumento(doc));
  const sii = referenciaSiiDesdeOrigen(doc);
  return {
    indicadorVenta: 'EXPORTACION',
    comex: {
      ...comex,
      referenciaFecha: doc.fecha,
    },
    referencia: {
      tipo: '110',
      folio: sii.folio,
      fecha: sii.fecha,
    },
  };
}

export function applyDocumentoCabecera(
  doc: DocumentoComercial,
  clientes: Cliente[],
) {
  return {
    draftId: doc.id,
    draftFolio: doc.folio,
    loadedEstado: doc.estado,
    tipoDocumento: doc.tipo,
    fechaEmision: doc.fecha,
    fechaVencimiento: doc.fechaVencimiento ?? '',
    formaPago: doc.formaPago ?? 'CREDITO',
    indicadorVenta: doc.indicadorVenta ?? 'VENTA',
    descuentoGlobalPct: doc.descuentoGlobalPct ?? 0,
    clienteId: doc.clienteId ?? '',
    cuentaContableId: doc.cuentaContableId ?? '',
    centroCostoId: doc.centroCostoId ?? '',
    referenciaTipo: doc.referenciaTipo ?? '',
    referenciaFolio: doc.referenciaFolio ?? '',
    referenciaCod: doc.referenciaCod === 1 || doc.referenciaCod === 2 || doc.referenciaCod === 3
      ? doc.referenciaCod
      : undefined,
    observaciones: doc.observaciones ?? '',
    documentoOrigenId: doc.documentoOrigenId ?? '',
    comex: (doc.indicadorVenta || '').toUpperCase() === 'EXPORTACION'
      ? aplicarDefaultsComex(comexFormDesdeDocumento(doc))
      : comexFormDesdeDocumento(doc),
    receptor: {
      rut: doc.receptorRut || clientes.find((c) => c.id === doc.clienteId)?.rut || '',
      razonSocial: doc.cliente,
      giro: doc.receptorGiro ?? '',
      direccion: doc.receptorDireccion ?? '',
      comuna: doc.receptorComuna ?? '',
      ciudad: doc.receptorCiudad ?? '',
    },
  };
}

export function ovAccionesVisibles(
  estado: DocumentoComercial['estado'] | null,
) {
  const e = !estado || estado === 'APROBADO' ? (estado === 'APROBADO' ? 'CONFIRMADA' : 'BORRADOR') : estado;
  const borrador = e === 'BORRADOR';
  const confirmada = e === 'CONFIRMADA';
  return {
    guardar: borrador || confirmada,
    guardarCuentas: false,
    confirmar: borrador,
    facturar: ovEsFacturable(e),
  };
}

/** Wizard del lápiz: editable en borrador y en confirmada (antes de facturar). */
export function ovFormularioEditable(
  estado: DocumentoComercial['estado'] | null,
): boolean {
  return ovAccionesVisibles(estado).guardar;
}

type LineaCuentaRef = {
  insumoId?: string | null;
  descripcion?: string | null;
  tipoLinea?: string | null;
  cuentaContableId?: string | null;
};

function lineaOvRelevante(l: LineaCuentaRef): boolean {
  return Boolean(l.insumoId || String(l.descripcion ?? '').trim() || l.tipoLinea === 'FLETE');
}

/** Ítems de OV/factura que aún no tienen cuenta de ingreso. */
export function lineasSinCuentaContable(lineas: LineaCuentaRef[] | null | undefined): LineaCuentaRef[] {
  return (lineas ?? []).filter((l) => lineaOvRelevante(l) && !String(l.cuentaContableId ?? '').trim());
}

export function ovTieneItemsSinCuenta(d: {
  lineas?: LineaCuentaRef[] | null;
}): boolean {
  return lineasSinCuentaContable(d.lineas).length > 0;
}

/** Editar ítems de una OV (wizard, paso 2). */
export function pathWizardOvItems(ovId: string): string {
  return pathWizardOv({ ov: ovId, paso: '2' });
}

export const TIPOS_ORIGEN_NC_ND = ['FACTURA', 'NC', 'ND', 'GUIA'] as const;
export const TIPOS_DTE_REFERENCIA = ['33', '34', '52', '56', '61', '110', '111', '112'] as const;

export function esTipoOrigenNcNd(tipo: string | null | undefined): boolean {
  return TIPOS_ORIGEN_NC_ND.includes((tipo || '').toUpperCase() as (typeof TIPOS_ORIGEN_NC_ND)[number]);
}

export function esTipoDteReferencia(tipo: string | null | undefined): boolean {
  return TIPOS_DTE_REFERENCIA.includes(String(tipo || '').trim() as (typeof TIPOS_DTE_REFERENCIA)[number]);
}

/** Mismo mapeo ERP → tipoDte que el backend (`mapTipoDte`). */
export function mapTipoDteErp(tipo: string, indicadorVenta?: string | null): string {
  const ind = (indicadorVenta || '').toUpperCase();
  if (tipo === 'NC') return ind === 'EXPORTACION' ? '112' : '61';
  if (tipo === 'ND') return ind === 'EXPORTACION' ? '111' : '56';
  if (tipo === 'GUIA') return '52';
  if (tipo === 'FACTURA') {
    if (ind === 'EXPORTACION') return '110';
    if (ind === 'EXENTO') return '34';
    return '33';
  }
  return '33';
}

export function docsOrigenNcNd(docs: DocumentoComercial[]): DocumentoComercial[] {
  return docs.filter(
    (d) => esTipoOrigenNcNd(d.tipo) && d.estado !== 'ANULADO' && d.estado !== 'BORRADOR',
  );
}

export function folioSiiOInterno(d: Pick<DocumentoComercial, 'folio' | 'folioOficial'>): string {
  const oficial = d.folioOficial?.trim();
  return oficial || d.folio;
}

export function labelOrigenNcNd(d: DocumentoComercial): string {
  const dte = mapTipoDteErp(d.tipo, d.indicadorVenta);
  const folio = folioSiiOInterno(d);
  return `${d.tipo} ${dte} · ${folio} · ${d.cliente} · ${d.fecha}`;
}

export function referenciaSiiDesdeOrigen(d: DocumentoComercial): {
  tipo: string;
  folio: string;
  fecha: string;
} {
  return {
    tipo: mapTipoDteErp(d.tipo, d.indicadorVenta),
    folio: folioSiiOInterno(d),
    fecha: d.fecha,
  };
}

export const CODREF_OPTIONS: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: '1 · Anula el documento de referencia' },
  { value: 2, label: '2 · Corrige texto' },
  { value: 3, label: '3 · Corrige montos' },
];

/** Modal Libro › Anulación (textos SII que pidió Sergio 07/09). */
export const CODREF_ANULACION_LIBRO: {
  value: 1 | 2 | 3;
  label: string;
  detalle: string;
}[] = [
  {
    value: 1,
    label: '1: Anula Documento de Referencia',
    detalle: 'Emite la nota de crédito por el 100% de la factura. Solo confirma.',
  },
  {
    value: 2,
    label: '2: Corrige Texto Documento de Referencia',
    detalle: 'Buscar y reemplazar un texto del documento (nombre, número, ítem). Sin montos.',
  },
  {
    value: 3,
    label: '3: Corrige montos',
    detalle: 'Cargue los ítems, quite los que no aplican y rebaje cantidad o precio. La NC no puede igualar ni superar la factura.',
  },
];

export function puedeAnularFacturaLibro(d: {
  tipo?: string | null;
  estado?: string | null;
  billingStatus?: string | null;
}, opts?: { yaAnulada?: boolean }): boolean {
  const tipo = (d.tipo || '').toUpperCase();
  const rejected = (d.billingStatus || '').toUpperCase() === 'REJECTED';
  if (opts?.yaAnulada) return false;
  return tipo === 'FACTURA'
    && (d.estado === 'EMITIDO' || d.estado === 'CONTABILIZADA')
    && !rejected;
}

/** Liquidación COMEX (CodRef 3): factura 110 vigente; no es anulación fiscal. */
export function puedeCerrarComexLibro(
  d: {
    tipo?: string | null;
    estado?: string | null;
    billingStatus?: string | null;
    indicadorVenta?: string | null;
  },
  opts?: { yaAnulada?: boolean },
): boolean {
  return esOrigenFacturaExportacion(d) && puedeAnularFacturaLibro(d, opts);
}

function numComexPayload(raw: string): number | undefined {
  const n = parseComexNumero(raw);
  return n > 0 ? n : undefined;
}

/** TC de la NC/ND: el de la factura, o el que el operador dejó en corrige montos. */
export function tipoCambioNcEfectivo(
  factura: Pick<DocumentoComercial, 'tipoCambio'>,
  override?: number | string | null,
): number | undefined {
  const raw = override == null || override === '' ? undefined : parseComexNumero(override);
  if (raw != null && raw > 0) return raw;
  const orig = Number(factura.tipoCambio);
  return orig > 0 ? orig : undefined;
}

/** Campos COMEX + receptor para NC/ND sobre factura 110 (Aduana ya normalizada). */
export function comexCamposDesdeFactura(
  factura: DocumentoComercial,
  opts?: { tipoCambio?: number | string | null },
): Record<string, unknown> {
  const inherited = comexDesdeFacturaOrigen(factura);
  if (!inherited) return {};
  const c = inherited.comex;
  const out: Record<string, unknown> = {
    indicadorVenta: 'EXPORTACION',
  };
  const putStr = (key: string, v: string | null | undefined) => {
    const t = String(v ?? '').trim();
    if (t) out[key] = t;
  };
  putStr('monedaCodigo', c.monedaCodigo);
  putStr('tpoMoneda', c.tpoMoneda);
  putStr('paisRecepCodigo', c.paisRecepCodigo);
  putStr('paisDestino', c.paisDestino);
  putStr('puertoEmbarque', c.puertoEmbarque);
  putStr('puertoDesembarque', c.puertoDesembarque);
  putStr('clausulaVenta', c.clausulaVenta);
  putStr('viaTransporte', c.viaTransporte);
  putStr('modalidadVenta', c.modalidadVenta);
  putStr('indTraslado', c.indTraslado);
  putStr('bultoTipoCodigo', c.bultoTipoCodigo);
  putStr('bultoMarca', c.bultoMarca.trim() ? c.bultoMarca : COMEX_DEFAULTS_ADUANA.bultoMarca);
  const tc = tipoCambioNcEfectivo(factura, opts?.tipoCambio)
    ?? numComexPayload(c.tipoCambio);
  if (tc != null) out.tipoCambio = tc;
  const bultos = numComexPayload(c.bultoCantidad);
  if (bultos != null) out.bultoCantidad = Math.trunc(bultos);
  putStr('receptorRut', factura.receptorRut);
  putStr('receptorGiro', factura.receptorGiro);
  putStr('receptorDireccion', factura.receptorDireccion);
  putStr('receptorComuna', factura.receptorComuna);
  putStr('receptorCiudad', factura.receptorCiudad);
  return out;
}

export function observacionCierreComex(tipo: 'NC' | 'ND'): string {
  return tipo === 'ND' ? 'Corrige Monto: ND por cierre' : 'Corrige Monto: NC por cierre';
}

/** Payload Libro › Cierre COMEX. Solo CodRef 3; no arma anulación total. */
export function payloadCierreComexDesdeFactura(
  factura: DocumentoComercial,
  opts: { tipo: 'NC' | 'ND'; codRef: 3; tipoCambio?: number | string | null },
): Record<string, unknown> | null {
  if (opts.codRef !== 3) return null;
  if (opts.tipo !== 'NC' && opts.tipo !== 'ND') return null;
  const inherited = comexDesdeFacturaOrigen(factura);
  if (!inherited) return null;
  return {
    tipo: opts.tipo,
    cliente: factura.cliente,
    clienteId: factura.clienteId,
    documentoOrigenId: factura.id,
    folioOrigen: factura.folio,
    indicadorVenta: 'EXPORTACION',
    referenciaTipo: inherited.referencia.tipo,
    referenciaFolio: inherited.referencia.folio,
    referenciaFecha: inherited.referencia.fecha,
    referenciaCod: 3,
    observaciones: prefijarObservacionTc(
      observacionCierreComex(opts.tipo),
      tipoCambioNcEfectivo(factura, opts.tipoCambio) ?? inherited.comex.tipoCambio,
    ),
    ...comexCamposDesdeFactura(factura, { tipoCambio: opts.tipoCambio }),
  };
}

/** NC CodRef 1: anula el 100 % de la factura origen. */
export function esNcAnulacionTotal(d: {
  tipo?: string | null;
  referenciaCod?: number | null;
}): boolean {
  return (d.tipo || '').toUpperCase() === 'NC' && d.referenciaCod === 1;
}

export function esCorreccionTextoOMonto(d: {
  tipo?: string | null;
  referenciaCod?: number | null;
}): boolean {
  const tipo = (d.tipo || '').toUpperCase();
  return (tipo === 'NC' || tipo === 'ND') && (d.referenciaCod === 2 || d.referenciaCod === 3);
}

export function ncAnulacionDeFactura(
  historial: DocumentoComercial[],
): DocumentoComercial | undefined {
  return historial.find((d) => esNcAnulacionTotal(d));
}

export function correccionesDeFactura(
  historial: DocumentoComercial[],
): DocumentoComercial[] {
  return historial
    .filter((d) => esCorreccionTextoOMonto(d))
    .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || ''))
      || folioInternoSortValue(a.folio) - folioInternoSortValue(b.folio));
}

export function textoCorreccionNc(actual: string, nuevo: string): string {
  return `Donde dice ${actual.trim()} debe decir ${nuevo.trim()}`;
}

/** Neto + IVA (o `total` si el API lo trae). */
export function totalBrutoDocumento(d: {
  neto?: number | null;
  iva?: number | null;
  total?: number | null;
}): number {
  if (d.total != null && Number.isFinite(Number(d.total)) && Number(d.total) > 0) {
    return Number(d.total);
  }
  return (Number(d.neto) || 0) + (Number(d.iva) || 0);
}

/** Saldo de la factura para otra NC (P1-9). Las NC CodRef 2 a $0 no lo comen. */
export function saldoNcSobreFactura(
  factura: Pick<DocumentoComercial, 'id' | 'neto' | 'iva' | 'total'>,
  docs: DocumentoComercial[],
): { total: number; usado: number; saldo: number } {
  const total = totalBrutoDocumento(factura);
  const usado = docs
    .filter((d) =>
      (d.tipo || '').toUpperCase() === 'NC'
      && d.estado !== 'ANULADO'
      && d.documentoOrigenId === factura.id
    )
    .reduce((acc, d) => acc + totalBrutoDocumento(d), 0);
  return { total, usado, saldo: total - usado };
}

export function noPuedeAnularCienPorSaldo(saldo: { total: number; saldo: number }): boolean {
  return saldo.total > 0 && saldo.saldo + 1 < saldo.total;
}


export function lineasNcDesdeFactura(lineas: DocumentoLinea[] | null | undefined): DocumentoLinea[] {
  return (lineas ?? [])
    .filter((l) => Boolean(l.descripcion?.trim() || l.insumoId))
    .map((l) => {
      const detalle = detalleDteOpcional(l.detalle);
      return {
        descripcion: l.descripcion,
        ...(detalle ? { detalle } : {}),
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        descuentoPct: l.descuentoPct ?? 0,
        total: l.total,
        tipoLinea: l.tipoLinea,
        insumoId: l.insumoId,
        codigoProducto: l.codigoProducto,
        unidadMedida: l.unidadMedida,
        cuentaContableId: l.cuentaContableId,
        centroCostoId: l.centroCostoId,
      };
    });
}

export type LineaNcRebajaEdicion = {
  id: string;
  descripcion: string;
  detalle?: string;
  cantidadMax: number;
  precioMax: number;
  descuentoPct: number;
  cantidad: number;
  precioUnitario: number;
  tipoLinea?: DocumentoLinea['tipoLinea'];
  insumoId?: string;
  codigoProducto?: string;
  unidadMedida?: string;
  cuentaContableId?: string;
  centroCostoId?: string;
};

export function totalLineaNcRebaja(row: Pick<LineaNcRebajaEdicion, 'cantidad' | 'precioUnitario' | 'descuentoPct'>): number {
  const cantidad = Number(row.cantidad) || 0;
  const precio = Number(row.precioUnitario) || 0;
  const desc = Number(row.descuentoPct) || 0;
  return Math.round(cantidad * precio * (1 - desc / 100) * 100) / 100;
}

export function seedLineasNcRebaja(lineas: DocumentoLinea[] | null | undefined): LineaNcRebajaEdicion[] {
  return lineasNcDesdeFactura(lineas).map((l, i) => ({
    id: `${l.insumoId || l.descripcion || 'ln'}-${i}`,
    descripcion: l.descripcion,
    detalle: l.detalle,
    cantidadMax: Number(l.cantidad) || 0,
    precioMax: Number(l.precioUnitario) || 0,
    descuentoPct: Number(l.descuentoPct ?? 0),
    cantidad: Number(l.cantidad) || 0,
    precioUnitario: Number(l.precioUnitario) || 0,
    tipoLinea: l.tipoLinea,
    insumoId: l.insumoId,
    codigoProducto: l.codigoProducto,
    unidadMedida: l.unidadMedida,
    cuentaContableId: l.cuentaContableId,
    centroCostoId: l.centroCostoId,
  }));
}

export function lineasNcDesdeEdicion(rows: LineaNcRebajaEdicion[]): DocumentoLinea[] {
  return rows
    .map((row) => {
      const cantidad = Math.min(Math.max(0, Number(row.cantidad) || 0), row.cantidadMax > 0 ? row.cantidadMax : Number(row.cantidad) || 0);
      const precioUnitario = Math.min(Math.max(0, Number(row.precioUnitario) || 0), row.precioMax > 0 ? row.precioMax : Number(row.precioUnitario) || 0);
      if (cantidad <= 0 || precioUnitario <= 0) return null;
      const descuentoPct = Number(row.descuentoPct) || 0;
      const detalle = detalleDteOpcional(row.detalle);
      return {
        descripcion: row.descripcion,
        ...(detalle ? { detalle } : {}),
        cantidad,
        precioUnitario,
        descuentoPct,
        total: totalLineaNcRebaja({ cantidad, precioUnitario, descuentoPct }),
        tipoLinea: row.tipoLinea,
        insumoId: row.insumoId,
        codigoProducto: row.codigoProducto,
        unidadMedida: row.unidadMedida,
        cuentaContableId: row.cuentaContableId,
        centroCostoId: row.centroCostoId,
      } satisfies DocumentoLinea;
    })
    .filter((l) => l != null);
}

/** CodRef 3: la NC no puede igualar ni superar el neto de la factura. */
export function ncIgualaOSuperaFactura(netoNc: number, netoFactura: number): boolean {
  const nc = Number(netoNc) || 0;
  const fact = Number(netoFactura) || 0;
  if (fact <= 0) return nc > 0;
  return nc + 0.005 >= fact;
}

export function referenciaManualCompleta(d: {
  tipo?: string;
  folio?: string;
  fecha?: string;
  codRef?: number | null;
}): boolean {
  return esTipoDteReferencia(d.tipo)
    && Boolean(String(d.folio || '').trim())
    && Boolean(String(d.fecha || '').trim())
    && (d.codRef === 1 || d.codRef === 2 || d.codRef === 3);
}

function claveAsociacion(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toLowerCase();
}

export function clavesDocumentoAsociacion(
  d: Pick<DocumentoComercial, 'id' | 'folio' | 'folioOficial'>,
): string[] {
  return [d.id, d.folio]
    .map((v) => claveAsociacion(v))
    .filter(Boolean);
}

export function clavesOrigenAsociacion(
  d: Pick<DocumentoComercial, 'documentoOrigenId' | 'folioOrigen'>,
): string[] {
  return [d.documentoOrigenId, d.folioOrigen]
    .map((v) => claveAsociacion(v))
    .filter(Boolean);
}

function esDteAsociable(tipo: string | null | undefined): boolean {
  const t = (tipo || '').toUpperCase();
  return t === 'FACTURA' || t === 'NC' || t === 'ND';
}

type NotaAsociable = Pick<
  DocumentoComercial,
  'tipo' | 'documentoOrigenId' | 'folioOrigen' | 'referenciaFolio' | 'referenciaTipo'
>;
type FacturaAsociable = Pick<
  DocumentoComercial,
  'id' | 'folio' | 'folioOficial' | 'tipo' | 'indicadorVenta'
>;

/** NC/ND del movimiento real: id ERP, folio interno, o folio SII + tipo DTE. */
export function ncNdApuntaAFactura(nota: NotaAsociable, factura: FacturaAsociable): boolean {
  const t = (nota.tipo || '').toUpperCase();
  if (t !== 'NC' && t !== 'ND') return false;
  const id = claveAsociacion(factura.id);
  if (id && claveAsociacion(nota.documentoOrigenId) === id) return true;

  const interno = claveAsociacion(factura.folio);
  if (interno && claveAsociacion(nota.folioOrigen) === interno) return true;

  const oficial = claveAsociacion(factura.folioOficial);
  const refFolio = claveAsociacion(nota.referenciaFolio);
  const origenFolio = claveAsociacion(nota.folioOrigen);
  const folioSiiHit = Boolean(oficial) && (refFolio === oficial || origenFolio === oficial);
  if (!folioSiiHit) return false;

  const refTipo = String(nota.referenciaTipo || '').trim();
  if (!esTipoDteReferencia(refTipo)) return false;
  return claveAsociacion(refTipo) === claveAsociacion(mapTipoDteErp(factura.tipo, factura.indicadorVenta));
}

function padreEnPool(
  d: DocumentoComercial,
  pool: Map<string, DocumentoComercial>,
): DocumentoComercial | undefined {
  const t = (d.tipo || '').toUpperCase();
  if (t !== 'NC' && t !== 'ND') return undefined;
  for (const p of pool.values()) {
    if (p.id === d.id) continue;
    if ((p.tipo || '').toUpperCase() !== 'FACTURA') continue;
    if (ncNdApuntaAFactura(d, p)) return p;
  }
  return undefined;
}

function raizAsociacion(
  seed: DocumentoComercial,
  pool: Map<string, DocumentoComercial>,
): DocumentoComercial {
  let cur = seed;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if ((cur.tipo || '').toUpperCase() === 'FACTURA') return cur;
    const padre = padreEnPool(cur, pool);
    if (!padre) return cur;
    cur = padre;
  }
  return seed;
}

/** FACTURA origen + NC/ND que apuntan a esa factura (varias correcciones). */
export function historialDocumentosAsociados(
  seed: DocumentoComercial,
  docs: DocumentoComercial[],
): DocumentoComercial[] {
  const pool = new Map<string, DocumentoComercial>();
  for (const d of docs) {
    if (esDteAsociable(d.tipo)) pool.set(d.id, d);
  }
  if (esDteAsociable(seed.tipo)) pool.set(seed.id, seed);
  else return [];

  const raiz = raizAsociacion(seed, pool);
  const rows = [...pool.values()].filter((d) => raizAsociacion(d, pool).id === raiz.id);

  return rows.sort((a, b) => {
    const ta = (a.tipo || '').toUpperCase() === 'FACTURA' ? 0 : 1;
    const tb = (b.tipo || '').toUpperCase() === 'FACTURA' ? 0 : 1;
    if (ta !== tb) return ta - tb;
    return String(a.fecha || '').localeCompare(String(b.fecha || ''))
      || String(a.folio || '').localeCompare(String(b.folio || ''));
  });
}

/** Texto de la columna: en NC/ND el origen; en factura la última corrección + resto. */
export function etiquetaHistorialAsociacion(
  seed: DocumentoComercial,
  historial: DocumentoComercial[],
): string | null {
  const tipo = (seed.tipo || '').toUpperCase();
  const origenFolio = String(seed.referenciaFolio || seed.folioOrigen || '').trim();
  if ((tipo === 'NC' || tipo === 'ND') && origenFolio) {
    return `${tipo} → factura ${origenFolio}`;
  }
  const otros = historial.filter((d) => d.id !== seed.id);
  if (!otros.length) return null;
  const anula = ncAnulacionDeFactura(historial);
  if ((tipo === 'FACTURA' || tipo === 'ORDEN_VENTA') && anula) {
    const extra = otros.filter((d) => d.id !== anula.id).length;
    return extra
      ? `Anulada · ver NC ${folioSiiOInterno(anula)} · +${extra}`
      : `Anulada · ver NC ${folioSiiOInterno(anula)}`;
  }
  const ultima = [...otros].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))
    || folioInternoSortValue(b.folio) - folioInternoSortValue(a.folio))[0];
  const lastLabel = `${ultima.tipo} ${folioSiiOInterno(ultima)}`;
  if (otros.length === 1) return lastLabel;
  return `${lastLabel} · +${otros.length - 1}`;
}

export function labelCodRefCorto(cod?: number | null): string {
  if (cod === 1) return '1 · Anula';
  if (cod === 2) return '2 · Texto';
  if (cod === 3) return '3 · Montos';
  return '—';
}
