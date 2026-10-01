import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class CreateMonedaDto {
  @ApiProperty({ example: 'USD', description: 'Código ISO de la moneda' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 10)
  codigo: string;

  @ApiProperty({ example: 'Dólar Observado', description: 'Nombre descriptivo de la moneda' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ example: '$', description: 'Símbolo gráfico de la moneda' })
  @IsString()
  @IsNotEmpty()
  simbolo: string;

  @ApiPropertyOptional({
    example: 'F073.TCO.PRE.Z.D',
    description: 'Código de serie oficial del Banco Central de Chile',
  })
  @IsString()
  @IsOptional()
  codigoSerieBCCH?: string;

  @ApiPropertyOptional({ default: false, description: 'Indica si es la moneda nacional/base (CLP)' })
  @IsBoolean()
  @IsOptional()
  esMonedaNacional?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Estado activo de la moneda en la empresa' })
  @IsBoolean()
  @IsOptional()
  activa?: boolean;

  @ApiPropertyOptional({
    default: true,
    description: 'Habilitar sincronización automática con el Banco Central',
  })
  @IsBoolean()
  @IsOptional()
  sincronizarBCCH?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Foco en reportería y filtros contables (CLP, USD, EUR, CNY)',
  })
  @IsBoolean()
  @IsOptional()
  focoReporteria?: boolean;
}
