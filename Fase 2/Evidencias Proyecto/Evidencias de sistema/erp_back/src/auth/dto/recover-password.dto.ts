import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecoverPasswordDto {
  @ApiProperty({ example: 'admin@almahue.local' })
  @IsEmail()
  email: string;
}
