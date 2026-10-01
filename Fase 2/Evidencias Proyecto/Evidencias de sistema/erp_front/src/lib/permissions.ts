import type { SessionUser } from '@/types/domain';

export function hasPermission(user: SessionUser | null, permission: string): boolean {
  const perms = user?.permisos ?? [];
  if (perms.includes('*')) return true;
  if (perms.includes(permission)) return true;
  const [resource, action] = permission.split(':');
  if (action === 'read' && perms.includes(`${resource}:write`)) return true;
  return perms.includes(`${resource}:*`);
}

export function hasAnyPermission(user: SessionUser | null, permissions: string[]): boolean {
  return permissions.some((p) => hasPermission(user, p));
}

/** Lectura operativa del panel / notificaciones (alineado a OPERATIONAL_MASTER_READ + tesorería/insumos). */
export const DASHBOARD_API_ANY = [
  'admin:read',
  'reportes:read',
  'contabilidad:read',
  'comercial:read',
  'contratistas:read',
  'compras:read',
  'tesoreria:read',
  'insumos:read',
] as const;

/** Acceso a Reglas de aprobación: admin:read/write o AdminConcepto en algún módulo. */
export function canAccessAprobacionesConfig(user: SessionUser | null): boolean {
  if (!user) return false;
  if (hasAnyPermission(user, ['admin:read', 'admin:write'])) return true;
  return (user.adminConceptoModulos?.length ?? 0) > 0;
}

/** true si puede editar todos los módulos (admin write / *). */
export function canEditAllAprobacionesModulos(user: SessionUser | null): boolean {
  return hasAnyPermission(user, ['admin:write', 'admin:read']) || (user?.permisos ?? []).includes('*');
}

/** Superadmin / `*`: override implícito; no se elige en escalas ni grupos. */
export function esUsuarioMantenedor(u: { rolId?: string; permisos?: string[] } | null | undefined): boolean {
  if (!u) return false;
  return u.rolId === 'ROL-1' || (u.permisos ?? []).includes('*');
}
