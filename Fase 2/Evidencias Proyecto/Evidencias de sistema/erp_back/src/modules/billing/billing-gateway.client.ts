import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CanonicalDocumentV1 {
  schemaVersion: string;
  idempotencyKey: string;
  source: {
    erpId: string;
    empresaId: string;
    documentoId: string;
    /** UUID BillerID GoSocket de la empresa emisora. */
    billerId?: string;
  };
  emisor: {
    rut: string;
    razonSocial: string;
    giro?: string;
    direccion?: string;
    comuna?: string;
    ciudad?: string;
    /** N° resolución SII/QA (CAE). Viene de Empresa, no del gateway. */
    nroResolucion?: string;
    /** Fecha resolución SII/QA YYYY-MM-DD. */
    fechaResolucion?: string;
    /** Código de actividad SII (Acteco, 6 dígitos). Viene de Empresa. */
    acteco?: string;
  };
  receptor: {
    rut: string;
    razonSocial: string;
    giro?: string;
    direccion?: string;
    comuna?: string;
    ciudad?: string;
  };
    documento: {
    tipoDte: number;
    fechaEmision: string;
    fechaVencimiento?: string;
    formaPago?: string;
    moneda?: string;
    numeroInterno: string;
    referencia?: { tipo?: string; folio?: string; fecha?: string; codRef?: 1 | 2 | 3 };
    /** Bloque COMEX / DTE 110–112. Ausente en DTE nacional 33. */
    comex?: {
      tipoCambio?: number;
      montoOtraMoneda?: number;
      montoExentoOtraMoneda?: number;
      bultoCantidad?: number;
      bultoTipoCodigo?: string;
      /** Marca de bulto (tag SII Marcas). */
      bultoMarca?: string;
      paisDestino?: string;
      puertoEmbarque?: string;
      puertoDesembarque?: string;
      clausulaVenta?: string;
      viaTransporte?: string;
      modalidadVenta?: string;
      /** Código Aduana de moneda (Anexo 51). Ej. "13" = USD. */
      tpoMoneda?: string;
      /** Código Aduana del país del receptor (CodPaisRecep, M en 110/111/112). */
      codPaisRecep?: string;
      /** Glosa de transporte / ind. traslado (MJ). */
      indTraslado?: string;
    };
  };
  totales: {
    neto: number;
    exento?: number;
    iva: number;
    tasaIva?: number;
    total: number;
  };
  lineas: Array<{
    nro: number;
    descripcion: string;
    /** DscItem. Ausente = no se envía en el GUF. */
    detalle?: string;
    cantidad: number;
    unidad?: string;
    precio: number;
    descuentoPct?: number;
    montoNeto: number;
  }>;
  glosas?: string[];
  indicadores?: { exportacion?: boolean; exento?: boolean };
}

export interface BillingEmissionResult {
  emissionId: string;
  partner: string;
  connectionMode: string;
  status: string;
  folioOficial: string | null;
  folioSimulado: string | null;
  globalDocumentId: string | null;
  countryDocumentId: string | null;
  messages: string[];
  disclaimer: string | null;
  artifacts: { pdfAvailable: boolean; xmlAvailable: boolean; dummy?: unknown };
  stub: boolean;
}

export const DTE_ARTIFACT_NOT_READY =
  'aún no disponible en el facturador; reintente';

export type DteArtifactKind = 'pdf' | 'xml';

export interface BillingArtifact {
  body: Buffer;
  contentType: string;
  filename: string;
  dummy: boolean;
}

/** Compras: documento recibido vía GetDocument (ReceiverCode) en billing-gateway. */
export interface PurchaseReceivedDocument {
  globalDocumentId: string;
  countryDocumentId: string | null;
  folioOficial: string | null;
  fechaEmision: string | null;
  emisorRut: string | null;
  emisorRazonSocial: string | null;
  montoNeto: number | null;
  montoIva: number | null;
  montoTotal: number | null;
  authorityStatus: string | null;
  estado: 'ACEPTADO' | 'PENDIENTE' | 'RECHAZADO';
  rechazoOrigen: 'SII' | 'COMERCIAL' | null;
  rechazoMotivo: string | null;
  messages: string[];
}

