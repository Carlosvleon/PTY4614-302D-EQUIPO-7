import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class EstadoCuentaPorRutQueryDto {
  @ApiProperty({
    example: '768821104',
    description: 'RUT de la contraparte. Se normaliza (sin puntos ni guión).',
  })
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MinLength(3, { message: 'RUT inválido' })
  rut: string;

  @ApiPropertyOptional({ enum: ['PENDIENTE', 'HISTORICO', 'TODOS'] })
  @IsOptional()
  @Transform(({ value }) => {
    const v = String(value ?? '').trim().toUpperCase();
    return v || undefined;
  })
  @IsIn(['PENDIENTE', 'HISTORICO', 'TODOS'])
  filtro?: 'PENDIENTE' | 'HISTORICO' | 'TODOS';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  empresaId?: string;

  @ApiPropertyOptional({ example: '2026-08', description: 'Mes contable YYYY-MM (corte al último día).' })
  @IsOptional()
  @IsString()
  periodo?: string;
}
