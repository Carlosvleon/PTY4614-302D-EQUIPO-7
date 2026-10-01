export type AccionImport = 'NUEVO' | 'ACTUALIZA' | 'SIN_CAMBIOS';

export function valorInformado(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

export function mismosValores(a: unknown, b: unknown): boolean {
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
  return String(a ?? '').trim() === String(b ?? '').trim();
}

export function clasificarFilaImport(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown> | undefined,
  fields: { key: string; label: string }[],
): { accion: AccionImport; cambios: string[] } {
  if (!existing) return { accion: 'NUEVO', cambios: [] };
  const cambios: string[] = [];
  for (const f of fields) {
    const next = incoming[f.key];
    if (!valorInformado(next)) continue;
    const prev = existing[f.key];
    if (mismosValores(next, prev)) continue;
    const from = prev == null || prev === '' ? '(vacío)' : String(prev);
    cambios.push(`${f.label}: ${from} → ${String(next)}`);
  }
  return {
    accion: cambios.length ? 'ACTUALIZA' : 'SIN_CAMBIOS',
    cambios,
  };
}
