/** Texto del menú: ABIERTO/CERRADO vs preferido de la empresa (un solo `activo` por tenant). */
export function periodoMenuEstadoLabel(p: { estado: string; activo?: boolean } | undefined): string {
  if (!p) return 'Sin crear';
  return p.activo ? `${p.estado} · preferido` : p.estado;
}

/** Marca el periodo como preferido de la empresa. No-op si ya lo es. */
export async function syncPeriodoPreferido(
  periodo: { id: string; activo?: boolean } | undefined,
  update: (id: string, input: { activo: boolean }) => Promise<unknown>,
) {
  if (!periodo?.id || periodo.activo) return false;
  await update(periodo.id, { activo: true });
  return true;
}
