import { Body, Controller, Get, Headers, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequireAnyPermission, RequirePermissions } from '../../auth/permissions.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtPayload } from '../../auth/jwt.strategy';
import { ComprasService } from './compras.service';
import {
  UpsertOrdenCompraDto,
  PreviewCadenaOcDto,
  UpsertRecepcionOcDto,
  UpdateRecepcionOcDto,
  UpsertRegistroCompraDto,
  CargaMasivaRegistrosCompraDto,
  SincronizarRegistrosCompraDto,
  AceptarRegistroCompraDto,
  RechazarRegistroCompraDto,
} from './dto/compras.dto';

@ApiTags('compras')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Empresa-Id', required: false })
@Controller()
export class ComprasController {
  constructor(private compras: ComprasService) {}

  @Get('ordenes-compra')
  @RequirePermissions('compras:read')
  getOrdenes(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.compras.getOrdenes(user, empresaHeader, empresaQuery);
  }

  @Post('ordenes-compra/preview-cadena')
  @RequirePermissions('compras:read')
  previewCadena(
    @CurrentUser() user: JwtPayload,
    @Body() dto: PreviewCadenaOcDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.compras.previewCadena(user, dto.monto, empresaHeader, dto.moneda);
  }

  @Post('ordenes-compra')
  @RequirePermissions('compras:write')
  createOrden(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertOrdenCompraDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.compras.createOrden(user, dto, empresaHeader);
  }

  @Put('ordenes-compra/:id')
  updateOrden(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertOrdenCompraDto,
  ) {
    return this.compras.updateOrden(user, id, dto);
  }

  @Get('aprobaciones-oc')
  @RequireAnyPermission('compras:read', 'compras:aprobar-all')
  getAprobaciones(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.compras.getAprobaciones(user, empresaHeader, empresaQuery);
  }

  @Get('recepciones-oc')
  @RequirePermissions('compras:read')
  getRecepciones(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.compras.getRecepciones(user, empresaHeader, empresaQuery);
  }

  @Post('recepciones-oc')
  @RequirePermissions('compras:write')
  createRecepcion(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertRecepcionOcDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.compras.createRecepcion(user, dto, empresaHeader);
  }

  @Patch('recepciones-oc/:id')
  @RequirePermissions('compras:write')
  updateRecepcion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRecepcionOcDto,
  ) {
    return this.compras.updateRecepcion(user, id, dto);
  }

  @Get('registros-compra')
  @RequirePermissions('compras:read')
  getRegistros(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.compras.getRegistros(user, empresaHeader, empresaQuery);
  }

  @Post('registros-compra')
  @RequirePermissions('compras:write')
  createRegistro(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertRegistroCompraDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.compras.createRegistro(user, dto, empresaHeader);
  }

  @Put('registros-compra/:id')
  @RequirePermissions('compras:write')
  updateRegistro(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertRegistroCompraDto,
  ) {
    return this.compras.updateRegistro(user, id, dto);
  }

  @Post('registros-compra/:id/anular')
  @RequirePermissions('compras:write')
  anularRegistro(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.compras.anularRegistro(user, id);
  }

  @Post('registros-compra/carga-masiva')
  @RequirePermissions('compras:write')
  cargaMasivaRegistros(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CargaMasivaRegistrosCompraDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.compras.cargaMasivaRegistros(user, dto, empresaHeader);
  }

  // ---------------------------------------------------------------------
  // GoSocket (Fase 2): inbox de documentos recibidos — Libro de Compras
  // ---------------------------------------------------------------------

  @Get('registros-compra/:id/dte/pdf')
  @RequirePermissions('compras:read')
  async downloadRegistroCompraPdf(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    const art = await this.compras.downloadRegistroCompraArtifact(user, id, 'pdf', empresaHeader);
    res.setHeader('Content-Type', art.contentType);
    res.setHeader('Content-Disposition', contentDisposition(art.filename));
    if (art.dummy) res.setHeader('X-Billing-Artifact-Dummy', 'true');
    res.send(art.body);
  }

  /** Devuelve el XML como texto plano (para el modal `RegistroCompraXmlModal` del front). */
  @Get('registros-compra/:id/dte/xml')
  @RequirePermissions('compras:read')
  async getRegistroCompraXml(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.compras.getRegistroCompraXml(user, id, empresaHeader);
  }

  /** Sincroniza el inbox de GoSocket (GetDocument por ReceiverCode) para un periodo. */
  @Post('registros-compra/sync')
  @RequirePermissions('compras:write')
  syncRegistrosCompraGoSocket(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SincronizarRegistrosCompraDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.compras.syncRegistrosCompraGoSocket(user, dto, empresaHeader);
  }

  /** Acuse de Recibo + Aceptación (GoSocket eventos 30 → 33). Llamada síncrona (hasta ~6 min). */
  @Post('registros-compra/:id/aceptar')
  @RequirePermissions('compras:write')
  aceptarRegistroCompraGoSocket(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AceptarRegistroCompraDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.compras.aceptarRegistroCompraGoSocket(user, id, dto, empresaHeader);
  }

  /** Acuse de Recibo + Reclamo (GoSocket eventos 30 → 31). Llamada síncrona (hasta ~6 min). */
  @Post('registros-compra/:id/rechazar')
  @RequirePermissions('compras:write')
  rechazarRegistroCompraGoSocket(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RechazarRegistroCompraDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.compras.rechazarRegistroCompraGoSocket(user, id, dto, empresaHeader);
  }
}

function contentDisposition(filename: string): string {
  const cleaned = filename.replace(/["\r\n\\/]+/g, '').replace(/[^\w.\-]+/g, '_').slice(0, 120)
    || 'documento.bin';
  return `attachment; filename="${cleaned}"`;
}
