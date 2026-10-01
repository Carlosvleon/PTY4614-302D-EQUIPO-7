import { BadRequestException } from '@nestjs/common';
import type { CanonicalDocumentV1 } from '../common/types';
import { FOREIGN_RECEIVER_ID_MAX_LENGTH, isForeignReceiverId } from './receiver-id';

const FORBIDDEN = ['cuentaContableId', 'centroCostoId'];
const ALLOWED_DTE = new Set([33, 34, 52, 56, 61, 110, 111, 112]);
const RUT_PATTERN = /^\d{7,8}-[\dK]$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CANONICAL_BYTES = 256 * 1024;
const MAX_LINES = 500;

export function assertCanonical(doc: CanonicalDocumentV1): void {
  const raw = JSON.stringify(doc);
  if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_CANONICAL_BYTES) {
    throw invalid(`Canónico excede el máximo de ${MAX_CANONICAL_BYTES} bytes`);
  }
  for (const key of FORBIDDEN) {
    if (raw.includes(`"${key}"`)) {
      throw invalid(`Campo prohibido en canónico: ${key}`);
    }
  }

  if (!doc || doc.schemaVersion !== '1.0') {
    throw new BadRequestException('schemaVersion debe ser "1.0"');
  }

  assertString(doc.idempotencyKey, 'idempotencyKey', 200);
  if (!doc.source) throw invalid('source requerido');
  assertString(doc.source.erpId, 'source.erpId', 100);
  assertString(doc.source.empresaId, 'source.empresaId', 100);
  assertString(doc.source.documentoId, 'source.documentoId', 150);
  if (doc.source.billerId != null && String(doc.source.billerId).trim() !== '') {
    const billerId = String(doc.source.billerId).trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(billerId)) {
      throw invalid('source.billerId debe ser un UUID');
    }
  }
  const apiUser = doc.source.apiUser != null ? String(doc.source.apiUser).trim() : '';
  const apiPassword = doc.source.apiPassword != null ? String(doc.source.apiPassword).trim() : '';
  if (apiUser || apiPassword) {
    if (!apiUser || !apiPassword) {
      throw invalid('source.apiUser y source.apiPassword deben ir juntos');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(apiUser)) {
      throw invalid('source.apiUser debe ser un UUID');
    }
    if (apiPassword.length > 200) {
      throw invalid('source.apiPassword excede el máximo');
    }
  }

  assertParty(doc.emisor, 'emisor');
  assertParty(doc.receptor, 'receptor', doc.indicadores?.exportacion === true);
  if (new Set([33, 34, 52, 56, 61]).has(doc.documento?.tipoDte)) {
    assertString(doc.receptor.direccion, 'receptor.direccion', 300);
    assertString(doc.receptor.comuna, 'receptor.comuna', 100);
  }

  if (!doc.documento) throw invalid('documento requerido');
  if (!ALLOWED_DTE.has(doc.documento.tipoDte)) {
    throw invalid('documento.tipoDte no soportado');
  }
  assertIsoDate(doc.documento.fechaEmision, 'documento.fechaEmision');
  assertOptionalIsoDate(doc.documento.fechaVencimiento, 'documento.fechaVencimiento');
  if (
    doc.documento.fechaVencimiento
    && doc.documento.fechaVencimiento < doc.documento.fechaEmision
  ) {
    throw invalid('documento.fechaVencimiento no puede ser anterior a fechaEmision');
  }
  assertString(doc.documento.numeroInterno, 'documento.numeroInterno', 100);
  assertOptionalString(doc.documento.formaPago, 'documento.formaPago', 100);
  assertOptionalString(doc.documento.moneda, 'documento.moneda', 10);
  if (doc.documento.comex) {
    const c = doc.documento.comex;
    assertOptionalString(c.tpoMoneda, 'documento.comex.tpoMoneda', 10);
    assertOptionalString(c.codPaisRecep, 'documento.comex.codPaisRecep', 10);
    assertOptionalString(c.indTraslado, 'documento.comex.indTraslado', 200);
    assertOptionalString(c.bultoMarca, 'documento.comex.bultoMarca', 80);
    assertOptionalString(c.bultoTipoCodigo, 'documento.comex.bultoTipoCodigo', 20);
    assertOptionalString(c.paisDestino, 'documento.comex.paisDestino', 20);
    assertOptionalString(c.puertoEmbarque, 'documento.comex.puertoEmbarque', 20);
    assertOptionalString(c.puertoDesembarque, 'documento.comex.puertoDesembarque', 20);
    assertOptionalString(c.clausulaVenta, 'documento.comex.clausulaVenta', 40);
    assertOptionalString(c.viaTransporte, 'documento.comex.viaTransporte', 40);
    assertOptionalString(c.modalidadVenta, 'documento.comex.modalidadVenta', 40);
  }
  if (doc.documento.referencia) {
    assertOptionalString(doc.documento.referencia.tipo, 'documento.referencia.tipo', 50);
    assertOptionalString(doc.documento.referencia.folio, 'documento.referencia.folio', 100);
    assertOptionalIsoDate(doc.documento.referencia.fecha, 'documento.referencia.fecha');
  }

  if (!doc.totales) throw invalid('totales requerido');
  assertNonNegative(doc.totales.neto, 'totales.neto');
  assertNonNegative(doc.totales.iva, 'totales.iva');
  assertNonNegative(doc.totales.total, 'totales.total');
  const exento = doc.totales.exento ?? 0;
  assertNonNegative(exento, 'totales.exento');
  if (doc.totales.tasaIva !== undefined) {
    assertNonNegative(doc.totales.tasaIva, 'totales.tasaIva');
  }
  // Contrato ERP: neto ya contiene el total afecto/exento; `exento` clasifica
  // una porción de neto y no es un monto adicional.
  if (exento - doc.totales.neto > moneyTolerance(doc.totales.neto)) {
    throw invalid('totales.exento no puede superar totales.neto');
  }
  const expectedTotal = doc.totales.neto + doc.totales.iva;
  if (Math.abs(expectedTotal - doc.totales.total) > moneyTolerance(doc.totales.total)) {
    throw invalid('totales.total no coincide con neto + iva');
  }

  if (!Array.isArray(doc.lineas) || doc.lineas.length === 0) {
    throw invalid('Al menos una línea requerida');
  }
  if (doc.lineas.length > MAX_LINES) {
    throw invalid(`lineas excede el máximo de ${MAX_LINES}`);
  }
  let lineNetTotal = 0;
  doc.lineas.forEach((linea, index) => {
    const path = `lineas[${index}]`;
    if (!linea || !Number.isInteger(linea.nro) || linea.nro <= 0) {
      throw invalid(`${path}.nro debe ser entero positivo`);
    }
    assertString(linea.descripcion, `${path}.descripcion`, 500);
    const detalle = typeof linea.detalle === 'string' ? linea.detalle.trim() : '';
    if (detalle) assertString(detalle, `${path}.detalle`, 1000);
    assertPositive(linea.cantidad, `${path}.cantidad`);
    assertNonNegative(linea.precio, `${path}.precio`);
    assertNonNegative(linea.montoNeto, `${path}.montoNeto`);
    assertOptionalString(linea.unidad, `${path}.unidad`, 30);
    if (linea.descuentoPct !== undefined) {
      assertNonNegative(linea.descuentoPct, `${path}.descuentoPct`);
      if (linea.descuentoPct > 100) throw invalid(`${path}.descuentoPct no puede superar 100`);
    }
    const expectedLineNet =
      linea.cantidad * linea.precio * (1 - (linea.descuentoPct ?? 0) / 100);
    if (
      !Number.isFinite(expectedLineNet)
      || Math.abs(expectedLineNet - linea.montoNeto) > lineRoundingTolerance(expectedLineNet)
    ) {
      throw invalid(`${path}.montoNeto no coincide con cantidad, precio y descuento`);
    }
    lineNetTotal += linea.montoNeto;
  });
  if (
    !Number.isFinite(lineNetTotal)
    || Math.abs(lineNetTotal - doc.totales.neto) > aggregateRoundingTolerance(doc.lineas.length)
  ) {
    throw invalid('La suma de lineas.montoNeto no coincide con totales.neto');
  }
  if (doc.glosas) {
    if (!Array.isArray(doc.glosas) || doc.glosas.length > 20) {
      throw invalid('glosas debe contener como máximo 20 elementos');
    }
    doc.glosas.forEach((glosa, index) => assertString(glosa, `glosas[${index}]`, 500));
  }
}

