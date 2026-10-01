import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DistribucionCcDto {
  @ApiProperty() @IsString() centroCostoId: string;
  @ApiProperty() @IsString() centroCosto: string;
  @ApiProperty() @IsNumber() @Min(0) monto: number;
  @ApiProperty() @IsNumber() @Min(0) porcentaje: number;
}

export class LineaCompraDto {
  @ApiProperty() @IsString() descripcion: string;
  @ApiProperty() @IsNumber() @Min(0) cantidad: number;
  @ApiProperty() @IsNumber() @Min(0) precioUnitario: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) total?: number;
  /** Centro de costo del ítem (Reu5). */
  @ApiPropertyOptional() @IsOptional() @IsString() centroCostoId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() centroCosto?: string;
  /** Cuenta contable de la línea (reunión 23/09: cada ítem lleva cuenta y centro de costo). */
  @ApiPropertyOptional() @IsOptional() @IsString() cuentaContableId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cuentaContable?: string;
}

export class PreviewCadenaOcDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monto: number;

  @ApiPropertyOptional({ description: 'Código de moneda (CLP, USD, EUR, CNY). Si es extranjera, se convierte a CLP para evaluar la escala.' })
  @IsOptional()
  @IsString()
  moneda?: string;
}

export class UpsertOrdenCompraDto {
  @ApiPropertyOptional({ description: 'Si se omite, el sistema asigna correlativo OC-AAAA-NNNN' })
  @IsOptional()
  @IsString()
  numero?: string;
  @ApiProperty() @IsString() fecha: string;
  @ApiProperty() @IsString() proveedor: string;
  @ApiPropertyOptional() @IsOptional() @IsString() proveedorId?: string;
  @ApiProperty() @IsString() solicitante: string;
  @ApiPropertyOptional({ description: 'Usuario jefe aprobador (requerido para enviar a aprobación)' })
  @IsOptional()
  @IsString()
  aprobadorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() aprobadorNombre?: string;
  @ApiProperty() @IsString() moneda: string;
  @ApiProperty() @IsNumber() @Min(0) neto: number;
  @ApiProperty() @IsString() afacto: string;
  @ApiProperty() @IsString() estado: string;
  @ApiProperty() @IsString() departamento: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cuentaContableId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() centroCostoId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() elementoCostoId?: string;
  @ApiPropertyOptional({ type: [DistribucionCcDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DistribucionCcDto)
  distribucionCc?: DistribucionCcDto[];
  @ApiPropertyOptional({ type: [LineaCompraDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineaCompraDto)
  lineas?: LineaCompraDto[];
  @ApiPropertyOptional({ description: 'PIN de 4 dígitos (requerido si el rol aprueba con PIN)' })
  @IsOptional()
  @IsString()
  pinAprobacion?: string;
  @ApiPropertyOptional({ description: 'Tipo de documento de referencia (p. ej. COTIZACION). Opcional.' })
  @IsOptional()
  @IsString()
  referenciaTipo?: string;
  @ApiPropertyOptional({ description: 'Folio/número de la cotización u otro documento recibido' })
  @IsOptional()
  @IsString()
  referenciaFolio?: string;
  @ApiPropertyOptional({ description: 'Fecha del documento de referencia (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  referenciaFecha?: string;
  @ApiPropertyOptional({ description: 'Condición de pago editable: 30, 60 o 90 días. La factura hereda el vencimiento.' })
  @IsOptional()
  @IsInt()
  @IsIn([30, 60, 90])
  condicionPagoDias?: number;
  @ApiPropertyOptional({ description: 'updatedAt que vio el aprobador. Si la OC cambió, se rechaza la firma.' })
  @IsOptional()
  @IsString()
  updatedAtVisto?: string;
  @ApiPropertyOptional({
    description: 'Motivo del rechazo (obligatorio si estado=RECHAZADO, mín. 5 caracteres)',
  })
  @IsOptional()
  @IsString()
  motivoRechazo?: string;
}

export class UpsertRegistroCompraDto {
  @ApiProperty() @IsString() ocNumero: string;
  @ApiProperty() @IsString() factura: string;
  @ApiProperty() @IsString() proveedorOc: string;
  @ApiProperty() @IsString() proveedorFactura: string;
  @ApiPropertyOptional() @IsOptional() @IsString() proveedorId?: string;
  @ApiProperty() @IsNumber() @Min(0) monto: number;
  @ApiPropertyOptional() @IsOptional() @IsString() afactoOc?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() afactoFactura?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() afactoOk?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() estado?: string;
  @ApiPropertyOptional({ type: [LineaCompraDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineaCompraDto)
  lineas?: LineaCompraDto[];
}

export class CargaMasivaRegistroCompraItemDto {
  @ApiProperty() @IsString() ocNumero: string;
  @ApiProperty() @IsString() factura: string;
  @ApiProperty() @IsString() proveedorOc: string;
  @ApiProperty() @IsString() proveedorFactura: string;
  @ApiProperty() @IsNumber() @Min(0) monto: number;
  @ApiPropertyOptional() @IsOptional() @IsString() afactoOc?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() afactoFactura?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() exclude?: boolean;
}

export class CargaMasivaRegistrosCompraDto {
  @ApiProperty({ type: [CargaMasivaRegistroCompraItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CargaMasivaRegistroCompraItemDto)
  items: CargaMasivaRegistroCompraItemDto[];
}

export class UpsertRecepcionOcDto {
  @ApiProperty() @IsString() ocNumero: string;
  @ApiProperty() @IsString() fecha: string;
  @ApiProperty() @IsNumber() @Min(0) tcAplicado: number;
  @ApiProperty() @IsString() moneda: string;
  @ApiProperty() @IsNumber() @Min(0) monto: number;
  @ApiPropertyOptional() @IsOptional() @IsString() estado?: string;
  @ApiPropertyOptional({ type: [LineaCompraDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineaCompraDto)
  lineas?: LineaCompraDto[];
}

export class UpdateRecepcionOcDto {
  @ApiPropertyOptional() @IsOptional() @IsString() fecha?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) tcAplicado?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() moneda?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) monto?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() estado?: string;
}

/** Sincroniza el inbox de GoSocket (Document/GetDocument por ReceiverCode) para un periodo. */
export class SincronizarRegistrosCompraDto {
  @ApiProperty({ description: 'YYYY-MM-DD' }) @IsString() desde: string;
  @ApiProperty({ description: 'YYYY-MM-DD' }) @IsString() hasta: string;
}

/** Aceptación comercial GoSocket: Acuse de Recibo + Aceptación (eventos 30 → 33). */
export class AceptarRegistroCompraDto {
  @ApiPropertyOptional() @IsOptional() @IsString() comentario?: string;
}

/** Rechazo/reclamo comercial GoSocket: Acuse de Recibo + Reclamo (eventos 30 → 31). */
export class RechazarRegistroCompraDto {
  @ApiProperty({ description: 'Motivo del reclamo (obligatorio)' }) @IsString() comentario: string;
}
