import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class FichaCuentaBancariaDto {
  @ApiProperty() @IsString() banco: string;
  @ApiProperty() @IsString() tipoCuenta: string;
  @ApiProperty() @IsString() numero: string;
  @ApiPropertyOptional() @IsOptional() @IsString() monedaCodigo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() titular?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rutTitular?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() principal?: boolean;
}

export class FichaContactoDto {
  @ApiProperty() @IsString() nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cargo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() telefono?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() principal?: boolean;
}

export class FichaDireccionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tipo?: string;
  @ApiProperty() @IsString() @MaxLength(70) linea: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) comuna?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) ciudad?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() principal?: boolean;
}

export class FichaNestedDto {
  @ApiPropertyOptional({ type: [FichaCuentaBancariaDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FichaCuentaBancariaDto)
  cuentasBancarias?: FichaCuentaBancariaDto[];

  @ApiPropertyOptional({ type: [FichaContactoDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FichaContactoDto)
  contactos?: FichaContactoDto[];

  @ApiPropertyOptional({ type: [FichaDireccionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FichaDireccionDto)
  direcciones?: FichaDireccionDto[];
}
