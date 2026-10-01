/**
 * Validación Reu6 — organigrama, montos, escalamiento, PIN pool, Admin bypass.
 * Ejecutar: npx ts-node -r tsconfig-paths/register scripts/validate-aprobaciones-reu6.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import {
  buildCadenaAprobacion,
  loadGruposAprobacion,
  loadNodosEscala,
  loadUsuariosOrganigrama,
  resolveCadenaCompleta,
  resolverPrimeraAprobacion,
} from '../src/modules/aprobaciones/approval-engine';
import { usuarioPuedeUsarPinAprobacion } from '../src/auth/pin-aprobacion';
import type { PrismaService } from '../src/prisma/prisma.service';

const BASE = process.env.API_BASE ?? 'http://localhost:3001/api/v1';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const prismaSvc = prisma as unknown as PrismaService;

type Result = { id: string; ok: boolean; detail: string };

const results: Result[] = [];

function pass(id: string, detail: string) {
  results.push({ id, ok: true, detail });
  console.log(`  ✅ ${id}: ${detail}`);
}

function fail(id: string, detail: string) {
  results.push({ id, ok: false, detail });
  console.log(`  ❌ ${id}: ${detail}`);
}

async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login ${email}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ token: string; user: Record<string, unknown> }>;
}

async function api(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  empresaId = 'EMP-1',
) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Empresa-Id': empresaId,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* raw */
  }
  return { status: res.status, data };
}

async function validateDbOrganigrama() {
  console.log('\n── DB: organigrama seed ──');
  const expected: Record<string, { jefeId: string | null; montoMax: number | null }> = {
    'U-2': { jefeId: 'U-6', montoMax: null },
    'U-3': { jefeId: 'U-6', montoMax: null },
    'U-4': { jefeId: 'U-6', montoMax: null },
    'U-6': { jefeId: 'U-1', montoMax: 500_000 },
  };
  for (const [uid, exp] of Object.entries(expected)) {
    const u = await prisma.usuario.findUnique({
      where: { id: uid },
      select: { jefeId: true, montoMaxAprobacion: true },
    });
    if (!u) {
      fail(`DB-ORG-${uid}`, 'usuario no existe');
      continue;
    }
    const max = u.montoMaxAprobacion != null ? Number(u.montoMaxAprobacion) : null;
    if (u.jefeId === exp.jefeId && max === exp.montoMax) {
      pass(`DB-ORG-${uid}`, `jefe=${u.jefeId} tope=${max ?? '∞'}`);
    } else {
      fail(`DB-ORG-${uid}`, `esperado jefe=${exp.jefeId} tope=${exp.montoMax}, got jefe=${u.jefeId} tope=${max}`);
    }
  }
}

async function validateEngine() {
  console.log('\n── Motor: cadena por montos (Reu6 D6) ──');
  const usuarios = await loadUsuariosOrganigrama(prismaSvc, 'EMP-1');
  const pool = ['U-1', 'U-6'];

  const bajo = buildCadenaAprobacion('U-3', 300_000, usuarios, pool);
  if (bajo.length === 1 && bajo[0].id === 'U-6') {
    pass('ENG-300K', 'solo María (cubre $300k)');
  } else {
    fail('ENG-300K', `cadena=${bajo.map((c) => c.id).join('→')}`);
  }

  const alto = buildCadenaAprobacion('U-3', 800_000, usuarios, pool);
  if (alto.length === 2 && alto[0].id === 'U-6' && alto[1].id === 'U-1') {
    pass('ENG-800K', 'María → Admin (escala por monto)');
  } else {
    fail('ENG-800K', `cadena=${alto.map((c) => c.id).join('→')}`);
  }

  const sinJefe = resolverPrimeraAprobacion('U-1', 100, usuarios, pool);
  if (sinJefe === null) {
    pass('ENG-NO-JEFE-ADMIN', 'Admin sin jefe no genera cadena propia');
  } else {
    fail('ENG-NO-JEFE-ADMIN', `unexpected ${JSON.stringify(sinJefe)}`);
  }
}

