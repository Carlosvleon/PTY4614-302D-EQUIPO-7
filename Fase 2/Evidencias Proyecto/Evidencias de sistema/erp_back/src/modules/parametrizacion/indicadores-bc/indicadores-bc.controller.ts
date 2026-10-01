import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  Headers,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { IndicadoresBcService } from './indicadores-bc.service';
import {
  SyncIndicadoresDto,
  FiltroIndicadoresDto,
  UpdateConfigSyncDto,
} from './dto/indicadores-bc.dto';

@ApiTags('Parametrización - Indicadores Banco Central')
@Controller('parametrizacion/indicadores-bc')
export class IndicadoresBcController {
  constructor(private readonly indicadoresService: IndicadoresBcService) {}

  @Get()
  @ApiOperation({ summary: 'Consultar tipos de cambio históricos con filtros' })
  @ApiHeader({ name: 'x-empresa-id', required: false })
  getIndicadores(
    @Query() filtros: FiltroIndicadoresDto,
    @Headers('x-empresa-id') empresaId?: string,
  ) {
    return this.indicadoresService.getIndicadores(filtros, empresaId);
  }

  @Post('sincronizar')
  @ApiOperation({
    summary: 'Sincronizar tipos de cambio manualmente desde el Banco Central (por rango de fechas)',
  })
  @ApiHeader({ name: 'x-empresa-id', required: false })
  sincronizar(
    @Body() dto: SyncIndicadoresDto,
    @Headers('x-empresa-id') empresaId?: string,
  ) {
    return this.indicadoresService.sincronizarRango(dto.desde, dto.hasta, empresaId);
  }

  @Get('config-sync')
  @ApiOperation({ summary: 'Obtener configuración de sincronización automática del Banco Central' })
  @ApiHeader({ name: 'x-empresa-id', required: false })
  getConfigSync(@Headers('x-empresa-id') empresaId?: string) {
    return this.indicadoresService.getConfigSync(empresaId);
  }

  @Put('config-sync')
  @ApiOperation({ summary: 'Actualizar configuración de sincronización automática' })
  @ApiHeader({ name: 'x-empresa-id', required: false })
  updateConfigSync(
    @Body() dto: UpdateConfigSyncDto,
    @Headers('x-empresa-id') empresaId?: string,
  ) {
    return this.indicadoresService.updateConfigSync(dto, empresaId);
  }

  @Get('plantilla-csv')
  @ApiOperation({ summary: 'Descargar archivo CSV de plantilla para importación histórica' })
  descargarPlantilla(@Res() res: Response) {
    const csvContent = this.indicadoresService.generarPlantillaCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="plantilla_indicadores_bcch.csv"',
    );
    res.status(200).send(csvContent);
  }

  @Post('importar-csv')
  @ApiOperation({ summary: 'Importar archivo CSV con tipos de cambio históricos' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async importarCsv(
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-empresa-id') empresaId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Debe subir un archivo CSV.');
    }
    return this.indicadoresService.importarCsv(file.buffer, empresaId);
  }
}
