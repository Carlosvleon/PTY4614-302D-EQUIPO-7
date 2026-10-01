import { Body, Controller, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { RequireAnyPermission, RequirePermissions } from '../../auth/permissions.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtPayload } from '../../auth/jwt.strategy';
import { InsumosService } from './insumos.service';
import {
  UpsertBodegaDto,
  UpsertInsumoDto,
  UpsertMovimientoBodegaDto,
} from './dto/insumos.dto';

@ApiTags('insumos')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Empresa-Id', required: false })
@Controller()
export class InsumosController {
  constructor(private insumos: InsumosService) {}

  @Get('insumos')
  @RequirePermissions('insumos:read')
  getInsumos(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.insumos.getInsumos(user, empresaHeader, empresaQuery);
  }

  @Post('insumos')
  @RequirePermissions('insumos:write')
  createInsumo(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertInsumoDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.insumos.createInsumo(user, dto, empresaHeader);
  }

  @Put('insumos/:id')
  @RequirePermissions('insumos:write')
  updateInsumo(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertInsumoDto,
  ) {
    return this.insumos.updateInsumo(user, id, dto);
  }

  @Get('insumos/:id/stock-bodegas')
  @RequireAnyPermission('insumos:read', 'comercial:read', 'compras:read')
  getStockBodegas(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.insumos.getStockBodegas(user, id, empresaHeader, empresaQuery);
  }

  @Get('bodegas/:id/stock')
  @RequireAnyPermission('insumos:read', 'comercial:read')
  getStockPorBodega(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.insumos.getStockPorBodega(user, id, empresaHeader, empresaQuery);
  }

  @Post('reservas-stock/:id/liberar')
  @RequirePermissions('insumos:write')
  liberarReserva(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.insumos.liberarReserva(user, id, empresaHeader);
  }

  @Get('bodegas')
  @RequirePermissions('insumos:read')
  getBodegas(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.insumos.getBodegas(user, empresaHeader, empresaQuery);
  }

  @Post('bodegas')
  @RequirePermissions('insumos:write')
  createBodega(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertBodegaDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.insumos.createBodega(user, dto, empresaHeader);
  }

  @Put('bodegas/:id')
  @RequirePermissions('insumos:write')
  updateBodega(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertBodegaDto,
  ) {
    return this.insumos.updateBodega(user, id, dto);
  }

  @Get('movimientos-bodega')
  @RequirePermissions('insumos:read')
  getMovimientos(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.insumos.getMovimientos(user, empresaHeader, empresaQuery);
  }

  @Post('movimientos-bodega')
  @RequirePermissions('insumos:write')
  createMovimiento(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertMovimientoBodegaDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.insumos.createMovimiento(user, dto, empresaHeader);
  }

  @Put('movimientos-bodega/:id')
  @RequirePermissions('insumos:write')
  updateMovimiento(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertMovimientoBodegaDto,
  ) {
    return this.insumos.updateMovimiento(user, id, dto);
  }
}
