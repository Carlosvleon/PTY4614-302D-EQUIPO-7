import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  OPERATIONAL_MASTER_READ,
  RequireAnyPermission,
  RequireAuthenticatedSession,
  RequirePermissions,
} from '../../auth/permissions.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtPayload } from '../../auth/jwt.strategy';
import { ContabilidadService } from './contabilidad.service';
import {
  BulkCuentasDto,
  BulkAsientosDto,
  CentralizacionDto,
  CreateAsientoDto,
  CreateCategoriaDto,
  AbrirPeriodoContableDto,
  CreatePeriodoContableDto,
  UpdateCuentaDto,
  UpdatePeriodoContableDto,
  UpsertConfigContableSiiDto,
  UpsertCuentaDto,
  UpsertAreaNegocioDto,
  UpsertElementoCostoDto,
  ImportElementosCostoExcelDto,
  UpsertFactorHonorarioDto,
  UpsertPresupuestoDto,
} from './dto/contabilidad.dto';

@ApiTags('contabilidad')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Empresa-Id', required: false })
@Controller()
export class ContabilidadController {
  constructor(private contabilidad: ContabilidadService) {}

  @Get('cuentas')
  @RequireAnyPermission(...OPERATIONAL_MASTER_READ, 'comercial:write', 'compras:write')
  getCuentas(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
    @Query('tree') tree?: string,
  ) {
    return this.contabilidad.getCuentas(user, empresaHeader, empresaQuery, tree);
  }

  @Post('cuentas')
  @RequirePermissions('contabilidad:write')
  createCuenta(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertCuentaDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.createCuenta(user, dto, empresaHeader);
  }

  @Post('cuentas/categoria')
  @RequirePermissions('contabilidad:write')
  createCategoria(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCategoriaDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.createCategoria(user, dto, empresaHeader);
  }

  @Post('cuentas/bulk')
  @RequirePermissions('contabilidad:write')
  bulkCuentas(
    @CurrentUser() user: JwtPayload,
    @Body() dto: BulkCuentasDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.bulkCuentas(user, dto, empresaHeader);
  }

  @Patch('cuentas/:id')
  @RequirePermissions('contabilidad:write')
  updateCuenta(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCuentaDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.updateCuenta(user, id, dto, empresaHeader);
  }

  @Get('cuentas/:id/impacto')
  @RequireAnyPermission('contabilidad:read', 'catalogos:read', 'admin:read')
  getCuentaImpacto(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.getCuentaImpacto(user, id, empresaHeader);
  }

  @Delete('cuentas/:id')
  @RequirePermissions('contabilidad:write')
  deleteCuenta(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.deleteCuenta(user, id, empresaHeader);
  }

  @Delete('cuentas')
  @RequirePermissions('contabilidad:write')
  deletePlan(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.deletePlanCuentas(user, empresaHeader);
  }

  @Post('cuentas/import-excel/preview')
  @RequirePermissions('contabilidad:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  previewPlanExcel(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('aplicarArrastre') aplicarArrastre?: string,
  ) {
    const arrastre = aplicarArrastre === 'true' || aplicarArrastre === '1';
    return this.contabilidad.previewPlanExcel(user, file, empresaHeader, arrastre);
  }

  @Post('cuentas/import-excel')
  @RequirePermissions('contabilidad:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        replace: { type: 'string', example: 'false' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  importPlanExcel(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Body('replace') replace?: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    const doReplace = replace === 'true' || replace === '1' || replace === 'yes';
    return this.contabilidad.importPlanExcel(user, file, doReplace, empresaHeader);
  }

  @Get('areas-negocio')
  @RequireAnyPermission('contabilidad:read', 'catalogos:read', 'admin:read', 'tesoreria:read')
  getAreasNegocio(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.getAreasNegocio(user, empresaHeader);
  }

  @Post('areas-negocio')
  @RequirePermissions('contabilidad:write')
  createAreaNegocio(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertAreaNegocioDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.createAreaNegocio(user, dto, empresaHeader);
  }

  @Patch('areas-negocio/:id')
  @RequirePermissions('contabilidad:write')
  updateAreaNegocio(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertAreaNegocioDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.updateAreaNegocio(user, id, dto, empresaHeader);
  }

  @Get('asientos')
  @RequirePermissions('contabilidad:read')
  getAsientos(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.contabilidad.getAsientos(user, empresaHeader, empresaQuery);
  }

  @Post('asientos')
  @RequirePermissions('contabilidad:write')
  createAsiento(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAsientoDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.createAsientoManual(user, dto, empresaHeader);
  }

  @Patch('asientos/:id')
  @RequirePermissions('contabilidad:write')
  updateAsiento(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateAsientoDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.updateAsiento(user, id, dto, empresaHeader);
  }

  @Post('asientos/bulk')
  @RequirePermissions('contabilidad:write')
  bulkAsientos(
    @CurrentUser() user: JwtPayload,
    @Body() dto: BulkAsientosDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.bulkAsientos(user, dto, empresaHeader);
  }

  @Get('elementos-costo')
  @RequireAnyPermission(...OPERATIONAL_MASTER_READ, 'comercial:write', 'compras:write')
  getElementos(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.contabilidad.getElementosCosto(user, empresaHeader, empresaQuery);
  }

