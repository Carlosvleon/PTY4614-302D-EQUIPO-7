import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/app/auth-context';
import { canAccessAprobacionesConfig, hasAnyPermission, hasPermission } from '@/lib/permissions';
import { canAccessBandejaModulo } from '@/lib/bandejaAprobacion';
import { usuarioPuedeVerPantalla } from '@/lib/pantallas-permisos';

type ProtectedRouteProps = {
  permission?: string;
  anyOf?: string[];
  /** Checkbox del catálogo (ej. Parametrización · Monedas). URL prohibida → inicio. */
  pantalla?: string;
  /** Cualquiera de estas pantallas (matriz restrictiva). */
  pantallaAnyOf?: string[];
  /** Acceso a /admin/aprobaciones vía admin:* o AdminConcepto. */
  aprobacionesConfig?: boolean;
  /** Bandeja OC sin permiso completo del módulo. */
  bandejaModulo?: 'Compras';
};

export function ProtectedRoute({
  permission,
  anyOf,
  pantalla,
  pantallaAnyOf,
  aprobacionesConfig,
  bandejaModulo,
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--color-muted)]">
        Cargando…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (aprobacionesConfig) {
    if (!canAccessAprobacionesConfig(user)) {
      return <Navigate to="/" replace />;
    }
    return <Outlet />;
  }

  if (bandejaModulo) {
    if (!canAccessBandejaModulo(user, bandejaModulo)) {
      return <Navigate to="/" replace />;
    }
    return <Outlet />;
  }

  if (permission && !hasPermission(user, permission)) {
    return <Navigate to="/" replace />;
  }

  if (anyOf?.length && !hasAnyPermission(user, anyOf)) {
    return <Navigate to="/" replace />;
  }

  if (pantalla && !usuarioPuedeVerPantalla(user, pantalla)) {
    return <Navigate to="/" replace />;
  }

  if (
    pantallaAnyOf?.length
    && !pantallaAnyOf.some((p) => usuarioPuedeVerPantalla(user, p))
  ) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
