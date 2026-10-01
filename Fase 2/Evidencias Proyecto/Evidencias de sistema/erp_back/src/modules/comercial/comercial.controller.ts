import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequireAnyPermission, RequirePermissions } from '../../auth/permissions.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtPayload } from '../../auth/jwt.strategy';
import { ComercialService } from './comercial.service';
import {
  UpsertClienteDto,
  UpsertDocumentoDto,
  UpsertProspectoDto,
  ContabilizarDocumentoDto,
  ImputacionDocumentoDto,
  CargaMasivaDocumentosDto,
  UpsertGuiaDespachoDto,
  ConvertirDocumentoDto,
} from './dto/comercial.dto';

@ApiTags('comercial')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Empresa-Id', required: false })
@Controller()
export class ComercialController {
  constructor(private comercial: ComercialService) {}

  @Get('clientes')
  @RequireAnyPermission('comercial:read', 'compras:read', 'tesoreria:read')
  getClientes(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.comercial.getClientes(user, empresaHeader, empresaQuery);
  }

  @Post('clientes')
  @RequireAnyPermission('comercial:write', 'compras:write')
  createCliente(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertClienteDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.comercial.createCliente(user, dto, empresaHeader);
  }

  @Get('clientes/:id')
  @RequireAnyPermission('comercial:read', 'compras:read')
  getCliente(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.comercial.getCliente(user, id, empresaHeader);
  }

  @Put('clientes/:id')
  @RequirePermissions('comercial:write')
  updateCliente(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertClienteDto,
  ) {
    return this.comercial.updateCliente(user, id, dto);
  }

  @Get('prospectos')
  @RequirePermissions('comercial:read')
  getProspectos(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.comercial.getProspectos(user, empresaHeader, empresaQuery);
  }

  @Post('prospectos')
  @RequirePermissions('comercial:write')
  createProspecto(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertProspectoDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.comercial.createProspecto(user, dto, empresaHeader);
  }

  @Put('prospectos/:id')
  @RequirePermissions('comercial:write')
  updateProspecto(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertProspectoDto,
  ) {
    return this.comercial.updateProspecto(user, id, dto);
  }

  @Get('lookup-rut')
  @RequireAnyPermission('comercial:read', 'compras:read', 'catalogos:read')
  lookupRut(
    @CurrentUser() user: JwtPayload,
    @Query('rut') rut: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.comercial.lookupRut(user, rut, empresaHeader);
  }

  @Post('documentos/:id/confirmar')
  @RequirePermissions('comercial:write')
  confirmarOrdenVenta(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.comercial.confirmarOrdenVenta(user, id);
  }

  @Get('documentos')
  @RequireAnyPermission('comercial:read', 'compras:read')
  getDocumentos(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
    @Query('mias') mias?: string,
    @Query('tipo') tipo?: string,
    @Query('estado') estado?: string,
  ) {
    return this.comercial.getDocumentos(user, empresaHeader, empresaQuery, {
      mias: mias === '1' || mias === 'true',
      tipo,
      estado,
    });
  }

  @Get('documentos-borradores')
  @RequirePermissions('comercial:read')
  getBorradores(
    @CurrentUser() user: JwtPayload,
    @Query('usuarioId') usuarioId?: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.comercial.getBorradores(user, usuarioId, empresaHeader);
  }

  @Post('documentos')
  @RequirePermissions('comercial:write')
  createDocumento(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertDocumentoDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.comercial.createDocumento(user, dto, empresaHeader);
  }

  @Get('documentos/:id')
  @RequireAnyPermission('comercial:read', 'compras:read')
  getDocumento(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.comercial.getDocumento(user, id, empresaHeader);
  }

  @Get('documentos/:id/dte/pdf')
  @RequirePermissions('comercial:read')
  async downloadDtePdf(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    const art = await this.comercial.downloadDteArtifact(user, id, 'pdf', empresaHeader);
    res.setHeader('Content-Type', art.contentType);
    res.setHeader('Content-Disposition', contentDisposition(art.filename));
    if (art.dummy) res.setHeader('X-Billing-Artifact-Dummy', 'true');
    res.send(art.body);
  }

