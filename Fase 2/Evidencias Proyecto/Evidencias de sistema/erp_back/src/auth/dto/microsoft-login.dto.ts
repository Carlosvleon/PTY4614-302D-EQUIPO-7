import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MicrosoftLoginDto {
  @ApiProperty({ description: 'ID token JWT emitido por Microsoft Entra ID (MSAL)' })
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}
