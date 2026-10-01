/**
 * Upsert idempotente: organigrama de Compras con nombres de packing (no códigos QA).
 * NO trunca schema. NO borra GRP-EX-COMPRAS ni usuarios ajenos a este script.
 * NO crea OC / facturas.
 *
 * Réplica de laboratorio 21/08 (SIMPLE / AND / OR / 1-2-1) sobre EMP-EXPORT.
 *
 *   npx ts-node -r tsconfig-paths/register prisma/seed-organigrama-packing-demo.ts
 *
 * Requiere que exista EMP-EXPORT (seed:qa-holding o equivalente).
 * Password operadores: demo123 · PIN aprobadores: 4821
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const EMP_EXPORT = process.env.ORGANIGRAMA_EMPRESA_ID || 'EMP-EXPORT';
const MAIL_DOMAIN =
  process.env.ORGANIGRAMA_MAIL_DOMAIN ||
  (EMP_EXPORT === 'EMP-1' ? 'almahue.cl' : 'almahuexport.cl');
const PIN = '4821';
const PW_OPS = 'demo123';
const MODULO = 'Compras';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type Logica = 'SIMPLE' | 'AND' | 'OR';

type Paso = {
  usuarioId: string;
  montoMax: number | null;
  logica?: Logica;
  extraAprobadores?: string[];
};

const PANTALLAS_DIGITADOR = [
  { pantalla: 'Órdenes de compra', lectura: true, escritura: true },
  { pantalla: 'Recepciones', lectura: true, escritura: false },
  { pantalla: 'Libro de compras', lectura: true, escritura: false },
];

const PANTALLAS_APROBADOR = [
  ...PANTALLAS_DIGITADOR,
  { pantalla: 'Aprobaciones', lectura: true, escritura: true },
];

const PANTALLAS_GERENCIA = [
  ...PANTALLAS_APROBADOR,
  { pantalla: 'Órdenes de venta', lectura: true, escritura: true },
];

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

async function ensureRol(opts: {
  id: string;
  codigo: string;
  nombre: string;
  permisos: string[];
  permisosPantalla: Array<{ pantalla: string; lectura: boolean; escritura: boolean }>;
  aprobarConPin: boolean;
}) {
  await prisma.rol.upsert({
    where: { id: opts.id },
    update: {
      nombre: opts.nombre,
      codigo: opts.codigo,
      permisos: opts.permisos,
      permisosPantalla: opts.permisosPantalla,
      aprobarConPin: opts.aprobarConPin,
    },
    create: {
      id: opts.id,
      nombre: opts.nombre,
      codigo: opts.codigo,
      permisos: opts.permisos,
      permisosPantalla: opts.permisosPantalla,
      aprobarConPin: opts.aprobarConPin,
    },
  });
}

async function ensureUsuario(opts: {
  id: string;
  nombre: string;
  email: string;
  username: string;
  rolId: string;
  pin?: boolean;
  jefeId?: string;
  montoMax?: number | null;
}) {
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
      empresaId: EMP_EXPORT,
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
      empresaId: EMP_EXPORT,
      activo: true,
      jefeId: opts.jefeId ?? null,
      montoMaxAprobacion: opts.montoMax ?? null,
      pinAprobacionHash,
    },
  });
  await prisma.usuarioEmpresa.upsert({
    where: { usuarioId_empresaId: { usuarioId: opts.id, empresaId: EMP_EXPORT } },
    update: {},
    create: { usuarioId: opts.id, empresaId: EMP_EXPORT },
  });
}

async function rebuildGrupo(opts: {
  id: string;
  nombre: string;
  aprobadorInicialId: string;
  miembros: string[];
  steps: Paso[];
}) {
  await prisma.nodoAprobador.deleteMany({ where: { nodo: { grupoId: opts.id } } });
  await prisma.nodoEscalaAprobacion.deleteMany({ where: { grupoId: opts.id } });
  await prisma.usuarioGrupoAprobacion.deleteMany({ where: { grupoId: opts.id } });

  await prisma.grupoAprobacion.upsert({
    where: { id: opts.id },
    update: {
      nombre: opts.nombre,
      modulo: MODULO,
      empresaId: EMP_EXPORT,
      aprobadorInicialId: opts.aprobadorInicialId,
      activo: true,
    },
    create: {
      id: opts.id,
      nombre: opts.nombre,
      modulo: MODULO,
      empresaId: EMP_EXPORT,
      aprobadorInicialId: opts.aprobadorInicialId,
      activo: true,
    },
  });

  if (opts.miembros.length) {
    await prisma.usuarioGrupoAprobacion.createMany({
      data: opts.miembros.map((usuarioId) => ({ usuarioId, grupoId: opts.id })),
    });
  }

  const creados: Array<{ id: string; usuarioId: string; escalaAUsuarioId: string | null }> = [];
  for (let i = 0; i < opts.steps.length; i++) {
    const step = opts.steps[i]!;
    const escalaAUsuarioId = opts.steps[i + 1]?.usuarioId ?? null;
    const nodo = await prisma.nodoEscalaAprobacion.create({
      data: {
        empresaId: EMP_EXPORT,
        grupoId: opts.id,
        modulo: MODULO,
        usuarioId: step.usuarioId,
        montoMax: step.montoMax,
        escalaAUsuarioId,
        logica: step.logica ?? 'SIMPLE',
        activo: true,
      },
    });
    creados.push({ id: nodo.id, usuarioId: step.usuarioId, escalaAUsuarioId });
  }

  const nodoIdByUser = new Map(creados.map((n) => [n.usuarioId, n.id]));
  for (let i = 0; i < creados.length; i++) {
    const nodo = creados[i]!;
    const step = opts.steps[i]!;
    const ids = [step.usuarioId, ...(step.extraAprobadores ?? [])].filter(
      (id, idx, arr) => arr.indexOf(id) === idx,
    );
    await prisma.nodoEscalaAprobacion.update({
      where: { id: nodo.id },
      data: {
        escalaAId: nodo.escalaAUsuarioId ? (nodoIdByUser.get(nodo.escalaAUsuarioId) ?? null) : null,
      },
    });
    await prisma.nodoAprobador.createMany({
      data: ids.map((usuarioId, orden) => ({ nodoId: nodo.id, usuarioId, orden })),
    });
  }
}

async function main() {
  const empresa = await prisma.empresa.findUnique({ where: { id: EMP_EXPORT } });
  if (!empresa) {
    throw new Error(
      `No existe ${EMP_EXPORT}. Local: npm run seed:qa-holding. Prod: ORGANIGRAMA_EMPRESA_ID=EMP-1.`,
    );
  }

  await ensureRol({
    id: 'ROL-DIGITADOR-OC',
    codigo: 'DIGITADOR_OC',
    nombre: 'Digitador compras',
    permisos: ['compras:read', 'compras:write', 'catalogos:read', 'insumos:read'],
    permisosPantalla: PANTALLAS_DIGITADOR,
    aprobarConPin: false,
  });
  await ensureRol({
    id: 'ROL-APROBADOR-OC',
    codigo: 'APROBADOR_OC',
    nombre: 'Aprobador compras',
    permisos: ['compras:read', 'compras:write', 'catalogos:read', 'insumos:read'],
    permisosPantalla: PANTALLAS_APROBADOR,
    aprobarConPin: true,
  });
  await ensureRol({
    id: 'ROL-GERENCIA-OC',
    codigo: 'GERENCIA_OC',
    nombre: 'Gerencia compras (tope operativo)',
    permisos: [
      'compras:read',
      'compras:write',
      'comercial:read',
      'comercial:write',
      'catalogos:read',
    ],
    permisosPantalla: PANTALLAS_GERENCIA,
    aprobarConPin: true,
  });

  const usuarios = [
    {
      id: 'U-EX-ORG-JOSEFINA',
      nombre: 'Josefina Araya',
      email: `jaraya@${MAIL_DOMAIN}`,
      username: 'JARAYA',
      rolId: 'ROL-DIGITADOR-OC',
    },
    {
      id: 'U-EX-ORG-CRISTIAN',
      nombre: 'Cristian Morales',
      email: `cmorales@${MAIL_DOMAIN}`,
      username: 'CMORALES',
      rolId: 'ROL-APROBADOR-OC',
      pin: true,
      montoMax: 500_000,
    },
    {
      id: 'U-EX-ORG-DANIELA',
      nombre: 'Daniela Fuentes',
      email: `dfuentes@${MAIL_DOMAIN}`,
      username: 'DFUENTES',
      rolId: 'ROL-GERENCIA-OC',
      pin: true,
      montoMax: null,
    },
    {
      id: 'U-EX-ORG-TOMAS',
      nombre: 'Tomas Herrera',
      email: `therrera@${MAIL_DOMAIN}`,
      username: 'THERRERA',
      rolId: 'ROL-DIGITADOR-OC',
    },
    {
      id: 'U-EX-ORG-LORENA',
      nombre: 'Lorena Paredes',
      email: `lparedes@${MAIL_DOMAIN}`,
      username: 'LPAREDES',
      rolId: 'ROL-APROBADOR-OC',
      pin: true,
    },
    {
      id: 'U-EX-ORG-MATIAS',
      nombre: 'Matias Correa',
      email: `mcorrea@${MAIL_DOMAIN}`,
      username: 'MCORREA',
      rolId: 'ROL-APROBADOR-OC',
      pin: true,
    },
    {
      id: 'U-EX-ORG-ANTONIA',
      nombre: 'Antonia Silva',
      email: `asilva@${MAIL_DOMAIN}`,
      username: 'ASILVA',
      rolId: 'ROL-DIGITADOR-OC',
    },
    {
      id: 'U-EX-ORG-NICOLAS',
      nombre: 'Nicolas Vega',
      email: `nvega@${MAIL_DOMAIN}`,
      username: 'NVEGA',
      rolId: 'ROL-APROBADOR-OC',
      pin: true,
    },
    {
      id: 'U-EX-ORG-JAVIERA',
      nombre: 'Javiera Soto',
      email: `jsoto@${MAIL_DOMAIN}`,
      username: 'JSOTO',
      rolId: 'ROL-APROBADOR-OC',
      pin: true,
    },
    {
      id: 'U-EX-ORG-BENJAMIN',
      nombre: 'Benjamin Ortiz',
      email: `bortiz@${MAIL_DOMAIN}`,
      username: 'BORTIZ',
      rolId: 'ROL-DIGITADOR-OC',
    },
    {
      id: 'U-EX-ORG-CAROLINA',
      nombre: 'Carolina Muñoz',
      email: `cmunoz@${MAIL_DOMAIN}`,
      username: 'CMUNOZ',
      rolId: 'ROL-APROBADOR-OC',
      pin: true,
      montoMax: 200_000,
    },
    {
      id: 'U-EX-ORG-RICARDO',
      nombre: 'Ricardo Peña',
      email: `rpena@${MAIL_DOMAIN}`,
      username: 'RPENA',
      rolId: 'ROL-APROBADOR-OC',
      pin: true,
    },
    {
      id: 'U-EX-ORG-ALEJANDRA',
      nombre: 'Alejandra Ruiz',
      email: `aruiz@${MAIL_DOMAIN}`,
      username: 'ARUIZ',
      rolId: 'ROL-APROBADOR-OC',
      pin: true,
    },
    {
      id: 'U-EX-ORG-SEBASTIAN',
      nombre: 'Sebastian Lagos',
      email: `slagos.pack@${MAIL_DOMAIN}`,
      username: 'SLAGOSPACK',
      rolId: 'ROL-GERENCIA-OC',
      pin: true,
      montoMax: null,
    },
  ];

  for (const u of usuarios) {
    await ensureUsuario(u);
  }

  // Firma simple: digitador → jefe $500 mil → gerencia.
  await rebuildGrupo({
    id: 'GRP-EX-FIRMA-SIMPLE',
    nombre: 'Packing — firma simple',
    aprobadorInicialId: 'U-EX-ORG-CRISTIAN',
    miembros: ['U-EX-ORG-JOSEFINA', 'U-EX-ORG-CRISTIAN', 'U-EX-ORG-DANIELA'],
    steps: [
      { usuarioId: 'U-EX-ORG-CRISTIAN', montoMax: 500_000, logica: 'SIMPLE' },
      { usuarioId: 'U-EX-ORG-DANIELA', montoMax: null, logica: 'SIMPLE' },
    ],
  });

  // Comité dual: ambas firmas (AND).
  await rebuildGrupo({
    id: 'GRP-EX-COMITE-DUAL',
    nombre: 'Packing — comité dual',
    aprobadorInicialId: 'U-EX-ORG-LORENA',
    miembros: ['U-EX-ORG-TOMAS', 'U-EX-ORG-LORENA', 'U-EX-ORG-MATIAS'],
    steps: [
      {
        usuarioId: 'U-EX-ORG-LORENA',
        montoMax: null,
        logica: 'AND',
        extraAprobadores: ['U-EX-ORG-MATIAS'],
      },
    ],
  });

  // Firma alternativa: basta una de las dos (OR).
  await rebuildGrupo({
    id: 'GRP-EX-FIRMA-ALTERNATIVA',
    nombre: 'Packing — firma alternativa',
    aprobadorInicialId: 'U-EX-ORG-NICOLAS',
    miembros: ['U-EX-ORG-ANTONIA', 'U-EX-ORG-NICOLAS', 'U-EX-ORG-JAVIERA'],
    steps: [
      {
        usuarioId: 'U-EX-ORG-NICOLAS',
        montoMax: null,
        logica: 'OR',
        extraAprobadores: ['U-EX-ORG-JAVIERA'],
      },
    ],
  });

  // Jerárquico 1-2-1: jefe $200 mil → comité AND $800 mil → gerencia.
  await rebuildGrupo({
    id: 'GRP-EX-CADENA-PACKING',
    nombre: 'Packing — cadena gerencia',
    aprobadorInicialId: 'U-EX-ORG-CAROLINA',
    miembros: [
      'U-EX-ORG-BENJAMIN',
      'U-EX-ORG-CAROLINA',
      'U-EX-ORG-RICARDO',
      'U-EX-ORG-ALEJANDRA',
      'U-EX-ORG-SEBASTIAN',
    ],
    steps: [
      { usuarioId: 'U-EX-ORG-CAROLINA', montoMax: 200_000, logica: 'SIMPLE' },
      {
        usuarioId: 'U-EX-ORG-RICARDO',
        montoMax: 800_000,
        logica: 'AND',
        extraAprobadores: ['U-EX-ORG-ALEJANDRA'],
      },
      { usuarioId: 'U-EX-ORG-SEBASTIAN', montoMax: null, logica: 'SIMPLE' },
    ],
  });

  console.log('[seed-organigrama-packing] listo en', empresa.razonSocial, empresa.rut);
  console.log('  grupos: Packing — firma simple / comité dual / firma alternativa / cadena gerencia');
  console.log('  login operadores: demo123 · PIN: 4821');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
