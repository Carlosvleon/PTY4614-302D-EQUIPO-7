import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiKeyGuard, type BillingAuthRequest } from '../common/api-key.guard';
import {
  PurchasesService,
  type ChangeStatusParams,
  type ReceivedDocumentsParams,
} from './purchases.service';

@Controller('v1/purchases')
@UseGuards(ApiKeyGuard)
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  /** Inbox de documentos recibidos (GetDocument por ReceiverCode + rango de fechas). */
  @Post('received')
  getReceived(@Req() req: BillingAuthRequest, @Body() body: ReceivedDocumentsParams) {
    return this.purchases.getReceivedDocuments(req.billingErpId ?? '', body);
  }

  /** PDF/XML de un documento recibido (mismo GetDocument/File del partner, GID directo). */
  @Get('artifacts/:globalDocumentId/:kind')
  async downloadArtifact(
    @Req() req: BillingAuthRequest,
    @Param('globalDocumentId') globalDocumentId: string,
    @Param('kind') kind: string,
    @Query('empresaRut') empresaRut: string,
    @Query('empresaId') empresaId: string | undefined,
    @Res() res: Response,
  ) {
    const art = await this.purchases.getArtifact(
      req.billingErpId ?? '',
      empresaRut,
      empresaId,
      globalDocumentId,
      kind,
    );
    res.setHeader('Content-Type', art.contentType);
    res.setHeader('Content-Disposition', contentDisposition(art.filename ?? `documento.${kind}`));
    res.send(art.body);
  }

  /** ChangeDocumentStatus: Acuse de Recibo (30) / Reclamo (31) / Recibo Mercadería (32) / Aceptación (33). */
  @Post(':globalDocumentId/status')
  changeStatus(
    @Req() req: BillingAuthRequest,
    @Param('globalDocumentId') globalDocumentId: string,
    @Body() body: ChangeStatusParams,
  ) {
    return this.purchases.changeDocumentStatus(req.billingErpId ?? '', globalDocumentId, body);
  }
}

function contentDisposition(filename: string): string {
  const cleaned = filename.replace(/["\r\n\\/]+/g, '').replace(/[^\w.\-]+/g, '_').slice(0, 120)
    || 'documento.bin';
  return `attachment; filename="${cleaned}"`;
}
