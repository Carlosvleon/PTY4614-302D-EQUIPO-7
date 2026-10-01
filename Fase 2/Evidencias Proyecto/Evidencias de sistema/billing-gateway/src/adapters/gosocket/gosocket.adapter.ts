import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  IBillingPartnerAdapter,
  PartnerArtifact,
  PartnerArtifactKind,
  PartnerEmitBundle,
} from '../partner.adapter';
import type {
  CanonicalDocumentV1,
  ConnectionMode,
  EmissionResult,
  GoSocketOutboundRequest,
  TenantBillingConfig,
} from '../../common/types';
import { logBillingTrace } from '../../common/billing-trace-log';
import { buildGufXml, GOSOCKET_DEFAULT_MAPPING, GufValidationError } from './guf-mapper';
import {
  chileSenderCode,
  GetDocumentInconclusiveError,
  GOSOCKET_CHANGE_STATUS_PATH,
  GOSOCKET_EVENT_ACEPTACION,
  GOSOCKET_EVENT_ACUSE_RECIBO,
  GOSOCKET_EVENT_RECIBO_MERCADERIA,
  GOSOCKET_EVENT_RECLAMO,
  GOSOCKET_GET_DOCUMENT_PATH,
  mapChangeDocumentStatusResponse,
  parseChangeDocumentStatusBody,
  mapGetDocumentToPurchaseList,
  mapGetDocumentToStatus,
  type GoSocketGetDocumentResponse,
  type PartnerChangeStatusResult,
  type PartnerDocumentStatus,
  type PartnerReceivedDocument,
} from './document-status';
import {
  requireGoSocketCredentials,
  resolveGoSocketCredentials,
  resolveGoSocketCredentialsForEmpresa,
} from './gosocket-credentials';

export { requireGoSocketCredentials, resolveGoSocketCredentials, resolveGoSocketCredentialsForEmpresa } from './gosocket-credentials';

/** Base sandbox REAL (kickoff 01/09). No usar developers.gosocket.net/sandbox. */
const DEFAULT_SANDBOX_BASE = 'https://developers-sbx.gosocket.net/api/v1';
const DEFAULT_LIVE_BASE = 'https://developers.gosocket.net/api/v1';
const SEND_DOCUMENT_PATH = 'Document/SendDocumentToAuthority';

/**
 * Chile (manual API págs. 63–68): `type=xml` / `type=pdf` = representación default.
 * Una sola decodificación base64. No usar `distribution` (Colombia, doble decode)
 * ni `original` (Perú/Bolivia).
 */
export const GOSOCKET_CHILE_XML_TYPE = 'xml';
export const GOSOCKET_CHILE_PDF_TYPE = 'pdf';

export const GOSOCKET_PDF_MAX_BYTES = 8 * 1024 * 1024;
export const GOSOCKET_XML_MAX_BYTES = 2 * 1024 * 1024;

/** ChangeDocumentStatus (evento 30 Acuse de Recibo) tardó ~4 min en QA sandbox. */
const GOSOCKET_CHANGE_STATUS_TIMEOUT_MS = 6 * 60_000;

const GOSOCKET_VALID_STATUS_EVENTS = new Set([
  GOSOCKET_EVENT_ACUSE_RECIBO,
  GOSOCKET_EVENT_RECLAMO,
  GOSOCKET_EVENT_RECIBO_MERCADERIA,
  GOSOCKET_EVENT_ACEPTACION,
]);

const ARTIFACT_NOT_READY = (kind: PartnerArtifactKind) =>
  `${kind.toUpperCase()} aún no disponible en el facturador; reintente`;

/** Sociedad que consulta compras. Sin esto se usa el ApiUser global (una sola empresa). */
export interface GoSocketEmpresaAuth {
  erpId: string;
  empresaId?: string;
  tenant?: TenantBillingConfig;
}

function credentialsForEmpresa(auth?: GoSocketEmpresaAuth): { user: string; password: string } {
  if (auth?.erpId?.trim()) {
    return resolveGoSocketCredentialsForEmpresa(auth.erpId, auth.empresaId, auth.tenant);
  }
  return requireGoSocketCredentials();
}

interface GoSocketFileResponse {
  Name?: string;
  Description?: string;
  Base64Content?: string;
  Timestamp?: string;
  Type?: string;
  Message?: string;
  Success?: boolean;
}

