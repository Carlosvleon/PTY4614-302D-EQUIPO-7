/**
 * Datos demo — Grupos + Escalas de aprobación (fase 2 Reu6).
 * Ejecutar: npm run seed:aprobaciones-f2
 *
 * Organigrama ampliado (aprobadores + muchos operativos por grupo):
 *   Operativos → Jefe área → Gerente ops/compras → CFO → Admin
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const EMPRESA_ID = process.env.SEED_EMPRESA_ID ?? 'EMP-1';
const PIN_DEMO = '4821';

/** Escalas por aprobador (cadena vigente solo en Compras). */
const ESCALAS = [
  { usuarioId: 'U-11', montoMax: 300_000, escalaAUsuarioId: 'U-9' },
  { usuarioId: 'U-12', montoMax: 300_000, escalaAUsuarioId: 'U-9' },
  { usuarioId: 'U-15', montoMax: 500_000, escalaAUsuarioId: 'U-6' },
  { usuarioId: 'U-16', montoMax: 400_000, escalaAUsuarioId: 'U-13' },
  { usuarioId: 'U-17', montoMax: 400_000, escalaAUsuarioId: 'U-14' },
  { usuarioId: 'U-18', montoMax: 350_000, escalaAUsuarioId: 'U-19' },
  { usuarioId: 'U-19', montoMax: 900_000, escalaAUsuarioId: 'U-10' },
  { usuarioId: 'U-20', montoMax: 450_000, escalaAUsuarioId: 'U-21' },
  { usuarioId: 'U-21', montoMax: 1_100_000, escalaAUsuarioId: 'U-8' },
  { usuarioId: 'U-9', montoMax: 800_000, escalaAUsuarioId: 'U-10' },
  { usuarioId: 'U-14', montoMax: 600_000, escalaAUsuarioId: 'U-10' },
  { usuarioId: 'U-13', montoMax: 1_200_000, escalaAUsuarioId: 'U-10' },
  { usuarioId: 'U-6', montoMax: 1_000_000, escalaAUsuarioId: 'U-3' },
  { usuarioId: 'U-3', montoMax: 2_000_000, escalaAUsuarioId: 'U-7' },
  { usuarioId: 'U-4', montoMax: 2_000_000, escalaAUsuarioId: 'U-7' },
  { usuarioId: 'U-10', montoMax: 2_500_000, escalaAUsuarioId: 'U-8' },
  { usuarioId: 'U-8', montoMax: 3_000_000, escalaAUsuarioId: 'U-7' },
  { usuarioId: 'U-7', montoMax: 5_000_000, escalaAUsuarioId: 'U-1' },
  { usuarioId: 'U-1', montoMax: null, escalaAUsuarioId: null },
] as const;

const POOL_APROBADORES = [
  'U-1', 'U-3', 'U-4', 'U-6', 'U-7', 'U-8', 'U-9', 'U-10',
  'U-13', 'U-14', 'U-19', 'U-21',
];

/**
 * 12 grupos Compras: miembros compartidos entre grupos + operativos únicos.
 * Admin (U-1) NO es miembro de grupo; cierra todas las cadenas como nodo OR al tope.
 */
