import { ApiProperty } from '@nestjs/swagger';
import { Matches, IsString, Length, MinLength } from 'class-validator';

export class SetPinAprobacionDto {
  @ApiProperty({ description: 'PIN de 4 dígitos para aprobar/rechazar', example: '1234' })
  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'El PIN debe ser exactamente 4 dígitos numéricos' })
  pin: string;

  @ApiProperty({ description: 'Contraseña de la cuenta (login) para confirmar el cambio de PIN' })
  @IsString()
  @MinLength(1, { message: 'Debes ingresar la contraseña de tu cuenta' })
  password: string;
}
