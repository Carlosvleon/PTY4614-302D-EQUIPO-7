import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { getRequiredJwtSecret } from './jwt-secret.util';

export interface JwtPayload {
  sub: string;
  email: string;
  rolId: string;
  empresaId: string;
  /** Empresas a las que el usuario puede acceder (multi-empresa Reu 3). */
  empresaIds?: string[];
  permisos: string[];
  /** Módulos donde el usuario es AdminConcepto (Reglas de aprobación). */
  adminConceptoModulos?: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getRequiredJwtSecret(config),
    });
  }

  validate(payload: JwtPayload) {
    return payload;
  }
}
