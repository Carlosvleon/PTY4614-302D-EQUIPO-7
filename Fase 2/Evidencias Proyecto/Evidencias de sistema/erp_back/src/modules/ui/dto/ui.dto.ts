import { ArrayMinSize, IsArray, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpsertTablePreferenceDto {
  @ApiProperty({ type: [String], description: 'Keys de columnas visibles' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  visibleColumns: string[];

  @ApiProperty({ type: [String], description: 'Orden de columnas (incluye ocultas)' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  columnOrder: string[];
}

export class TableKeyParamDto {
  @ApiProperty({ example: 'admin.usuarios' })
  @IsString()
  @MaxLength(120)
  tableKey: string;
}