const GRUPOS_COMPRAS = [
  {
    id: 'GRP-COMPRAS-1',
    nombre: 'Grupo 1 — Bodega / insumos',
    aprobadorInicialId: 'U-6',
    miembros: ['U-2', 'U-6', 'U-15', 'U-22', 'U-23', 'U-24', 'U-45'],
  },
  {
    id: 'GRP-COMPRAS-2',
    nombre: 'Grupo 2 — Campo / cuarteles',
    aprobadorInicialId: 'U-9',
    miembros: ['U-11', 'U-12', 'U-9', 'U-25', 'U-26', 'U-27', 'U-46'],
  },
  {
    id: 'GRP-COMPRAS-3',
    nombre: 'Grupo 3 — Packing',
    aprobadorInicialId: 'U-13',
    miembros: ['U-16', 'U-13', 'U-28', 'U-29', 'U-30', 'U-47'],
  },
  {
    id: 'GRP-COMPRAS-4',
    nombre: 'Grupo 4 — Mantención',
    aprobadorInicialId: 'U-14',
    miembros: ['U-17', 'U-14', 'U-31', 'U-32', 'U-48'],
  },
  {
    id: 'GRP-COMPRAS-5',
    nombre: 'Grupo 5 — Compras administrativas',
    aprobadorInicialId: 'U-4',
    miembros: ['U-3', 'U-4', 'U-33', 'U-34', 'U-49'],
  },
  {
    id: 'GRP-COMPRAS-6',
    nombre: 'Grupo 6 — Gerencia operaciones',
    aprobadorInicialId: 'U-10',
    miembros: ['U-8', 'U-10', 'U-35', 'U-11', 'U-50'], // U-11 compartido con Grupo 2
  },
  {
    id: 'GRP-COMPRAS-7',
    nombre: 'Grupo 7 — Riego / energía',
    aprobadorInicialId: 'U-19',
    miembros: ['U-18', 'U-19', 'U-36', 'U-37', 'U-38', 'U-51'],
  },
  {
    id: 'GRP-COMPRAS-8',
    nombre: 'Grupo 8 — Logística / despacho',
    aprobadorInicialId: 'U-21',
    miembros: ['U-20', 'U-21', 'U-39', 'U-40', 'U-52'],
  },
  {
    id: 'GRP-COMPRAS-9',
    nombre: 'Grupo 9 — Calidad / laboratorio',
    aprobadorInicialId: 'U-13',
    miembros: ['U-28', 'U-29', 'U-41', 'U-42', 'U-16', 'U-53'], // U-16/28/29 compartidos con Packing
  },
  {
    id: 'GRP-COMPRAS-10',
    nombre: 'Grupo 10 — TI / servicios generales',
    aprobadorInicialId: 'U-4',
    miembros: ['U-33', 'U-34', 'U-43', 'U-44', 'U-54'],
  },
  {
    id: 'GRP-COMPRAS-11',
    nombre: 'Grupo 11 — Seguridad / HSEQ',
    aprobadorInicialId: 'U-14',
    miembros: ['U-31', 'U-14', 'U-17', 'U-55', 'U-56'], // U-31/17 compartidos con Mantención
  },
  {
    id: 'GRP-COMPRAS-12',
    nombre: 'Grupo 12 — Finanzas operativas',
    aprobadorInicialId: 'U-3',
    miembros: ['U-3', 'U-4', 'U-33', 'U-57', 'U-58'], // U-3/4/33 compartidos con admin
  },
] as const;

