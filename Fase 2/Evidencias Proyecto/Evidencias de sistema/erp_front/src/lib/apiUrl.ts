/** Normaliza VITE_API_URL (relativo o absoluto, sin slash final). */
export function resolveApiBase(raw?: string): string {
  const value = (raw ?? '').trim();
  if (!value || value === 'auto') return '/api/v1';
  return value.replace(/\/$/, '');
}

/**
 * Prefija el path con el base de API.
 * Idempotente: si `path` ya trae el prefijo (retry axios tras 401), no lo duplica.
 */
export function buildApiUrl(path: string, envRaw?: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const env = resolveApiBase(envRaw);
  const segment = path.replace(/^\//, '');

  if (env.startsWith('http://') || env.startsWith('https://')) {
    if (path.startsWith(env)) return path;
    return `${env}/${segment}`;
  }

  const prefix = (env.startsWith('/') ? env : `/${env}`).replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)) {
    return normalizedPath;
  }
  return `${prefix}/${segment}`;
}
