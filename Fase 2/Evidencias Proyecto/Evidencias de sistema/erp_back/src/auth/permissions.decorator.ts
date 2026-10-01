import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const ANY_PERMISSIONS_KEY = 'any_permissions';

export const RequirePermissions = (...perms: string[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);

/** User needs at least one of the listed permissions (OR). */
export const RequireAnyPermission = (...perms: string[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, perms);

export const APROBACIONES_CONFIG_KEY = 'aprobaciones_config';

/** Solo JWT válido (selector empresa/periodo, panel adaptativo). */
export const SESSION_CONTEXT_KEY = 'session_context';
export const RequireAuthenticatedSession = () => SetMetadata(SESSION_CONTEXT_KEY, true);

/** Reglas de aprobación: admin:* o AdminConcepto del módulo. */
export const RequireAprobacionesConfig = (mode: 'read' | 'write') =>
  SetMetadata(APROBACIONES_CONFIG_KEY, mode);

/** Read-only access to master data for operational forms and filters. */
export const OPERATIONAL_MASTER_READ = [
  'admin:read',
  'reportes:read',
  'contabilidad:read',
  'comercial:read',
  'contratistas:read',
  'compras:read',
  'catalogos:read',
  'tesoreria:read',
  'insumos:read',
] as const;
