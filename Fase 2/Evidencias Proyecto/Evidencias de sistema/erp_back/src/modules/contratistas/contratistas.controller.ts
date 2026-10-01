import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  LinkLaborActividadDto,
  UpsertActividadDto,
  UpsertContratistaDto,
  UpsertLaborDto,
  UpsertProformaDto,
  AsociarFacturaProformaDto,
  ReversarProformaDto,
  ReemitirProformaDto,
  UpsertTarifaDto,
  PatchTarifaInlineDto,
  UpsertIngresoLaborDiarioDto,
  AsociarIngresosProformaDto,
  TraspasoCierreDto,
  ReabrirCierreContratistaDto,
  UpsertTipoContratoContratistaDto,
  SolicitarAprobacionProformaDto,
  AprobarIngresoLaborDto,
} from './dto/contratistas.dto';
import { RequirePermissions } from '../../auth/permissions.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtPayload } from '../../auth/jwt.strategy';
import { ContratistasService } from './contratistas.service';
import { CONTRATISTAS_PERMISSIONS as P } from './contratistas.permissions';

@ApiTags('contratistas')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Empresa-Id', required: false, description: 'Empresa activa (DEC-03)' })
@Controller()
export class ContratistasController {
  constructor(private contratistas: ContratistasService) {}

  @Get('labores')
  @RequirePermissions(P.read)
  getLabores(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
    @Query('todas') todas?: string,
  ) {
    const incluirInactivas = todas === '1' || todas === 'true';
    return this.contratistas.getLabores(user, empresaHeader, empresaQuery, incluirInactivas);
  }

  @Post('labores')
  @RequirePermissions(P.catalogs)
  createLabor(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertLaborDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contratistas.createLabor(user, dto, empresaHeader);
  }

  @Put('labores/:id')
  @RequirePermissions(P.catalogs)
  updateLabor(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertLaborDto,
  ) {
    return this.contratistas.updateLabor(user, id, dto);
  }

  @Get('actividades')
  @RequirePermissions(P.read)
  getActividades(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
    @Query('laborId') laborId?: string,
    @Query('todas') todas?: string,
  ) {
    const incluirInactivas = todas === '1' || todas === 'true';
    return this.contratistas.getActividades(
      user,
      empresaHeader,
      empresaQuery,
      laborId,
      incluirInactivas,
    );
  }

  @Post('actividades')
  @RequirePermissions(P.catalogs)
  createActividad(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertActividadDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contratistas.createActividad(user, dto, empresaHeader);
  }

  @Put('actividades/:id')
  @RequirePermissions(P.catalogs)
  updateActividad(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertActividadDto,
  ) {
    return this.contratistas.updateActividad(user, id, dto);
  }

  @Post('labor-actividad')
  @RequirePermissions(P.catalogs)
  linkLaborActividad(
    @CurrentUser() user: JwtPayload,
    @Body() dto: LinkLaborActividadDto,
  ) {
    return this.contratistas.linkLaborActividad(user, dto);
  }

  @Delete('labor-actividad')
  @RequirePermissions(P.catalogs)
  unlinkLaborActividad(
    @CurrentUser() user: JwtPayload,
    @Body() dto: LinkLaborActividadDto,
  ) {
    return this.contratistas.unlinkLaborActividad(user, dto);
  }

  @Get('contratistas')
  @RequirePermissions(P.read)
  getContratistas(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.contratistas.getContratistas(user, empresaHeader, empresaQuery);
  }

  @Post('contratistas')
  @RequirePermissions(P.catalogs)
  createContratista(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertContratistaDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contratistas.createContratista(user, dto, empresaHeader);
  }

  @Put('contratistas/:id')
  @RequirePermissions(P.catalogs)
  updateContratista(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertContratistaDto,
  ) {
    return this.contratistas.updateContratista(user, id, dto);
  }

  @Get('contratistas/:id/vigencia-historial')
  @RequirePermissions(P.read)
  getContratistaVigenciaHistorial(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contratistas.getContratistaVigenciaHistorial(user, id, empresaHeader);
  }

  @Get('tipos-contrato-contratista')
  @RequirePermissions(P.read)
  getTiposContrato(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.contratistas.getTiposContrato(
      user,
      empresaHeader,
      empresaQuery,
    );
  }

  @Post('tipos-contrato-contratista')
  @RequirePermissions(P.catalogs)
  createTipoContrato(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertTipoContratoContratistaDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contratistas.createTipoContrato(user, dto, empresaHeader);
  }

  @Put('tipos-contrato-contratista/:id')
  @RequirePermissions(P.catalogs)
  updateTipoContrato(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertTipoContratoContratistaDto,
  ) {
    return this.contratistas.updateTipoContrato(user, id, dto);
  }

  @Get('tarifas-contratista')
  @RequirePermissions(P.read)
  getTarifas(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
    @Query('contratistaId') contratistaId?: string,
  ) {
    return this.contratistas.getTarifas(user, empresaHeader, empresaQuery, contratistaId);
  }

  @Post('tarifas-contratista')
  @RequirePermissions(P.rates)
  createTarifa(@CurrentUser() user: JwtPayload, @Body() dto: UpsertTarifaDto) {
    return this.contratistas.createTarifa(user, dto);
  }

  @Put('tarifas-contratista/:id')
  @RequirePermissions(P.rates)
  updateTarifa(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertTarifaDto,
  ) {
    return this.contratistas.updateTarifa(user, id, dto);
  }

  @Delete('tarifas-contratista/:id')
  @RequirePermissions(P.rates)
  deleteTarifa(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.contratistas.deleteTarifa(user, id);
  }

