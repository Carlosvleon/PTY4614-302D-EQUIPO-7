import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { seedDemoShowcase } from './seed-demo-showcase';
import { seedAprobacionesFase2 } from './seed-aprobaciones-fase2';
import {
  seedMaestrosFlujoAlmahue,
  seedFlujoOperativoOcOv,
} from './seed-flujo-oc-ov-almahue';
import { seedTiposReferenciaAgrosoft } from './seed-tipos-referencia';
import { seedCodigosFinancierosReu } from './seed-codigos-financieros-reu';
import { seedFlujoExcelAlmahue } from './seed-flujo-excel-almahue';

const dbUrl = process.env.DATABASE_URL!;
const url = new URL(dbUrl);
const schema = url.searchParams.get('schema') || 'public';
const adapter = new PrismaPg({ connectionString: dbUrl }, { schema });
const prisma = new PrismaClient({ adapter });

type PlanCuentaSeed = {
  codigoExcel: string;
  codigo: string;
  nombre: string;
  nivel: number;
  tipo: 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'GASTO';
  requiereCc: boolean;
  requiereArea: boolean;
  requiereEspecie: boolean;
  requiereElemento: boolean;
  noImputable: boolean;
  padreCodigoExcel: string | null;
};

function loadJson<T>(fileName: string): T | null {
  const path = join(__dirname, 'data', fileName);
  if (!existsSync(path)) {
    console.warn(`  [seed] JSON no encontrado: ${path}`);
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

async function seedPlanCuentasFromJson(empresaId: string) {
  const rows = loadJson<PlanCuentaSeed[]>('plan-cuentas-almahue.json');
  if (!rows?.length) {
    // fallback mínimo
    await prisma.cuentaContable.deleteMany({ where: { empresaId } });
    for (const c of [
      { codigo: '1-0-00-00', nombre: 'ACTIVO', tipo: 'ACTIVO' as const, nivel: 1, noImputable: true },
      { codigo: '1-1-00-00', nombre: 'ACTIVO CORRIENTE', tipo: 'ACTIVO' as const, nivel: 2, noImputable: true },
      { codigo: '1-1-01-00', nombre: 'EFECTIVO', tipo: 'ACTIVO' as const, nivel: 3, noImputable: true },
      { codigo: '1-1-01-01', nombre: 'Caja', tipo: 'ACTIVO' as const, nivel: 4, noImputable: false },
    ]) {
      await prisma.cuentaContable.create({
        data: { ...c, activa: true, empresaId },
      });
    }
    // link padres fallback
    const all = await prisma.cuentaContable.findMany({ where: { empresaId } });
    const byCodigo = new Map(all.map((r) => [r.codigo, r.id]));
    const links: Array<[string, string]> = [
      ['1-1-00-00', '1-0-00-00'],
      ['1-1-01-00', '1-1-00-00'],
      ['1-1-01-01', '1-1-01-00'],
    ];
    for (const [child, parent] of links) {
      await prisma.cuentaContable.update({
        where: { id: byCodigo.get(child)! },
        data: { padreId: byCodigo.get(parent)! },
      });
    }
    console.log(`  plan cuentas fallback (${links.length + 1} nodos)`);
    return;
  }

  // Liberar FKs RESTRICT antes de recrear plan
  await prisma.configContableSii.deleteMany({ where: { empresaId } });
  await prisma.tarifaContratista.updateMany({
    where: { empresaId },
    data: { tipoContratoId: null },
  });
  await prisma.proformaContratista.updateMany({
    where: { empresaId },
    data: { tipoContratoId: null },
  });
  await prisma.ingresoLaborDiario.updateMany({
    where: { empresaId },
    data: { tipoContratoId: null },
  });
  await prisma.tipoContratoContratista.deleteMany({ where: { empresaId } });
  // Borrar de hojas a raíces
  const existing = await prisma.cuentaContable.findMany({
    where: { empresaId },
    select: { id: true, nivel: true },
    orderBy: { nivel: 'desc' },
  });
  for (const r of existing) {
    await prisma.cuentaContable.delete({ where: { id: r.id } });
  }

  const sorted = [...rows].sort((a, b) => a.nivel - b.nivel || a.codigo.localeCompare(b.codigo));
  const idByExcel = new Map<string, string>();

  for (const r of sorted) {
    const padreId = r.padreCodigoExcel ? idByExcel.get(r.padreCodigoExcel) ?? null : null;
    const created = await prisma.cuentaContable.create({
      data: {
        codigo: r.codigo,
        codigoExcel: r.codigoExcel,
        nombre: r.nombre,
        tipo: r.tipo,
        nivel: r.nivel,
        padreId,
        requiereCc: r.requiereCc,
        requiereArea: r.requiereArea,
        requiereEspecie: r.requiereEspecie,
        requiereElemento: r.requiereElemento,
        noImputable: r.noImputable,
        activa: true,
        empresaId,
      },
    });
    idByExcel.set(r.codigoExcel, created.id);
  }
  console.log(`  plan cuentas Agrosoft: ${sorted.length} cuentas`);
}

async function seedElementosFromJson(empresaId: string) {
  const rows = loadJson<Array<{ codigo: string; nombre: string; departamento: string }>>(
    'elementos-costo-almahue.json',
  );
  if (!rows?.length) return;
  await prisma.elementoCosto.deleteMany({ where: { empresaId } });
  for (const r of rows) {
    await prisma.elementoCosto.create({
      data: {
        codigo: r.codigo.trim(),
        nombre: r.nombre.trim(),
        departamento: r.departamento || 'GENERAL',
        vigencia: 'VIGENTE',
        empresaId,
      },
    });
  }
  console.log(`  elementos de costo Agrosoft: ${rows.length}`);
}

async function seedPeriodosContables(empresaId: string) {
  const now = new Date();
  const anio = now.getUTCFullYear();
  const mes = now.getUTCMonth() + 1;
  const periodos: Array<{ codigo: string; anio: number; mes: number; activo: boolean }> = [];
  // mes anterior + actual (+ julio 2026 si estamos en demo fija)
  for (const offset of [-1, 0]) {
    const d = new Date(Date.UTC(anio, mes - 1 + offset, 1));
    const a = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    periodos.push({
      codigo: `${a}-${String(m).padStart(2, '0')}`,
      anio: a,
      mes: m,
      activo: offset === 0,
    });
  }
  if (!periodos.some((p) => p.codigo === '2026-07')) {
    periodos.push({ codigo: '2026-07', anio: 2026, mes: 7, activo: false });
  }

  await prisma.periodoContable.deleteMany({ where: { empresaId } });
  for (const p of periodos) {
    const fechaDesde = new Date(Date.UTC(p.anio, p.mes - 1, 1));
    const fechaHasta = new Date(Date.UTC(p.anio, p.mes, 0));
    await prisma.periodoContable.create({
      data: {
        empresaId,
        codigo: p.codigo,
        anio: p.anio,
        mes: p.mes,
        fechaDesde,
        fechaHasta,
        estado: 'ABIERTO',
        activo: p.activo,
      },
    });
  }
  console.log(`  periodos contables: ${periodos.map((p) => p.codigo).join(', ')}`);
}

async function seedConfigContableSii(empresaId: string) {
  const cuentas = await prisma.cuentaContable.findMany({
    where: { empresaId, activa: true, noImputable: false },
    orderBy: { codigo: 'asc' },
  });
  if (!cuentas.length) {
    console.warn('  config SII omitida: sin cuentas imputables');
    return;
  }
  // Entre varios candidatos gana el que no exige dimensiones: el asiento
  // automático las copia del mapeo y una cuenta con requiereCc sin CC cargado
  // deja la contabilización bloqueada.
  const menosDimensiones = (a: (typeof cuentas)[number], b: (typeof cuentas)[number]) => {
    const peso = (c: typeof a) =>
      Number(c.requiereCc) + Number(c.requiereArea) + Number(c.requiereElemento);
    return peso(a) - peso(b) || a.codigo.localeCompare(b.codigo);
  };
  const pick = (predicados: Array<(c: (typeof cuentas)[number]) => boolean>) => {
    for (const p of predicados) {
      const match = cuentas.filter(p).sort(menosDimensiones)[0];
      if (match) return match;
    }
    return cuentas[0];
  };

  const caja = pick([
    (c) => c.codigo === '1-1-01-01',
    (c) => /^caja|banco/i.test(c.nombre) && c.tipo === 'ACTIVO',
  ]);
  const proveedores = pick([
    (c) => /proveedor/i.test(c.nombre) && c.tipo === 'PASIVO',
    (c) => c.codigo === '2-1-01-01',
  ]);
  // Contratistas es GASTO de mano de obra, nunca una cuenta de ingresos.
  const labores = pick([
    (c) => /mano de obra.*contratista|contratista.*mano de obra/i.test(c.nombre),
    (c) => /contratista/i.test(c.nombre) && c.tipo === 'GASTO',
    (c) => /mano de obra/i.test(c.nombre) && c.tipo === 'GASTO',
    (c) => c.tipo === 'GASTO',
  ]);
  const ingreso = pick([
    (c) => c.tipo === 'INGRESO',
    (c) => c.codigo.startsWith('5-'),
  ]);
  const ivaDebito = pick([
    (c) => /iva/i.test(c.nombre) && c.tipo === 'PASIVO',
    (c) => c.id === proveedores.id,
  ]);
  const ivaCredito = pick([
    (c) => /iva/i.test(c.nombre) && c.tipo === 'ACTIVO',
    (c) => c.id === caja.id,
  ]);
  const clientes = pick([
    (c) => /cliente/i.test(c.nombre),
    (c) => c.id === caja.id,
  ]);

  const [ccs, areas, ecs] = await Promise.all([
    prisma.centroCosto.findMany({
      where: { empresaId, activa: true },
      orderBy: { codigo: 'asc' },
      select: { id: true },
    }),
    prisma.areaNegocio.findMany({
      where: { empresaId, activa: true },
      orderBy: { codigo: 'asc' },
      select: { id: true },
    }),
    prisma.elementoCosto.findMany({
      where: { empresaId },
      orderBy: { codigo: 'asc' },
      select: { id: true },
    }),
  ]);

  const faltantes: string[] = [];
  const dimensionesDe = (cuenta: (typeof cuentas)[number], clave: string) => {
    const dims = {
      centroCostoId: cuenta.requiereCc ? (ccs[0]?.id ?? null) : null,
      areaNegocioId: cuenta.requiereArea ? (areas[0]?.id ?? null) : null,
      elementoCostoId: cuenta.requiereElemento ? (ecs[0]?.id ?? null) : null,
    };
    if (cuenta.requiereCc && !dims.centroCostoId) faltantes.push(`${clave}: sin centro de costo`);
    if (cuenta.requiereArea && !dims.areaNegocioId) faltantes.push(`${clave}: sin área de negocio`);
    if (cuenta.requiereElemento && !dims.elementoCostoId) {
      faltantes.push(`${clave}: sin elemento de costo`);
    }
    return dims;
  };

  const items = [
    { tipoDocumentoSii: '33', codigoSii: '33', nombre: 'Factura electrónica venta', cuenta: ingreso, lado: 'HABER' },
    { tipoDocumentoSii: '34', codigoSii: '34', nombre: 'Factura exenta venta', cuenta: ingreso, lado: 'HABER' },
    { tipoDocumentoSii: '61', codigoSii: '61', nombre: 'Nota de crédito', cuenta: ingreso, lado: 'DEBE' },
    { tipoDocumentoSii: '46', codigoSii: '46', nombre: 'Factura compra', cuenta: labores, lado: 'DEBE' },
    { tipoDocumentoSii: 'CLIENTES', codigoSii: null, nombre: 'Clientes por cobrar', cuenta: clientes, lado: 'DEBE' },
    { tipoDocumentoSii: 'PROVEEDORES', codigoSii: null, nombre: 'Proveedores', cuenta: proveedores, lado: 'HABER' },
    { tipoDocumentoSii: 'IVA_DEBITO', codigoSii: null, nombre: 'IVA débito fiscal', cuenta: ivaDebito, lado: 'HABER' },
    { tipoDocumentoSii: 'IVA_CREDITO', codigoSii: null, nombre: 'IVA crédito fiscal', cuenta: ivaCredito, lado: 'DEBE' },
    { tipoDocumentoSii: 'CONTRATISTAS', codigoSii: null, nombre: 'Gasto MO contratistas', cuenta: labores, lado: 'DEBE' },
    { tipoDocumentoSii: 'BODEGA', codigoSii: null, nombre: 'Inventario / bodega', cuenta: caja, lado: 'DEBE' },
  ];

  await prisma.configContableSii.deleteMany({ where: { empresaId } });
  for (const it of items) {
    await prisma.configContableSii.create({
      data: {
        empresaId,
        tipoDocumentoSii: it.tipoDocumentoSii,
        codigoSii: it.codigoSii,
        nombre: it.nombre,
        cuentaContableId: it.cuenta.id,
        ...dimensionesDe(it.cuenta, it.tipoDocumentoSii),
        lado: it.lado,
        activa: true,
      },
    });
  }
  const tipoContrato = await prisma.tipoContratoContratista.upsert({
    where: {
      empresaId_codigo: { empresaId, codigo: 'MANO_OBRA' },
    },
    update: {
      nombre: 'Mano de obra contratista',
      cuentaDebeId: labores.id,
      cuentaHaberId: proveedores.id,
      cuentaAdministracionId: labores.id,
      activa: true,
    },
    create: {
      empresaId,
      codigo: 'MANO_OBRA',
      nombre: 'Mano de obra contratista',
      cuentaDebeId: labores.id,
      cuentaHaberId: proveedores.id,
      cuentaAdministracionId: labores.id,
      activa: true,
    },
  });
  await prisma.tarifaContratista.updateMany({
    where: { empresaId, tipoContratoId: null },
    data: { tipoContratoId: tipoContrato.id },
  });
  await prisma.proformaContratista.updateMany({
    where: { empresaId, tipoContratoId: null },
    data: { tipoContratoId: tipoContrato.id },
  });
  await prisma.ingresoLaborDiario.updateMany({
    where: { empresaId, tipoContratoId: null },
    data: { tipoContratoId: tipoContrato.id },
  });
  console.log(`  config contable SII: ${items.length} mapeos`);
  if (faltantes.length) {
    console.warn(
      `  [seed] mapeos sin dimensión obligatoria (completar en Contabilidad › Cuentas por tipo de documento): ${faltantes.join('; ')}`,
    );
  }
}

async function seedCentrosExcelEmp1() {
  const rows = loadJson<
    Array<{
      codigo: string;
      nombre: string;
      codEmpresaExcel: number | null;
    }>
  >('centros-costo-almahue.json');
  if (!rows?.length) return;
  const emp1 = rows.filter((r) => r.codEmpresaExcel === 1);
  let n = 0;
  for (const r of emp1) {
    const id = `CC-XLS-${r.codigo}`;
    await prisma.centroCosto.upsert({
      where: { id },
      update: { nombre: r.nombre, codigo: r.codigo, activa: true, empresaId: 'EMP-1' },
      create: {
        id,
        codigo: r.codigo,
        nombre: r.nombre,
        activa: true,
        empresaId: 'EMP-1',
        vigenciaDesde: new Date('2025-01-01'),
      },
    });
    n += 1;
  }
  console.log(`  centros de costo Excel EMP-1: ${n} (además de centros demo)`);
}

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

/** DEC-13 / R2-R01: Digitador contratistas / Analista / Administrador (+ Contador).
 *  Nota: la matriz R/W por pantalla vive en el front (demo + proyección UI en real).
 *  Tras cambiar nombres, re-ejecutar seed (`npx prisma db seed`) para alinear BD local. */
const ROLES = [
  {
    id: 'ROL-1',
    codigo: 'SUPERADMIN',
    nombre: 'Administrador',
    permisos: ['*'],
    aprobarConPin: true,
  },
  {
    id: 'ROL-2',
    codigo: 'ANALISTA',
    nombre: 'Analista',
    /** Solo lectura operativa: no aprueba. Los jefes viven en Admin › Workflow. */
    aprobarConPin: false,
    permisos: [
      'contratistas:read',
      'compras:read',
      'insumos:read',
      'contabilidad:read',
      'tesoreria:read',
      'comercial:read',
      'catalogos:read',
      'reportes:read',
    ],
  },
  {
    id: 'ROL-3',
    codigo: 'DIGITADOR_CONTRATISTAS',
    nombre: 'Digitador contratistas',
    permisos: [
      'contratistas:read',
      'contratistas:capture',
    ],
  },
  {
    id: 'ROL-4',
    codigo: 'CONTADOR',
    nombre: 'Contador',
    permisos: [
      'contabilidad:*',
      'tesoreria:read',
      'tesoreria:write',
      'comercial:read',
      'reportes:read',
      'contratistas:read',
    ],
  },
  {
    id: 'ROL-5',
    codigo: 'JEFATURA_CONTRATISTAS',
    nombre: 'Jefatura contratistas',
    permisos: [
      'contratistas:read',
      'contratistas:capture',
      'contratistas:catalogs',
      'contratistas:rates',
      'contratistas:rate-override',
      'contratistas:finalize',
      'contratistas:invoice',
      'contratistas:reverse',
      'contratistas:audit',
    ],
  },
] as const;

const EMPRESAS = [
  {
    id: 'EMP-1',
    rut: '76.123.456-0',
    razonSocial: 'Almahue SpA',
    giro: 'Agrícola / packing',
    activa: true,
    direccion: 'Camino Almahue s/n',
    comuna: 'Santa Cruz',
    ciudad: 'Santa Cruz',
    telefono: '+56 72 200 0000',
    emailContacto: 'contacto@almahue.cl',
    plantillaDoc: {
      showLogo: true,
      showAddress: true,
      showFooter: true,
      footerText: 'Almahue SpA · Documento generado desde ERP · uso interno',
      watermarkText: '',
      watermarkOpacity: 0.1,
      columns: { folio: true, contraparte: true, fecha: true, neto: true, estado: true, extra: true },
    },
  },
  {
    id: 'EMP-2',
    rut: '77.234.567-4',
    razonSocial: 'Almahue Logística Ltda.',
    giro: 'Transporte y almacenaje',
    activa: true,
  },
  {
    id: 'EMP-3',
    rut: '78.345.678-8',
    razonSocial: 'Frutícola Sur SpA',
    giro: 'Exportación frutícola',
    activa: false,
  },
] as const;

const USUARIOS = [
  { id: 'U-1', nombre: 'Admin Almahue', email: 'admin@almahue.local', username: 'AADMIN', password: 'Admin123!', rolId: 'ROL-1', empresaId: 'EMP-1', activo: true },
  { id: 'U-2', nombre: 'Carolina Pérez', email: 'cperez@almahue.cl', username: 'CPEREZ', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-3', nombre: 'Jorge Sánchez', email: 'jsanchez@almahue.cl', username: 'JSANCHEZ', password: 'demo123', rolId: 'ROL-3', empresaId: 'EMP-1', activo: true },
  { id: 'U-4', nombre: 'Ana Torres', email: 'atorres@almahue.cl', username: 'ATORRES', password: 'demo123', rolId: 'ROL-4', empresaId: 'EMP-1', activo: true },
  { id: 'U-5', nombre: 'Pedro Rojas', email: 'projas@almahue.cl', username: 'PROJAS', password: 'demo123', rolId: 'ROL-3', empresaId: 'EMP-2', activo: true },
  { id: 'U-6', nombre: 'María González', email: 'mgonzalez@almahue.cl', username: 'MGONZALEZ', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-59', nombre: 'Jefatura Contratistas', email: 'jcontratistas@almahue.cl', username: 'JCONTRATISTAS', password: 'demo123', rolId: 'ROL-5', empresaId: 'EMP-1', activo: true },
  { id: 'U-7', nombre: 'Claudia Vargas', email: 'cvargas@almahue.cl', username: 'CVARGAS', password: 'demo123', rolId: 'ROL-4', empresaId: 'EMP-1', activo: true },
  { id: 'U-8', nombre: 'Ricardo Muñoz', email: 'rmunoz@almahue.cl', username: 'RMUNOZ', password: 'demo123', rolId: 'ROL-4', empresaId: 'EMP-1', activo: true },
  { id: 'U-9', nombre: 'Pablo Núñez', email: 'pnunez@almahue.cl', username: 'PNUNEZ', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-10', nombre: 'Laura Soto', email: 'lsoto@almahue.cl', username: 'LSOTO', password: 'demo123', rolId: 'ROL-4', empresaId: 'EMP-1', activo: true },
  { id: 'U-11', nombre: 'Diego Morales', email: 'dmorales@almahue.cl', username: 'DMORALES', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-12', nombre: 'Fernanda Ruiz', email: 'fruiz@almahue.cl', username: 'FRUIZ', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-13', nombre: 'Roberto Silva', email: 'rsilva@almahue.cl', username: 'RSILVA', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-14', nombre: 'Andrés Mena', email: 'amena@almahue.cl', username: 'AMENA', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-15', nombre: 'Luis Herrera', email: 'lherrera@almahue.cl', username: 'LHERRERA', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-16', nombre: 'Carmen Flores', email: 'cflores@almahue.cl', username: 'CFLORES', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-17', nombre: 'Miguel Castro', email: 'mcastro@almahue.cl', username: 'MCASTRO', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-18', nombre: 'Sofía Bravo', email: 'sbravo@almahue.cl', username: 'SBRAVO', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-19', nombre: 'Héctor Paredes', email: 'hparedes@almahue.cl', username: 'HPAREDES', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-20', nombre: 'Valentina Ortiz', email: 'vortiz@almahue.cl', username: 'VORTIZ', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-21', nombre: 'Nicolás Reyes', email: 'nreyes@almahue.cl', username: 'NREYES', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-22', nombre: 'Tomás Vidal', email: 'tvidal@almahue.cl', username: 'TVIDAL', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-23', nombre: 'Camila Soto', email: 'csoto@almahue.cl', username: 'CSOTO', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-24', nombre: 'Ignacio Fuentes', email: 'ifuentes@almahue.cl', username: 'IFUENTES', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-25', nombre: 'Patricia Lagos', email: 'plagos@almahue.cl', username: 'PLAGOS', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-26', nombre: 'Sebastián Díaz', email: 'sdiaz@almahue.cl', username: 'SDIAZ', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-27', nombre: 'Javiera Campos', email: 'jcampos@almahue.cl', username: 'JCAMPOS', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-28', nombre: 'Daniela Rojas', email: 'drojas@almahue.cl', username: 'DROJAS', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-29', nombre: 'Felipe Araya', email: 'faraya@almahue.cl', username: 'FARAYA', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-30', nombre: 'Antonia Vera', email: 'avera@almahue.cl', username: 'AVERA', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-31', nombre: 'Rodrigo Salas', email: 'rsalas@almahue.cl', username: 'RSALAS', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-32', nombre: 'Elena Miranda', email: 'emiranda@almahue.cl', username: 'EMIRANDA', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-33', nombre: 'Gustavo León', email: 'gleon@almahue.cl', username: 'GLEON', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-34', nombre: 'Francisca Tapia', email: 'ftapia@almahue.cl', username: 'FTAPIA', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-35', nombre: 'Bruno Aguirre', email: 'baguirre@almahue.cl', username: 'BAGUIRRE', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-36', nombre: 'Catalina Méndez', email: 'cmendez@almahue.cl', username: 'CMENDEZ', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-37', nombre: 'Matías Contreras', email: 'mcontreras@almahue.cl', username: 'MCONTRERAS', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-38', nombre: 'Constanza Figueroa', email: 'cfigueroa@almahue.cl', username: 'CFIGUEROA', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-39', nombre: 'Benjamín Acuña', email: 'bacuna@almahue.cl', username: 'BACUNA', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-40', nombre: 'Isidora Pizarro', email: 'ipizarro@almahue.cl', username: 'IPIZARRO', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-41', nombre: 'Martín Quintero', email: 'mquintero@almahue.cl', username: 'MQUINTERO', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-42', nombre: 'Paula Henríquez', email: 'phenriquez@almahue.cl', username: 'PHENRIQUEZ', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-43', nombre: 'Álvaro Peña', email: 'apena@almahue.cl', username: 'APENA', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
  { id: 'U-44', nombre: 'Natalia Correa', email: 'ncorrea@almahue.cl', username: 'NCORREA', password: 'demo123', rolId: 'ROL-2', empresaId: 'EMP-1', activo: true },
] as const;

const CENTROS = [
  { id: 'CC-EMP-1-1', codigo: 'ADM', nombre: 'Administración', empresaId: 'EMP-1' },
  { id: 'CC-EMP-1-2', codigo: 'PACK', nombre: 'Packing', empresaId: 'EMP-1' },
  { id: 'CC-EMP-1-3', codigo: 'CAMPO', nombre: 'Campo / Cuarteles', empresaId: 'EMP-1' },
  { id: 'CC-EMP-2-1', codigo: 'LOG', nombre: 'Logística', empresaId: 'EMP-2' },
] as const;

const CONTRATISTAS = [
  { id: 'CTR-EMP-1-1', rut: '76.111.222-3', razonSocial: 'Servicios Agrícolas del Valle', especialidad: 'Cosecha', empresaId: 'EMP-1', activo: true },
  { id: 'CTR-EMP-1-2', rut: '77.222.333-4', razonSocial: 'Labores de Campo Sur', especialidad: 'Poda / raleo', empresaId: 'EMP-1', activo: true },
  { id: 'CTR-EMP-1-3', rut: '78.333.444-5', razonSocial: 'Packaging Express', especialidad: 'Embalaje', empresaId: 'EMP-1', activo: true },
  { id: 'CTR-EMP-2-1', rut: '79.555.666-7', razonSocial: 'Transportes Campo Ltda.', especialidad: 'Transporte', empresaId: 'EMP-2', activo: true },
] as const;

async function main() {
  console.log('[seed] Iniciando ERP core + contratistas/tarifas…');

  for (const r of ROLES) {
    // PIN: solo Admin / roles de aprobación. Analista y digitador nunca.
    const explicit = (r as { aprobarConPin?: boolean }).aprobarConPin;
    const aprobarConPin =
      explicit !== undefined
        ? explicit
        : r.id === 'ROL-1'
          || /aprob/i.test(r.nombre)
          || /aprob/i.test(r.codigo);
    await prisma.rol.upsert({
      where: { id: r.id },
      update: {
        nombre: r.nombre,
        permisos: [...r.permisos],
        codigo: r.codigo,
        aprobarConPin,
      },
      create: {
        id: r.id,
        codigo: r.codigo,
        nombre: r.nombre,
        permisos: [...r.permisos],
        aprobarConPin,
      },
    });
  }
  // Roles pre-Reu2 (Intermedio/Lectura/etc. quedaban como ROL-5): reasignar y borrar.
  await prisma.usuario.updateMany({
    where: { rolId: { notIn: ROLES.map((r) => r.id) } },
    data: { rolId: 'ROL-2' },
  });
  const obsolete = await prisma.rol.deleteMany({
    where: { id: { notIn: ROLES.map((r) => r.id) } },
  });
  if (obsolete.count) console.log(`  roles obsoletos eliminados: ${obsolete.count}`);
  console.log(`  ${ROLES.length} roles (Reu2)`);

  for (const e of EMPRESAS) {
    await prisma.empresa.upsert({
      where: { id: e.id },
      update: {
        razonSocial: e.razonSocial,
        rut: e.rut,
        giro: e.giro,
        activa: e.activa,
        ...('direccion' in e
          ? {
              direccion: e.direccion,
              comuna: e.comuna,
              ciudad: e.ciudad,
              telefono: e.telefono,
              emailContacto: e.emailContacto,
              plantillaDoc: e.plantillaDoc,
            }
          : {}),
      },
      create: { ...e },
    });
  }
  console.log(`  ${EMPRESAS.length} empresas`);

  await prisma.sucursal.upsert({
    where: { empresaId_codigo: { empresaId: 'EMP-1', codigo: 'CEN' } },
    update: { nombre: 'Casa Matriz' },
    create: { codigo: 'CEN', nombre: 'Casa Matriz', empresaId: 'EMP-1' },
  });

  for (const u of USUARIOS) {
    const passwordHash = await hash(u.password);
    await prisma.usuario.upsert({
      where: { id: u.id },
      update: {
        nombre: u.nombre,
        email: u.email.toLowerCase(),
        username: u.username,
        passwordHash,
        rolId: u.rolId,
        empresaId: u.empresaId,
        activo: u.activo,
      },
      create: {
        id: u.id,
        nombre: u.nombre,
        email: u.email.toLowerCase(),
        username: u.username,
        passwordHash,
        rolId: u.rolId,
        empresaId: u.empresaId,
        activo: u.activo,
      },
    });
    const accesoIds =
      u.id === 'U-1' || u.id === 'U-2'
        ? ['EMP-1', 'EMP-2']
        : [u.empresaId];
    await prisma.usuarioEmpresa.deleteMany({ where: { usuarioId: u.id } });
    for (const empresaId of accesoIds) {
      await prisma.usuarioEmpresa.create({
        data: { usuarioId: u.id, empresaId },
      });
    }
    console.log(`  Usuario: ${u.email} (${u.password}) · empresas ${accesoIds.join(',')}`);
  }

  // PIN demo reunión (guion): Admin aprueba OC con 4821
  const pinHash = await hash('4821');
  await prisma.usuario.update({
    where: { id: 'U-1' },
    data: { pinAprobacionHash: pinHash },
  });
  console.log('  PIN aprobación Admin: 4821');

  const ORGANIGRAMA: { id: string; jefeId: string | null; montoMax: number | null }[] = [
    { id: 'U-2', jefeId: 'U-6', montoMax: null },
    { id: 'U-3', jefeId: 'U-7', montoMax: null },
    { id: 'U-4', jefeId: 'U-7', montoMax: null },
    { id: 'U-6', jefeId: 'U-3', montoMax: 1_000_000 },
    { id: 'U-5', jefeId: 'U-1', montoMax: null },
    { id: 'U-7', jefeId: 'U-1', montoMax: 5_000_000 },
    { id: 'U-8', jefeId: 'U-1', montoMax: 3_000_000 },
    { id: 'U-9', jefeId: 'U-10', montoMax: 800_000 },
    { id: 'U-10', jefeId: 'U-8', montoMax: 2_500_000 },
    { id: 'U-11', jefeId: 'U-9', montoMax: null },
    { id: 'U-12', jefeId: 'U-9', montoMax: null },
    { id: 'U-13', jefeId: 'U-10', montoMax: 1_200_000 },
    { id: 'U-14', jefeId: 'U-10', montoMax: 600_000 },
    { id: 'U-15', jefeId: 'U-6', montoMax: null },
    { id: 'U-16', jefeId: 'U-13', montoMax: null },
    { id: 'U-17', jefeId: 'U-14', montoMax: null },
    { id: 'U-18', jefeId: 'U-19', montoMax: 350_000 },
    { id: 'U-19', jefeId: 'U-10', montoMax: 900_000 },
    { id: 'U-20', jefeId: 'U-21', montoMax: 450_000 },
    { id: 'U-21', jefeId: 'U-8', montoMax: 1_100_000 },
    { id: 'U-22', jefeId: 'U-6', montoMax: null },
    { id: 'U-23', jefeId: 'U-6', montoMax: null },
    { id: 'U-24', jefeId: 'U-6', montoMax: null },
    { id: 'U-25', jefeId: 'U-9', montoMax: null },
    { id: 'U-26', jefeId: 'U-9', montoMax: null },
    { id: 'U-27', jefeId: 'U-9', montoMax: null },
    { id: 'U-28', jefeId: 'U-13', montoMax: null },
    { id: 'U-29', jefeId: 'U-13', montoMax: null },
    { id: 'U-30', jefeId: 'U-13', montoMax: null },
    { id: 'U-31', jefeId: 'U-14', montoMax: null },
    { id: 'U-32', jefeId: 'U-14', montoMax: null },
    { id: 'U-33', jefeId: 'U-4', montoMax: null },
    { id: 'U-34', jefeId: 'U-4', montoMax: null },
    { id: 'U-35', jefeId: 'U-10', montoMax: null },
    { id: 'U-36', jefeId: 'U-19', montoMax: null },
    { id: 'U-37', jefeId: 'U-19', montoMax: null },
    { id: 'U-38', jefeId: 'U-19', montoMax: null },
    { id: 'U-39', jefeId: 'U-21', montoMax: null },
    { id: 'U-40', jefeId: 'U-21', montoMax: null },
    { id: 'U-41', jefeId: 'U-13', montoMax: null },
    { id: 'U-42', jefeId: 'U-13', montoMax: null },
    { id: 'U-43', jefeId: 'U-4', montoMax: null },
    { id: 'U-44', jefeId: 'U-4', montoMax: null },
  ];
  for (const o of ORGANIGRAMA) {
    await prisma.usuario.update({
      where: { id: o.id },
      data: { jefeId: o.jefeId, montoMaxAprobacion: o.montoMax },
    });
  }
  console.log('  organigrama aprobaciones (jefe + tope demo)');

  for (const cc of CENTROS) {
    await prisma.centroCosto.upsert({
      where: { id: cc.id },
      update: { codigo: cc.codigo, nombre: cc.nombre, activa: true, empresaId: cc.empresaId },
      create: {
        id: cc.id,
        codigo: cc.codigo,
        nombre: cc.nombre,
        activa: true,
        empresaId: cc.empresaId,
        vigenciaDesde: new Date('2025-01-01'),
      },
    });
  }
  console.log(`  ${CENTROS.length} centros de costo`);

  for (const c of CONTRATISTAS) {
    await prisma.contratista.upsert({
      where: { id: c.id },
      update: {
        rut: c.rut,
        razonSocial: c.razonSocial,
        especialidad: c.especialidad,
        activo: c.activo,
        empresaId: c.empresaId,
      },
      create: { ...c },
    });
  }
  console.log(`  ${CONTRATISTAS.length} contratistas`);

  const LABORES = [
    { id: 'LAB-EMP-1-1', codigo: 'COS-MAN', nombre: 'Cosecha manual', empresaId: 'EMP-1' },
    { id: 'LAB-EMP-1-2', codigo: 'SEL-PACK', nombre: 'Selección packing', empresaId: 'EMP-1' },
    { id: 'LAB-EMP-1-3', codigo: 'PODA', nombre: 'Poda', empresaId: 'EMP-1' },
    { id: 'LAB-EMP-1-4', codigo: 'ARM-CAJ', nombre: 'Armado cajas', empresaId: 'EMP-1' },
  ] as const;

  const ACTIVIDADES = [
    { id: 'ACT-EMP-1-1', codigo: 'COS-UVA', nombre: 'Cosecha uva', empresaId: 'EMP-1' },
    { id: 'ACT-EMP-1-2', codigo: 'PACK', nombre: 'Packing', empresaId: 'EMP-1' },
    { id: 'ACT-EMP-1-3', codigo: 'POD-INV', nombre: 'Poda invierno', empresaId: 'EMP-1' },
    { id: 'ACT-EMP-1-4', codigo: 'EMB', nombre: 'Embalaje', empresaId: 'EMP-1' },
  ] as const;

  for (const l of LABORES) {
    await prisma.labor.upsert({
      where: { id: l.id },
      update: { codigo: l.codigo, nombre: l.nombre, activa: true, empresaId: l.empresaId },
      create: { ...l, activa: true },
    });
  }
  for (const a of ACTIVIDADES) {
    await prisma.actividad.upsert({
      where: { id: a.id },
      update: { codigo: a.codigo, nombre: a.nombre, activa: true, empresaId: a.empresaId },
      create: { ...a, activa: true },
    });
  }
  console.log(`  ${LABORES.length} labores / ${ACTIVIDADES.length} actividades`);

  const links = [
    ['LAB-EMP-1-1', 'ACT-EMP-1-1'],
    ['LAB-EMP-1-2', 'ACT-EMP-1-2'],
    ['LAB-EMP-1-3', 'ACT-EMP-1-3'],
    ['LAB-EMP-1-4', 'ACT-EMP-1-4'],
    // N:N ejemplo: cosecha manual también puede ir a packing
    ['LAB-EMP-1-1', 'ACT-EMP-1-2'],
  ] as const;

  for (const [laborId, actividadId] of links) {
    await prisma.laborActividad.upsert({
      where: { laborId_actividadId: { laborId, actividadId } },
      update: {},
      create: { laborId, actividadId },
    });
  }

  await prisma.tarifaContratista.deleteMany({});

  const tarifasSeed = [
    {
      id: 'TAR-SEED-1',
      contratistaId: 'CTR-EMP-1-1',
      laborId: 'LAB-EMP-1-1',
      actividadId: 'ACT-EMP-1-1',
      tarifa: 18500,
      unidad: 'HR',
      centroCostoId: 'CC-EMP-1-3',
      empresaId: 'EMP-1',
    },
    {
      id: 'TAR-SEED-2',
      contratistaId: 'CTR-EMP-1-1',
      laborId: 'LAB-EMP-1-2',
      actividadId: 'ACT-EMP-1-2',
      tarifa: 14200,
      unidad: 'HR',
      centroCostoId: 'CC-EMP-1-2',
      empresaId: 'EMP-1',
    },
    {
      id: 'TAR-SEED-3',
      contratistaId: 'CTR-EMP-1-2',
      laborId: 'LAB-EMP-1-3',
      actividadId: 'ACT-EMP-1-3',
      tarifa: 22000,
      unidad: 'HR',
      centroCostoId: 'CC-EMP-1-3',
      empresaId: 'EMP-1',
    },
    {
      id: 'TAR-SEED-4',
      contratistaId: 'CTR-EMP-1-3',
      laborId: 'LAB-EMP-1-4',
      actividadId: 'ACT-EMP-1-4',
      tarifa: 980,
      unidad: 'CAJ',
      centroCostoId: 'CC-EMP-1-2',
      empresaId: 'EMP-1',
    },
  ] as const;

  for (const t of tarifasSeed) {
    await prisma.tarifaContratista.create({
      data: {
        id: t.id,
        contratistaId: t.contratistaId,
        laborId: t.laborId,
        actividadId: t.actividadId,
        tarifa: t.tarifa,
        unidad: t.unidad,
        centroCostoId: t.centroCostoId,
        empresaId: t.empresaId,
        vigenciaDesde: new Date('2026-01-01'),
      },
    });
  }
  console.log(`  ${tarifasSeed.length} tarifas`);

  await prisma.facturaContratista.deleteMany({});
  await prisma.proformaContratista.deleteMany({});
  // Proformas / ingresos / docs / OC / asientos / tesorería → seedDemoShowcase (fin del seed)
  console.log('  proformas/ingresos diferidos a demo showcase');

  const MONEDAS = [
    { id: 'MON-CLP', codigo: 'CLP', nombre: 'Peso chileno', simbolo: '$', focoReporteria: true },
    { id: 'MON-USD', codigo: 'USD', nombre: 'Dólar estadounidense', simbolo: 'US$', focoReporteria: true },
    { id: 'MON-CNY', codigo: 'CNY', nombre: 'Yuan chino', simbolo: '¥', focoReporteria: true },
    { id: 'MON-EUR', codigo: 'EUR', nombre: 'Euro', simbolo: '€', focoReporteria: true },
  ] as const;

  for (const m of MONEDAS) {
    await prisma.moneda.upsert({
      where: { codigo: m.codigo },
      update: { nombre: m.nombre, simbolo: m.simbolo, activa: true, focoReporteria: m.focoReporteria },
      create: { ...m, activa: true },
    });
  }
  console.log(`  ${MONEDAS.length} monedas`);

  const UNIDADES = [
    { id: 'UM-KG', codigo: 'KG', nombre: 'Kilogramo' },
    { id: 'UM-HR', codigo: 'HR', nombre: 'Hora' },
    { id: 'UM-CAJ', codigo: 'CAJ', nombre: 'Caja' },
    { id: 'UM-UN', codigo: 'UN', nombre: 'Unidad' },
    { id: 'UM-TON', codigo: 'TON', nombre: 'Tonelada' },
  ] as const;

  for (const u of UNIDADES) {
    await prisma.unidadMedida.upsert({
      where: { codigo: u.codigo },
      update: { nombre: u.nombre, activa: true },
      create: { ...u, activa: true },
    });
  }
  console.log(`  ${UNIDADES.length} unidades de medida`);

  const TIPOS_DOC = [
    // Compras
    { id: 'TD-FAC-COM', codigo: 'FAC', nombre: 'Factura de compra', modulo: 'Compras' },
    { id: 'TD-FCE-COM', codigo: 'FCE', nombre: 'Factura compra electrónica', modulo: 'Compras' },
    { id: 'TD-OC-COM', codigo: 'OC', nombre: 'Orden de compra', modulo: 'Compras' },
    { id: 'TD-OS-COM', codigo: 'OS', nombre: 'Orden de servicio', modulo: 'Compras' },
    { id: 'TD-NC-COM', codigo: 'NC', nombre: 'Nota de crédito compra', modulo: 'Compras' },
    { id: 'TD-ND-COM', codigo: 'ND', nombre: 'Nota de débito compra', modulo: 'Compras' },
    // Contratistas
    { id: 'TD-PRF-CTR', codigo: 'PRF', nombre: 'Proforma contratista', modulo: 'Contratistas' },
    { id: 'TD-FAC-CTR', codigo: 'FAC', nombre: 'Factura contratista', modulo: 'Contratistas' },
    { id: 'TD-1000-CTR', codigo: '1000', nombre: 'Boleta de honorarios con retención', modulo: 'Contratistas' },
    { id: 'TD-1001-CTR', codigo: '1001', nombre: 'Boleta honorario electrónica con retención', modulo: 'Contratistas' },
    { id: 'TD-1002-CTR', codigo: '1002', nombre: 'Boleta honorario electrónica sin retención', modulo: 'Contratistas' },
    { id: 'TD-1003-CTR', codigo: '1003', nombre: 'Boleta de honorarios sin retención', modulo: 'Contratistas' },
    { id: 'TD-1005-CTR', codigo: '1005', nombre: 'Boleta de honorarios de terceros', modulo: 'Contratistas' },
    // Insumos / bodega
    { id: 'TD-GR-INS', codigo: 'GR', nombre: 'Guía de recepción', modulo: 'Insumos' },
    { id: 'TD-NC-INS', codigo: 'NC', nombre: 'Nota de crédito devolución', modulo: 'Insumos' },
    { id: 'TD-REC-INS', codigo: 'REC', nombre: 'Recepción de bodega', modulo: 'Insumos' },
    { id: 'TD-TRA-INS', codigo: 'TRA', nombre: 'Traspaso de bodega', modulo: 'Insumos' },
    // Comercial
    { id: 'TD-FAE-COMER', codigo: 'FAE', nombre: 'Factura electrónica venta', modulo: 'Comercial' },
    { id: 'TD-BOL-COMER', codigo: 'BOL', nombre: 'Boleta de ventas', modulo: 'Comercial' },
    { id: 'TD-BEX-COMER', codigo: 'BEX', nombre: 'Boleta exenta electrónica', modulo: 'Comercial' },
    { id: 'TD-FEX-COMER', codigo: 'FEX', nombre: 'Factura exenta electrónica', modulo: 'Comercial' },
    { id: 'TD-NC-COMER', codigo: 'NC', nombre: 'Nota de crédito venta', modulo: 'Comercial' },
    { id: 'TD-ND-COMER', codigo: 'ND', nombre: 'Nota de débito venta', modulo: 'Comercial' },
    { id: 'TD-COT-COMER', codigo: 'COT', nombre: 'Cotización', modulo: 'Comercial' },
    { id: 'TD-GD-COMER', codigo: 'GD', nombre: 'Guía de despacho electrónica', modulo: 'Comercial' },
    { id: 'TD-101-COMER', codigo: '101', nombre: 'Factura de exportación', modulo: 'Comercial' },
    { id: 'TD-110-COMER', codigo: '110', nombre: 'Factura exportación electrónica', modulo: 'Comercial' },
    { id: 'TD-BL-COMER', codigo: 'BL', nombre: 'BL (conocimiento de embarque)', modulo: 'Comercial' },
    // Contabilidad
    { id: 'TD-ASI-CTB', codigo: 'ASI', nombre: 'Asiento contable', modulo: 'Contabilidad' },
    { id: 'TD-APE-CTB', codigo: 'APE', nombre: 'Asiento de apertura', modulo: 'Contabilidad' },
    { id: 'TD-CIE-CTB', codigo: 'CIE', nombre: 'Asiento de cierre', modulo: 'Contabilidad' },
    { id: 'TD-PROV-CTB', codigo: 'PROV', nombre: 'Provisión contable', modulo: 'Contabilidad' },
    { id: 'TD-AJU-CTB', codigo: 'AJU', nombre: 'Ajuste contable', modulo: 'Contabilidad' },
    { id: 'TD-914-CTB', codigo: '914', nombre: 'Declaración de ingreso', modulo: 'Contabilidad' },
    // Tesorería
    { id: 'TD-DEP-TES', codigo: 'DEP', nombre: 'Depósito', modulo: 'Tesorería' },
    { id: 'TD-CHQ-TES', codigo: 'CHQ', nombre: 'Cheque', modulo: 'Tesorería' },
    { id: 'TD-CHQM-TES', codigo: 'CHQM', nombre: 'Cheque manual', modulo: 'Tesorería' },
    { id: 'TD-TRANS-TES', codigo: 'TRANS', nombre: 'Transferencia', modulo: 'Tesorería' },
    { id: 'TD-ABO-TES', codigo: 'ABO', nombre: 'Abono', modulo: 'Tesorería' },
    { id: 'TD-ANT-TES', codigo: 'ANT', nombre: 'Anticipo', modulo: 'Tesorería' },
    { id: 'TD-EGR-TES', codigo: 'EGR', nombre: 'Egreso de caja', modulo: 'Tesorería' },
    { id: 'TD-ING-TES', codigo: 'ING', nombre: 'Ingreso de caja', modulo: 'Tesorería' },
    { id: 'TD-PAE-TES', codigo: 'PAE', nombre: 'Préstamo', modulo: 'Tesorería' },
    { id: 'TD-PAG-TES', codigo: 'PAG', nombre: 'Pagaré', modulo: 'Tesorería' },
    { id: 'TD-LET-TES', codigo: 'LET', nombre: 'Letra de cambio', modulo: 'Tesorería' },
    { id: 'TD-VAL-TES', codigo: 'VAL', nombre: 'Vales de rendición', modulo: 'Tesorería' },
    { id: 'TD-VB-TES', codigo: 'VB', nombre: 'Vales y boletas', modulo: 'Tesorería' },
    { id: 'TD-CAR-TES', codigo: 'CAR', nombre: 'Cargo', modulo: 'Tesorería' },
    { id: 'TD-COB-TES', codigo: 'COB', nombre: 'Cobro EERR', modulo: 'Tesorería' },
    { id: 'TD-FFMM-TES', codigo: 'FFMM', nombre: 'Fondos mutuos', modulo: 'Tesorería' },
    { id: 'TD-70-TES', codigo: '70', nombre: 'Caja chica', modulo: 'Tesorería' },
    { id: 'TD-75-TES', codigo: '75', nombre: 'Tarjeta de crédito', modulo: 'Tesorería' },
    { id: 'TD-76-TES', codigo: '76', nombre: 'Otro documento', modulo: 'Tesorería' },
  ] as const;

  for (const t of TIPOS_DOC) {
    await prisma.tipoDocumento.upsert({
      where: { codigo_modulo: { codigo: t.codigo, modulo: t.modulo } },
      update: { nombre: t.nombre, activo: true },
      create: { ...t, activo: true },
    });
  }
  const nRef = await seedTiposReferenciaAgrosoft(prisma);
  const nCf = await seedCodigosFinancierosReu(prisma);
  const nExcel = await seedFlujoExcelAlmahue(prisma);
  console.log(`  flujo Excel: ${nExcel.conceptos} conceptos, ${nExcel.codigos} códigos`);
  console.log(`  ${TIPOS_DOC.length} tipos de documento + ${nRef} tipos de referencia Agrosoft`);
  console.log(`  ${nCf} códigos financieros de ejemplo Reu1–3 (no catálogo Agrosoft completo)`);

  await prisma.syncBcMeta.upsert({
    where: { id: 'default' },
    update: { horaProgramada: '09:00' },
    create: {
      id: 'default',
      autoSync: false,
      horaProgramada: '09:00',
      horarios: '09:00',
      lastSync: new Date('2026-07-21T09:05:00'),
    },
  });

  const indicadores = [
    { id: 'BC-1', fecha: new Date('2026-07-25'), usd: 968.4, eur: 1048.2, cny: 133.8 },
    { id: 'BC-2', fecha: new Date('2026-07-26'), usd: 970.1, eur: 1050.5, cny: 134.0 },
    { id: 'BC-3', fecha: new Date('2026-07-27'), usd: 972.0, eur: 1052.0, cny: 134.2 },
    { id: 'BC-4', fecha: new Date('2026-08-28'), usd: 945.5, eur: 1104.0, cny: 131.2 },
    { id: 'BC-5', fecha: new Date('2026-08-31'), usd: 948.0, eur: 1106.0, cny: 131.8 },
    { id: 'BC-6', fecha: new Date('2026-09-01'), usd: 950.2, eur: 1108.0, cny: 132.1 },
  ] as const;

  for (const ind of indicadores) {
    const existing = await prisma.indicadorBc.findFirst({
      where: { fecha: ind.fecha, empresaId: null },
    });
    if (existing) {
      await prisma.indicadorBc.update({
        where: { id: existing.id },
        data: { usd: ind.usd, eur: ind.eur, cny: ind.cny, fuente: 'BCCh' },
      });
    } else {
      await prisma.indicadorBc.create({
        data: {
          id: ind.id,
          fecha: ind.fecha,
          usd: ind.usd,
          eur: ind.eur,
          cny: ind.cny,
          fuente: 'BCCh',
          completadoFeriado: false,
          empresaId: null,
        },
      });
    }
  }
  console.log(`  ${indicadores.length} indicadores BC`);

  // ---- Maestros + periodos + demo showcase (ruta reunión) ----
  await seedPlanCuentasFromJson('EMP-1');
  await seedElementosFromJson('EMP-1');
  for (const area of [
    { id: 'AN-EMP-1-1', codigo: 'PACK', nombre: 'Packing', empresaId: 'EMP-1' },
    { id: 'AN-EMP-1-2', codigo: 'CAMPO', nombre: 'Campo', empresaId: 'EMP-1' },
  ]) {
    await prisma.areaNegocio.upsert({
      where: { id: area.id },
      update: { codigo: area.codigo, nombre: area.nombre, activa: true, empresaId: area.empresaId },
      create: { ...area, activa: true },
    });
  }
  console.log('  2 áreas de negocio demo EMP-1');
  await seedPeriodosContables('EMP-1');
  // Variedad: julio CERRADO, agosto ABIERTO (activo)
  await prisma.periodoContable.updateMany({
    where: { empresaId: 'EMP-1', codigo: '2026-07' },
    data: { estado: 'CERRADO', activo: false },
  });
  await prisma.periodoContable.updateMany({
    where: { empresaId: 'EMP-1', codigo: { not: '2026-07' }, activo: true },
    data: { estado: 'ABIERTO' },
  });
  await seedConfigContableSii('EMP-1');
  await seedCentrosExcelEmp1();

  await prisma.cliente.deleteMany({ where: { empresaId: { in: ['EMP-1', 'EMP-2'] } } });
  await prisma.cliente.createMany({
    data: [
      {
        id: 'CLI-SEED-1',
        rut: '76.999.888-8',
        razonSocial: 'Exportadora Frutas del Sur',
        credito: 50000000,
        vendedor: 'María González',
        activo: true,
        empresaId: 'EMP-1',
      },
      {
        id: 'CLI-SEED-1B',
        rut: '76.111.000-4',
        razonSocial: 'Comercial Packing Centro',
        credito: 15000000,
        vendedor: 'María González',
        activo: true,
        empresaId: 'EMP-1',
      },
      {
        id: 'CLI-SEED-2',
        rut: '77.888.777-0',
        razonSocial: 'Distribuidora Logística Norte',
        credito: 25000000,
        vendedor: 'Pedro Rojas',
        activo: true,
        empresaId: 'EMP-2',
      },
      {
        id: 'CLI-SEED-2B',
        rut: '76.555.444-6',
        razonSocial: 'Comercial Agro Logística SpA',
        credito: 12000000,
        vendedor: 'Pedro Rojas',
        activo: true,
        empresaId: 'EMP-2',
      },
    ],
  });

  await seedMaestrosFlujoAlmahue(prisma);

  // Nivel 1 Contratistas: toda factura recibida vive en RegistroCompra, por lo
  // que cada Contratista demo debe compartir identidad con un Proveedor.
  for (const contratista of CONTRATISTAS) {
    const proveedor = await prisma.proveedor.upsert({
      where: {
        empresaId_rut: {
          empresaId: contratista.empresaId,
          rut: contratista.rut,
        },
      },
      update: {
        razonSocial: contratista.razonSocial,
        activo: contratista.activo,
      },
      create: {
        empresaId: contratista.empresaId,
        rut: contratista.rut,
        razonSocial: contratista.razonSocial,
        activo: contratista.activo,
      },
    });
    await prisma.contratista.update({
      where: { id: contratista.id },
      data: { proveedorId: proveedor.id },
    });
  }

  await seedDemoShowcase(prisma);

  await prisma.workflowConfig.upsert({
    where: { id: 'WF-COMPRAS-1' },
    update: {
      nombre: 'Aprobación OC estándar',
      modulo: 'Compras',
      montoMin: 0,
      montoMax: 999999999,
      aprobadores: 1,
      aprobadorIds: ['U-1', 'U-6'],
      activo: true,
      empresaId: 'EMP-1',
    },
    create: {
      id: 'WF-COMPRAS-1',
      nombre: 'Aprobación OC estándar',
      modulo: 'Compras',
      montoMin: 0,
      montoMax: 999999999,
      aprobadores: 1,
      aprobadorIds: ['U-1', 'U-6'],
      activo: true,
      empresaId: 'EMP-1',
    },
  });
  console.log('  workflows: Compras');

  await seedAprobacionesFase2(prisma, 'EMP-1');

  const demoFlujo =
    (process.env.SEED_DEMO_PROPUESTA || 'true').toLowerCase() !== 'false';
  if (demoFlujo) {
    await seedFlujoOperativoOcOv(prisma);
  }

  console.log('\n✅ Seed completado — admin@almahue.local / Admin123! · PIN 4821 · periodo 2026-08');
  if (demoFlujo) {
    console.log('   Flujo Almahue: maestros (bodegas/insumos) · ALM-OC-001…003 · ALM-OV-001…004');
    console.log('   OV sin cadena de aprobación · Billing: BILLING_STUB_INLINE=true en .env');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
