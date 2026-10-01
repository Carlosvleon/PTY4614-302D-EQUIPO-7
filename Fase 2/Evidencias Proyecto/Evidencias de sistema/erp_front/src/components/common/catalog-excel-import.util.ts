/** Campos solo de UI/preview; Nest (forbidNonWhitelisted) los rechaza en el POST. */
export const CATALOG_EXCEL_PREVIEW_ONLY_KEYS = ['accion', 'cambios'] as const;

export const CATALOG_EXCEL_ELEMENTO_KEYS = ['codigo', 'nombre', 'departamento'] as const;
export const CATALOG_EXCEL_CODIGO_KEYS = ['codigo', 'nombre', 'activa'] as const;
export const CATALOG_EXCEL_CENTRO_KEYS = [
  'codigo',
  'nombre',
  'activa',
  'contactoEncargado',
] as const;

/**
 * El proxy (Vite/nginx) responde 502 si el API se reinicia después de grabar.
 * Sin status también cuenta: la conexión se cortó y el POST puede haber quedado hecho.
 */
export function catalogImportResponseLost(error: unknown): boolean {
  if (!error || typeof error !== 'object') return true;
  const withStatus = error as { status?: number; response?: { status?: number } };
  const status = withStatus.status ?? withStatus.response?.status;
  if (status == null) return true;
  return status >= 500;
}

export const CATALOG_IMPORT_LOST_RESPONSE =
  'No llegó la confirmación del servidor. Si las filas ya se grabaron, el listado las muestra ahora.';

export function toCatalogExcelImportPayload(
  items: Array<Record<string, unknown>>,
  allowedKeys: readonly string[],
): Array<Record<string, unknown>> {
  const allow = new Set(allowedKeys);
  return items.map((it) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(it)) {
      if (!allow.has(k)) continue;
      if (v === undefined) continue;
      out[k] = v;
    }
    return out;
  });
}
