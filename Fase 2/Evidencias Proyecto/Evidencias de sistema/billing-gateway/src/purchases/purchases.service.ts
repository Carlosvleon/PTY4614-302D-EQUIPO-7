import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoSocketAdapter } from '../adapters/gosocket/gosocket.adapter';
import type { PartnerArtifact, PartnerArtifactKind } from '../adapters/partner.adapter';
import {
  GOSOCKET_EVENT_ACEPTACION,
  GOSOCKET_EVENT_ACUSE_RECIBO,
  GOSOCKET_EVENT_RECIBO_MERCADERIA,
  GOSOCKET_EVENT_RECLAMO,
  type PartnerChangeStatusResult,
  type PartnerReceivedDocument,
} from '../adapters/gosocket/document-status';
import type { TenantBillingConfig } from '../common/types';
import { RegistryService } from '../registry/registry.service';

const VALID_EVENT_CODES = new Set([
  GOSOCKET_EVENT_ACUSE_RECIBO,
  GOSOCKET_EVENT_RECLAMO,
  GOSOCKET_EVENT_RECIBO_MERCADERIA,
  GOSOCKET_EVENT_ACEPTACION,
]);

export interface ReceivedDocumentsParams {
  empresaRut: string;
  empresaId?: string;
  desde: string;
  hasta: string;
}

export interface ChangeStatusParams {
  empresaRut: string;
  empresaId?: string;
  eventCode: number;
  note?: string;
}

/**
 * Módulo de COMPRAS (documentos recibidos). A diferencia de `emissions`, es stateless:
 * no persiste nada en billing-gateway; el ERP decide qué hacer con la respuesta y guarda
 * el estado en su propia base (`RegistroCompra`).
 */
@Injectable()
export class PurchasesService {
  private readonly log = new Logger(PurchasesService.name);

  constructor(
    private readonly registry: RegistryService,
    private readonly goSocketAdapter: GoSocketAdapter,
  ) {}

  private resolveGoSocketTenant(
    erpId: string,
    empresaRut: string,
    empresaId?: string,
  ): TenantBillingConfig {
    const bound = erpId?.trim();
    if (!bound) throw new ForbiddenException('X-Billing-Api-Key no autoriza este erpId');
    const rut = empresaRut?.trim();
    if (!rut) throw new BadRequestException('empresaRut requerido');
    const tenant = this.registry.resolve(bound, rut, empresaId);
    if (!tenant) {
      throw new NotFoundException('No existe configuración de facturación para el tenant solicitado');
    }
    if (
      tenant.partner !== 'gosocket'
      || (tenant.connectionMode !== 'sandbox' && tenant.connectionMode !== 'live')
    ) {
      throw new ServiceUnavailableException('Esta empresa no está configurada con GoSocket para compras');
    }
    return tenant;
  }

  async getReceivedDocuments(
    erpId: string,
    params: ReceivedDocumentsParams,
  ): Promise<PartnerReceivedDocument[]> {
    const tenant = this.resolveGoSocketTenant(erpId, params.empresaRut, params.empresaId);
    if (typeof this.goSocketAdapter.fetchReceivedDocuments !== 'function') {
      throw new ServiceUnavailableException('El adaptador no soporta consulta de documentos recibidos');
    }
    const list = await this.goSocketAdapter.fetchReceivedDocuments(
      { receiverRut: params.empresaRut, desde: params.desde, hasta: params.hasta },
      tenant.connectionMode,
      { erpId, empresaId: params.empresaId, tenant },
    );
    this.log.log(
      JSON.stringify({
        event: 'purchases.received',
        erpId,
        empresaId: params.empresaId,
        count: list.length,
      }),
    );
    return list;
  }

  async getArtifact(
    erpId: string,
    empresaRut: string,
    empresaId: string | undefined,
    globalDocumentId: string,
    kind: string,
  ): Promise<PartnerArtifact> {
    if (kind !== 'pdf' && kind !== 'xml') {
      throw new BadRequestException('tipo de artefacto inválido');
    }
    const tenant = this.resolveGoSocketTenant(erpId, empresaRut, empresaId);
    if (typeof this.goSocketAdapter.fetchArtifact !== 'function') {
      throw new ServiceUnavailableException('El adaptador no soporta descarga de artefactos');
    }
    return this.goSocketAdapter.fetchArtifact(
      kind as PartnerArtifactKind,
      globalDocumentId,
      tenant.connectionMode,
      undefined,
      { erpId, empresaId, tenant },
    );
  }

  async changeDocumentStatus(
    erpId: string,
    globalDocumentId: string,
    body: ChangeStatusParams,
  ): Promise<PartnerChangeStatusResult> {
    if (!VALID_EVENT_CODES.has(body.eventCode)) {
      throw new BadRequestException('Código de evento GoSocket inválido');
    }
    const tenant = this.resolveGoSocketTenant(erpId, body.empresaRut, body.empresaId);
    if (typeof this.goSocketAdapter.changeDocumentStatus !== 'function') {
      throw new ServiceUnavailableException('El adaptador no soporta cambio de estado de documentos');
    }
    const result = await this.goSocketAdapter.changeDocumentStatus(
      globalDocumentId,
      body.eventCode,
      tenant.connectionMode,
      body.note,
      { erpId, empresaId: body.empresaId, tenant },
    );
    this.log.log(
      JSON.stringify({
        event: 'purchases.changeStatus',
        erpId,
        empresaId: body.empresaId,
        eventCode: body.eventCode,
        success: result.success,
      }),
    );
    return result;
  }
}