interface GoSocketResponse {
  Success?: boolean;
  GlobalDocumentId?: string | null;
  CountryDocumentId?: string | null;
  OtherData?: Record<string, unknown> | null;
  Messages?: unknown[] | string | null;
  ResponseValue?: string | null;
  Code?: string | null;
  Description?: string | null;
  ErrorException?: unknown;
  Message?: string;
}

@Injectable()
export class GoSocketAdapter implements IBillingPartnerAdapter {
  readonly partnerId = 'gosocket';
  private readonly log = new Logger(GoSocketAdapter.name);

  async emit(doc: CanonicalDocumentV1, tenant: TenantBillingConfig): Promise<PartnerEmitBundle> {
    if (tenant.connectionMode !== 'sandbox' && tenant.connectionMode !== 'live') {
      throw new BadRequestException('GoSocket solo soporta connectionMode sandbox o live');
    }

    const { user: apiUser, password: apiPassword } = resolveGoSocketCredentials(doc, tenant);

    const outbound = this.buildOutbound(doc, tenant);
    logBillingTrace(this.log, 'outbound', outbound);
    const { httpStatus, body } = await this.sendDocument(
      outbound,
      doc,
      tenant,
      apiUser,
      apiPassword,
    );
    const result = this.toEmissionResult(body, tenant, outbound, httpStatus);
    logBillingTrace(this.log, 'response', {
      httpStatus,
      body: result.partnerPayload,
    }, { rejected: result.status === 'REJECTED' });
    return { result };
  }

  async fetchArtifact(
    kind: PartnerArtifactKind,
    globalDocumentId: string,
    connectionMode: ConnectionMode,
    doc?: CanonicalDocumentV1,
    auth?: GoSocketEmpresaAuth,
  ): Promise<PartnerArtifact> {
    if (connectionMode !== 'sandbox' && connectionMode !== 'live') {
      throw new BadRequestException('GoSocket solo soporta connectionMode sandbox o live');
    }
    if (!isUsableGlobalDocumentId(globalDocumentId)) {
      throw new NotFoundException(ARTIFACT_NOT_READY(kind));
    }

    const { user, password } = doc
      ? resolveGoSocketCredentials(doc, auth?.tenant)
      : credentialsForEmpresa(auth);
    const fileType = kind === 'pdf' ? GOSOCKET_CHILE_PDF_TYPE : GOSOCKET_CHILE_XML_TYPE;
    const url = downloadUrlForMode(connectionMode, kind, globalDocumentId, fileType);
    logBillingTrace(this.log, 'outbound', {
      url,
      method: 'GET',
      kind,
      type: fileType,
      globalDocumentId,
    });

    const { httpStatus, body } = await this.downloadFile(
      url,
      user,
      password,
      kind,
      connectionMode,
    );
    if (isGoSocketMissingDocument(httpStatus, body)) {
      this.log.warn(
        `GoSocket artifact not ready kind=${kind} status=${httpStatus} gid=${logToken(globalDocumentId)}`,
      );
      throw new NotFoundException(ARTIFACT_NOT_READY(kind));
    }
    if (httpStatus === 401 || httpStatus === 403) {
      this.log.warn(`GoSocket status=${httpStatus} code=GOSOCKET_AUTH kind=${kind}`);
      throw partnerError('GOSOCKET_AUTH');
    }
    if (httpStatus < 200 || httpStatus >= 300) {
      this.log.error(`GoSocket status=${httpStatus} code=GOSOCKET_HTTP_${httpStatus} kind=${kind}`);
      throw partnerError(`GOSOCKET_HTTP_${httpStatus}`);
    }

    const decoded = decodeGoSocketFile(body, kind);
    logBillingTrace(this.log, 'response', {
      httpStatus,
      kind,
      name: typeof body.Name === 'string' ? body.Name.slice(0, 120) : null,
      type: typeof body.Type === 'string' ? body.Type.slice(0, 40) : null,
      bytes: decoded.length,
    });

    return {
      body: decoded,
      contentType: kind === 'pdf' ? 'application/pdf' : 'application/xml; charset=utf-8',
      filename: sanitizeArtifactName(body.Name, kind),
    };
  }

