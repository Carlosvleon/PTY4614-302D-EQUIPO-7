import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class MovimientoCartolaInputDto {
  @ApiProperty() @IsString() fecha: string;
  @ApiProperty() @IsString() referencia: string;
  @ApiProperty() @IsString() glosa: string;
  @ApiProperty() @IsNumber() monto: number;
  @ApiProperty() @IsString() tipo: string;
}

export class ContabilizarMovimientoCartolaDto {
  @ApiProperty({ description: 'Cuenta de contrapartida (banco sale de Config SII)' })
  @IsString()
  cuentaContraId: string;

  @ApiProperty({ description: 'FACTURA | ANTICIPO | TRASPASO | SUELDO | RENDICION | OTRO' })
  @IsString()
  destinoTipo: string;

  @ApiProperty()
  @IsString()
  codigoFinancieroId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tipoDocumento?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  folioDocumento?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  proveedorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clienteId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  centroCostoId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  areaNegocioId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  elementoCostoId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  tcManual?: number;

  @ApiPropertyOptional({ description: 'Semana de nómina YYYY-MM-Sn. Solo egresos.' })
  @IsOptional()
  @IsString()
  nominaSemana?: string;
}

export class AsociarNominaCartolaDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids: string[];

  @ApiProperty({ description: 'Semana YYYY-MM-Sn' })
  @IsString()
  nominaSemana: string;
}

export class UpsertCartolaDto {
  @ApiProperty() @IsString() banco: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bancoCodigo?: string;
  @ApiProperty() @IsString() periodo: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mesContable?: string;
  @ApiPropertyOptional({ description: 'CLP | USD | CNY' })
  @IsOptional()
  @IsString()
  moneda?: string;
  @ApiProperty() @IsString() archivoNombre: string;
  @ApiPropertyOptional() @IsOptional() @IsString() formato?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) movimientos?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() montoTotal?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() estado?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() pendientesContabilizar?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() usuarioCarga?: string;
  @ApiPropertyOptional({ type: [MovimientoCartolaInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MovimientoCartolaInputDto)
  lineas?: MovimientoCartolaInputDto[];
}

export class UpsertPagoDto {
  @ApiProperty() @IsString() fecha: string;
  @ApiProperty() @IsString() beneficiario: string;
  @ApiProperty() @IsNumber() @Min(0) monto: number;
  @ApiProperty() @IsString() medio: string;
  @ApiProperty() @IsString() estado: string;
  @ApiPropertyOptional() @IsOptional() @IsString() proveedorId?: string;
  /** Cobro de factura de venta: cliente del maestro (mutuamente excluyente con proveedorId). */
  @ApiPropertyOptional() @IsOptional() @IsString() clienteId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) tcManual?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() monedaPago?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() monedaFactura?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() diferenciaTc?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() documentosCalce?: string;
  /** GAP-05: id del movimiento de cartola a calzar (único). */
  @ApiPropertyOptional() @IsOptional() @IsString() movimientoCartolaId?: string;
  /** PAGO_TOTAL | ANTICIPO | ANTICIPO_PRODUCTOR */
  @ApiPropertyOptional() @IsOptional() @IsString() tipo?: string;
  /** Motivo al corregir TC (auditoría). */
  @ApiPropertyOptional() @IsOptional() @IsString() motivo?: string;
}

export class CalzarProductorDto {
  @ApiProperty({ description: 'Folio de factura a calzar' })
  @IsString()
  documentosCalce: string;

  @ApiProperty({ description: 'Tipo de cambio (contrato USD / pago CLP)' })
  @IsNumber()
  @Min(0)
  tcManual: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  motivo?: string;
}

export class CalcularDiferenciaTcDto {
  @ApiProperty({ description: 'Monto de la operación' })
  @IsNumber()
  @Min(0)
  monto: number;

  @ApiPropertyOptional({ description: 'Folio del documento a calzar' })
  @IsOptional()
  @IsString()
  documentosCalce?: string;