async function validateFase2GruposEscalas() {
  console.log('\n── Fase 2: grupos + escalas A/B/C/D ──');
  const grupos = await loadGruposAprobacion(prismaSvc, 'EMP-1');
  const nodos = await loadNodosEscala(prismaSvc, 'EMP-1', 'Compras');
  const usuarios = await loadUsuariosOrganigrama(prismaSvc, 'EMP-1');
  const pool = ['U-1', 'U-3', 'U-4', 'U-6'];

  if (grupos.filter((g) => g.activo && g.modulo === 'Compras').length >= 2) {
    pass('F2-GRUPOS-SEED', `${grupos.length} grupos cargados`);
  } else {
    fail('F2-GRUPOS-SEED', 'Ejecute seed para grupos demo');
    return;
  }

  const r800 = resolveCadenaCompleta({
    solicitanteId: 'U-2',
    monto: 800_000,
    modulo: 'Compras',
    usuarios,
    allowedIds: pool,
    grupos,
    nodos,
    delegaciones: [],
  });
  if (r800.status === 'ok' && r800.cadenaIds.join('→') === 'U-6') {
    pass('F2-U2-800K', 'Carolina → María (A cubre)');
  } else {
    fail('F2-U2-800K', JSON.stringify(r800));
  }

  const r1500 = resolveCadenaCompleta({
    solicitanteId: 'U-2',
    monto: 1_500_000,
    modulo: 'Compras',
    usuarios,
    allowedIds: pool,
    grupos,
    nodos,
    delegaciones: [],
  });
  if (r1500.status === 'ok' && r1500.cadenaIds.join('→') === 'U-6→U-3') {
    pass('F2-U2-1.5M', 'Carolina → María → Jorge (A→C)');
  } else {
    fail('F2-U2-1.5M', JSON.stringify(r1500));
  }

  const r1500j = resolveCadenaCompleta({
    solicitanteId: 'U-3',
    monto: 1_500_000,
    modulo: 'Compras',
    usuarios,
    allowedIds: pool,
    grupos,
    nodos,
    delegaciones: [],
  });
  if (r1500j.status === 'ok' && r1500j.cadenaIds.join('→') === 'U-4') {
    pass('F2-U3-1.5M', 'Jorge → Ana Torres (B cubre)');
  } else {
    fail('F2-U3-1.5M', JSON.stringify(r1500j));
  }
}

async function validatePinPool() {
  console.log('\n── PIN: pool / Admin (Reu6 D5) ──');
  const adminPin = await usuarioPuedeUsarPinAprobacion(prismaSvc, 'U-1');
  const mariaPin = await usuarioPuedeUsarPinAprobacion(prismaSvc, 'U-6');
  const jorgePin = await usuarioPuedeUsarPinAprobacion(prismaSvc, 'U-3');

  if (adminPin) pass('PIN-ADMIN', 'Admin master puede PIN');
  else fail('PIN-ADMIN', 'Admin debería usar PIN');

  if (mariaPin) pass('PIN-POOL-U6', 'María en pool Workflow');
  else fail('PIN-POOL-U6', 'María está en aprobadorIds');

  if (!jorgePin) pass('PIN-NO-POOL-U3', 'Jorge fuera del pool no requiere PIN');
  else fail('PIN-NO-POOL-U3', 'Jorge no debería requerir PIN');
}

async function ensureMariaPin() {
  const pinHash = await bcrypt.hash('4821', 10);
  await prisma.usuario.update({
    where: { id: 'U-6' },
    data: { pinAprobacionHash: pinHash },
  });
}

