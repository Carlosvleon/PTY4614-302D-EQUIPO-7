import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class SyncIndicadoresDto {
  @ApiPropertyOptional({
    example: '2026-09-01',
    description: 'Fecha de inicio para la consulta (formato YYYY-MM-DD). Si no se especifica, toma los últimos 7 días.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe tener formato YYYY-MM-DD' })
  desde?: string;

  @ApiPropertyOptional({
    example: '2026-09-24',
    description: 'Fecha final para la consulta (formato YYYY-MM-DD). Por defecto la fecha de hoy.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hasta debe tener formato YYYY-MM-DD' })
  hasta?: string;
}

export class FiltroIndicadoresDto {
  @ApiPropertyOptional({ example: '2026-09-01', description: 'Filtrar desde fecha YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  desde?: string;

  @ApiPropertyOptional({ example: '2026-09-24', description: 'Filtrar hasta fecha YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  hasta?: string;

  @ApiPropertyOptional({ example: 'USD', description: 'Filtrar por código de moneda' })
  @IsOptional()
  @IsString()
  monedaCodigo?: string;

  @ApiPropertyOptional({ example: 'detalle', description: 'Formato de respuesta: "detalle" o "resumen"' })
  @IsOptional()
  @IsString()
  formato?: string;
}

export class UpdateConfigSyncDto {
  @ApiPropertyOptional({ example: true, description: 'Habilitar o pausar la sincronización automática diaria' })
  @IsOptional()
  syncAutomatica?: boolean;

  @ApiPropertyOptional({ example: ['09:00', '14:00'], description: 'Horas programadas para sincronización (formato HH:mm)' })
  @IsOptional()
  horas?: string[];

  @ApiPropertyOptional({ example: 60, description: 'Intervalo en minutos si se utiliza programación periódica' })
  @IsOptional()
  intervaloMinutos?: number;

  @ApiPropertyOptional({ example: true, description: 'Sincronizar únicamente en días hábiles (lunes a viernes)' })
  @IsOptional()
  soloDiasHabiles?: boolean;
}
