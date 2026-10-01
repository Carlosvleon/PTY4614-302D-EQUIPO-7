import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertCuentaDto {
  @ApiProperty({ example: '1-1-01-01' }) @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiProperty({ example: 'ACTIVO' }) @IsString() tipo: string;
  @ApiPropertyOptional({ description: '1–5 (Excel Agrosoft usa hasta 5)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  nivel?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() padreId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() codigoExcel?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiereCc?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiereArea?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiereEspecie?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiereElemento?: boolean;
  @ApiPropertyOptional({ description: 'true = agrupación; false = imputable' })
  @IsOptional()
  @IsBoolean()
  noImputable?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true })
  centroCostoIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true })
  elementoCostoIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true })
  areaNegocioIds?: string[];
}

export class UpdateCuentaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() codigo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tipo?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) nivel?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() padreId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() codigoExcel?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiereCc?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiereArea?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiereEspecie?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiereElemento?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() noImputable?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true })
  centroCostoIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true })
  elementoCostoIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true })
  areaNegocioIds?: string[];
}

export class CreateCategoriaDto {
  @ApiProperty({ description: 'Primer dígito 1–8 → código X-0-00-00', example: 1 })
  @IsInt()
  @Min(1)
  @Max(8)
  digito: number;

  @ApiProperty() @IsString() nombre: string;

  @ApiPropertyOptional({ example: 'ACTIVO' })
  @IsOptional()
  @IsString()
  tipo?: string;
}

export class BulkCuentaItemDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiProperty() @IsString() tipo: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) nivel?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() padreCodigo?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() codigoExcel?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiereCc?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiereArea?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiereEspecie?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiereElemento?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() noImputable?: boolean;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  centroCostoCodigos?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  elementoCostoCodigos?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areaNegocioCodigos?: string[];
}

export class BulkCuentasDto {
  @ApiProperty({ type: [BulkCuentaItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkCuentaItemDto)
  items: BulkCuentaItemDto[];

  @ApiPropertyOptional({ description: 'Si true, elimina el plan de la empresa antes de cargar' })
  @IsOptional()
  @IsBoolean()
  replace?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  actualizarAnidacion?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  aplicarFlags?: boolean;

  @ApiPropertyOptional({ enum: ['conservar', 'quitar_si_flag_off', 'arrastrar_padre', 'desde_excel'] })
  @IsOptional()
  @IsIn(['conservar', 'quitar_si_flag_off', 'arrastrar_padre', 'desde_excel'])
  vinculos?: 'conservar' | 'quitar_si_flag_off' | 'arrastrar_padre' | 'desde_excel';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  archivoNombre?: string;
}

export class UpsertAreaNegocioDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
}

export class UpsertElementoCostoDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiProperty() @IsString() departamento: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vigencia?: string;
}

export class ImportElementoCostoExcelItemDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departamento?: string;
}

export class ImportElementosCostoExcelDto {
  @ApiProperty({ type: [ImportElementoCostoExcelItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportElementoCostoExcelItemDto)
  items: ImportElementoCostoExcelItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  archivoNombre?: string;
}

export class UpsertFactorHonorarioDto {
  @ApiProperty() @IsNumber() @Min(0) factorAnterior: number;
  @ApiProperty() @IsNumber() @Min(0) factorNuevo: number;
  @ApiProperty() @IsString() vigenciaDesde: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vigenciaHasta?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() usuario?: string;
}

export class LineaAsientoDto {
  @ApiProperty() @IsNumber() @Min(0) debe: number;
  @ApiProperty() @IsNumber() @Min(0) haber: number;
  @ApiProperty({ description: 'Cuenta contable obligatoria (P0-1)' }) @IsString() cuentaId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() glosa?: string;
  @ApiPropertyOptional({ description: 'Centro de costo asociado a la línea (K-01)' })
  @IsOptional()
  @IsString()
  centroCostoId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() areaNegocioId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() elementoCostoId?: string;
  @ApiPropertyOptional({ description: 'Moneda de la línea (CLP por defecto)', example: 'CLP' })
  @IsOptional()
  @IsString()
  moneda?: string;
  @ApiPropertyOptional({ description: 'Tipo de cambio del día si moneda ≠ CLP (K-04)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tipoCambio?: number;
}

export class CreateAsientoDto {
  @ApiProperty() @IsString() glosa: string;
  @ApiPropertyOptional() @IsOptional() @IsString() origen?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fecha?: string;
  @ApiPropertyOptional({ description: 'Periodo contable aaaa-mm' })
  @IsOptional()
  @IsString()
  periodo?: string;
  @ApiPropertyOptional({ example: 'MANUAL' })
  @IsOptional()
  @IsString()
  tipo?: string;
  @ApiPropertyOptional({ description: 'BORRADOR | CONTABILIZADO | ANULADO' })
  @IsOptional()
  @IsString()
  estado?: string;
  @ApiPropertyOptional({ description: 'Número manual; si omite se auto-genera' })
  @IsOptional()
  @IsString()
  numero?: string;
  @ApiProperty({ type: [LineaAsientoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineaAsientoDto)
  lineas: LineaAsientoDto[];
}

export class BulkAsientosDto {
  @ApiProperty({ type: [CreateAsientoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAsientoDto)
  items: CreateAsientoDto[];
}

export class CreatePeriodoContableDto {
  @ApiProperty({ example: '2026-07', description: 'Código aaaa-mm' })
  @IsString()
  codigo: string;

  @ApiPropertyOptional() @IsOptional() @IsString() fechaDesde?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fechaHasta?: string;
  @ApiPropertyOptional({ description: 'Marcar como periodo activo de la empresa' })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdatePeriodoContableDto {
  @ApiPropertyOptional({ enum: ['ABIERTO', 'CERRADO'] })
  @IsOptional()
  @IsString()
  estado?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() fechaDesde?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fechaHasta?: string;
}

export class AbrirPeriodoContableDto {
  @ApiPropertyOptional({ description: 'Obligatorio al reabrir un periodo cerrado (Reu5)' })
  @IsOptional()
  @IsString()
  motivo?: string;
}

export class ConfigContableSiiItemDto {
  @ApiProperty({ example: '33' }) @IsString() tipoDocumentoSii: string;
  @ApiPropertyOptional({ example: '33' }) @IsOptional() @IsString() codigoSii?: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiProperty() @IsString() cuentaContableId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() centroCostoId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() areaNegocioId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() elementoCostoId?: string | null;
  @ApiPropertyOptional({ example: 'DEBE' }) @IsOptional() @IsString() lado?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
}

export class UpsertConfigContableSiiDto {
  @ApiProperty({ type: [ConfigContableSiiItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfigContableSiiItemDto)
  items: ConfigContableSiiItemDto[];
}

export class CentralizacionDto {
  @ApiProperty({ example: '2026-07' }) @IsString() periodo: string;
  @ApiPropertyOptional({
    description: 'Orígenes a centralizar',
    example: ['ventas', 'compras', 'contratistas', 'bodega'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  origenes?: string[];

  @ApiPropertyOptional({ description: 'Tipo de cambio del periodo (contratistas)' })
  @IsOptional()
  @IsNumber()
  tipoCambio?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  monedaTc?: string;
}

export class UpsertPresupuestoDto {
  @ApiProperty() @IsNumber() anio: number;
  @ApiProperty() @IsString() centroCosto: string;
  @ApiProperty() @IsNumber() @Min(0) montoPresupuestado: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) montoEjecutado?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() estado?: string;
}
