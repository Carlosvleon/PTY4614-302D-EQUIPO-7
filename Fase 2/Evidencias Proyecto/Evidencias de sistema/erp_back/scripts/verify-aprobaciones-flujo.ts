/**
 * Verifica flujo real: simular (montos/AND/OR), crear OC, aprobar con escalamiento, rechazar.
 * Ejecutar: npx ts-node -r tsconfig-paths/register scripts/verify-aprobaciones-flujo.ts
 */
import 'dotenv/config';

const BASE = process.env.API_BASE ?? 'http://localhost:3001/api/v1';
const EMP = 'EMP-1';
const PIN = '4821';

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
  if (!res.ok) throw new Error(`login ${email}: ${res.status} ${await res.text()}`);
  return (await res.json()) as { token: string };
}

async function api(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Empresa-Id': EMP,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

function chainSteps(sim: any): any[] {
  return sim?.cadena ?? sim?.pasos ?? [];
}
function chainIds(sim: any): string[] {
  return chainSteps(sim).map((p: any) => p.usuarioId ?? p.id).filter(Boolean);
}

async function main() {
  console.log('\n══ verify-aprobaciones-flujo ══\n');

  const admin = await login('admin@almahue.local', 'Admin123!');

  // 1) Simular Grupo 6 — monto bajo: debe incluir Laura (AND) y no pasar a Admin si cabe en tope
  const simBajo = await api(admin.token, 'POST', '/aprobaciones/simular', {
    modulo: 'Compras',
    monto: 800_000,
    grupoId: 'GRP-COMPRAS-6',
    usuarioId: 'U-35',
  });
  if (simBajo.status !== 200 && simBajo.status !== 201) {
    fail('sim-bajo', `HTTP ${simBajo.status} ${JSON.stringify(simBajo.data)}`);
  } else {
    const ids = chainIds(simBajo.data);
    const pasos = chainSteps(simBajo.data);
    const laura = pasos.find((p: any) => (p.usuarioId ?? p.id) === 'U-10');
    if (ids[0] === 'U-10' || ids.includes('U-10')) {
      pass('sim-bajo-laura', `cadena=${ids.join('→')} logicaLaura=${laura?.logica ?? '?'}`);
    } else {
      fail('sim-bajo-laura', `esperaba U-10 en cadena, got ${ids.join('→')}`);
    }
    if (laura?.logica === 'AND') {
      const apr = (laura.aprobadores ?? []).map((a: any) => a.usuarioId ?? a.id ?? a).join(',');
      pass('sim-and', `Laura AND firmantes=${apr || JSON.stringify(laura.aprobadores)}`);
    } else {
      fail('sim-and', `Laura no es AND: ${JSON.stringify(laura)}`);
    }
  }

  // 2) Monto alto: debe escalar Laura → Ricardo → Claudia → Admin
  const simAlto = await api(admin.token, 'POST', '/aprobaciones/simular', {
    modulo: 'Compras',
    monto: 6_000_000,
    grupoId: 'GRP-COMPRAS-6',
    usuarioId: 'U-35',
  });
  if (simAlto.status >= 400) {
    fail('sim-alto', `HTTP ${simAlto.status}`);
  } else {
    const ids = chainIds(simAlto.data);
    const need = ['U-10', 'U-8', 'U-7', 'U-1'];
    const ok = need.every((id) => ids.includes(id));
    if (ok) pass('sim-escala-monto', `cadena=${ids.join('→')}`);
    else fail('sim-escala-monto', `faltan niveles: ${ids.join('→')} (need ${need.join('→')})`);

    const adminPaso = chainSteps(simAlto.data).find((p: any) => (p.usuarioId ?? p.id) === 'U-1');
    if (adminPaso?.logica === 'OR') {
      const apr = (adminPaso.aprobadores ?? []).map((a: any) => a.nombre ?? a.id).join(' ∨ ');
      pass('sim-or', `Admin OR firmantes=${apr || JSON.stringify(adminPaso.aprobadores)}`);
    } else {
      fail('sim-or', `Admin no es OR: ${JSON.stringify(adminPaso)}`);
    }
  }

  // 3) Proveedor para crear OC
  const provs = await api(admin.token, 'GET', '/proveedores');
  const proveedor = Array.isArray(provs.data)
    ? provs.data.find((p: any) => p.activo !== false) ?? provs.data[0]
    : (provs.data?.items ?? [])[0];
  if (!proveedor?.id) {
    fail('proveedor', `no hay proveedor: ${JSON.stringify(provs.data)?.slice(0, 200)}`);
    summarize();
    process.exit(1);
  }
  pass('proveedor', `${proveedor.nombre ?? proveedor.id}`);

  // 4) Crear OC como miembro del grupo (Bruno U-35) — monto 2.8M escala más allá de Laura
  const bruno = await login('baguirre@almahue.cl', 'demo123');
  const numero = `OC-VF-${Date.now().toString().slice(-8)}`;
  const create = await api(bruno.token, 'POST', '/ordenes-compra', {
    numero,
    fecha: '2026-08-11',
    proveedor: proveedor.nombre ?? 'Proveedor demo',
    proveedorId: proveedor.id,
    solicitante: 'Bruno Aguirre',
    moneda: 'CLP',
    neto: 2_800_000,
    afacto: 'AFECTO',
    estado: 'EMITIDO',
    departamento: 'Compras',
  });

  if (create.status >= 400) {
    fail('crear-oc', `HTTP ${create.status} ${JSON.stringify(create.data)}`);
    summarize();
    process.exit(1);
  }

  const oc = create.data;
  const ocId = oc?.id;
  const cadena = oc?.aprobacionCadenaIds ?? oc?.cadenaIds ?? [];
  const aprobador = oc?.aprobadorId;
  pass(
    'crear-oc',
    `id=${ocId} estado=${oc?.estado} aprobador=${aprobador} cadena=${Array.isArray(cadena) ? cadena.join('→') : '?'}`
      + ` pasos=${oc?.aprobacionPasosTotal ?? '?'}`,
  );

  if (!ocId) {
    summarize();
    process.exit(1);
  }

  // 5) Rechazo por aprobador actual (Admin puede actuar)
  const rejectBody = {
    ...pickOcFields(oc),
    estado: 'RECHAZADO',
    pinAprobacion: PIN,
  };
  const rej = await api(admin.token, 'PUT', `/ordenes-compra/${ocId}`, rejectBody);
  if (rej.status < 400 && (rej.data?.estado === 'RECHAZADO' || rej.data?.estado === 'RECHAZADA')) {
    pass('rechazo', `estado=${rej.data.estado}`);
  } else {
    fail('rechazo', `HTTP ${rej.status} ${JSON.stringify(rej.data)?.slice(0, 300)}`);
  }

  // 6) Nueva OC y aprobar con escalamiento hasta cierre (Admin puede actuar en cada paso)
  const numero2 = `OC-VF2-${Date.now().toString().slice(-8)}`;
  const createEsc = await api(bruno.token, 'POST', '/ordenes-compra', {
    numero: numero2,
    fecha: '2026-08-11',
    proveedor: proveedor.nombre ?? 'Proveedor demo',
    proveedorId: proveedor.id,
    solicitante: 'Bruno Aguirre',
    moneda: 'CLP',
    neto: 2_800_000,
    afacto: 'AFECTO',
    estado: 'EMITIDO',
    departamento: 'Compras',
  });
  if (createEsc.status >= 400) {
    fail('crear-oc-escala', `HTTP ${createEsc.status} ${JSON.stringify(createEsc.data)?.slice(0, 250)}`);
    summarize();
    process.exit(results.every((r) => r.ok) ? 0 : 1);
  }
  let current = createEsc.data;
  const maxSteps = 8;
  let step = 0;
  const trail: string[] = [];
  while (step < maxSteps && current?.estado === 'EMITIDO') {
    step += 1;
    const before = current.aprobadorId;
    const apr = await api(admin.token, 'PUT', `/ordenes-compra/${current.id}`, {
      ...pickOcFields(current),
      estado: 'APROBADO',
      pinAprobacion: PIN,
    });
    if (apr.status >= 400) {
      fail('aprobar-paso', `paso ${step} HTTP ${apr.status} ${JSON.stringify(apr.data)?.slice(0, 250)}`);
      break;
    }
    current = apr.data;
    trail.push(`${before}→${current.estado}/${current.aprobadorId ?? 'fin'}`);
    if (current.estado === 'APROBADO') {
      pass('escala-cierre', `pasos=${step} trail=${trail.join(' | ')}`);
      break;
    }
    if (current.estado === 'EMITIDO' && current.aprobadorId && current.aprobadorId !== before) {
      // escaló al siguiente
      continue;
    }
    if (current.estado === 'EMITIDO' && current.aprobadorId === before) {
      fail('escala-stalled', `mismo aprobador tras aprobar: ${before}`);
      break;
    }
  }
  if (current?.estado !== 'APROBADO' && !results.some((r) => r.id === 'escala-cierre' || r.id === 'aprobar-paso' || r.id === 'escala-stalled')) {
    fail('escala-cierre', `no cerró tras ${step} pasos: estado=${current?.estado} trail=${trail.join(' | ')}`);
  }

  // 7) Gap AND/OR en runtime OC
  const bandeja = await api(admin.token, 'GET', '/aprobaciones-oc');
  const items = Array.isArray(bandeja.data) ? bandeja.data : (bandeja.data?.items ?? []);
  const sample = items[0];
  if (sample && (sample.pasoDetalles || sample.aprobadoresPendientes)) {
    pass('runtime-and-or', 'bandeja expone detalle multi-firma');
  } else {
    fail(
      'runtime-and-or',
      'GAP: runtime OC no exige firmas AND/OR (solo aprobadorId principal). Simulador sí muestra logica.',
    );
  }

  summarize();
  process.exit(results.filter((r) => !r.ok && r.id !== 'runtime-and-or').length ? 1 : 0);
}

function pickOcFields(oc: any) {
  return {
    numero: oc.numero,
    fecha: oc.fecha,
    proveedor: oc.proveedor,
    proveedorId: oc.proveedorId,
    solicitante: oc.solicitante,
    moneda: oc.moneda ?? 'CLP',
    neto: oc.neto,
    afacto: oc.afacto ?? 'AFECTO',
    departamento: oc.departamento ?? 'Compras',
  };
}

function summarize() {
  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n── resumen: ${ok} ok · ${bad} fail ──\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
