import type { WorkflowConfig } from '@/types/domain';

/** Módulos con bandeja de aprobación activa hoy. */
export const WORKFLOW_MODULOS_ACTIVOS = ['Compras'] as const;

export const WORKFLOW_MODULOS_UI: { value: string; label: string }[] = [
  { value: 'Compras', label: 'Compras (OC)' },
];

/** Módulos de cadena exigidos por el rol (write). `*` / mantenedor: ninguno. */
export function modulosCadenaDesdePermisos(permisos: string[] | undefined): string[] {
  if (!permisos?.length || permisos.includes('*')) return [];
  const write = (recurso: string) =>
    permisos.includes(`${recurso}:write`) || permisos.includes(`${recurso}:*`);
  const out: string[] = [];
  if (write('compras')) out.push('Compras');
  return out;
}

export function mensajeGruposCadenaFaltantes(
  permisos: string[] | undefined,
  selectedGrupoIds: Set<string>,
  gruposActivos: { id: string; modulo: string; activo?: boolean }[],
): string | null {
  const needed = modulosCadenaDesdePermisos(permisos);
  if (!needed.length) return null;
  const activos = gruposActivos.filter((g) => g.activo !== false);
  for (const mod of needed) {
    const delMod = activos.filter((g) => g.modulo === mod);
    const etiqueta = WORKFLOW_MODULOS_UI.find((x) => x.value === mod)?.label ?? mod;
    if (!delMod.length) {
      return `No hay grupos de aprobación activos en ${etiqueta}. Créalos en Administración › Reglas de aprobación antes de asignar este rol.`;
    }
    if (!delMod.some((g) => selectedGrupoIds.has(g.id))) {
      return `Asigna al menos un grupo de ${etiqueta}.`;
    }
  }
  return null;
}

export function matchWorkflow(
  workflows: WorkflowConfig[] | undefined,
  modulo: string,
  monto: number,
): WorkflowConfig | undefined {
  const mod = modulo.trim().toLowerCase();
  return (workflows ?? []).find(
    (w) =>
      w.activo
      && w.modulo.trim().toLowerCase() === mod
      && monto >= w.montoMin
      && monto <= w.montoMax
      && (w.aprobadorIds?.length ?? 0) > 0,
  );
}

export function filterUsuariosAprobadores<T extends { id: string; activo?: boolean; nombre?: string }>(
  usuarios: T[] | undefined,
  workflow: WorkflowConfig | undefined,
): T[] {
  const fromWf = (workflow?.aprobadoresUsuarios ?? []).filter((u) => u.activo !== false);
  if (fromWf.length) {
    return fromWf as unknown as T[];
  }
  const list = (usuarios ?? []).filter((u) => u.activo !== false);
  const ids = workflow?.aprobadorIds?.filter(Boolean) ?? [];
  if (!ids.length) return list;
  return list.filter((u) => ids.includes(u.id));
}

/**
 * Quién puede Aprobar/Rechazar una OC pendiente (UI).
 * Alineado al backend: jefe asignado, superadmin o `compras:aprobar-all`.
 */
export function canResolverOcPendiente(
  user: { id?: string; permisos?: string[] } | null | undefined,
  row: { aprobadorId?: string | null },
): boolean {
  if (!user?.id) return false;
  const perms = user.permisos ?? [];
  if (perms.includes('*') || perms.includes('compras:aprobar-all')) return true;
  if (row.aprobadorId && row.aprobadorId === user.id) return true;
  // Legado sin jefe: no mostrar acciones de resolución en UI
  return false;
}