  async fetchDocumentStatus(
    globalDocumentId: string,
    connectionMode: ConnectionMode,
    senderRut: string,
    doc?: CanonicalDocumentV1,
  ): Promise<PartnerDocumentStatus> {
    if (connectionMode !== 'sandbox' && connectionMode !== 'live') {
      throw new BadRequestException('GoSocket solo soporta connectionMode sandbox o live');
    }
    if (!isUsableGlobalDocumentId(globalDocumentId)) {
      throw new NotFoundException('GlobalDocumentId no consultable');
    }
    const senderCode = chileSenderCode(senderRut);
    if (!/^\d{7,9}-[\dkK]$/.test(senderCode)) {
      throw new BadRequestException('RUT emisor inválido para consultar estado SII');
    }

    const { user, password } = doc
      ? resolveGoSocketCredentials(doc)
      : requireGoSocketCredentials();
    const url = getDocumentUrlForMode(connectionMode);
    const body = {
      Country: 'cl',
      SenderCode: senderCode,
      GlobalDocumentId: globalDocumentId,
    };
    logBillingTrace(this.log, 'outbound', {
      url,
      method: 'POST',
      body,
    });

    const { httpStatus, parsed } = await this.postGetDocument(
      url,
      body,
      user,
      password,
      connectionMode,
    );
    if (httpStatus === 401 || httpStatus === 403) {
      this.log.warn(
        `GoSocket status=${httpStatus} code=GOSOCKET_AUTH action=GetDocument gid=${logToken(globalDocumentId)}`,
      );
      throw partnerError('GOSOCKET_AUTH');
    }
    if (httpStatus < 200 || httpStatus >= 300) {
      this.log.error(
        `GoSocket status=${httpStatus} code=GOSOCKET_HTTP_${httpStatus} action=GetDocument`,
      );
      throw partnerError(`GOSOCKET_HTTP_${httpStatus}`);
    }

    let sync: PartnerDocumentStatus;
    try {
      sync = mapGetDocumentToStatus(parsed, globalDocumentId);
    } catch (error) {
      if (error instanceof GetDocumentInconclusiveError) {
        this.log.warn(
          `GoSocket code=GOSOCKET_GET_DOCUMENT_EMPTY action=GetDocument gid=${logToken(globalDocumentId)}`,
        );
        throw partnerError('GOSOCKET_GET_DOCUMENT_EMPTY');
      }
      throw error;
    }
    logBillingTrace(this.log, 'response', {
      httpStatus,
      status: sync.status,
      folioOficial: sync.folioOficial,
      authorityStatus: sync.authorityStatus,
      nDocs: Array.isArray(parsed.Documents) ? parsed.Documents.length : 0,
    });
    return sync;
  }

  /**
   * Compras: inbox de documentos recibidos (GetDocument por ReceiverCode + rango de fechas).
   * No persiste nada en billing-gateway; el ERP decide qué hacer con la lista.
   */
  async fetchReceivedDocuments(
    params: { receiverRut: string; desde: string; hasta: string },
    connectionMode: ConnectionMode,
    auth?: GoSocketEmpresaAuth,
  ): Promise<PartnerReceivedDocument[]> {
    if (connectionMode !== 'sandbox' && connectionMode !== 'live') {
      throw new BadRequestException('GoSocket solo soporta connectionMode sandbox o live');
    }
    const receiverCode = chileSenderCode(params.receiverRut);
    if (!/^\d{7,9}-[\dkK]$/.test(receiverCode)) {
      throw new BadRequestException('RUT receptor inválido para consultar documentos recibidos');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.desde) || !/^\d{4}-\d{2}-\d{2}$/.test(params.hasta)) {
      throw new BadRequestException('Rango de fechas inválido (YYYY-MM-DD)');
    }

    const { user, password } = credentialsForEmpresa(auth);
    const url = getDocumentUrlForMode(connectionMode);
    const body = {
      Country: 'cl',
      ReceiverCode: receiverCode,
      DateFrom: params.desde,
      DateTo: params.hasta,
      ResultMaxItemCount: 200,
    };
    logBillingTrace(this.log, 'outbound', { url, method: 'POST', body });

    const { httpStatus, parsed } = await this.postGetDocument(url, body, user, password, connectionMode);
    if (httpStatus === 401 || httpStatus === 403) {
      this.log.warn('GoSocket status=' + httpStatus + ' code=GOSOCKET_AUTH action=GetReceivedDocuments');
      throw partnerError('GOSOCKET_AUTH');
    }
    if (httpStatus < 200 || httpStatus >= 300) {
      this.log.error(
        `GoSocket status=${httpStatus} code=GOSOCKET_HTTP_${httpStatus} action=GetReceivedDocuments`,
      );
      throw partnerError(`GOSOCKET_HTTP_${httpStatus}`);
    }

