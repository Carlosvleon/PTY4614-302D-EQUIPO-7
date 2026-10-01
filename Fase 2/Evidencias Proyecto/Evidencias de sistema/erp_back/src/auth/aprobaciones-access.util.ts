import { ForbiddenException } from '@nestjs/common';
import type { JwtPayload } from './jwt.strategy';
import { userHasPermission } from './permission.util';
import { isSuperAdmin } from './tenant.util';

type AdminConceptoReader = {
  adminConcepto: {
    findFirst: (args: {
      where: {
        empresaId: string;
        usuarioId: string;
        activo: boolean;
        modulo: { equals: string; mode: 'insensitive' };
      };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
};

const MODULOS_APROBACION_ACTIVOS = ['Compras'];

export function hasFullAdminRead(user: JwtPayload): boolean {
  if (isSuperAdmin(user)) return true;
  return userHasPermission(user.permisos ?? [], 'admin:read');
}

export function hasFullAdminWrite(user: JwtPayload): boolean {
  if (isSuperAdmin(user)) return true;
  return userHasPermission(user.permisos ?? [], 'admin:write');
}

export function getAdminConceptoModulos(user: JwtPayload): string[] {
  return (user.adminConceptoModulos ?? []).filter((modulo) =>
    moduloMatches(modulo, MODULOS_APROBACION_ACTIVOS),
  );
}

export function canReadAprobacionesConfig(user: JwtPayload): boolean {
  return hasFullAdminRead(user) || getAdminConceptoModulos(user).length > 0;
}

export function canWriteAprobacionesConfig(user: JwtPayload): boolean {
  return hasFullAdminWrite(user) || getAdminConceptoModulos(user).length > 0;
}

export function moduloMatches(modulo: string, allowed: string[]): boolean {
  const m = modulo.trim().toLowerCase();
  return allowed.some((a) => a.trim().toLowerCase() === m);
}

export function assertModuloAprobacionesAccess(
  user: JwtPayload,
  modulo: string,
  mode: 'read' | 'write',
): void {
  const m = modulo?.trim();
  if (!m) throw new ForbiddenException('Módulo requerido');
  if (!moduloMatches(m, MODULOS_APROBACION_ACTIVOS)) {
    throw new ForbiddenException(`El módulo «${m}» no tiene cadena de aprobación activa`);
  }
  if (mode === 'read' && hasFullAdminRead(user)) return;
  if (mode === 'write' && hasFullAdminWrite(user)) return;
  const modulos = getAdminConceptoModulos(user);
  if (!moduloMatches(m, modulos)) {
    throw new ForbiddenException(`Sin acceso al módulo «${m}»`);
  }
}

/** Revalida AdminConcepto en BD en operaciones write (revocación efectiva sin esperar expiración JWT). */
export async function assertModuloAprobacionesWriteLive(
  prisma: AdminConceptoReader,
  user: JwtPayload,
  modulo: string,
  empresaId: string,
): Promise<void> {
  const m = modulo?.trim();
  if (!m) throw new ForbiddenException('Módulo requerido');
  if (!moduloMatches(m, MODULOS_APROBACION_ACTIVOS)) {
    throw new ForbiddenException(`El módulo «${m}» no tiene cadena de aprobación activa`);
  }
  if (isSuperAdmin(user) || hasFullAdminWrite(user)) return;

  const row = await prisma.adminConcepto.findFirst({
    where: {
      empresaId,
      usuarioId: user.sub,
      activo: true,
      modulo: { equals: m, mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (!row) {
    throw new ForbiddenException(`Sin acceso al módulo «${m}»`);
  }
}

/** Filtro Prisma para listados de grupos/nodos por módulo (AdminConcepto). */
export function prismaModuloFilterForUser(user: JwtPayload): { modulo: { in: string[] } } | Record<string, never> {
  if (hasFullAdminRead(user)) return { modulo: { in: [...MODULOS_APROBACION_ACTIVOS] } };
  const modulos = getAdminConceptoModulos(user);
  if (!modulos.length) throw new ForbiddenException('Permisos insuficientes');
  return { modulo: { in: modulos } };
}

/** Suplencias visibles para AdminConcepto: solo las de sus módulos. */
export function prismaDelegacionModuloFilterForUser(user: JwtPayload):
  | { modulo: { in: string[] } }
  | Record<string, never> {
  if (hasFullAdminRead(user)) return { modulo: { in: [...MODULOS_APROBACION_ACTIVOS] } };
  const modulos = getAdminConceptoModulos(user);
  if (!modulos.length) throw new ForbiddenException('Permisos insuficientes');
  return { modulo: { in: modulos } };
}
