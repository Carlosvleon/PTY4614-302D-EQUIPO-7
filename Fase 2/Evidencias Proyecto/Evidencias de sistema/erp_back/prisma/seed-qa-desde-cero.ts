/**
 * Parametrización QA post `reset:superadmin`: maestros + usuarios operativos.
 * NO crea OC / OV / facturas / proformas / pagos.
 *
 * Uso:
 *   npm run reset:superadmin
 *   npm run seed:qa-desde-cero
 *
 * Empresa: EMP-BOOT. Admin U-1 no es miembro ni nodo de escala.
 * Cadena: N1 (tope $500.000) → Laura Soto (sin tope). Casos 1 nivel / 2 niveles.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { seedTiposReferenciaAgrosoft } from './seed-tipos-referencia';

const EMP = 'EMP-BOOT';
const PIN = '4821';
const PW_OPS = 'demo123';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
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
  const pinAprobacionHash = opts.pin ? await hash(PIN) : undefined;
  await prisma.usuario.upsert({
    where: { id: opts.id },
    update: {
      nombre: opts.nombre,
      email: opts.email,
      username: opts.username,
      rolId: opts.rolId,
      empresaId: EMP,
      activo: true,
      jefeId: opts.jefeId,
      montoMaxAprobacion: opts.montoMax ?? null,
      ...(pinAprobacionHash ? { pinAprobacionHash } : {}),
    },
    create: {
      id: opts.id,
      nombre: opts.nombre,
      email: opts.email,
      username: opts.username,
      passwordHash,
      rolId: opts.rolId,
      empresaId: EMP,
      activo: true,
      jefeId: opts.jefeId,
      montoMaxAprobacion: opts.montoMax ?? null,
      pinAprobacionHash,
    },
  });
  await prisma.usuarioEmpresa.upsert({
    where: { usuarioId_empresaId: { usuarioId: opts.id, empresaId: EMP } },
    update: {},
    create: { usuarioId: opts.id, empresaId: EMP },
  });
}

/** Dos niveles operativos. El admin (U-1) no es nodo ni miembro. */
async function cadenaDosNiveles(
  grupoId: string,
  modulo: string,
  n1Id: string,
  topeN1: number,
  n2Id: string,
) {
  const n1 = await prisma.nodoEscalaAprobacion.create({
    data: {
      empresaId: EMP,
      grupoId,
      modulo,
      usuarioId: n1Id,
      montoMax: topeN1,
      escalaAUsuarioId: n2Id,
      logica: 'SIMPLE',
      activo: true,
    },
  });
  const n2 = await prisma.nodoEscalaAprobacion.create({
    data: {
      empresaId: EMP,
      grupoId,
      modulo,
      usuarioId: n2Id,
      montoMax: null,
      escalaAUsuarioId: null,
      logica: 'SIMPLE',
      activo: true,
    },
  });
  await prisma.nodoEscalaAprobacion.update({
    where: { id: n1.id },
    data: { escalaAId: n2.id },
  });
  await prisma.nodoAprobador.create({ data: { nodoId: n1.id, usuarioId: n1Id, orden: 0 } });
  await prisma.nodoAprobador.create({ data: { nodoId: n2.id, usuarioId: n2Id, orden: 0 } });
}

