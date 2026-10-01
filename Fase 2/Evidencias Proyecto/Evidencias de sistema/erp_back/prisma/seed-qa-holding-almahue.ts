/**
 * Seed QA holding Almahue post `reset:superadmin`: dos sociedades reales GoSocket QA.
 * NO trunca schema. NO crea OC / OV / facturas / proformas / pagos.
 *
 * Uso:
 *   npm run reset:superadmin  # opcional si no existe U-1
 *   npm run seed:qa-holding
 *
 * Admin U-1 queda con empresa primaria EMP-EXPORT y acceso a ambas empresas.
 * Operadores son disjuntos por empresa; el admin no es miembro ni nodo de escalas.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { seedCodigosFinancierosReu } from './seed-codigos-financieros-reu';

const EMP_EXPORT = 'EMP-EXPORT';
const EMP_SERVICES = 'EMP-SERVICES';
const EMPRESAS_HOLDING = [EMP_EXPORT, EMP_SERVICES] as const;
const PIN = '4821';
const PW_OPS = 'demo123';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type EmpresaId = (typeof EMPRESAS_HOLDING)[number];
type ModuloAprobacion = 'Compras';

type UsuarioSeed = {
  id: string;
  nombre: string;
  email: string;
  username: string;
  rolId: string;
  empresaId: EmpresaId;
  pin?: boolean;
  jefeId?: string;
  montoMax?: number | null;
};

type GrupoSeed = {
  id: string;
  empresaId: EmpresaId;
  modulo: ModuloAprobacion;
  nombre: string;
  aprobadorInicialId: string;
  miembros: string[];
  steps: Array<{ usuarioId: string; montoMax: number | null }>;
};

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

async function ensureUsuario(opts: UsuarioSeed) {
  const passwordHash = await hash(PW_OPS);
  const pinAprobacionHash = opts.pin ? await hash(PIN) : null;
  await prisma.usuario.upsert({
    where: { id: opts.id },
    update: {
      nombre: opts.nombre,
      email: opts.email,
      username: opts.username,
      passwordHash,
      rolId: opts.rolId,
      empresaId: opts.empresaId,
      activo: true,
      jefeId: opts.jefeId ?? null,
      montoMaxAprobacion: opts.montoMax ?? null,
      pinAprobacionHash,
    },
    create: {
      id: opts.id,
      nombre: opts.nombre,
      email: opts.email,
      username: opts.username,
      passwordHash,
      rolId: opts.rolId,
      empresaId: opts.empresaId,
      activo: true,
      jefeId: opts.jefeId ?? null,
      montoMaxAprobacion: opts.montoMax ?? null,
      pinAprobacionHash,
    },
  });

  // Los operadores del holding son disjuntos. Solo el admin U-1 accede a ambas.
  await prisma.usuarioEmpresa.deleteMany({
    where: { usuarioId: opts.id, empresaId: { not: opts.empresaId } },
  });
  await prisma.usuarioEmpresa.upsert({
    where: { usuarioId_empresaId: { usuarioId: opts.id, empresaId: opts.empresaId } },
    update: {},
    create: { usuarioId: opts.id, empresaId: opts.empresaId },
  });
}

async function ensureAdminHolding() {
  const admin = await prisma.usuario.findUnique({ where: { id: 'U-1' } });
  if (!admin) {
    throw new Error('Corré primero `npm run reset:superadmin` (se requiere U-1 / admin@almahue.local).');
  }

  await prisma.usuario.update({
    where: { id: 'U-1' },
    data: { empresaId: EMP_EXPORT, activo: true },
  });
  for (const empresaId of EMPRESAS_HOLDING) {
    await prisma.usuarioEmpresa.upsert({
      where: { usuarioId_empresaId: { usuarioId: 'U-1', empresaId } },
      update: {},
      create: { usuarioId: 'U-1', empresaId },
    });
  }
}

async function seedEmpresas() {
  await prisma.empresa.upsert({
    where: { id: EMP_EXPORT },
    update: {
      rut: '77.032.638-9',
      razonSocial: 'ALMAHUE EXPORT SPA',
      giro: 'Exportacion de fruta fresca y servicios de packing',
      activa: true,
      direccion: 'Camino Fundo El Maiten 1200',
      comuna: 'San Fernando',
      ciudad: 'San Fernando',
      emailContacto: 'qa@almahuexport.cl',
      gosocketBillerId: 'd159916d-4977-499f-a52e-70550fc379ee',
      gosocketNroResolucion: '0',
      gosocketFechaResolucion: '2024-10-11',
      gosocketActeco: '461001',
    },
    create: {
      id: EMP_EXPORT,
      rut: '77.032.638-9',
      razonSocial: 'ALMAHUE EXPORT SPA',
      giro: 'Exportacion de fruta fresca y servicios de packing',
      activa: true,
      direccion: 'Camino Fundo El Maiten 1200',
      comuna: 'San Fernando',
      ciudad: 'San Fernando',
      emailContacto: 'qa@almahuexport.cl',
      gosocketBillerId: 'd159916d-4977-499f-a52e-70550fc379ee',
      gosocketNroResolucion: '0',
      gosocketFechaResolucion: '2024-10-11',
      gosocketActeco: '461001',
    },
  });
  await prisma.empresa.upsert({
    where: { id: EMP_SERVICES },
    update: {
      rut: '77.032.639-7',
      razonSocial: 'ALM SERVICES SPA',
      giro: 'Servicios logisticos, transporte y soporte operacional',
      activa: true,
      direccion: 'Av. Logistica 845, Modulo B',
      comuna: 'Renca',
      ciudad: 'Santiago',
      emailContacto: 'qa@almservices.cl',
      gosocketBillerId: 'd23bdecb-0776-433b-aaf2-ab4e11e76501',
      gosocketNroResolucion: '0',
      gosocketFechaResolucion: '2020-02-14',
    },
    create: {
      id: EMP_SERVICES,
      rut: '77.032.639-7',
      razonSocial: 'ALM SERVICES SPA',
      giro: 'Servicios logisticos, transporte y soporte operacional',
      activa: true,
      direccion: 'Av. Logistica 845, Modulo B',
      comuna: 'Renca',
      ciudad: 'Santiago',
      emailContacto: 'qa@almservices.cl',
      gosocketBillerId: 'd23bdecb-0776-433b-aaf2-ab4e11e76501',
      gosocketNroResolucion: '0',
      gosocketFechaResolucion: '2020-02-14',
    },
  });

  await prisma.empresa.updateMany({ where: { id: 'EMP-BOOT' }, data: { activa: false } });
  await prisma.usuarioEmpresa.deleteMany({ where: { usuarioId: 'U-1', empresaId: 'EMP-BOOT' } });
}

async function seedRoles() {
  const roles: Array<{
    id: string;
    codigo: string;
    nombre: string;
    permisos: string[];
    aprobarConPin?: boolean;
  }> = [
    {
      id: 'ROL-COMPRAS',
      codigo: 'COMPRAS',
      nombre: 'Compras',
      permisos: ['compras:read', 'compras:write', 'catalogos:read', 'insumos:read'],
      aprobarConPin: true,
    },
    {
      id: 'ROL-VENTAS',
      codigo: 'VENTAS',
      nombre: 'Ventas',
      permisos: ['comercial:read', 'comercial:write', 'insumos:read', 'catalogos:read'],
      aprobarConPin: true,
    },
    {
      id: 'ROL-TESO',
      codigo: 'TESORERIA',
      nombre: 'Tesoreria',
      permisos: ['tesoreria:read', 'tesoreria:write', 'contabilidad:read', 'comercial:read', 'compras:read'],
    },
    {
      id: 'ROL-CONTA',
      codigo: 'CONTADOR',
      nombre: 'Contador',
      permisos: ['contabilidad:read', 'contabilidad:write', 'tesoreria:read', 'reportes:read'],
    },
    {
      id: 'ROL-BODEGA',
      codigo: 'BODEGA',
      nombre: 'Bodega / insumos',
      permisos: ['insumos:read', 'insumos:write'],
    },
    {
      id: 'ROL-CTR',
      codigo: 'CONTRATISTAS',
      nombre: 'Contratistas',
      permisos: ['contratistas:read', 'contratistas:write'],
      aprobarConPin: true,
    },
    {
      id: 'ROL-GERENCIA',
      codigo: 'GERENCIA',
      nombre: 'Gerencia (aprobador final operativo)',
      permisos: [
        'compras:read',
        'compras:write',
        'comercial:read',
        'comercial:write',
        'contratistas:read',
        'contratistas:write',
        'catalogos:read',
      ],
      aprobarConPin: true,
    },
  ];

  for (const r of roles) {
    await prisma.rol.upsert({
      where: { id: r.id },
      update: { nombre: r.nombre, codigo: r.codigo, permisos: r.permisos, aprobarConPin: r.aprobarConPin ?? false },
      create: { ...r, aprobarConPin: r.aprobarConPin ?? false },
    });
  }
}

async function seedUsuarios() {
  const usuarios: UsuarioSeed[] = [
    {
      id: 'U-EX-NATALIA',
      nombre: 'Natalia Bravo',
      email: 'nbravo@almahuexport.cl',
      username: 'NBRAVO',
      rolId: 'ROL-GERENCIA',
      empresaId: EMP_EXPORT,
      pin: true,
      montoMax: null,
    },
    {
      id: 'U-EX-FELIPE',
      nombre: 'Felipe Castro',
      email: 'fcastro@almahuexport.cl',
      username: 'FCASTRO',
      rolId: 'ROL-COMPRAS',
      empresaId: EMP_EXPORT,
      pin: true,
      jefeId: 'U-EX-NATALIA',
      montoMax: 500_000,
    },
    {
      id: 'U-EX-ELENA',
      nombre: 'Elena Rojas',
      email: 'erojas@almahuexport.cl',
      username: 'EROJAS',
      rolId: 'ROL-COMPRAS',
      empresaId: EMP_EXPORT,
      jefeId: 'U-EX-FELIPE',
    },
    {
      id: 'U-EX-ANDRES',
      nombre: 'Andres Pino',
      email: 'apino@almahuexport.cl',
      username: 'APINO',
      rolId: 'ROL-VENTAS',
      empresaId: EMP_EXPORT,
      pin: true,
      jefeId: 'U-EX-NATALIA',
      montoMax: 500_000,
    },
    {
      id: 'U-EX-VALENTINA',
      nombre: 'Valentina Diaz',
      email: 'vdiaz@almahuexport.cl',
      username: 'VDIAZ',
      rolId: 'ROL-VENTAS',
      empresaId: EMP_EXPORT,
      jefeId: 'U-EX-ANDRES',
    },
    {
      id: 'U-EX-BRUNO',
      nombre: 'Bruno Lagos',
      email: 'blagos@almahuexport.cl',
      username: 'BLAGOS',
      rolId: 'ROL-CTR',
      empresaId: EMP_EXPORT,
      pin: true,
      jefeId: 'U-EX-NATALIA',
      montoMax: 500_000,
    },
    {
      id: 'U-EX-PAULA',
      nombre: 'Paula Mendez',
      email: 'pmendez@almahuexport.cl',
      username: 'PMENDEZ',
      rolId: 'ROL-CTR',
      empresaId: EMP_EXPORT,
      jefeId: 'U-EX-BRUNO',
    },
    {
      id: 'U-EX-HUGO',
      nombre: 'Hugo Saez',
      email: 'hsaez@almahuexport.cl',
      username: 'HSAEZ',
      rolId: 'ROL-BODEGA',
      empresaId: EMP_EXPORT,
    },
    {
      id: 'U-EX-IRENE',
      nombre: 'Irene Soto',
      email: 'isoto@almahuexport.cl',
      username: 'ISOTO',
      rolId: 'ROL-TESO',
      empresaId: EMP_EXPORT,
    },
    {
      id: 'U-EX-CLARA',
      nombre: 'Clara Vidal',
      email: 'cvidal@almahuexport.cl',
      username: 'CVIDAL',
      rolId: 'ROL-CONTA',
      empresaId: EMP_EXPORT,
      pin: true,
    },
    {
      id: 'U-SV-GERMAN',
      nombre: 'German Ortiz',
      email: 'gortiz@almservices.cl',
      username: 'GORTIZ',
      rolId: 'ROL-GERENCIA',
      empresaId: EMP_SERVICES,
      pin: true,
      montoMax: null,
    },
    {
      id: 'U-SV-RODRIGO',
      nombre: 'Rodrigo Salas',
      email: 'rsalas@almservices.cl',
      username: 'RSALAS',
      rolId: 'ROL-GERENCIA',
      empresaId: EMP_SERVICES,
      pin: true,
      jefeId: 'U-SV-GERMAN',
      montoMax: 800_000,
    },
    {
      id: 'U-SV-SOFIA',
      nombre: 'Sofia Lagos',
      email: 'slagos@almservices.cl',
      username: 'SLAGOS',
      rolId: 'ROL-COMPRAS',
      empresaId: EMP_SERVICES,
      pin: true,
      jefeId: 'U-SV-RODRIGO',
      montoMax: 200_000,
    },
    {
      id: 'U-SV-IGNACIO',
      nombre: 'Ignacio Perez',
      email: 'iperez@almservices.cl',
      username: 'IPEREZ',
      rolId: 'ROL-COMPRAS',
      empresaId: EMP_SERVICES,
      jefeId: 'U-SV-SOFIA',
    },
    {
      id: 'U-SV-CATALINA',
      nombre: 'Catalina Vega',
      email: 'cvega@almservices.cl',
      username: 'CVEGA',
      rolId: 'ROL-VENTAS',
      empresaId: EMP_SERVICES,
      pin: true,
      jefeId: 'U-SV-RODRIGO',
      montoMax: 200_000,
    },
    {
      id: 'U-SV-MARTIN',
      nombre: 'Martin Rios',
      email: 'mrios@almservices.cl',
      username: 'MRIOS',
      rolId: 'ROL-VENTAS',
      empresaId: EMP_SERVICES,
      jefeId: 'U-SV-CATALINA',
    },
    {
      id: 'U-SV-DANIELA',
      nombre: 'Daniela Fuenzalida',
      email: 'dfuenzalida@almservices.cl',
      username: 'DFUENZALIDA',
      rolId: 'ROL-CTR',
      empresaId: EMP_SERVICES,
      pin: true,
      jefeId: 'U-SV-GERMAN',
      montoMax: null,
    },
    {
      id: 'U-SV-OSCAR',
      nombre: 'Oscar Nunez',
      email: 'onunez@almservices.cl',
      username: 'ONUNEZ',
      rolId: 'ROL-CTR',
      empresaId: EMP_SERVICES,
      jefeId: 'U-SV-DANIELA',
    },
    {
      id: 'U-SV-BEATRIZ',
      nombre: 'Beatriz Molina',
      email: 'bmolina@almservices.cl',
      username: 'BMOLINA',
      rolId: 'ROL-BODEGA',
      empresaId: EMP_SERVICES,
    },
    {
      id: 'U-SV-LEONOR',
      nombre: 'Leonor Campos',
      email: 'lcampos@almservices.cl',
      username: 'LCAMPOS',
      rolId: 'ROL-TESO',
      empresaId: EMP_SERVICES,
    },
    {
      id: 'U-SV-PATRICIO',
      nombre: 'Patricio Henriquez',
      email: 'phenriquez@almservices.cl',
      username: 'PHENRIQUEZ',
      rolId: 'ROL-CONTA',
      empresaId: EMP_SERVICES,
      pin: true,
    },
  ];

  // Primero crea gerencias/jefaturas, luego subalternos. Los ids de jefe ya quedan válidos.
  for (const u of usuarios) {
    await ensureUsuario(u);
  }
}

async function seedCatalogosGlobales() {
  await prisma.moneda.upsert({
    where: { codigo: 'CLP' },
    update: { activa: true, focoReporteria: true },
    create: { id: 'MON-CLP', codigo: 'CLP', nombre: 'Peso chileno', simbolo: '$', focoReporteria: true },
  });
  for (const um of [
    { id: 'UM-KG', codigo: 'KG', nombre: 'Kilogramo' },
    { id: 'UM-CAJ', codigo: 'CAJ', nombre: 'Caja' },
    { id: 'UM-UN', codigo: 'UN', nombre: 'Unidad' },
  ]) {
    await prisma.unidadMedida.upsert({
      where: { codigo: um.codigo },
      update: { nombre: um.nombre },
      create: um,
    });
  }
}

async function seedMaestrosEmpresa(opts: {
  empresaId: EmpresaId;
  pref: 'EX' | 'SV';
  ccCodigo: string;
  ccNombre: string;
  areaCodigo: string;
  areaNombre: string;
  sucursalCodigo: string;
  bodegaCodigo: string;
  bodegaNombre: string;
  insumo: {
    id: string;
    codigo: string;
    familia: string;
    subfamilia: string;
    nombre: string;
    unidad: string;
    costoPromedio: number;
    inventariable: boolean;
    stock: number;
  };
  proveedor: { id: string; rut: string; razonSocial: string; giro: string };
  cliente: {
    id: string;
    rut: string;
    razonSocial: string;
    vendedor: string;
    tipoCliente: string;
    giro: string;
    direccion: string;
    comuna: string;
    ciudad: string;
  };
  labor: { id: string; codigo: string; nombre: string };
  actividad: { id: string; codigo: string; nombre: string };
  contratista: { id: string; rut: string; razonSocial: string; especialidad: string };
  tarifa: number;
}) {
  const { empresaId, pref } = opts;
  await prisma.centroCosto.upsert({
    where: { id: `CC-${pref}-${opts.ccCodigo}` },
    update: { codigo: opts.ccCodigo, nombre: opts.ccNombre, activa: true, empresaId },
    create: { id: `CC-${pref}-${opts.ccCodigo}`, codigo: opts.ccCodigo, nombre: opts.ccNombre, empresaId },
  });
  await prisma.areaNegocio.upsert({
    where: { empresaId_codigo: { empresaId, codigo: opts.areaCodigo } },
    update: { nombre: opts.areaNombre, activa: true },
    create: { id: `AREA-${pref}-${opts.areaCodigo}`, codigo: opts.areaCodigo, nombre: opts.areaNombre, empresaId },
  });
  await prisma.sucursal.upsert({
    where: { empresaId_codigo: { empresaId, codigo: opts.sucursalCodigo } },
    update: { nombre: 'Casa Matriz' },
    create: { id: `SUC-${pref}-${opts.sucursalCodigo}`, codigo: opts.sucursalCodigo, nombre: 'Casa Matriz', empresaId },
  });

  const periodos = [
    {
      codigo: '2026-08',
      anio: 2026,
      mes: 8,
      fechaDesde: new Date('2026-08-01T00:00:00.000Z'),
      fechaHasta: new Date('2026-08-31T23:59:59.000Z'),
      activo: false,
    },
    {
      codigo: '2026-09',
      anio: 2026,
      mes: 9,
      fechaDesde: new Date('2026-09-01T00:00:00.000Z'),
      fechaHasta: new Date('2026-09-30T23:59:59.000Z'),
      activo: true,
    },
  ] as const;
  for (const p of periodos) {
    await prisma.periodoContable.upsert({
      where: { empresaId_codigo: { empresaId, codigo: p.codigo } },
      update: {
        estado: 'ABIERTO',
        activo: p.activo,
        fechaDesde: p.fechaDesde,
        fechaHasta: p.fechaHasta,
      },
      create: {
        empresaId,
        codigo: p.codigo,
        anio: p.anio,
        mes: p.mes,
        fechaDesde: p.fechaDesde,
        fechaHasta: p.fechaHasta,
        estado: 'ABIERTO',
        activo: p.activo,
      },
    });
  }

  const cuentas = [
    { id: `CTA-${pref}-BANCO`, codigo: '1-1-01-01', nombre: 'Banco', tipo: 'ACTIVO' },
    { id: `CTA-${pref}-CLIENTES`, codigo: '1-1-02-01', nombre: 'Clientes', tipo: 'ACTIVO' },
    { id: `CTA-${pref}-IVA-CREDITO`, codigo: '1-1-03-01', nombre: 'IVA credito fiscal', tipo: 'ACTIVO' },
    { id: `CTA-${pref}-PROVEEDORES`, codigo: '2-1-01-01', nombre: 'Proveedores', tipo: 'PASIVO' },
    { id: `CTA-${pref}-IVA-DEBITO`, codigo: '2-1-03-01', nombre: 'IVA debito fiscal', tipo: 'PASIVO' },
    { id: `CTA-${pref}-VENTAS`, codigo: '4-1-01-01', nombre: 'Ventas', tipo: 'INGRESO' },
    { id: `CTA-${pref}-GASTO-MO`, codigo: '5-1-01-01', nombre: 'Gasto mano de obra', tipo: 'GASTO' },
  ] as const;
  for (const c of cuentas) {
    await prisma.cuentaContable.upsert({
      where: { id: c.id },
      update: {
        codigo: c.codigo,
        nombre: c.nombre,
        tipo: c.tipo,
        nivel: 4,
        noImputable: false,
        activa: true,
        empresaId,
      },
      create: {
        id: c.id,
        codigo: c.codigo,
        nombre: c.nombre,
        tipo: c.tipo,
        nivel: 4,
        noImputable: false,
        empresaId,
      },
    });
  }

  const configSii = [
    {
      tipoDocumentoSii: 'VENTAS',
      codigoSii: '33',
      nombre: 'Factura electronica venta',
      cuentaContableId: `CTA-${pref}-VENTAS`,
      lado: 'HABER',
    },
    {
      tipoDocumentoSii: 'CLIENTES',
      codigoSii: null,
      nombre: 'Clientes por cobrar',
      cuentaContableId: `CTA-${pref}-CLIENTES`,
      lado: 'DEBE',
    },
    {
      tipoDocumentoSii: 'IVA_DEBITO',
      codigoSii: null,
      nombre: 'IVA debito fiscal',
      cuentaContableId: `CTA-${pref}-IVA-DEBITO`,
      lado: 'HABER',
    },
    {
      tipoDocumentoSii: 'IVA_CREDITO',
      codigoSii: null,
      nombre: 'IVA credito fiscal',
      cuentaContableId: `CTA-${pref}-IVA-CREDITO`,
      lado: 'DEBE',
    },
    {
      tipoDocumentoSii: 'PROVEEDORES',
      codigoSii: null,
      nombre: 'Proveedores por pagar',
      cuentaContableId: `CTA-${pref}-PROVEEDORES`,
      lado: 'HABER',
    },
    {
      tipoDocumentoSii: 'CONTRATISTAS',
      codigoSii: null,
      nombre: 'Gasto MO contratistas',
      cuentaContableId: `CTA-${pref}-GASTO-MO`,
      lado: 'DEBE',
    },
  ];
  for (const item of configSii) {
    await prisma.configContableSii.upsert({
      where: { empresaId_tipoDocumentoSii: { empresaId, tipoDocumentoSii: item.tipoDocumentoSii } },
      update: { ...item, activa: true },
      create: { empresaId, ...item, activa: true },
    });
  }

  await prisma.bodega.upsert({
    where: { empresaId_codigo: { empresaId, codigo: opts.bodegaCodigo } },
    update: { nombre: opts.bodegaNombre, activa: true },
    create: { id: `BOD-${pref}-${opts.bodegaCodigo}`, codigo: opts.bodegaCodigo, nombre: opts.bodegaNombre, empresaId, activa: true },
  });
  await prisma.insumo.upsert({
    where: { empresaId_codigo: { empresaId, codigo: opts.insumo.codigo } },
    update: {
      familia: opts.insumo.familia,
      subfamilia: opts.insumo.subfamilia,
      nombre: opts.insumo.nombre,
      unidad: opts.insumo.unidad,
      costoPromedio: opts.insumo.costoPromedio,
      inventariable: opts.insumo.inventariable,
      stock: opts.insumo.stock,
      empresaId,
    },
    create: { ...opts.insumo, empresaId },
  });
  const bod = await prisma.bodega.findFirstOrThrow({ where: { empresaId, codigo: opts.bodegaCodigo } });
  const ins = await prisma.insumo.findFirstOrThrow({ where: { empresaId, codigo: opts.insumo.codigo } });
  await prisma.stockInsumoBodega.upsert({
    where: { empresaId_insumoId_bodegaId: { empresaId, insumoId: ins.id, bodegaId: bod.id } },
    update: { cantidad: opts.insumo.stock },
    create: { empresaId, insumoId: ins.id, bodegaId: bod.id, cantidad: opts.insumo.stock },
  });

  await prisma.proveedor.upsert({
    where: { empresaId_rut: { empresaId, rut: opts.proveedor.rut } },
    update: {
      razonSocial: opts.proveedor.razonSocial,
      giro: opts.proveedor.giro,
      activo: true,
      esProductor: false,
    },
    create: { ...opts.proveedor, activo: true, esProductor: false, empresaId },
  });
  await prisma.cliente.upsert({
    where: { empresaId_rut: { empresaId, rut: opts.cliente.rut } },
    update: {
      razonSocial: opts.cliente.razonSocial,
      vendedor: opts.cliente.vendedor,
      tipoCliente: opts.cliente.tipoCliente,
      giro: opts.cliente.giro,
      direccion: opts.cliente.direccion,
      comuna: opts.cliente.comuna,
      ciudad: opts.cliente.ciudad,
      activo: true,
    },
    create: { ...opts.cliente, credito: 10_000_000, activo: true, esProductor: false, empresaId },
  });
  await prisma.clienteDireccion.deleteMany({ where: { clienteId: opts.cliente.id, empresaId } });
  await prisma.clienteDireccion.create({
    data: {
      clienteId: opts.cliente.id,
      empresaId,
      tipo: 'FISCAL',
      linea: opts.cliente.direccion,
      comuna: opts.cliente.comuna,
      ciudad: opts.cliente.ciudad,
      principal: true,
    },
  });

  await prisma.labor.upsert({
    where: { empresaId_codigo: { empresaId, codigo: opts.labor.codigo } },
    update: { nombre: opts.labor.nombre, activa: true },
    create: { ...opts.labor, empresaId },
  });
  await prisma.actividad.upsert({
    where: { empresaId_codigo: { empresaId, codigo: opts.actividad.codigo } },
    update: { nombre: opts.actividad.nombre, activa: true },
    create: { ...opts.actividad, empresaId },
  });
  await prisma.contratista.upsert({
    where: { id: opts.contratista.id },
    update: {
      rut: opts.contratista.rut,
      razonSocial: opts.contratista.razonSocial,
      especialidad: opts.contratista.especialidad,
      activo: true,
      empresaId,
    },
    create: { ...opts.contratista, activo: true, empresaId },
  });
  await prisma.laborActividad.upsert({
    where: { laborId_actividadId: { laborId: opts.labor.id, actividadId: opts.actividad.id } },
    update: {},
    create: { laborId: opts.labor.id, actividadId: opts.actividad.id },
  });
  const tarifaExiste = await prisma.tarifaContratista.findFirst({
    where: { empresaId, contratistaId: opts.contratista.id, laborId: opts.labor.id, actividadId: opts.actividad.id },
  });
  if (tarifaExiste) {
    await prisma.tarifaContratista.update({
      where: { id: tarifaExiste.id },
      data: { tarifa: opts.tarifa, unidad: 'HR', centroCostoId: `CC-${pref}-${opts.ccCodigo}`, vigenciaHasta: null },
    });
  } else {
    await prisma.tarifaContratista.create({
      data: {
        contratistaId: opts.contratista.id,
        laborId: opts.labor.id,
        actividadId: opts.actividad.id,
        tarifa: opts.tarifa,
        unidad: 'HR',
        centroCostoId: `CC-${pref}-${opts.ccCodigo}`,
        empresaId,
        vigenciaDesde: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
  }
}

/** Productor de fruta de prueba (T1). No reutilizar el proveedor de insumos. */
async function seedProveedorProductor(opts: {
  id: string;
  empresaId: EmpresaId;
  rut: string;
  razonSocial: string;
}) {
  await prisma.proveedor.upsert({
    where: { empresaId_rut: { empresaId: opts.empresaId, rut: opts.rut } },
    update: {
      razonSocial: opts.razonSocial,
      giro: 'Productor de fruta',
      activo: true,
      esProductor: true,
    },
    create: {
      id: opts.id,
      empresaId: opts.empresaId,
      rut: opts.rut,
      razonSocial: opts.razonSocial,
      giro: 'Productor de fruta',
      activo: true,
      esProductor: true,
    },
  });
}

