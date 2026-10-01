import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../auth/jwt.strategy';
import {
  assertTenantAccess,
  isSuperAdmin,
  resolveOperationalEmpresa,
  resolveTenant,
} from '../../auth/tenant.util';
import {
  BillingGatewayClient,
  isUsableGlobalDocumentId,
  type BillingArtifact,
  type BillingEmissionResult,
  type DteArtifactKind,
} from '../billing/billing-gateway.client';
import {
  assertExportacionFailClosed,
  buildCanonicalFromDocumento,
  mapTipoDte,
} from '../billing/canonical-builder';
import { ContabilizarService } from '../contabilidad/contabilizar.service';
import {
  combinarDimensiones,
  dimensionesDeConfigSii,
  type DimensionesAsiento,
} from '../contabilidad/config-sii-dimensiones.util';

type LineaAsientoVenta = {
  debe: number;
  haber: number;
  cuentaId?: string;
  glosa?: string;
} & DimensionesAsiento;
import { CuentaCorrienteService } from '../tesoreria/cuenta-corriente.service';
import { upsertAgingDesdeVenta } from '../tesoreria/aging-sync.util';
import { NotificacionesService } from '../dashboard/notificaciones.service';
import {
  DocumentoLineaDto,
  UpsertClienteDto,
  UpsertDocumentoDto,
  UpsertGuiaDespachoDto,
  UpsertProspectoDto,
} from './dto/comercial.dto';
import {
  assertDomicilioFiscalCliente,
  resolveDomicilioFiscal,
  TIPOS_DTE_EXIGEN_DOMICILIO_RECEPTOR,
} from './cliente-domicilio.util';
import {
  fichaIncludeCliente,
  mapClienteFicha,
  syncClienteFicha,
} from '../ficha/ficha-contraparte.util';
import {
  applyStockDelta,
  consumirReservasOv,
  liberarReservasOv,
  requireBodega,
} from '../insumos/stock-bodega.util';
import { ESTADO_OV_CONFIRMADA, normalizeEstadoOv, ovEsFacturable } from './ov-estado.util';
import {
  esTipoDteReferencia,
  esTipoOrigenNcNd,
  referenciaManualCompleta,
} from './nc-nd-referencia.util';
const TIPOS_DOC = new Set(['FACTURA', 'NC', 'ND', 'GUIA', 'ORDEN_VENTA']);
/** Tipos que ya no se dan de alta ni se listan como documentos de venta (histórico PG se conserva). */
const TIPOS_RETIRADOS = new Set(['COTIZACION', 'NP']);
const TIPOS_LISTADO_VENTAS = ['FACTURA', 'NC', 'ND', 'GUIA', 'ORDEN_VENTA'] as const;
/** Bandeja de borradores de Ventas (DTE + OV). */
const TIPOS_BORRADOR_VENTAS = ['FACTURA', 'NC', 'ND', 'GUIA', 'ORDEN_VENTA'] as const;
const MSG_COTIZACION_NO_DOC =
  'Las compras parten de la orden de compra; la cotización del proveedor es solo referencia (tipo, folio y fecha) en la OC. No se crea ni convierte un documento COTIZACION.';
const MSG_NP_NO_DOC =
  'La nota de pedido no forma parte del flujo de ventas. Use una orden de venta.';
const ESTADOS_PROS = new Set(['NUEVO', 'CONTACTADO', 'CALIFICADO', 'CONVERTIDO']);

function assertTipoDocumentoAlta(tipo: string) {
  if (tipo === 'COTIZACION') throw new BadRequestException(MSG_COTIZACION_NO_DOC);
  if (tipo === 'NP') throw new BadRequestException(MSG_NP_NO_DOC);
  if (!TIPOS_DOC.has(tipo)) throw new BadRequestException('tipo inválido');
}

function assertTipoDocumentoVigente(tipo: string, mode: 'get' | 'mutate') {
  if (!TIPOS_RETIRADOS.has(tipo)) return;
  if (mode === 'get') throw new NotFoundException('Documento no encontrado');
  throw new BadRequestException(tipo === 'COTIZACION' ? MSG_COTIZACION_NO_DOC : MSG_NP_NO_DOC);
}

const STUB_BILLING_DISCLAIMER =
  'Partner stub (facturador de pruebas). No es DTE aceptado por el SII.';
const PENDING_BILLING_DISCLAIMER =
  'DTE enviado al facturador (proceso asíncrono). Folio oficial pendiente.';

function billingPatchFromEmission(
  emission: BillingEmissionResult,
): Prisma.DocumentoComercialUpdateInput {
  return {
    billingEmissionId: emission.emissionId,
    billingPartner: emission.partner,
    billingConnectionMode: emission.connectionMode,
    billingStatus: emission.status,
    folioOficial: emission.folioOficial,
    billingGlobalDocumentId: emission.globalDocumentId,
    billingDisclaimer: emission.disclaimer
      || (emission.stub ? STUB_BILLING_DISCLAIMER : null)
      || (emission.status === 'PENDING' ? PENDING_BILLING_DISCLAIMER : null),
    billingStub: emission.stub,
    billingEmittedAt: new Date(),
  };
}

const REJECTED_BILLING_DISCLAIMER = 'El SII rechazó el DTE.';
const ACCEPTED_BILLING_DISCLAIMER = 'DTE aceptado por el SII.';

function isTerminalBillingStatus(status: string | null | undefined): boolean {
  const value = (status || '').toUpperCase();
  return value === 'ACCEPTED' || value === 'REJECTED';
}

function billingPatchFromRefresh(
  existing: {
    folioOficial?: string | null;
    billingGlobalDocumentId?: string | null;
    billingStatus?: string | null;
    billingDisclaimer?: string | null;
  },
  emission: BillingEmissionResult,
): Prisma.DocumentoComercialUpdateInput {
  const keepTerminal = isTerminalBillingStatus(existing.billingStatus)
    && emission.status === 'PENDING';
  const folioOficial = keepTerminal
    ? existing.folioOficial || emission.folioOficial || null
    : emission.folioOficial || existing.folioOficial || null;
  let disclaimer = keepTerminal ? existing.billingDisclaimer : emission.disclaimer;
  if (!disclaimer && !keepTerminal) {
    if (emission.status === 'REJECTED') disclaimer = emission.messages[0] || REJECTED_BILLING_DISCLAIMER;
    else if (emission.status === 'ACCEPTED') {
      disclaimer = folioOficial
        ? `DTE aceptado por el SII. Folio oficial ${folioOficial}.`
        : ACCEPTED_BILLING_DISCLAIMER;
    } else if (emission.status === 'PENDING') disclaimer = PENDING_BILLING_DISCLAIMER;
  }
  return {
    billingStatus: keepTerminal ? existing.billingStatus : emission.status,
    folioOficial,
    billingGlobalDocumentId: isUsableGlobalDocumentId(emission.globalDocumentId)
      ? emission.globalDocumentId
      : existing.billingGlobalDocumentId,
    billingDisclaimer: disclaimer,
    billingPartner: emission.partner,
    billingConnectionMode: emission.connectionMode,
    billingStub: emission.stub,
  };
}

function estadoGuiaFromDoc(estado: string): 'BORRADOR' | 'EMITIDA' | 'FACTURADA' | 'ANULADA' {
  const e = estado.toUpperCase();
  if (e === 'ANULADO') return 'ANULADA';
  if (e === 'FACTURADO') return 'FACTURADA';
  if (e === 'BORRADOR') return 'BORRADOR';
  return 'EMITIDA';
}

export type DocumentoLineaNorm = {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuentoPct: number;
  total: number;
  codigoProducto?: string;
  unidadMedida?: string;
  cuentaContableId?: string;
  centroCostoId?: string;
  tipoLinea?: string;
  insumoId?: string;
  bodegaId?: string;
  splits?: { bodegaId: string; cantidad: number }[];
};

function normalizeTipoLinea(raw?: string): string | undefined {
  const t = (raw || '').trim().toUpperCase();
  if (!t) return undefined;
  if (t === 'RECARGO' || t === 'FLETE') return 'FLETE';
  return t;
}

function parseDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Fecha inválida: ${value}`);
  return d;
}

/** Fecha opcional: string vacío / null → null; undefined → no tocar (caller). */
function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value == null || !String(value).trim()) return null;
  return parseDate(String(value).trim());
}

function optStr(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  return t || null;
}

function fillStrComex(dtoVal?: string, origenVal?: string | null): string | undefined {
  const d = dtoVal != null ? String(dtoVal).trim() : '';
  if (d) return d;
  const o = origenVal != null ? String(origenVal).trim() : '';
  return o || undefined;
}

function fillNumComex(dtoVal?: number, origenVal?: unknown): number | undefined {
  if (dtoVal != null && Number.isFinite(Number(dtoVal))) return Number(dtoVal);
  if (origenVal == null || origenVal === '') return undefined;
  const n = Number(origenVal);
  return Number.isFinite(n) ? n : undefined;
}

/** NC/ND sobre factura 110: si el DTO no trae COMEX, copiar del origen (fail-closed país receptor). */
function inheritComexFromOrigen(
  dto: UpsertDocumentoDto,
  origen: {
    indicadorVenta?: string | null;
    monedaCodigo?: string | null;
    tpoMoneda?: string | null;
    tipoCambio?: unknown;
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
    montoOtraMoneda?: unknown;
    montoExentoOtraMoneda?: unknown;
    receptorRut?: string | null;
    receptorGiro?: string | null;
    receptorDireccion?: string | null;
    receptorComuna?: string | null;
    receptorCiudad?: string | null;
  },
): UpsertDocumentoDto {
  if ((origen.indicadorVenta || '').toUpperCase() !== 'EXPORTACION') return dto;
  return {
    ...dto,
    indicadorVenta: fillStrComex(dto.indicadorVenta, origen.indicadorVenta) || 'EXPORTACION',
    monedaCodigo: fillStrComex(dto.monedaCodigo, origen.monedaCodigo),
    tpoMoneda: fillStrComex(dto.tpoMoneda, origen.tpoMoneda),
    tipoCambio: fillNumComex(dto.tipoCambio, origen.tipoCambio),
    paisRecepCodigo: fillStrComex(dto.paisRecepCodigo, origen.paisRecepCodigo),
    paisDestino: fillStrComex(dto.paisDestino, origen.paisDestino),
    puertoEmbarque: fillStrComex(dto.puertoEmbarque, origen.puertoEmbarque),
    puertoDesembarque: fillStrComex(dto.puertoDesembarque, origen.puertoDesembarque),
    clausulaVenta: fillStrComex(dto.clausulaVenta, origen.clausulaVenta),
    viaTransporte: fillStrComex(dto.viaTransporte, origen.viaTransporte),
    modalidadVenta: fillStrComex(dto.modalidadVenta, origen.modalidadVenta),
    indTraslado: fillStrComex(dto.indTraslado, origen.indTraslado),
    bultoTipoCodigo: fillStrComex(dto.bultoTipoCodigo, origen.bultoTipoCodigo),
    bultoCantidad: fillNumComex(dto.bultoCantidad, origen.bultoCantidad),
    bultoMarca: fillStrComex(dto.bultoMarca, origen.bultoMarca),
    montoOtraMoneda: fillNumComex(dto.montoOtraMoneda, origen.montoOtraMoneda),
    montoExentoOtraMoneda: fillNumComex(dto.montoExentoOtraMoneda, origen.montoExentoOtraMoneda),
    receptorRut: fillStrComex(dto.receptorRut, origen.receptorRut),
    receptorGiro: fillStrComex(dto.receptorGiro, origen.receptorGiro),
    receptorDireccion: fillStrComex(dto.receptorDireccion, origen.receptorDireccion),
    receptorComuna: fillStrComex(dto.receptorComuna, origen.receptorComuna),
    receptorCiudad: fillStrComex(dto.receptorCiudad, origen.receptorCiudad),
  };
}

/** Campos COMEX opcionales desde DTO (create/update parcial). */
function comexDataFromDto(dto: UpsertDocumentoDto, mode: 'create' | 'patch') {
  const patch = <T>(key: keyof UpsertDocumentoDto, value: T) =>
    mode === 'create' || dto[key] !== undefined ? value : undefined;

  const data: Record<string, unknown> = {};
  const set = (k: string, v: unknown, fromKey: keyof UpsertDocumentoDto) => {
    if (mode === 'patch' && dto[fromKey] === undefined) return;
    data[k] = v;
  };
  set('monedaCodigo', optStr(dto.monedaCodigo), 'monedaCodigo');
  set('tpoMoneda', optStr(dto.tpoMoneda), 'tpoMoneda');
  set(
    'tipoCambio',
    dto.tipoCambio != null && Number.isFinite(Number(dto.tipoCambio))
      ? Number(dto.tipoCambio)
      : null,
    'tipoCambio',
  );
  set('paisRecepCodigo', optStr(dto.paisRecepCodigo), 'paisRecepCodigo');
  set('paisDestino', optStr(dto.paisDestino), 'paisDestino');
  set('puertoEmbarque', optStr(dto.puertoEmbarque), 'puertoEmbarque');
  set('puertoDesembarque', optStr(dto.puertoDesembarque), 'puertoDesembarque');
  set('clausulaVenta', optStr(dto.clausulaVenta), 'clausulaVenta');
  set('viaTransporte', optStr(dto.viaTransporte), 'viaTransporte');
  set('modalidadVenta', optStr(dto.modalidadVenta), 'modalidadVenta');
  set('indTraslado', optStr(dto.indTraslado), 'indTraslado');
  set('bultoTipoCodigo', optStr(dto.bultoTipoCodigo), 'bultoTipoCodigo');
  set(
    'bultoCantidad',
    dto.bultoCantidad != null && Number.isFinite(Number(dto.bultoCantidad))
      ? Math.trunc(Number(dto.bultoCantidad))
      : null,
    'bultoCantidad',
  );
  set('bultoMarca', optStr(dto.bultoMarca), 'bultoMarca');
  set(
    'montoOtraMoneda',
    dto.montoOtraMoneda != null && Number.isFinite(Number(dto.montoOtraMoneda))
      ? Number(dto.montoOtraMoneda)
      : null,
    'montoOtraMoneda',
  );
  set(
    'montoExentoOtraMoneda',
    dto.montoExentoOtraMoneda != null && Number.isFinite(Number(dto.montoExentoOtraMoneda))
      ? Number(dto.montoExentoOtraMoneda)
      : null,
    'montoExentoOtraMoneda',
  );
  set('referenciaFecha', parseOptionalDate(dto.referenciaFecha), 'referenciaFecha');
  void patch;
  return data;
}

function normalizeLineas(raw?: DocumentoLineaDto[] | null): DocumentoLineaNorm[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) throw new BadRequestException('lineas debe ser un arreglo');
  const out: DocumentoLineaNorm[] = [];
  for (const [i, l] of raw.entries()) {
    const descripcion = String(l?.descripcion ?? '').trim();
    const cantidad = Number(l?.cantidad);
    const precioUnitario = Number(l?.precioUnitario);
    const descuentoPct = Number(l?.descuentoPct ?? 0);
    if (!descripcion) {
      throw new BadRequestException(`Línea ${i + 1}: descripción requerida`);
    }
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      throw new BadRequestException(`Línea ${i + 1}: cantidad inválida`);
    }
    if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
      throw new BadRequestException(`Línea ${i + 1}: precio inválido`);
    }
    if (!Number.isFinite(descuentoPct) || descuentoPct < 0 || descuentoPct > 100) {
      throw new BadRequestException(`Línea ${i + 1}: descuento % inválido`);
    }
    const bruto = cantidad * precioUnitario;
    const total = Math.round(bruto * (1 - descuentoPct / 100) * 100) / 100;
    const cuentaContableId = optStr(l?.cuentaContableId) ?? undefined;
    const centroCostoId = optStr(l?.centroCostoId) ?? undefined;
    const codigoProducto = optStr(l?.codigoProducto) ?? undefined;
    const unidadMedida = optStr(l?.unidadMedida) ?? undefined;
    const tipoLinea = normalizeTipoLinea(optStr(l?.tipoLinea) ?? undefined);
    const insumoId = optStr(l?.insumoId) ?? undefined;
    const bodegaId = optStr(l?.bodegaId) ?? undefined;
    const splitsRaw = Array.isArray(l?.splits) ? l.splits : undefined;
    const splits = splitsRaw
      ?.map((s: { bodegaId?: string; cantidad?: number }) => ({
        bodegaId: String(s?.bodegaId ?? '').trim(),
        cantidad: Number(s?.cantidad ?? 0),
      }))
      .filter((s: { bodegaId: string; cantidad: number }) => s.bodegaId && s.cantidad > 0);
    out.push({
      descripcion,
      cantidad,
      precioUnitario,
      descuentoPct,
      total,
      ...(codigoProducto ? { codigoProducto } : {}),
      ...(unidadMedida ? { unidadMedida } : {}),
      ...(cuentaContableId ? { cuentaContableId } : {}),
      ...(centroCostoId ? { centroCostoId } : {}),
      ...(tipoLinea ? { tipoLinea } : {}),
      ...(insumoId ? { insumoId } : {}),
      ...(bodegaId ? { bodegaId } : {}),
      ...(splits?.length ? { splits } : {}),
    });
  }
  return out;
}

function netoFromLineas(lineas: DocumentoLineaNorm[], descuentoGlobalPct = 0): number {
  const subtotal = lineas.reduce((a, l) => a + l.total, 0);
  const pct = Number.isFinite(descuentoGlobalPct) ? Math.min(100, Math.max(0, descuentoGlobalPct)) : 0;
  const neto = subtotal * (1 - pct / 100);
  return Math.round(neto * 100) / 100;
}

const IVA_TASA = 0.19;
/** EXPORTACION (y EXENTO por si se usa en carga masiva/legado) no llevan IVA. */
function esIndicadorExento(indicadorVenta?: string | null): boolean {
  const v = (indicadorVenta || '').toUpperCase();
  return v === 'EXPORTACION' || v === 'EXENTO';
}
/** P1-7: IVA real. Si no viene explícito desde el front, se calcula 19% del neto. */
function ivaFromNeto(neto: number, indicadorVenta?: string | null): number {
  if (esIndicadorExento(indicadorVenta)) return 0;
  return Math.round(neto * IVA_TASA * 100) / 100;
}

/** Huella de stock (producto + bodega + cantidad). Precio/COMEX no cuentan. */
function stockHuellaLineas(lineas: DocumentoLineaNorm[]): string {
  const rows = lineas
    .filter((l) => (l.tipoLinea || '').toUpperCase() === 'PRODUCTO' && l.insumoId)
    .map((l) => {
      const splits = (l.splits?.length
        ? l.splits
        : l.bodegaId
          ? [{ bodegaId: l.bodegaId, cantidad: l.cantidad }]
          : [])
        .map((s) => ({ bodegaId: String(s.bodegaId), cantidad: Number(s.cantidad) }))
        .sort((a, b) => a.bodegaId.localeCompare(b.bodegaId));
      return { insumoId: String(l.insumoId), splits };
    });
  rows.sort((a, b) => a.insumoId.localeCompare(b.insumoId)
    || JSON.stringify(a.splits).localeCompare(JSON.stringify(b.splits)));
  return JSON.stringify(rows);
}

function parseStoredLineas(value: unknown): DocumentoLineaNorm[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((l) => {
    const row = l as Partial<DocumentoLineaNorm>;
    const cuentaContableId = row.cuentaContableId ? String(row.cuentaContableId) : undefined;
    const centroCostoId = row.centroCostoId ? String(row.centroCostoId) : undefined;
    return {
      descripcion: String(row.descripcion ?? ''),
      cantidad: Number(row.cantidad ?? 0),
      precioUnitario: Number(row.precioUnitario ?? 0),
      descuentoPct: Number(row.descuentoPct ?? 0),
      total: Number(row.total ?? 0),
      ...(cuentaContableId ? { cuentaContableId } : {}),
      ...(centroCostoId ? { centroCostoId } : {}),
      ...(row.tipoLinea ? { tipoLinea: normalizeTipoLinea(String(row.tipoLinea)) } : {}),
      ...(row.insumoId ? { insumoId: String(row.insumoId) } : {}),
      ...(row.bodegaId ? { bodegaId: String(row.bodegaId) } : {}),
      ...(row.codigoProducto ? { codigoProducto: String(row.codigoProducto) } : {}),
      ...(row.unidadMedida ? { unidadMedida: String(row.unidadMedida) } : {}),
      ...(Array.isArray(row.splits) ? { splits: row.splits } : {}),
    };
  });
}

function mapDoc(r: {
  id: string;
  folio: string;
  tipo: string;
  cliente: string;
  clienteId: string | null;
  proveedorId?: string | null;
  fecha: Date;
  neto: Prisma.Decimal;
  iva?: Prisma.Decimal | null;
  lineas?: Prisma.JsonValue | null;
  estado: string;
  fromReversa: boolean;
  folioOrigen: string | null;
  documentoOrigenId?: string | null;
  asientoOriginal: string | null;
  asientoReversador: string | null;
  asientoNuevo: string | null;
  folioReversador: string | null;
  referenciaTipo?: string | null;
  referenciaFolio?: string | null;
  observaciones?: string | null;
  formaPago?: string | null;
  fechaVencimiento?: Date | null;
  indicadorVenta?: string | null;
  descuentoGlobalPct?: Prisma.Decimal | null;
  cuentaContableId?: string | null;
  centroCostoId?: string | null;
  receptorRut?: string | null;
  receptorGiro?: string | null;
  receptorDireccion?: string | null;
  receptorComuna?: string | null;
  receptorCiudad?: string | null;
  monedaCodigo?: string | null;
  tpoMoneda?: string | null;
  tipoCambio?: Prisma.Decimal | null;
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
  montoOtraMoneda?: Prisma.Decimal | null;
  montoExentoOtraMoneda?: Prisma.Decimal | null;
  referenciaFecha?: Date | null;
  referenciaCod?: number | null;
  billingEmissionId?: string | null;
  billingPartner?: string | null;
  billingConnectionMode?: string | null;
  billingStatus?: string | null;
  folioOficial?: string | null;
  billingGlobalDocumentId?: string | null;
  billingDisclaimer?: string | null;
  billingStub?: boolean | null;
  billingEmittedAt?: Date | null;
  creadoPorId?: string | null;
  creadoPorNombre?: string | null;
  createdAt?: Date | null;
  empresaId?: string;
  empresa?: { id: string; razonSocial: string } | null;
}) {
  const lineas = parseStoredLineas(r.lineas);
  return {
    id: r.id,
    folio: r.folio,
    tipo: r.tipo,
    cliente: r.cliente,
    clienteId: r.clienteId ?? undefined,
    proveedorId: r.proveedorId ?? undefined,
    fecha: r.fecha.toISOString().slice(0, 10),
    neto: Number(r.neto),
    iva: r.iva != null ? Number(r.iva) : ivaFromNeto(Number(r.neto), r.indicadorVenta),
    total: Number(r.neto) + (r.iva != null ? Number(r.iva) : ivaFromNeto(Number(r.neto), r.indicadorVenta)),
    lineas,
    estado: r.estado,
    fromReversa: r.fromReversa || undefined,
    folioOrigen: r.folioOrigen ?? undefined,
    documentoOrigenId: r.documentoOrigenId ?? undefined,
    asientoOriginal: r.asientoOriginal ?? undefined,
    asientoReversador: r.asientoReversador ?? undefined,
    asientoNuevo: r.asientoNuevo ?? undefined,
    folioReversador: r.folioReversador ?? undefined,
    referenciaTipo: r.referenciaTipo ?? undefined,
    referenciaFolio: r.referenciaFolio ?? undefined,
    observaciones: r.observaciones ?? undefined,
    formaPago: r.formaPago ?? undefined,
    fechaVencimiento: r.fechaVencimiento
      ? r.fechaVencimiento.toISOString().slice(0, 10)
      : undefined,
    indicadorVenta: r.indicadorVenta ?? undefined,
    descuentoGlobalPct:
      r.descuentoGlobalPct != null ? Number(r.descuentoGlobalPct) : undefined,
    cuentaContableId: r.cuentaContableId ?? undefined,
    centroCostoId: r.centroCostoId ?? undefined,
    receptorRut: r.receptorRut ?? undefined,
    receptorGiro: r.receptorGiro ?? undefined,
    receptorDireccion: r.receptorDireccion ?? undefined,
    receptorComuna: r.receptorComuna ?? undefined,
    receptorCiudad: r.receptorCiudad ?? undefined,
    monedaCodigo: r.monedaCodigo ?? undefined,
    tpoMoneda: r.tpoMoneda ?? undefined,
    tipoCambio: r.tipoCambio != null ? Number(r.tipoCambio) : undefined,
    paisRecepCodigo: r.paisRecepCodigo ?? undefined,
    paisDestino: r.paisDestino ?? undefined,
    puertoEmbarque: r.puertoEmbarque ?? undefined,
    puertoDesembarque: r.puertoDesembarque ?? undefined,
    clausulaVenta: r.clausulaVenta ?? undefined,
    viaTransporte: r.viaTransporte ?? undefined,
    modalidadVenta: r.modalidadVenta ?? undefined,
    indTraslado: r.indTraslado ?? undefined,
    bultoTipoCodigo: r.bultoTipoCodigo ?? undefined,
    bultoCantidad: r.bultoCantidad ?? undefined,
    bultoMarca: r.bultoMarca ?? undefined,
    montoOtraMoneda: r.montoOtraMoneda != null ? Number(r.montoOtraMoneda) : undefined,
    montoExentoOtraMoneda:
      r.montoExentoOtraMoneda != null ? Number(r.montoExentoOtraMoneda) : undefined,
    referenciaFecha: r.referenciaFecha
      ? r.referenciaFecha.toISOString().slice(0, 10)
      : undefined,
    referenciaCod: r.referenciaCod ?? undefined,
    billingEmissionId: r.billingEmissionId ?? undefined,
    billingPartner: r.billingPartner ?? undefined,
    billingConnectionMode: r.billingConnectionMode ?? undefined,
    billingStatus: r.billingStatus ?? undefined,
    folioOficial: r.folioOficial ?? undefined,
    billingGlobalDocumentId: r.billingGlobalDocumentId ?? undefined,
    billingDisclaimer: r.billingDisclaimer ?? undefined,
    billingStub: r.billingStub ?? undefined,
    billingEmittedAt: r.billingEmittedAt
      ? r.billingEmittedAt.toISOString()
      : undefined,
    creadoPorId: r.creadoPorId ?? undefined,
    creadoPorNombre: r.creadoPorNombre ?? undefined,
    createdAt: r.createdAt ? r.createdAt.toISOString() : undefined,
    empresaId: r.empresaId ?? r.empresa?.id,
    empresaNombre: r.empresa?.razonSocial,
  };
}

@Injectable()
export class ComercialService {
  constructor(
    private prisma: PrismaService,
    @Optional() private contabilizar?: ContabilizarService,
    @Optional() private cuentaCorriente?: CuentaCorrienteService,
    @Optional() private billing?: BillingGatewayClient,
    @Optional() private notificaciones?: NotificacionesService,
  ) {}

  /**
   * Resuelve cuenta de imputación + contrapartida (clientes) para un documento,
   * usando Config SII → cuenta, y si no hay configuración cae al primer par de
   * cuentas imputables activas. Usado tanto al contabilizar como al reversar
   * (P0-1: nunca generar líneas de asiento sin cuentaId).
   */
  private async resolveCuentasImputacion(
    empresaId: string,
    tipo: string,
    headerCuentaId?: string | null,
  ): Promise<{
    cuentaId: string;
    contraId: string;
    dimCuenta: DimensionesAsiento;
    dimContra: DimensionesAsiento;
  }> {
    let cuentaId = headerCuentaId?.trim() || undefined;
    let dimCuenta: DimensionesAsiento = {};
    if (!cuentaId) {
      const tipSii = tipo === 'NC' ? 'NC' : 'VENTAS';
      const cfg = await this.prisma.configContableSii.findFirst({
        where: {
          empresaId,
          activa: true,
          tipoDocumentoSii: { in: [tipSii, 'VENTAS', 'INGRESO_VENTA', 'CLIENTES'] },
        },
        orderBy: { tipoDocumentoSii: 'asc' },
      });
      cuentaId = cfg?.cuentaContableId;
      if (cuentaId) dimCuenta = dimensionesDeConfigSii(cfg);
    }
    if (!cuentaId) {
      const cta = await this.prisma.cuentaContable.findFirst({
        where: { empresaId, activa: true, noImputable: false },
        orderBy: { codigo: 'asc' },
      });
      cuentaId = cta?.id;
    }
    if (!cuentaId) {
      throw new BadRequestException('Selecciona cuenta contable o configura SII → cuenta');
    }

    const cfgClientes = await this.prisma.configContableSii.findFirst({
      where: {
        empresaId,
        activa: true,
        tipoDocumentoSii: { in: ['CLIENTES', 'CLIENTES_POR_COBRAR'] },
      },
    });
    let contraId = cfgClientes?.cuentaContableId;
    let dimContra = contraId ? dimensionesDeConfigSii(cfgClientes) : {};
    if (!contraId) {
      const contra = await this.prisma.cuentaContable.findFirst({
        where: { empresaId, activa: true, noImputable: false, id: { not: cuentaId } },
        orderBy: { codigo: 'asc' },
      });
      contraId = contra?.id || cuentaId;
      dimContra = {};
    }
    return { cuentaId, contraId, dimCuenta, dimContra };
  }

  /** P1-7: cuenta de IVA débito fiscal (venta) / crédito fiscal (NC). */
  private async resolveCuentaIva(
    empresaId: string,
    tipo: string,
    excluir: (string | undefined)[],
  ): Promise<{ cuentaId: string | undefined; dim: DimensionesAsiento }> {
    const tiposIva = tipo === 'NC'
      ? ['IVA_CREDITO_NC', 'IVA_CREDITO', 'IVA_DEBITO']
      : ['IVA_DEBITO', 'IVA_DEBITO_FISCAL', 'IVA_VENTAS'];
    const cfgIva = await this.prisma.configContableSii.findFirst({
      where: { empresaId, activa: true, tipoDocumentoSii: { in: tiposIva } },
    });
    if (cfgIva?.cuentaContableId) {
      return { cuentaId: cfgIva.cuentaContableId, dim: dimensionesDeConfigSii(cfgIva) };
    }
    const usadas = excluir.filter((v): v is string => Boolean(v));
    const otra = await this.prisma.cuentaContable.findFirst({
      where: {
        empresaId,
        activa: true,
        noImputable: false,
        ...(usadas.length ? { id: { notIn: usadas } } : {}),
      },
      orderBy: { codigo: 'asc' },
    });
    // Sin mapeo no hay dimensión que arrastrar: la caída al plan es de rescate.
    return { cuentaId: otra?.id || usadas[0], dim: {} };
  }

  /**
   * Arma el asiento de venta/NC/ND (CXC + ingresos + IVA) para validarlo antes
   * de emitir el DTE. Cada línea lleva las dimensiones que exija su cuenta.
   */
  private buildAsientoVentasLineas(input: {
    tipo: string;
    neto: number;
    ivaMonto: number;
    cuentaId?: string;
    contraId: string;
    ivaCuentaId?: string;
    ccRef?: string;
    lineasDoc: DocumentoLineaNorm[];
    /** Dimensiones del mapeo Config SII; cubren lo que el documento no trae. */
    dimVentas?: DimensionesAsiento;
    dimClientes?: DimensionesAsiento;
    dimIva?: DimensionesAsiento;
  }): LineaAsientoVenta[] {
    const {
      tipo, neto: monto, ivaMonto, cuentaId, contraId, ivaCuentaId, ccRef, lineasDoc,
    } = input;
    const dimVentas = input.dimVentas ?? {};
    const dimClientes = input.dimClientes ?? {};
    const dimIva = input.dimIva ?? {};
    const montoTotal = monto + ivaMonto;
    const esNc = tipo === 'NC';
    const subtotalLineas = lineasDoc.reduce((a, l) => a + l.total, 0);
    const asientoLineas: LineaAsientoVenta[] = [];
    const lineaIva = ivaMonto > 0 && ivaCuentaId
      ? (esNc
          ? { debe: ivaMonto, haber: 0, cuentaId: ivaCuentaId, glosa: 'IVA crédito fiscal (reversa NC)', ...dimIva }
          : { debe: 0, haber: ivaMonto, cuentaId: ivaCuentaId, glosa: 'IVA débito fiscal', ...dimIva })
      : undefined;

    if (lineasDoc.length > 0 && lineasDoc.some((l) => l.cuentaContableId || cuentaId)) {
      let asignado = 0;
      const montos = lineasDoc.map((l, idx) => {
        if (subtotalLineas <= 0) {
          const parte = idx === 0 ? monto : 0;
          asignado += parte;
          return parte;
        }
        if (idx === lineasDoc.length - 1) {
          return Math.round((monto - asignado) * 100) / 100;
        }
        const parte = Math.round((monto * (l.total / subtotalLineas)) * 100) / 100;
        asignado += parte;
        return parte;
      });

      if (esNc) {
        for (let i = 0; i < lineasDoc.length; i++) {
          const l = lineasDoc[i];
          const cta = l.cuentaContableId || cuentaId!;
          const cc = l.centroCostoId || ccRef;
          asientoLineas.push({
            debe: montos[i],
            haber: 0,
            cuentaId: cta,
            glosa: [l.descripcion, cc && `CC ${cc}`].filter(Boolean).join(' · '),
            ...combinarDimensiones(cc ? { centroCostoId: cc } : {}, dimVentas),
          });
        }
        if (lineaIva) asientoLineas.push(lineaIva);
        asientoLineas.push({
          debe: 0,
          haber: montoTotal,
          cuentaId: contraId,
          glosa: 'Clientes',
          ...dimClientes,
        });
      } else {
        asientoLineas.push({
          debe: montoTotal,
          haber: 0,
          cuentaId: contraId,
          glosa: 'Clientes',
          ...dimClientes,
        });
        for (let i = 0; i < lineasDoc.length; i++) {
          const l = lineasDoc[i];
          const cta = l.cuentaContableId || cuentaId!;
          const cc = l.centroCostoId || ccRef;
          asientoLineas.push({
            debe: 0,
            haber: montos[i],
            cuentaId: cta,
            glosa: [l.descripcion, cc && `CC ${cc}`].filter(Boolean).join(' · '),
            ...combinarDimensiones(cc ? { centroCostoId: cc } : {}, dimVentas),
          });
        }
        if (lineaIva) asientoLineas.push(lineaIva);
      }
    } else {
      asientoLineas.push(
        ...(esNc
          ? [
              { debe: monto, haber: 0, cuentaId: cuentaId!, glosa: 'NC / ingreso', ...dimVentas },
              ...(lineaIva ? [lineaIva] : []),
              { debe: 0, haber: montoTotal, cuentaId: contraId, glosa: 'Clientes', ...dimClientes },
            ]
          : [
              { debe: montoTotal, haber: 0, cuentaId: contraId, glosa: 'Clientes', ...dimClientes },
              { debe: 0, haber: monto, cuentaId: cuentaId!, glosa: 'Ventas', ...dimVentas },
              ...(lineaIva ? [lineaIva] : []),
            ]),
      );
    }
    return asientoLineas;
  }

  /**
   * P1-9: valida que el total (neto + IVA) de una NC, sumado a las NC previas
   * ya emitidas contra la misma factura origen (excluyendo anuladas), no
   * supere el total de dicha factura. `excluirId` permite excluir la propia
   * NC al re-validar en una edición.
   */
  private async validarSaldoNc(
    empresaId: string,
    origen: { id: string; neto: unknown; iva: unknown; indicadorVenta: string | null; folio: string },
    montoNuevaNc: number,
    excluirId?: string,
  ): Promise<void> {
    const origenTotal =
      Number(origen.neto) + Number(origen.iva ?? ivaFromNeto(Number(origen.neto), origen.indicadorVenta));
    const ncsPrevias = await this.prisma.documentoComercial.findMany({
      where: {
        empresaId,
        tipo: 'NC',
        documentoOrigenId: origen.id,
        estado: { not: 'ANULADO' },
        ...(excluirId ? { id: { not: excluirId } } : {}),
      },
      select: { neto: true, iva: true, indicadorVenta: true },
    });
    const totalNcsPrevias = ncsPrevias.reduce(
      (acc, nc) => acc + Number(nc.neto) + Number(nc.iva ?? ivaFromNeto(Number(nc.neto), nc.indicadorVenta)),
      0,
    );
    const saldoDisponible = origenTotal - totalNcsPrevias;
    // Tolerancia de 1 peso por acumulación de redondeos.
    if (montoNuevaNc > saldoDisponible + 1) {
      throw new BadRequestException(
        `La NC ($${Math.round(montoNuevaNc)}) supera el saldo pendiente de la factura ${origen.folio} `
        + `(saldo disponible: $${Math.round(Math.max(saldoDisponible, 0))})`,
      );
    }
  }

  /**
   * Proyección Libro › Despachos: la guía canónica vive en DocumentoComercial (tipo GUIA).
   * GuiaDespacho se mantiene para el libro y la API legacy `/guias-despacho`.
   */
  private async syncGuiaProjection(
    tx: Pick<Prisma.TransactionClient, 'guiaDespacho'>,
    doc: {
      id: string;
      folio: string;
      cliente: string;
      fecha: Date;
      neto: unknown;
      iva?: unknown | null;
      estado: string;
      observaciones?: string | null;
      empresaId: string;
    },
  ) {
    const monto = Number(doc.neto) + Number(doc.iva ?? 0);
    const estado = estadoGuiaFromDoc(doc.estado);
    await tx.guiaDespacho.upsert({
      where: { empresaId_folio: { empresaId: doc.empresaId, folio: doc.folio } },
      create: {
        folio: doc.folio,
        cliente: doc.cliente,
        fecha: doc.fecha,
        monto,
        estado: estado as never,
        documentoComercialId: doc.id,
        glosa: doc.observaciones ?? null,
        empresaId: doc.empresaId,
      },
      update: {
        cliente: doc.cliente,
        fecha: doc.fecha,
        monto,
        estado: estado as never,
        documentoComercialId: doc.id,
        glosa: doc.observaciones ?? null,
      },
    });
  }

  async getClientes(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.cliente.findMany({
      where: { empresaId },
      orderBy: { razonSocial: 'asc' },
      include: { direcciones: true },
    });
    return rows.map((r) => ({ ...this.mapCliente(r), ...mapClienteFicha(r) }));
  }

  private mapCliente(row: {
    id: string;
    rut: string;
    razonSocial: string;
    credito: Prisma.Decimal;
    vendedor: string;
    activo: boolean;
    tipoCliente?: string | null;
    giro?: string | null;
    direccion?: string | null;
    comuna?: string | null;
    ciudad?: string | null;
    telefono?: string | null;
    email?: string | null;
    creadoPorId?: string | null;
    creadoPorNombre?: string | null;
    solicitadoPor?: string | null;
    solicitadoNota?: string | null;
    esProductor?: boolean;
  }) {
    return {
      id: row.id,
      rut: row.rut,
      razonSocial: row.razonSocial,
      credito: Number(row.credito),
      vendedor: row.vendedor,
      activo: row.activo,
      tipoCliente: row.tipoCliente ?? undefined,
      giro: row.giro ?? undefined,
      direccion: row.direccion ?? undefined,
      comuna: row.comuna ?? undefined,
      ciudad: row.ciudad ?? undefined,
      telefono: row.telefono ?? undefined,
      email: row.email ?? undefined,
      creadoPorId: row.creadoPorId ?? undefined,
      creadoPorNombre: row.creadoPorNombre ?? undefined,
      solicitadoPor: row.solicitadoPor ?? undefined,
      solicitadoNota: row.solicitadoNota ?? undefined,
      esProductor: row.esProductor ?? false,
    };
  }

  private async getClienteMapped(id: string, empresaId: string) {
    const row = await this.prisma.cliente.findFirst({
      where: { id, empresaId },
      include: fichaIncludeCliente,
    });
    if (!row) throw new NotFoundException('Cliente no encontrado');
    return { ...this.mapCliente(row), ...mapClienteFicha(row) };
  }

  async getCliente(user: JwtPayload, id: string, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    return this.getClienteMapped(id, empresaId);
  }

  private async actorNombre(user: JwtPayload) {
    const u = await this.prisma.usuario.findUnique({ where: { id: user.sub }, select: { nombre: true } });
    return u?.nombre ?? user.email ?? user.sub;
  }

  private async assertLineasMaestro(
    empresaId: string,
    lineas: DocumentoLineaNorm[],
    opts?: { tipoDoc?: string; indicadorVenta?: string | null; referenciaCod?: number | null },
  ) {
    const tipoDoc = (opts?.tipoDoc || '').toUpperCase();
    /** CodRef 2: una línea de texto, cantidad 1, precio 0; no usa catálogo. */
    const correccionTexto = tipoDoc === 'NC' && opts?.referenciaCod === 2;
    /** Emisión directa (wizard Emitir): catálogo obligatorio; sin texto libre ni SERVICIO por omisión. */
    const exigeMaestroEstricto = new Set(['FACTURA', 'NC', 'ND', 'GUIA']).has(tipoDoc);
    const tiposLineaValidos = new Set(['PRODUCTO', 'SERVICIO', 'FLETE', 'RECARGO']);

    for (const l of lineas) {
      if (correccionTexto) {
        l.tipoLinea = 'SERVICIO';
        continue;
      }
      if (exigeMaestroEstricto) {
        const tipoRaw = normalizeTipoLinea(l.tipoLinea) || '';
        if (!tipoRaw || !tiposLineaValidos.has(tipoRaw)) {
          throw new BadRequestException(
            `Línea «${l.descripcion}»: debe indicar tipoLinea (PRODUCTO, SERVICIO o FLETE)`,
          );
        }
        const tipo = tipoRaw === 'RECARGO' ? 'FLETE' : tipoRaw;
        l.tipoLinea = tipo;
        if (tipo === 'FLETE') {
          continue;
        }
        if (!l.insumoId) {
          throw new BadRequestException(
            `Línea «${l.descripcion}»: debe seleccionar un artículo del catálogo de insumos/servicios`,
          );
        }
        const ins = await this.prisma.insumo.findFirst({
          where: { id: l.insumoId, empresaId },
        });
        if (!ins) {
          throw new BadRequestException(
            `Línea «${l.descripcion}»: el artículo no existe en la empresa`,
          );
        }
        l.codigoProducto = ins.codigo;
        l.descripcion = `${ins.codigo} · ${ins.nombre}`;
        l.unidadMedida = ins.unidad;
        if (tipo === 'FLETE' || tipo === 'SERVICIO') continue;
        // PRODUCTO en emisión: validar precio ≥ costo (sin bodega; stock solo vía OV).
      } else {
        const tipo = normalizeTipoLinea(l.tipoLinea) || 'SERVICIO';
        l.tipoLinea = tipo;
        if (tipo === 'FLETE') {
          continue;
        }
        if (tipo !== 'PRODUCTO') continue;
        if (!l.insumoId) {
          throw new BadRequestException(
            `Línea «${l.descripcion}»: un producto debe usar un código del maestro de artículos`,
          );
        }
        const ins = await this.prisma.insumo.findFirst({
          where: { id: l.insumoId, empresaId },
        });
        if (!ins) throw new BadRequestException('El producto no existe en la empresa');
        l.codigoProducto = ins.codigo;
        l.descripcion = `${ins.codigo} · ${ins.nombre}`;
        l.unidadMedida = ins.unidad;
      }

      if ((l.tipoLinea || '').toUpperCase() !== 'PRODUCTO') continue;
      const ins = await this.prisma.insumo.findFirst({
        where: { id: l.insumoId, empresaId },
      });
      if (!ins) throw new BadRequestException('El producto no existe en la empresa');
      // D16: el piso es el precio de compra del maestro. Los productos que aún
      // no lo tienen cargado siguen protegidos por el costo promedio.
      // Ventas EXPORTACION no aplican piso (precio en moneda extranjera).
      const esExportacion = (opts?.indicadorVenta || '').toUpperCase() === 'EXPORTACION';
      if (!esExportacion) {
        const precioCompra = Number(ins.precioCompra ?? 0);
        const usaPrecioCompra = precioCompra > 0;
        const piso = usaPrecioCompra ? precioCompra : Number(ins.costoPromedio);
        if (piso > 0 && l.precioUnitario + 1e-6 < piso) {
          throw new BadRequestException(
            `No se puede vender ${ins.codigo} bajo ${
              usaPrecioCompra ? 'el precio de compra' : 'costo'
            } (${piso})`,
          );
        }
      }
      if (opts?.tipoDoc === 'ORDEN_VENTA') {
        if (ins.inventariable === false) continue;
        const splits =
          l.splits?.length
            ? l.splits
            : l.bodegaId
              ? [{ bodegaId: l.bodegaId, cantidad: l.cantidad }]
              : [];
        if (!splits.length) {
          throw new BadRequestException(`Línea ${ins.codigo}: indique bodega y cantidad`);
        }
        const sum = splits.reduce((a, s) => a + Number(s.cantidad), 0);
        if (Math.abs(sum - l.cantidad) > 1e-6) {
          throw new BadRequestException(
            `Línea ${ins.codigo}: las cantidades por bodega (${sum}) deben igualar ${l.cantidad}`,
          );
        }
        l.splits = splits;
      }
    }
  }

  private assertFacturaLineasLocked(
    existing: { tipo: string; lineas: Prisma.JsonValue | null },
    next: DocumentoLineaNorm[] | null,
  ) {
    if (existing.tipo !== 'FACTURA' || !next) return;
    const prev = parseStoredLineas(existing.lineas) ?? [];
    const prodPrev = prev.filter((l) => (l.tipoLinea || '').toUpperCase() === 'PRODUCTO');
    const prodNext = next.filter((l) => (l.tipoLinea || '').toUpperCase() === 'PRODUCTO');
    if (prodPrev.length !== prodNext.length) {
      throw new BadRequestException('La factura no puede cambiar cantidad ni descripción de productos');
    }
    for (let i = 0; i < prodPrev.length; i++) {
      const a = prodPrev[i];
      const b = prodNext[i];
      if (
        a.cantidad !== b.cantidad ||
        a.descripcion !== b.descripcion ||
        (a.insumoId || '') !== (b.insumoId || '')
      ) {
        throw new BadRequestException('La factura copia cantidad y descripción; solo el precio es editable');
      }
    }
  }

  private async applySalidaVentaOv(
    tx: Prisma.TransactionClient,
    params: { empresaId: string; folio: string; lineas: DocumentoLineaNorm[] },
  ) {
    for (const l of params.lineas) {
      if ((l.tipoLinea || '').toUpperCase() !== 'PRODUCTO' || !l.insumoId) continue;
      const ins = await tx.insumo.findFirst({
        where: { id: l.insumoId, empresaId: params.empresaId },
        select: { inventariable: true },
      });
      if (!ins || ins.inventariable === false) continue;
      const splits =
        l.splits?.length
          ? l.splits
          : l.bodegaId
            ? [{ bodegaId: l.bodegaId, cantidad: l.cantidad }]
            : [];
      for (const s of splits) {
        const bod = await requireBodega(tx, params.empresaId, s.bodegaId);
        await applyStockDelta(tx, {
          empresaId: params.empresaId,
          insumoId: l.insumoId,
          bodegaId: bod.id,
          delta: -Number(s.cantidad),
        });
        await tx.movimientoBodega.create({
          data: {
            fecha: new Date(),
            tipo: 'SALIDA_VENTA',
            estado: 'CONFIRMADO',
            bodega: bod.codigo,
            bodegaId: bod.id,
            articulo: l.descripcion,
            cantidad: s.cantidad,
            precioUnitario: l.precioUnitario,
            facturaRef: params.folio,
            nota: `OV ${params.folio}`,
            insumoId: l.insumoId,
            empresaId: params.empresaId,
          },
        });
      }
    }
  }

  /** Revierte SALIDA_VENTA de una OV confirmada (antes de reaplicar ítems editados). */
  private async reverseSalidaVentaOv(
    tx: Prisma.TransactionClient,
    params: { empresaId: string; folio: string },
  ) {
    const movs = await tx.movimientoBodega.findMany({
      where: {
        empresaId: params.empresaId,
        facturaRef: params.folio,
        tipo: 'SALIDA_VENTA',
        estado: 'CONFIRMADO',
      },
    });
    for (const m of movs) {
      if (m.insumoId && m.bodegaId) {
        await applyStockDelta(tx, {
          empresaId: params.empresaId,
          insumoId: m.insumoId,
          bodegaId: m.bodegaId,
          delta: Number(m.cantidad),
        });
      }
      await tx.movimientoBodega.update({
        where: { id: m.id },
        data: { estado: 'ANULADO' },
      });
    }
  }

  /** H7: reingreso bodega al contabilizar NC con líneas producto inventariable. */
  private async applyReingresoNcDesdeContabilizar(
    tx: Prisma.TransactionClient,
    params: {
      empresaId: string;
      folio: string;
      lineas: DocumentoLineaNorm[];
      documentoOrigenId: string | null;
    },
  ) {
    const dup = await tx.movimientoBodega.findFirst({
      where: {
        empresaId: params.empresaId,
        facturaRef: params.folio,
        tipo: 'DEVOLUCION_NC',
        estado: 'CONFIRMADO',
      },
    });
    if (dup) return;

    let origenLineas: DocumentoLineaNorm[] = [];
    if (params.documentoOrigenId) {
      const origen = await tx.documentoComercial.findUnique({
        where: { id: params.documentoOrigenId },
        select: { lineas: true },
      });
      origenLineas = parseStoredLineas(origen?.lineas) ?? [];
    }

    for (const l of params.lineas) {
      if ((l.tipoLinea || '').toUpperCase() !== 'PRODUCTO' || !l.insumoId) continue;
      const ins = await tx.insumo.findFirst({
        where: { id: l.insumoId, empresaId: params.empresaId },
        select: { inventariable: true },
      });
      if (!ins || ins.inventariable === false) continue;

      let splits =
        l.splits?.length
          ? l.splits
          : l.bodegaId
            ? [{ bodegaId: l.bodegaId, cantidad: l.cantidad }]
            : [];

      if (!splits.length && origenLineas.length) {
        const orig = origenLineas.find((ol) => ol.insumoId === l.insumoId);
        if (orig) {
          const origSplits =
            orig.splits?.length
              ? orig.splits
              : orig.bodegaId
                ? [{ bodegaId: orig.bodegaId, cantidad: orig.cantidad }]
                : [];
          if (origSplits.length && orig.cantidad > 0) {
            const ratio = l.cantidad / orig.cantidad;
            splits = origSplits.map((s) => ({
              bodegaId: s.bodegaId,
              cantidad: Math.round(Number(s.cantidad) * ratio * 1e4) / 1e4,
            }));
          }
        }
      }

      if (!splits.length) continue;

      for (const s of splits) {
        const bod = await requireBodega(tx, params.empresaId, s.bodegaId);
        await applyStockDelta(tx, {
          empresaId: params.empresaId,
          insumoId: l.insumoId,
          bodegaId: bod.id,
          delta: Number(s.cantidad),
        });
        await tx.movimientoBodega.create({
          data: {
            fecha: new Date(),
            tipo: 'DEVOLUCION_NC',
            estado: 'CONFIRMADO',
            bodega: bod.codigo,
            bodegaId: bod.id,
            articulo: l.descripcion,
            cantidad: s.cantidad,
            precioUnitario: l.precioUnitario,
            facturaRef: params.folio,
            nota: `NC ${params.folio}`,
            insumoId: l.insumoId,
            empresaId: params.empresaId,
          },
        });
      }
    }
  }

  async createCliente(user: JwtPayload, dto: UpsertClienteDto, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const domicilio = assertDomicilioFiscalCliente({
      direccion: dto.direccion,
      comuna: dto.comuna,
      ciudad: dto.ciudad,
      direcciones: dto.direcciones,
    });
    try {
      const creator = await this.prisma.usuario.findUnique({
        where: { id: user.sub },
        select: { nombre: true },
      });
      const row = await this.prisma.cliente.create({
        data: {
          rut: dto.rut.trim(),
          razonSocial: dto.razonSocial.trim(),
          credito: dto.credito,
          vendedor: dto.vendedor.trim(),
          activo: dto.activo ?? true,
          direccion: domicilio.direccion,
          comuna: domicilio.comuna,
          ciudad: domicilio.ciudad,
          telefono: dto.telefono?.trim() || null,
          email: dto.email?.trim() || null,
          tipoCliente: dto.tipoCliente?.trim() || null,
          giro: dto.giro?.trim() || null,
          creadoPorId: user.sub,
          creadoPorNombre: creator?.nombre ?? user.email,
          solicitadoPor: dto.solicitadoPor?.trim() || creator?.nombre || user.email,
          solicitadoNota: dto.solicitadoNota?.trim() || null,
          esProductor: dto.esProductor ?? false,
          empresaId,
        },
      });
      await syncClienteFicha(this.prisma, {
        empresaId,
        clienteId: row.id,
        nested: {
          cuentasBancarias: dto.cuentasBancarias,
          contactos: dto.contactos,
          direcciones: dto.direcciones?.length
            ? dto.direcciones
            : [{
                tipo: 'FISCAL',
                linea: domicilio.direccion,
                comuna: domicilio.comuna,
                ciudad: domicilio.ciudad,
                principal: true,
              }],
        },
        actor: { id: user.sub, nombre: creator?.nombre ?? user.email },
        resumen: 'Alta de ficha',
        antes: null,
      });
      return this.getClienteMapped(row.id, empresaId);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un cliente con ese RUT');
      }
      throw e;
    }
  }

  async updateCliente(user: JwtPayload, id: string, dto: UpsertClienteDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.cliente.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cliente no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    const domicilio = assertDomicilioFiscalCliente({
      direccion: dto.direccion,
      comuna: dto.comuna,
      ciudad: dto.ciudad,
      direcciones: dto.direcciones,
    });
    const actor = await this.actorNombre(user);
    try {
      const row = await this.prisma.cliente.update({
        where: { id },
        data: {
          rut: dto.rut.trim(),
          razonSocial: dto.razonSocial.trim(),
          credito: dto.credito,
          vendedor: dto.vendedor.trim(),
          activo: dto.activo ?? true,
          tipoCliente: dto.tipoCliente?.trim() || null,
          giro: dto.giro?.trim() || null,
          direccion: domicilio.direccion,
          comuna: domicilio.comuna,
          ciudad: domicilio.ciudad,
          telefono: dto.telefono?.trim() || null,
          email: dto.email?.trim() || null,
          ...(dto.solicitadoPor !== undefined ? { solicitadoPor: dto.solicitadoPor.trim() || null } : {}),
          ...(dto.solicitadoNota !== undefined ? { solicitadoNota: dto.solicitadoNota.trim() || null } : {}),
          ...(dto.esProductor !== undefined ? { esProductor: dto.esProductor } : {}),
        },
      });
      await syncClienteFicha(this.prisma, {
        empresaId: existing.empresaId,
        clienteId: id,
        nested: {
          cuentasBancarias: dto.cuentasBancarias,
          contactos: dto.contactos,
          direcciones: dto.direcciones?.length
            ? dto.direcciones
            : [{
                tipo: 'FISCAL',
                linea: domicilio.direccion,
                comuna: domicilio.comuna,
                ciudad: domicilio.ciudad,
                principal: true,
              }],
        },
        actor: { id: user.sub, nombre: actor },
        resumen: 'Edición de ficha',
        antes: existing,
      });
      return this.getClienteMapped(row.id, existing.empresaId);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un cliente con ese RUT');
      }
      throw e;
    }
  }

  async getProspectos(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.prospecto.findMany({
      where: { empresaId },
      orderBy: { fecha: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      contacto: r.contacto,
      origen: r.origen,
      estado: r.estado,
      fecha: r.fecha.toISOString().slice(0, 10),
    }));
  }

  async createProspecto(
    user: JwtPayload,
    dto: UpsertProspectoDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const estado = dto.estado.toUpperCase();
    if (!ESTADOS_PROS.has(estado)) throw new BadRequestException('estado inválido');
    const row = await this.prisma.prospecto.create({
      data: {
        nombre: dto.nombre.trim(),
        contacto: dto.contacto.trim(),
        origen: dto.origen.trim(),
        estado: estado as never,
        fecha: parseDate(dto.fecha),
        empresaId,
      },
    });
    return {
      id: row.id,
      nombre: row.nombre,
      contacto: row.contacto,
      origen: row.origen,
      estado: row.estado,
      fecha: row.fecha.toISOString().slice(0, 10),
    };
  }

  async updateProspecto(user: JwtPayload, id: string, dto: UpsertProspectoDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.prospecto.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Prospecto no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    const estado = dto.estado.toUpperCase();
    if (!ESTADOS_PROS.has(estado)) throw new BadRequestException('estado inválido');
    const row = await this.prisma.prospecto.update({
      where: { id },
      data: {
        nombre: dto.nombre.trim(),
        contacto: dto.contacto.trim(),
        origen: dto.origen.trim(),
        estado: estado as never,
        fecha: parseDate(dto.fecha),
      },
    });
    return {
      id: row.id,
      nombre: row.nombre,
      contacto: row.contacto,
      origen: row.origen,
      estado: row.estado,
      fecha: row.fecha.toISOString().slice(0, 10),
    };
  }

  async getDocumentos(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
    opts?: { mias?: boolean; tipo?: string; estado?: string },
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const where: Prisma.DocumentoComercialWhereInput = { empresaId };
    if (opts?.mias) where.creadoPorId = user.sub;
    const tipo = opts?.tipo?.trim().toUpperCase();
    if (tipo && TIPOS_RETIRADOS.has(tipo)) return [];
    if (tipo) where.tipo = tipo as never;
    else where.tipo = { in: [...TIPOS_LISTADO_VENTAS] };
    const estados = (opts?.estado ?? '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (estados.length === 1) where.estado = estados[0] as never;
    else if (estados.length > 1) where.estado = { in: estados as never[] };
    const rows = await this.prisma.documentoComercial.findMany({
      where,
      include: { empresa: { select: { id: true, razonSocial: true } } },
      orderBy: { fecha: 'desc' },
    });
    return rows.map(mapDoc);
  }

  /**
   * Borradores de la empresa operativa (header X-Empresa-Id).
   * Usuario normal: solo los propios (y legado sin autor).
   * Admin: todos, con filtro opcional `usuarioId` (Reu5).
   */
  async getBorradores(user: JwtPayload, usuarioId?: string, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const admin = isSuperAdmin(user);
    const filtroUsuario = usuarioId?.trim() || undefined;
    const where: Prisma.DocumentoComercialWhereInput = {
      estado: 'BORRADOR',
      empresaId,
      tipo: { in: [...TIPOS_BORRADOR_VENTAS] },
    };
    if (admin) {
      if (filtroUsuario) where.creadoPorId = filtroUsuario;
    } else {
      where.OR = [
        { creadoPorId: user.sub },
        { creadoPorId: null },
      ];
    }
    const rows = await this.prisma.documentoComercial.findMany({
      where,
      include: { empresa: { select: { id: true, razonSocial: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return rows.map(mapDoc);
  }

  async getDocumento(user: JwtPayload, id: string, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const row = await this.prisma.documentoComercial.findFirst({
      where: { id, empresaId },
      include: { empresa: { select: { id: true, razonSocial: true } } },
    });
    if (!row) throw new NotFoundException('Documento no encontrado');
    assertTipoDocumentoVigente(row.tipo, 'get');
    return mapDoc(row);
  }

  /**
   * PDF/XML del facturador vía billing-gateway. No reemite.
   * Solo documentos del tenant con billingEmissionId.
   */
  async downloadDteArtifact(
    user: JwtPayload,
    id: string,
    kind: DteArtifactKind,
    empresaHeader?: string,
  ): Promise<BillingArtifact> {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const row = await this.prisma.documentoComercial.findFirst({
      where: { id, empresaId },
      select: {
        id: true,
        tipo: true,
        empresaId: true,
        billingEmissionId: true,
      },
    });
    if (!row) throw new NotFoundException('Documento no encontrado');
    assertTipoDocumentoVigente(row.tipo, 'get');
    const emissionId = row.billingEmissionId?.trim();
    if (!emissionId) {
      throw new NotFoundException('El documento no tiene emisión DTE para descargar');
    }
    if (!this.billing) {
      throw new ServiceUnavailableException('Cliente billing-gateway no disponible');
    }
    return this.billing.getArtifact(emissionId, kind);
  }

  /**
   * Consulta ACE/RCH/folio en el facturador (GetDocument). No reemite.
   * No cambia estado contable ni hace reverso.
   */
  async syncDocumentoDteEstado(
    user: JwtPayload,
    id: string,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const row = await this.prisma.documentoComercial.findFirst({
      where: { id, empresaId },
    });
    if (!row) throw new NotFoundException('Documento no encontrado');
    assertTipoDocumentoVigente(row.tipo, 'get');
    const emissionId = row.billingEmissionId?.trim();
    if (!emissionId) {
      throw new NotFoundException('El documento no tiene emisión DTE para consultar');
    }
    if (row.billingStub) {
      return mapDoc(row);
    }
    if (!this.billing?.isEnabled()) {
      throw new ServiceUnavailableException('Cliente billing-gateway no disponible');
    }
    if (typeof this.billing.refreshEmission !== 'function') {
      throw new ServiceUnavailableException('El cliente billing-gateway no consulta estado SII');
    }
    const emission = await this.billing.refreshEmission(emissionId);
    const updated = await this.prisma.documentoComercial.update({
      where: { id: row.id },
      data: billingPatchFromRefresh(row, emission),
      include: { empresa: { select: { id: true, razonSocial: true } } },
    });
    return mapDoc(updated);
  }

  /**
   * GoSocket encola (PENDING) y el folio CAF llega en GetDocument, no en emit().
   * Tras emitir, consulta el partner para persistir folioOficial sin esperar sync manual.
   */
  private async tryRefreshFolioTrasEmitir<T extends {
    id: string;
    folioOficial?: string | null;
    billingEmissionId?: string | null;
    billingStub?: boolean | null;
    billingStatus?: string | null;
    billingDisclaimer?: string | null;
    billingGlobalDocumentId?: string | null;
    tipo?: string;
    estado?: string;
    folio?: string;
    cliente?: string;
    fecha?: Date;
    neto?: unknown;
    iva?: unknown | null;
    observaciones?: string | null;
    empresaId?: string;
  }>(row: T): Promise<T> {
    const emissionId = row.billingEmissionId?.trim();
    if (!emissionId || row.billingStub) return row;
    if (row.folioOficial?.trim()) return row;
    if (!this.billing?.isEnabled() || typeof this.billing.refreshEmission !== 'function') {
      return row;
    }
    const delays = [0, 1200, 2500];
    let current = row;
    for (const waitMs of delays) {
      if (current.folioOficial?.trim()) return current;
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      try {
        const emission = await this.billing.refreshEmission(emissionId);
        const updated = await this.prisma.documentoComercial.update({
          where: { id: current.id },
          data: billingPatchFromRefresh(current, emission),
        });
        current = { ...current, ...updated };
        if (updated.folioOficial?.trim()) return current;
      } catch {
        /* GetDocument aún no listo: reintenta */
      }
    }
    return current;
  }

  async updateDocumento(user: JwtPayload, id: string, dto: UpsertDocumentoDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.documentoComercial.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Documento no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    if (existing.estado === 'ANULADO' || existing.estado === 'CONTABILIZADA') {
      throw new BadRequestException(`No se puede editar documento en estado ${existing.estado}`);
    }
    if (existing.tipo === 'COTIZACION' || existing.tipo === 'NP') {
      throw new BadRequestException(
        existing.tipo === 'COTIZACION' ? MSG_COTIZACION_NO_DOC : MSG_NP_NO_DOC,
      );
    }

    const tipo = (dto.tipo || existing.tipo).toUpperCase();
    assertTipoDocumentoAlta(tipo);
    let estado = (dto.estado ?? existing.estado).toUpperCase();
    if (tipo === 'ORDEN_VENTA') estado = normalizeEstadoOv(estado);
    const indicadorVentaEfectivo = dto.indicadorVenta !== undefined
      ? dto.indicadorVenta
      : existing.indicadorVenta;
    const lineas = normalizeLineas(dto.lineas);
    if (lineas?.length) {
      await this.assertLineasMaestro(existing.empresaId, lineas, {
        tipoDoc: tipo,
        indicadorVenta: indicadorVentaEfectivo,
      });
    }
    this.assertFacturaLineasLocked(existing, lineas);
    const descGlobal =
      dto.descuentoGlobalPct !== undefined
        ? Number(dto.descuentoGlobalPct ?? 0)
        : Number(existing.descuentoGlobalPct ?? 0);
    const neto =
      lineas && lineas.length > 0 ? netoFromLineas(lineas, descGlobal) : dto.neto;
    // P1-7: si cambia el neto (o el indicador de venta) hay que recalcular el
    // IVA persistido; si no, quedaría desincronizado con el neto nuevo.
    const iva = dto.iva != null
      ? Number(dto.iva)
      : ivaFromNeto(Number(neto ?? existing.neto), indicadorVentaEfectivo);

    // P1-9: re-validar saldo contra la factura origen si la NC editada cambia
    // de monto (excluyendo la propia NC de la suma de "previas").
    if (tipo === 'NC' || tipo === 'ND') {
      const origenId = dto.documentoOrigenId !== undefined
        ? dto.documentoOrigenId?.trim() || null
        : existing.documentoOrigenId;
      if (!origenId && tipo === 'ND' && !referenciaManualCompleta({
        referenciaTipo: dto.referenciaTipo ?? existing.referenciaTipo,
        referenciaFolio: dto.referenciaFolio ?? existing.referenciaFolio,
        referenciaFecha: dto.referenciaFecha ?? existing.referenciaFecha,
        referenciaCod: dto.referenciaCod ?? existing.referenciaCod,
      })) {
        throw new BadRequestException(
          'Nota de débito: seleccione un documento origen o registre tipo SII, folio, fecha y CodRef',
        );
      }
      if (origenId) {
        const origen = await this.prisma.documentoComercial.findFirst({
          where: { id: origenId, empresaId: existing.empresaId },
        });
        if (origen) {
          if (!esTipoOrigenNcNd(origen.tipo)) {
            throw new BadRequestException(
              'El origen debe ser factura, nota de crédito, nota de débito o guía',
            );
          }
          if (tipo === 'NC' && origen.tipo === 'FACTURA') {
            await this.validarSaldoNc(
              existing.empresaId,
              origen,
              Number(neto ?? existing.neto) + Number(iva),
              id,
            );
          }
        }
      }
    }

    if (dto.clienteId) {
      const cli = await this.prisma.cliente.findFirst({
        where: { id: dto.clienteId, empresaId: existing.empresaId },
      });
      if (!cli) {
        throw new BadRequestException('Cliente no pertenece a la empresa activa');
      }
    }

    const data: Prisma.DocumentoComercialUncheckedUpdateInput = {
      folio: dto.folio.trim(),
      tipo: tipo as never,
      cliente: dto.cliente.trim(),
      clienteId: dto.clienteId || null,
      ...(dto.proveedorId !== undefined ? { proveedorId: dto.proveedorId || null } : {}),
      fecha: parseDate(dto.fecha),
      neto,
      iva,
      ...(lineas !== null
        ? { lineas: lineas as unknown as Prisma.InputJsonValue }
        : {}),
      estado: estado as never,
      ...(dto.documentoOrigenId !== undefined
        ? { documentoOrigenId: dto.documentoOrigenId?.trim() || null }
        : {}),
      ...(dto.folioOrigen !== undefined
        ? { folioOrigen: dto.folioOrigen?.trim() || null }
        : {}),
      ...(dto.referenciaTipo !== undefined
        ? { referenciaTipo: optStr(dto.referenciaTipo) }
        : {}),
      ...(dto.referenciaFolio !== undefined
        ? { referenciaFolio: optStr(dto.referenciaFolio) }
        : {}),
      ...(dto.referenciaCod !== undefined
        ? { referenciaCod: dto.referenciaCod ?? null }
        : {}),
      ...(dto.observaciones !== undefined
        ? { observaciones: optStr(dto.observaciones) }
        : {}),
      ...(dto.formaPago !== undefined ? { formaPago: optStr(dto.formaPago) } : {}),
      ...(dto.fechaVencimiento !== undefined
        ? { fechaVencimiento: parseOptionalDate(dto.fechaVencimiento) }
        : {}),
      ...(dto.indicadorVenta !== undefined
        ? { indicadorVenta: optStr(dto.indicadorVenta) }
        : {}),
      ...(dto.descuentoGlobalPct !== undefined
        ? { descuentoGlobalPct: dto.descuentoGlobalPct ?? null }
        : {}),
      ...(dto.cuentaContableId !== undefined
        ? { cuentaContableId: optStr(dto.cuentaContableId) }
        : {}),
      ...(dto.centroCostoId !== undefined
        ? { centroCostoId: optStr(dto.centroCostoId) }
        : {}),
      ...(dto.receptorRut !== undefined ? { receptorRut: optStr(dto.receptorRut) } : {}),
      ...(dto.receptorGiro !== undefined ? { receptorGiro: optStr(dto.receptorGiro) } : {}),
      ...(dto.receptorDireccion !== undefined
        ? { receptorDireccion: optStr(dto.receptorDireccion) }
        : {}),
      ...(dto.receptorComuna !== undefined
        ? { receptorComuna: optStr(dto.receptorComuna) }
        : {}),
      ...(dto.receptorCiudad !== undefined
        ? { receptorCiudad: optStr(dto.receptorCiudad) }
        : {}),
      ...comexDataFromDto(dto, 'patch'),
    };

    const reajustarStockOv =
      tipo === 'ORDEN_VENTA'
      && normalizeEstadoOv(existing.estado) === ESTADO_OV_CONFIRMADA
      && lineas !== null
      && stockHuellaLineas(parseStoredLineas(existing.lineas) ?? [])
        !== stockHuellaLineas(lineas);

    const persistDoc = async (db: Prisma.TransactionClient | PrismaService) => {
      const row = await db.documentoComercial.update({ where: { id }, data });
      if (tipo === 'GUIA') {
        await this.syncGuiaProjection(db, {
          ...row,
          empresaId: existing.empresaId,
        });
      }
      return row;
    };

    try {
      if (reajustarStockOv) {
        const row = await this.prisma.$transaction(async (tx) => {
          await this.reverseSalidaVentaOv(tx, {
            empresaId: existing.empresaId,
            folio: existing.folio,
          });
          await this.applySalidaVentaOv(tx, {
            empresaId: existing.empresaId,
            folio: dto.folio.trim(),
            lineas,
          });
          return persistDoc(tx);
        });
        return mapDoc(row);
      }
      return mapDoc(await persistDoc(this.prisma));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un documento con ese folio');
      }
      throw e;
    }
  }

  /**
   * Asocia cuenta imputable (y CC opcional) a una OV CONFIRMADA.
   * No emite DTE ni contabiliza; el asiento ocurre al emitir la factura.
   */
  async patchDocumentoImputacion(
    user: JwtPayload,
    id: string,
    dto: { cuentaContableId: string; centroCostoId?: string },
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const existing = await this.prisma.documentoComercial.findFirst({
      where: { id, empresaId },
    });
    if (!existing) throw new NotFoundException('Documento no encontrado');
    if (existing.tipo !== 'ORDEN_VENTA') {
      throw new BadRequestException('Solo se asocia cuenta a una orden de venta');
    }
    const estado = normalizeEstadoOv(existing.estado);
    if (estado !== ESTADO_OV_CONFIRMADA) {
      throw new BadRequestException('Solo se asocia cuenta a una orden de venta confirmada');
    }

    const cuentaId = dto.cuentaContableId.trim();
    if (!cuentaId) {
      throw new BadRequestException('Selecciona cuenta contable');
    }
    const cuenta = await this.prisma.cuentaContable.findFirst({
      where: { id: cuentaId, empresaId, activa: true, noImputable: false },
    });
    if (!cuenta) {
      throw new BadRequestException('Cuenta no imputable o no pertenece a la empresa activa');
    }

    const ccId = optStr(dto.centroCostoId);
    if (ccId) {
      const cc = await this.prisma.centroCosto.findFirst({
        where: { id: ccId, empresaId, activa: true },
      });
      if (!cc) {
        throw new BadRequestException('Centro de costo no pertenece a la empresa activa');
      }
    }

    const row = await this.prisma.documentoComercial.update({
      where: { id },
      data: {
        cuentaContableId: cuentaId,
        centroCostoId: ccId,
      },
    });
    return mapDoc(row);
  }

  async anularDocumento(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.documentoComercial.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Documento no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    assertTipoDocumentoVigente(existing.tipo, 'mutate');
    if (existing.estado === 'ANULADO') {
      throw new BadRequestException('Documento ya anulado');
    }
    if (existing.estado === 'CONTABILIZADA') {
      throw new BadRequestException('Documento contabilizado: use reversar');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      if (existing.tipo === 'ORDEN_VENTA') {
        await liberarReservasOv(tx, {
          empresaId: existing.empresaId,
          documentoId: id,
        });
      }
      return tx.documentoComercial.update({
        where: { id },
        data: { estado: 'ANULADO' },
      });
    });
    if (existing.tipo === 'GUIA') {
      await this.syncGuiaProjection(this.prisma, {
        ...row,
        empresaId: existing.empresaId,
      });
    }
    return mapDoc(row);
  }

  /** Elimina definitivamente un documento en BORRADOR (bandeja de borradores). */
  async eliminarBorrador(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.documentoComercial.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Documento no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    assertTipoDocumentoVigente(existing.tipo, 'mutate');
    if (existing.estado !== 'BORRADOR') {
      throw new BadRequestException('Solo se pueden eliminar documentos en estado Borrador');
    }
    if (existing.tipo === 'GUIA') {
      await this.prisma.guiaDespacho.deleteMany({
        where: {
          empresaId: existing.empresaId,
          OR: [{ documentoComercialId: id }, { folio: existing.folio }],
        },
      });
    }
    await this.prisma.documentoComercial.delete({ where: { id } });
    return { ok: true, id };
  }

  async lookupRut(user: JwtPayload, rut: string, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const norm = (rut || '').replace(/[.\s-]/g, '').toUpperCase();
    if (norm.length < 3) throw new BadRequestException('RUT inválido');
    const matchRut = (r: string) => r.replace(/[.\s-]/g, '').toUpperCase() === norm;
    const [sociedad, clientesRaw, proveedoresRaw] = await Promise.all([
      this.prisma.empresa.findFirst({
        where: { id: empresaId },
        select: { id: true, rut: true, razonSocial: true, giro: true },
      }),
      this.prisma.cliente.findMany({
        where: { empresaId },
        include: { direcciones: { orderBy: { principal: 'desc' }, take: 1 } },
        take: 200,
      }),
      this.prisma.proveedor.findMany({
        where: { empresaId },
        take: 200,
      }),
    ]);
    const clientes = clientesRaw.filter((c) => matchRut(c.rut));
    const proveedores = proveedoresRaw.filter((p) => matchRut(p.rut));
    const mapCli = (c: (typeof clientesRaw)[number]) => {
        const dir = c.direcciones?.[0];
        return {
          tipo: 'CLIENTE' as const,
          id: c.id,
          rut: c.rut,
          razonSocial: c.razonSocial,
          giro: c.giro,
          direccion: c.direccion || dir?.linea || null,
          comuna: c.comuna || dir?.comuna || null,
          ciudad: c.ciudad || dir?.ciudad || null,
        productor: Boolean(c.esProductor),
      };
    };
    const mapProv = (p: (typeof proveedoresRaw)[number]) => ({
      tipo: 'PROVEEDOR' as const,
        id: p.id,
        rut: p.rut,
        razonSocial: p.razonSocial,
        giro: p.giro,
      productor: Boolean(p.esProductor),
    });
    const clientesMapped = clientes.map(mapCli);
    const proveedoresMapped = proveedores.map(mapProv);
    return {
      rut: norm,
      sociedad: sociedad && matchRut(sociedad.rut)
        ? { tipo: 'SOCIEDAD', id: sociedad.id, rut: sociedad.rut, razonSocial: sociedad.razonSocial, giro: sociedad.giro }
        : null,
      clientes: clientesMapped,
      proveedores: proveedoresMapped,
      productores: [
        ...clientesMapped.filter((c) => c.productor),
        ...proveedoresMapped.filter((p) => p.productor),
      ],
    };
  }

  async confirmarOrdenVenta(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.documentoComercial.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Documento no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    if (existing.tipo !== 'ORDEN_VENTA') {
      throw new BadRequestException('Solo se confirma una orden de venta');
    }
    if (existing.estado !== 'BORRADOR') {
      throw new BadRequestException('La orden ya está confirmada o no está en borrador');
    }

    const lineas = parseStoredLineas(existing.lineas) ?? [];
    await this.assertLineasMaestro(existing.empresaId, lineas, {
      tipoDoc: 'ORDEN_VENTA',
      indicadorVenta: existing.indicadorVenta,
    });
    const row = await this.prisma.$transaction(async (tx) => {
      await consumirReservasOv(tx, {
        empresaId: existing.empresaId,
        documentoId: id,
      });
      await this.applySalidaVentaOv(tx, {
        empresaId: existing.empresaId,
        folio: existing.folio,
        lineas,
      });
      return tx.documentoComercial.update({
        where: { id },
        data: { estado: ESTADO_OV_CONFIRMADA, lineas: lineas as unknown as Prisma.InputJsonValue },
      });
    });
    return mapDoc(row);
  }

  /**
   * Convierte OV confirmada → factura. Cotización y NP ya no se convierten.
   */
  async convertirDocumento(
    user: JwtPayload,
    id: string,
    dto: { tipoDestino: string; folioNuevo?: string },
    empresaHeader?: string,
  ) {
    const scope = resolveTenant(user);
    const origen = await this.prisma.documentoComercial.findUnique({ where: { id } });
    if (!origen) throw new NotFoundException('Documento no encontrado');
    assertTenantAccess(scope, origen.empresaId);
    if (origen.tipo === 'COTIZACION') {
      throw new BadRequestException(MSG_COTIZACION_NO_DOC);
    }
    if (origen.tipo === 'NP') {
      throw new BadRequestException(MSG_NP_NO_DOC);
    }
    const perms = user.permisos ?? [];
    const canComercial = perms.includes('*') || perms.includes('comercial:write');
    if (origen.tipo !== 'ORDEN_VENTA') {
      throw new BadRequestException('Solo se convierten órdenes de venta a factura');
    }
    if (!canComercial) throw new BadRequestException('Se requiere comercial:write para facturar la OV');
    if (!ovEsFacturable(origen.estado)) {
      throw new BadRequestException(
        'La orden de venta debe estar confirmada (stock) antes de facturar',
      );
    }
    const dest = dto.tipoDestino.toUpperCase();
    if (dest !== 'FACTURA') {
      throw new BadRequestException('La orden de venta solo se convierte a factura');
    }

    const folioNuevo =
      dto.folioNuevo?.trim()
      || `${dest.slice(0, 2)}-${origen.folio}-${Date.now().toString().slice(-4)}`;

    const creator = await this.prisma.usuario.findUnique({
      where: { id: user.sub },
      select: { nombre: true },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const nuevo = await tx.documentoComercial.create({
        data: {
          folio: folioNuevo,
          tipo: dest as never,
          cliente: origen.cliente,
          clienteId: origen.clienteId,
          fecha: new Date(),
          neto: origen.neto,
          iva: origen.iva,
          lineas: origen.lineas ?? Prisma.JsonNull,
          // Borrador: el wizard edita precio y luego Emitir llama billing-gateway.
          estado: 'BORRADOR',
          folioOrigen: origen.folio,
          documentoOrigenId: origen.id,
          formaPago: origen.formaPago,
          fechaVencimiento: origen.fechaVencimiento,
          indicadorVenta: origen.indicadorVenta,
          descuentoGlobalPct: origen.descuentoGlobalPct,
          cuentaContableId: origen.cuentaContableId,
          centroCostoId: origen.centroCostoId,
          receptorRut: origen.receptorRut,
          receptorGiro: origen.receptorGiro,
          receptorDireccion: origen.receptorDireccion,
          receptorComuna: origen.receptorComuna,
          receptorCiudad: origen.receptorCiudad,
          monedaCodigo: origen.monedaCodigo,
          tpoMoneda: origen.tpoMoneda,
          tipoCambio: origen.tipoCambio,
          paisRecepCodigo: origen.paisRecepCodigo,
          paisDestino: origen.paisDestino,
          puertoEmbarque: origen.puertoEmbarque,
          puertoDesembarque: origen.puertoDesembarque,
          clausulaVenta: origen.clausulaVenta,
          viaTransporte: origen.viaTransporte,
          modalidadVenta: origen.modalidadVenta,
          indTraslado: origen.indTraslado,
          bultoTipoCodigo: origen.bultoTipoCodigo,
          bultoCantidad: origen.bultoCantidad,
          bultoMarca: origen.bultoMarca,
          montoOtraMoneda: origen.montoOtraMoneda,
          montoExentoOtraMoneda: origen.montoExentoOtraMoneda,
          referenciaFecha: origen.referenciaFecha,
          referenciaTipo: origen.referenciaTipo,
          referenciaFolio: origen.referenciaFolio,
          observaciones: origen.observaciones,
          creadoPorId: user.sub,
          creadoPorNombre: creator?.nombre ?? user.email,
          empresaId: origen.empresaId,
        },
      });
      const origUpd = await tx.documentoComercial.update({
        where: { id: origen.id },
        data: { estado: 'FACTURADO' },
      });
      return { nuevo, origUpd };
    });

    return {
      origen: mapDoc(result.origUpd),
      convertido: mapDoc(result.nuevo),
    };
  }

  private async allocateDocumentoFolio(
    empresaId: string,
    requested: string,
    tipo?: string,
  ): Promise<string> {
    const want = requested.trim();
    const rows = await this.prisma.documentoComercial.findMany({
      where: { empresaId },
      select: { folio: true },
    });
    const used = new Set(rows.map((r) => r.folio.trim()));
    const ovNumerico = tipo === 'ORDEN_VENTA' ? /^\d+$/.test(want) : true;
    if (want && ovNumerico && !used.has(want)) return want;
    let max = 0;
    for (const f of used) {
      const n = Number(String(f).replace(/\D/g, ''));
      if (Number.isFinite(n) && n > max) max = n;
    }
    let next = Math.max(max + 1, 1000);
    while (used.has(String(next))) next += 1;
    return String(next);
  }

  private resolveReferenciaNcNd(
    tipo: string,
    dto: UpsertDocumentoDto,
    origen: {
      tipo: string;
      folio: string;
      folioOficial?: string | null;
      fecha: Date;
      indicadorVenta: string | null;
    } | null,
  ) {
    let referenciaTipo = optStr(dto.referenciaTipo);
    let referenciaFolio = optStr(dto.referenciaFolio);
    let referenciaFecha = parseOptionalDate(dto.referenciaFecha);
    let referenciaCod =
      dto.referenciaCod === 1 || dto.referenciaCod === 2 || dto.referenciaCod === 3
        ? dto.referenciaCod
        : null;
    if ((tipo === 'NC' || tipo === 'ND') && origen && esTipoOrigenNcNd(origen.tipo)) {
      if (!referenciaTipo || !esTipoDteReferencia(referenciaTipo)) {
        referenciaTipo = String(mapTipoDte(origen.tipo, origen.indicadorVenta));
      }
      if (!referenciaFolio) {
        const oficial = origen.folioOficial?.trim();
        referenciaFolio = oficial || origen.folio;
      }
      if (!referenciaFecha && origen.fecha) {
        referenciaFecha = origen.fecha;
      }
      if (referenciaCod == null) referenciaCod = 3;
    }
    if (tipo === 'NC' || tipo === 'ND') {
      if (!esTipoDteReferencia(referenciaTipo) || !referenciaFolio) {
        throw new BadRequestException(
          'La NC/ND requiere tipo SII y folio del documento referenciado (buscador o registro manual)',
        );
      }
      if (referenciaCod == null) {
        throw new BadRequestException('Indique CodRef SII: 1 anula, 2 corrige texto, 3 corrige montos');
      }
    }
    return { referenciaTipo, referenciaFolio, referenciaFecha, referenciaCod };
  }

  private async emitirAlGateway(
    d: Parameters<typeof buildCanonicalFromDocumento>[0] & {
      clienteId?: string | null;
    },
  ) {
    const empresa = await this.prisma.empresa.findUnique({ where: { id: d.empresaId } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    const docEmit = await this.hydrateDocumentoReceptor(d);
    const canonical = buildCanonicalFromDocumento(docEmit, empresa);
    assertExportacionFailClosed(canonical);
    return this.billing!.emit(canonical);
  }

  async createDocumento(
    user: JwtPayload,
    dto: UpsertDocumentoDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const tipo = dto.tipo.toUpperCase();
    assertTipoDocumentoAlta(tipo);

    let documentoOrigenId = dto.documentoOrigenId?.trim() || null;
    let folioOrigen = dto.folioOrigen?.trim() || null;
    let origenNc: { id: string; neto: unknown; iva: unknown; indicadorVenta: string | null; folio: string } | null = null;
    let origenRef: {
      tipo: string;
      folio: string;
      folioOficial?: string | null;
      fecha: Date;
      indicadorVenta: string | null;
    } | null = null;
    let payload = dto;

    // Factura electrónica libre no permitida: siempre desde OV (factura-ov / convertir).
    if (tipo === 'FACTURA') {
      if (!documentoOrigenId) {
        throw new BadRequestException(
          'La factura electrónica debe emitirse desde una orden de venta confirmada (stock descontado).',
        );
      }
      const origenFactura = await this.prisma.documentoComercial.findFirst({
        where: { id: documentoOrigenId, empresaId },
        select: { id: true, tipo: true, estado: true, folio: true },
      });
      if (!origenFactura || origenFactura.tipo !== 'ORDEN_VENTA') {
        throw new BadRequestException(
          'El origen de la factura debe ser una orden de venta.',
        );
      }
      if (!ovEsFacturable(origenFactura.estado)) {
        throw new BadRequestException(
          `La OV ${origenFactura.folio} no está facturable (estado ${origenFactura.estado}). Confirme stock primero.`,
        );
      }
      folioOrigen = folioOrigen || origenFactura.folio;
    }

    if (tipo === 'NC' || tipo === 'ND') {
      const manual = referenciaManualCompleta(dto);
      if (!documentoOrigenId && !folioOrigen && !manual) {
        throw new BadRequestException(
          tipo === 'NC'
            ? 'Nota de crédito: seleccione un documento origen o registre tipo SII, folio, fecha y CodRef'
            : 'Nota de débito: seleccione un documento origen o registre tipo SII, folio, fecha y CodRef',
        );
      }
      if (documentoOrigenId || folioOrigen) {
        const origen = documentoOrigenId
          ? await this.prisma.documentoComercial.findFirst({
              where: { id: documentoOrigenId, empresaId },
            })
          : await this.prisma.documentoComercial.findFirst({
              where: { empresaId, folio: folioOrigen! },
            });
        if (!origen) throw new BadRequestException('Documento origen no encontrado');
        if (!esTipoOrigenNcNd(origen.tipo)) {
          throw new BadRequestException(
            'El origen debe ser factura, nota de crédito, nota de débito o guía',
          );
        }
        if (origen.estado === 'ANULADO') {
          throw new BadRequestException(
            tipo === 'NC'
              ? 'No se puede asociar NC a un documento anulado'
              : 'No se puede asociar ND a un documento anulado',
          );
        }
        documentoOrigenId = origen.id;
        folioOrigen = origen.folio;
        origenRef = {
          tipo: origen.tipo,
          folio: origen.folio,
          folioOficial: origen.folioOficial,
          fecha: origen.fecha,
          indicadorVenta: origen.indicadorVenta,
        };
        if (tipo === 'NC' && origen.tipo === 'FACTURA') origenNc = origen;
        payload = inheritComexFromOrigen(dto, origen);
      } else {
        documentoOrigenId = null;
        folioOrigen = dto.referenciaFolio?.trim() || null;
      }
    }

    const referenciaNc = this.resolveReferenciaNcNd(tipo, payload, origenRef);

    const lineas = normalizeLineas(payload.lineas);
    if (lineas?.length) {
      await this.assertLineasMaestro(empresaId, lineas, {
        tipoDoc: tipo,
        indicadorVenta: payload.indicadorVenta,
        referenciaCod: payload.referenciaCod,
      });
    }
    const neto =
      lineas && lineas.length > 0
        ? netoFromLineas(lineas, Number(payload.descuentoGlobalPct ?? 0))
        : payload.neto;
    // P1-7: IVA real; si el front no lo envía, se calcula 19% del neto
    // (0 para EXPORTACION/EXENTO).
    const iva = payload.iva != null ? Number(payload.iva) : ivaFromNeto(neto, payload.indicadorVenta);
    const folio = await this.allocateDocumentoFolio(empresaId, dto.folio.trim(), tipo);

    // P1-9: la(s) NC contra una misma factura origen no pueden, en conjunto,
    // superar el total (neto + IVA) de esa factura.
    if (tipo === 'NC' && origenNc) {
      await this.validarSaldoNc(empresaId, origenNc, Number(neto) + Number(iva));
      if (referenciaNc.referenciaCod === 3) {
        const netoFactura = Number(origenNc.neto) || 0;
        if (Number(neto) + 0.005 >= netoFactura) {
          throw new BadRequestException(
            'La nota de crédito no puede igualar ni superar el monto de la factura. Use CodRef 1 para anular el 100%.',
          );
        }
      }
    }

    if (dto.clienteId) {
      const cli = await this.prisma.cliente.findFirst({
        where: { id: dto.clienteId, empresaId },
      });
      if (!cli) {
        throw new BadRequestException('Cliente no pertenece a la empresa activa');
      }
    }

    try {
      const creator = await this.prisma.usuario.findUnique({
        where: { id: user.sub },
        select: { nombre: true },
      });
      const perms = user.permisos ?? [];
      const canComercial = perms.includes('*') || perms.includes('comercial:write');
      let estadoDoc = ((dto.estado ?? 'BORRADOR').toUpperCase() as never);
      if (tipo === 'ORDEN_VENTA') {
        estadoDoc = normalizeEstadoOv(String(estadoDoc)) as never;
      }
      if (tipo === 'ORDEN_VENTA' && !canComercial) {
        estadoDoc = 'BORRADOR' as never;
      }
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.documentoComercial.create({
        data: {
          folio,
          tipo: tipo as never,
          cliente: dto.cliente.trim(),
          clienteId: dto.clienteId || null,
          proveedorId: dto.proveedorId || null,
          fecha: parseDate(dto.fecha),
          neto,
          iva,
          lineas: lineas
            ? (lineas as unknown as Prisma.InputJsonValue)
            : undefined,
          estado: estadoDoc,
          folioOrigen,
          documentoOrigenId,
          observaciones: optStr(payload.observaciones),
          formaPago: optStr(payload.formaPago),
          fechaVencimiento: parseOptionalDate(payload.fechaVencimiento),
          indicadorVenta: optStr(payload.indicadorVenta),
          descuentoGlobalPct: payload.descuentoGlobalPct ?? null,
          cuentaContableId: optStr(payload.cuentaContableId),
          centroCostoId: optStr(payload.centroCostoId),
          receptorRut: optStr(payload.receptorRut),
          receptorGiro: optStr(payload.receptorGiro),
          receptorDireccion: optStr(payload.receptorDireccion),
          receptorComuna: optStr(payload.receptorComuna),
          receptorCiudad: optStr(payload.receptorCiudad),
          ...comexDataFromDto(payload, 'create'),
          referenciaTipo: referenciaNc.referenciaTipo,
          referenciaFolio: referenciaNc.referenciaFolio,
          referenciaFecha: referenciaNc.referenciaFecha,
          referenciaCod: referenciaNc.referenciaCod,
          creadoPorId: user.sub,
          creadoPorNombre: creator?.nombre ?? user.email,
          empresaId,
        },
        });
        const estadoNow = String(estadoDoc);
        if (tipo === 'ORDEN_VENTA' && lineas?.length && ovEsFacturable(estadoNow)) {
          await this.applySalidaVentaOv(tx, { empresaId, folio: created.folio, lineas });
        }
        if (tipo === 'GUIA') {
          await this.syncGuiaProjection(tx, created);
        }
        return created;
      });
      return mapDoc(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un documento con ese folio');
      }
      throw e;
    }
  }

  /**
   * Reverso contable (Reu4 V2 / MJ): deshace la imputación (asiento) para
   * corregir cuenta/CC y volver a contabilizar. No anula el documento fiscal
   * ni genera NC (la NC es un flujo aparte ante el SII).
   */
  async reversarDocumento(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const orig = await this.prisma.documentoComercial.findUnique({ where: { id } });
    if (!orig) throw new NotFoundException('Documento no encontrado');
    assertTenantAccess(scope, orig.empresaId);
    if (orig.estado === 'ANULADO') {
      throw new BadRequestException('Documento ya anulado');
    }
    if (orig.estado !== 'CONTABILIZADA') {
      throw new BadRequestException('Solo se puede reversar un documento contabilizado');
    }
    if (orig.asientoReversador && !orig.asientoNuevo) {
      throw new BadRequestException(
        'Este documento ya tiene reverso contable pendiente de re-contabilizar',
      );
    }

    const asientoNumeroActivo = orig.asientoNuevo || orig.asientoOriginal;
    let asientoOrig = orig.asientoOriginal;
    let asientoRev: string | undefined;

    if (this.contabilizar && asientoNumeroActivo) {
      const asiento = await this.prisma.asiento.findFirst({
        where: { empresaId: orig.empresaId, numero: asientoNumeroActivo },
      });
      if (asiento) {
        const rev = await this.contabilizar.createAsientoReversa(
          orig.empresaId,
          asiento.id,
          `Reversa contable ${orig.folio}`,
        );
        asientoRev = rev.numero;
        if (!asientoOrig) asientoOrig = asiento.numero;
      }
    }

    if (!asientoRev) {
      // Fallback sin asiento persistido: reconstruye con cuenta real del
      // documento (nunca líneas "ciegas" sin cuentaId, P0-1).
      if (!this.contabilizar) {
        throw new BadRequestException(
          'Servicio de contabilización no disponible; no se puede generar el reverso',
        );
      }
      const monto = Number(orig.neto);
      const ivaMonto = Number(orig.iva ?? ivaFromNeto(monto, orig.indicadorVenta));
      const montoTotal = monto + ivaMonto;
      const esNc = orig.tipo === 'NC';
      const { cuentaId, contraId, dimCuenta, dimContra } = await this.resolveCuentasImputacion(
        orig.empresaId,
        orig.tipo,
        orig.cuentaContableId,
      );
      const iva = ivaMonto > 0
        ? await this.resolveCuentaIva(orig.empresaId, orig.tipo, [cuentaId, contraId])
        : { cuentaId: undefined, dim: {} };
      const ivaCuentaId = iva.cuentaId;
      const lineaIva = ivaMonto > 0 && ivaCuentaId
        ? (esNc
            ? { debe: 0, haber: ivaMonto, cuentaId: ivaCuentaId, glosa: 'Reversa IVA crédito fiscal', ...iva.dim }
            : { debe: ivaMonto, haber: 0, cuentaId: ivaCuentaId, glosa: 'Reversa IVA débito fiscal', ...iva.dim })
        : undefined;
      const a = await this.contabilizar.createAsiento({
        empresaId: orig.empresaId,
        glosa: `Reversa contable ${orig.folio}`,
        origen: `REVERSA:${orig.folio}`,
        lineas: esNc
          ? [
              { debe: 0, haber: monto, cuentaId, glosa: 'Reversa NC', ...dimCuenta },
              ...(lineaIva ? [lineaIva] : []),
              { debe: montoTotal, haber: 0, cuentaId: contraId, glosa: 'Clientes', ...dimContra },
            ]
          : [
              { debe: 0, haber: montoTotal, cuentaId: contraId, glosa: 'Clientes', ...dimContra },
              { debe: monto, haber: 0, cuentaId, glosa: 'Reversa venta', ...dimCuenta },
              ...(lineaIva ? [lineaIva] : []),
            ],
      });
      asientoRev = a.numero;
    }

    const row = await this.prisma.documentoComercial.update({
      where: { id },
      data: {
        estado: 'EMITIDO',
        fromReversa: true,
        asientoOriginal: asientoOrig,
        asientoReversador: asientoRev,
        asientoNuevo: null,
        folioReversador: null,
      },
      include: { empresa: { select: { id: true, razonSocial: true } } },
    });

    // P0-6: el reverso contable también debe revertir la CXC generada al
    // contabilizar; si no, el saldo del cliente queda inflado con un
    // documento que ya no está vigente.
    if (this.cuentaCorriente && (orig.tipo === 'FACTURA' || orig.tipo === 'NC' || orig.tipo === 'ND')) {
      const ivaOrig = Number(orig.iva ?? ivaFromNeto(Number(orig.neto), orig.indicadorVenta));
      const monto = Number(orig.neto) + ivaOrig;
      const terceroId = orig.clienteId || orig.cliente;
      try {
        if (orig.tipo === 'FACTURA' || orig.tipo === 'ND') {
          await this.cuentaCorriente.registrarMovimiento({
            empresaId: orig.empresaId,
            terceroTipo: 'CLIENTE',
            terceroId,
            terceroNombre: row.cliente,
            fecha: new Date(),
            documentoRef: row.folio,
            documentoTipo: orig.tipo === 'ND' ? 'ND' : 'FACTURA',
            debe: 0,
            haber: monto,
            glosa: `Reverso contable ${row.folio}`,
            origen: 'VENTA',
          });
        } else {
          await this.cuentaCorriente.registrarMovimiento({
            empresaId: orig.empresaId,
            terceroTipo: 'CLIENTE',
            terceroId,
            terceroNombre: row.cliente,
            fecha: new Date(),
            documentoRef: row.folio,
            documentoTipo: 'NC',
            debe: monto,
            haber: 0,
            glosa: `Reverso contable ${row.folio}`,
            origen: 'VENTA',
          });
        }
      } catch {
        // no bloquear el reverso si CC falla (p.ej. migración pendiente)
      }
    }

    return {
      documento: mapDoc(row),
      cadena: {
        asientoOrig: asientoOrig ?? undefined,
        asientoRev,
        asientoNuevo: undefined,
      },
    };
  }

  private async hydrateDocumentoReceptor<T extends {
    empresaId: string;
    tipo: string;
    clienteId?: string | null;
    indicadorVenta?: string | null;
    receptorDireccion?: string | null;
    receptorComuna?: string | null;
    receptorCiudad?: string | null;
  }>(d: T): Promise<T> {
    const cliente = d.clienteId
      ? await this.prisma.cliente.findFirst({
          where: { id: d.clienteId, empresaId: d.empresaId },
          include: { direcciones: true },
        })
      : null;
    const domicilio = resolveDomicilioFiscal({
      direccion: d.receptorDireccion || cliente?.direccion,
      comuna: d.receptorComuna || cliente?.comuna,
      ciudad: d.receptorCiudad || cliente?.ciudad,
      direcciones: cliente?.direcciones,
    });
    const tipoDte = mapTipoDte(d.tipo, d.indicadorVenta);
    if (TIPOS_DTE_EXIGEN_DOMICILIO_RECEPTOR.has(tipoDte) && !domicilio) {
      throw new BadRequestException(
        'El cliente no tiene dirección fiscal y comuna. Complételos en Ventas › Clientes antes de emitir.',
      );
    }
    if (!domicilio) return d;
    return {
      ...d,
      receptorDireccion: d.receptorDireccion?.trim() || domicilio.direccion,
      receptorComuna: d.receptorComuna?.trim() || domicilio.comuna,
      receptorCiudad: d.receptorCiudad?.trim() || domicilio.ciudad,
    };
  }

  /**
   * Emite el DTE al partner y deja EMITIDO. No exige cuenta ni crea asiento
   * (la imputación vive en Libro › Por contabilizar).
   */
  async emitirDocumentoFiscal(
    user: JwtPayload,
    id: string,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const d = await this.prisma.documentoComercial.findFirst({
      where: { id, empresaId },
    });
    if (!d) throw new NotFoundException('Documento no encontrado');
    assertTipoDocumentoVigente(d.tipo, 'mutate');
    if (d.estado === 'ANULADO') {
      throw new BadRequestException('No se puede emitir un documento anulado');
    }
    if (d.estado === 'CONTABILIZADA' && d.billingEmissionId) {
      return mapDoc(d);
    }

    let billingPatch: Prisma.DocumentoComercialUpdateInput = {};
    if (this.billing?.isEnabled() && (d.tipo === 'FACTURA' || d.tipo === 'NC' || d.tipo === 'ND' || d.tipo === 'GUIA') && !d.billingEmissionId) {
      const emission = await this.emitirAlGateway(d);
      billingPatch = billingPatchFromEmission(emission);
    }

    const row = await this.prisma.documentoComercial.update({
      where: { id },
      data: { estado: 'EMITIDO', ...billingPatch },
    });
    const conFolio = await this.tryRefreshFolioTrasEmitir(row);
    if (d.tipo === 'GUIA') await this.syncGuiaProjection(this.prisma, conFolio);
    return mapDoc(conFolio);
  }

  async grabarDocumentoContabilizar(
    user: JwtPayload,
    id: string,
    dto?: {
      cuentaContableId?: string;
      centroCostoId?: string;
      glosa?: string;
      cliente?: string;
      lineas?: DocumentoLineaDto[];
    },
  ) {
    const scope = resolveTenant(user);
    const where: Prisma.DocumentoComercialWhereInput = { id };
    if ('empresaIds' in scope) {
      where.empresaId = { in: scope.empresaIds };
    }
    let d = await this.prisma.documentoComercial.findFirst({ where });
    if (!d) throw new NotFoundException('Documento no encontrado');
    assertTipoDocumentoVigente(d.tipo, 'mutate');

    if (d.tipo === 'GUIA') {
      let billingPatch: Prisma.DocumentoComercialUpdateInput = {};
      if (this.billing?.isEnabled() && !d.billingEmissionId) {
        const emission = await this.emitirAlGateway(d);
        billingPatch = billingPatchFromEmission(emission);
        await this.prisma.documentoComercial.update({ where: { id }, data: billingPatch });
      }
      const row = await this.prisma.documentoComercial.update({
        where: { id },
        data: { estado: 'EMITIDO', ...billingPatch },
      });
      await this.syncGuiaProjection(this.prisma, row);
      return mapDoc(row);
    }

    if (
      (d.tipo === 'FACTURA' || d.tipo === 'NC' || d.tipo === 'ND')
      && !this.contabilizar
    ) {
      throw new ServiceUnavailableException('Servicio de contabilización no disponible');
    }

    const glosa = dto?.glosa?.trim()
      || `Contabiliza ${d.folio}${dto?.cliente ? ` · ${dto.cliente}` : ''}`;
    let lineasDoc = parseStoredLineas(d.lineas) ?? [];
    if (dto?.lineas?.length) {
      const normalizadas = normalizeLineas(dto.lineas);
      if (normalizadas?.length) {
        await this.assertLineasMaestro(d.empresaId, normalizadas, {
          tipoDoc: d.tipo,
          indicadorVenta: d.indicadorVenta,
        });
        lineasDoc = normalizadas;
        await this.prisma.documentoComercial.update({
          where: { id },
          data: { lineas: lineasDoc as unknown as Prisma.InputJsonValue },
        });
        d = { ...d, lineas: lineasDoc as never };
      }
    }
    let cuentaId = dto?.cuentaContableId?.trim() || d.cuentaContableId || undefined;
    let dimVentas: DimensionesAsiento = {};
    const ccRef = dto?.centroCostoId?.trim() || d.centroCostoId || undefined;
    /** Si el libro manda ítems, el CC va por línea (MJ 08/09); no rellenar con cabecera. */
    const ccAsiento = dto?.lineas?.length ? undefined : ccRef;
    const esRecontabilizacion = Boolean(d.asientoReversador && !d.asientoNuevo);

    const lineasSinCuenta = lineasDoc.filter((l) => {
      const relevante = Boolean(l.insumoId || String(l.descripcion ?? '').trim() || l.tipoLinea === 'FLETE');
      return relevante && !String(l.cuentaContableId ?? '').trim();
    });
    if ((d.tipo === 'FACTURA' || d.tipo === 'NC' || d.tipo === 'ND') && lineasSinCuenta.length) {
      throw new BadRequestException(
        'Asocie cuenta contable en cada ítem antes de contabilizar (Libro de ventas)',
      );
    }
    if (d.tipo === 'FACTURA' && !cuentaId && !lineasDoc.some((l) => l.cuentaContableId)) {
      throw new BadRequestException(
        'Asocie cuenta contable en cada ítem antes de contabilizar (Libro de ventas)',
      );
    }

    // Default desde Config SII (VENTAS / CLIENTES) o plan imputable
    if (!cuentaId && !lineasDoc.some((l) => l.cuentaContableId)) {
      const tipSii = d.tipo === 'NC' ? 'NC' : 'VENTAS';
      const cfg = await this.prisma.configContableSii.findFirst({
        where: {
          empresaId: d.empresaId,
          activa: true,
          tipoDocumentoSii: { in: [tipSii, 'VENTAS', 'INGRESO_VENTA', 'CLIENTES'] },
        },
        orderBy: { tipoDocumentoSii: 'asc' },
      });
      cuentaId = cfg?.cuentaContableId;
      if (cuentaId) dimVentas = dimensionesDeConfigSii(cfg);
    }
    if (!cuentaId && !lineasDoc.some((l) => l.cuentaContableId)) {
      const cta = await this.prisma.cuentaContable.findFirst({
        where: { empresaId: d.empresaId, activa: true, noImputable: false },
        orderBy: { codigo: 'asc' },
      });
      cuentaId = cta?.id;
      dimVentas = {};
    }
    if (!cuentaId && !lineasDoc.some((l) => l.cuentaContableId)) {
      throw new BadRequestException('Selecciona cuenta contable o configura SII → cuenta');
    }

    const cfgClientes = await this.prisma.configContableSii.findFirst({
      where: {
        empresaId: d.empresaId,
        activa: true,
        tipoDocumentoSii: { in: ['CLIENTES', 'CLIENTES_POR_COBRAR'] },
      },
    });
    let contraId = cfgClientes?.cuentaContableId;
    let dimClientes = contraId ? dimensionesDeConfigSii(cfgClientes) : {};
    if (!contraId) {
      const contra = await this.prisma.cuentaContable.findFirst({
        where: {
          empresaId: d.empresaId,
          activa: true,
          noImputable: false,
          ...(cuentaId ? { id: { not: cuentaId } } : {}),
        },
        orderBy: { codigo: 'asc' },
      });
      contraId = contra?.id || cuentaId;
      dimClientes = {};
    }
    if (!contraId) {
      throw new BadRequestException('No hay cuenta de clientes / contrapartida para el asiento');
    }

    // P1-7: IVA y asiento ANTES de GoSocket. Si CLIENTES/IVA/línea no es
    // imputable o el periodo está cerrado, no se envía el DTE.
    const ivaMonto = Number(d.iva ?? ivaFromNeto(Number(d.neto), d.indicadorVenta));
    const iva = ivaMonto > 0
      ? await this.resolveCuentaIva(d.empresaId, d.tipo, [cuentaId, contraId])
      : { cuentaId: undefined, dim: {} as DimensionesAsiento };
    const ivaCuentaId = iva.cuentaId;

    let asientoOriginal = d.asientoOriginal;
    let asientoNuevo = d.asientoNuevo;
    const debeCrearAsiento = Boolean(this.contabilizar)
      && (!asientoOriginal || esRecontabilizacion);

    const glosaAsiento = [glosa, ccAsiento && `CC ${ccAsiento}`].filter(Boolean).join(' · ');
    const origenAsiento = esRecontabilizacion ? `DOC-NEW:${d.folio}` : `DOC:${d.folio}`;
    const asientoLineas = debeCrearAsiento
      ? this.buildAsientoVentasLineas({
          tipo: d.tipo,
          neto: Number(d.neto),
          ivaMonto,
          cuentaId,
          contraId,
          ivaCuentaId,
          ccRef: ccAsiento,
          lineasDoc,
          dimVentas,
          dimClientes,
          dimIva: iva.dim,
        })
      : [];

    if (debeCrearAsiento && this.contabilizar) {
      await this.contabilizar.assertAsientoValido?.({
        empresaId: d.empresaId,
        glosa: glosaAsiento,
        origen: origenAsiento,
        fecha: d.fecha,
        lineas: asientoLineas,
      });
    }

    // billing-gateway: solo si el asiento ya es válido. Se persiste la
    // emisión para no reenviar al partner si createAsiento falla después
    // (p. ej. colisión de número, caída de BD).
    let billingPatch: Prisma.DocumentoComercialUpdateInput = {};
    if (this.billing?.isEnabled() && (d.tipo === 'FACTURA' || d.tipo === 'NC' || d.tipo === 'ND') && !d.billingEmissionId) {
      const emission = await this.emitirAlGateway(d);
      billingPatch = billingPatchFromEmission(emission);
      await this.prisma.documentoComercial.update({ where: { id }, data: billingPatch });
    }

    if (debeCrearAsiento && this.contabilizar) {
      const a = await this.contabilizar.createAsiento({
        empresaId: d.empresaId,
        glosa: glosaAsiento,
        origen: origenAsiento,
        fecha: d.fecha,
        lineas: asientoLineas,
      });
      if (esRecontabilizacion) asientoNuevo = a.numero;
      else asientoOriginal = a.numero;
    } else if (!asientoOriginal) {
      throw new BadRequestException(
        'Servicio de contabilización no disponible; no se puede contabilizar el documento',
      );
    }

    const row = await this.prisma.documentoComercial.update({
      where: { id },
      data: {
        estado: 'CONTABILIZADA',
        asientoOriginal,
        ...(asientoNuevo ? { asientoNuevo } : {}),
        ...(dto?.cliente?.trim() ? { cliente: dto.cliente.trim() } : {}),
        ...(cuentaId ? { cuentaContableId: cuentaId } : {}),
        ...(ccAsiento ? { centroCostoId: ccAsiento } : {}),
        ...billingPatch,
      },
    });

    // P0-6: la CXC se posta en la primera contabilización Y también al
    // re-contabilizar tras un reverso (el reverso ya la dejó en $0, así que
    // hay que restaurarla aquí o el saldo del cliente queda inflado/vacío).
    if (
      this.cuentaCorriente
      && (d.tipo === 'FACTURA' || d.tipo === 'NC' || d.tipo === 'ND')
      && debeCrearAsiento
    ) {
      // CXC es por el total (neto + IVA), no solo el neto.
      const ivaCc = Number(d.iva ?? ivaFromNeto(Number(d.neto), d.indicadorVenta));
      const monto = Number(d.neto) + ivaCc;
      const terceroId = d.clienteId || d.cliente;
      const glosaCc = esRecontabilizacion
        ? `${d.tipo === 'NC' ? 'NC' : d.tipo === 'ND' ? 'ND' : 'Venta'} ${row.folio} (re-contab. post-reverso)`
        : `${d.tipo === 'NC' ? 'NC' : d.tipo === 'ND' ? 'ND' : 'Venta'} ${row.folio}`;
      try {
        if (d.tipo === 'FACTURA' || d.tipo === 'ND') {
          await this.cuentaCorriente.registrarMovimiento({
            empresaId: d.empresaId,
            terceroTipo: 'CLIENTE',
            terceroId,
            terceroNombre: row.cliente,
            fecha: row.fecha,
            documentoRef: row.folio,
            documentoTipo: d.tipo,
            debe: monto,
            haber: 0,
            glosa: glosaCc,
            origen: 'VENTA',
            documentoComercialId: row.id,
          });
        } else {
          await this.cuentaCorriente.registrarMovimiento({
            empresaId: d.empresaId,
            terceroTipo: 'CLIENTE',
            terceroId,
            terceroNombre: row.cliente,
            fecha: row.fecha,
            documentoRef: row.folio,
            documentoTipo: 'NC',
            debe: 0,
            haber: monto,
            glosa: glosaCc,
            origen: 'VENTA',
            documentoComercialId: row.id,
          });
        }
      } catch {
        // no bloquear contabilización si CC falla (p.ej. migración pendiente)
      }
      try {
        await upsertAgingDesdeVenta(this.prisma, row);
      } catch {
        /* no bloquear */
      }
    }

    if (d.tipo === 'NC' && d.estado !== 'CONTABILIZADA' && debeCrearAsiento) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.applyReingresoNcDesdeContabilizar(tx, {
            empresaId: d.empresaId,
            folio: row.folio,
            lineas: lineasDoc,
            documentoOrigenId: d.documentoOrigenId,
          });
        });
      } catch {
        // no bloquear contabilización si bodega falla (p.ej. sin splits)
      }
    }

    return mapDoc(row);
  }

  async cargaMasivaDocumentos(
    user: JwtPayload,
    dto: { items: Array<{
      folio: string;
      tipo: string;
      cliente: string;
      fecha: string;
      neto: number;
      estado?: string;
      exclude?: boolean;
    }> },
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const existing = await this.prisma.documentoComercial.findMany({
      where: { empresaId },
      select: { folio: true },
    });
    const folios = new Set(existing.map((d) => d.folio));
    const created: unknown[] = [];
    const skipped: { folio: string; reason: string }[] = [];

    for (const item of dto.items) {
      if (item.exclude) {
        skipped.push({ folio: item.folio, reason: 'excluido' });
        continue;
      }
      const folio = item.folio.trim();
      if (folios.has(folio)) {
        skipped.push({ folio, reason: 'duplicado' });
        continue;
      }
      const row = await this.createDocumento(user, {
        folio,
        tipo: item.tipo,
        cliente: item.cliente,
        fecha: item.fecha,
        neto: item.neto,
        estado: item.estado ?? 'BORRADOR',
      }, empresaHeader);
      folios.add(folio);
      created.push(row);
    }

    return { created: created.length, skipped, rows: created };
  }

  async getWorkflows(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.workflowConfig.findMany({
      where: { empresaId },
      orderBy: { nombre: 'asc' },
    });
    const allIds = [...new Set(rows.flatMap((r) => r.aprobadorIds ?? []))];
    const usuarios = allIds.length
      ? await this.prisma.usuario.findMany({
          where: { id: { in: allIds } },
          select: { id: true, nombre: true, activo: true },
        })
      : [];
    const byId = new Map(usuarios.map((u) => [u.id, u]));
    return rows.map((r) => {
      const ids = r.aprobadorIds ?? [];
      return {
        id: r.id,
        nombre: r.nombre,
        modulo: r.modulo,
        montoMin: Number(r.montoMin),
        montoMax: Number(r.montoMax),
        aprobadores: r.aprobadores,
        aprobadorIds: ids,
        aprobadoresUsuarios: ids
          .map((id) => byId.get(id))
          .filter((u): u is NonNullable<typeof u> => !!u && u.activo !== false)
          .map((u) => ({
            id: u.id,
            nombre: u.nombre,
            activo: u.activo,
          })),
        activo: r.activo,
      };
    });
  }

  async getLibroComercial(
    user: JwtPayload,
    ambito: string | undefined,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const a = (ambito || 'ventas').toLowerCase();

    if (a === 'compras') {
      const rows = await this.prisma.registroCompra.findMany({
        where: { empresaId },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      return rows.map((r) => ({
        id: r.id,
        ambito: 'compras' as const,
        folio: r.factura,
        tipo: 'COMPRA',
        contraparte: r.proveedorFactura,
        fecha: r.createdAt.toISOString().slice(0, 10),
        neto: Number(r.monto),
        estado: r.estado,
        origenRef: r.ocNumero,
      }));
    }

    if (a === 'despachos') {
      const rows = await this.prisma.guiaDespacho.findMany({
        where: { empresaId },
        orderBy: { fecha: 'desc' },
      });
      return rows.map((r) => ({
        id: r.id,
        ambito: 'despachos' as const,
        folio: r.folio,
        tipo: 'GD',
        contraparte: r.cliente,
        fecha: r.fecha.toISOString().slice(0, 10),
        neto: Number(r.monto),
        estado: r.estado,
        origenRef: r.documentoComercialId ?? undefined,
        glosa: r.glosa ?? undefined,
      }));
    }

    // ventas (default): DTE de salida (no guías; esas van a ámbito despachos).
    const rows = await this.prisma.documentoComercial.findMany({
      where: { empresaId, tipo: { in: ['FACTURA', 'NC', 'ND'] } },
      orderBy: { fecha: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      ambito: 'ventas' as const,
      folio: r.folio,
      tipo: r.tipo,
      contraparte: r.cliente,
      fecha: r.fecha.toISOString().slice(0, 10),
      neto: Number(r.neto),
      estado: r.estado,
      origenRef: r.folioOrigen ?? undefined,
    }));
  }

  async getGuiasDespacho(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    return this.getLibroComercial(user, 'despachos', empresaHeader, empresaQuery);
  }

  async createGuiaDespacho(
    user: JwtPayload,
    dto: UpsertGuiaDespachoDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const estado = (dto.estado || 'BORRADOR').toUpperCase();
    const linkedId = dto.documentoComercialId?.trim() || null;
    if (linkedId) {
      const doc = await this.prisma.documentoComercial.findFirst({
        where: { id: linkedId, empresaId },
      });
      if (!doc) throw new BadRequestException('Documento comercial vinculado no encontrado');
      try {
        await this.syncGuiaProjection(this.prisma, {
          ...doc,
          folio: dto.folio.trim() || doc.folio,
          cliente: dto.cliente.trim() || doc.cliente,
          fecha: dto.fecha ? parseDate(dto.fecha) : doc.fecha,
          neto: dto.monto ?? doc.neto,
          iva: 0,
          estado,
          observaciones: dto.glosa?.trim() || doc.observaciones,
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('Ya existe una guía con ese folio');
        }
        throw e;
      }
      const row = await this.prisma.guiaDespacho.findFirst({
        where: { empresaId, folio: (dto.folio.trim() || doc.folio) },
      });
      if (!row) throw new ConflictException('No se pudo persistir la guía');
      return {
        id: row.id,
        ambito: 'despachos' as const,
        folio: row.folio,
        tipo: 'GD',
        contraparte: row.cliente,
        fecha: row.fecha.toISOString().slice(0, 10),
        neto: Number(row.monto),
        estado: row.estado,
        origenRef: row.documentoComercialId ?? undefined,
        glosa: row.glosa ?? undefined,
      };
    }

    const doc = await this.createDocumento(
      user,
      {
        folio: dto.folio.trim(),
        tipo: 'GUIA',
        cliente: dto.cliente.trim(),
        fecha: dto.fecha,
        neto: dto.monto ?? 0,
        iva: 0,
        estado,
        observaciones: dto.glosa?.trim() || '',
      },
      empresaHeader,
    );
    const row = await this.prisma.guiaDespacho.findFirst({
      where: { empresaId, folio: doc.folio },
    });
    if (!row) throw new ConflictException('No se pudo persistir la guía');
    return {
      id: row.id,
      ambito: 'despachos' as const,
      folio: row.folio,
      tipo: 'GD',
      contraparte: row.cliente,
      fecha: row.fecha.toISOString().slice(0, 10),
      neto: Number(row.monto),
      estado: row.estado,
      origenRef: row.documentoComercialId ?? undefined,
      glosa: row.glosa ?? undefined,
    };
  }
}
