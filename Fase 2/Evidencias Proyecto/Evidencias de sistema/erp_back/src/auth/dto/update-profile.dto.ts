import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty({ example: 'Admin Almahue' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre: string;
}