async function limpiarAprobacionesHolding() {
  await prisma.nodoAprobador.deleteMany({ where: { nodo: { empresaId: { in: [...EMPRESAS_HOLDING] } } } });
  await prisma.nodoEscalaAprobacion.deleteMany({ where: { empresaId: { in: [...EMPRESAS_HOLDING] } } });
  await prisma.adminConcepto.deleteMany({ where: { empresaId: { in: [...EMPRESAS_HOLDING] } } });
  await prisma.usuarioGrupoAprobacion.deleteMany({
    where: { grupo: { empresaId: { in: [...EMPRESAS_HOLDING] } } },
  });
  await prisma.grupoAprobacion.deleteMany({ where: { empresaId: { in: [...EMPRESAS_HOLDING] } } });
}

async function cadenaNiveles(
  empresaId: EmpresaId,
  grupoId: string,
  modulo: ModuloAprobacion,
  steps: Array<{ usuarioId: string; montoMax: number | null }>,
) {
  const creados: Array<{ id: string; usuarioId: string; escalaAUsuarioId: string | null }> = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const escalaAUsuarioId = steps[i + 1]?.usuarioId ?? null;
    const nodo = await prisma.nodoEscalaAprobacion.create({
      data: {
        empresaId,
        grupoId,
        modulo,
        usuarioId: step.usuarioId,
        montoMax: step.montoMax,
        escalaAUsuarioId,
        logica: 'SIMPLE',
        activo: true,
      },
    });
    creados.push({ id: nodo.id, usuarioId: step.usuarioId, escalaAUsuarioId });
  }

  const nodoIdByUser = new Map(creados.map((n) => [n.usuarioId, n.id]));
  for (const nodo of creados) {
    await prisma.nodoEscalaAprobacion.update({
      where: { id: nodo.id },
      data: { escalaAId: nodo.escalaAUsuarioId ? (nodoIdByUser.get(nodo.escalaAUsuarioId) ?? null) : null },
    });
    await prisma.nodoAprobador.create({ data: { nodoId: nodo.id, usuarioId: nodo.usuarioId, orden: 0 } });
  }
}

