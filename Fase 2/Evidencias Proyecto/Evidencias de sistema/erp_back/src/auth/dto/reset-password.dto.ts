import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token recibido por correo o enlace de recuperación' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'nuevaClave123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}