export interface PurchaseChangeStatusResult {
  success: boolean;
  code: string | null;
  description: string | null;
  messages: string[];
}

const PDF_MAX_BYTES = 8 * 1024 * 1024;
const XML_MAX_BYTES = 2 * 1024 * 1024;

/** ChangeDocumentStatus (evento 30 Acuse de Recibo) tardó ~4 min en QA sandbox. */
const PURCHASE_STATUS_TIMEOUT_MS = 6 * 60_000;

/** GID usable para consultar el DTE después (Pablo 01/09). Cero / "0" no cuentan. */
export function isUsableGlobalDocumentId(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return false;
  if (trimmed === '0') return false;
  return !/^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(trimmed);
}

@Injectable()
export class BillingGatewayClient {
  private readonly log = new Logger(BillingGatewayClient.name);

  constructor(private readonly config: ConfigService) {}

  /** Llama al billing-gateway HTTP (proyecto aparte / GoSocket). */
  isGatewayEnabled(): boolean {
    return this.isTruthy(this.config.get<string>('BILLING_GATEWAY_ENABLED'));
  }

  /**
   * Stub local en el ERP (demo / piloto sin levantar billing-gateway).
   * Requiere BILLING_GATEWAY_ENABLED=true para disparar emisión al contabilizar.
   */
  isInlineStub(): boolean {
    return this.isTruthy(this.config.get<string>('BILLING_STUB_INLINE'));
  }

  isEnabled(): boolean {
    return this.isGatewayEnabled();
  }

