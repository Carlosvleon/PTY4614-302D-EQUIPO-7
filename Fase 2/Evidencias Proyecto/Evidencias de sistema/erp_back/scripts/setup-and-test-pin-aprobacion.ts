/**
 * Alinea la BD al sistema de PIN de aprobación (Sergio) y ejecuta casos de uso vía API.
 *
 * Uso: npx ts-node -r tsconfig-paths/register scripts/setup-and-test-pin-aprobacion.ts
 *
 * PIN QA estándar: 4821
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const PIN_QA = '4821';
const PIN_ALT = '9999';
const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001/api/v1';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type CaseResult = { name: string; ok: boolean; detail?: string };

const results: CaseResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.log(`  ❌ ${name} — ${detail}`);
}

async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; empresaId?: string } = {},
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.empresaId) headers['X-Empresa-Id'] = opts.empresaId;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: unknown = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function msg(data: unknown): string {
  if (!data || typeof data !== 'object') return String(data);
  const m = (data as { message?: string | string[] }).message;
  if (Array.isArray(m)) return m.join(', ');
  return m ?? JSON.stringify(data);
}

async function login(email: string, password: string) {
  const { status, data } = await api('POST', '/auth/login', {
    body: { email, password },
  });
  if (status >= 400) {
    throw new Error(`login ${email}: ${status} ${msg(data)}`);
  }
  const d = data as {
    token: string;
    user: {
      id: string;
      aprobarConPin?: boolean;
      tienePinAprobacion?: boolean;
      empresaId: string;
      rol?: string;
    };
  };
  return { token: d.token, user: d.user };
}

/** Roles que deben exigir PIN: nombres/códigos de aprobación + roles de jefes en workflows. */
async function setupDb() {
  console.log('\n=== SETUP BD PIN ===');

  const workflows = await prisma.workflowConfig.findMany({
    where: { activo: true },
    select: { aprobadorIds: true, modulo: true },
  });
  const jefeIds = new Set(workflows.flatMap((w) => w.aprobadorIds));
  const jefes = await prisma.usuario.findMany({
    where: { id: { in: [...jefeIds] } },
    select: { id: true, email: true, rolId: true },
  });
  const rolIdsFromWf = new Set(jefes.map((j) => j.rolId));

  const roles = await prisma.rol.findMany();
  for (const r of roles) {
    const byName =
      /aprob/i.test(r.nombre)
      || /aprob/i.test(r.codigo)
      || ['ROL-5', 'ROL-7', 'ROL-9'].includes(r.id);
    const byWf = rolIdsFromWf.has(r.id);
    // Digitador/lectura/solicitante nunca
    const never =
      /digitador/i.test(r.nombre)
      || /lectura/i.test(r.nombre)
      || /solicitante/i.test(r.nombre)
      || r.id === 'ROL-3'
      || r.id === 'ROL-10'
      || r.id === 'ROL-11';
    const want = never ? false : byName || byWf;
    if (r.aprobarConPin !== want) {
      await prisma.rol.update({ where: { id: r.id }, data: { aprobarConPin: want } });
      console.log(`  rol ${r.id} (${r.nombre}): aprobarConPin ${r.aprobarConPin} → ${want}`);
    } else {
      console.log(`  rol ${r.id} (${r.nombre}): aprobarConPin=${want} (ok)`);
    }
  }

  const pinHash = await bcrypt.hash(PIN_QA, 10);
  const users = await prisma.usuario.findMany({
    include: { rol: { select: { aprobarConPin: true, nombre: true } } },
  });
  for (const u of users) {
    if (u.rol.aprobarConPin) {
      await prisma.usuario.update({
        where: { id: u.id },
        data: { pinAprobacionHash: pinHash },
      });
      console.log(`  PIN ${PIN_QA} → ${u.email} (${u.rol.nombre})`);
    } else if (u.pinAprobacionHash) {
      await prisma.usuario.update({
        where: { id: u.id },
        data: { pinAprobacionHash: null },
      });
      console.log(`  limpia PIN → ${u.email} (ya no es aprobador con PIN)`);
    }
  }

  // Asegurar QA aprobador en workflow Compras
  const qa = await prisma.usuario.findFirst({ where: { email: 'qa.aprobador@almahue.local' } });
  if (qa) {
    for (const modulo of ['Compras']) {
      const wf = await prisma.workflowConfig.findFirst({
        where: { modulo, activo: true },
      });
      if (wf && !wf.aprobadorIds.includes(qa.id)) {
        await prisma.workflowConfig.update({
          where: { id: wf.id },
          data: { aprobadorIds: [...wf.aprobadorIds, qa.id] },
        });
        console.log(`  workflow ${modulo}: +${qa.email}`);
      }
    }
  }
}

