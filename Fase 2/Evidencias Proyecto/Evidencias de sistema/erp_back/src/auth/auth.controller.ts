import { Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetClaveReversaDto } from './dto/clave-reversa.dto';
import { SetPinAprobacionDto } from './dto/pin-aprobacion.dto';
import { LoginDto } from './dto/login.dto';
import { MicrosoftLoginDto } from './dto/microsoft-login.dto';
import { RecoverPasswordDto } from './dto/recover-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Public } from './public.decorator';
import type { JwtPayload } from './jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Get('microsoft/config')
  microsoftConfig() {
    return this.auth.getMicrosoftAuthConfig();
  }

  @Public()
  @Post('microsoft')
  loginMicrosoft(@Body() dto: MicrosoftLoginDto) {
    return this.auth.loginWithMicrosoft(dto.idToken);
  }

  @Get('me')
  @ApiBearerAuth()
  me(@Req() req: Request & { user: JwtPayload }) {
    return this.auth.getProfile(req.user.sub);
  }

  @Patch('me')
  @ApiBearerAuth()
  updateProfile(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.auth.updateProfile(req.user.sub, dto.nombre);
  }

  @Post('change-password')
  @ApiBearerAuth()
  changePassword(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(req.user, dto.password);
  }

  @Post('clave-reversa')
  @ApiBearerAuth()
  setClaveReversa(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: SetClaveReversaDto,
  ) {
    return this.auth.setClaveReversa(req.user.sub, dto.clave);
  }

  @Post('pin-aprobacion')
  @ApiBearerAuth()
  setPinAprobacion(
    @Req() req: Request & { user: JwtPayload },
    @Body() dto: SetPinAprobacionDto,
  ) {
    return this.auth.setPinAprobacion(req.user.sub, dto.pin, dto.password);
  }

  @Post('logout')
  @ApiBearerAuth()
  logout(@Req() req: Request & { user: JwtPayload }) {
    return this.auth.logout(req.user.sub, req.user.email);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('recover')
  recover(@Body() dto: RecoverPasswordDto) {
    return this.auth.recoverPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }
}
