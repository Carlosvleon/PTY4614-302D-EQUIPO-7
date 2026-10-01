import type { EmissionResult } from '../../common/types';

/** Chile SII vía GoSocket GetDocument (QA 01/09: folio 54 = 2, folio 53 RCH = 3). */
export const CHILE_AUTHORITY_ACCEPTED = '2';
export const CHILE_AUTHORITY_REJECTED = '3';
export const GOSOCKET_GET_DOCUMENT_PATH = 'Document/GetDocument';

export interface PartnerDocumentStatus {
  status: Extract<EmissionResult['status'], 'ACCEPTED' | 'REJECTED' | 'PENDING'>;
  folioOficial: string | null;
  messages: string[];
  authorityStatus: string | null;
}

interface GoSocketNote {
  Source?: unknown;
  Code?: unknown;
  Note?: unknown;
}

interface GoSocketTag {
  Code?: unknown;
  Value?: unknown;
}

export class GetDocumentInconclusiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GetDocumentInconclusiveError';
  }
}

interface GoSocketDocument {
  Number?: unknown;
  NumberStr?: unknown;
  SeriesNumber?: unknown;
  DocumentTags?: unknown;
  Notes?: unknown;
  GlobalDocumentId?: unknown;
  CountryDocumentId?: unknown;
}

export interface GoSocketGetDocumentResponse {
  Documents?: unknown;
  Description?: unknown;
  Message?: unknown;
}

/** RUT emisor para SenderCode: sin puntos, con DV. `77.032.638-9` → `77032638-9`. */
export function chileSenderCode(rut: string): string {
  return rut.replace(/[.\s]/g, '').trim();
}

export function normalizeFolioOficial(
  number: unknown,
  numberStr: unknown,
  seriesNumber: unknown,
): string | null {
  if (typeof number === 'number' && Number.isFinite(number) && number > 0) {
    return String(Math.trunc(number));
  }
  if (typeof number === 'string' && /^\d+$/.test(number.trim())) {
    const n = Number.parseInt(number.trim(), 10);
    if (Number.isFinite(n) && n > 0) return String(n);
  }
  for (const raw of [numberStr, seriesNumber]) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const digits = raw.trim().replace(/^0+(?=\d)/, '');
    if (/^\d+$/.test(digits) && digits !== '0') return digits;
  }
  return null;
}

function tagValue(tags: unknown, code: string): string | null {
  if (!Array.isArray(tags)) return null;
  for (const item of tags) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const tag = item as GoSocketTag;
    if (String(tag.Code ?? '').trim() !== code) continue;
    const value = tag.Value;
    if (value == null) return null;
    return String(value).trim() || null;
  }
  return null;
}

function notesOf(doc: GoSocketDocument): GoSocketNote[] {
  return Array.isArray(doc.Notes) ? (doc.Notes as GoSocketNote[]) : [];
}

function sanitizeNote(raw: string): string {
  return raw
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
    .slice(0, 300);
}

function noteCode(note: GoSocketNote): string {
  return String(note.Code ?? '').trim().toUpperCase();
}

function isRejectionNote(note: GoSocketNote): boolean {
  const code = noteCode(note);
  if (code === 'RCH' || code === 'RSC' || code === 'RFR') return true;
  const text = String(note.Note ?? '');
  return /\bRECHAZO\b|\bRCH\b|Env[ií]o Rechazado/i.test(text);
}

function collectMessages(doc: GoSocketDocument): string[] {
  const out: string[] = [];
  for (const note of notesOf(doc)) {
    const text = typeof note.Note === 'string' ? sanitizeNote(note.Note) : '';
    if (text) out.push(text);
    if (out.length >= 8) break;
  }
  return out;
}

function partnerFailureMessage(body: GoSocketGetDocumentResponse): string | null {
  const raw = [body.Description, body.Message]
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
  if (!raw) return null;
  if (/unauthorized|no autorizad|forbidden|access denied|empresa no autorizada/i.test(raw)) {
    return raw.slice(0, 200);
  }
  return null;
}