  private assertGoSocketBillerId(doc: CanonicalDocumentV1): void {
    const billerId = doc.source.billerId?.trim() ?? '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(billerId)) {
      throw new BadRequestException(
        'La empresa no tiene BillerID GoSocket. Configúralo en Admin › Empresas.',
      );
    }
  }

  private assertEmisorResolucion(doc: CanonicalDocumentV1): void {
    const nro = doc.emisor.nroResolucion?.trim() ?? '';
    const fecha = doc.emisor.fechaResolucion?.trim() ?? '';
    if (!nro || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new BadRequestException(
        'La empresa no tiene número y fecha de resolución SII. Configúralos en Admin › Empresas.',
      );
    }
  }

  private assertEmisorActeco(doc: CanonicalDocumentV1): void {
    const acteco = doc.emisor.acteco?.trim() ?? '';
    if (!/^\d{6}$/.test(acteco)) {
      throw new BadRequestException(
        'La empresa no tiene Acteco SII de 6 dígitos. Configúralo en Admin › Empresas.',
      );
    }
  }

  private isTruthy(value: string | undefined): boolean {
    const v = (value || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }

  private gatewayUrl(): string {
    const raw = this.config.get<string>('BILLING_GATEWAY_URL') || 'http://127.0.0.1:3040';
    return raw.replace(/\/+$/, '');
  }

  private apiKey(): string {
    const key = this.config.get<string>('BILLING_GATEWAY_API_KEY')?.trim();
    if (!key) {
      throw new ServiceUnavailableException(
        'Configuración billing-gateway incompleta: falta API key',
      );
    }
    const normalized = key.toLowerCase();
    const characterLength = Array.from(key).length;
    const byteLength = Buffer.byteLength(key, 'utf8');
    const isPlaceholder =
      normalized === 'almahue-demo-key'
      || normalized.includes('placeholder');
    if (
      characterLength < 32
      || byteLength < 32
      || byteLength > 512
      || isPlaceholder
    ) {
      throw new ServiceUnavailableException(
        'Configuración billing-gateway inválida: API key débil o placeholder',
      );
    }
    return key;
  }

  private correlationId(response: Response): string | undefined {
    const raw =
      response.headers?.get?.('x-correlation-id')
      || response.headers?.get?.('x-request-id')
      || '';
    const safe = raw.replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 80);
    return safe || undefined;
  }

  private safeGatewayMessage(message: unknown): string {
    return String(message ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(
        /\b(authorization)\b\s*[:=]\s*(?:bearer\s+)?[^\s;,]+/gi,
        '$1=[REDACTED]',
      )
      .replace(
        /\b(api[_ -]?key|token|secret|password)\b\s*[:=]\s*[^\s;,]+/gi,
        '$1=[REDACTED]',
      )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 600);
  }

  private rejectedMessage(messages: unknown): string {
    if (!Array.isArray(messages)) return 'billing-gateway rechazó el DTE';
    const safe = messages
      .slice(0, 5)
      .map((message) => this.safeGatewayMessage(message))
      .filter(Boolean)
      .join('; ')
      .slice(0, 600);
    return safe || 'billing-gateway rechazó el DTE';
  }

  private malformedResponse(
    reason: string,
    response: Response,
    doc: CanonicalDocumentV1,
  ): never {
    const correlationId = this.correlationId(response);
    this.log.error(
      JSON.stringify({
        event: 'billing.emit.invalid_response',
        reason,
        httpStatus: response.status,
        correlationId,
        documentoId: doc.source.documentoId,
      }),
    );
    throw new BadGatewayException(
      `Respuesta inválida de billing-gateway${correlationId ? ` (correlation ${correlationId})` : ''}`,
    );
  }

  private emitInlineStub(doc: CanonicalDocumentV1): BillingEmissionResult {
    const folioSimulado = `STUB-${doc.documento.tipoDte}-${Date.now().toString().slice(-8)}`;
    const emissionId = `inline-${doc.idempotencyKey}`;
    this.log.log(
      JSON.stringify({
        event: 'billing.emit.inline_stub',
        emissionId,
        partner: 'stub-inline',
        status: 'ACCEPTED_STUB',
        folioSimulado,
        documentoId: doc.source.documentoId,
      }),
    );
    return {
      emissionId,
      partner: 'stub-inline',
      connectionMode: 'inline',
      status: 'ACCEPTED_STUB',
      folioOficial: null,
      folioSimulado,
      globalDocumentId: null,
      countryDocumentId: null,
      messages: ['Emisión simulada en ERP (BILLING_STUB_INLINE); no es DTE SII.'],
      disclaimer:
        'A espera de implementación GoSocket — no considerar. Transmisión simulada (stub ERP); no es DTE real ni timbre SII.',
      artifacts: { pdfAvailable: false, xmlAvailable: false },
      stub: true,
    };
  }

  private mapEmissionResult(raw: Record<string, unknown>): BillingEmissionResult {
    const artifacts = raw.artifacts as Record<string, unknown>;

    return {
      emissionId: raw.emissionId as string,
      partner: raw.partner as string,
      connectionMode: raw.connectionMode as string,
      status: raw.status as string,
      folioOficial: raw.folioOficial == null ? null : raw.folioOficial as string,
      folioSimulado: raw.folioSimulado == null ? null : raw.folioSimulado as string,
      globalDocumentId: raw.globalDocumentId == null ? null : raw.globalDocumentId as string,
      countryDocumentId: raw.countryDocumentId == null ? null : raw.countryDocumentId as string,
      messages: raw.messages as string[],
      disclaimer: raw.disclaimer == null ? null : raw.disclaimer as string,
      artifacts: {
        pdfAvailable: Boolean(artifacts.pdfAvailable),
        xmlAvailable: Boolean(artifacts.xmlAvailable),
        ...(Object.prototype.hasOwnProperty.call(artifacts, 'dummy')
          ? { dummy: artifacts.dummy }
          : {}),
      },
      stub: raw.stub as boolean,
    };
  }

  private validateHttpResult(
    raw: unknown,
    response: Response,
    doc: CanonicalDocumentV1,
  ): BillingEmissionResult {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return this.malformedResponse('body_not_object', response, doc);
    }
    const r = raw as Record<string, unknown>;
    const status = typeof r.status === 'string' ? r.status.trim() : '';

    if (
      status !== 'ACCEPTED'
      && status !== 'SIMULATED'
      && status !== 'REJECTED'
      && status !== 'PENDING'
    ) {
      return this.malformedResponse(
        status ? 'status_not_final_or_unknown' : 'status_missing',
        response,
        doc,
      );
    }

    const artifacts = r.artifacts;
    const isBoundedString = (value: unknown, max: number, allowEmpty = true) =>
      typeof value === 'string'
      && value.length <= max
      && (allowEmpty || value.trim().length > 0);
    const isOptionalString = (value: unknown, max: number) =>
      value == null || isBoundedString(value, max);
    const validContract =
      isBoundedString(r.emissionId, 200, false)
      && isBoundedString(r.partner, 100, false)
      && isBoundedString(r.connectionMode, 50, false)
      && isBoundedString(r.status, 32, false)
      && r.status === status
      && isOptionalString(r.folioOficial, 100)
      && isOptionalString(r.folioSimulado, 100)
      && isOptionalString(r.globalDocumentId, 200)
      && isOptionalString(r.countryDocumentId, 200)
      && Array.isArray(r.messages)
      && r.messages.length <= 20
      && r.messages.every((message) => isBoundedString(message, 1_000))
      && isOptionalString(r.disclaimer, 2_000)
      && typeof artifacts === 'object'
      && artifacts !== null
      && !Array.isArray(artifacts)
      && typeof (artifacts as Record<string, unknown>).pdfAvailable === 'boolean'
      && typeof (artifacts as Record<string, unknown>).xmlAvailable === 'boolean'
      && typeof r.stub === 'boolean';
    if (!validContract) {
      return this.malformedResponse('contract_fields_invalid', response, doc);
    }

    const partnerQueued =
      status === 'PENDING'
      && r.stub === false
      && r.partner !== 'stub'
      && r.connectionMode !== 'stub'
      && isUsableGlobalDocumentId(r.globalDocumentId);
    const validMode =
      (status === 'ACCEPTED' && r.stub === false)
      || status === 'REJECTED'
      || partnerQueued
      || (
        status === 'SIMULATED'
        && r.stub === true
        && r.partner === 'stub'
        && r.connectionMode === 'stub'
      );
    if (!validMode) {
      return this.malformedResponse('status_mode_mismatch', response, doc);
    }

    return this.mapEmissionResult(r);
  }

  async emit(doc: CanonicalDocumentV1): Promise<BillingEmissionResult> {
    if (!this.isGatewayEnabled()) {
      throw new ServiceUnavailableException('Billing gateway deshabilitado');
    }

    if (this.isInlineStub()) {
      return this.emitInlineStub(doc);
    }

    this.assertGoSocketBillerId(doc);
    this.assertEmisorResolucion(doc);
    this.assertEmisorActeco(doc);

    return this.emitHttp(doc, false);
  }

  private bumpIdempotencyKey(doc: CanonicalDocumentV1): CanonicalDocumentV1 {
    const parts = doc.idempotencyKey.split(':');
    const last = parts[parts.length - 1];
    const n = Number.parseInt(last, 10);
    const next = Number.isFinite(n) ? String(n + 1) : `${last}-2`;
    parts[parts.length - 1] = next;
    return { ...doc, idempotencyKey: parts.join(':') };
  }

  private async emitHttp(doc: CanonicalDocumentV1, retriedIdempotency: boolean): Promise<BillingEmissionResult> {
    const apiKey = this.apiKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(`${this.gatewayUrl()}/v1/emissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Billing-Api-Key': apiKey,
        },
        body: JSON.stringify(doc),
        redirect: 'error',
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 409 && !retriedIdempotency) {
          clearTimeout(timeout);
          this.log.log(
            JSON.stringify({
              event: 'billing.emit.idempotency_conflict_retry',
              documentoId: doc.source.documentoId,
            }),
          );
          return this.emitHttp(this.bumpIdempotencyKey(doc), true);
        }
        await response.text().catch(() => '');
        const correlationId = this.correlationId(response);
        this.log.error(
          JSON.stringify({
            event: 'billing.emit.http_error',
            httpStatus: response.status,
            correlationId,
            documentoId: doc.source.documentoId,
          }),
        );
        throw new BadGatewayException(
          `billing-gateway rechazó la emisión HTTP ${response.status}${correlationId ? ` (correlation ${correlationId})` : ''}`,
        );
      }

      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        return this.malformedResponse('invalid_json', response, doc);
      }
      const result = this.validateHttpResult(raw, response, doc);

      this.log.log(
        JSON.stringify({
          event: 'billing.emit.gateway',
          status: result.status,
          documentoId: doc.source.documentoId,
        }),
      );

      if (result.status === 'REJECTED') {
        throw new BadRequestException(this.rejectedMessage(result.messages));
      }

      return result;
    } catch (err) {
      if (
        err instanceof BadGatewayException
        || err instanceof BadRequestException
        || err instanceof ServiceUnavailableException
      ) {
        throw err;
      }
      this.log.error(
        JSON.stringify({
          event: 'billing.emit.transport_error',
          errorType: err instanceof Error ? err.name : 'UnknownError',
          documentoId: doc.source.documentoId,
        }),
      );
      throw new ServiceUnavailableException('No fue posible conectar con billing-gateway');
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * GET artifacts al billing-gateway. No reemite. Fail-closed.
   * 404/409 del partner = archivo aún no listo (Async), no un rechazo SII.
   */
  async getArtifact(emissionId: string, kind: DteArtifactKind): Promise<BillingArtifact> {
    const id = emissionId.trim();
    if (!id || !/^[A-Za-z0-9._:-]{1,80}$/.test(id)) {
      throw new BadRequestException('emissionId inválido');
    }
    if (kind !== 'pdf' && kind !== 'xml') {
      throw new BadRequestException('tipo de artefacto inválido');
    }
    if (!this.isGatewayEnabled()) {
      throw new ServiceUnavailableException('Billing gateway deshabilitado');
    }
    if (this.isInlineStub()) {
      throw new NotFoundException(
        `${kind.toUpperCase()} ${DTE_ARTIFACT_NOT_READY}`,
      );
    }

    const apiKey = this.apiKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(
        `${this.gatewayUrl()}/v1/emissions/${encodeURIComponent(id)}/artifacts/${kind}`,
        {
          method: 'GET',
          headers: {
            Accept: kind === 'pdf' ? 'application/pdf' : 'application/xml',
            'X-Billing-Api-Key': apiKey,
          },
          redirect: 'error',
          signal: controller.signal,
        },
      );

      if (response.status === 404 || response.status === 409) {
        await response.text().catch(() => '');
        this.log.log(
          JSON.stringify({
            event: 'billing.artifact.not_ready',
            kind,
            httpStatus: response.status,
            emissionId: id,
          }),
        );
        throw new NotFoundException(`${kind.toUpperCase()} ${DTE_ARTIFACT_NOT_READY}`);
      }

      if (!response.ok) {
        await response.text().catch(() => '');
        const correlationId = this.correlationId(response);
        this.log.error(
          JSON.stringify({
            event: 'billing.artifact.http_error',
            kind,
            httpStatus: response.status,
            correlationId,
            emissionId: id,
          }),
        );
        throw new BadGatewayException(
          `billing-gateway no pudo entregar el ${kind.toUpperCase()}${correlationId ? ` (correlation ${correlationId})` : ''}`,
        );
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      const max = kind === 'pdf' ? PDF_MAX_BYTES : XML_MAX_BYTES;
      if (!bytes.length || bytes.length > max) {
        throw new BadGatewayException('Artefacto DTE inválido o vacío');
      }

      const dummy =
        (response.headers?.get?.('x-billing-artifact-dummy') || '').toLowerCase() === 'true';
      const contentType =
        response.headers?.get?.('content-type')
        || (kind === 'pdf' ? 'application/pdf' : 'application/xml; charset=utf-8');
      const filename = filenameFromDisposition(
        response.headers?.get?.('content-disposition'),
        `${id}.${kind}`,
      );

      this.log.log(
        JSON.stringify({
          event: 'billing.artifact.gateway',
          kind,
          emissionId: id,
          bytes: bytes.length,
          dummy,
        }),
      );

      return { body: bytes, contentType, filename, dummy };
    } catch (err) {
      if (
        err instanceof BadGatewayException
        || err instanceof BadRequestException
        || err instanceof ServiceUnavailableException
        || err instanceof NotFoundException
      ) {
        throw err;
      }
      this.log.error(
        JSON.stringify({
          event: 'billing.artifact.transport_error',
          kind,
          errorType: err instanceof Error ? err.name : 'UnknownError',
          emissionId: id,
        }),
      );
      throw new ServiceUnavailableException('No fue posible conectar con billing-gateway');
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * POST /v1/emissions/:id/refresh — GetDocument SII. No reemite.
   * REJECTED es estado válido (RCH posterior); no se lanza como error de emisión.
   */
  async refreshEmission(emissionId: string): Promise<BillingEmissionResult> {
    const id = emissionId.trim();
    if (!id || !/^[A-Za-z0-9._:-]{1,80}$/.test(id)) {
      throw new BadRequestException('emissionId inválido');
    }
    if (!this.isGatewayEnabled()) {
      throw new ServiceUnavailableException('Billing gateway deshabilitado');
    }
    if (this.isInlineStub()) {
      throw new BadRequestException('El stub inline no consulta estado SII');
    }

    const apiKey = this.apiKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const probe = { source: { documentoId: id } } as CanonicalDocumentV1;
    try {
      const response = await fetch(
        `${this.gatewayUrl()}/v1/emissions/${encodeURIComponent(id)}/refresh`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'X-Billing-Api-Key': apiKey,
          },
          redirect: 'error',
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        await response.text().catch(() => '');
        const correlationId = this.correlationId(response);
        this.log.error(
          JSON.stringify({
            event: 'billing.refresh.http_error',
            httpStatus: response.status,
            correlationId,
            emissionId: id,
          }),
        );
        throw new BadGatewayException(
          `billing-gateway no pudo consultar el estado SII${correlationId ? ` (correlation ${correlationId})` : ''}`,
        );
      }

      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        return this.malformedResponse('invalid_json', response, probe);
      }
      const result = this.validateHttpResult(raw, response, probe);
      this.log.log(
        JSON.stringify({
          event: 'billing.refresh.gateway',
          status: result.status,
          emissionId: id,
        }),
      );
      return result;
    } catch (err) {
      if (
        err instanceof BadGatewayException
        || err instanceof BadRequestException
        || err instanceof ServiceUnavailableException
      ) {
        throw err;
      }
      this.log.error(
        JSON.stringify({
          event: 'billing.refresh.transport_error',
          errorType: err instanceof Error ? err.name : 'UnknownError',
          emissionId: id,
        }),
      );
      throw new ServiceUnavailableException('No fue posible conectar con billing-gateway');
    } finally {
      clearTimeout(timeout);
    }
  }

  // ---------------------------------------------------------------------
  // Compras (documentos recibidos) — /v1/purchases en billing-gateway
  // ---------------------------------------------------------------------

  /** GetDocument por ReceiverCode + rango de fechas (inbox de compras). */
  async getReceivedPurchaseDocuments(
    empresaRut: string,
    empresaId: string | undefined,
    desde: string,
    hasta: string,
  ): Promise<PurchaseReceivedDocument[]> {
    if (!this.isGatewayEnabled()) {
      throw new ServiceUnavailableException('Billing gateway deshabilitado');
    }
    const apiKey = this.apiKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(`${this.gatewayUrl()}/v1/purchases/received`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Billing-Api-Key': apiKey,
        },
        body: JSON.stringify({ empresaRut, empresaId, desde, hasta }),
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.text().catch(() => '');
        const correlationId = this.correlationId(response);
        this.log.error(
          JSON.stringify({
            event: 'billing.purchases.received.http_error',
            httpStatus: response.status,
            correlationId,
          }),
        );
        throw new BadGatewayException(
          `billing-gateway no pudo listar documentos recibidos HTTP ${response.status}`
          + `${correlationId ? ` (correlation ${correlationId})` : ''}`,
        );
      }
      const raw = await response.json().catch(() => null);
      if (!Array.isArray(raw)) {
        throw new BadGatewayException('Respuesta inválida de billing-gateway (received)');
      }
      return raw as PurchaseReceivedDocument[];
    } catch (err) {
      if (err instanceof BadGatewayException || err instanceof ServiceUnavailableException) throw err;
      this.log.error(
        JSON.stringify({ event: 'billing.purchases.received.transport_error' }),
      );
      throw new ServiceUnavailableException('No fue posible conectar con billing-gateway');
    } finally {
      clearTimeout(timeout);
    }
  }

  /** PDF/XML de un documento de compra recibido (GID directo, no requiere emissionId). */
  async getPurchaseArtifact(
    globalDocumentId: string,
    kind: DteArtifactKind,
    empresaRut: string,
    empresaId?: string,
  ): Promise<BillingArtifact> {
    const id = globalDocumentId.trim();
    if (!id) {
      throw new BadRequestException('globalDocumentId inválido');
    }
    if (kind !== 'pdf' && kind !== 'xml') {
      throw new BadRequestException('tipo de artefacto inválido');
    }
    if (!this.isGatewayEnabled()) {
      throw new ServiceUnavailableException('Billing gateway deshabilitado');
    }
    const apiKey = this.apiKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const query = new URLSearchParams({ empresaRut });
      if (empresaId) query.set('empresaId', empresaId);
      const response = await fetch(
        `${this.gatewayUrl()}/v1/purchases/artifacts/${encodeURIComponent(id)}/${kind}?${query.toString()}`,
        {
          method: 'GET',
          headers: {
            Accept: kind === 'pdf' ? 'application/pdf' : 'application/xml',
            'X-Billing-Api-Key': apiKey,
          },
          redirect: 'error',
          signal: controller.signal,
        },
      );
      if (response.status === 404 || response.status === 409) {
        await response.text().catch(() => '');
        throw new NotFoundException(`${kind.toUpperCase()} ${DTE_ARTIFACT_NOT_READY}`);
      }
      if (!response.ok) {
        await response.text().catch(() => '');
        const correlationId = this.correlationId(response);
        this.log.error(
          JSON.stringify({
            event: 'billing.purchases.artifact.http_error',
            kind,
            httpStatus: response.status,
            correlationId,
          }),
        );
        throw new BadGatewayException(
          `billing-gateway no pudo entregar el ${kind.toUpperCase()}`
          + `${correlationId ? ` (correlation ${correlationId})` : ''}`,
        );
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const max = kind === 'pdf' ? PDF_MAX_BYTES : XML_MAX_BYTES;
      if (!bytes.length || bytes.length > max) {
        throw new BadGatewayException('Artefacto DTE inválido o vacío');
      }
      const contentType =
        response.headers?.get?.('content-type')
        || (kind === 'pdf' ? 'application/pdf' : 'application/xml; charset=utf-8');
      const filename = filenameFromDisposition(
        response.headers?.get?.('content-disposition'),
        `${id}.${kind}`,
      );
      return { body: bytes, contentType, filename, dummy: false };
    } catch (err) {
      if (
        err instanceof BadGatewayException
        || err instanceof BadRequestException
        || err instanceof ServiceUnavailableException
        || err instanceof NotFoundException
      ) {
        throw err;
      }
      this.log.error(
        JSON.stringify({ event: 'billing.purchases.artifact.transport_error', kind }),
      );
      throw new ServiceUnavailableException('No fue posible conectar con billing-gateway');
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * ChangeDocumentStatus (Acuse de Recibo / Reclamo / Recibo Mercadería / Aceptación).
   * Timeout largo (6 min): el evento 30 tardó ~4 min en QA sandbox. Llamada síncrona
   * y bloqueante a propósito (decisión de producto: sin cola/async en esta fase).
   */
  async changePurchaseDocumentStatus(
    globalDocumentId: string,
    eventCode: number,
    empresaRut: string,
    empresaId?: string,
    note?: string,
  ): Promise<PurchaseChangeStatusResult> {
    const id = globalDocumentId.trim();
    if (!id) {
      throw new BadRequestException('globalDocumentId inválido');
    }
    if (!this.isGatewayEnabled()) {
      throw new ServiceUnavailableException('Billing gateway deshabilitado');
    }
    const apiKey = this.apiKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PURCHASE_STATUS_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${this.gatewayUrl()}/v1/purchases/${encodeURIComponent(id)}/status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Billing-Api-Key': apiKey,
          },
          body: JSON.stringify({ empresaRut, empresaId, eventCode, note }),
          redirect: 'error',
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        let partnerCode = '';
        try {
          const parsed = JSON.parse(text) as { code?: unknown; message?: unknown };
          if (typeof parsed?.code === 'string' && parsed.code.trim()) {
            partnerCode = parsed.code.trim();
          }
        } catch {
          /* cuerpo no JSON */
        }
        const correlationId = this.correlationId(response);
        this.log.error(
          JSON.stringify({
            event: 'billing.purchases.status.http_error',
            eventCode,
            httpStatus: response.status,
            partnerCode: partnerCode || undefined,
            correlationId,
          }),
        );
        throw new BadGatewayException(
          `billing-gateway no pudo cambiar el estado del documento HTTP ${response.status}`
          + (partnerCode ? ` (${partnerCode})` : '')
          + `${correlationId ? ` (correlation ${correlationId})` : ''}`,
        );
      }
      const raw = await response.json().catch(() => null);
      if (!raw || typeof raw !== 'object') {
        throw new BadGatewayException('Respuesta inválida de billing-gateway (status)');
      }
      return raw as PurchaseChangeStatusResult;
    } catch (err) {
      if (
        err instanceof BadGatewayException
        || err instanceof BadRequestException
        || err instanceof ServiceUnavailableException
      ) {
        throw err;
      }
      this.log.error(
        JSON.stringify({ event: 'billing.purchases.status.transport_error', eventCode }),
      );
      throw new ServiceUnavailableException('No fue posible conectar con billing-gateway');
    } finally {
      clearTimeout(timeout);
    }
  }
}

function filenameFromDisposition(header: string | null | undefined, fallback: string): string {
  const match = /filename\*?=(?:UTF-8''|")?([^\";]+)"?/i.exec(header ?? '');
  const raw = match?.[1] ? decodeURIComponent(match[1]) : fallback;
  const cleaned = raw.replace(/["\r\n\\/]+/g, '').replace(/[^\w.\-]+/g, '_').slice(0, 120);
  return cleaned || fallback;
}