async function seedGruposAprobacion() {
  const grupos: GrupoSeed[] = [
    {
      id: 'GRP-EX-COMPRAS',
      empresaId: EMP_EXPORT,
      modulo: 'Compras',
      nombre: 'Compras - packing export',
      aprobadorInicialId: 'U-EX-FELIPE',
      miembros: ['U-EX-ELENA', 'U-EX-FELIPE', 'U-EX-NATALIA'],
      steps: [
        { usuarioId: 'U-EX-FELIPE', montoMax: 500_000 },
        { usuarioId: 'U-EX-NATALIA', montoMax: null },
      ],
    },
    {
      id: 'GRP-SV-COMPRAS',
      empresaId: EMP_SERVICES,
      modulo: 'Compras',
      nombre: 'Compras - servicios logisticos',
      aprobadorInicialId: 'U-SV-SOFIA',
      miembros: ['U-SV-IGNACIO', 'U-SV-SOFIA', 'U-SV-RODRIGO', 'U-SV-GERMAN'],
      steps: [
        { usuarioId: 'U-SV-SOFIA', montoMax: 200_000 },
        { usuarioId: 'U-SV-RODRIGO', montoMax: 800_000 },
        { usuarioId: 'U-SV-GERMAN', montoMax: null },
      ],
    },
  ];

  for (const g of grupos) {
    await prisma.grupoAprobacion.create({
      data: {
        id: g.id,
        empresaId: g.empresaId,
        modulo: g.modulo,
        nombre: g.nombre,
        aprobadorInicialId: g.aprobadorInicialId,
        activo: true,
        miembros: { create: g.miembros.map((usuarioId) => ({ usuarioId })) },
      },
    });
    await cadenaNiveles(g.empresaId, g.id, g.modulo, g.steps);
  }

  await prisma.adminConcepto.createMany({
    data: [
      { id: 'AC-EX-COMPRAS-CLARA', empresaId: EMP_EXPORT, usuarioId: 'U-EX-CLARA', modulo: 'Compras', activo: true },
    ],
  });
}

