import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { JwtPayload } from './jwt.strategy';

export type TenantScope = { all: true } | { empresaIds: string[] };

/** Rol master del sistema: permisos globales, no editable desde permisología. */
export const ADMIN_ROL_ID = 'ROL-1';

export function isAdminRolId(rolId: string | null | undefined): boolean {
  return rolId === ADMIN_ROL_ID;
}

export function isSuperAdmin(user: {
  rolId?: string | null;
  permisos?: string[] | null;
}): boolean {
  return isAdminRolId(user.rolId) || (user.permisos?.includes('*') ?? false);
}

/** Empresas de sesión: ROL-1 / `*` ve todo el catálogo; el resto solo membresía. */
export function sessionEmpresaIds(input: {
  rolId: string;
  permisos: string[];
  empresaId: string;
  accesoIds: string[];
  catalogoIds: string[];
}): string[] {
  if (isAdminRolId(input.rolId) || input.permisos.includes('*')) {
    const ids = [...new Set(input.catalogoIds.filter(Boolean))];
    return ids.length ? ids : [input.empresaId].filter(Boolean);
  }
  return [...new Set([input.empresaId, ...input.accesoIds].filter(Boolean))];
}

function allowedIdsFromUser(user: JwtPayload): string[] {
  const fromJwt = (user.empresaIds ?? []).filter(Boolean);
  if (fromJwt.length) return [...new Set(fromJwt)];
  if (user.empresaId) return [user.empresaId];
  return [];
}

export function resolveTenant(user: JwtPayload): TenantScope {
  if (isSuperAdmin(user)) return { all: true };
  const empresaIds = allowedIdsFromUser(user);
  if (!empresaIds.length) {
    throw new ForbiddenException('Usuario sin empresa asignada');
  }
  return { empresaIds };
}

function isAllScope(scope: TenantScope): scope is { all: true } {
  return 'all' in scope;
}

export function empresaWhere(scope: TenantScope): Prisma.EmpresaWhereInput {
  return isAllScope(scope) ? {} : { id: { in: scope.empresaIds } };
}

export function usuarioWhere(scope: TenantScope): Prisma.UsuarioWhereInput {
  if (isAllScope(scope)) return {};
  return {
    OR: [
      { empresaId: { in: scope.empresaIds } },
      { empresasAcceso: { some: { empresaId: { in: scope.empresaIds } } } },
    ],
  };
}

export function assertTenantAccess(scope: TenantScope, empresaId: string) {
  if (isAllScope(scope)) return;
  if (!scope.empresaIds.includes(empresaId)) {
    throw new ForbiddenException('No tienes acceso a recursos de otra empresa');
  }
}

export function tenantEmpresaId(scope: TenantScope, requested?: string): string {
  if (isAllScope(scope)) {
    if (!requested) {
      throw new ForbiddenException('empresaId es requerido');
    }
    return requested;
  }
  if (requested) {
    assertTenantAccess(scope, requested);
    return requested;
  }
  return scope.empresaIds[0];
}

/**
 * Empresa operativa para listados/maestros (DEC-03).
 * Siempre acota a una empresa: header/query o, por defecto, la del JWT.
 * Super Admin también queda acotado (no ve cross-empresa por defecto).
 * Usuarios multi-empresa pueden operar en cualquiera de sus empresasIds.
 */
export function resolveOperationalEmpresa(
  user: JwtPayload,
  requested?: string | null,
): string {
  const scope = resolveTenant(user);
  const chosen = (requested || user.empresaId || '').trim();
  if (!chosen) {
    throw new ForbiddenException('empresaId es requerido (empresa activa)');
  }
  assertTenantAccess(scope, chosen);
  return chosen;
}
