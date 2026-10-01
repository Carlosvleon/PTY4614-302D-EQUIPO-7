import type {
  CanonicalDocumentV1,
  ConnectionMode,
  EmissionResult,
  TenantBillingConfig,
} from '../common/types';
import type {
  PartnerChangeStatusResult,
  PartnerDocumentStatus,
  PartnerReceivedDocument,
} from './gosocket/document-status';

/** Contrato común de todo facturador/partner (stub, gosocket, futuros). */
export interface PartnerEmitBundle {
  result: EmissionResult;
  pdf?: Buffer;
  xml?: string;
}

export type PartnerArtifactKind = 'pdf' | 'xml';

export interface PartnerArtifact {
  body: Buffer;
  contentType: string;
  filename?: string;
}

export type { PartnerDocumentStatus, PartnerReceivedDocument, PartnerChangeStatusResult };

export interface IBillingPartnerAdapter {
  readonly partnerId: string;
  emit(doc: CanonicalDocumentV1, tenant: TenantBillingConfig): Promise<PartnerEmitBundle>;
  /**
   * Opcional. El stub no lo implementa: sirve PDF/XML ya persistidos en emit.
   * GoSocket lo usa cuando el store aún no tiene el archivo y hay GID usable.
   * También se reutiliza para artefactos de documentos de COMPRA (recibidos, no emitidos por nosotros).
   */
  fetchArtifact?(
    kind: PartnerArtifactKind,
    globalDocumentId: string,
    connectionMode: ConnectionMode,
    doc?: CanonicalDocumentV1,
  ): Promise<PartnerArtifact>;
  /**
   * Consulta metadata/estado SII (GetDocument). No reemite.
   * Sin documento indexado aún → PENDING.
   */
  fetchDocumentStatus?(
    globalDocumentId: string,
    connectionMode: ConnectionMode,
    senderRut: string,
    doc?: CanonicalDocumentV1,
  ): Promise<PartnerDocumentStatus>;
  /**
   * Compras: lista el inbox de documentos recibidos (GetDocument por ReceiverCode + rango de fechas).
   */
  fetchReceivedDocuments?(
    params: { receiverRut: string; desde: string; hasta: string },
    connectionMode: ConnectionMode,
    auth?: { erpId: string; empresaId?: string; tenant?: TenantBillingConfig },
  ): Promise<PartnerReceivedDocument[]>;
  /**
   * Compras: ChangeDocumentStatus (Acuse de Recibo / Reclamo / Recibo Mercadería / Aceptación).
   * Puede tardar varios minutos (evento 30 observado en ~4 min en QA sandbox).
   */
  changeDocumentStatus?(
    globalDocumentId: string,
    eventCode: number,
    connectionMode: ConnectionMode,
    note?: string,
    auth?: { erpId: string; empresaId?: string; tenant?: TenantBillingConfig },
  ): Promise<PartnerChangeStatusResult>;
}
