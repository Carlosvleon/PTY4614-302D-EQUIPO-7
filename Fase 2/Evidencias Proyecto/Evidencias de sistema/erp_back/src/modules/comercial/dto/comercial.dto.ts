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
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  FichaContactoDto,
  FichaCuentaBancariaDto,
  FichaDireccionDto,
} from '../../ficha/ficha.dto';

export class UpsertClienteDto {
  @ApiProperty() @IsString() rut: string;
  @ApiProperty() @IsString() @MaxLength(100) razonSocial: string;
  @ApiProperty() @IsNumber() @Min(0) credito: number;
  @ApiProperty() @IsString() vendedor: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
  @ApiProperty({ description: 'Dirección fiscal (SII DirRecep, máx. 70)' })
  @IsString()
  @MinLength(3)
  @MaxLength(70)
  direccion: string;
  @ApiProperty({ description: 'Comuna (SII CmnaRecep, máx. 20)' })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  comuna: string;
  @ApiPropertyOptional({ description: 'Ciudad (SII CiudadRecep, máx. 20)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ciudad?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() telefono?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional({ description: 'NACIONAL | EXPORTACION' })
  @IsOptional()
  @IsString()
  tipoCliente?: string;
  @ApiPropertyOptional({ description: 'Giro receptor (SII GiroRecep, máx. 40)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  giro?: string;
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
}

export class UpsertProspectoDto {
  @ApiProperty() @IsString() nombre: string;
  @ApiProperty() @IsString() contacto: string;
  @ApiProperty() @IsString() origen: string;
  @ApiProperty() @IsString() estado: string;
  @ApiProperty() @IsString() fecha: string;
}

export class BodegaSplitDto {
  @ApiProperty() @IsString() bodegaId: string;
  @ApiProperty() @IsNumber() @Min(0) cantidad: number;
}

export class DocumentoLineaDto {
  @ApiProperty() @IsString() descripcion: string;
  /** Detalle DTE (DscItem). Vacío = no se envía al facturador. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) detalle?: string;
  @ApiProperty() @IsNumber() @Min(0) cantidad: number;
  @ApiProperty() @IsNumber() @Min(0) precioUnitario: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) descuentoPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) total?: number;
  /** Código producto COMEX / factura origen (ej. 003). */
  @ApiPropertyOptional() @IsOptional() @IsString() codigoProducto?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unidadMedida?: string;
  @ApiPropertyOptional({ description: 'PRODUCTO | SERVICIO | FLETE' })
  @IsOptional()
  @IsString()
  tipoLinea?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() insumoId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bodegaId?: string;
  @ApiPropertyOptional({ type: [BodegaSplitDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BodegaSplitDto)
  splits?: BodegaSplitDto[];
  /** Imputación contable por línea (Reu4 V4). */
  @ApiPropertyOptional() @IsOptional() @IsString() cuentaContableId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() centroCostoId?: string;
}

export class UpsertDocumentoDto {
  @ApiProperty() @IsString() folio: string;
  @ApiProperty({ enum: ['FACTURA', 'NC', 'ND', 'GUIA', 'ORDEN_VENTA'] })
  @IsIn(['FACTURA', 'NC', 'ND', 'GUIA', 'ORDEN_VENTA'])
  tipo: string;
  @ApiProperty() @IsString() cliente: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clienteId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() proveedorId?: string;
  @ApiProperty() @IsString() fecha: string;
  @ApiProperty() @IsNumber() @Min(0) neto: number;
  @ApiPropertyOptional({ description: 'IVA real del documento (P1-7); si se omite se calcula 19% del neto salvo EXPORTACION' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  iva?: number;
  @ApiPropertyOptional({ type: [DocumentoLineaDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentoLineaDto)
  lineas?: DocumentoLineaDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() estado?: string;
  /** NC/ND: id o folio de FACTURA/NC/ND/GUIA en el ERP. Si no está, use referenciaTipo/Folio/Fecha/Cod. */
  @ApiPropertyOptional() @IsOptional() @IsString() folioOrigen?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() documentoOrigenId?: string;
  /** Referencia del wizard de emisión (801/802/HES…), distinta de folioOrigen de NC. */
  @ApiPropertyOptional() @IsOptional() @IsString() referenciaTipo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenciaFolio?: string;
  @ApiPropertyOptional({ description: 'CodRef SII: 1 anula, 2 corrige texto, 3 corrige montos' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3])
  referenciaCod?: 1 | 2 | 3;
  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() formaPago?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fechaVencimiento?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() indicadorVenta?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) descuentoGlobalPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cuentaContableId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() centroCostoId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() receptorRut?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() receptorGiro?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() receptorDireccion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() receptorComuna?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() receptorCiudad?: string;
  /** COMEX / DTE export (manual MJ). */
  @ApiPropertyOptional() @IsOptional() @IsString() monedaCodigo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tpoMoneda?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) tipoCambio?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() paisRecepCodigo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paisDestino?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() puertoEmbarque?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() puertoDesembarque?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clausulaVenta?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() viaTransporte?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() modalidadVenta?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() indTraslado?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bultoTipoCodigo?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) bultoCantidad?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() bultoMarca?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) montoOtraMoneda?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) montoExentoOtraMoneda?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() referenciaFecha?: string;
}

export class ContabilizarDocumentoDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cuentaContableId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() centroCostoId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() glosa?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cliente?: string;
  @ApiPropertyOptional({ type: [DocumentoLineaDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentoLineaDto)
  lineas?: DocumentoLineaDto[];
}

/** Solo imputación de OV CONFIRMADA (no emite ni contabiliza). */
export class ImputacionDocumentoDto {
  @ApiProperty() @IsString() @MinLength(1) cuentaContableId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() centroCostoId?: string;
}

export class CargaMasivaDocumentoItemDto {
  @ApiProperty() @IsString() folio: string;
  @ApiProperty({ enum: ['FACTURA', 'NC', 'ND', 'GUIA', 'ORDEN_VENTA'] })
  @IsIn(['FACTURA', 'NC', 'ND', 'GUIA', 'ORDEN_VENTA'])
  tipo: string;
  @ApiProperty() @IsString() cliente: string;
  @ApiProperty() @IsString() fecha: string;
  @ApiProperty() @IsNumber() @Min(0) neto: number;
  @ApiPropertyOptional() @IsOptional() @IsString() estado?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() exclude?: boolean;
}

export class CargaMasivaDocumentosDto {
  @ApiProperty({ type: [CargaMasivaDocumentoItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CargaMasivaDocumentoItemDto)
  items: CargaMasivaDocumentoItemDto[];
}

export class UpsertGuiaDespachoDto {
  @ApiProperty() @IsString() folio: string;
  @ApiProperty() @IsString() cliente: string;
  @ApiProperty() @IsString() fecha: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) monto?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() estado?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() documentoComercialId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() glosa?: string;
}

export class ConvertirDocumentoDto {
  @ApiProperty({ description: 'Tipo destino: FACTURA (solo desde OV confirmada)' })
  @IsIn(['FACTURA'])
  tipoDestino: string;

  @ApiPropertyOptional() @IsOptional() @IsString() folioNuevo?: string;
}

