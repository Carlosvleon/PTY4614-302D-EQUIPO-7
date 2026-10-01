import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { MonedasService } from './monedas.service';
import { CreateMonedaDto } from './dto/create-moneda.dto';
import { UpdateMonedaDto } from './dto/update-moneda.dto';

@ApiTags('Parametrización - Monedas')
@Controller('parametrizacion/monedas')
export class MonedasController {
  constructor(private readonly monedasService: MonedasService) {}

  @Get('catalogo-bcch')
  @ApiOperation({ summary: 'Obtener catálogo de series oficiales del Banco Central de Chile' })
  @ApiResponse({ status: 200, description: 'Lista de monedas e indicadores soportados por el Banco Central' })
  getCatalogoBCCH() {
    return this.monedasService.getCatalogoBCCH();
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas las monedas configuradas en la empresa' })
  @ApiHeader({ name: 'x-empresa-id', required: false, description: 'ID de la empresa (opcional)' })
  findAll(@Headers('x-empresa-id') empresaId?: string) {
    return this.monedasService.findAll(empresaId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalles de una moneda por ID' })
  @ApiHeader({ name: 'x-empresa-id', required: false })
  findOne(@Param('id') id: string, @Headers('x-empresa-id') empresaId?: string) {
    return this.monedasService.findOne(id, empresaId);
  }

  @Post()
  @ApiOperation({ summary: 'Crear o habilitar una nueva moneda para la empresa' })
  @ApiHeader({ name: 'x-empresa-id', required: false })
  create(
    @Body() createMonedaDto: CreateMonedaDto,
    @Headers('x-empresa-id') empresaId?: string,
  ) {
    return this.monedasService.create(createMonedaDto, empresaId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar configuración de una moneda' })
  @ApiHeader({ name: 'x-empresa-id', required: false })
  update(
    @Param('id') id: string,
    @Body() updateMonedaDto: UpdateMonedaDto,
    @Headers('x-empresa-id') empresaId?: string,
  ) {
    return this.monedasService.update(id, updateMonedaDto, empresaId);
  }

  @Patch(':id/toggle-activa')
  @ApiOperation({ summary: 'Activar o desactivar una moneda' })
  @ApiHeader({ name: 'x-empresa-id', required: false })
  toggleActiva(
    @Param('id') id: string,
    @Headers('x-empresa-id') empresaId?: string,
  ) {
    return this.monedasService.toggleActiva(id, empresaId);
  }

  @Patch(':id/toggle-foco')
  @ApiOperation({ summary: 'Alternar foco de reportería de una moneda' })
  @ApiHeader({ name: 'x-empresa-id', required: false })
  toggleFoco(
    @Param('id') id: string,
    @Headers('x-empresa-id') empresaId?: string,
  ) {
    return this.monedasService.toggleFocoReporteria(id, empresaId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una moneda (o desactivarla si tiene tipos de cambio asociados)' })
  @ApiHeader({ name: 'x-empresa-id', required: false })
  remove(@Param('id') id: string, @Headers('x-empresa-id') empresaId?: string) {
    return this.monedasService.remove(id, empresaId);
  }
}
