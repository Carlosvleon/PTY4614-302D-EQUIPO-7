import { canAccessBandejaModulo } from '@/lib/bandejaAprobacion';
import { canAccessAprobacionesConfig, hasAnyPermission } from '@/lib/permissions';
import { pantallaKey, usuarioPuedeVerPantalla } from '@/lib/pantallas-permisos';
import type { SessionUser } from '@/types/domain';

export type MenuPermissionItem = {
  to?: string;
  label?: string;
  anyOf?: string[];
  allowAdminConcepto?: boolean;
  bandejaModulo?: 'Compras';
  children?: MenuPermissionItem[];
};

const SECCIONES_CATALOGO = new Set([
  'Panel operativo',
  'Administración',
  'Parametrización',
  'Contratistas',
  'Ventas',
  'Compras',
  'Insumos / Bodega',
  'Contabilidad',
  'Tesorería',
]);

function matrixRestrictiva(user: SessionUser | null): boolean {
  return (user?.permisosPantalla ?? []).some((p) => p.lectura);
}

function pantallaLectura(
  user: SessionUser | null,
  seccion: string | undefined,
  label: string | undefined,
): boolean {
  if (!user || !matrixRestrictiva(user) || !seccion || !label) return true;
  if (seccion === 'Panel operativo') return true;
  return usuarioPuedeVerPantalla(user, pantallaKey(seccion, label));
}

/**
 * Filtra el menú por JWT (hijos heredan anyOf del padre) y, si hay matriz de
 * pantallas con alguna lectura, por checkbox de pantalla.
 */
export function filterMenuByPermissions<T extends MenuPermissionItem>(
  items: T[],
  user: SessionUser | null,
  inheritedAnyOf?: string[],
  seccion?: string,
): T[] {
  return items
    .map((item) => {
      const nextSeccion = item.label && SECCIONES_CATALOGO.has(item.label)
        ? item.label
        : seccion;
      const effectiveAnyOf = item.anyOf?.length ? item.anyOf : inheritedAnyOf;
      const bandejaOk = item.bandejaModulo
        ? canAccessBandejaModulo(user, item.bandejaModulo)
        : false;
      const hasPerm = !effectiveAnyOf?.length
        || hasAnyPermission(user, effectiveAnyOf)
        || bandejaOk;
      const granularPermissionOk = Boolean(
        item.anyOf?.some((permission) =>
          permission.startsWith('contratistas:')
          && permission !== 'contratistas:read'
          && hasAnyPermission(user, [permission])),
      );
      const viaConcepto = Boolean(item.allowAdminConcepto && canAccessAprobacionesConfig(user));
      const pantallaOk = bandejaOk
        || viaConcepto
        || granularPermissionOk
        || pantallaLectura(user, nextSeccion, item.children?.length ? undefined : item.label);

      if (item.children?.length) {
        const children = filterMenuByPermissions(
          item.children as T[],
          user,
          effectiveAnyOf,
          nextSeccion,
        );
        if (!children.length && !item.to) return null;
        return { ...item, children };
      }

      if (item.to === '/') return item;
      if (!hasPerm && !viaConcepto) return null;
      if (!pantallaOk) return null;
      return item;
    })
    .filter(Boolean) as T[];
}
