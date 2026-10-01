import type { SessionUser } from '@/types/domain';
import { hasAnyPermission } from '@/lib/permissions';

export const APROBADOR_SIN_BANDEJA = 'APROBADOR_SIN_BANDEJA';

export type AprobadorSinBandejaItem = {
  usuarioId: string;
  nombre: string;
  email: string;
  rolId: string;
  rolNombre: string;
  modulo: string;
  pantallaRequerida: string;
  mensaje: string;
};

export type AprobadorSinBandejaError = {
  code: typeof APROBADOR_SIN_BANDEJA;
  message: string;
  invalidos: AprobadorSinBandejaItem[];
};

export function parseAprobadorSinBandejaError(err: unknown): AprobadorSinBandejaError | null {
  const candidates: unknown[] = [];
  if (err && typeof err === 'object') {
    const e = err as { response?: { data?: unknown }; responseData?: unknown };
    if (e.response?.data) candidates.push(e.response.data);
    if (e.responseData) candidates.push(e.responseData);
  }
  for (const data of candidates) {
    if (!data || typeof data !== 'object') continue;
    const obj = data as Record<string, unknown>;
    const nested = obj.message && typeof obj.message === 'object'
      ? (obj.message as Record<string, unknown>)
      : obj;
    if (nested.code !== APROBADOR_SIN_BANDEJA) continue;
    const invalidos = Array.isArray(nested.invalidos)
      ? nested.invalidos as AprobadorSinBandejaItem[]
      : [];
    const message = typeof nested.message === 'string'
      ? nested.message
      : 'Uno o más aprobadores no pueden usar la bandeja';
    return { code: APROBADOR_SIN_BANDEJA, message, invalidos };
  }
  return null;
}

/** Acceso a bandeja del módulo: permiso módulo, admin o designación en reglas (bandejaModulos). */
export function canAccessBandejaModulo(
  user: SessionUser | null,
  modulo: 'Compras',
): boolean {
  if (!user) return false;
  if (hasAnyPermission(user, ['admin:read', '*'])) return true;
  if (hasAnyPermission(user, ['compras:read', 'compras:aprobar-all'])) return true;
  return (user.bandejaModulos ?? []).some(
    (m) => m.trim().toLowerCase() === modulo.toLowerCase(),
  );
}

export function puedeEditarUsuarios(user: SessionUser | null): boolean {
  return hasAnyPermission(user, ['admin:write', 'admin:read', '*']);
}