/** Usuarios U-7…U-44 (aprobadores + operativos densos por área). */
const EXTRAS_USUARIOS = [
  { id: 'U-7', nombre: 'Claudia Vargas', email: 'cvargas@almahue.cl', username: 'CVARGAS', rolId: 'ROL-4', jefeId: 'U-1', montoMax: 5_000_000 },
  { id: 'U-8', nombre: 'Ricardo Muñoz', email: 'rmunoz@almahue.cl', username: 'RMUNOZ', rolId: 'ROL-4', jefeId: 'U-1', montoMax: 3_000_000 },
  { id: 'U-10', nombre: 'Laura Soto', email: 'lsoto@almahue.cl', username: 'LSOTO', rolId: 'ROL-4', jefeId: 'U-8', montoMax: 2_500_000 },
  { id: 'U-9', nombre: 'Pablo Núñez', email: 'pnunez@almahue.cl', username: 'PNUNEZ', rolId: 'ROL-2', jefeId: 'U-10', montoMax: 800_000 },
  { id: 'U-13', nombre: 'Roberto Silva', email: 'rsilva@almahue.cl', username: 'RSILVA', rolId: 'ROL-2', jefeId: 'U-10', montoMax: 1_200_000 },
  { id: 'U-14', nombre: 'Andrés Mena', email: 'amena@almahue.cl', username: 'AMENA', rolId: 'ROL-2', jefeId: 'U-10', montoMax: 600_000 },
  { id: 'U-11', nombre: 'Diego Morales', email: 'dmorales@almahue.cl', username: 'DMORALES', rolId: 'ROL-2', jefeId: 'U-9', montoMax: null },
  { id: 'U-12', nombre: 'Fernanda Ruiz', email: 'fruiz@almahue.cl', username: 'FRUIZ', rolId: 'ROL-2', jefeId: 'U-9', montoMax: null },
  { id: 'U-15', nombre: 'Luis Herrera', email: 'lherrera@almahue.cl', username: 'LHERRERA', rolId: 'ROL-2', jefeId: 'U-6', montoMax: null },
  { id: 'U-16', nombre: 'Carmen Flores', email: 'cflores@almahue.cl', username: 'CFLORES', rolId: 'ROL-2', jefeId: 'U-13', montoMax: null },
  { id: 'U-17', nombre: 'Miguel Castro', email: 'mcastro@almahue.cl', username: 'MCASTRO', rolId: 'ROL-2', jefeId: 'U-14', montoMax: null },
  // Jefes de área nuevos
  { id: 'U-18', nombre: 'Sofía Bravo', email: 'sbravo@almahue.cl', username: 'SBRAVO', rolId: 'ROL-2', jefeId: 'U-19', montoMax: 350_000 },
  { id: 'U-19', nombre: 'Héctor Paredes', email: 'hparedes@almahue.cl', username: 'HPAREDES', rolId: 'ROL-2', jefeId: 'U-10', montoMax: 900_000 },
  { id: 'U-20', nombre: 'Valentina Ortiz', email: 'vortiz@almahue.cl', username: 'VORTIZ', rolId: 'ROL-2', jefeId: 'U-21', montoMax: 450_000 },
  { id: 'U-21', nombre: 'Nicolás Reyes', email: 'nreyes@almahue.cl', username: 'NREYES', rolId: 'ROL-2', jefeId: 'U-8', montoMax: 1_100_000 },
  // Operativos Bodega
  { id: 'U-22', nombre: 'Tomás Vidal', email: 'tvidal@almahue.cl', username: 'TVIDAL', rolId: 'ROL-2', jefeId: 'U-6', montoMax: null },
  { id: 'U-23', nombre: 'Camila Soto', email: 'csoto@almahue.cl', username: 'CSOTO', rolId: 'ROL-2', jefeId: 'U-6', montoMax: null },
  { id: 'U-24', nombre: 'Ignacio Fuentes', email: 'ifuentes@almahue.cl', username: 'IFUENTES', rolId: 'ROL-2', jefeId: 'U-6', montoMax: null },
  // Operativos Campo
  { id: 'U-25', nombre: 'Patricia Lagos', email: 'plagos@almahue.cl', username: 'PLAGOS', rolId: 'ROL-2', jefeId: 'U-9', montoMax: null },
  { id: 'U-26', nombre: 'Sebastián Díaz', email: 'sdiaz@almahue.cl', username: 'SDIAZ', rolId: 'ROL-2', jefeId: 'U-9', montoMax: null },
  { id: 'U-27', nombre: 'Javiera Campos', email: 'jcampos@almahue.cl', username: 'JCAMPOS', rolId: 'ROL-2', jefeId: 'U-9', montoMax: null },
  // Operativos Packing / Calidad
  { id: 'U-28', nombre: 'Daniela Rojas', email: 'drojas@almahue.cl', username: 'DROJAS', rolId: 'ROL-2', jefeId: 'U-13', montoMax: null },
  { id: 'U-29', nombre: 'Felipe Araya', email: 'faraya@almahue.cl', username: 'FARAYA', rolId: 'ROL-2', jefeId: 'U-13', montoMax: null },
  { id: 'U-30', nombre: 'Antonia Vera', email: 'avera@almahue.cl', username: 'AVERA', rolId: 'ROL-2', jefeId: 'U-13', montoMax: null },
  { id: 'U-41', nombre: 'Martín Quintero', email: 'mquintero@almahue.cl', username: 'MQUINTERO', rolId: 'ROL-2', jefeId: 'U-13', montoMax: null },
  { id: 'U-42', nombre: 'Paula Henríquez', email: 'phenriquez@almahue.cl', username: 'PHENRIQUEZ', rolId: 'ROL-2', jefeId: 'U-13', montoMax: null },
  // Operativos Mantención
  { id: 'U-31', nombre: 'Rodrigo Salas', email: 'rsalas@almahue.cl', username: 'RSALAS', rolId: 'ROL-2', jefeId: 'U-14', montoMax: null },
  { id: 'U-32', nombre: 'Elena Miranda', email: 'emiranda@almahue.cl', username: 'EMIRANDA', rolId: 'ROL-2', jefeId: 'U-14', montoMax: null },
  // Operativos Admin / TI
  { id: 'U-33', nombre: 'Gustavo León', email: 'gleon@almahue.cl', username: 'GLEON', rolId: 'ROL-2', jefeId: 'U-4', montoMax: null },
  { id: 'U-34', nombre: 'Francisca Tapia', email: 'ftapia@almahue.cl', username: 'FTAPIA', rolId: 'ROL-2', jefeId: 'U-4', montoMax: null },
  { id: 'U-43', nombre: 'Álvaro Peña', email: 'apena@almahue.cl', username: 'APENA', rolId: 'ROL-2', jefeId: 'U-4', montoMax: null },
  { id: 'U-44', nombre: 'Natalia Correa', email: 'ncorrea@almahue.cl', username: 'NCORREA', rolId: 'ROL-2', jefeId: 'U-4', montoMax: null },
  // Operativos Gerencia ops
  { id: 'U-35', nombre: 'Bruno Aguirre', email: 'baguirre@almahue.cl', username: 'BAGUIRRE', rolId: 'ROL-2', jefeId: 'U-10', montoMax: null },
  // Operativos Riego
  { id: 'U-36', nombre: 'Catalina Méndez', email: 'cmendez@almahue.cl', username: 'CMENDEZ', rolId: 'ROL-2', jefeId: 'U-19', montoMax: null },
  { id: 'U-37', nombre: 'Matías Contreras', email: 'mcontreras@almahue.cl', username: 'MCONTRERAS', rolId: 'ROL-2', jefeId: 'U-19', montoMax: null },
  { id: 'U-38', nombre: 'Constanza Figueroa', email: 'cfigueroa@almahue.cl', username: 'CFIGUEROA', rolId: 'ROL-2', jefeId: 'U-19', montoMax: null },
  // Operativos Logística
  { id: 'U-39', nombre: 'Benjamín Acuña', email: 'bacuna@almahue.cl', username: 'BACUNA', rolId: 'ROL-2', jefeId: 'U-21', montoMax: null },
  { id: 'U-40', nombre: 'Isidora Pizarro', email: 'ipizarro@almahue.cl', username: 'IPIZARRO', rolId: 'ROL-2', jefeId: 'U-21', montoMax: null },
  // Operativos únicos adicionales (no compartidos / pocos grupos)
  { id: 'U-45', nombre: 'Renata Espinoza', email: 'respinoza@almahue.cl', username: 'RESPINOZA', rolId: 'ROL-2', jefeId: 'U-6', montoMax: null },
  { id: 'U-46', nombre: 'Joaquín Valdés', email: 'jvaldes@almahue.cl', username: 'JVALDES', rolId: 'ROL-2', jefeId: 'U-9', montoMax: null },
  { id: 'U-47', nombre: 'Amanda Ríos', email: 'arios@almahue.cl', username: 'ARIOS', rolId: 'ROL-2', jefeId: 'U-13', montoMax: null },
  { id: 'U-48', nombre: 'Cristóbal Vega', email: 'cvega@almahue.cl', username: 'CVEGA', rolId: 'ROL-2', jefeId: 'U-14', montoMax: null },
  { id: 'U-49', nombre: 'Josefina Sandoval', email: 'jsandoval@almahue.cl', username: 'JSANDOVAL', rolId: 'ROL-2', jefeId: 'U-4', montoMax: null },
  { id: 'U-50', nombre: 'Maximiliano Cruz', email: 'mcruz@almahue.cl', username: 'MCRUZ', rolId: 'ROL-2', jefeId: 'U-10', montoMax: null },
  { id: 'U-51', nombre: 'Trinidad Navarro', email: 'tnavarro@almahue.cl', username: 'TNAVARRO', rolId: 'ROL-2', jefeId: 'U-19', montoMax: null },
  { id: 'U-52', nombre: 'Simón Godoy', email: 'sgodoy@almahue.cl', username: 'SGODOY', rolId: 'ROL-2', jefeId: 'U-21', montoMax: null },
  { id: 'U-53', nombre: 'Emma Sepúlveda', email: 'esepulveda@almahue.cl', username: 'ESEPULVEDA', rolId: 'ROL-2', jefeId: 'U-13', montoMax: null },
  { id: 'U-54', nombre: 'Lucas Farías', email: 'lfarias@almahue.cl', username: 'LFARIAS', rolId: 'ROL-2', jefeId: 'U-4', montoMax: null },
  { id: 'U-55', nombre: 'Amanda Toledo', email: 'atoledo@almahue.cl', username: 'ATOLEDO', rolId: 'ROL-2', jefeId: 'U-14', montoMax: null },
  { id: 'U-56', nombre: 'Vicente Carrasco', email: 'vcarrasco@almahue.cl', username: 'VCARRASCO', rolId: 'ROL-2', jefeId: 'U-14', montoMax: null },
  { id: 'U-57', nombre: 'Florencia Ibarra', email: 'fibarra@almahue.cl', username: 'FIBARRA', rolId: 'ROL-2', jefeId: 'U-3', montoMax: null },
  { id: 'U-58', nombre: 'Tomás Arancibia', email: 'tarancibia@almahue.cl', username: 'TARANCIBIA', rolId: 'ROL-2', jefeId: 'U-3', montoMax: null },
] as const;