function documentGid(doc: GoSocketDocument): string | null {
  for (const raw of [doc.GlobalDocumentId, doc.CountryDocumentId]) {
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return null;
}

function asDocument(item: unknown): GoSocketDocument | undefined {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
  return item as GoSocketDocument;
}

function pickDocument(
  docs: unknown[],
  expectedGid?: string,
): GoSocketDocument | undefined {
  const objects = docs.map(asDocument).filter((item): item is GoSocketDocument => Boolean(item));
  if (!objects.length) return undefined;
  const expected = expectedGid?.trim().toLowerCase();
  if (!expected) return objects[0];
  const matched = objects.filter((doc) => documentGid(doc)?.toLowerCase() === expected);
  if (matched.length === 1) return matched[0];
  if (matched.length > 1) {
    throw new GetDocumentInconclusiveError('GetDocument devolvió más de un DTE con el GID consultado');
  }
  const labeled = objects.filter((doc) => documentGid(doc));
  if (labeled.length > 0) {
    throw new GetDocumentInconclusiveError('GetDocument no devolvió el GID consultado');
  }
  if (objects.length === 1) return objects[0];
  throw new GetDocumentInconclusiveError('GetDocument ambiguo: varios DTE sin GID');
}

/**
 * Mapea GetDocument Chile → ACE / RCH / pendiente.
 * Folio asignado no implica ACE: el 53 tenía folio y AuthorityStatus 3.
 * Vacío + error de autorización, o GID que no coincide: no se trata como PENDING.
 */
export function mapGetDocumentToStatus(
  body: GoSocketGetDocumentResponse,
  expectedGlobalDocumentId?: string,
): PartnerDocumentStatus {
  const failure = partnerFailureMessage(body);
  if (failure) {
    throw new GetDocumentInconclusiveError(failure);
  }
  const docs = Array.isArray(body.Documents) ? body.Documents : [];
  const first = pickDocument(docs, expectedGlobalDocumentId);
  if (!first) {
    return {
      status: 'PENDING',
      folioOficial: null,
      messages: [],
      authorityStatus: null,
    };
  }

  const authorityStatus = tagValue(first.DocumentTags, 'AuthorityStatus');
  const folioOficial = normalizeFolioOficial(
    first.Number,
    first.NumberStr,
    first.SeriesNumber,
  );
  const messages = collectMessages(first);
  const rejectedByNote = notesOf(first).some(isRejectionNote);
  const rejectedByTag = authorityStatus === CHILE_AUTHORITY_REJECTED;
  const acceptedByTag = authorityStatus === CHILE_AUTHORITY_ACCEPTED;

  let status: PartnerDocumentStatus['status'] = 'PENDING';
  if (rejectedByNote || rejectedByTag) status = 'REJECTED';
  else if (acceptedByTag) status = 'ACCEPTED';

  return { status, folioOficial, messages, authorityStatus };
}

// ---------------------------------------------------------------------------
// Compras (documentos recibidos) — GetDocument por ReceiverCode + ChangeDocumentStatus
// ---------------------------------------------------------------------------

export const GOSOCKET_CHANGE_STATUS_PATH = 'Document/ChangeDocumentStatus';

/** Códigos de evento RADIAN-style confirmados en QA sandbox (Fase 1). */
export const GOSOCKET_EVENT_ACUSE_RECIBO = 30;
export const GOSOCKET_EVENT_RECLAMO = 31;
export const GOSOCKET_EVENT_RECIBO_MERCADERIA = 32;
export const GOSOCKET_EVENT_ACEPTACION = 33;

export type PartnerPurchaseAcceptanceStatus = 'ACEPTADO' | 'PENDIENTE' | 'RECHAZADO';
export type PartnerPurchaseRejectOrigin = 'SII' | 'COMERCIAL';

/** Documento recibido, mapeado desde GetDocument (ReceiverCode). Ver nota en el plan: */
/** los nombres de tag de monto/emisor/ACD deben confirmarse contra un payload real de sandbox. */
export interface PartnerReceivedDocument {
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
  estado: PartnerPurchaseAcceptanceStatus;
  rechazoOrigen: PartnerPurchaseRejectOrigin | null;
  rechazoMotivo: string | null;
  messages: string[];
}

export interface PartnerChangeStatusResult {
  success: boolean;
  code: string | null;
  description: string | null;
  messages: string[];
}

function tagNumber(tags: unknown, code: string): number | null {
  const raw = tagValue(tags, code);
  if (raw == null) return null;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Clasifica ACEPTADO/PENDIENTE/RECHAZADO + origen del rechazo, para la aceptación
 * COMERCIAL del receptor (Ley 19.983), NO para la validez SII del DTE.
 * `AuthorityStatus=03` o nota de rechazo del SII → RECHAZADO/SII (el documento ni
 * siquiera es un DTE válido, así que no tiene sentido dejarlo pendiente de Acuse).
 * Tag `ACD` o nota de reclamo comercial → RECHAZADO/COMERCIAL.
 * Tag `ACD` de aceptación → ACEPTADO.
 * IMPORTANTE: `AuthorityStatus=02` (SII validó el DTE) por sí solo NO implica
 * aceptación comercial: el documento debe quedar PENDIENTE hasta que el receptor
 * emita su Acuse de Recibo + Aceptación/Reclamo explícitos (evita que todo el
 * inbox aparezca "ACEPTADO" apenas GoSocket recibe el DTE).
 * Nombres de tag ACD a confirmar contra un documento realmente reclamado en sandbox.
 */
function classifyPurchaseDocument(doc: GoSocketDocument): {
  estado: PartnerPurchaseAcceptanceStatus;
  rechazoOrigen: PartnerPurchaseRejectOrigin | null;
  rechazoMotivo: string | null;
} {
  const authorityStatus = tagValue(doc.DocumentTags, 'AuthorityStatus');
  const messages = collectMessages(doc);
  const rejectedByNote = notesOf(doc).some(isRejectionNote);
  if (authorityStatus === CHILE_AUTHORITY_REJECTED || rejectedByNote) {
    return { estado: 'RECHAZADO', rechazoOrigen: 'SII', rechazoMotivo: messages[0] ?? null };
  }

  const acd = tagValue(doc.DocumentTags, 'ACD');
  const acdRejected = acd != null && /^(R|RECLAMO|CLAIM)/i.test(acd);
  const acdAccepted = acd != null && /^(A|ACEPT|ACCEPT)/i.test(acd);
  const claimNote = notesOf(doc).some((note) => {
    const code = noteCode(note);
    return code === 'RCL' || /reclamo/i.test(String(note.Note ?? ''));
  });
  if (acdRejected || claimNote) {
    return { estado: 'RECHAZADO', rechazoOrigen: 'COMERCIAL', rechazoMotivo: messages[0] ?? null };
  }
  if (acdAccepted) {
    return { estado: 'ACEPTADO', rechazoOrigen: null, rechazoMotivo: null };
  }
  return { estado: 'PENDIENTE', rechazoOrigen: null, rechazoMotivo: null };
}

/** Mapea GetDocument(ReceiverCode) → lista de documentos recibidos (inbox de compras). */
export function mapGetDocumentToPurchaseList(
  body: GoSocketGetDocumentResponse,
): PartnerReceivedDocument[] {
  const failure = partnerFailureMessage(body);
  if (failure) {
    throw new GetDocumentInconclusiveError(failure);
  }
  const docs = Array.isArray(body.Documents) ? body.Documents : [];
  const results: PartnerReceivedDocument[] = [];
  for (const item of docs) {
    const doc = asDocument(item);
    if (!doc) continue;
    const gid = documentGid(doc);
    if (!gid) continue;
    const { estado, rechazoOrigen, rechazoMotivo } = classifyPurchaseDocument(doc);
    results.push({
      globalDocumentId: gid,
      countryDocumentId:
        typeof doc.CountryDocumentId === 'string' ? doc.CountryDocumentId.trim() || null : null,
      folioOficial: normalizeFolioOficial(doc.Number, doc.NumberStr, doc.SeriesNumber),
      fechaEmision: tagValue(doc.DocumentTags, 'FchEmis'),
      emisorRut: tagValue(doc.DocumentTags, 'RUTEmisor'),
      emisorRazonSocial:
        tagValue(doc.DocumentTags, 'RznSoc')
        ?? tagValue(doc.DocumentTags, 'RznSocEmisor')
        ?? tagValue(doc.DocumentTags, 'RznSocial'),
      montoNeto: tagNumber(doc.DocumentTags, 'MntNeto'),
      montoIva: tagNumber(doc.DocumentTags, 'IVA'),
      montoTotal: tagNumber(doc.DocumentTags, 'MntTotal'),
      authorityStatus: tagValue(doc.DocumentTags, 'AuthorityStatus'),
      estado,
      rechazoOrigen,
      rechazoMotivo,
      messages: collectMessages(doc),
    });
  }
  return results;
}

/** Mapea la respuesta cruda de ChangeDocumentStatus (forma similar a SendDocumentToAuthority). */
function isGoSocketSuccessFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return false;
}

/** Parsea el body JSON de ChangeDocumentStatus (BOM, vacío). */
export function parseChangeDocumentStatusBody(bodyText: string): unknown {
  const trimmed = bodyText.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed);
}

