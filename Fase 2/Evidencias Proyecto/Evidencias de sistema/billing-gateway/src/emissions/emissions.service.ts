import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  GoSocketAdapter,
  isUsableGlobalDocumentId,
} from '../adapters/gosocket/gosocket.adapter';
import type { IBillingPartnerAdapter, PartnerArtifactKind } from '../adapters/partner.adapter';
import { StubAdapter } from '../adapters/stub/stub.adapter';
import { logBillingTrace } from '../common/billing-trace-log';
import { assertCanonical } from '../common/canonical';
import type {
  CanonicalDocumentV1,
  EmissionListItem,
  EmissionResult,
  EmissionTrace,
  TenantBillingConfig,
} from '../common/types';
import { disclaimerFromDocumentStatus } from '../adapters/gosocket/document-status';
import { RegistryService } from '../registry/registry.service';
import type { StoredEmission } from './emissions.store';
import { SqliteEmissionsStore } from './emissions.store';

interface InFlightEntry {
  canonicalFingerprint: string;
  promise: Promise<EmissionResult>;
}

/**
 * Enruta al adapter del **partner** configurado en registry.
 * `stub` es un facturador más; `gosocket` (sandbox/live) lo reemplaza cuando haya ApiKeys.
 *
 * Idempotencia durable en SQLite local (single-instance). El lock concurrente
 * `inFlight` es solo in-process; réplicas necesitan un store compartido.
 */
@Injectable()
export class EmissionsService {
  private readonly log = new Logger(EmissionsService.name);
  private readonly inFlight = new Map<string, InFlightEntry>();

  constructor(
    private readonly registry: RegistryService,
    private readonly stubAdapter: StubAdapter,
    private readonly goSocketAdapter: GoSocketAdapter,
    private readonly store: SqliteEmissionsStore,
  ) {}

  async emit(doc: CanonicalDocumentV1, boundErpId?: string): Promise<EmissionResult> {
    assertCanonical(doc);
    this.assertErpBinding(doc.source.erpId, boundErpId, { required: false });

    const tenant: TenantBillingConfig | null = this.registry.resolve(
      doc.source.erpId,
      doc.emisor.rut,
      doc.source.empresaId,
    );
    if (!tenant) {
      throw new NotFoundException('No existe configuración de facturación para el tenant solicitado');
    }

    const partner = (tenant.partner || 'stub').toLowerCase();
    let effectiveTenant = tenant;
    let adapter: IBillingPartnerAdapter = this.stubAdapter;

    if (partner === 'gosocket') {
      if (tenant.connectionMode === 'stub') {
        // Misconfiguración: partner gosocket con mode stub → tratar como stub seller
        this.log.warn(
          `tenant ${tenant.erpId} tiene partner=gosocket + connectionMode=stub; usando adapter stub`,
        );
        effectiveTenant = { ...tenant, partner: 'stub' };
      } else {
        adapter = this.goSocketAdapter;
      }
    }

    if (partner !== 'stub' && partner !== 'gosocket') {
      throw new BadRequestException(`Partner no soportado: ${partner}`);
    }

    const idempotencyKey = compositeIdempotencyKey(doc);
    const canonicalFingerprint = fingerprintCanonical(doc);
    const existing = this.store.getIdempotency(
      doc.source.erpId,
      doc.source.empresaId,
      doc.idempotencyKey,
    );
    if (existing) {
      this.assertSameCanonical(existing.canonicalFingerprint, canonicalFingerprint);
      const prev = this.store.getById(existing.emissionId);
      if (prev && isDurableEmission(prev)) return this.publicResult(prev);
      this.store.deleteIdempotency(doc.source.erpId, doc.source.empresaId, doc.idempotencyKey);
    }

    const active = this.inFlight.get(idempotencyKey);
    if (active) {
      this.assertSameCanonical(active.canonicalFingerprint, canonicalFingerprint);
      return active.promise;
    }

    const operation = this.emitAndStore(
      doc,
      effectiveTenant,
      adapter,
      idempotencyKey,
      canonicalFingerprint,
    );
    this.inFlight.set(idempotencyKey, { canonicalFingerprint, promise: operation });
    try {
      return await operation;
    } finally {
      if (this.inFlight.get(idempotencyKey)?.promise === operation) {
        this.inFlight.delete(idempotencyKey);
      }
    }
  }

