import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  UpsertEmpresaDto,
  UpsertUsuarioDto,
  UpsertRolDto,
  DeleteRolDto,
  UpsertWorkflowDto,
  UpsertDelegacionAprobacionDto,
  UpsertGrupoAprobacionDto,
  UpsertNodoEscalaAprobacionDto,
  UpsertAdminConceptoDto,
  SimularAprobacionDto,
  ReasignacionPendientesDto,
  ValidarBandejaAprobadoresDto,
} from './dto/admin.dto';
import {
  OPERATIONAL_MASTER_READ,
  RequireAnyPermission,
  RequirePermissions,
  RequireAprobacionesConfig,
} from '../../auth/permissions.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtPayload } from '../../auth/jwt.strategy';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Empresa-Id', required: false })
@Controller()
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('empresas')
  @RequireAnyPermission(...OPERATIONAL_MASTER_READ)
  getEmpresas(@CurrentUser() user: JwtPayload) {
    return this.admin.getEmpresas(user);
  }

  @Post('empresas')
  @RequirePermissions('admin:write')
  createEmpresa(@CurrentUser() user: JwtPayload, @Body() dto: UpsertEmpresaDto) {
    return this.admin.createEmpresa(user, dto);
  }

  @Put('empresas/:id')
  @RequirePermissions('admin:write')
  updateEmpresa(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertEmpresaDto,
  ) {
    return this.admin.updateEmpresa(user, id, dto);
  }

  @Delete('empresas/:id')
  @RequirePermissions('admin:write')
  deleteEmpresa(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.admin.deleteEmpresa(user, id);
  }

  @Get('usuarios')
  @RequirePermissions('admin:read')
  getUsuarios(@CurrentUser() user: JwtPayload) {
    return this.admin.getUsuarios(user);
  }

  @Post('usuarios')
  @RequirePermissions('admin:write')
  createUsuario(@CurrentUser() user: JwtPayload, @Body() dto: UpsertUsuarioDto) {
    return this.admin.createUsuario(user, dto);
  }

  @Put('usuarios/:id')
  @RequirePermissions('admin:write')
  updateUsuario(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertUsuarioDto,
  ) {
    return this.admin.updateUsuario(user, id, dto);
  }

  @Get('roles')
  @RequirePermissions('admin:read')
  getRoles() {
    return this.admin.getRoles();
  }

  @Post('roles')
  @RequirePermissions('admin:write')
  createRol(@CurrentUser() user: JwtPayload, @Body() dto: UpsertRolDto) {
    return this.admin.createRol(user, dto);
  }

  @Put('roles/:id')
  @RequirePermissions('admin:write')
  updateRol(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertRolDto,
  ) {
    return this.admin.updateRol(user, id, dto);
  }

  @Delete('roles/:id')
  @RequirePermissions('admin:write')
  deleteRol(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DeleteRolDto,
  ) {
    return this.admin.deleteRol(user, id, dto);
  }

  @Get('workflows-admin')
  @RequirePermissions('admin:read')
  getWorkflows(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.admin.getWorkflows(user, empresaHeader);
  }

  @Post('workflows-admin')
  @RequirePermissions('admin:write')
  createWorkflow(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertWorkflowDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.admin.createWorkflow(user, dto, empresaHeader);
  }

  @Put('workflows-admin/:id')
  @RequirePermissions('admin:write')
  updateWorkflow(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertWorkflowDto,
  ) {
    return this.admin.updateWorkflow(user, id, dto);
  }

  @Delete('workflows-admin/:id')
  @RequirePermissions('admin:write')
  deleteWorkflow(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.admin.deleteWorkflow(user, id);
  }

  @Get('delegaciones-aprobacion')
  @RequireAprobacionesConfig('read')
  getDelegacionesAprobacion(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.admin.getDelegacionesAprobacion(user, empresaHeader);
  }

  @Post('delegaciones-aprobacion')
  @RequireAprobacionesConfig('write')
  createDelegacionAprobacion(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertDelegacionAprobacionDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.admin.createDelegacionAprobacion(user, dto, empresaHeader);
  }

  @Put('delegaciones-aprobacion/:id')
  @RequireAprobacionesConfig('write')
  updateDelegacionAprobacion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertDelegacionAprobacionDto,
  ) {
    return this.admin.updateDelegacionAprobacion(user, id, dto);
  }

  @Delete('delegaciones-aprobacion/:id')
  @RequireAprobacionesConfig('write')
  deleteDelegacionAprobacion(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.admin.deleteDelegacionAprobacion(user, id);
  }

  @Get('grupos-aprobacion')
  @RequireAprobacionesConfig('read')
  getGruposAprobacion(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.admin.getGruposAprobacion(user, empresaHeader);
  }

  @Post('grupos-aprobacion')
  @RequireAprobacionesConfig('write')
  createGrupoAprobacion(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertGrupoAprobacionDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.admin.createGrupoAprobacion(user, dto, empresaHeader);
  }

  @Put('grupos-aprobacion/:id')
  @RequireAprobacionesConfig('write')
  updateGrupoAprobacion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertGrupoAprobacionDto,
  ) {
    return this.admin.updateGrupoAprobacion(user, id, dto);
  }

  @Delete('grupos-aprobacion/:id')
  @RequireAprobacionesConfig('write')
  deleteGrupoAprobacion(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.admin.deleteGrupoAprobacion(user, id);
  }

  @Get('escalas-aprobacion')
  @RequireAprobacionesConfig('read')
  getEscalasAprobacion(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.admin.getEscalasAprobacion(user, empresaHeader);
  }

  @Post('escalas-aprobacion')
  @RequireAprobacionesConfig('write')
  createNodoEscalaAprobacion(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertNodoEscalaAprobacionDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.admin.createNodoEscalaAprobacion(user, dto, empresaHeader);
  }

  @Put('escalas-aprobacion/:id')
  @RequireAprobacionesConfig('write')
  updateNodoEscalaAprobacion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertNodoEscalaAprobacionDto,
  ) {
    return this.admin.updateNodoEscalaAprobacion(user, id, dto);
  }

  @Get('escalas-aprobacion/:id/pendientes-impacto')
  @RequireAprobacionesConfig('read')
  previewPendientesNodo(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.admin.previewPendientesNodo(user, id, empresaHeader);
  }

  @Get('aprobaciones/pendientes-aprobador')
  @RequireAprobacionesConfig('read')
  previewPendientesAprobador(
    @CurrentUser() user: JwtPayload,
    @Query('usuarioId') usuarioId: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.admin.previewPendientesAprobador(user, usuarioId, empresaHeader);
  }

  @Delete('escalas-aprobacion/:id')
  @RequireAprobacionesConfig('write')
  deleteNodoEscalaAprobacion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body?: ReasignacionPendientesDto,
  ) {
    return this.admin.deleteNodoEscalaAprobacion(user, id, body);
  }

  @Post('aprobaciones/simular')
  @RequireAprobacionesConfig('read')
  simularAprobacion(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SimularAprobacionDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.admin.simularAprobacion(user, dto, empresaHeader);
  }

  @Post('aprobaciones/validar-bandeja')
  @RequireAprobacionesConfig('read')
  validarBandejaAprobadores(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ValidarBandejaAprobadoresDto,
  ) {
    return this.admin.validarAprobadoresBandeja(
      user,
      dto.modulo,
      dto.usuarioIds ?? [],
      dto.mode ?? 'write',
    );
  }

  // -------- ADMIN CONCEPTO --------

  @Get('administradores-concepto')
  @RequirePermissions('admin:read')
  getAdministradoresConcepto(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.admin.getAdministradoresConcepto(user, empresaHeader);
  }

  @Post('administradores-concepto')
  @RequirePermissions('admin:write')
  createAdminConcepto(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertAdminConceptoDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.admin.createAdminConcepto(user, dto, empresaHeader);
  }

  @Put('administradores-concepto/:id')
  @RequirePermissions('admin:write')
  updateAdminConcepto(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertAdminConceptoDto,
  ) {
    return this.admin.updateAdminConcepto(user, id, dto);
  }

  @Delete('administradores-concepto/:id')
  @RequirePermissions('admin:write')
  deleteAdminConcepto(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.admin.deleteAdminConcepto(user, id);
  }

  // -------- EXPORT / IMPORT CONFIG APROBACIONES --------

  @Get('aprobaciones-config/export')
  @RequireAprobacionesConfig('read')
  exportAprobacionesConfig(
    @CurrentUser() user: JwtPayload,
    @Query('modulo') modulo: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.admin.exportAprobacionesConfig(user, modulo ?? 'empresa', empresaHeader);
  }

  @Post('aprobaciones-config/preview')
  @RequireAprobacionesConfig('write')
  previewAprobacionesConfig(
    @CurrentUser() user: JwtPayload,
    @Body() config: Record<string, unknown>,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.admin.previewAprobacionesConfig(user, config, empresaHeader);
  }

  @Post('aprobaciones-config/import')
  @RequireAprobacionesConfig('write')
  importAprobacionesConfig(
    @CurrentUser() user: JwtPayload,
    @Body() config: Record<string, unknown>,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.admin.importAprobacionesConfig(user, config, empresaHeader);
  }
}