  @Post('elementos-costo')
  @RequirePermissions('contabilidad:write')
  createElemento(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertElementoCostoDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.createElementoCosto(user, dto, empresaHeader);
  }

  @Put('elementos-costo/:id')
  @RequirePermissions('contabilidad:write')
  updateElemento(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertElementoCostoDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.updateElementoCosto(user, id, dto, empresaHeader);
  }

  @Post('elementos-costo/import-excel/preview')
  @RequirePermissions('contabilidad:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  previewElementosCostoExcel(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.previewElementosCostoExcel(user, file, empresaHeader);
  }

  @Post('elementos-costo/import-excel')
  @RequirePermissions('contabilidad:write')
  importElementosCostoExcel(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ImportElementosCostoExcelDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.importElementosCostoExcel(user, dto, empresaHeader);
  }

  @Get('factores-honorario')
  @RequirePermissions('contabilidad:read')
  getFactores(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.contabilidad.getFactoresHonorario(user, empresaHeader, empresaQuery);
  }

  @Post('factores-honorario')
  @RequirePermissions('contabilidad:write')
  createFactor(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertFactorHonorarioDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.createFactorHonorario(user, dto, empresaHeader);
  }

  @Put('factores-honorario/:id')
  @RequirePermissions('contabilidad:write')
  updateFactor(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertFactorHonorarioDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.updateFactorHonorario(user, id, dto, empresaHeader);
  }

  @Get('reportes-contables')
  @RequirePermissions('contabilidad:read')
  getReportes(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.contabilidad.getReportesContables(user, empresaHeader, empresaQuery);
  }

  @Get('presupuestos')
  @RequirePermissions('contabilidad:read')
  getPresupuestos(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.contabilidad.getPresupuestos(user, empresaHeader, empresaQuery);
  }

  @Post('presupuestos')
  @RequirePermissions('contabilidad:write')
  createPresupuesto(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertPresupuestoDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.createPresupuesto(user, dto, empresaHeader);
  }

  @Put('presupuestos/:id')
  @RequirePermissions('contabilidad:write')
  updatePresupuesto(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertPresupuestoDto,
  ) {
    return this.contabilidad.updatePresupuesto(user, id, dto);
  }

  @Delete('presupuestos/:id')
  @RequirePermissions('contabilidad:write')
  deletePresupuesto(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.contabilidad.deletePresupuesto(user, id);
  }

  @Get('periodos-contables')
  @RequireAuthenticatedSession()
  getPeriodos(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.contabilidad.getPeriodosContables(user, empresaHeader, empresaQuery);
  }

  @Post('periodos-contables')
  @RequirePermissions('contabilidad:write')
  createPeriodo(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePeriodoContableDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.createPeriodoContable(user, dto, empresaHeader);
  }

  @Patch('periodos-contables/:id')
  @RequirePermissions('contabilidad:write')
  updatePeriodo(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePeriodoContableDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.updatePeriodoContable(user, id, dto, empresaHeader);
  }

  @Post('periodos-contables/:id/abrir')
  @RequirePermissions('contabilidad:write')
  abrirPeriodo(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AbrirPeriodoContableDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.abrirPeriodoContable(user, id, dto, empresaHeader);
  }

  @Post('periodos-contables/:id/cerrar')
  @RequirePermissions('contabilidad:write')
  cerrarPeriodo(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.cerrarPeriodoContable(user, id, empresaHeader);
  }

  @Get('periodos-contables/:id/eventos')
  @RequirePermissions('contabilidad:read')
  getPeriodoEventos(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.getPeriodoContableEventos(user, id, empresaHeader);
  }

  @Get('config-contable-sii')
  @RequirePermissions('contabilidad:read')
  getConfigSii(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.contabilidad.getConfigContableSii(user, empresaHeader, empresaQuery);
  }

  @Put('config-contable-sii')
  @RequirePermissions('contabilidad:write')
  putConfigSii(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertConfigContableSiiDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.putConfigContableSii(user, dto, empresaHeader);
  }

  @Post('centralizacion/preview')
  @RequirePermissions('contabilidad:write')
  previewCentralizacion(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CentralizacionDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.previewCentralizacion(user, dto, empresaHeader);
  }

  @Post('centralizacion/ejecutar')
  @RequirePermissions('contabilidad:write')
  ejecutarCentralizacion(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CentralizacionDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contabilidad.ejecutarCentralizacion(user, dto, empresaHeader);
  }

  @Get('libro-diario')
  @RequireAnyPermission('contabilidad:read', 'reportes:read')
  getLibroDiario(
    @CurrentUser() user: JwtPayload,
    @Query('periodo') periodo: string,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.contabilidad.getLibroDiario(user, periodo, empresaHeader, empresaQuery);
  }

  @Get('mayor')
  @RequireAnyPermission('contabilidad:read', 'reportes:read')
  getMayor(
    @CurrentUser() user: JwtPayload,
    @Query('periodo') periodo: string,
    @Query('cuentaId') cuentaId?: string,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.contabilidad.getMayor(user, periodo, cuentaId, empresaHeader, empresaQuery);
  }

  @Get('balance-8-columnas')
  @RequireAnyPermission('contabilidad:read', 'reportes:read')
  getBalance8Columnas(
    @CurrentUser() user: JwtPayload,
    @Query('periodo') periodo: string,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.contabilidad.getBalance8Columnas(user, periodo, empresaHeader, empresaQuery);
  }
}