    let list: PartnerReceivedDocument[];
    try {
      list = mapGetDocumentToPurchaseList(parsed);
    } catch (error) {
      if (error instanceof GetDocumentInconclusiveError) {
        this.log.warn('GoSocket code=GOSOCKET_GET_DOCUMENT_EMPTY action=GetReceivedDocuments');
        throw partnerError('GOSOCKET_GET_DOCUMENT_EMPTY');
      }
      throw error;
    }
    logBillingTrace(this.log, 'response', { httpStatus, nDocs: list.length });
    return list;
  }

  /**
   * Compras: ChangeDocumentStatus. Timeout largo (evento 30 tardó ~4 min en QA).
   * No reintenta internamente: cada evento es una llamada aislada que orquesta el ERP.
   */
  async changeDocumentStatus(
    globalDocumentId: string,
    eventCode: number,
    connectionMode: ConnectionMode,
    note?: string,
    auth?: GoSocketEmpresaAuth,
  ): Promise<PartnerChangeStatusResult> {
    if (connectionMode !== 'sandbox' && connectionMode !== 'live') {
      throw new BadRequestException('GoSocket solo soporta connectionMode sandbox o live');
    }
    if (!isUsableGlobalDocumentId(globalDocumentId)) {
      throw new BadRequestException('GlobalDocumentId inválido para cambiar estado');
    }
    if (!GOSOCKET_VALID_STATUS_EVENTS.has(eventCode)) {
      throw new BadRequestException('Código de evento GoSocket inválido');
    }

    const { user, password } = credentialsForEmpresa(auth);
    const url = changeStatusUrlForMode(connectionMode);
    const body: Record<string, unknown> = {
      GlobalDocumentId: globalDocumentId,
      Status: eventCode,
    };
    const trimmedNote = note?.trim();
    if (trimmedNote) body.Note = trimmedNote.slice(0, 500);

    logBillingTrace(this.log, 'outbound', {
      url,
      method: 'POST',
      kind: 'changeDocumentStatus',
      eventCode,
      globalDocumentId,
    });

    const { httpStatus, body: parsed } = await this.postChangeDocumentStatus(
      url,
      body,
      user,
      password,
      connectionMode,
    );
    if (httpStatus === 401 || httpStatus === 403) {
      this.log.warn('GoSocket status=' + httpStatus + ' code=GOSOCKET_AUTH action=ChangeDocumentStatus');
      throw partnerError('GOSOCKET_AUTH');
    }
    if (httpStatus < 200 || httpStatus >= 300) {
      this.log.error(
        `GoSocket status=${httpStatus} code=GOSOCKET_HTTP_${httpStatus} action=ChangeDocumentStatus`,
      );
      throw partnerError(`GOSOCKET_HTTP_${httpStatus}`);
    }

    const result = mapChangeDocumentStatusResponse(parsed);
    logBillingTrace(this.log, 'response', { httpStatus, eventCode, success: result.success });
    if (!result.success) {
      this.log.warn(
        `GoSocket ChangeDocumentStatus rechazado eventCode=${eventCode} gid=${logToken(globalDocumentId)}`,
      );
    }
    return result;
  }

  private async postChangeDocumentStatus(
    url: string,
    body: Record<string, unknown>,
    apiUser: string,
    apiPassword: string,
    connectionMode: ConnectionMode,
  ): Promise<{ httpStatus: number; body: unknown }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GOSOCKET_CHANGE_STATUS_TIMEOUT_MS);
    try {
      assertGoSocketRequestUrl(url, connectionMode);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: basicAuth(apiUser, apiPassword),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: controller.signal,
      });
      const bodyText = await readBoundedText(res, 512_000);
      try {
        return { httpStatus: res.status, body: parseChangeDocumentStatusBody(bodyText) };
      } catch (error) {
        if (error instanceof BadGatewayException) throw error;
        if (error instanceof SyntaxError) {
          const preview = sanitizeMessage(bodyText.replace(/^\uFEFF/, '').trim().slice(0, 160));
          this.log.warn(
            `GoSocket code=GOSOCKET_INVALID_RESPONSE action=ChangeDocumentStatus httpStatus=${res.status} preview=${preview}`,
          );
        }
        throw partnerError('GOSOCKET_INVALID_RESPONSE');
      }
    } catch (error) {
      if (error instanceof BadGatewayException || error instanceof NotFoundException) throw error;
      this.log.error('GoSocket code=GOSOCKET_UNAVAILABLE action=ChangeDocumentStatus');
      throw partnerError('GOSOCKET_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async downloadFile(
    url: string,
    apiUser: string,
    apiPassword: string,
    kind: PartnerArtifactKind,
    connectionMode: ConnectionMode,
  ): Promise<{ httpStatus: number; body: GoSocketFileResponse }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      assertGoSocketRequestUrl(url, connectionMode);
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: basicAuth(apiUser, apiPassword),
          Accept: 'application/json',
        },
        redirect: 'error',
        signal: controller.signal,
      });
      const bodyText = await readBoundedText(res, maxDownloadJsonChars(kind));
      if (!bodyText.trim()) {
        return { httpStatus: res.status, body: {} };
      }
      try {
        return { httpStatus: res.status, body: parseFileResponse(bodyText) };
      } catch (error) {
        if (res.status === 404 || res.status === 409) {
          return { httpStatus: res.status, body: { Message: 'does not exist' } };
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof BadGatewayException || error instanceof NotFoundException) throw error;
      this.log.error(`GoSocket code=GOSOCKET_UNAVAILABLE kind=${kind}`);
      throw partnerError('GOSOCKET_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async postGetDocument(
    url: string,
    body: Record<string, unknown>,
    apiUser: string,
    apiPassword: string,
    connectionMode: ConnectionMode,
  ): Promise<{ httpStatus: number; parsed: GoSocketGetDocumentResponse }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      assertGoSocketRequestUrl(url, connectionMode);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: basicAuth(apiUser, apiPassword),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: controller.signal,
      });
      const bodyText = await readBoundedText(res, 512_000);
      if (!bodyText.trim()) {
        return { httpStatus: res.status, parsed: { Documents: [] } };
      }
      try {
        const parsed = JSON.parse(bodyText) as GoSocketGetDocumentResponse;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw partnerError('GOSOCKET_INVALID_RESPONSE');
        }
        return { httpStatus: res.status, parsed };
      } catch (error) {
        if (error instanceof BadGatewayException) throw error;
        throw partnerError('GOSOCKET_INVALID_RESPONSE');
      }
    } catch (error) {
      if (error instanceof BadGatewayException || error instanceof NotFoundException) throw error;
      this.log.error('GoSocket code=GOSOCKET_UNAVAILABLE action=GetDocument');
      throw partnerError('GOSOCKET_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildOutbound(
    doc: CanonicalDocumentV1,
    tenant: TenantBillingConfig,
  ): GoSocketOutboundRequest {
    let fileContent: string;
    try {
      fileContent = buildGufXml(doc);
    } catch (error) {
      if (error instanceof GufValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    return {
      url: endpointForMode(tenant.connectionMode),
      method: 'POST',
      body: {
        FileContent: fileContent,
        Async: true,
        Mapping: process.env.GOSOCKET_MAPPING?.trim() || GOSOCKET_DEFAULT_MAPPING,
        Sign: true,
        DefaultCertificate: false,
        IgnoreDownWorkload: false,
        BillerId: resolveGoSocketBillerId(doc, tenant),
        ValidateNumber: false,
      },
    };
  }

  private async sendDocument(
    outbound: GoSocketOutboundRequest,
    doc: CanonicalDocumentV1,
    tenant: TenantBillingConfig,
    apiUser: string,
    apiPassword: string,
  ): Promise<{ httpStatus: number; body: GoSocketResponse }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      assertGoSocketRequestUrl(outbound.url, tenant.connectionMode);
      const res = await fetch(outbound.url, {
        method: outbound.method,
        headers: {
          Authorization: basicAuth(apiUser, apiPassword),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(outbound.body),
        redirect: 'error',
        signal: controller.signal,
      });

      if (res.status === 401 || res.status === 403) {
        this.log.warn(
          `GoSocket status=${res.status} code=GOSOCKET_AUTH ${correlationMetadata(doc)}`,
        );
        throw partnerError('GOSOCKET_AUTH');
      }
      if (!res.ok) {
        this.log.error(
          `GoSocket status=${res.status} code=GOSOCKET_HTTP_${res.status} ${correlationMetadata(doc)}`,
        );
        throw partnerError(`GOSOCKET_HTTP_${res.status}`);
      }

      const bodyText = await res.text();
      return { httpStatus: res.status, body: parseResponse(bodyText) };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      this.log.error(
        `GoSocket code=GOSOCKET_UNAVAILABLE mode=${tenant.connectionMode} ${correlationMetadata(doc)}`,
      );
      throw partnerError('GOSOCKET_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }
  }

  private toEmissionResult(
    response: GoSocketResponse,
    tenant: TenantBillingConfig,
    outbound: GoSocketOutboundRequest,
    httpStatus: number,
  ): EmissionResult {
    const folioOficial = extractFolio(response.OtherData);
    const globalDocumentId =
      cleanId(response.GlobalDocumentId) ||
      (looksLikeUuid(response.ResponseValue) ? cleanId(response.ResponseValue) : null);
    // HTTP 200 solo confirma contacto. GID 0 / Success false = rechazo (Pablo 01/09).
    // Folio en OtherData no es ACE: AuthorityStatus=2 solo llega por GetDocument/sync.
    const rejected =
      response.Success === false || isZeroGlobalDocumentId(response.GlobalDocumentId);
    const status = rejected ? 'REJECTED' : globalDocumentId ? 'PENDING' : 'REJECTED';

    return {
      emissionId: `emi_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      partner: this.partnerId,
      connectionMode: tenant.connectionMode,
      status,
      folioOficial,
      folioSimulado: null,
      globalDocumentId,
      countryDocumentId: cleanId(response.CountryDocumentId),
      messages: collectMessages(response),
      disclaimer: null,
      artifacts: { pdfAvailable: false, xmlAvailable: false, dummy: false },
      stub: false,
      partnerPayload: sanitizePartnerPayload(response),
      partnerRequest: outbound,
      partnerHttpStatus: httpStatus,
    };
  }
}

const BILLER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveGoSocketBillerId(
  doc: CanonicalDocumentV1,
  tenant: TenantBillingConfig,
): string {
  const fromDoc = normalizeBillerId(doc.source.billerId);
  const fromTenant = normalizeBillerId(tenant.billerId);
  // Admin › Empresas (canónico) manda por sociedad; el registry es solo fallback.
  const raw = fromDoc || fromTenant;
  if (!raw) {
    throw new BadRequestException(
      'Falta BillerID GoSocket válido (source.billerId o tenant.billerId)',
    );
  }
  return raw;
}

function normalizeBillerId(value?: string | null): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (!BILLER_ID_PATTERN.test(raw)) {
    throw new BadRequestException(
      'Falta BillerID GoSocket válido (source.billerId o tenant.billerId)',
    );
  }
  return raw.toLowerCase();
}

export function apiBaseForMode(mode: TenantBillingConfig['connectionMode']): string {
  const raw =
    mode === 'live'
      ? process.env.GOSOCKET_LIVE_URL?.trim() || DEFAULT_LIVE_BASE
      : process.env.GOSOCKET_SANDBOX_URL?.trim() || DEFAULT_SANDBOX_BASE;
  return stripKnownApiPaths(raw);
}

export function endpointForMode(mode: TenantBillingConfig['connectionMode']): string {
  return `${apiBaseForMode(mode)}/${SEND_DOCUMENT_PATH}`;
}

function downloadUrlForMode(
  mode: ConnectionMode,
  kind: PartnerArtifactKind,
  globalDocumentId: string,
  fileType: string,
): string {
  const path = kind === 'pdf' ? 'File/DownloadDocumentPdf' : 'File/DownloadDocumentXml';
  const url = new URL(`${apiBaseForMode(mode)}/${path}`);
  url.searchParams.set('GlobalDocumentId', globalDocumentId);
  url.searchParams.set('type', fileType);
  return url.toString();
}

function getDocumentUrlForMode(mode: ConnectionMode): string {
  return `${apiBaseForMode(mode)}/${GOSOCKET_GET_DOCUMENT_PATH}`;
}

function changeStatusUrlForMode(mode: ConnectionMode): string {
  return `${apiBaseForMode(mode)}/${GOSOCKET_CHANGE_STATUS_PATH}`;
}

const GOSOCKET_ALLOWED_HOSTS = new Set([
  'developers-sbx.gosocket.net',
  'developers.gosocket.net',
]);

/** Solo host GoSocket del env/mode. Bloquea file://, IPs y redirects a terceros. */
export function assertGoSocketRequestUrl(raw: string, mode: ConnectionMode): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw partnerError('GOSOCKET_URL_INVALID');
  }
  if (parsed.protocol !== 'https:') {
    throw partnerError('GOSOCKET_URL_INVALID');
  }
  if (parsed.username || parsed.password) {
    throw partnerError('GOSOCKET_URL_INVALID');
  }
  const expected = baseUrlForMode(mode);
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.origin !== expected.origin
    || host !== expected.hostname.toLowerCase()
    || !GOSOCKET_ALLOWED_HOSTS.has(host)
  ) {
    throw partnerError('GOSOCKET_URL_INVALID');
  }
  const basePath = expected.pathname.replace(/\/+$/, '');
  const path = parsed.pathname;
  const allowed = [
    `${basePath}/${SEND_DOCUMENT_PATH}`,
    `${basePath}/${GOSOCKET_GET_DOCUMENT_PATH}`,
    `${basePath}/${GOSOCKET_CHANGE_STATUS_PATH}`,
    `${basePath}/File/DownloadDocumentPdf`,
    `${basePath}/File/DownloadDocumentXml`,
  ];
  if (path.includes('..') || !allowed.includes(path)) {
    throw partnerError('GOSOCKET_URL_INVALID');
  }
  return parsed;
}

function baseUrlForMode(mode: ConnectionMode): URL {
  try {
    return new URL(`${apiBaseForMode(mode)}/`);
  } catch {
    throw partnerError('GOSOCKET_URL_INVALID');
  }
}

function maxDownloadJsonChars(kind: PartnerArtifactKind): number {
  const maxBytes = kind === 'pdf' ? GOSOCKET_PDF_MAX_BYTES : GOSOCKET_XML_MAX_BYTES;
  return Math.ceil((maxBytes * 4) / 3) + 8_192;
}

async function readBoundedText(res: Response, maxChars: number): Promise<string> {
  const headerLen = Number(res.headers.get('content-length'));
  if (Number.isFinite(headerLen) && headerLen > maxChars) {
    throw partnerError('GOSOCKET_ARTIFACT_TOO_LARGE');
  }
  const bodyText = await res.text();
  if (bodyText.length > maxChars) {
    throw partnerError('GOSOCKET_ARTIFACT_TOO_LARGE');
  }
  return bodyText;
}

function stripKnownApiPaths(raw: string): string {
  let url = raw.replace(/\/+$/, '');
  const suffixes = [
    `/${SEND_DOCUMENT_PATH}`,
    `/${GOSOCKET_GET_DOCUMENT_PATH}`,
    `/${GOSOCKET_CHANGE_STATUS_PATH}`,
    '/File/DownloadDocumentPdf',
    '/File/DownloadDocumentXml',
  ];
  for (const suffix of suffixes) {
    if (url.endsWith(suffix)) {
      url = url.slice(0, -suffix.length);
      break;
    }
  }
  return url;
}

function basicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
}

function parseResponse(bodyText: string): GoSocketResponse {
  try {
    return JSON.parse(bodyText) as GoSocketResponse;
  } catch {
    throw partnerError('GOSOCKET_INVALID_RESPONSE');
  }
}

function extractFolio(otherData: GoSocketResponse['OtherData']): string | null {
  if (!otherData) return null;
  const value = otherData.Folio ?? otherData.folio;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

export function isZeroGlobalDocumentId(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'number') return value === 0;
  const trimmed = String(value).trim();
  if (!trimmed) return false;
  if (trimmed === '0') return true;
  return /^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(trimmed);
}

/** GID usable para File/Download* (no 0 / UUID cero; UUID GoSocket). */
export function isUsableGlobalDocumentId(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return false;
  if (isZeroGlobalDocumentId(trimmed)) return false;
  return looksLikeUuid(trimmed);
}

export function assertArtifactLimits(kind: PartnerArtifactKind, body: Buffer): void {
  const max = kind === 'pdf' ? GOSOCKET_PDF_MAX_BYTES : GOSOCKET_XML_MAX_BYTES;
  if (body.length > max) {
    throw partnerError('GOSOCKET_ARTIFACT_TOO_LARGE');
  }
}

export function decodeGoSocketFile(
  response: { Base64Content?: string },
  kind: PartnerArtifactKind,
): Buffer {
  const raw = response.Base64Content;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new NotFoundException(ARTIFACT_NOT_READY(kind));
  }
  const cleaned = raw.replace(/\s+/g, '');
  let decoded: Buffer;
  try {
    decoded = Buffer.from(cleaned, 'base64');
  } catch {
    throw partnerError('GOSOCKET_ARTIFACT_INVALID');
  }
  if (!decoded.length) {
    throw new NotFoundException(ARTIFACT_NOT_READY(kind));
  }
  assertArtifactLimits(kind, decoded);
  if (kind === 'pdf' && !decoded.subarray(0, 4).equals(Buffer.from('%PDF'))) {
    throw partnerError('GOSOCKET_ARTIFACT_INVALID');
  }
  if (kind === 'xml') {
    const head = decoded.subarray(0, 8).toString('latin1').replace(/^\uFEFF/, '').trimStart();
    if (!head.startsWith('<')) {
      throw partnerError('GOSOCKET_ARTIFACT_INVALID');
    }
  }
  return decoded;
}

function isGoSocketMissingDocument(httpStatus: number, body: GoSocketFileResponse): boolean {
  if (httpStatus === 404 || httpStatus === 409) return true;
  const message = typeof body.Message === 'string' ? body.Message : '';
  return /does not exist/i.test(message);
}

function parseFileResponse(bodyText: string): GoSocketFileResponse {
  try {
    const parsed = JSON.parse(bodyText) as GoSocketFileResponse;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw partnerError('GOSOCKET_INVALID_RESPONSE');
    }
    return parsed;
  } catch (error) {
    if (error instanceof BadGatewayException) throw error;
    throw partnerError('GOSOCKET_INVALID_RESPONSE');
  }
}

function sanitizeArtifactName(name: string | undefined, kind: PartnerArtifactKind): string {
  const fallback = `documento.${kind}`;
  if (!name?.trim()) return fallback;
  const cleaned = name.replace(/["\r\n\\/]+/g, '').replace(/[^\w.\-]+/g, '_').slice(0, 120);
  return cleaned || fallback;
}

function looksLikeUuid(value: string | null | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value?.trim() ?? '',
  );
}

function cleanId(value: string | null | undefined): string | null {
  if (isZeroGlobalDocumentId(value)) return null;
  const trimmed = value?.trim();
  return trimmed || null;
}

function sanitizePartnerPayload(response: GoSocketResponse): Record<string, unknown> {
  return {
    Success: response.Success === true,
    Code: typeof response.Code === 'string' ? response.Code.slice(0, 80) : null,
    Description: response.Description ? sanitizeMessage(response.Description) : null,
    GlobalDocumentId: cleanId(response.GlobalDocumentId),
    CountryDocumentId: cleanId(response.CountryDocumentId),
    ResponseValue: cleanId(response.ResponseValue),
    Messages: collectMessages(response),
    OtherData: sanitizeOtherData(response.OtherData),
  };
}

function sanitizeOtherData(otherData: GoSocketResponse['OtherData']): Record<string, unknown> | null {
  if (!otherData || typeof otherData !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(otherData)) {
    if (outKeyUnsafe(key)) continue;
    if (typeof value === 'string') out[key] = sanitizeMessage(value);
    else if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
      out[key] = value;
    }
  }
  return Object.keys(out).length ? out : null;
}

function outKeyUnsafe(key: string): boolean {
  return /password|secret|token|authorization|api[_-]?key|certificate|xml|filecontent/i.test(key);
}

function collectMessages(response: GoSocketResponse): string[] {
  const messages: string[] = [];
  if (Array.isArray(response.Messages)) {
    for (const item of response.Messages) {
      if (typeof item === 'string') messages.push(sanitizeMessage(item));
      else if (item && typeof item === 'object') messages.push(sanitizeMessage(JSON.stringify(item)));
    }
  } else if (typeof response.Messages === 'string' && response.Messages.trim()) {
    messages.push(sanitizeMessage(response.Messages));
  }
  if (response.Description) messages.push(sanitizeMessage(response.Description));
  return [...new Set(messages.filter(Boolean))].slice(0, 10);
}

function sanitizeMessage(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(
      /\b(authorization|api[-_ ]?key|password|secret|token)\b\s*[:=]\s*["']?[^,;"'\s}]+/gi,
      '$1=[REDACTED]',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function partnerError(code: string): BadGatewayException {
  return new BadGatewayException({
    statusCode: 502,
    error: 'Bad Gateway',
    message: 'El servicio de facturación externo no pudo procesar la solicitud',
    code,
  });
}

function correlationMetadata(doc: CanonicalDocumentV1): string {
  return [
    `erpId=${logToken(doc.source.erpId)}`,
    `empresaId=${logToken(doc.source.empresaId)}`,
    `documentoId=${logToken(doc.source.documentoId)}`,
  ].join(' ');
}

function logToken(value: string): string {
  return value.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 100);
}
