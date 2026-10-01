import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetClaveReversaDto {
  @ApiProperty({ example: '4821', minLength: 4, description: 'Clave personal de reversa (por usuario)' })
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  clave: string;
}
