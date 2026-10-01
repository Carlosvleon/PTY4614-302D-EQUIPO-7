import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../auth/permissions.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtPayload } from '../../auth/jwt.strategy';
import { CatalogosService } from './catalogos.service';
import {
  UpsertMonedaDto,
  UpsertUnidadMedidaDto,
  UpsertTipoDocumentoDto,
  UpsertCentroCostoDto,
  ImportCentrosCostoExcelDto,
  ImportCodigosFinancierosExcelDto,
  UpdateSyncBcMetaDto,
  SyncIndicadoresBcDto,
  UpsertProveedorDto,
  UpsertCodigoFinancieroDto,
  UpsertConceptoFlujoDto,
  ImportIndicadoresBcExcelDto,
} from './dto/catalogos.dto';

const EXCEL_CSV_UPLOAD = {
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (
    _req: unknown,
    file: { originalname?: string; mimetype?: string },
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const name = (file.originalname ?? '').toLowerCase();
    if (/\.(xlsx|xls|csv)$/.test(name)) {
      cb(null, true);
      return;
    }
    cb(new BadRequestException('Solo se aceptan archivos .xlsx, .xls o .csv (máx. 5 MB)'), false);
  },
};

@ApiTags('catalogos')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Empresa-Id', required: false, description: 'Empresa activa (DEC-03)' })
@Controller()
export class CatalogosController {
  constructor(private catalogos: CatalogosService) {}

  @Get('catalogo-importaciones')
  @RequireAnyPermission('catalogos:read', 'contabilidad:read', 'admin:read')
  listCatalogoImportaciones(
    @CurrentUser() user: JwtPayload,
    @Query('tipo') tipo?: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.catalogos.listCatalogoImportaciones(user, tipo, empresaHeader);
  }

  // -------- MONEDAS --------
  @Get('monedas')
  @RequireAnyPermission('catalogos:read', 'admin:read', 'contabilidad:read', 'reportes:read')
  getMonedas() {
    return this.catalogos.getMonedas();
  }

  @Post('monedas')
  @RequirePermissions('catalogos:write')
  createMoneda(@Body() dto: UpsertMonedaDto) {
    return this.catalogos.createMoneda(dto);
  }

  @Put('monedas/:id')
  @RequirePermissions('catalogos:write')
  updateMoneda(@Param('id') id: string, @Body() dto: UpsertMonedaDto) {
    return this.catalogos.updateMoneda(id, dto);
  }

  // -------- UNIDADES --------
  @Get('unidades')
  @RequireAnyPermission('catalogos:read', 'admin:read', 'contabilidad:read', 'contratistas:read')
  getUnidades() {
    return this.catalogos.getUnidades();
  }

  @Post('unidades')
  @RequireAnyPermission('catalogos:write', 'contratistas:catalogs')
  createUnidad(@Body() dto: UpsertUnidadMedidaDto) {
    return this.catalogos.createUnidad(dto);
  }

  @Put('unidades/:id')
  @RequireAnyPermission('catalogos:write', 'contratistas:catalogs')
  updateUnidad(@Param('id') id: string, @Body() dto: UpsertUnidadMedidaDto) {
    return this.catalogos.updateUnidad(id, dto);
  }

  // -------- TIPOS DOCUMENTO --------
  @Get('tipos-documento')
  @RequireAnyPermission('catalogos:read', 'admin:read', 'contabilidad:read', 'tesoreria:read')
  getTiposDocumento() {
    return this.catalogos.getTiposDocumento();
  }

  @Post('tipos-documento')
  @RequirePermissions('catalogos:write')
  createTipoDocumento(@Body() dto: UpsertTipoDocumentoDto) {
    return this.catalogos.createTipoDocumento(dto);
  }

  @Put('tipos-documento/:id')
  @RequirePermissions('catalogos:write')
  updateTipoDocumento(@Param('id') id: string, @Body() dto: UpsertTipoDocumentoDto) {
    return this.catalogos.updateTipoDocumento(id, dto);
  }

  // -------- CENTROS DE COSTO --------
  @Get('centros-costo')
  @RequireAnyPermission('contratistas:read', 'compras:read', 'admin:read', 'contabilidad:read', 'catalogos:read', 'tesoreria:read')
  getCentrosCosto(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.catalogos.getCentrosCosto(user, empresaHeader, empresaQuery);
  }

  @Post('centros-costo')
  @RequireAnyPermission('catalogos:write', 'contratistas:write')
  createCentroCosto(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertCentroCostoDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.catalogos.createCentroCosto(user, dto, empresaHeader);
  }

  @Put('centros-costo/:id')
  @RequireAnyPermission('catalogos:write', 'contratistas:write')
  updateCentroCosto(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertCentroCostoDto,
  ) {
    return this.catalogos.updateCentroCosto(user, id, dto);
  }

