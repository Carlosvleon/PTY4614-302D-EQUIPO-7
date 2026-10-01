import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { IBillingPartnerAdapter, PartnerEmitBundle } from '../partner.adapter';
import {
  STUB_DISCLAIMER,
  type CanonicalDocumentV1,
  type EmissionResult,
  type TenantBillingConfig,
} from '../../common/types';
import { buildStubPdf, buildStubXml } from './stub-artifacts';

/**
 * Facturador/partner **stub**: mismo contrato que GoSocket u otro seller.
 * Emite documento + PDF/XML dummy para completar flujo de negocio e integrar ERPs en QA.
 * Luego se reemplaza en registry por `partner: gosocket` (u otro) sin cambiar el ERP.
 */
@Injectable()
export class StubAdapter implements IBillingPartnerAdapter {
  readonly partnerId = 'stub';

  async emit(doc: CanonicalDocumentV1, tenant: TenantBillingConfig): Promise<PartnerEmitBundle> {
    const emissionId = `emi_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const folioSimulado = `STUB-${doc.documento.numeroInterno || doc.source.documentoId.slice(-8)}`;

    const result: EmissionResult = {
      emissionId,
      partner: this.partnerId,
      connectionMode: 'stub',
      status: 'SIMULATED',
      folioOficial: folioSimulado,
      folioSimulado,
      globalDocumentId: `STUB-GDOC-${emissionId}`,
      countryDocumentId: folioSimulado,
      messages: [STUB_DISCLAIMER],
      disclaimer: STUB_DISCLAIMER,
      artifacts: { pdfAvailable: true, xmlAvailable: true, dummy: true },
      stub: true,
    };

    void tenant;
    return {
      result,
      pdf: buildStubPdf(doc, folioSimulado, emissionId),
      xml: buildStubXml(doc, folioSimulado, emissionId),
    };
  }
}