  private async emitAndStore(
    doc: CanonicalDocumentV1,
    tenant: TenantBillingConfig,
    adapter: IBillingPartnerAdapter,
    idempotencyKey: string,
    canonicalFingerprint: string,
  ): Promise<EmissionResult> {
    logBillingTrace(this.log, 'inbound', {
      tenant: {
        erpId: tenant.erpId,
        empresaId: tenant.empresaId,
        partner: tenant.partner,
        connectionMode: tenant.connectionMode,
        rutEmisor: tenant.rutEmisor,
      },
      canonical: doc,
    });
    const { result, pdf, xml } = await adapter.emit(doc, tenant);
    this.store.persist(
      {
        ...result,
        canonical: withoutPartnerPassword(doc),
        canonicalFingerprint,
        pdf,
        xml,
      },
      isCacheableStatus(result.status),
    );

    this.log.log(
      JSON.stringify({
        event: 'emission.partner',
        partner: result.partner,
        emissionId: result.emissionId,
        erpId: doc.source.erpId,
        empresaId: doc.source.empresaId,
        documentoId: doc.source.documentoId,
        connectionMode: result.connectionMode,
        status: result.status,
        folioOficial: result.folioOficial,
        messages: result.messages,
        artifacts: result.artifacts,
      }),
    );

    return this.publicResultFromEmission(result);
  }

  private assertSameCanonical(expected: string, actual: string): void {
    if (expected !== actual) {
      throw new ConflictException(
        'La clave de idempotencia ya fue usada con un canónico diferente',
      );
    }
  }

  get(emissionId: string, boundErpId?: string): EmissionResult {
    return this.publicResult(this.require(emissionId, boundErpId));
  }

  /**
   * Consulta el estado SII en el partner (GetDocument) y actualiza el store.
   * No reemite. Stub / sin GID usable: devuelve el snapshot actual.
   */
  async refresh(emissionId: string, boundErpId?: string): Promise<EmissionResult> {
    const row = this.require(emissionId, boundErpId);
    if (
      row.stub
      || row.partner !== 'gosocket'
      || (row.connectionMode !== 'sandbox' && row.connectionMode !== 'live')
      || !isUsableGlobalDocumentId(row.globalDocumentId)
      || typeof this.goSocketAdapter.fetchDocumentStatus !== 'function'
    ) {
      return this.publicResult(row);
    }

    const sync = await this.goSocketAdapter.fetchDocumentStatus(
      row.globalDocumentId as string,
      row.connectionMode,
      row.canonical.emisor.rut,
      row.canonical,
    );
    const terminal = row.status === 'ACCEPTED' || row.status === 'REJECTED';
    if (terminal && sync.status === 'PENDING') {
      this.log.warn(
        JSON.stringify({
          event: 'emission.refresh.no_downgrade',
          emissionId: row.emissionId,
          kept: row.status,
        }),
      );
      return this.publicResult(row);
    }
    const folioOficial = sync.folioOficial || row.folioOficial;
    const next: StoredEmission = {
      ...row,
      status: sync.status,
      folioOficial,
      messages: sync.messages.length ? sync.messages : row.messages,
      disclaimer: disclaimerFromDocumentStatus({ ...sync, folioOficial }),
    };
    this.store.persist(next, isDurableEmission(next));
    this.log.log(
      JSON.stringify({
        event: 'emission.refresh',
        emissionId: row.emissionId,
        status: next.status,
        folioOficial: next.folioOficial,
        authorityStatus: sync.authorityStatus,
      }),
    );
    return this.publicResult(next);
  }

  list(boundErpId: string, empresaId?: string): EmissionListItem[] {
    const erpId = boundErpId.trim();
    if (!erpId) {
      throw new BadRequestException('erpId requerido (X-Billing-Api-Key)');
    }
    const empresa = sanitizeEmpresaId(empresaId);
    return this.store.listByErp(erpId, { empresaId: empresa }).map(toListItem);
  }

  getTrace(emissionId: string, boundErpId?: string): EmissionTrace {
    const row = this.require(emissionId, boundErpId);
    return {
      emissionId: row.emissionId,
      status: row.status,
      partner: row.partner,
      connectionMode: row.connectionMode,
      inbound: row.canonical,
      outbound: row.partnerRequest ?? null,
      response: {
        httpStatus: row.partnerHttpStatus ?? null,
        body: row.partnerPayload ?? null,
      },
    };
  }

  async getArtifact(
    emissionId: string,
    kind: PartnerArtifactKind,
    boundErpId?: string,
  ): Promise<{ body: Buffer; contentType: string; filename: string; dummy: boolean }> {
    const row = this.require(emissionId, boundErpId);
    const cached = artifactFromStore(row, kind);
    if (cached) {
      return { ...cached, dummy: row.artifacts.dummy === true };
    }

    if (
      row.partner === 'gosocket'
      && typeof this.goSocketAdapter.fetchArtifact === 'function'
      && isUsableGlobalDocumentId(row.globalDocumentId)
      && (row.connectionMode === 'sandbox' || row.connectionMode === 'live')
    ) {
      const fetched = await this.goSocketAdapter.fetchArtifact(
        kind,
        row.globalDocumentId as string,
        row.connectionMode,
        row.canonical,
      );
      this.persistFetchedArtifact(row, kind, fetched);
      return {
        body: fetched.body,
        contentType: fetched.contentType,
        filename: fetched.filename || artifactFilename(row, kind),
        dummy: false,
      };
    }

    throw new NotFoundException(
      kind === 'pdf' ? 'PDF del partner no disponible' : 'XML del partner no disponible',
    );
  }

