import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ANY_PERMISSIONS_KEY,
  APROBACIONES_CONFIG_KEY,
  PERMISSIONS_KEY,
  SESSION_CONTEXT_KEY,
} from './permissions.decorator';
import {
  canReadAprobacionesConfig,
  canWriteAprobacionesConfig,
} from './aprobaciones-access.util';
import { userHasPermission } from './permission.util';
import type { JwtPayload } from './jwt.strategy';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredAll = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredAny = this.reflector.getAllAndOverride<string[]>(
      ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const aprobacionesConfig = this.reflector.getAllAndOverride<'read' | 'write'>(
      APROBACIONES_CONFIG_KEY,
      [context.getHandler(), context.getClass()],
    );

    const sessionContext = this.reflector.getAllAndOverride<boolean>(
      SESSION_CONTEXT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const hasAllRules = requiredAll && requiredAll.length > 0;
    const hasAnyRules = requiredAny && requiredAny.length > 0;
    if (!hasAllRules && !hasAnyRules && !aprobacionesConfig && !sessionContext) return true;

    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    if (!user) throw new ForbiddenException();

    if (sessionContext && !hasAllRules && !hasAnyRules && !aprobacionesConfig) {
      return true;
    }

    if (aprobacionesConfig) {
      const ok =
        aprobacionesConfig === 'write'
          ? canWriteAprobacionesConfig(user)
          : canReadAprobacionesConfig(user);
      if (!ok) throw new ForbiddenException('Permisos insuficientes');
      return true;
    }

    const perms: string[] = user.permisos ?? [];
    if (perms.includes('*')) return true;

    if (hasAllRules && !requiredAll!.every((req) => userHasPermission(perms, req))) {
      throw new ForbiddenException('Permisos insuficientes');
    }

    if (hasAnyRules && !requiredAny!.some((req) => userHasPermission(perms, req))) {
      throw new ForbiddenException('Permisos insuficientes');
    }

    return true;
  }
}