  @Post('centros-costo/import-excel/preview')
  @RequireAnyPermission('catalogos:write', 'contratistas:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', EXCEL_CSV_UPLOAD))
  previewCentrosCostoExcel(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.catalogos.previewCentrosCostoExcel(user, file, empresaHeader);
  }

  @Post('centros-costo/import-excel')
  @RequireAnyPermission('catalogos:write', 'contratistas:write')
  importCentrosCostoExcel(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ImportCentrosCostoExcelDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.catalogos.importCentrosCostoExcel(user, dto, empresaHeader);
  }

  // -------- BC --------
  @Get('sync-bc-meta')
  @RequireAnyPermission('catalogos:read', 'admin:read', 'contabilidad:read')
  getSyncBcMeta() {
    return this.catalogos.getSyncBcMeta();
  }

  @Put('sync-bc-meta')
  @RequirePermissions('catalogos:write')
  updateSyncBcMeta(@Body() dto: UpdateSyncBcMetaDto) {
    return this.catalogos.updateSyncBcMeta(dto);
  }

  @Post('sync-indicadores-bc')
  @RequirePermissions('catalogos:write')
  syncIndicadoresBc(@Body() dto: SyncIndicadoresBcDto) {
    return this.catalogos.syncIndicadoresBc(dto ?? {});
  }

  @Get('bc/series')
  @RequireAnyPermission('catalogos:read', 'admin:read', 'contabilidad:read')
  getBcSeries() {
    return this.catalogos.getBcSeriesDisponibles();
  }

  @Get('indicadores-bc')
  @RequireAnyPermission('catalogos:read', 'admin:read', 'contabilidad:read', 'reportes:read', 'tesoreria:read')
  getIndicadoresBc(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.catalogos.getIndicadoresBc(desde, hasta);
  }

  @Post('indicadores-bc/import-excel/preview')
  @RequireAnyPermission('catalogos:write', 'contabilidad:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', EXCEL_CSV_UPLOAD))
  previewIndicadoresBcExcel(@UploadedFile() file: Express.Multer.File) {
    return this.catalogos.previewIndicadoresBcExcel(file);
  }

  @Post('indicadores-bc/import-excel')
  @RequireAnyPermission('catalogos:write', 'contabilidad:write')
  importIndicadoresBcExcel(@Body() dto: ImportIndicadoresBcExcelDto) {
    return this.catalogos.importIndicadoresBcExcel(dto ?? { items: [] });
  }

  // -------- PROVEEDORES --------
  @Get('contraparte-por-rut')
  @RequireAnyPermission(
    'catalogos:read',
    'compras:read',
    'contratistas:read',
    'contratistas:catalogs',
    'admin:read',
  )
  buscarContrapartePorRut(
    @CurrentUser() user: JwtPayload,
    @Query('rut') rut: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.catalogos.buscarContrapartePorRut(user, rut, empresaHeader);
  }

  @Get('proveedores')
  @RequireAnyPermission('catalogos:read', 'compras:read', 'admin:read', 'contabilidad:read', 'tesoreria:read')
  getProveedores(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.catalogos.getProveedores(user, empresaHeader, empresaQuery);
  }

  @Post('proveedores')
  @RequireAnyPermission('catalogos:write', 'compras:write')
  createProveedor(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertProveedorDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.catalogos.createProveedor(user, dto, empresaHeader);
  }

  @Get('proveedores/:id')
  @RequireAnyPermission('catalogos:read', 'compras:read', 'admin:read', 'contabilidad:read')
  getProveedor(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.catalogos.getProveedor(user, id, empresaHeader);
  }

  @Put('proveedores/:id')
  @RequireAnyPermission('catalogos:write', 'compras:write')
  updateProveedor(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertProveedorDto,
  ) {
    return this.catalogos.updateProveedor(user, id, dto);
  }

  // -------- CONCEPTOS DE FLUJO --------
  @Get('conceptos-flujo')
  @RequireAnyPermission('catalogos:read', 'admin:read', 'tesoreria:read')
  getConceptosFlujo(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.catalogos.getConceptosFlujo(user, empresaHeader, empresaQuery);
  }

  @Post('conceptos-flujo')
  @RequireAnyPermission('catalogos:write', 'tesoreria:write')
  createConceptoFlujo(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertConceptoFlujoDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.catalogos.createConceptoFlujo(user, dto, empresaHeader);
  }

  @Put('conceptos-flujo/:id')
  @RequireAnyPermission('catalogos:write', 'tesoreria:write')
  updateConceptoFlujo(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertConceptoFlujoDto,
  ) {
    return this.catalogos.updateConceptoFlujo(user, id, dto);
  }

  // -------- CÓDIGOS FINANCIEROS --------
  @Get('codigos-financieros')
  @RequireAnyPermission('catalogos:read', 'admin:read', 'tesoreria:read')
  getCodigosFinancieros(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.catalogos.getCodigosFinancieros(user, empresaHeader, empresaQuery);
  }

  @Post('codigos-financieros')
  @RequireAnyPermission('catalogos:write', 'tesoreria:write')
  createCodigoFinanciero(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertCodigoFinancieroDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.catalogos.createCodigoFinanciero(user, dto, empresaHeader);
  }

  @Post('codigos-financieros/import-excel/preview')
  @RequireAnyPermission('catalogos:write', 'tesoreria:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', EXCEL_CSV_UPLOAD))
  previewCodigosFinancierosExcel(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.catalogos.previewCodigosFinancierosExcel(user, file, empresaHeader);
  }

  @Post('codigos-financieros/import-excel')
  @RequireAnyPermission('catalogos:write', 'tesoreria:write')
  importCodigosFinancierosExcel(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ImportCodigosFinancierosExcelDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.catalogos.importCodigosFinancierosExcel(user, dto, empresaHeader);
  }

  @Put('codigos-financieros/:id')
  @RequireAnyPermission('catalogos:write', 'tesoreria:write')
  updateCodigoFinanciero(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertCodigoFinancieroDto,
  ) {
    return this.catalogos.updateCodigoFinanciero(user, id, dto);
  }
}
