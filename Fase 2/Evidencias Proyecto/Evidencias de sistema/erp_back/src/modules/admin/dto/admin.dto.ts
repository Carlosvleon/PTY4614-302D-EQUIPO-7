import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsEmail,
  IsIn,
  IsNumber,
  IsInt,
  IsNotEmpty,
  IsDateString,
  Min,
  Max,
  MinLength,
  MaxLength,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsRutChileno } from '../rut-chileno.util';

function emptyToNull(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
  return typeof value === 'string' ? value.trim() : value;
}

export class PlantillaDocColumnsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() folio?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() contraparte?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() fecha?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() neto?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() estado?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() extra?: boolean;
}

export class PlantillaDocDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showLogo?: boolean;
  /** El timbre lo pone GoSocket. Se acepta para no rechazar plantillas ya guardadas. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showSello?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showAddress?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showFooter?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) footerText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) watermarkText?: string;
  @ApiPropertyOptional() @IsOptional() watermarkOpacity?: number;
  @ApiPropertyOptional({ type: PlantillaDocColumnsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlantillaDocColumnsDto)
  columns?: PlantillaDocColumnsDto;
  @ApiPropertyOptional({ description: 'Color de marca (hex) para títulos y bordes' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  colorPrimario?: string;
  @ApiPropertyOptional({ description: 'Color de acento secundario (hex)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  colorSecundario?: string;
  @ApiPropertyOptional({ enum: ['serif', 'sans'] })
  @IsOptional()
  @IsIn(['serif', 'sans'])
  fontFamily?: 'serif' | 'sans';
  @ApiPropertyOptional({ enum: ['izquierda', 'centro', 'derecha'] })
  @IsOptional()
  @IsIn(['izquierda', 'centro', 'derecha'])
  logoPosicion?: 'izquierda' | 'centro' | 'derecha';
  @ApiPropertyOptional({ enum: ['S', 'M', 'L'] })
  @IsOptional()
  @IsIn(['S', 'M', 'L'])
  logoTamano?: 'S' | 'M' | 'L';
  @ApiPropertyOptional({ enum: ['S', 'M', 'L'] })
  @IsOptional()
  @IsIn(['S', 'M', 'L'])
  fontSize?: 'S' | 'M' | 'L';
  @ApiPropertyOptional() @IsOptional() @IsBoolean() colCodigo?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() colUnidad?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() colDescuento?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showMontoLetras?: boolean;
  @ApiPropertyOptional({ enum: ['clasico', 'moderno'] })
  @IsOptional()
  @IsIn(['clasico', 'moderno'])
  estiloTabla?: 'clasico' | 'moderno';
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showTerminos?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) terminosPago?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) datosBancarios?: string;
}

export class UpsertEmpresaDto {
  @ApiProperty() @IsString() @MaxLength(100) razonSocial: string;
  @ApiProperty() @IsString() @MaxLength(16) rut: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) giro?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(60)
  direccion?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) comuna?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) ciudad?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) telefono?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    const trimmed = emptyToNull(value);
    return typeof trimmed === 'string' ? trimmed.toLowerCase() : trimmed;
  })
  @ValidateIf((_, v) => v != null)
  @IsEmail({}, { message: 'Mail contacto inválido' })
  @MaxLength(120)
  emailContacto?: string | null;
  @ApiPropertyOptional({ description: 'Nombre del representante legal' })
  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(120)
  representanteLegalNombre?: string | null;
  @ApiPropertyOptional({ description: 'RUT del representante legal' })
  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(16)
  @IsRutChileno()
  representanteLegalRut?: string | null;
  @ApiPropertyOptional({ description: 'Mail de contacto del representante legal' })
  @IsOptional()
  @Transform(({ value }) => {
    const trimmed = emptyToNull(value);
    return typeof trimmed === 'string' ? trimmed.toLowerCase() : trimmed;
  })
  @ValidateIf((_, v) => v != null)
  @IsEmail({}, { message: 'Mail del representante legal inválido' })
  @MaxLength(120)
  representanteLegalEmail?: string | null;
  @ApiPropertyOptional({ description: 'Teléfono de contacto del representante legal' })
  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(40)
  representanteLegalTelefono?: string | null;
  @ApiPropertyOptional({ description: 'URL o data-URL del logo' })
  @IsOptional()
  @IsString()
  logoUrl?: string;
  @ApiPropertyOptional({ description: 'URL o data-URL del sello / marca de agua imagen' })
  @IsOptional()
  @IsString()
  selloUrl?: string;
  @ApiPropertyOptional({ type: PlantillaDocDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlantillaDocDto)
  plantillaDoc?: PlantillaDocDto;
  /** Días sin reclamo para aceptación automática de factura de compra (no aprueba la OC). */
  @ApiPropertyOptional({ description: 'Días para aceptación comercial automática (default 8)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  aceptacionCompraPlazoDias?: number;
  /** UUID BillerID GoSocket de esta sociedad (JSON Body SendDocumentToAuthority). */
  @ApiPropertyOptional({ description: 'UUID BillerID GoSocket (portal) de esta sociedad' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
    return typeof value === 'string' ? value.trim() : value;
  })
  @ValidateIf((_, v) => v != null)
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'gosocketBillerId debe ser un UUID',
  })
  gosocketBillerId?: string | null;
  /** N° resolución SII/QA (CAE). Distinto por sociedad. */
  @ApiPropertyOptional({ description: 'Número de resolución SII/QA para CAE GUF' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
    return typeof value === 'string' ? value.trim() : String(value);
  })
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(20)
  gosocketNroResolucion?: string | null;
  /** Fecha resolución SII/QA YYYY-MM-DD. */
  @ApiPropertyOptional({ description: 'Fecha de resolución SII/QA (YYYY-MM-DD)' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
    return typeof value === 'string' ? value.trim() : value;
  })
  @ValidateIf((_, v) => v != null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'gosocketFechaResolucion debe ser YYYY-MM-DD',
  })
  gosocketFechaResolucion?: string | null;
  /** Código de actividad SII (Acteco, 6 dígitos). */
  @ApiPropertyOptional({ description: 'Acteco SII de 6 dígitos (formato DTE 2.5)' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
    return typeof value === 'string' ? value.trim() : String(value);
  })
  @ValidateIf((_, v) => v != null)
  @Matches(/^\d{6}$/, {
    message: 'gosocketActeco debe ser 6 dígitos',
  })
  gosocketActeco?: string | null;
}