  private persistFetchedArtifact(
    row: StoredEmission,
    kind: PartnerArtifactKind,
    fetched: { body: Buffer },
  ): void {
    const nextPdf = kind === 'pdf' ? fetched.body : row.pdf;
    const nextXml = kind === 'xml' ? fetched.body.toString('utf8') : row.xml;
    this.store.persist(
      {
        ...row,
        pdf: nextPdf,
        xml: nextXml,
        artifacts: {
          pdfAvailable: Boolean(nextPdf?.length),
          xmlAvailable: Boolean(nextXml),
          dummy: false,
        },
      },
      isCacheableStatus(row.status),
    );
  }

  private require(emissionId: string, boundErpId?: string): StoredEmission {
    const row = this.store.getById(emissionId);
    if (!row) throw new NotFoundException('Emisión no encontrada');
    this.assertErpBinding(row.canonical.source.erpId, boundErpId);
    return row;
  }

  private assertErpBinding(
    erpId: string,
    boundErpId?: string,
    opts: { required?: boolean } = { required: true },
  ) {
    const bound = boundErpId?.trim();
    if (!bound) {
      if (opts.required === false) return;
      throw new ForbiddenException('X-Billing-Api-Key no autoriza este erpId');
    }
    if (bound !== erpId) {
      throw new ForbiddenException('X-Billing-Api-Key no autoriza este erpId');
    }
  }

  private publicResult(row: StoredEmission): EmissionResult {
    const {
      canonical: _c,
      canonicalFingerprint: _f,
      pdf: _p,
      xml: _x,
      ...result
    } = row;
    return this.publicResultFromEmission(result);
  }

  /** POST/GET contrato ERP: sin XML GUF (queda en GET /trace). */
  private publicResultFromEmission(result: EmissionResult): EmissionResult {
    const { partnerRequest: _outbound, ...rest } = result;
    return rest;
  }
}

function artifactFilename(row: StoredEmission, kind: PartnerArtifactKind): string {
  const folio = row.folioOficial || row.folioSimulado || row.emissionId;
  const raw = `${folio}-${row.partner}.${kind}`;
  return raw.replace(/["\r\n\\/]+/g, '').replace(/[^\w.\-]+/g, '_').slice(0, 120);
}

function artifactFromStore(
  row: StoredEmission,
  kind: PartnerArtifactKind,
): { body: Buffer; contentType: string; filename: string } | null {
  if (kind === 'pdf') {
    if (!row.pdf?.length) return null;
    return {
      body: row.pdf,
      contentType: 'application/pdf',
      filename: artifactFilename(row, 'pdf'),
    };
  }
  if (!row.xml) return null;
  return {
    body: Buffer.from(row.xml, 'utf8'),
    contentType: 'application/xml; charset=utf-8',
    filename: artifactFilename(row, 'xml'),
  };
}

function toListItem(row: StoredEmission): EmissionListItem {
  return {
    emissionId: row.emissionId,
    status: row.status,
    partner: row.partner,
    connectionMode: row.connectionMode,
    empresaId: row.canonical.source.empresaId,
    documentoId: row.canonical.source.documentoId,
    numeroInterno: row.canonical.documento.numeroInterno,
    folioOficial: row.folioOficial,
    tracePath: `/v1/emissions/${row.emissionId}/trace`,
  };
}

function sanitizeEmpresaId(raw?: string): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(value)) {
    throw new BadRequestException('empresaId inválido');
  }
  return value;
}

function isCacheableStatus(status: EmissionResult['status']): boolean {
  return status === 'ACCEPTED' || status === 'SIMULATED' || status === 'PENDING';
}

/** PENDING/ACE se cachean. RCH con GID usable también (no reenviar el mismo DTE). */
function isDurableEmission(row: Pick<EmissionResult, 'status' | 'globalDocumentId'>): boolean {
  if (isCacheableStatus(row.status)) return true;
  return row.status === 'REJECTED' && isUsableGlobalDocumentId(row.globalDocumentId);
}

function compositeIdempotencyKey(doc: CanonicalDocumentV1): string {
  return JSON.stringify([
    doc.source.erpId,
    doc.source.empresaId,
    doc.idempotencyKey,
  ]);
}

function fingerprintCanonical(doc: CanonicalDocumentV1): string {
  return createHash('sha256').update(stableStringify(withoutPartnerPassword(doc)), 'utf8').digest('hex');
}

function withoutPartnerPassword(doc: CanonicalDocumentV1): CanonicalDocumentV1 {
  if (doc.source.apiPassword == null) return doc;
  const { apiPassword: _omit, ...source } = doc.source;
  return { ...doc, source };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  return serialized === undefined ? 'null' : serialized;
}
