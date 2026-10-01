/**
 * Prefijo público de la SPA (Vite base / React Router basename).
 * Por defecto `/` (dev local). En prod bajo IP: `VITE_BASE_PATH=/almahue-erp/`.
 */
export function normalizeBasePath(raw?: string): string {
  const value = (raw ?? '').trim();
  if (!value || value === '/') return '/';
  const trimmed = value.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

/** Vite `base` (siempre con trailing slash, o `/`). */
export function viteBase(): string {
  return normalizeBasePath(import.meta.env.VITE_BASE_PATH as string | undefined);
}

/** React Router `basename` (sin trailing slash; vacío si root). */
export function routerBasename(): string | undefined {
  const base = viteBase();
  if (base === '/') return undefined;
  return base.replace(/\/$/, '');
}

/** Href absoluto en el browser (incluye base path). */
export function withBasePath(path: string): string {
  const base = viteBase();
  const segment = path.startsWith('/') ? path : `/${path}`;
  if (base === '/') return segment;
  if (segment === '/') return base;
  return `${base.replace(/\/$/, '')}${segment}`;
}
