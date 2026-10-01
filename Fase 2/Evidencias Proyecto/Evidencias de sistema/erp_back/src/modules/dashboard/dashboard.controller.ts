import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RequireAuthenticatedSession } from '../../auth/permissions.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtPayload } from '../../auth/jwt.strategy';
import { DashboardService } from './dashboard.service';
import { NotificacionesService } from './notificaciones.service';

class SetLeidaDto {
  @ApiProperty()
  @IsBoolean()
  leida: boolean;
}

@ApiTags('dashboard')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Empresa-Id', required: false })
@Controller('dashboard')
export class DashboardController {
  constructor(
    private dashboard: DashboardService,
    private notificaciones: NotificacionesService,
  ) {}

  @Get('kpis')
  @RequireAuthenticatedSession()
  getKpis(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.dashboard.getKpis(user, empresaHeader, empresaQuery);
  }

  @Get('tendencia')
  @RequireAuthenticatedSession()
  getTendencia(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.dashboard.getTendencia(user, empresaHeader, empresaQuery);
  }

  @Get('notificaciones')
  @RequireAuthenticatedSession()
  getNotificaciones(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.dashboard.getNotificacionesPendientes(user, empresaHeader, empresaQuery);
  }

  @Patch('notificaciones/:id')
  @RequireAuthenticatedSession()
  setLeida(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SetLeidaDto,
  ) {
    return this.notificaciones.setLeida(user.sub, id, dto.leida);
  }

  @Post('notificaciones/marcar-todas-leidas')
  @RequireAuthenticatedSession()
  markAll(@CurrentUser() user: JwtPayload) {
    return this.notificaciones.markAllRead(user.sub);
  }
}
