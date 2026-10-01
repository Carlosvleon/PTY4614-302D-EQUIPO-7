import type { CuentaContable } from '@/types/domain';

const TIPO_CUENTA_ETIQUETA: Record<CuentaContable['tipo'], string> = {
  ACTIVO: 'Activo',
  PASIVO: 'Pasivo',
  PATRIMONIO: 'Patrimonio',
  INGRESO: 'Ingreso',
  GASTO: 'Gasto',
};

export function flattenCuentasTree(rows: CuentaContable[]): CuentaContable[] {
  const out: CuentaContable[] = [];
  const walk = (list: CuentaContable[]) => {
    for (const c of list) {
      out.push(c);
      if (c.children?.length) walk(c.children);
    }
  };
  walk(rows);
  return out;
}

/** Cuentas para movimientos nuevos (Agustín: inactiva no se usa). */
export function cuentasParaImputar(
  rows: CuentaContable[] | undefined,
  keepId?: string | null,
): CuentaContable[] {
  return flattenCuentasTree(rows ?? []).filter(
    (c) => !c.noImputable && (c.activa || (keepId && c.id === keepId)),
  );
}

export function labelCuentaImputacion(c: CuentaContable): string {
  const tipo = c.tipo ? TIPO_CUENTA_ETIQUETA[c.tipo] ?? c.tipo : '';
  const base = tipo ? `${c.codigo} · ${tipo} · ${c.nombre}` : `${c.codigo} · ${c.nombre}`;
  return c.activa ? base : `${base} (inactiva)`;
}
