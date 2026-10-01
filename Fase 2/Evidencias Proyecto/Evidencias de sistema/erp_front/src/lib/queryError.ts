export type HttpError = Error & {
  status?: number;
  responseData?: unknown;
  response?: { status?: number };
};

export const QUERY_ERROR_COOLDOWN_MS = 60_000;

const lastQueryErrorNotice = new Map<string, number>();

export function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as HttpError;
  return candidate.status ?? candidate.response?.status;
}

/** 401/403 de navegación o queries de módulo: no toast ni banner (no parece un fallo del ERP). */
export function isSilentAuthzError(error: unknown): boolean {
  const status = getErrorStatus(error);
  return status === 401 || status === 403;
}

export function hasUsableQueryData(data: unknown): boolean {
  return data !== undefined && data !== null;
}

/** 401/403 son definitivos para la sesión/permisos actuales; reintentarlos sólo genera tráfico y ruido. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isSilentAuthzError(error)) return false;
  return failureCount < 3;
}

/** Permite detener polling y refetch automáticos después de un rechazo de autenticación/autorización. */
export function shouldContinueQueryPolling(error: unknown): boolean {
  return !isSilentAuthzError(error);
}

/**
 * Evita repetir el mismo aviso en cada ciclo de polling.
 * Sólo los errores sin datos utilizables son bloqueantes y generan toast global.
 */
export function shouldNotifyQueryError(
  queryHash: string,
  error: unknown,
  data: unknown,
  now = Date.now(),
  cooldownMs = QUERY_ERROR_COOLDOWN_MS,
): boolean {
  if (hasUsableQueryData(data)) return false;

  const key = `${queryHash}:${getErrorStatus(error) ?? 'unknown'}`;
  const previous = lastQueryErrorNotice.get(key);
  if (previous !== undefined && now - previous < cooldownMs) return false;

  lastQueryErrorNotice.set(key, now);
  if (lastQueryErrorNotice.size > 200) {
    for (const [entryKey, timestamp] of lastQueryErrorNotice) {
      if (now - timestamp >= cooldownMs) lastQueryErrorNotice.delete(entryKey);
    }
  }
  return true;
}

function getPublicErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const data = (error as HttpError).responseData;
  if (!data || typeof data !== 'object') return undefined;
  const code = (data as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

const PUBLIC_QUERY_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  PERMISSION_DENIED: 'No tienes permiso para consultar esta información.',
  NOT_FOUND: 'No se encontró la información solicitada.',
  RATE_LIMITED: 'Hay demasiadas solicitudes. Espera un momento e intenta nuevamente.',
};

export function queryErrorMessage(error: unknown, resource = 'los datos'): string {
  const status = getErrorStatus(error);
  if (status === 403) {
    return `No tienes permiso para consultar ${resource}. La lista no está vacía: el servidor rechazó el acceso.`;
  }
  if (status === 401) return 'Tu sesión venció. Vuelve a iniciar sesión.';
  const publicMessage = PUBLIC_QUERY_ERROR_MESSAGES[getPublicErrorCode(error) ?? ''];
  if (publicMessage) return publicMessage;
  if (status === 400 || status === 422) {
    return `No se pudieron consultar ${resource} porque la solicitud no es válida.`;
  }
  if (status === 404) return `No se encontró ${resource}.`;
  if (status === 409) {
    return `No se pudieron consultar ${resource} por un conflicto con el estado actual.`;
  }
  if (status === 429) {
    return 'Hay demasiadas solicitudes. Espera un momento e intenta nuevamente.';
  }
  if (status != null && status >= 400 && status < 500) {
    return `No se pudieron consultar ${resource} (error ${status}).`;
  }
  if (status != null && status >= 500) {
    return `No se pudieron cargar ${resource} por un problema del servidor. Intenta nuevamente.`;
  }
  if (error instanceof Error && error.message && error.message !== 'Network Error') {
    return `No se pudieron cargar ${resource}: ${error.message}`;
  }
  return `No se pudieron cargar ${resource}. Revisa tu conexión e intenta nuevamente.`;
}
