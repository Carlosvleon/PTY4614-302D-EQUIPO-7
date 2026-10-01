import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertContratistaDto {
  @ApiProperty() @IsString() rut: string;
  @ApiProperty() @IsString() razonSocial: string;
  @ApiPropertyOptional({ description: 'Legacy; ya no se usa en UI de contratistas' })
  @IsOptional()
  @IsString()
  especialidad?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() direccion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ciudad?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comuna?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() telefono1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() telefono2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() representanteLegal?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rutRepresentante?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tipoPago?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() proveedorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() vigenciaHasta?: string;
  @ApiPropertyOptional({ description: 'Solo Super Admin' })
  @IsOptional()
  @IsString()
  empresaId?: string;
}

export class UpsertTarifaDto {
  @ApiProperty() @IsString() contratistaId: string;
  @ApiProperty() @IsString() laborId: string;
  @ApiProperty() @IsString() actividadId: string;
  @ApiProperty() @IsNumber() @IsPositive() tarifa: number;
  @ApiProperty() @IsString() unidad: string;
  @ApiProperty() @IsString() centroCostoId: string;
  @ApiProperty() @IsString() tipoContratoId: string;
  @ApiProperty() @IsString() vigenciaDesde: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vigenciaHasta?: string;
}

export class UpsertTipoContratoContratistaDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiProperty() @IsString() cuentaDebeId: string;
  @ApiProperty() @IsString() cuentaHaberId: string;
  @ApiProperty() @IsString() cuentaAdministracionId: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
}

export class UpsertCentroCostoDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() vigenciaDesde?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vigenciaHasta?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() empresaId?: string;
}

export class UpsertLaborDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() empresaId?: string;
}

export class UpsertActividadDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() empresaId?: string;
}

export class LinkLaborActividadDto {
  @ApiProperty() @IsString() laborId: string;
  @ApiProperty() @IsString() actividadId: string;
}

export class UpsertProformaDto {
  @ApiPropertyOptional({ description: 'Si se omite al crear, se asigna PF-00001 correlativo por empresa' })
  @IsOptional()
  @IsString()
  numero?: string;
  @ApiProperty() @IsString() contratistaId: string;
  @ApiProperty() @IsString() tipoContratoId: string;
  @ApiProperty() @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) periodo: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() montoNeto?: number;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  ingresoIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['CLP', 'USD', 'EUR', 'CNY']) moneda?: string;
}

export class AsociarFacturaProformaDto {
  @ApiPropertyOptional({ description: 'Referencia opcional del documento del proveedor (folio factura)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  numero?: string;
  @ApiProperty() @IsString() fecha: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() montoNeto?: number;
  /** N:1 — IDs adicionales de proformas a asociar a la misma factura (incluye o no el :id de la ruta). */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  proformaIds?: string[];
  /** Enlazar registro de compra ya existente (sin generar OC). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registroCompraId?: string;
}

export class ReversarProformaDto {
  @ApiProperty({ description: 'Clave personal de reversa (Mi Perfil)' })
  @IsString()
  @MinLength(4)
  claveReversa: string;
}

export class SolicitarAprobacionProformaDto {
  @ApiProperty({ description: 'Supervisor que debe autorizar' })
  @IsString()
  aprobadorId: string;
}

export class AprobarIngresoLaborDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observacion?: string;
}

export class ReemitirProformaDto {
  @ApiProperty() @IsString() @MinLength(1) numeroNuevo: string;
  @ApiProperty({ minLength: 5 }) @IsString() @MinLength(5) motivo: string;
}

export class UpsertIngresoLaborDiarioDto {
  @ApiProperty() @IsString() fecha: string;
  @ApiProperty() @IsString() contratistaId: string;
  @ApiProperty() @IsString() centroCostoId: string;
  @ApiProperty() @IsString() laborId: string;
  @ApiProperty() @IsString() actividadId: string;
  @ApiProperty() @IsString() @IsIn(['JORNADA', 'TRATO']) tipoJornada: string;
  @ApiProperty() @IsNumber() @IsPositive() cantidad: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) precioUnitario?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(5) motivoOverride?: string;
  @ApiPropertyOptional({ description: 'Obligatorio si no hay tarifario vigente' })
  @IsOptional()
  @IsString()
  tipoContratoId?: string;
  @ApiPropertyOptional({ description: 'Supervisor; si se informa queda PENDIENTE_APROBACION hasta autorizar' })
  @IsOptional()
  @IsString()
  aprobadorId?: string;
}

export class AsociarIngresosProformaDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  ingresoIds: string[];

  @ApiProperty() @IsString() proformaId: string;
}

export class PatchTarifaInlineDto {
  @ApiProperty() @IsNumber() @IsPositive() tarifa: number;
  @ApiPropertyOptional() @IsOptional() @IsString() vigenciaDesde?: string;
}

export class TraspasoCierreDto {
  @ApiProperty() @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) periodo: string;
  @ApiPropertyOptional() @IsOptional() @IsString() glosa?: string;
  /** Tipo de cambio centralizado del mes (D9). */
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() tipoCambio?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['USD', 'EUR', 'CNY']) monedaTc?: string;
}

export class ReabrirCierreContratistaDto {
  @ApiProperty({ minLength: 5 })
  @IsString()
  @MinLength(5)
  motivo: string;
}