async function runApiCases() {
  console.log('\n=== PRUEBAS API ===');

  // Health
  try {
    const health = await fetch(`${BASE.replace('/api/v1', '')}/api/v1/auth/me`);
    if (health.status === 0) throw new Error('unreachable');
  } catch (e) {
    fail('API reachable', String(e));
    return;
  }
  pass('API reachable', BASE);

  const digitador = await login('jsanchez@almahue.cl', 'demo123');
  if (!digitador.user.aprobarConPin && !digitador.user.tienePinAprobacion) {
    pass('Digitador sin flag PIN en sesión');
  } else {
    fail(
      'Digitador sin flag PIN en sesión',
      `aprobarConPin=${digitador.user.aprobarConPin} tienePin=${digitador.user.tienePinAprobacion}`,
    );
  }

  {
    const { status, data } = await api('POST', '/auth/pin-aprobacion', {
      token: digitador.token,
      body: { pin: PIN_QA },
    });
    if (status >= 400) pass('Digitador no puede registrar PIN', msg(data));
    else fail('Digitador no puede registrar PIN', `status=${status}`);
  }

  const aprobador = await login('qa.aprobador@almahue.local', 'QaTest123!');
  if (aprobador.user.aprobarConPin && aprobador.user.tienePinAprobacion) {
    pass('QA Aprobador con flag PIN + PIN registrado');
  } else {
    fail(
      'QA Aprobador con flag PIN + PIN registrado',
      `aprobarConPin=${aprobador.user.aprobarConPin} tienePin=${aprobador.user.tienePinAprobacion}`,
    );
  }

  {
    const { status, data } = await api('POST', '/auth/pin-aprobacion', {
      token: aprobador.token,
      body: { pin: '12' },
    });
    if (status >= 400 && /4 dígitos/i.test(msg(data))) {
      pass('Rechaza PIN con formato inválido', msg(data));
    } else fail('Rechaza PIN con formato inválido', `${status} ${msg(data)}`);
  }

  {
    const { status } = await api('POST', '/auth/pin-aprobacion', {
      token: aprobador.token,
      body: { pin: PIN_ALT },
    });
    if (status < 300) pass('Aprobador cambia PIN (perfil)', PIN_ALT);
    else fail('Aprobador cambia PIN (perfil)', `status=${status}`);
  }
  // Restaurar PIN QA
  await api('POST', '/auth/pin-aprobacion', {
    token: aprobador.token,
    body: { pin: PIN_QA },
  });

  const solicitante = await login('qa.solicitante@almahue.local', 'QaTest123!');
  const empresaId = solicitante.user.empresaId || 'EMP-1';

  const proveedor = await prisma.proveedor.findFirst({
    where: { empresaId, activo: true },
  });
  if (!proveedor) {
    fail('Proveedor para OC', 'no hay proveedor activo');
    return;
  }

  const stamp = Date.now().toString(36).slice(-6);
  const hoy = new Date().toISOString().slice(0, 10);

  async function createOc(numero: string) {
    const { status, data } = await api('POST', '/ordenes-compra', {
      token: solicitante.token,
      empresaId,
      body: {
        numero,
        fecha: hoy,
        proveedor: proveedor!.razonSocial,
        proveedorId: proveedor!.id,
        solicitante: 'QA Solicitante',
        aprobadorId: aprobador.user.id,
        moneda: 'CLP',
        neto: 150000,
        afacto: 'AFECTO',
        estado: 'EMITIDO',
        departamento: 'Compras',
        lineas: [
          { descripcion: 'Ítem PIN test', cantidad: 1, precioUnitario: 150000, total: 150000 },
        ],
      },
    });
    if (status >= 400) throw new Error(`create OC ${numero}: ${status} ${msg(data)}`);
    return data as {
      id: string;
      numero: string;
      estado: string;
      solicitante: string;
      departamento: string;
      moneda: string;
      neto: number;
      afacto: string;
      fecha: string;
      proveedor: string;
      aprobadorId?: string;
    };
  }

  async function resolveOc(
    oc: Awaited<ReturnType<typeof createOc>>,
    estado: 'APROBADO' | 'RECHAZADO',
    pin?: string,
  ) {
    return api('PUT', `/ordenes-compra/${oc.id}`, {
      token: aprobador.token,
      empresaId,
      body: {
        numero: oc.numero,
        fecha: typeof oc.fecha === 'string' ? oc.fecha.slice(0, 10) : hoy,
        proveedor: oc.proveedor,
        solicitante: oc.solicitante,
        aprobadorId: oc.aprobadorId ?? aprobador.user.id,
        moneda: oc.moneda,
        neto: Number(oc.neto),
        afacto: oc.afacto,
        estado,
        departamento: oc.departamento,
        ...(pin !== undefined ? { pinAprobacion: pin } : {}),
      },
    });
  }

  // OC: sin PIN
  {
    const oc = await createOc(`OC-PIN-NOPIN-${stamp}`);
    const { status, data } = await resolveOc(oc, 'APROBADO');
    if (status >= 400 && /PIN/i.test(msg(data))) {
      pass('OC aprobar sin PIN → error', msg(data));
    } else fail('OC aprobar sin PIN → error', `${status} ${msg(data)}`);
  }

  // OC: PIN incorrecto
  {
    const oc = await createOc(`OC-PIN-BAD-${stamp}`);
    const { status, data } = await resolveOc(oc, 'APROBADO', '0000');
    if (status >= 400 && /incorrecto|PIN/i.test(msg(data))) {
      pass('OC aprobar PIN incorrecto → error', msg(data));
    } else fail('OC aprobar PIN incorrecto → error', `${status} ${msg(data)}`);
  }

  // OC: PIN ok → APROBADO
  {
    const oc = await createOc(`OC-PIN-OK-${stamp}`);
    const { status, data } = await resolveOc(oc, 'APROBADO', PIN_QA);
    const row = data as { estado?: string };
    if (status < 300 && row.estado === 'APROBADO') {
      pass('OC aprobar con PIN correcto → APROBADO');
    } else fail('OC aprobar con PIN correcto → APROBADO', `${status} ${msg(data)}`);
  }

  // OC: rechazar con PIN
  {
    const oc = await createOc(`OC-PIN-REJ-${stamp}`);
    const { status, data } = await resolveOc(oc, 'RECHAZADO', PIN_QA);
    const row = data as { estado?: string };
    if (status < 300 && row.estado === 'RECHAZADO') {
      pass('OC rechazar con PIN correcto → RECHAZADO');
    } else fail('OC rechazar con PIN correcto → RECHAZADO', `${status} ${msg(data)}`);
  }

  // Rol sin PIN: puede aprobar sin PIN
  {
    await prisma.rol.update({
      where: { id: 'ROL-9' },
      data: { aprobarConPin: false },
    });
    const oc = await createOc(`OC-PIN-OFF-${stamp}`);
    const { status, data } = await resolveOc(oc, 'APROBADO');
    const row = data as { estado?: string };
    if (status < 300 && row.estado === 'APROBADO') {
      pass('Rol sin aprobarConPin: aprueba OC sin PIN');
    } else fail('Rol sin aprobarConPin: aprueba OC sin PIN', `${status} ${msg(data)}`);
    await prisma.rol.update({
      where: { id: 'ROL-9' },
      data: { aprobarConPin: true },
    });
    // re-hash pin por si acaso
    await prisma.usuario.update({
      where: { id: aprobador.user.id },
      data: { pinAprobacionHash: await bcrypt.hash(PIN_QA, 10) },
    });
  }

  // Sesión refleja desaparición del flag al quitar rol PIN
  {
    await prisma.rol.update({
      where: { id: 'ROL-9' },
      data: { aprobarConPin: false },
    });
    const again = await login('qa.aprobador@almahue.local', 'QaTest123!');
    if (!again.user.aprobarConPin) {
      pass('Sesión: aprobarConPin desaparece al apagar flag del rol');
    } else {
      fail('Sesión: aprobarConPin desaparece al apagar flag del rol', 'sigue true');
    }
    const setPin = await api('POST', '/auth/pin-aprobacion', {
      token: again.token,
      body: { pin: PIN_QA },
    });
    if (setPin.status >= 400) {
      pass('Sin flag rol: no se puede setear PIN en perfil', msg(setPin.data));
    } else {
      fail('Sin flag rol: no se puede setear PIN en perfil', `status=${setPin.status}`);
    }
    await prisma.rol.update({
      where: { id: 'ROL-9' },
      data: { aprobarConPin: true },
    });
    await prisma.usuario.update({
      where: { id: aprobador.user.id },
      data: { pinAprobacionHash: await bcrypt.hash(PIN_QA, 10) },
    });
  }

  // --- Proformas ---
  const ctr = await prisma.contratista.findFirst({
    where: { empresaId, activo: true },
  });
  if (!ctr) {
    fail('Contratista para proforma', 'no hay contratista');
    return;
  }

  async function createProforma(numero: string) {
    const { status, data } = await api('POST', '/proformas-contratista', {
      token: solicitante.token,
      empresaId,
      body: {
        numero,
        contratistaId: ctr!.id,
        periodo: '2026-07',
        montoNeto: 88000,
        moneda: 'CLP',
      },
    });
    if (status >= 400) throw new Error(`create proforma: ${status} ${msg(data)}`);
    return data as { id: string; numero: string; estado: string };
  }

  {
    const pf = await createProforma(`PF-PIN-${stamp}`);
    const ok = await api('POST', `/proformas-contratista/${pf.id}/definitiva`, {
      token: solicitante.token,
      empresaId,
      body: {},
    });
    const row = ok.data as { estado?: string };
    if (ok.status < 300 && row.estado === 'DEFINITIVA') {
      pass('Proforma BORRADOR→DEFINITIVA sin PIN ni bandeja');
    } else {
      fail('Proforma BORRADOR→DEFINITIVA sin PIN ni bandeja', `${ok.status} ${msg(ok.data)}`);
    }
  }
}

async function main() {
  console.log(`API: ${BASE}`);
  console.log(`PIN QA: ${PIN_QA}`);

  await setupDb();
  await runApiCases();

  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok).length;
  console.log('\n=== RESUMEN ===');
  console.log(`PASS: ${ok}  FAIL: ${bad}  TOTAL: ${results.length}`);
  if (bad) {
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  · ${r.name}: ${r.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\nBD lista. Usuarios con rol PIN usan PIN ' + PIN_QA);
    console.log('Ej.: qa.aprobador@almahue.local / QaTest123! → PIN 4821');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