async function ensureUsuariosOrgGrande(prisma: PrismaClient, pinHash: string) {
  const pwHash = await bcrypt.hash('demo123', 10);
  // Pasada 1: crear/actualizar sin jefeId (evita FK si el jefe aún no existe).
  for (const u of EXTRAS_USUARIOS) {
    await prisma.usuario.upsert({
      where: { id: u.id },
      update: {
        nombre: u.nombre,
        email: u.email,
        username: u.username,
        rolId: u.rolId,
        empresaId: EMPRESA_ID,
        activo: true,
        montoMaxAprobacion: u.montoMax,
        pinAprobacionHash: (POOL_APROBADORES as readonly string[]).includes(u.id) ? pinHash : undefined,
      },
      create: {
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        username: u.username,
        passwordHash: pwHash,
        rolId: u.rolId,
        empresaId: EMPRESA_ID,
        activo: true,
        montoMaxAprobacion: u.montoMax,
        pinAprobacionHash: (POOL_APROBADORES as readonly string[]).includes(u.id) ? pinHash : undefined,
      },
    });
    await prisma.usuarioEmpresa.upsert({
      where: { usuarioId_empresaId: { usuarioId: u.id, empresaId: EMPRESA_ID } },
      update: {},
      create: { usuarioId: u.id, empresaId: EMPRESA_ID },
    });
  }

  // Pasada 2: organigrama (jefes).
  for (const u of EXTRAS_USUARIOS) {
    await prisma.usuario.update({
      where: { id: u.id },
      data: { jefeId: u.jefeId },
    });
  }

  await prisma.usuario.update({ where: { id: 'U-3' }, data: { jefeId: 'U-7', montoMaxAprobacion: 2_000_000 } });
  await prisma.usuario.update({ where: { id: 'U-4' }, data: { jefeId: 'U-7', montoMaxAprobacion: 2_000_000 } });
  await prisma.usuario.update({ where: { id: 'U-6' }, data: { jefeId: 'U-3', montoMaxAprobacion: 1_000_000 } });
  await prisma.usuario.update({ where: { id: 'U-2' }, data: { jefeId: 'U-6' } });
  await prisma.usuario.update({ where: { id: 'U-15' }, data: { jefeId: 'U-6' } });

  console.log(`  Usuarios organigrama ampliado: U-7 … U-44 (${EXTRAS_USUARIOS.length} upsert)`);
}