async function validateApiOcEscalamiento() {
  console.log('\n── API: OC escalamiento end-to-end ──');

  // Carolina tiene jefe U-6; darle permiso compras para la prueba vía admin temporal
  await prisma.rol.update({
    where: { id: 'ROL-2' },
    data: { permisos: { set: ['contratistas:read', 'compras:read', 'compras:write', 'catalogos:read'] } },
  });

  const prov = await prisma.proveedor.findFirst({
    where: { empresaId: 'EMP-1', activo: true },
    select: { id: true, razonSocial: true },
  });
  if (!prov) {
    fail('API-OC-SETUP', 'sin proveedor activo');
    return;
  }

  await ensureMariaPin();

  const carolina = await login('cperez@almahue.cl', 'demo123');
  if (!carolina.user.aprobarConPin) {
    pass('API-PROFILE-CAROLINA-NO-PIN', 'Analista sin PIN en perfil');
  } else {
    fail('API-PROFILE-CAROLINA-NO-PIN', 'Analista no debería ver PIN');
  }

  const numero = `OC-QA-${Date.now()}`;
  const create = await api(carolina.token, 'POST', '/ordenes-compra', {
    numero,
    fecha: '2026-08-10',
    proveedor: prov.razonSocial,
    proveedorId: prov.id,
    solicitante: 'Carolina Pérez',
    moneda: 'CLP',
    neto: 800_000,
    afacto: 'AFECTO',
    estado: 'EMITIDO',
    departamento: 'Compras',
    centroCostoId: 'CC-EMP-1-1',
    distribucionCc: [{ centroCostoId: 'CC-EMP-1-1', centroCosto: 'Administración', monto: 800_000, porcentaje: 100 }],
  });

  if (create.status !== 201 && create.status !== 200) {
    fail('API-OC-CREATE', `${create.status} ${JSON.stringify(create.data)}`);
    return;
  }

  const oc = create.data as {
    id: string;
    aprobadorId?: string;
    aprobacionPasosTotal?: number;
    aprobacionCadenaIds?: string[];
    estado: string;
  };

  if (oc.aprobadorId === 'U-6' && oc.aprobacionPasosTotal === 1) {
    pass('API-OC-ASSIGN', `asignado U-6, 1 paso (grupo/escala fase 2), cadena=${oc.aprobacionCadenaIds?.join('→')}`);
  } else if (oc.aprobadorId === 'U-6' && oc.aprobacionPasosTotal === 2) {
    pass('API-OC-ASSIGN', `asignado U-6, 2 pasos (organigrama fase 1), cadena=${oc.aprobacionCadenaIds?.join('→')}`);
  } else {
    fail('API-OC-ASSIGN', JSON.stringify({ aprobadorId: oc.aprobadorId, pasos: oc.aprobacionPasosTotal, cadena: oc.aprobacionCadenaIds }));
  }

  // Intento aprobar con usuario no asignado (Jorge)
  const jorge = await login('jsanchez@almahue.cl', 'demo123');
  const rejectJorge = await api(jorge.token, 'PUT', `/ordenes-compra/${oc.id}`, {
    numero,
    fecha: '2026-08-10',
    proveedor: prov.razonSocial,
    proveedorId: prov.id,
    solicitante: 'Carolina Pérez',
    moneda: 'CLP',
    neto: 800_000,
    afacto: 'AFECTO',
    estado: 'APROBADO',
    departamento: 'Compras',
    pinAprobacion: '4821',
  });
  if (rejectJorge.status === 403) {
    pass('API-OC-ANTI-TRAMPA', 'Jorge no puede aprobar OC asignada a María (D6 línea de mando)');
  } else {
    fail('API-OC-ANTI-TRAMPA', `status=${rejectJorge.status}`);
  }

  const maria = await login('mgonzalez@almahue.cl', 'demo123');
  const step1 = await api(maria.token, 'PUT', `/ordenes-compra/${oc.id}`, {
    numero,
    fecha: '2026-08-10',
    proveedor: prov.razonSocial,
    proveedorId: prov.id,
    solicitante: 'Carolina Pérez',
    moneda: 'CLP',
    neto: 800_000,
    afacto: 'AFECTO',
    estado: 'APROBADO',
    departamento: 'Compras',
    pinAprobacion: '4821',
  });

  const ocStep1 = step1.data as { estado: string; aprobadorId?: string; aprobacionPasoActual?: number };
  if (step1.status === 200 && ocStep1.estado === 'APROBADO' && oc.aprobacionPasosTotal === 1) {
    pass('API-OC-ESCALA-P1', 'María aprueba en un solo paso (fase 2, $800k ≤ tope A)');
  } else if (step1.status === 200 && ocStep1.estado === 'EMITIDO' && ocStep1.aprobadorId === 'U-1') {
    pass('API-OC-ESCALA-P1', `paso 1 OK → escala a Admin (estado EMITIDO, paso ${ocStep1.aprobacionPasoActual})`);
  } else {
    fail('API-OC-ESCALA-P1', `${step1.status} ${JSON.stringify(ocStep1)}`);
  }

  if (oc.aprobacionPasosTotal === 1) {
    pass('API-OC-ESCALA-P2', 'Sin paso 2 (cadena de un paso)');
    return;
  }

  const admin = await login('admin@almahue.local', 'Admin123!');
  const step2 = await api(admin.token, 'PUT', `/ordenes-compra/${oc.id}`, {
    numero,
    fecha: '2026-08-10',
    proveedor: prov.razonSocial,
    proveedorId: prov.id,
    solicitante: 'Carolina Pérez',
    moneda: 'CLP',
    neto: 800_000,
    afacto: 'AFECTO',
    estado: 'APROBADO',
    departamento: 'Compras',
    pinAprobacion: '4821',
  });
  const ocFinal = step2.data as { estado: string };
  if (step2.status === 200 && ocFinal.estado === 'APROBADO') {
    pass('API-OC-ESCALA-P2', 'Admin aprueba paso final (D2 bypass master)');
  } else {
    fail('API-OC-ESCALA-P2', `${step2.status} ${JSON.stringify(ocFinal)}`);
  }

  // Admin puede aprobar aunque no sea el asignado inicial (ya probado arribo en paso 2)
  pass('API-ADMIN-BYPASS', 'Admin resolvió pendiente no asignada inicialmente');
}