export class UpsertUsuarioDto {
  @ApiProperty() @IsString() @MaxLength(120) nombre: string;
  @ApiProperty() @IsEmail() @MaxLength(254) email: string;
  @ApiProperty() @IsString() rolId: string;
  /** Empresa primaria (también debe estar en empresaIds). */
  @ApiProperty() @IsString() empresaId: string;
  /** Empresas a las que puede acceder (1 o más). Si se omite, solo empresaId. */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  empresaIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
  @ApiPropertyOptional({
    description: 'Inicio vigencia del rol (YYYY-MM-DD). Vacío = sin límite.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString()
  rolVigenciaDesde?: string;
  @ApiPropertyOptional({
    description: 'Fin vigencia del rol (YYYY-MM-DD). Vacío = sin límite.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString()
  rolVigenciaHasta?: string;
  @ApiPropertyOptional({
    description: 'Contraseña en claro (obligatoria al crear; opcional al actualizar)',
    minLength: 6,
    maxLength: 128,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password?: string;
  @ApiPropertyOptional({ description: 'ID del jefe directo (organigrama aprobaciones)' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  )
  @IsString()
  jefeId?: string | null;
  @ApiPropertyOptional({
    description: 'Tope individual de aprobación (CLP). Vacío = sin límite.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  montoMaxAprobacion?: number | null;
}

export class PermisoPantallaDto {
  @ApiProperty() @IsString() pantalla: string;
  @ApiProperty() @IsBoolean() lectura: boolean;
  @ApiProperty() @IsBoolean() escritura: boolean;
}

export class UpsertRolDto {
  @ApiProperty() @IsString() @MaxLength(120) nombre: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  permisos: string[];
  @ApiPropertyOptional({ type: [PermisoPantallaDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermisoPantallaDto)
  permisosPantalla?: PermisoPantallaDto[];
  @ApiPropertyOptional({
    description: 'Si true, aprobar/rechazar exige PIN de 4 dígitos del usuario',
  })
  @IsOptional()
  @IsBoolean()
  aprobarConPin?: boolean;
}

export class ReasignacionUsuarioRolDto {
  @ApiProperty() @IsString() usuarioId: string;
  @ApiProperty() @IsString() nuevoRolId: string;
}

export class DeleteRolDto {
  @ApiProperty({
    type: [ReasignacionUsuarioRolDto],
    description: 'Usuarios del rol eliminado y el rol de destino de cada uno',
  })
  @IsArray()
  reasignaciones: ReasignacionUsuarioRolDto[];
}

export class UpsertWorkflowDto {
  @ApiProperty() @IsString() @MaxLength(120) nombre: string;
  @ApiProperty({ description: 'Módulo: Compras | …' })
  @IsString()
  @MaxLength(80)
  modulo: string;
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  montoMin: number;
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  montoMax: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  aprobadores?: number;
  @ApiPropertyOptional({ type: [String], description: 'IDs de usuarios aprobadores' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aprobadorIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
}

export class UpsertDelegacionAprobacionDto {
  @ApiProperty({ description: 'Usuario titular (quien normalmente aprueba)' })
  @IsString()
  titularId: string;

  @ApiProperty({ description: 'Suplente durante vacaciones / licencia' })
  @IsString()
  suplenteId: string;

  @ApiPropertyOptional({ description: 'Compras | null = todos' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  modulo?: string | null;

  @ApiProperty({ description: 'Inicio vigencia (ISO date)' })
  @IsDateString()
  vigenciaDesde: string;

  @ApiPropertyOptional({ description: 'Fin vigencia (ISO date); null = indefinido' })
  @IsOptional()
  @IsDateString()
  vigenciaHasta?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  motivo?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpsertGrupoAprobacionDto {
  @ApiProperty() @IsString() @MaxLength(120) nombre: string;
  @ApiProperty({ description: 'Compras' })
  @IsString()
  @MaxLength(80)
  modulo: string;
  @ApiProperty({ description: 'Aprobador final del grupo (cierre de cadena; también es la entrada si no hay intermedios)' })
  @IsString()
  aprobadorInicialId: string;
  @ApiPropertyOptional({ type: [String], description: 'IDs de usuarios miembros' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  miembroIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
}

export class UpsertNodoEscalaAprobacionDto {
  @ApiProperty({ description: 'Grupo dueño de la escala (obligatorio)' })
  @IsString()
  grupoId: string;
  @ApiProperty({ description: 'Compras' })
  @IsString()
  @MaxLength(80)
  modulo: string;
  @ApiProperty({ description: 'Usuario aprobador del nodo' })
  @IsString()
  usuarioId: string;
  @ApiPropertyOptional({ description: 'Tope CLP; null = sin tope' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  montoMax?: number | null;
  @ApiPropertyOptional({ description: 'Siguiente nodo si supera tope' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  )
  @IsString()
  escalaAUsuarioId?: string | null;
  @ApiPropertyOptional({ description: 'Lógica multi-aprobador: SIMPLE | AND | OR' })
  @IsOptional()
  @IsIn(['SIMPLE', 'AND', 'OR'])
  logica?: 'SIMPLE' | 'AND' | 'OR';
  @ApiPropertyOptional({ description: 'Aprobadores adicionales (AND/OR), además de usuarioId' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aprobadoresExtra?: string[];
  /** Si se indica, inserta en la cadena después de este usuario (sin mover la entrada del grupo). */
  @ApiPropertyOptional({ description: 'Insertar después de este usuario en la cadena existente' })
  @IsOptional()
  @IsString()
  insertAfterUsuarioId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
  /** Confirma reasignación de pendientes al cambiar/quitar el aprobador. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  confirmarReasignacion?: boolean;
  /** Destino de pendientes PENDIENTE al confirmar. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nuevoAprobadorId?: string | null;
}

export class ReasignacionPendientesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  confirmarReasignacion?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nuevoAprobadorId?: string | null;
}

export class UpsertAdminConceptoDto {
  @ApiProperty({ description: 'Usuario que será administrador del módulo' })
  @IsString()
  @IsNotEmpty()
  usuarioId: string;

  @ApiProperty({ description: 'Módulo administrado: Compras' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  modulo: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class SimularAprobacionDto {
  @ApiProperty({ description: 'Compras' })
  @IsString()
  @MaxLength(80)
  modulo: string;
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monto: number;
  @ApiPropertyOptional({ description: 'Simular como este usuario (resuelve grupo)' })
  @IsOptional()
  @IsString()
  usuarioId?: string;
  @ApiPropertyOptional({ description: 'Simular con este grupo directamente' })
  @IsOptional()
  @IsString()
  grupoId?: string;
}

export class ValidarBandejaAprobadoresDto {
  @ApiProperty({ description: 'Compras' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  modulo: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  usuarioIds: string[];

  @ApiPropertyOptional({ enum: ['read', 'write'], default: 'write' })
  @IsOptional()
  @IsIn(['read', 'write'])
  mode?: 'read' | 'write';
}
