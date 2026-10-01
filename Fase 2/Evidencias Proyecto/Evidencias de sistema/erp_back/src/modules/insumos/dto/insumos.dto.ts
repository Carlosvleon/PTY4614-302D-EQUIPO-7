import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpsertInsumoDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() familia: string;
  @ApiProperty() @IsString() subfamilia: string;
  @ApiProperty() @IsString() nombre: string;
  /** Detalle DTE (DscItem). Vacío = no se envía al facturador. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) detalle?: string;
  @ApiProperty() @IsString() unidad: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) stock?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) costoPromedio?: number;
  /** D16: piso de venta. 0 = sin cargar, la validación cae a costoPromedio. */
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) precioCompra?: number;
  /** Cuenta contable de centralización (D11). */
  @ApiPropertyOptional() @IsOptional() @IsString() cuentaContableId?: string;
  /** false = servicio / no mueve bodega en OV (H6). */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() inventariable?: boolean;
}

export class UpsertBodegaDto {
  @ApiProperty() @IsString() codigo: string;
  @ApiProperty() @IsString() nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
}

export class UpsertMovimientoBodegaDto {
  @ApiProperty() @IsString() fecha: string;
  @ApiProperty() @IsString() tipo: string;
  /** @deprecated Preferir bodegaId. Si se envía, debe ser el id de Bodega. */
  @ApiPropertyOptional() @IsOptional() @IsString() bodega?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bodegaId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bodegaDestino?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bodegaDestinoId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() articulo?: string;
  @ApiProperty() @IsNumber() @Min(0) cantidad: number;
  @ApiProperty() @IsNumber() @Min(0) precioUnitario: number;
  @ApiPropertyOptional() @IsOptional() @IsString() facturaRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nota?: string;
  @ApiProperty() @IsString() insumoId: string;
  @ApiPropertyOptional({ description: 'BORRADOR | CONFIRMADO | ANULADO' })
  @IsOptional()
  @IsString()
  estado?: string;
  /** Si true y tipo SALIDA_PROVEEDOR, crea el par DEVOLUCION automáticamente. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() generarPar?: boolean;
}