async function main() {
  const admin = await prisma.usuario.findUnique({ where: { id: 'U-1' } });
  if (!admin || admin.empresaId !== EMP) {
    throw new Error('Corré primero `npm run reset:superadmin` (espera U-1 en EMP-BOOT).');
  }

  console.log('[qa-desde-cero] Empresa + flags piloto');
  await prisma.empresa.update({
    where: { id: EMP },
    data: {
      rut: '76.123.456-0',
      razonSocial: 'Almahue SpA',
      giro: 'Agrícola / packing',
      activa: true,
      direccion: 'Camino Almahue s/n',
      comuna: 'Santa Cruz',
      ciudad: 'Santa Cruz',
    },
  });

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
      nombre: 'Tesorería',
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

  console.log('[qa-desde-cero] Usuarios (el admin los habría dado de alta)');
  await ensureUsuario({
    id: 'U-QA-LAURA',
    nombre: 'Laura Soto',
    email: 'lsoto@almahue.cl',
    username: 'LSOTO',
    rolId: 'ROL-GERENCIA',
    pin: true,
    montoMax: null,
  });
  await ensureUsuario({
    id: 'U-QA-MARIA',
    nombre: 'María González',
    email: 'mgonzalez@almahue.cl',
    username: 'MGONZALEZ',
    rolId: 'ROL-COMPRAS',
    pin: true,
    jefeId: 'U-QA-LAURA',
    montoMax: 500_000,
  });
  await ensureUsuario({
    id: 'U-QA-PABLO',
    nombre: 'Pablo Núñez',
    email: 'pnunez@almahue.cl',
    username: 'PNUNEZ',
    rolId: 'ROL-VENTAS',
    pin: true,
    jefeId: 'U-QA-LAURA',
    montoMax: 500_000,
  });
  await ensureUsuario({
    id: 'U-QA-RICARDO',
    nombre: 'Ricardo Muñoz',
    email: 'rmunoz@almahue.cl',
    username: 'RMUNOZ',
    rolId: 'ROL-CTR',
    pin: true,
    jefeId: 'U-QA-LAURA',
    montoMax: 500_000,
  });
  await ensureUsuario({
    id: 'U-QA-CLAUDIA',
    nombre: 'Claudia Vargas',
    email: 'cvargas@almahue.cl',
    username: 'CVARGAS',
    rolId: 'ROL-CONTA',
    pin: true,
  });
  await ensureUsuario({
    id: 'U-QA-LUIS',
    nombre: 'Luis Herrera',
    email: 'lherrera@almahue.cl',
    username: 'LHERRERA',
    rolId: 'ROL-COMPRAS',
    jefeId: 'U-QA-MARIA',
  });
  await ensureUsuario({
    id: 'U-QA-CAMILA',
    nombre: 'Camila Soto',
    email: 'csoto@almahue.cl',
    username: 'CSOTO',
    rolId: 'ROL-VENTAS',
    jefeId: 'U-QA-PABLO',
  });
  await ensureUsuario({
    id: 'U-QA-DIEGO',
    nombre: 'Diego Morales',
    email: 'dmorales@almahue.cl',
    username: 'DMORALES',
    rolId: 'ROL-CTR',
    jefeId: 'U-QA-RICARDO',
  });
  await ensureUsuario({
    id: 'U-QA-ANA',
    nombre: 'Ana Torres',
    email: 'atorres@almahue.cl',
    username: 'ATORRES',
    rolId: 'ROL-TESO',
  });
  await ensureUsuario({
    id: 'U-QA-TOMAS',
    nombre: 'Tomás Vidal',
    email: 'tvidal@almahue.cl',
    username: 'TVIDAL',
    rolId: 'ROL-BODEGA',
  });

  await prisma.usuario.update({ where: { id: 'U-QA-LUIS' }, data: { jefeId: 'U-QA-MARIA' } });
  await prisma.usuario.update({ where: { id: 'U-QA-CAMILA' }, data: { jefeId: 'U-QA-PABLO' } });
  await prisma.usuario.update({ where: { id: 'U-QA-DIEGO' }, data: { jefeId: 'U-QA-RICARDO' } });

  console.log('[qa-desde-cero] Catálogos / maestros (sin documentos)');
  const nRef = await seedTiposReferenciaAgrosoft(prisma);
  console.log(`[qa-desde-cero] ${nRef} tipos de referencia Agrosoft`);
  await prisma.moneda.upsert({
    where: { codigo: 'CLP' },
    update: { activa: true, focoReporteria: true },
    create: { id: 'MON-CLP', codigo: 'CLP', nombre: 'Peso chileno', simbolo: '$', focoReporteria: true },
  });
  await prisma.unidadMedida.upsert({
    where: { codigo: 'KG' },
    update: {},
    create: { id: 'UM-KG', codigo: 'KG', nombre: 'Kilogramo' },
  });
  await prisma.unidadMedida.upsert({
    where: { codigo: 'CAJ' },
    update: {},
    create: { id: 'UM-CAJ', codigo: 'CAJ', nombre: 'Caja' },
  });
  await prisma.unidadMedida.upsert({
    where: { codigo: 'UN' },
    update: {},
    create: { id: 'UM-UN', codigo: 'UN', nombre: 'Unidad' },
  });

  await prisma.centroCosto.upsert({
    where: { id: 'CC-QA-ADM' },
    update: { nombre: 'Administración', activa: true, empresaId: EMP },
    create: { id: 'CC-QA-ADM', codigo: 'ADM', nombre: 'Administración', empresaId: EMP },
  });
  await prisma.areaNegocio.upsert({
    where: { empresaId_codigo: { empresaId: EMP, codigo: 'PACK' } },
    update: {},
    create: { id: 'AREA-QA-PACK', codigo: 'PACK', nombre: 'Packing', empresaId: EMP },
  });
  await prisma.sucursal.upsert({
    where: { empresaId_codigo: { empresaId: EMP, codigo: 'CEN' } },
    update: {},
    create: { codigo: 'CEN', nombre: 'Casa Matriz', empresaId: EMP },
  });

  const desde = new Date('2026-08-01T00:00:00.000Z');
  const hasta = new Date('2026-08-31T23:59:59.000Z');
  await prisma.periodoContable.upsert({
    where: { empresaId_codigo: { empresaId: EMP, codigo: '2026-08' } },
    update: { estado: 'ABIERTO', activo: true, fechaDesde: desde, fechaHasta: hasta },
    create: {
      empresaId: EMP,
      codigo: '2026-08',
      anio: 2026,
      mes: 8,
      fechaDesde: desde,
      fechaHasta: hasta,
      estado: 'ABIERTO',
      activo: true,
    },
  });

  await prisma.cuentaContable.upsert({
    where: { id: 'CTA-QA-BANCO' },
    update: {},
    create: {
      id: 'CTA-QA-BANCO',
      codigo: '1-1-01-01',
      nombre: 'Banco',
      tipo: 'ACTIVO',
      nivel: 4,
      noImputable: false,
      empresaId: EMP,
    },
  });
  await prisma.cuentaContable.upsert({
    where: { id: 'CTA-QA-CXC' },
    update: {},
    create: {
      id: 'CTA-QA-CXC',
      codigo: '1-1-02-01',
      nombre: 'Clientes',
      tipo: 'ACTIVO',
      nivel: 4,
      noImputable: false,
      empresaId: EMP,
    },
  });

  await prisma.bodega.upsert({
    where: { empresaId_codigo: { empresaId: EMP, codigo: 'FRIG' } },
    update: {},
    create: { id: 'BOD-QA-FRIG', codigo: 'FRIG', nombre: 'Frigorífico', empresaId: EMP, activa: true },
  });
  const bod = await prisma.bodega.findFirstOrThrow({ where: { empresaId: EMP, codigo: 'FRIG' } });

  await prisma.insumo.upsert({
    where: { empresaId_codigo: { empresaId: EMP, codigo: '00000003' } },
    update: {},
    create: {
      id: 'INS-QA-CEREZA',
      codigo: '00000003',
      familia: 'Fruta',
      subfamilia: 'Cereza',
      nombre: 'Cereza 5 kg export',
      unidad: 'CAJ',
      costoPromedio: 1850,
      inventariable: true,
      empresaId: EMP,
    },
  });
  const ins = await prisma.insumo.findFirstOrThrow({ where: { empresaId: EMP, codigo: '00000003' } });
  await prisma.stockInsumoBodega.upsert({
    where: { empresaId_insumoId_bodegaId: { empresaId: EMP, insumoId: ins.id, bodegaId: bod.id } },
    update: { cantidad: 800 },
    create: { empresaId: EMP, insumoId: ins.id, bodegaId: bod.id, cantidad: 800 },
  });
  await prisma.insumo.update({ where: { id: ins.id }, data: { stock: 800 } });

  await prisma.proveedor.upsert({
    where: { empresaId_rut: { empresaId: EMP, rut: '77.111.222-6' } },
    update: {},
    create: {
      id: 'PROV-QA-PACK',
      rut: '77.111.222-6',
      razonSocial: 'Packaging Chile SpA',
      giro: 'Envases',
      activo: true,
      empresaId: EMP,
    },
  });
  await prisma.cliente.upsert({
    where: { empresaId_rut: { empresaId: EMP, rut: '76.111.000-4' } },
    update: {},
    create: {
      id: 'CLI-QA-PACKING',
      rut: '76.111.000-4',
      razonSocial: 'Comercial Packing Centro',
      credito: 15_000_000,
      vendedor: 'Camila Soto',
      activo: true,
      esProductor: true,
      empresaId: EMP,
    },
  });

  await prisma.labor.upsert({
    where: { empresaId_codigo: { empresaId: EMP, codigo: 'COS-MAN' } },
    update: {},
    create: { id: 'LAB-QA-1', codigo: 'COS-MAN', nombre: 'Cosecha manual', empresaId: EMP },
  });
  await prisma.actividad.upsert({
    where: { empresaId_codigo: { empresaId: EMP, codigo: 'COS-UVA' } },
    update: {},
    create: { id: 'ACT-QA-1', codigo: 'COS-UVA', nombre: 'Cosecha uva', empresaId: EMP },
  });
  await prisma.contratista.upsert({
    where: { id: 'CTR-QA-1' },
    update: {},
    create: {
      id: 'CTR-QA-1',
      rut: '76.111.222-3',
      razonSocial: 'Servicios Agrícolas del Valle',
      especialidad: 'Cosecha',
      empresaId: EMP,
      activo: true,
    },
  });
  await prisma.laborActividad.upsert({
    where: { laborId_actividadId: { laborId: 'LAB-QA-1', actividadId: 'ACT-QA-1' } },
    update: {},
    create: { laborId: 'LAB-QA-1', actividadId: 'ACT-QA-1' },
  });
  const tarifaExiste = await prisma.tarifaContratista.findFirst({
    where: { empresaId: EMP, contratistaId: 'CTR-QA-1' },
  });
  if (!tarifaExiste) {
    await prisma.tarifaContratista.create({
      data: {
        contratistaId: 'CTR-QA-1',
        laborId: 'LAB-QA-1',
        actividadId: 'ACT-QA-1',
        tarifa: 12_000,
        unidad: 'HR',
        centroCostoId: 'CC-QA-ADM',
        empresaId: EMP,
        vigenciaDesde: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
  }

  console.log('[qa-desde-cero] Grupos/escalas (admin NO es miembro ni nodo; final = Laura Soto)');
  const grpCompras = await prisma.grupoAprobacion.create({
    data: {
      id: 'GRP-QA-COMPRAS',
      empresaId: EMP,
      modulo: 'Compras',
      nombre: 'Compras — packing',
      aprobadorInicialId: 'U-QA-MARIA',
      activo: true,
      miembros: {
        create: [
          { usuarioId: 'U-QA-LUIS' },
          { usuarioId: 'U-QA-MARIA' },
          { usuarioId: 'U-QA-LAURA' },
        ],
      },
    },
  });
  await cadenaDosNiveles(grpCompras.id, 'Compras', 'U-QA-MARIA', 500_000, 'U-QA-LAURA');

  await prisma.adminConcepto.createMany({
    data: [
      { empresaId: EMP, usuarioId: 'U-QA-CLAUDIA', modulo: 'Compras', activo: true },
    ],
  });

  const counts = {
    usuarios: await prisma.usuario.count({ where: { empresaId: EMP } }),
    grupos: await prisma.grupoAprobacion.count({ where: { empresaId: EMP } }),
    oc: await prisma.ordenCompra.count({ where: { empresaId: EMP } }),
    docs: await prisma.documentoComercial.count({ where: { empresaId: EMP } }),
  };
  console.log('[qa-desde-cero] OK', counts);
  if (counts.oc !== 0 || counts.docs !== 0) {
    throw new Error('La parametrización no debe incluir documentos de negocio.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