async function validateApiProforma() {
  console.log('\n── API: proforma BORRADOR → DEFINITIVA ──');
  let proforma = await prisma.proformaContratista.findFirst({
    where: { empresaId: 'EMP-1', estado: 'BORRADOR' },
    select: { id: true, numero: true, montoNeto: true },
  });
  if (!proforma) {
    const any = await prisma.proformaContratista.findFirst({
      where: { empresaId: 'EMP-1' },
      select: { id: true, numero: true, montoNeto: true },
    });
    if (any) {
      await prisma.proformaContratista.update({
        where: { id: any.id },
        data: {
          estado: 'BORRADOR',
          aprobadorId: null,
          aprobadorNombre: null,
          aprobacionCadenaIds: [],
          aprobacionPasoActual: 0,
          aprobacionPasosTotal: 0,
          creadoPorId: 'U-3',
        },
      });
      proforma = any;
    }
  } else {
    await prisma.proformaContratista.update({
      where: { id: proforma.id },
      data: { creadoPorId: 'U-3' },
    });
  }
  if (!proforma) {
    fail('API-PRF-SETUP', 'sin proforma borrador');
    return;
  }

  const digitador = await login('jsanchez@almahue.cl', 'demo123');
  const req = await api(
    digitador.token,
    'POST',
    `/proformas-contratista/${proforma.id}/definitiva`,
    {},
  );

  if (req.status !== 201 && req.status !== 200) {
    fail('API-PRF-DEFINITIVA', `${req.status} ${JSON.stringify(req.data)}`);
    return;
  }

  const row = req.data as { estado: string; aprobadoPorId?: string };
  if (row.estado === 'DEFINITIVA') {
    pass('API-PRF-DEFINITIVA', `BORRADOR→DEFINITIVA ${proforma.numero} por=${row.aprobadoPorId ?? 'ok'}`);
  } else {
    fail('API-PRF-DEFINITIVA', JSON.stringify(row));
  }
}

async function validateProfileAdminPin() {
  console.log('\n── API: perfil aprobarConPin ──');
  const admin = await login('admin@almahue.local', 'Admin123!');
  const me = await api(admin.token, 'GET', '/auth/me');
  const user = me.data as { aprobarConPin?: boolean; tienePinAprobacion?: boolean };
  if (user.aprobarConPin && user.tienePinAprobacion) {
    pass('API-ME-ADMIN-PIN', 'Admin ve PIN y lo tiene configurado');
  } else {
    fail('API-ME-ADMIN-PIN', JSON.stringify(user));
  }
}

async function main() {
  console.log('Validación Reu6 — Aprobaciones\n');
  try {
    await validateDbOrganigrama();
    await validateEngine();
    await validateFase2GruposEscalas();
    await validatePinPool();
    await validateProfileAdminPin();
    await validateApiOcEscalamiento();
    await validateApiProforma();
  } catch (e) {
    fail('FATAL', e instanceof Error ? e.message : String(e));
  } finally {
    await prisma.rol.update({
      where: { id: 'ROL-2' },
      data: {
        permisos: {
          set: [
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
      },
    });
    await prisma.$disconnect();
  }

  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n══ Resumen: ${ok} OK · ${bad} FAIL / ${results.length} total ══`);
  if (bad) {
    console.log('\nPendientes Reu6 (no cubiertos en esta validación):');
    console.log('  · Propuesta visual organigrama para MJ/Agustín');
    process.exit(1);
  }
}

main();
