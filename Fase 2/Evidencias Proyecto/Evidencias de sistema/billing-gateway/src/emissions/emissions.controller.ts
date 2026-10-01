import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiKeyGuard, type BillingAuthRequest } from '../common/api-key.guard';
import type { CanonicalDocumentV1 } from '../common/types';
import { EmissionsService } from './emissions.service';

@Controller('v1/emissions')
@UseGuards(ApiKeyGuard)
export class EmissionsController {
  constructor(private readonly emissions: EmissionsService) {}

  @Post()
  emit(@Req() req: BillingAuthRequest, @Body() body: CanonicalDocumentV1) {
    return this.emissions.emit(body, req.billingErpId);
  }

  @Get()
  list(@Req() req: BillingAuthRequest, @Query('empresaId') empresaId?: string) {
    return this.emissions.list(req.billingErpId ?? '', empresaId);
  }

  @Get(':id/trace')
  getTrace(@Req() req: BillingAuthRequest, @Param('id') id: string) {
    return this.emissions.getTrace(id, req.billingErpId);
  }

  /** Consulta estado SII (GetDocument) y actualiza folio/ACE/RCH. No reemite. */
  @Post(':id/refresh')
  refresh(@Req() req: BillingAuthRequest, @Param('id') id: string) {
    return this.emissions.refresh(id, req.billingErpId);
  }

  @Get(':id')
  get(@Req() req: BillingAuthRequest, @Param('id') id: string) {
    return this.emissions.get(id, req.billingErpId);
  }

  /** PDF del partner (GoSocket real) o dummy de stub. */
  @Get(':id/artifacts/pdf')
  async downloadPdf(@Req() req: BillingAuthRequest, @Param('id') id: string, @Res() res: Response) {
    const art = await this.emissions.getArtifact(id, 'pdf', req.billingErpId);
    res.setHeader('Content-Type', art.contentType);
    res.setHeader('Content-Disposition', contentDisposition(art.filename));
    if (art.dummy) res.setHeader('X-Billing-Artifact-Dummy', 'true');
    res.send(art.body);
  }

  /** XML del partner (GoSocket real) o dummy de stub. */
  @Get(':id/artifacts/xml')
  async downloadXml(@Req() req: BillingAuthRequest, @Param('id') id: string, @Res() res: Response) {
    const art = await this.emissions.getArtifact(id, 'xml', req.billingErpId);
    res.setHeader('Content-Type', art.contentType);
    res.setHeader('Content-Disposition', contentDisposition(art.filename));
    if (art.dummy) res.setHeader('X-Billing-Artifact-Dummy', 'true');
    res.send(art.body);
  }
}

function contentDisposition(filename: string): string {
  const cleaned = filename.replace(/["\r\n\\/]+/g, '').replace(/[^\w.\-]+/g, '_').slice(0, 120)
    || 'documento.bin';
  return `attachment; filename="${cleaned}"`;
}