export async function seedAprobacionesFase2(prisma: PrismaClient, empresaId = EMPRESA_ID) {
  console.log(`\n[seed-aprobaciones-fase2] Empresa ${empresaId} — organigrama denso (UI stress)`);

  const pinHash = await bcrypt.hash(PIN_DEMO, 10);
  await ensureUsuariosOrgGrande(prisma, pinHash);

  for (const uid of POOL_APROBADORES) {
    await prisma.usuario.update({
      where: { id: uid },
      data: { pinAprobacionHash: pinHash },
    });
  }
  console.log(`  PIN ${PIN_DEMO} → ${POOL_APROBADORES.join(', ')}`);

  await prisma.rol.update({
    where: { id: 'ROL-2' },
    data: {
      permisos: {
        set: [
          'contratistas:read',
          'compras:read',
          'compras:write',
          'insumos:read',
          'contabilidad:read',
          'tesoreria:read',
          'comercial:read',
          'catalogos:read',
          'reportes:read',
        ],
      },
    },
  });
  console.log('  ROL-2 (Analista): + compras:write para pruebas OC');

  // Limpiar configuración de aprobaciones de la empresa
  await prisma.pasoAprobacionDetalle.deleteMany({}).catch(() => undefined);
  await prisma.nodoAprobador.deleteMany({ where: { nodo: { empresaId } } });
  await prisma.nodoEscalaAprobacion.deleteMany({ where: { empresaId } });
  await prisma.adminConcepto.deleteMany({ where: { empresaId } });
  await prisma.usuarioGrupoAprobacion.deleteMany({
    where: { grupo: { empresaId } },
  });
  await prisma.grupoAprobacion.deleteMany({ where: { empresaId } });

  for (const g of GRUPOS_COMPRAS) {
    await prisma.grupoAprobacion.create({
      data: {
        id: g.id,
        empresaId,
        modulo: 'Compras',
        nombre: g.nombre,
        aprobadorInicialId: g.aprobadorInicialId,
        activo: true,
        miembros: { create: g.miembros.map((usuarioId) => ({ usuarioId })) },
      },
    });
  }


  /** Plantilla global de topes; se materializa una cadena por grupo desde su entrada. */
  const escalaByUser = new Map<string, { montoMax: number | null; escalaAUsuarioId: string | null }>(
    ESCALAS.map((e) => [
      e.usuarioId,
      { montoMax: e.montoMax, escalaAUsuarioId: e.escalaAUsuarioId },
    ]),
  );
  const ADMIN_ID = 'U-1';

  const materializarCadenaGrupo = async (
    grupoId: string,
    modulo: string,
    entradaId: string,
    miembros: readonly string[],
    /** Opcional: nodo con lógica AND/OR y aprobadores extra (por usuarioId del nodo). */
    nodosEspeciales?: Record<string, { logica: 'AND' | 'OR'; extra: string[] }>,
  ) => {
    // Precalcular principales de la cadena (nadie de esta lista puede ser co-aprobador en otro nivel)
    const cadenaPrincipales: string[] = [];
    {
      let walk: string | null = entradaId;
      const walkSeen = new Set<string>();
      while (walk && !walkSeen.has(walk)) {
        walkSeen.add(walk);
        cadenaPrincipales.push(walk);
        if (walk === ADMIN_ID) break;
        const next: string | null = escalaByUser.get(walk)?.escalaAUsuarioId ?? null;
        walk = next ?? ADMIN_ID;
      }
      if (!walkSeen.has(ADMIN_ID)) cadenaPrincipales.push(ADMIN_ID);
    }
    const principalsSet = new Set(cadenaPrincipales);
    /** Personas ya ocupadas como principal o co-aprobador en este grupo. */
    const usadosEnCadena = new Set<string>(cadenaPrincipales);

    const nodoIdByUser = new Map<string, string>();
    const nodosCreados: Array<{
      id: string;
      usuarioId: string;
      escalaAUsuarioId: string | null;
      logica: string;
      extra: string[];
    }> = [];

    const pickOrExtra = () =>
      miembros.find((id) => id !== ADMIN_ID && !usadosEnCadena.has(id)) ?? null;

    const resolverEspecial = (usuarioId: string): { logica: 'SIMPLE' | 'AND' | 'OR'; extra: string[] } => {
      if (usuarioId === ADMIN_ID) {
        const orExtra = pickOrExtra();
        return orExtra
          ? { logica: 'OR', extra: [orExtra] }
          : { logica: 'SIMPLE', extra: [] };
      }
      const especial = nodosEspeciales?.[usuarioId];
      if (!especial) return { logica: 'SIMPLE', extra: [] };
      // Excluye principales de cualquier nivel y co-aprobadores ya tomados
      const extra = especial.extra.filter(
        (id) => id !== usuarioId && !principalsSet.has(id) && !usadosEnCadena.has(id),
      );
      if (extra.length < 1) {
        return { logica: 'SIMPLE', extra: [] };
      }
      return { logica: especial.logica, extra };
    };

    // Pasada 1: crear nodos de la cadena
    for (let i = 0; i < cadenaPrincipales.length; i++) {
      const cur = cadenaPrincipales[i]!;
      const plantilla = escalaByUser.get(cur);
      let montoMax = plantilla?.montoMax ?? null;
      let escalaAUsuarioId: string | null =
        i < cadenaPrincipales.length - 1 ? cadenaPrincipales[i + 1]! : null;

      if (cur === ADMIN_ID) {
        montoMax = null;
        escalaAUsuarioId = null;
      }

      const { logica, extra } = resolverEspecial(cur);
      for (const e of extra) usadosEnCadena.add(e);

      const nodo = await prisma.nodoEscalaAprobacion.create({
        data: {
          empresaId,
          grupoId,
          modulo,
          usuarioId: cur,
          montoMax,
          escalaAUsuarioId,
          logica,
          activo: true,
        },
      });
      nodoIdByUser.set(cur, nodo.id);
      nodosCreados.push({ id: nodo.id, usuarioId: cur, escalaAUsuarioId, logica, extra });
    }

    // Pasada 2: enlazar escalaAId + crear NodoAprobador
    for (const n of nodosCreados) {
      const escalaAId = n.escalaAUsuarioId ? (nodoIdByUser.get(n.escalaAUsuarioId) ?? null) : null;
      const extrasLimpios = n.extra.filter(
        (id) => id !== n.usuarioId && !principalsSet.has(id),
      );
      let logica = n.logica;
      if (logica !== 'SIMPLE' && extrasLimpios.length < 1) {
        logica = 'SIMPLE';
      }
      await prisma.nodoEscalaAprobacion.update({
        where: { id: n.id },
        data: { escalaAId, logica },
      });
      await prisma.nodoAprobador.create({
        data: { nodoId: n.id, usuarioId: n.usuarioId, orden: 0 },
      });
      for (let i = 0; i < extrasLimpios.length; i++) {
        await prisma.nodoAprobador.create({
          data: { nodoId: n.id, usuarioId: extrasLimpios[i]!, orden: i + 1 },
        });
      }
    }
  };

  for (const g of GRUPOS_COMPRAS) {
    // Grupo 6: Laura Soto AND con Bruno (miembro) — NO con Ricardo, que es el nivel siguiente
    const especiales = g.id === 'GRP-COMPRAS-6'
      ? { 'U-10': { logica: 'AND' as const, extra: ['U-35'] } }
      : undefined;
    await materializarCadenaGrupo(g.id, 'Compras', g.aprobadorInicialId, g.miembros, especiales);
  }
  const totalNodos = await prisma.nodoEscalaAprobacion.count({ where: { empresaId } });

  await prisma.workflowConfig.updateMany({
    where: { empresaId, modulo: 'Compras' },
    data: { aprobadorIds: [...POOL_APROBADORES] },
  });

  await prisma.delegacionAprobacion.deleteMany({
    where: {
      id: { in: ['DEL-DEMO-MARIA-2026', 'DEL-DEMO-PABLO-2026'] },
    },
  });

  await prisma.delegacionAprobacion.createMany({
    data: [
      {
        id: 'DEL-DEMO-MARIA-2026',
        empresaId,
        titularId: 'U-6',
        suplenteId: 'U-3',
        modulo: 'Compras',
        vigenciaDesde: new Date('2026-08-01T00:00:00.000Z'),
        vigenciaHasta: new Date('2026-08-31T23:59:59.000Z'),
        motivo: 'Vacaciones María — demo',
        activo: true,
      },
      {
        id: 'DEL-DEMO-PABLO-2026',
        empresaId,
        titularId: 'U-9',
        suplenteId: 'U-10',
        modulo: 'Compras',
        vigenciaDesde: new Date('2026-09-01T00:00:00.000Z'),
        vigenciaHasta: new Date('2026-09-15T23:59:59.000Z'),
        motivo: 'Licencia Pablo — suplencia gerente ops',
        activo: true,
      },
    ],
  });

  // Administradores de concepto (visibilidad + config, no participan en cadena)
  await prisma.adminConcepto.createMany({
    data: [
      { id: 'AC-COMPRAS-1', empresaId, usuarioId: 'U-7', modulo: 'Compras', activo: true },
    ],
  });

  console.log(`  Grupos Compras: ${GRUPOS_COMPRAS.length}`);
  console.log(`  Escalas: ${totalNodos} nodos (cierre OR: Admin + 1 miembro libre del grupo)`);
  console.log('  AdminConcepto: Claudia Vargas (Compras)');
  console.log('  Nodo AND demo: Grupo 6 — Laura Soto + Bruno Aguirre (sin repetir niveles)');
  console.log('  Miembros: compartidos entre grupos + operativos únicos U-45…U-58');
  console.log('  Suplencias demo: María→Jorge · Pablo→Laura');
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  try {
    await seedAprobacionesFase2(prisma);
    console.log('\n✅ seed-aprobaciones-fase2 listo\n');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
