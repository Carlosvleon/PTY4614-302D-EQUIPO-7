/**
 * Completa permisosPantalla en roles a partir de sus permisos string
 * (panel:read, compras:write, *, etc.). Idempotente.
 *
 * Uso: npx ts-node -r tsconfig-paths/register scripts/seed-permisos-pantalla.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

/** Catálogo alineado a erp_front/src/lib/pantallas-permisos.ts */
const MODULOS: Array<{ label: string; code: string; pantallas: string[] }> = [
  { label: 'Panel operativo', code: 'panel', pantallas: ['Panel operativo'] },
  {
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
    label: 'Parametrización',
    code: 'catalogos',
    pantallas: [
      'Monedas',
      'Unidades de medida',
      'Centros de costo',
      'Elementos de costo',
      'Áreas de negocio',
      'Códigos financieros',
      'Tipos de documento',
      'Plan de cuentas',
      'Indicadores BC',
      'Proveedores',
    ],
  },
  {
    label: 'Contratistas',
    code: 'contratistas',
    pantallas: [
      'Listado',
      'Ingreso diario',
      'Asociación labores',
      'Tarifas / labores',
      'Proformas y facturas',
      'Traspaso y cierre',
    ],
  },
  {
    label: 'Ventas',
    code: 'comercial',
    pantallas: [
      'Libro de ventas',
      'Órdenes de venta',
      'Emitir documento',
      'Guías de despacho',
      'Clientes',
    ],
  },
  {
    label: 'Compras',
    code: 'compras',
    pantallas: ['Órdenes de compra', 'Aprobaciones', 'Recepciones', 'Libro de compras'],
  },
  {
    label: 'Insumos / Bodega',
    code: 'insumos',
    pantallas: ['Maestro artículos', 'Bodegas', 'Stock por bodega / producto', 'Movimientos / NC'],
  },
  {
    label: 'Contabilidad',
    code: 'contabilidad',
    pantallas: [
      'Períodos contables',
      'Configuración contable (SII)',
      'Factores honorarios',
      'Asientos / carga masiva',
      'Libro diario',
      'Libro mayor',
      'Balance de 8 columnas',
      'Reportes contables',
      'Presupuestos',
    ],
  },
  {
    label: 'Tesorería',
    code: 'tesoreria',
    pantallas: [
      'Cartolas',
      'Conciliación',
      'Flujo de caja',
      'Pagos',
      'Nóminas / atraso',
      'Estado de cuenta',
    ],
  },
];

type PermisoPantalla = { pantalla: string; lectura: boolean; escritura: boolean };

/** Alias permisos legacy → código de módulo de pantallas. */
const CODE_ALIAS: Record<string, string> = {
  comercial: 'comercial',
  ventas: 'comercial',
  proveedores: 'catalogos',
  proformas: 'contratistas',
};

function matrixFromPermisos(permisos: string[]): PermisoPantalla[] {
  const all = permisos.includes('*');
  const codes = new Map<string, { read: boolean; write: boolean }>();
  for (const p of permisos) {
    if (p === '*') continue;
    const [modRaw, level] = p.split(':');
    if (!modRaw) continue;
    const mod = CODE_ALIAS[modRaw] ?? modRaw;
    const cur = codes.get(mod) ?? { read: false, write: false };
    if (level === 'write' || level === '*' || level === 'aprobar' || level === 'aprobar-all') {
      cur.write = true;
      cur.read = true;
    } else if (level === 'read') {
      cur.read = true;
    }
    codes.set(mod, cur);
  }

  return MODULOS.flatMap((m) =>
    m.pantallas.map((pantalla) => {
      const key = `${m.label} · ${pantalla}`;
      if (all) return { pantalla: key, lectura: true, escritura: true };
      const c = codes.get(m.code);
      if (!c) return { pantalla: key, lectura: false, escritura: false };
      return {
        pantalla: key,
        lectura: c.read || c.write,
        escritura: c.write,
      };
    }),
  );
}

async function main() {
  const roles = await prisma.rol.findMany({ orderBy: { nombre: 'asc' } });
  console.log(`Roles: ${roles.length}`);
  for (const rol of roles) {
    const matrix = matrixFromPermisos(rol.permisos);
    const rw = matrix.filter((p) => p.escritura).length;
    const r = matrix.filter((p) => p.lectura && !p.escritura).length;
    await prisma.rol.update({
      where: { id: rol.id },
      data: { permisosPantalla: matrix },
    });
    console.log(
      `  ${rol.id} ${rol.nombre}: pantallas RW=${rw} R=${r} (from [${rol.permisos.join(', ')}])`,
    );
  }
  console.log('\nOK permisosPantalla sembrados.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