  @ApiPropertyOptional({ description: 'Tipo de cambio del pago/cobro' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tcPago?: number;

  @ApiPropertyOptional({ description: 'Tipo de cambio original del documento' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tcDocumento?: number;

  @ApiPropertyOptional({ description: 'Fecha del pago/cobro (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  fecha?: string;

  @ApiPropertyOptional({ description: 'Moneda del pago' })
  @IsOptional()
  @IsString()
  monedaPago?: string;

  @ApiPropertyOptional({ description: 'Moneda de la factura' })
  @IsOptional()
  @IsString()
  monedaFactura?: string;

  @ApiPropertyOptional({ description: 'Alias de monedaFactura' })
  @IsOptional()
  @IsString()
  monedaDocumento?: string;

  @ApiPropertyOptional({ description: 'Monto original en moneda extranjera' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  montoMonedaExtranjera?: number;

  @ApiPropertyOptional({ description: 'COBRO | PAGO | INGRESO | EGRESO' })
  @IsOptional()
  @IsString()
  sentido?: string;
}

export class FlujoCajaQueryDto {
  @ApiPropertyOptional({ enum: ['CLP', 'USD', 'CNY', 'YUAN'] })
  @IsOptional()
  @Transform(({ value }) => {
    const v = String(value ?? '').trim().toUpperCase();
    return v || undefined;
  })
  @IsIn(['CLP', 'USD', 'CNY', 'YUAN'])
  moneda?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  empresaId?: string;

  @ApiPropertyOptional({ description: 'Periodo YYYY-MM. Vacío = todos los meses.' })
  @IsOptional()
  @Transform(({ value }) => {
    const v = String(value ?? '').trim();
    return v || undefined;
  })
  @IsString()
  periodo?: string;
}

export class UpsertMovimientoCajaDto {
  @ApiProperty() @IsString() fecha: string;
  @ApiProperty() @IsString() concepto: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) ingreso?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) egreso?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() banco?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() moneda?: string;
  @ApiPropertyOptional() @IsOptional() esApertura?: boolean;
}

export class CorregirAperturaDto {
  @ApiProperty() @IsString() fecha: string;
  @ApiProperty() @IsIn(['Banco Chile', 'Banco Estado', 'Santander', 'Scotiabank']) banco: string;
  @ApiProperty() @IsIn(['CLP', 'USD', 'CNY']) moneda: string;
  @ApiProperty() @IsNumber() @Min(0.01) ingreso: number;
  @ApiProperty() @IsString() @MinLength(3) motivo: string;
}

export class UpsertConciliacionDto {
  @ApiProperty() @IsString() banco: string;
  @ApiProperty() @IsString() periodo: string;
  @ApiProperty() @IsNumber() @Min(0) movimientos: number;
  @ApiPropertyOptional() @IsOptional() @IsString() asientoNumero?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cartolaId?: string;
}

export class UpsertAnticipoDto {
  @ApiProperty() @IsString() fecha: string;
  @ApiProperty() @IsString() productor: string;
  @ApiProperty() @IsString() rut: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clienteId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() proveedorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() banco?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() formaPago?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() codigoFinanciero?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tipoDocto?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nroDocto?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nroComprobante?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fechaVencimiento?: string;
  @ApiProperty() @IsNumber() @Min(0) monto: number;
  @ApiProperty() @IsString() moneda: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() montoUsd?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() montoCalzado?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() saldoUsd?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() tc?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() glosa?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() estado?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() documentosCalce?: string;
}

/** PUT anticipo: calce y/o edición de cabecera (campos opcionales). */
export class UpdateAnticipoCalceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() fecha?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() productor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rut?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clienteId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() proveedorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() banco?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() formaPago?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() codigoFinanciero?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tipoDocto?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nroDocto?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nroComprobante?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fechaVencimiento?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) monto?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() moneda?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() montoUsd?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) montoCalzado?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() saldoUsd?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() tc?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() glosa?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() estado?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() documentosCalce?: string;
}

export class AjusteCuentaCorrienteDto {
  @ApiProperty({ enum: ['CLIENTE', 'PROVEEDOR', 'PRODUCTOR'] })
  @IsString()
  terceroTipo: string;

  @ApiProperty() @IsString() terceroId: string;
  @ApiProperty() @IsString() terceroNombre: string;
  @ApiProperty() @IsString() fecha: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) debe?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) haber?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() glosa?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() documentoRef?: string;
}

/** R4-17: actualizar fecha de vencimiento en nómina/aging. */
export class UpdateDocumentoAgingDto {
  @ApiPropertyOptional({ description: 'Fecha vencimiento ISO yyyy-mm-dd (R4-17, rol tesorería)' })
  @IsOptional()
  @IsString()
  fechaVencimiento?: string;

  @ApiPropertyOptional({ description: 'Semana de compromiso YYYY-MM-Sn (nómina). No muta el DTE.' })
  @IsOptional()
  @IsString()
  semanaCompromiso?: string;
}

export class AplazarNominaLoteDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids: string[];

  @ApiPropertyOptional({ description: 'Semana destino YYYY-MM-Sn. Obligatorio si no es revertir.' })
  @IsOptional()
  @IsString()
  semanaCompromiso?: string;

  @ApiPropertyOptional({ description: 'Vuelve cada documento a la semana natural del vencimiento.' })
  @IsOptional()
  @IsBoolean()
  revertir?: boolean;
}
