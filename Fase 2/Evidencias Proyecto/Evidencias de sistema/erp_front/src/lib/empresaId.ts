/**
 * IDs de fixtures demo → sociedades del holding QA local.
 * Solo se aplica si el id pedido NO está en el catálogo y el alias SÍ.
 * En prod (EMP-1 en catálogo) no se reescribe.
 */
export const DEMO_EMPRESA_ID_ALIASES: Record<string, string> = {
  'EMP-1': 'EMP-EXPORT',
  'EMP-2': 'EMP-SERVICES',
};

export function resolveCatalogEmpresaId(
  requested: string | null | undefined,
  catalogIds: string[] | undefined,
  fallback?: string | null,
): string | null {
  const catalog = [...new Set((catalogIds ?? []).filter(Boolean))];
  const id = (requested || '').trim();
  const fb = (fallback || '').trim();
  if (id && catalog.includes(id)) return id;
  if (id) {
    const alias = DEMO_EMPRESA_ID_ALIASES[id];
    if (alias && catalog.includes(alias)) return alias;
  }
  if (fb && catalog.includes(fb)) return fb;
  if (id) return id;
  if (fb) return fb;
  return catalog[0] ?? null;
}
