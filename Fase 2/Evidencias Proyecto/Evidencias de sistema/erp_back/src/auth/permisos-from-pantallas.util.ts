import type { PermisoPantallaRow } from './bandeja-aprobacion.util';

/** Label UI → código JWT (Ventas usa `comercial`, no `ventas`). */
const MODULO_LABEL_TO_JWT: Record<string, string> = {
  'Panel operativo': 'panel',
  Administración: 'admin',
  Parametrización: 'catalogos',
  Contratistas: 'contratistas',
  Ventas: 'comercial',
  Compras: 'compras',
  'Insumos / Bodega': 'insumos',
  Contabilidad: 'contabilidad',
  Tesorería: 'tesoreria',
};

export function matrixTieneAlgunaLectura(
  pantallas: PermisoPantallaRow[] | null | undefined,
): boolean {
  return (pantallas ?? []).some((p) => p.lectura);
}

/** Si hay matriz con al menos una lectura, el JWT sigue esa vista (no el array legado). */
export function effectiveRolPermisos(
  permisos: string[] | undefined,
  pantallas: PermisoPantallaRow[] | null | undefined,
): string[] {
  const base = permisos ?? [];
  if (base.includes('*')) return base;
  if (!matrixTieneAlgunaLectura(pantallas)) return base;

  const mods = new Map<string, { read: boolean; write: boolean }>();
  for (const p of pantallas ?? []) {
    if (!p.lectura && !p.escritura) continue;
    const modLabel = (p.pantalla ?? '').split('·')[0]?.trim() ?? '';
    const key = MODULO_LABEL_TO_JWT[modLabel]
      ?? modLabel
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
    if (!key || key === 'panel') continue;
    const cur = mods.get(key) ?? { read: false, write: false };
    if (p.lectura) cur.read = true;
    if (p.escritura) cur.write = true;
    mods.set(key, cur);
  }

  const out: string[] = [];
  for (const [k, v] of mods) {
    if (v.write) out.push(`${k}:write`);
    if (v.read || v.write) out.push(`${k}:read`);
  }
  return [...new Set(out)];
}