export function mapChangeDocumentStatusResponse(raw: unknown): PartnerChangeStatusResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { success: false, code: null, description: null, messages: [] };
  }
  const r = raw as Record<string, unknown>;
  const description = typeof r.Description === 'string' ? sanitizeNote(r.Description) : null;
  const messages: string[] = [];
  if (Array.isArray(r.Messages)) {
    for (const item of r.Messages) {
      if (typeof item === 'string') messages.push(sanitizeNote(item));
    }
  } else if (typeof r.Messages === 'string' && r.Messages.trim()) {
    messages.push(sanitizeNote(r.Messages));
  }
  return {
    success: isGoSocketSuccessFlag(r.Success),
    code: typeof r.Code === 'string' ? r.Code.slice(0, 80) : null,
    description,
    messages: messages.slice(0, 10),
  };
}

export function disclaimerFromDocumentStatus(
  sync: PartnerDocumentStatus,
): string | null {
  if (sync.status === 'ACCEPTED') {
    return sync.folioOficial
      ? `DTE aceptado por el SII. Folio oficial ${sync.folioOficial}.`
      : 'DTE aceptado por el SII.';
  }
  if (sync.status === 'REJECTED') {
    const rechazo = sync.messages.find((m) => /RECHAZO|\bRCH\b|HED-|RSC|RFR/i.test(m));
    return rechazo || sync.messages[0] || 'El SII rechazó el DTE.';
  }
  return 'DTE enviado al facturador (proceso asíncrono). Folio oficial pendiente.';
}
