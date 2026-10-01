import type { PermisoPantalla } from '@/types/domain';

/** Catálogo de pantallas del ERP, alineado al menú Sidebar (permiso por pantalla). */
export type ModuloPermisos = {
  id: string;
  label: string;
  /** Código corto para derivar permisos legacy (contratistas:read, etc.). */
  code: string;
  pantallas: string[];
};

export const MODULOS_PERMISOS: ModuloPermisos[] = [
  {
    id: 'panel',
    label: 'Panel operativo',
    code: 'panel',
    pantallas: ['Panel operativo'],
  },
  {
    id: 'admin',
    label: 'Administración',
    code: 'admin',
    pantallas: [
      'Empresas',
      'Plantilla documentos',
      'Usuarios',
      'Roles y permisos',
      'Reglas de aprobación',
    ],
  },
  {
    id: 'catalogos',
    label: 'Parametrización',
    code: 'catalogos',
    pantallas: [
      'Monedas',
      'Unidades de medida',
      'Centros de costo',
      'Elementos de costo',
      'Áreas de negocio',
      'Conceptos',
      'Códigos financieros',
      'Tipos de documento',
      'Plan de cuentas',
      'Indicadores BC',
      'Proveedores',
      'Contratista',
    ],
  },
  {
    id: 'contratistas',
    label: 'Contratistas',
    code: 'contratistas',
    pantallas: [
      'Listado',
      'Ingreso diario',
      'Tarifas',
      'Proformas y facturas',
      'Traspaso y cierre',
      'Auditoría',
    ],
  },
  {
    id: 'ventas',
    label: 'Ventas',
    code: 'comercial',
    pantallas: [
      'Órdenes de venta',
      'Emitir DTE',
      'Libro de ventas',
      'Libro de guías',
      'Clientes',
    ],
  },
  {
    id: 'compras',
    label: 'Compras',
    code: 'compras',
    pantallas: [
      'Órdenes de compra',
      'Aprobaciones',
      'Recepciones',
      'Libro de compras',
    ],
  },
  {
    id: 'insumos',
    label: 'Insumos / Bodega',
    code: 'insumos',
    pantallas: ['Maestro artículos', 'Bodegas', 'Stock por bodega / producto', 'Movimientos / NC'],
  },
  {
    id: 'contabilidad',
    label: 'Contabilidad',
    code: 'contabilidad',
    pantallas: [
      'Períodos contables',
      'Cuentas por tipo de documento',
      'Comprobantes / asientos',
      'Centralización masiva',
      'Factores honorarios',
      'Libro diario',
      'Libro mayor',
      'Balance de 8 columnas',
      'Resumen contable',
      'Presupuestos',
    ],
  },
  {
    id: 'tesoreria',
    label: 'Tesorería',
    code: 'tesoreria',
    pantallas: [
      'Cartolas',
      'Conciliación',
      'Flujo de caja',
      'Pagos',
      'Nómina semanal',
      'Estado de cuenta',
    ],
  },
];

export function pantallaKey(moduloLabel: string, pantalla: string): string {
  return `${moduloLabel} · ${pantalla}`;
}

/** Nombres viejos del catálogo → clave actual (roles persistidos antes del rename). */
export const PANTALLA_ALIASES: Record<string, string> = {
  'Ventas · Emitir documento': 'Ventas · Emitir DTE',
  'Ventas · Guías de despacho': 'Ventas · Libro de guías',
  'Contabilidad · Estado de cuenta': 'Tesorería · Estado de cuenta',
  'Contratistas · Asociación labores': 'Parametrización · Contratista',
  'Contratistas · Parametrización': 'Parametrización · Contratista',
  'Contratistas · Tarifas / labores': 'Contratistas · Tarifas',
};

function claveCanonicaPantalla(pantalla: string): string {
  return PANTALLA_ALIASES[pantalla] ?? pantalla;
}

/** Lista plana de todas las pantallas del sistema. */
export function catalogoPantallasVacias(): PermisoPantalla[] {
  return MODULOS_PERMISOS.flatMap((m) =>
    m.pantallas.map((p) => ({
      pantalla: pantallaKey(m.label, p),
      lectura: false,
      escritura: false,
    })),
  );
}

/** Fusiona permisos guardados con el catálogo actual (pantallas nuevas quedan en false). */
export function mergeConCatalogo(existing?: PermisoPantalla[] | null): PermisoPantalla[] {
  const map = new Map<string, PermisoPantalla>();
  for (const p of existing ?? []) {
    map.set(claveCanonicaPantalla(p.pantalla), p);
  }
  return catalogoPantallasVacias().map((base) => {
    const prev = map.get(base.pantalla);
    if (!prev) return base;
    return {
      pantalla: base.pantalla,
      lectura: Boolean(prev.lectura),
      escritura: Boolean(prev.lectura && prev.escritura),
    };
  });
}

export function codesFromMatrix(matrix: PermisoPantalla[]): string[] {
  const mods = new Map<string, { read: boolean; write: boolean }>();
  for (const p of matrix) {
    if (!p.lectura && !p.escritura) continue;
    const modLabel = p.pantalla.split('·')[0]?.trim() ?? '';
    const mod = MODULOS_PERMISOS.find((m) => m.label === modLabel);
    const key = mod?.code
      ?? (modLabel
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '')
        || 'otros');
    const cur = mods.get(key) ?? { read: false, write: false };
    if (p.lectura) cur.read = true;
    if (p.escritura) cur.write = true;
    mods.set(key, cur);
  }
  const out: string[] = [];
  for (const [k, v] of mods) {
    if (v.write && v.read) {
      out.push(`${k}:write`, `${k}:read`);
    } else if (v.write) {
      out.push(`${k}:write`);
    } else if (v.read) {
      out.push(`${k}:read`);
    }
  }
  return out.length ? out : ['panel:read'];
}

export function matrixRestrictiva(user: {
  permisos?: string[];
  permisosPantalla?: PermisoPantalla[] | null;
} | null | undefined): boolean {
  if (!user || (user.permisos ?? []).includes('*')) return false;
  return (user.permisosPantalla ?? []).some((p) => p.lectura);
}

/** Con matriz de lecturas, la URL debe coincidir con el checkbox. Sin matriz: lo decide el JWT. */
export function usuarioPuedeVerPantalla(
  user: { permisos?: string[]; permisosPantalla?: PermisoPantalla[] | null } | null | undefined,
  pantalla: string,
): boolean {
  if (!user) return false;
  if ((user.permisos ?? []).includes('*')) return true;
  if (!matrixRestrictiva(user)) return true;
  const clave = claveCanonicaPantalla(pantalla);
  return (user.permisosPantalla ?? []).some(
    (p) => claveCanonicaPantalla(p.pantalla) === clave && p.lectura,
  );
}

export type TriState = 'all' | 'none' | 'partial';

export function triState(values: boolean[]): TriState {
  if (!values.length) return 'none';
  const n = values.filter(Boolean).length;
  if (n === 0) return 'none';
  if (n === values.length) return 'all';
  return 'partial';
}