  @Get('documentos/:id/dte/xml')
  @RequirePermissions('comercial:read')
  async downloadDteXml(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    const art = await this.comercial.downloadDteArtifact(user, id, 'xml', empresaHeader);
    res.setHeader('Content-Type', art.contentType);
    res.setHeader('Content-Disposition', contentDisposition(art.filename));
    if (art.dummy) res.setHeader('X-Billing-Artifact-Dummy', 'true');
    res.send(art.body);
  }

  /** Emite DTE al partner. Deja EMITIDO; no crea asiento. */
  @Post('documentos/:id/dte/emit')
  @RequirePermissions('comercial:write')
  emitirDocumentoFiscal(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.comercial.emitirDocumentoFiscal(user, id, empresaHeader);
  }

  /** GetDocument: ACE/RCH/folio. No reemite. */
  @Post('documentos/:id/dte/sync')
  @RequireAnyPermission('comercial:read', 'comercial:write')
  syncDocumentoDte(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.comercial.syncDocumentoDteEstado(user, id, empresaHeader);
  }

  @Put('documentos/:id')
  @RequirePermissions('comercial:write')
  updateDocumento(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertDocumentoDto,
  ) {
    return this.comercial.updateDocumento(user, id, dto);
  }

  /** Cuenta/CC en OV confirmada. No emite DTE ni genera asiento. */
  @Patch('documentos/:id/imputacion')
  @RequirePermissions('comercial:write')
  patchDocumentoImputacion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ImputacionDocumentoDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.comercial.patchDocumentoImputacion(user, id, dto, empresaHeader);
  }

  @Post('documentos/:id/anular')
  @RequirePermissions('comercial:write')
  anularDocumento(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.comercial.anularDocumento(user, id);
  }

  @Delete('documentos/:id/borrador')
  @RequirePermissions('comercial:write')
  eliminarBorrador(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.comercial.eliminarBorrador(user, id);
  }

  @Post('documentos/:id/convertir')
  @RequirePermissions('comercial:write')
  convertirDocumento(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ConvertirDocumentoDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.comercial.convertirDocumento(user, id, dto, empresaHeader);
  }

  @Post('documentos/carga-masiva')
  @RequirePermissions('comercial:write')
  cargaMasivaDocumentos(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CargaMasivaDocumentosDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.comercial.cargaMasivaDocumentos(user, dto, empresaHeader);
  }

  @Post('documentos/:id/reversar')
  @RequirePermissions('comercial:write')
  reversar(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.comercial.reversarDocumento(user, id);
  }

  @Post('documentos/:id/emitir')
  @RequirePermissions('comercial:write')
  emitirFiscal(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.comercial.emitirDocumentoFiscal(user, id);
  }

  @Post('documentos/:id/contabilizar')
  @RequirePermissions('comercial:write')
  grabar(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ContabilizarDocumentoDto,
  ) {
    return this.comercial.grabarDocumentoContabilizar(user, id, dto);
  }

  /** Lectura operativa: digitadores de OC/proforma necesitan ver reglas sin admin:read. */
  @Get('workflows')
  @RequireAnyPermission(
    'comercial:read',
    'compras:read',
    'contratistas:read',
    'admin:read',
  )
  getWorkflows(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.comercial.getWorkflows(user, empresaHeader, empresaQuery);
  }

  @Get('libro-comercial')
  @RequirePermissions('comercial:read')
  getLibroComercial(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
    @Query('ambito') ambito?: string,
  ) {
    return this.comercial.getLibroComercial(user, ambito, empresaHeader, empresaQuery);
  }

  @Get('guias-despacho')
  @RequirePermissions('comercial:read')
  getGuias(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.comercial.getGuiasDespacho(user, empresaHeader, empresaQuery);
  }

  @Post('guias-despacho')
  @RequirePermissions('comercial:write')
  createGuia(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertGuiaDespachoDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.comercial.createGuiaDespacho(user, dto, empresaHeader);
  }
}

function contentDisposition(filename: string): string {
  const cleaned = filename.replace(/["\r\n\\/]+/g, '').replace(/[^\w.\-]+/g, '_').slice(0, 120)
    || 'documento.bin';
  return `attachment; filename="${cleaned}"`;
}
