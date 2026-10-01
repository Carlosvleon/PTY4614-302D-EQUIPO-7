import {
  BadRequestException,
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
import { RequirePermissions } from '../../auth/permissions.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtPayload } from '../../auth/jwt.strategy';
import { TesoreriaService } from './tesoreria.service';
import {
  AjusteCuentaCorrienteDto,
  AplazarNominaLoteDto,
  UpdateAnticipoCalceDto,
  UpdateDocumentoAgingDto,
  UpsertAnticipoDto,
  UpsertCartolaDto,
  UpsertConciliacionDto,
  CorregirAperturaDto,
  FlujoCajaQueryDto,
  UpsertMovimientoCajaDto,
  UpsertPagoDto,
  CalzarProductorDto,
  ContabilizarMovimientoCartolaDto,
  AsociarNominaCartolaDto,
  CalcularDiferenciaTcDto,
} from './dto/tesoreria.dto';
import { CuentaCorrienteService } from './cuenta-corriente.service';
import { EstadoCuentaPorRutQueryDto } from './dto/cuenta-corriente.dto';

const CARTOLA_UPLOAD = {
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (
    _req: unknown,
    file: { originalname?: string },
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const name = (file.originalname ?? '').toLowerCase();
    if (/\.(xlsx|xls|csv|txt|pdf)$/.test(name)) {
      cb(null, true);
      return;
    }
    cb(new BadRequestException('Solo se aceptan CSV, Excel o PDF (máx. 10 MB)'), false);
  },
};

@ApiTags('tesoreria')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Empresa-Id', required: false })
@Controller()
export class TesoreriaController {
  constructor(
    private tesoreria: TesoreriaService,
    private cuentaCorriente: CuentaCorrienteService,
  ) {}

  @Get('movimientos-caja')
  @RequirePermissions('tesoreria:read')
  getMovimientosCaja(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.tesoreria.getMovimientosCaja(user, empresaHeader, empresaQuery);
  }

  @Get('flujo-caja')
  @RequirePermissions('tesoreria:read')
  getFlujoCaja(
    @CurrentUser() user: JwtPayload,
    @Query() query: FlujoCajaQueryDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.tesoreria.getFlujoCaja(user, query, empresaHeader);
  }

  @Get('saldos-bancos')
  @RequirePermissions('tesoreria:read')
  getSaldosBancos(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.tesoreria.getSaldosBancos(user, empresaHeader, empresaQuery);
  }

  @Post('movimientos-caja')
  @RequirePermissions('tesoreria:write')
  createMovimientoCaja(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertMovimientoCajaDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.tesoreria.createMovimientoCaja(user, dto, empresaHeader);
  }

  @Post('movimientos-caja/:id/corregir-apertura')
  @RequirePermissions('tesoreria:write')
  corregirApertura(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CorregirAperturaDto,
  ) {
    return this.tesoreria.corregirApertura(user, id, dto);
  }

  @Put('movimientos-caja/:id')
  @RequirePermissions('tesoreria:write')
  updateMovimientoCaja(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertMovimientoCajaDto,
  ) {
    return this.tesoreria.updateMovimientoCaja(user, id, dto);
  }

  @Delete('movimientos-caja/:id')
  @RequirePermissions('tesoreria:write')
  deleteMovimientoCaja(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.tesoreria.deleteMovimientoCaja(user, id);
  }

  @Get('pagos')
  @RequirePermissions('tesoreria:read')
  getPagos(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.tesoreria.getPagos(user, empresaHeader, empresaQuery);
  }

  @Post('pagos')
  @RequirePermissions('tesoreria:write')
  createPago(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertPagoDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.tesoreria.createPago(user, dto, empresaHeader);
  }

  @Put('pagos/:id')
  @RequirePermissions('tesoreria:write')
  updatePago(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertPagoDto,
  ) {
    return this.tesoreria.updatePago(user, id, dto);
  }

  @Post('pagos/:id/calzar-productor')
  @RequirePermissions('tesoreria:write')
  calzarProductor(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CalzarProductorDto,
  ) {
    return this.tesoreria.calzarProductor(user, id, dto);
  }

  @Post('pagos/calcular-diferencia-tc')
  @RequirePermissions('tesoreria:read')
  calcularDiferenciaTc(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CalcularDiferenciaTcDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.tesoreria.previewDiferenciaTc(user, dto, empresaHeader);
  }

  @Get('pagos/:id/tc-eventos')
  @RequirePermissions('tesoreria:read')
  getPagoTcEventos(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.tesoreria.getPagoTcEventos(user, id);
  }

  @Get('conciliaciones')
  @RequirePermissions('tesoreria:read')
  getConciliaciones(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.tesoreria.getConciliaciones(user, empresaHeader, empresaQuery);
  }

  @Post('conciliaciones')
  @RequirePermissions('tesoreria:write')
  createConciliacion(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertConciliacionDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.tesoreria.createConciliacion(user, dto, empresaHeader);
  }

  @Get('conciliaciones/:id/movimientos')
  @RequirePermissions('tesoreria:read')
  getMovimientosConciliacion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.tesoreria.getMovimientosConciliacion(user, id);
  }

  @Post('movimientos-conciliacion/:id/desconciliar')
  @RequirePermissions('tesoreria:write')
  desconciliar(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tesoreria.desconciliarMovimiento(user, id);
  }

  @Get('cartolas-bancarias')
  @RequirePermissions('tesoreria:read')
  getCartolas(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.tesoreria.getCartolas(user, empresaHeader, empresaQuery);
  }

  @Post('cartolas-bancarias')
  @RequirePermissions('tesoreria:write')
  createCartola(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertCartolaDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.tesoreria.createCartola(user, dto, empresaHeader);
  }

  @Post('cartolas-bancarias/preview-archivo')
  @RequirePermissions('tesoreria:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', CARTOLA_UPLOAD))
  previewCartolaArchivo(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Archivo requerido (CSV o Excel)');
    return this.tesoreria.previewCartolaArchivo(user, file, empresaHeader);
  }

  @Post('cartolas-bancarias/import-archivo')
  @RequirePermissions('tesoreria:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        banco: { type: 'string' },
        periodo: { type: 'string' },
        mesContable: { type: 'string' },
        bancoCodigo: { type: 'string' },
        hojas: { type: 'string', description: 'Hojas a importar, separadas por coma' },
        moneda: { type: 'string', description: 'CLP | USD | CNY' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', CARTOLA_UPLOAD))
  importCartolaArchivo(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { banco?: string; periodo?: string; mesContable?: string; bancoCodigo?: string; hojas?: string; moneda?: string },
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Archivo requerido (CSV o Excel)');
    if (!body.banco?.trim() || !body.periodo?.trim()) {
      throw new BadRequestException('banco y periodo son requeridos');
    }
    return this.tesoreria.importCartolaArchivo(
      user,
      file,
      {
        banco: body.banco,
        periodo: body.periodo,
        mesContable: body.mesContable,
        bancoCodigo: body.bancoCodigo,
        hojas: body.hojas?.split(',').map((h) => h.trim()).filter(Boolean),
        moneda: body.moneda,
      },
      empresaHeader,
    );
  }

  @Delete('cartolas-bancarias/:id')
  @RequirePermissions('tesoreria:write')
  deleteCartola(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tesoreria.deleteCartola(user, id);
  }

  @Post('cartolas-bancarias/:id/cerrar')
  @RequirePermissions('tesoreria:write')
  cerrarCartola(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tesoreria.cerrarCartola(user, id);
  }

  @Get('cartolas-bancarias/:id/movimientos')
  @RequirePermissions('tesoreria:read')
  getMovimientosCartola(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tesoreria.getMovimientosCartola(user, id);
  }

  @Get('movimientos-cartola/lookup-documento')
  @RequirePermissions('tesoreria:read')
  lookupDocumentoCartola(
    @CurrentUser() user: JwtPayload,
    @Query('folio') folio?: string,
    @Query('tipoDocumento') tipoDocumento?: string,
    @Query('sentido') sentido?: string,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.tesoreria.lookupDocumentoCartola(
      user,
      { folio, tipoDocumento, sentido },
      empresaHeader,
    );
  }

  @Post('movimientos-cartola/:id/contabilizar')
  @RequirePermissions('tesoreria:write')
  contabilizarCartola(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ContabilizarMovimientoCartolaDto,
  ) {
    return this.tesoreria.contabilizarMovimientoCartola(user, id, dto);
  }

  @Post('movimientos-cartola/asociar-nomina')
  @RequirePermissions('tesoreria:write')
  asociarNominaCartola(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AsociarNominaCartolaDto,
  ) {
    return this.tesoreria.asociarNominaCartola(user, dto);
  }

  @Get('documentos-aging')
  @RequirePermissions('tesoreria:read')
  getAging(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.tesoreria.getDocumentosAging(user, empresaHeader, empresaQuery);
  }

  @Post('documentos-aging/sync')
  @RequirePermissions('tesoreria:write')
  syncAging(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.tesoreria.syncDocumentosAging(user, empresaHeader);
  }

  @Patch('documentos-aging/:id')
  @RequirePermissions('tesoreria:write')
  updateAging(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentoAgingDto,
  ) {
    return this.tesoreria.updateDocumentoAging(user, id, dto);
  }

  @Post('documentos-aging/aplazar-lote')
  @RequirePermissions('tesoreria:write')
  aplazarNominaLote(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AplazarNominaLoteDto,
  ) {
    return this.tesoreria.aplazarNominaLote(user, dto);
  }

  @Get('anticipos-productores')
  @RequirePermissions('tesoreria:read')
  getAnticipos(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
  ) {
    return this.tesoreria.getAnticipos(user, empresaHeader, empresaQuery);
  }

  @Post('anticipos-productores')
  @RequirePermissions('tesoreria:write')
  createAnticipo(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertAnticipoDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.tesoreria.createAnticipo(user, dto, empresaHeader);
  }

  @Put('anticipos-productores/:id')
  @RequirePermissions('tesoreria:write')
  updateAnticipo(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAnticipoCalceDto,
  ) {
    return this.tesoreria.updateAnticipo(user, id, dto);
  }

  @Get('cuentas-corrientes')
  @RequirePermissions('tesoreria:read')
  getCuentasCorrientes(
    @CurrentUser() user: JwtPayload,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
    @Query('terceroTipo') terceroTipo?: string,
    @Query('q') q?: string,
    @Query('soloConSaldo') soloConSaldo?: string,
    @Query('periodo') periodo?: string,
  ) {
    return this.cuentaCorriente.listSaldos(
      user,
      {
        terceroTipo,
        q,
        soloConSaldo: soloConSaldo === '1' || soloConSaldo === 'true',
        periodo,
      },
      empresaHeader,
      empresaQuery,
    );
  }

  @Get('cuentas-corrientes/por-rut')
  @RequirePermissions('tesoreria:read')
  getEstadoCuentaPorRut(
    @CurrentUser() user: JwtPayload,
    @Query() query: EstadoCuentaPorRutQueryDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.cuentaCorriente.getEstadoCuentaPorRut(
      user,
      query,
      empresaHeader,
      query.empresaId,
    );
  }

  @Get('cuentas-corrientes/:terceroId/movimientos')
  @RequirePermissions('tesoreria:read')
  getMovimientosCc(
    @CurrentUser() user: JwtPayload,
    @Param('terceroId') terceroId: string,
    @Headers('x-empresa-id') empresaHeader?: string,
    @Query('empresaId') empresaQuery?: string,
    @Query('terceroTipo') terceroTipo?: string,
  ) {
    return this.cuentaCorriente.listMovimientos(
      user,
      terceroId,
      { terceroTipo },
      empresaHeader,
      empresaQuery,
    );
  }

  @Post('cuentas-corrientes/ajuste')
  @RequirePermissions('tesoreria:write')
  ajusteCc(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AjusteCuentaCorrienteDto,
    @Headers('x-empresa-id') empresaHeader?: string,
  ) {
    return this.cuentaCorriente.registrarAjuste(user, dto, empresaHeader);
  }
}
