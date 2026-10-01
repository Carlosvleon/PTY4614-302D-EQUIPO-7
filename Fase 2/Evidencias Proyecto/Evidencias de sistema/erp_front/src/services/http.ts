import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { withBasePath } from '@/lib/basePath';
import { buildApiUrl } from '@/lib/apiUrl';
import { readDemoMode, readSelectedEmpresaId, writeSelectedEmpresaId } from '@/lib/appSettings';
import { resolveCatalogEmpresaId } from '@/lib/empresaId';

function loginHref(): string {
  return withBasePath('/login');
}

export function apiUrl(path: string): string {
  return buildApiUrl(path, import.meta.env.VITE_API_URL as string | undefined);
}

const SESSION_KEY = 'erp.session';

function readSession(): {
  token?: string;
  refreshToken?: string;
  empresaId?: string;
  empresaIds?: string[];
} | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      token?: string;
      refreshToken?: string;
      empresaId?: string;
      empresaIds?: string[];
    };
  } catch {
    return null;
  }
}

function decodeJwtTenant(token: string): { empresaId?: string; empresaIds?: string[] } | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as { empresaId?: string; empresaIds?: string[] };
  } catch {
    return null;
  }
}

function writeTokens(token: string, refreshToken: string) {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return;
  try {
    const session = JSON.parse(raw) as Record<string, unknown>;
    session.token = token;
    session.refreshToken = refreshToken;
    const tenant = decodeJwtTenant(token);
    if (tenant?.empresaId) session.empresaId = tenant.empresaId;
    if (tenant?.empresaIds) session.empresaIds = tenant.empresaIds;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch { /* noop */ }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

let refreshPromise: Promise<{ token: string; refreshToken: string }> | null = null;

async function refreshAccessToken(): Promise<{ token: string; refreshToken: string }> {
  const session = readSession();
  if (!session?.refreshToken) {
    throw new Error('No refresh token');
  }

  const { data } = await axios.post<{ token: string; refreshToken: string }>(
    apiUrl('auth/refresh'),
    { refreshToken: session.refreshToken },
    { headers: { 'Content-Type': 'application/json' } },
  );

  writeTokens(data.token, data.refreshToken);
  return data;
}

const http = axios.create({
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  if (config.url && !config.url.startsWith('http')) {
    config.url = apiUrl(config.url);
  }

  const session = readSession();
  if (session?.token) {
    config.headers.Authorization = `Bearer ${session.token}`;
  }
  // Empresa activa: selector del header (DEC-03) tiene prioridad sobre JWT.session.
  // Si quedó un id de demo (EMP-1) y el catálogo JWT es holding (EMP-EXPORT), se aliasa.
  const selected = readSelectedEmpresaId();
  const empresaId = readDemoMode()
    ? (selected ?? session?.empresaId ?? null)
    : resolveCatalogEmpresaId(selected, session?.empresaIds, session?.empresaId);
  if (empresaId) {
    config.headers['X-Empresa-Id'] = empresaId;
    if (!readDemoMode() && empresaId !== selected) writeSelectedEmpresaId(empresaId);
  }
  // multipart: dejar que el runtime fije boundary
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

http.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const url = original?.url ?? '';
    const isAuthRoute =
      url.includes('auth/login') ||
      url.includes('auth/refresh') ||
      url.includes('auth/recover') ||
      url.includes('auth/reset-password');

    if (readDemoMode() && err.response?.status === 401) {
      return Promise.reject(err);
    }

    if (err.response?.status !== 401 || isAuthRoute || original?._retry) {
      if (err.response?.status === 401 && !isAuthRoute) {
        clearSession();
        const login = loginHref();
        if (window.location.pathname !== login) {
          window.location.href = login;
        }
      }
      return Promise.reject(err);
    }

    original._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const tokens = await refreshPromise;
      original.headers.Authorization = `Bearer ${tokens.token}`;
      return http(original);
    } catch {
      clearSession();
      const login = loginHref();
      if (window.location.pathname !== login) {
        window.location.href = login;
      }
      return Promise.reject(err);
    }
  },
);

export default http;