async function assertSinDocumentos(empresaId: EmpresaId) {
  const counts = {
    usuarios: await prisma.usuario.count({ where: { empresaId } }),
    grupos: await prisma.grupoAprobacion.count({ where: { empresaId } }),
    oc: await prisma.ordenCompra.count({ where: { empresaId } }),
    docs: await prisma.documentoComercial.count({ where: { empresaId } }),
    facturas: await prisma.documentoComercial.count({ where: { empresaId, tipo: 'FACTURA' } }),
    proformas: await prisma.proformaContratista.count({ where: { empresaId } }),
    pagos: await prisma.pago.count({ where: { empresaId } }),
  };
  console.log(`[seed-qa-holding] ${empresaId}`, counts);
  if (counts.oc !== 0 || counts.docs !== 0 || counts.facturas !== 0 || counts.proformas !== 0 || counts.pagos !== 0) {
    throw new Error(`${empresaId}: el seed holding no debe incluir OC/documentos/facturas/proformas/pagos.`);
  }
}

async function main() {
  console.log('[seed-qa-holding] Empresas holding + EMP-BOOT inactiva');
  await seedEmpresas();

  console.log('[seed-qa-holding] Admin U-1 y roles operativos');
  await ensureAdminHolding();
  await seedRoles();

  console.log('[seed-qa-holding] Usuarios disjuntos por empresa');
  await seedUsuarios();

  console.log('[seed-qa-holding] Maestros globales y por empresa');
  await seedCatalogosGlobales();
  await seedMaestrosEmpresa({
    empresaId: EMP_EXPORT,
    pref: 'EX',
    ccCodigo: 'PACK',
    ccNombre: 'Packing export',
    areaCodigo: 'PACK',
    areaNombre: 'Packing fruta export',
    sucursalCodigo: 'CEN',
    bodegaCodigo: 'FRIG',
    bodegaNombre: 'Frigorifico export',
    insumo: {
      id: 'INS-EX-CEREZA',
      codigo: 'EX-CEREZA-CAJ',
      familia: 'Fruta',
      subfamilia: 'Cereza',
      nombre: 'Cereza export caja 5 kg',
      unidad: 'CAJ',
      costoPromedio: 1850,
      inventariable: true,
      stock: 1200,
    },
    proveedor: { id: 'PROV-EX-INSUMOS', rut: '76.210.100-9', razonSocial: 'Insumos Packing Sur SpA', giro: 'Envases y materiales de packing' },
    cliente: {
      id: 'CLI-EX-IMPORT',
      rut: '76.210.101-7',
      razonSocial: 'Importadora Pacific Fruit SpA',
      vendedor: 'Valentina Diaz',
      tipoCliente: 'EXPORTACION',
      giro: 'Comercializacion internacional de fruta',
      direccion: 'Av. Apoquindo 4501',
      comuna: 'Las Condes',
      ciudad: 'Santiago',
    },
    labor: { id: 'LAB-EX-PACK', codigo: 'PACK-CER', nombre: 'Packing cereza export' },
    actividad: { id: 'ACT-EX-SEL', codigo: 'SEL-CER', nombre: 'Seleccion y embalaje cereza' },
    contratista: {
      id: 'CTR-EX-PACK',
      rut: '76.210.102-8',
      razonSocial: 'Cuadrillas Packing Export Ltda',
      especialidad: 'Packing fruta',
    },
    tarifa: 12_500,
  });
  await seedMaestrosEmpresa({
    empresaId: EMP_SERVICES,
    pref: 'SV',
    ccCodigo: 'LOG',
    ccNombre: 'Logistica servicios',
    areaCodigo: 'LOG',
    areaNombre: 'Logistica nacional',
    sucursalCodigo: 'MAT',
    bodegaCodigo: 'PAT',
    bodegaNombre: 'Patio logistico',
    insumo: {
      id: 'INS-SV-PALLET',
      codigo: 'SV-PALLET-UN',
      familia: 'Logistica',
      subfamilia: 'Pallet',
      nombre: 'Pallet logistico reutilizable',
      unidad: 'UN',
      costoPromedio: 9500,
      inventariable: true,
      stock: 300,
    },
    proveedor: { id: 'PROV-SV-PALLET', rut: '76.310.200-9', razonSocial: 'Pallets y Transportes Andes SpA', giro: 'Suministro logistico' },
    cliente: {
      id: 'CLI-SV-LOG',
      rut: '76.310.201-7',
      razonSocial: 'Operador Logistico Centro SpA',
      vendedor: 'Martin Rios',
      tipoCliente: 'NACIONAL',
      giro: 'Servicios logisticos integrales',
      direccion: 'Av. Americo Vespucio 1501',
      comuna: 'Cerrillos',
      ciudad: 'Santiago',
    },
    labor: { id: 'LAB-SV-CARGA', codigo: 'LOG-CAR', nombre: 'Carga y descarga nacional' },
    actividad: { id: 'ACT-SV-FLETE', codigo: 'FLE-NAC', nombre: 'Flete nacional y patio' },
    contratista: {
      id: 'CTR-SV-LOG',
      rut: '76.310.202-0',
      razonSocial: 'Servicios Logisticos Norte Ltda',
      especialidad: 'Logistica y transporte',
    },
    tarifa: 18_000,
  });
  await seedProveedorProductor({
    id: 'PROV-EX-PROD',
    empresaId: EMP_EXPORT,
    rut: '76.210.103-3',
    razonSocial: 'Agricola Los Naranjos Ltda',
  });
  await seedProveedorProductor({
    id: 'PROV-SV-PROD',
    empresaId: EMP_SERVICES,
    rut: '76.310.203-3',
    razonSocial: 'Agricola Valle Norte Ltda',
  });

  console.log('[seed-qa-holding] Grupos, escalas y AdminConcepto');
  await limpiarAprobacionesHolding();
  await seedGruposAprobacion();

  await assertSinDocumentos(EMP_EXPORT);
  await assertSinDocumentos(EMP_SERVICES);
  const nCf = await seedCodigosFinancierosReu(prisma);
  console.log(`[seed-qa-holding] ${nCf} códigos financieros de ejemplo Reu1–3`);
  console.log('[seed-qa-holding] OK holding Almahue listo');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
