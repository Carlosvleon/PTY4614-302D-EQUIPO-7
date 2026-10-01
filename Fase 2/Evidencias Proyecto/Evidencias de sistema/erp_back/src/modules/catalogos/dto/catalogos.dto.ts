import { IsBoolean, IsIn, IsOptional, IsString, IsArray, IsInt, IsNumber, Min, Max, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  FichaContactoDto,
  FichaCuentaBancariaDto,
  FichaDireccionDto,
} from '../../ficha/ficha.dto';

export class UpsertMonedaDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiProperty() @IsString() simbolo: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() focoReporteria?: boolean;
}

export class UpsertUnidadMedidaDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
}

export class UpsertTipoDocumentoDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiProperty() @IsString() modulo: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
}

export class UpsertConceptoFlujoDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) orden?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
}

export class UpsertCodigoFinancieroDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
  @ApiPropertyOptional({ description: 'Concepto agrupador del flujo (ítem Excel)' })
  @Transform(({ value }) => {
    const v = value == null ? '' : String(value).trim();
    return v || null;
  })
  @IsOptional()
  @IsString()
  conceptoId?: string | null;
}

export class UpsertCentroCostoDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() vigenciaDesde?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vigenciaHasta?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactoEncargado?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() empresaId?: string;
}

export class ImportCentroCostoExcelItemDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
  @ApiPropertyOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  contactoEncargado?: string | null;
}

export class ImportCodigoFinancieroExcelItemDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
}

export class ImportCodigosFinancierosExcelDto {
  @ApiProperty({ type: [ImportCodigoFinancieroExcelItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportCodigoFinancieroExcelItemDto)
  items: ImportCodigoFinancieroExcelItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  archivoNombre?: string;
}

export class ImportCentrosCostoExcelDto {
  @ApiProperty({ type: [ImportCentroCostoExcelItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportCentroCostoExcelItemDto)
  items: ImportCentroCostoExcelItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  archivoNombre?: string;
}

export class UpdateSyncBcMetaDto {
  @ApiPropertyOptional({ enum: ['auto', 'manual'] })
  @IsOptional()
  @IsString()
  modo?: 'auto' | 'manual';
  @ApiPropertyOptional() @IsOptional() @IsString() horaProgramada?: string;
  @ApiPropertyOptional({ description: 'Cada N minutos; null = usar lista de horarios' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(5)
  @Max(720)
  frecuenciaMinutos?: number | null;
  @ApiPropertyOptional({ type: [String], description: 'Horas HH:mm (modo horarios)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  horarios?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() ventanaInicio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ventanaFin?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() diasHabiles?: boolean;
}

export class SyncIndicadoresBcDto {
  @ApiPropertyOptional({ description: 'Fecha YYYY-MM-DD (default hoy)' })
  @IsOptional()
  @IsString()
  fecha?: string;

  @ApiPropertyOptional({ description: 'Fecha desde para historial YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  desde?: string;

  @ApiPropertyOptional({ description: 'Fecha hasta YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  hasta?: string;
}

export class ImportIndicadorBcExcelItemDto {
  @ApiProperty({ description: 'YYYY-MM-DD' })
  @IsString()
  fecha: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  @Max(1_000_000)
  usd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  @Max(1_000_000)
  cny?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  @Max(1_000_000)
  eur?: number;
}

export class ImportIndicadoresBcExcelDto {
  @ApiProperty({ type: [ImportIndicadorBcExcelItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportIndicadorBcExcelItemDto)
  items: ImportIndicadorBcExcelItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  archivoNombre?: string;
}

export class UpsertProveedorDto {
  @ApiProperty() @IsString() rut: string;
  @ApiProperty() @IsString() @MaxLength(100) razonSocial: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) giro?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contacto?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() telefono?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
  @ApiPropertyOptional({ type: [FichaCuentaBancariaDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FichaCuentaBancariaDto)
  cuentasBancarias?: FichaCuentaBancariaDto[];
  @ApiPropertyOptional({ type: [FichaContactoDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FichaContactoDto)
  contactos?: FichaContactoDto[];
  @ApiPropertyOptional({ type: [FichaDireccionDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FichaDireccionDto)
  direcciones?: FichaDireccionDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() solicitadoPor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() solicitadoNota?: string;
  @ApiPropertyOptional({ description: 'Productor de fruta (lookup RUT D7)' })
  @IsOptional()
  @IsBoolean()
  esProductor?: boolean;
  @ApiPropertyOptional({
    description: 'Condición del NETO en el maestro: entero positivo de días (sugerido a la OC más adelante)',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(1)
  condicionPagoDias?: number | null;
  @ApiPropertyOptional({ description: 'Días para pagar el IVA. Presets de 10 en 10 o entero manual. Default 10.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  condicionIvaDia?: number;
  @ApiPropertyOptional({ description: 'Moneda de pago del proveedor (CLP, USD, CNY…). Default CLP.' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  monedaPago?: string;
}