function assertParty(
  party: CanonicalDocumentV1['emisor'] | CanonicalDocumentV1['receptor'] | undefined,
  path: 'emisor' | 'receptor',
  allowForeignId = false,
): void {
  if (!party) throw invalid(`${path} requerido`);
  if (allowForeignId && isForeignReceiverId(party.rut)) {
    assertString(party.rut, `${path}.rut`, FOREIGN_RECEIVER_ID_MAX_LENGTH);
  } else {
    assertRut(party.rut, `${path}.rut`);
  }
  assertString(party.razonSocial, `${path}.razonSocial`, 200);
  assertOptionalString(party.giro, `${path}.giro`, 200);
  assertOptionalString(party.direccion, `${path}.direccion`, 300);
  assertOptionalString(party.comuna, `${path}.comuna`, 100);
  assertOptionalString(party.ciudad, `${path}.ciudad`, 100);
}

function assertRut(value: unknown, path: string): void {
  assertString(value, path, 20);
  const normalized = value.replace(/[.\s]/g, '').toUpperCase();
  if (!RUT_PATTERN.test(normalized) || !hasValidRutChecksum(normalized)) {
    throw invalid(`${path} inválido`);
  }
}

function hasValidRutChecksum(normalized: string): boolean {
  const [body, checkDigit] = normalized.split('-');
  let sum = 0;
  let multiplier = 2;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const result = 11 - (sum % 11);
  const expected = result === 11 ? '0' : result === 10 ? 'K' : String(result);
  return expected === checkDigit;
}

function assertIsoDate(value: unknown, path: string): asserts value is string {
  assertString(value, path, 10);
  if (!ISO_DATE_PATTERN.test(value)) throw invalid(`${path} debe usar formato YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw invalid(`${path} no es una fecha calendario válida`);
  }
}

function assertOptionalIsoDate(value: unknown, path: string): void {
  if (value === undefined || value === null) return;
  assertIsoDate(value, path);
}

function assertString(value: unknown, path: string, max: number): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw invalid(`${path} requerido`);
  if (value.length > max) throw invalid(`${path} excede ${max} caracteres`);
}

function assertOptionalString(value: unknown, path: string, max: number): void {
  if (value === undefined || value === null) return;
  assertString(value, path, max);
}

function assertPositive(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw invalid(`${path} debe ser finito y mayor que cero`);
  }
}

function assertNonNegative(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw invalid(`${path} debe ser finito y no negativo`);
  }
}

function moneyTolerance(total: number): number {
  return Math.max(0.02, Math.abs(total) * 1e-9);
}

function lineRoundingTolerance(amount: number): number {
  return Math.max(0.02, Math.min(1, Math.abs(amount) * 1e-6));
}

function aggregateRoundingTolerance(lines: number): number {
  return Math.max(0.02, Math.min(5, lines * 0.02));
}

function invalid(message: string): BadRequestException {
  return new BadRequestException(message);
}