  @Patch('tarifas-contratista/:id/inline')
  @RequirePermissions(P.rates)
  patchTarifaInline(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: PatchTarifaInlineDto,
  ) {
    return this.contratistas.patchTarifaInline(user, id, dto);
  }

  @Get('proformas-contratista')
  @RequirePermissions(P.read)
  getProformas(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
    @Query('periodo') periodo?: string,
    @Query('contratistaId') contratistaId?: string,
    @Query('estado') estado?: string,
  ) {
    return this.contratistas.getProformas(
      user,
      empresaHeader,
      empresaQuery,
      periodo,
      contratistaId,
      estado,
    );
  }

  @Get('proformas-contratista/siguiente-numero')
  @RequirePermissions(P.capture)
  getSiguienteNumeroProforma(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contratistas.getSiguienteNumeroProforma(user, empresaHeader);
  }

  @Post('proformas-contratista')
  @RequirePermissions(P.capture)
  createProforma(@CurrentUser() user: JwtPayload, @Body() dto: UpsertProformaDto) {
    return this.contratistas.createProforma(user, dto);
  }

  @Post('proformas-contratista/preview')
  @RequirePermissions(P.capture)
  previewProforma(@CurrentUser() user: JwtPayload, @Body() dto: UpsertProformaDto) {
    return this.contratistas.previewProforma(user, dto);
  }

  @Put('proformas-contratista/:id')
  @RequirePermissions(P.capture)
  updateProforma(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertProformaDto,
  ) {
    return this.contratistas.updateProforma(user, id, dto);
  }

  @Post('proformas-contratista/:id/definitiva')
  @RequirePermissions(P.finalize)
  marcarProformaDefinitiva(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SolicitarAprobacionProformaDto,
  ) {
    return this.contratistas.marcarProformaDefinitiva(user, id, dto);
  }

  @Post('proformas-contratista/:id/aprobar')
  @RequirePermissions(P.finalize)
  aprobarProformaDefinitiva(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.contratistas.aprobarProformaDefinitiva(user, id);
  }

  @Post('proformas-contratista/:id/factura')
  @RequirePermissions(P.invoice)
  asociarFacturaProforma(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AsociarFacturaProformaDto,
  ) {
    return this.contratistas.asociarFacturaProforma(user, id, dto);
  }

  @Post('proformas-contratista/:id/reversar')
  @RequirePermissions(P.reverse)
  reversarProforma(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReversarProformaDto,
  ) {
    return this.contratistas.reversarProforma(user, id, dto);
  }

  @Post('proformas-contratista/:id/reemitir')
  @RequirePermissions(P.reverse)
  reemitirProforma(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReemitirProformaDto,
  ) {
    return this.contratistas.reemitirProforma(user, id, dto);
  }

  @Delete('proformas-contratista/:id')
  @RequirePermissions(P.capture)
  deleteProforma(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.contratistas.deleteProforma(user, id);
  }

  @Get('ingresos-labor-diario')
  @RequirePermissions(P.read)
  getIngresos(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.contratistas.getIngresosLaborDiario(user, empresaHeader, empresaQuery);
  }

  @Post('ingresos-labor-diario')
  @RequirePermissions(P.capture)
  createIngreso(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertIngresoLaborDiarioDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contratistas.createIngresoLaborDiario(user, dto, empresaHeader);
  }

  @Put('ingresos-labor-diario/:id')
  @RequirePermissions(P.capture)
  updateIngreso(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertIngresoLaborDiarioDto,
  ) {
    return this.contratistas.updateIngresoLaborDiario(user, id, dto);
  }

  @Delete('ingresos-labor-diario/:id')
  @RequirePermissions(P.capture)
  deleteIngreso(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.contratistas.deleteIngresoLaborDiario(user, id);
  }

  @Post('ingresos-labor-diario/:id/aprobar')
  @RequirePermissions(P.finalize)
  aprobarIngreso(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AprobarIngresoLaborDto,
  ) {
    return this.contratistas.aprobarIngresoLaborDiario(user, id, dto);
  }

  @Post('ingresos-labor-diario/asociar')
  @RequirePermissions(P.capture)
  asociarIngresos(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AsociarIngresosProformaDto,
  ) {
    return this.contratistas.asociarIngresosAProforma(user, dto);
  }

  @Get('contratistas/traspaso-cierre')
  @RequirePermissions(P.read)
  getCierresTraspaso(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('periodo') periodo?: string,
  ) {
    return this.contratistas.getCierresTraspaso(user, empresaHeader, periodo);
  }

  @Get('contratistas/traspaso-cierre/:periodo')
  @RequirePermissions(P.read)
  getCierreTraspaso(
    @CurrentUser() user: JwtPayload,
    @Param('periodo') periodo: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contratistas.getCierreTraspaso(user, periodo, empresaHeader);
  }

  @Get('contratistas/auditoria')
  @RequirePermissions(P.audit)
  getAuditoria(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('entidad') entidad?: string,
    @Query('entidadId') entidadId?: string,
  ) {
    return this.contratistas.getAuditoria(
      user,
      empresaHeader,
      entidad,
      entidadId,
    );
  }

  @Post('contratistas/traspaso-cierre')
  @RequirePermissions(P.transfer, P.close)
  traspasoCierre(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TraspasoCierreDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contratistas.traspasoCierre(user, dto, empresaHeader);
  }

  @Post('contratistas/traspaso-cierre/:periodo/reabrir')
  @RequirePermissions(P.reopen)
  reabrirCierre(
    @CurrentUser() user: JwtPayload,
    @Param('periodo') periodo: string,
    @Body() dto: ReabrirCierreContratistaDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.contratistas.reabrirCierre(
      user,
      periodo,
      dto,
      empresaHeader,
    );
  }
}
