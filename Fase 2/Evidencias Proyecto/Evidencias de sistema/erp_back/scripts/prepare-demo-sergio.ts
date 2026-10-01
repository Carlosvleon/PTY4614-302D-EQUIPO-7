/**
 * 1) Audita datos basura/QA en BD
 * 2) Limpia seeds de prueba (OC-QA/PIN, FAC QA, docs/asientos de lab)
 * 3) Siembra flujo completo presentable para reunión con Sergio
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register scripts/prepare-demo-sergio.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const EMP_HINT = 'EMP-1';
const TAG = 'DEMO-SERGIO';

type Finding = { area: string; detail: string; count: number };

async function resolveEmpresa() {
  return (
    (await prisma.empresa.findFirst({ where: { id: EMP_HINT, activa: true } }))
    ?? (await prisma.empresa.findFirst({ where: { activa: true }, orderBy: { createdAt: 'asc' } }))
  );
}

async function auditBasura(empresaId: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  const ocQa = await prisma.ordenCompra.count({
    where: {
      empresaId,
      OR: [
        { numero: { startsWith: 'OC-QA-' } },
        { numero: { startsWith: 'OC-PIN-' } },
        { solicitante: { contains: 'QA', mode: 'insensitive' } },
      ],
    },
  });
  if (ocQa) findings.push({ area: 'compras', detail: 'OC con prefijo/solicitante QA o PIN', count: ocQa });

  const ocSinCc = await prisma.ordenCompra.count({
    where: {
      empresaId,
      centroCostoId: null,
      NOT: { estado: 'ANULADO' },
    },
  });
  if (ocSinCc) findings.push({ area: 'compras', detail: 'OC no anuladas sin centroCostoId', count: ocSinCc });

  const ocSinCreador = await prisma.ordenCompra.count({
    where: { empresaId, creadoPorId: null, NOT: { estado: 'ANULADO' } },
  });
  if (ocSinCreador) {
    findings.push({ area: 'compras', detail: 'OC sin creadoPorId', count: ocSinCreador });
  }

  const regQa = await prisma.registroCompra.count({
    where: {
      empresaId,
      OR: [
        { factura: { startsWith: 'FAC-QA' } },
        { ocNumero: { startsWith: 'OC-QA-' } },
        { ocNumero: { startsWith: 'OC-PIN-' } },
      ],
    },
  });
  if (regQa) findings.push({ area: 'compras', detail: 'Registros compra ligados a OC/FAC QA', count: regQa });

  const docsQa = await prisma.documentoComercial.count({
    where: {
      empresaId,
      OR: [
        { folio: { contains: 'QA' } },
        { folio: { contains: 'DEMO' } },
        { folio: { contains: 'PIN' } },
        { cliente: { contains: 'QA', mode: 'insensitive' } },
        { observaciones: { contains: TAG } },
      ],
    },
  });
  if (docsQa) findings.push({ area: 'ventas', detail: 'Documentos con marca QA/DEMO/PIN', count: docsQa });

  const docsLegacy = await prisma.documentoComercial.count({
    where: {
      empresaId,
      OR: [
        { folio: { endsWith: '-REV' } },
        { folio: { endsWith: '-R' } },
        { AND: [{ estado: 'ANULADO' }, { folioReversador: { not: null } }] },
      ],
    },
  });
  if (docsLegacy) {
    findings.push({ area: 'ventas', detail: 'Documentos legacy reverso/anulado', count: docsLegacy });
  }

  const asientosQa = await prisma.asiento.count({
    where: {
      empresaId,
      OR: [
        { origen: { startsWith: 'REVERSA:' } },
        { origen: { startsWith: 'DOC-NEW:' } },
        { origen: { contains: 'QA' } },
        { glosa: { contains: 'QA' } },
        { glosa: { contains: TAG } },
        { glosa: { contains: 'Reversa doc' } },
        { glosa: { contains: 'Asiento original doc' } },
      ],
    },
  });
  if (asientosQa) findings.push({ area: 'contabilidad', detail: 'Asientos QA/legacy', count: asientosQa });

  const profQa = await prisma.proformaContratista.count({
    where: {
      empresaId,
      OR: [
        { numero: { contains: 'QA' } },
        { numero: { contains: 'DEMO' } },
        { numero: { contains: 'PIN' } },
      ],
    },
  });
  if (profQa) findings.push({ area: 'contratistas', detail: 'Proformas QA/DEMO/PIN', count: profQa });

  const ccMovQa = await prisma.cuentaCorrienteMovimiento.count({
    where: {
      empresaId,
      OR: [
        { documentoRef: { contains: 'QA' } },
        { documentoRef: { contains: 'DEMO' } },
        { glosa: { contains: 'QA' } },
        { glosa: { contains: TAG } },
      ],
    },
  });
  if (ccMovQa) findings.push({ area: 'tesoreria', detail: 'Movimientos CC con marca QA/DEMO', count: ccMovQa });

  const agingQa = await prisma.documentoAging.count({
    where: {
      empresaId,
      OR: [
        { documento: { contains: 'QA' } },
        { documento: { contains: 'DEMO' } },
        { contraparte: { contains: 'QA' } },
      ],
    },
  });
  if (agingQa) findings.push({ area: 'tesoreria', detail: 'Aging con marca QA/DEMO', count: agingQa });

  return findings;
}

function isLabDocFolio(folio: string) {
  return /QA|DEMO|PIN|SMOKE|FIX30|COT-EX|FA-FIX|NP-COT|COT-SMOKE|-REV$|-R$/i.test(folio)
    || ['88001', '88002', '8051', '8126', '9374', '9952', '9995', '6346', 'FAC-1001', 'FA-6346-4285'].includes(folio);
}

function isLabProforma(numero: string) {
  return /QA|DEMO|PIN|^demo$|^PF-|^PRF-/i.test(numero);
}

async function cleanupBasura(empresaId: string) {
  console.log('\n=== LIMPIEZA basura QA / PIN / smoke / legacy ===');

  // Compras: borrar por prefijo de número
  const ocsBasura = await prisma.ordenCompra.findMany({
    where: {
      empresaId,
      OR: [
        { numero: { startsWith: 'OC-QA-' } },
        { numero: { startsWith: 'OC-PIN-' } },
        { numero: { startsWith: 'OC-DEMO-' } },
        { solicitante: { contains: 'QA', mode: 'insensitive' } },
      ],
    },
    select: { id: true, numero: true },
  });
  const ocIds = ocsBasura.map((o) => o.id);
  const ocNums = ocsBasura.map((o) => o.numero);

  if (ocIds.length) {
    const delReg = await prisma.registroCompra.deleteMany({
      where: {
        empresaId,
        OR: [
          { ocId: { in: ocIds } },
          { ocNumero: { in: ocNums } },
          { factura: { startsWith: 'FAC-QA' } },
          { factura: { startsWith: 'F-QA' } },
          { factura: { startsWith: 'FAC-DEMO' } },
        ],
      },
    });
    const delRec = await prisma.recepcionOc.deleteMany({ where: { ocId: { in: ocIds } } });
    const delAp = await prisma.aprobacionOc.deleteMany({ where: { ocId: { in: ocIds } } });
    const delOc = await prisma.ordenCompra.deleteMany({ where: { id: { in: ocIds } } });
    console.log(`  OC basura: ${delOc.count} (regs ${delReg.count}, rec ${delRec.count}, ap ${delAp.count})`);
    for (const o of ocsBasura.slice(0, 30)) console.log(`    - ${o.numero}`);
  } else {
    console.log('  OC basura: 0');
  }

  // Docs comerciales lab / smoke / DEMO / legacy
  const allDocs = await prisma.documentoComercial.findMany({
    where: { empresaId },
    select: { id: true, folio: true, cliente: true, observaciones: true, estado: true, folioReversador: true },
  });
  const docs = allDocs.filter(
    (d) =>
      isLabDocFolio(d.folio)
      || /QA|Smoke|Prueba/i.test(d.cliente)
      || (d.observaciones?.includes(TAG) ?? false)
      || (d.estado === 'ANULADO' && d.folioReversador != null),
  );
  if (docs.length) {
    const ids = docs.map((d) => d.id);
    await prisma.documentoComercial.updateMany({
      where: { documentoOrigenId: { in: ids } },
      data: { documentoOrigenId: null },
    });
    const folios = docs.map((d) => d.folio);
    await prisma.cuentaCorrienteMovimiento.deleteMany({
      where: { empresaId, documentoRef: { in: folios } },
    });
    await prisma.documentoAging.deleteMany({
      where: { empresaId, documento: { in: folios } },
    });
    const del = await prisma.documentoComercial.deleteMany({ where: { id: { in: ids } } });
    console.log(`  Documentos basura: ${del.count}`);
    for (const d of docs.slice(0, 40)) console.log(`    - ${d.folio} (${d.cliente})`);
  } else {
    console.log('  Documentos basura: 0');
  }

  // Guías despacho lab
  const delGuias = await prisma.guiaDespacho.deleteMany({
    where: {
      empresaId,
      OR: [
        { folio: { contains: 'QA' } },
        { folio: { contains: 'SMOKE' } },
        { folio: { contains: 'DEMO' } },
        { cliente: { contains: 'QA' } },
        { cliente: { contains: 'Smoke' } },
      ],
    },
  });
  console.log(`  Guías lab: ${delGuias.count}`);

  // Proformas lab (borrar facturas ligadas primero)
  const allProfs = await prisma.proformaContratista.findMany({
    where: { empresaId },
    select: { id: true, numero: true },
  });
  const profs = allProfs.filter((p) => isLabProforma(p.numero));
  if (profs.length) {
    await prisma.facturaContratista.deleteMany({
      where: { proformaId: { in: profs.map((p) => p.id) } },
    });
  }
  const delProf = await prisma.proformaContratista.deleteMany({
    where: { id: { in: profs.map((p) => p.id) } },
  });
  console.log(`  Proformas lab: ${delProf.count}`);

  // Asientos QA/legacy/smoke
  const asientos = await prisma.asiento.findMany({
    where: {
      empresaId,
      OR: [
        { origen: { startsWith: 'REVERSA:' } },
        { origen: { startsWith: 'DOC-NEW:' } },
        { origen: { startsWith: `DEMO:${TAG}` } },
        { origen: { contains: 'QA' } },
        { origen: { startsWith: 'CENTRALIZA-' } },
        { glosa: { contains: TAG } },
        { glosa: { contains: 'QA' } },
        { glosa: { contains: 'Prueba' } },
        { glosa: { contains: 'Smoke' } },
        { glosa: { contains: 'Reversa doc' } },
        { glosa: { contains: 'Asiento original doc' } },
        { glosa: { contains: 'Nuevo asiento post-reversa' } },
      ],
    },
    select: { id: true, numero: true, glosa: true },
  });
  if (asientos.length) {
    const delA = await prisma.asiento.deleteMany({ where: { id: { in: asientos.map((a) => a.id) } } });
    console.log(`  Asientos lab: ${delA.count}`);
    for (const a of asientos.slice(0, 20)) console.log(`    - ${a.numero}: ${a.glosa}`);
  } else {
    console.log('  Asientos lab: 0');
  }

  // CC / aging residual lab
  const delCc = await prisma.cuentaCorrienteMovimiento.deleteMany({
    where: {
      empresaId,
      OR: [
        { glosa: { contains: TAG } },
        { glosa: { contains: 'QA' } },
        { glosa: { contains: 'Smoke' } },
        { documentoRef: { contains: 'QA' } },
        { documentoRef: { contains: 'DEMO' } },
        { documentoRef: { in: ['88001', '88002', '9952', '9995', '8754', '9422', 'FAC-1001'] } },
        { terceroNombre: { contains: 'Smoke' } },
        { terceroNombre: { contains: 'Prueba QA' } },
      ],
    },
  });
  const delAg = await prisma.documentoAging.deleteMany({
    where: {
      empresaId,
      OR: [
        { documento: { contains: 'QA' } },
        { documento: { contains: 'DEMO' } },
        { documento: { in: ['88001', '88002', 'FAC-1001', 'FA-6346-4285', 'FA-FIX30-COT-001-8439'] } },
        { contraparte: { contains: 'QA' } },
        { contraparte: { contains: 'Smoke' } },
        { contraparte: { contains: 'Prueba' } },
      ],
    },
  });
  console.log(`  Mov CC lab: ${delCc.count} · Aging lab: ${delAg.count}`);

  // Notificaciones lab OC/proforma
  const delN = await prisma.notificacion.deleteMany({
    where: {
      empresaId,
      OR: [
        { titulo: { contains: 'QA' } },
        { titulo: { contains: 'DEMO' } },
        { titulo: { contains: 'OC-PIN' } },
        { refKey: { startsWith: 'oc-pend:' } },
        { refKey: { startsWith: 'prf-pend:' } },
      ],
    },
  });
  console.log(`  Notificaciones lab: ${delN.count}`);

  // CC residual cartola / contratista de labs previos
  const delCcCartola = await prisma.cuentaCorrienteMovimiento.deleteMany({
    where: {
      empresaId,
      OR: [
        { documentoRef: { contains: 'Cartola' } },
        { documentoRef: { contains: 'TRX-' } },
        { terceroNombre: { contains: 'contratista', mode: 'insensitive' } },
      ],
    },
  });
  console.log(`  Mov CC cartola/contratista lab: ${delCcCartola.count}`);
}

async function ensurePeriodo(empresaId: string, codigo: string) {
  const [anioS, mesS] = codigo.split('-');
  const anio = Number(anioS);
  const mes = Number(mesS);
  const fechaDesde = new Date(Date.UTC(anio, mes - 1, 1));
  const fechaHasta = new Date(Date.UTC(anio, mes, 0, 23, 59, 59));
  return prisma.periodoContable.upsert({
    where: { empresaId_codigo: { empresaId, codigo } },
    create: {
      codigo,
      anio,
      mes,
      fechaDesde,
      fechaHasta,
      estado: 'ABIERTO',
      activo: codigo === '2026-08',
      empresaId,
    },
    update: { estado: 'ABIERTO', activo: codigo === '2026-08' },
  });
}

async function nextAsientoNumero(empresaId: string, year: number) {
  const prefix = String(year);
  const last = await prisma.asiento.findFirst({
    where: { empresaId, numero: { startsWith: prefix } },
    orderBy: { numero: 'desc' },
  });
  const n = last ? Number(last.numero) + 1 : Number(`${year}0001`);
  return String(n);
}

async function seedDemo(empresaId: string) {
  console.log('\n=== SEED flujo presentación Sergio ===');

  const aprobador =
    (await prisma.usuario.findFirst({ where: { email: 'qa.aprobador@almahue.local' } }))
    ?? (await prisma.usuario.findFirst({ where: { email: 'admin@almahue.local' } }));
  const solicitante =
    (await prisma.usuario.findFirst({ where: { email: 'qa.solicitante@almahue.local' } }))
    ?? (await prisma.usuario.findFirst({ where: { email: 'admin@almahue.local' } }));
  if (!aprobador || !solicitante) throw new Error('Faltan usuarios aprobador/solicitante');

  // Workflows: asegurar jefe en Compras (única cadena activa)
  for (const modulo of ['Compras']) {
    const wfs = await prisma.workflowConfig.findMany({
      where: { empresaId, modulo, activo: true },
    });
    for (const wf of wfs) {
      if (!wf.aprobadorIds.includes(aprobador.id)) {
        await prisma.workflowConfig.update({
          where: { id: wf.id },
          data: { aprobadorIds: [...wf.aprobadorIds, aprobador.id] },
        });
        console.log(`  Workflow ${modulo}: +${aprobador.nombre}`);
      }
    }
  }

  // Rol aprobador con PIN
  if (aprobador.rolId) {
    await prisma.rol.update({
      where: { id: aprobador.rolId },
      data: { aprobarConPin: true },
    });
  }

  let proveedor = await prisma.proveedor.findFirst({
    where: { empresaId, activo: true },
    orderBy: { razonSocial: 'asc' },
  });
  if (!proveedor) {
    proveedor = await prisma.proveedor.create({
      data: {
        rut: '76.543.210-K',
        razonSocial: 'Agro Insumos Sur',
        giro: 'Insumos agrícolas',
        activo: true,
        empresaId,
      },
    });
  }

  let cliente = await prisma.cliente.findFirst({
    where: { empresaId, activo: true, razonSocial: { contains: 'Pacífico' } },
  })
    ?? (await prisma.cliente.findFirst({
      where: { empresaId, activo: true },
      orderBy: { razonSocial: 'asc' },
    }));
  if (!cliente) {
    cliente = await prisma.cliente.create({
      data: {
        rut: '96.123.456-7',
        razonSocial: 'Exportadora Pacífico SpA',
        credito: 50_000_000,
        vendedor: 'Comercial',
        activo: true,
        empresaId,
      },
    });
  } else if (/Smoke|Prueba|QA/i.test(cliente.razonSocial)) {
    cliente = await prisma.cliente.update({
      where: { id: cliente.id },
      data: { razonSocial: 'Exportadora Pacífico SpA' },
    });
  }

  const cc = await prisma.centroCosto.findFirst({
    where: { empresaId, activa: true },
    orderBy: { codigo: 'asc' },
  });
  if (!cc) throw new Error('No hay centro de costo activo — créalo en Parametrización antes del seed');

  const el = await prisma.elementoCosto.findFirst({
    where: { empresaId },
    orderBy: { createdAt: 'asc' },
  });

  const cuentas = await prisma.cuentaContable.findMany({
    where: { empresaId, activa: true, noImputable: false },
    orderBy: { codigo: 'asc' },
    take: 20,
  });
  if (cuentas.length < 3) {
    throw new Error('Se necesitan al menos 3 cuentas imputables (clientes / ventas / gasto o IVA)');
  }
  const ctaClientes = cuentas.find((c) => /cliente|cobrar/i.test(c.nombre)) ?? cuentas[0];
  const ctaVentas = cuentas.find((c) => /venta|ingreso/i.test(c.nombre) && c.id !== ctaClientes.id) ?? cuentas[1];
  const ctaIva = cuentas.find((c) => /iva/i.test(c.nombre) && c.id !== ctaClientes.id && c.id !== ctaVentas.id)
    ?? cuentas.find((c) => c.id !== ctaClientes.id && c.id !== ctaVentas.id)
    ?? cuentas[2];
  const ctaGasto = cuentas.find((c) => /gasto|costo|compra/i.test(c.nombre))
    ?? cuentas.find((c) => c.id !== ctaClientes.id)
    ?? cuentas[1];
  const ctaProveedores = cuentas.find((c) => /proveedor|pagar/i.test(c.nombre))
    ?? cuentas.find((c) => c.id !== ctaGasto.id)
    ?? cuentas[0];

  const periodo = '2026-08';
  await ensurePeriodo(empresaId, '2026-07');
  await ensurePeriodo(empresaId, periodo);
  const fecha = new Date('2026-08-03T15:00:00.000Z');

  // --- COMPRAS ---
  // 1) Pendiente de aprobación (PIN)
  const ocPend = await prisma.ordenCompra.create({
    data: {
      numero: 'OC-DEMO-PEND-01',
      fecha,
      proveedor: proveedor.razonSocial,
      proveedorId: proveedor.id,
      solicitante: solicitante.nombre,
      creadoPorId: solicitante.id,
      creadoPorNombre: solicitante.nombre,
      aprobadorId: aprobador.id,
      aprobadorNombre: aprobador.nombre,
      moneda: 'CLP',
      neto: 850_000,
      afacto: 'AFECTO',
      estado: 'EMITIDO',
      departamento: 'Compras',
      cuentaContableId: ctaGasto.id,
      centroCostoId: cc.id,
      elementoCostoId: el?.id,
      distribucionCc: [
        {
          centroCostoId: cc.id,
          centroCosto: `${cc.codigo} · ${cc.nombre}`,
          monto: 850_000,
          porcentaje: 100,
        },
      ],
      lineas: [
        {
          descripcion: 'Fertilizante NPK 15-15-15',
          cantidad: 50,
          precioUnitario: 17_000,
          total: 850_000,
          centroCostoId: cc.id,
          centroCosto: `${cc.codigo} · ${cc.nombre}`,
        },
      ],
      empresaId,
      aprobaciones: {
        create: {
          ocNumero: 'OC-DEMO-PEND-01',
          proveedor: proveedor.razonSocial,
          monto: 850_000,
          solicitante: solicitante.nombre,
          aprobadorId: aprobador.id,
          aprobadorNombre: aprobador.nombre,
          estado: 'PENDIENTE',
          fecha,
          empresaId,
        },
      },
    },
  });
  console.log(`  OC pendiente: ${ocPend.numero} → bandeja de ${aprobador.nombre}`);

  // 2) Aprobada (para print / detalle CC)
  const ocOk = await prisma.ordenCompra.create({
    data: {
      numero: 'OC-DEMO-APR-02',
      fecha,
      proveedor: proveedor.razonSocial,
      proveedorId: proveedor.id,
      solicitante: solicitante.nombre,
      creadoPorId: solicitante.id,
      creadoPorNombre: solicitante.nombre,
      aprobadorId: aprobador.id,
      aprobadorNombre: aprobador.nombre,
      moneda: 'CLP',
      neto: 420_000,
      afacto: 'AFECTO',
      estado: 'APROBADO',
      departamento: 'Compras',
      cuentaContableId: ctaGasto.id,
      centroCostoId: cc.id,
      elementoCostoId: el?.id,
      distribucionCc: [
        {
          centroCostoId: cc.id,
          centroCosto: `${cc.codigo} · ${cc.nombre}`,
          monto: 420_000,
          porcentaje: 100,
        },
      ],
      lineas: [
        {
          descripcion: 'Herbicida selectivo',
          cantidad: 20,
          precioUnitario: 21_000,
          total: 420_000,
          centroCostoId: cc.id,
          centroCosto: `${cc.codigo} · ${cc.nombre}`,
        },
      ],
      empresaId,
      aprobaciones: {
        create: {
          ocNumero: 'OC-DEMO-APR-02',
          proveedor: proveedor.razonSocial,
          monto: 420_000,
          solicitante: solicitante.nombre,
          aprobadorId: aprobador.id,
          aprobadorNombre: aprobador.nombre,
          resueltoPorId: aprobador.id,
          resueltoPorNombre: aprobador.nombre,
          estado: 'APROBADA',
          fecha,
          empresaId,
        },
      },
    },
  });
  console.log(`  OC aprobada (print): ${ocOk.numero}`);

  // 3) Recepcionada + factura en libro compras
  const ocRec = await prisma.ordenCompra.create({
    data: {
      numero: 'OC-DEMO-REC-03',
      fecha,
      proveedor: proveedor.razonSocial,
      proveedorId: proveedor.id,
      solicitante: solicitante.nombre,
      creadoPorId: solicitante.id,
      creadoPorNombre: solicitante.nombre,
      aprobadorId: aprobador.id,
      aprobadorNombre: aprobador.nombre,
      moneda: 'CLP',
      neto: 300_000,
      afacto: 'AFECTO',
      estado: 'RECEPCIONADA',
      departamento: 'Compras',
      cuentaContableId: ctaGasto.id,
      centroCostoId: cc.id,
      elementoCostoId: el?.id,
      distribucionCc: [
        {
          centroCostoId: cc.id,
          centroCosto: `${cc.codigo} · ${cc.nombre}`,
          monto: 300_000,
          porcentaje: 100,
        },
      ],
      lineas: [
        {
          descripcion: 'Semilla certificada',
          cantidad: 15,
          precioUnitario: 20_000,
          total: 300_000,
          centroCostoId: cc.id,
          centroCosto: `${cc.codigo} · ${cc.nombre}`,
        },
      ],
      empresaId,
    },
  });
  await prisma.aprobacionOc.create({
    data: {
      ocId: ocRec.id,
      ocNumero: ocRec.numero,
      proveedor: proveedor.razonSocial,
      monto: 300_000,
      solicitante: solicitante.nombre,
      aprobadorId: aprobador.id,
      aprobadorNombre: aprobador.nombre,
      resueltoPorId: aprobador.id,
      resueltoPorNombre: aprobador.nombre,
      estado: 'APROBADA',
      fecha,
      empresaId,
    },
  });
  await prisma.recepcionOc.create({
    data: {
      ocId: ocRec.id,
      ocNumero: ocRec.numero,
      fecha,
      tcAplicado: 1,
      moneda: 'CLP',
      monto: 300_000,
      estado: 'CONFIRMADA',
      lineas: [
        {
          descripcion: 'Semilla certificada',
          cantidad: 15,
          precioUnitario: 20_000,
          total: 300_000,
        },
      ],
      empresaId,
    },
  });
  const reg = await prisma.registroCompra.create({
    data: {
      ocId: ocRec.id,
      ocNumero: ocRec.numero,
      factura: 'FAC-DEMO-3001',
      proveedorOc: proveedor.razonSocial,
      proveedorFactura: proveedor.razonSocial,
      proveedorId: proveedor.id,
      monto: 300_000,
      afactoOc: 'AFECTO',
      afactoFactura: 'AFECTO',
      afactoOk: true,
      matchOk: true,
      matchDiff: 0,
      estado: 'EMITIDO',
      lineas: [
        {
          descripcion: 'Semilla certificada',
          cantidad: 15,
          precioUnitario: 20_000,
          total: 300_000,
        },
      ],
      empresaId,
    },
  });
  console.log(`  OC recepcionada + factura: ${ocRec.numero} → ${reg.factura}`);

  // --- VENTAS ---
  // Limpiar folios demo fijos si quedaron de una corrida previa incompleta
  for (const folio of ['88001', '88002']) {
    const prev = await prisma.documentoComercial.findFirst({
      where: { empresaId, folio },
      select: { id: true, folio: true },
    });
    if (prev) {
      await prisma.cuentaCorrienteMovimiento.deleteMany({
        where: { empresaId, documentoRef: folio },
      });
      await prisma.documentoAging.deleteMany({
        where: { empresaId, documento: folio },
      });
      await prisma.documentoComercial.delete({ where: { id: prev.id } });
    }
  }

  const neto = 1_000_000;
  const iva = 190_000;
  const total = neto + iva;
  const folioFac = '88001';
  const numAsiento = await nextAsientoNumero(empresaId, 2026);
  const asiento = await prisma.asiento.create({
    data: {
      numero: numAsiento,
      fecha,
      periodo,
      tipo: 'DIARIO',
      glosa: `Contabiliza ${folioFac} · ${cliente.razonSocial} · ${TAG}`,
      origen: `DEMO:${TAG}:DOC:${folioFac}`,
      debe: total,
      haber: total,
      estado: 'CONTABILIZADO',
      empresaId,
      lineas: [
        { debe: total, haber: 0, cuentaId: ctaClientes.id, glosa: 'Clientes' },
        { debe: 0, haber: neto, cuentaId: ctaVentas.id, glosa: 'Ventas' },
        { debe: 0, haber: iva, cuentaId: ctaIva.id, glosa: 'IVA débito fiscal' },
      ],
    },
  });
  const fac = await prisma.documentoComercial.create({
    data: {
      folio: folioFac,
      tipo: 'FACTURA',
      cliente: cliente.razonSocial,
      clienteId: cliente.id,
      fecha,
      neto,
      iva,
      estado: 'CONTABILIZADA',
      asientoOriginal: asiento.numero,
      formaPago: 'CREDITO',
      indicadorVenta: 'VENTA',
      cuentaContableId: ctaVentas.id,
      centroCostoId: cc.id,
      receptorRut: cliente.rut,
      receptorGiro: 'Exportación agrícola',
      receptorDireccion: 'Av. Apoquindo 3000',
      receptorComuna: 'Las Condes',
      receptorCiudad: 'Santiago',
      observaciones: `${TAG} · factura lista para reverso / preview`,
      lineas: [
        {
          descripcion: 'Servicio de packing temporada',
          cantidad: 1,
          precioUnitario: neto,
          total: neto,
          cuentaContableId: ctaVentas.id,
          centroCostoId: cc.id,
        },
      ],
      empresaId,
    },
  });
  await prisma.cuentaCorrienteMovimiento.create({
    data: {
      empresaId,
      terceroTipo: 'CLIENTE',
      terceroId: cliente.id,
      terceroNombre: cliente.razonSocial,
      fecha,
      documentoRef: fac.folio,
      documentoTipo: 'FACTURA',
      debe: total,
      haber: 0,
      saldo: total,
      glosa: `Venta ${fac.folio} · ${TAG}`,
      origen: 'VENTA',
    },
  });
  await prisma.documentoAging.create({
    data: {
      empresaId,
      tipo: 'POR_COBRAR',
      documento: fac.folio,
      contraparte: cliente.razonSocial,
      fechaEmision: fecha,
      fechaVencimiento: new Date('2026-09-02T12:00:00.000Z'),
      monto: total,
      saldo: total,
      estado: 'AL_DIA',
      documentoComercialId: fac.id,
    },
  });
  console.log(`  Factura venta CONTABILIZADA: ${fac.folio} (asiento ${asiento.numero})`);

  // Borrador para watermark
  await prisma.documentoComercial.create({
    data: {
      folio: '88002',
      tipo: 'FACTURA',
      cliente: cliente.razonSocial,
      clienteId: cliente.id,
      fecha,
      neto: 500_000,
      iva: 95_000,
      estado: 'BORRADOR',
      formaPago: 'CREDITO',
      indicadorVenta: 'VENTA',
      cuentaContableId: ctaVentas.id,
      centroCostoId: cc.id,
      receptorRut: cliente.rut,
      observaciones: `${TAG} · borrador watermark`,
      lineas: [
        {
          descripcion: 'Servicio logístico (borrador)',
          cantidad: 1,
          precioUnitario: 500_000,
          total: 500_000,
          cuentaContableId: ctaVentas.id,
          centroCostoId: cc.id,
        },
      ],
      empresaId,
    },
  });
  console.log('  Borrador venta: 88002 (watermark)');

  // --- PROFORMA contratista (definitiva bloqueada) ---
  let contratista = await prisma.contratista.findFirst({
    where: { empresaId, activo: true },
  });
  if (!contratista) {
    contratista = await prisma.contratista.create({
      data: {
        id: `CTR-${empresaId}-DEMO`,
        rut: '12.345.678-9',
        razonSocial: 'Servicios Agrícolas del Valle',
        especialidad: 'Cosecha',
        activo: true,
        empresaId,
      },
    });
  }
  await prisma.proformaContratista.create({
    data: {
      numero: 'PF-DEMO-PEND-01',
      estado: 'PENDIENTE_APROBACION',
      empresaId,
      contratistaId: contratista.id,
      periodo,
      montoNeto: 520_000,
      moneda: 'CLP',
      creadoPorId: solicitante.id,
      creadoPorNombre: solicitante.nombre,
      aprobadorId: aprobador.id,
      aprobadorNombre: aprobador.nombre,
    },
  });
  await prisma.proformaContratista.create({
    data: {
      numero: 'PF-DEMO-001',
      estado: 'DEFINITIVA',
      empresaId,
      contratistaId: contratista.id,
      periodo,
      montoNeto: 750_000,
      moneda: 'CLP',
      creadoPorId: solicitante.id,
      creadoPorNombre: solicitante.nombre,
      aprobadorId: aprobador.id,
      aprobadorNombre: aprobador.nombre,
      aprobadoPorId: aprobador.id,
      aprobadoPorNombre: aprobador.nombre,
      aprobadaAt: fecha,
    },
  });
  console.log('  Proforma PENDIENTE: PF-DEMO-PEND-01 · DEFINITIVA: PF-DEMO-001');

  // Notificación pendiente OC
  const ap = await prisma.aprobacionOc.findFirst({
    where: { ocId: ocPend.id, estado: 'PENDIENTE' },
  });
  if (ap) {
    await prisma.notificacion.upsert({
      where: { userId_refKey: { userId: aprobador.id, refKey: `oc-pend:${ap.id}` } },
      create: {
        userId: aprobador.id,
        empresaId,
        tipo: 'OC_PENDIENTE',
        titulo: `OC ${ocPend.numero} pendiente`,
        detalle: `${proveedor.razonSocial} · ${solicitante.nombre}`,
        href: `/compras/aprobaciones?open=${encodeURIComponent(ap.id)}`,
        refKey: `oc-pend:${ap.id}`,
        monto: 850_000,
        leida: false,
      },
      update: {
        leida: false,
        titulo: `OC ${ocPend.numero} pendiente`,
        detalle: `${proveedor.razonSocial} · ${solicitante.nombre}`,
      },
    });
    console.log('  Notificación OC pendiente al aprobador');
  }

  return {
    ocPend: ocPend.numero,
    ocOk: ocOk.numero,
    ocRec: ocRec.numero,
    facturaCompra: reg.factura,
    facturaVenta: fac.folio,
    borrador: '88002',
    cliente: cliente.razonSocial,
    proveedor: proveedor.razonSocial,
    cc: `${cc.codigo} · ${cc.nombre}`,
    aprobador: aprobador.email,
    solicitante: solicitante.email,
  };
}

async function main() {
  const empresa = await resolveEmpresa();
  if (!empresa) throw new Error('No hay empresa activa');
  console.log(`Empresa: ${empresa.razonSocial} (${empresa.id})`);

  console.log('\n=== AUDIT basura (antes) ===');
  const before = await auditBasura(empresa.id);
  if (!before.length) console.log('  (sin hallazgos QA/legacy)');
  for (const f of before) console.log(`  [${f.area}] ${f.detail}: ${f.count}`);

  await cleanupBasura(empresa.id);

  const summary = await seedDemo(empresa.id);

  console.log('\n=== AUDIT basura (después; debe quedar solo DEMO-SERGIO) ===');
  const after = await auditBasura(empresa.id);
  for (const f of after) console.log(`  [${f.area}] ${f.detail}: ${f.count}`);

  const ocs = await prisma.ordenCompra.findMany({
    where: { empresaId: empresa.id },
    orderBy: { numero: 'asc' },
    select: {
      numero: true,
      estado: true,
      neto: true,
      centroCostoId: true,
      cuentaContableId: true,
      creadoPorNombre: true,
      aprobadorNombre: true,
      distribucionCc: true,
    },
  });
  console.log('\n=== OC finales ===');
  for (const o of ocs) {
    const dist = Array.isArray(o.distribucionCc) ? o.distribucionCc.length : 0;
    console.log(
      `  ${o.numero} | ${o.estado} | $${Number(o.neto)} | CC=${o.centroCostoId ? 'sí' : 'no'} `
      + `cta=${o.cuentaContableId ? 'sí' : 'no'} dist=${dist} `
      + `creado=${o.creadoPorNombre ?? '—'} jefe=${o.aprobadorNombre ?? '—'}`,
    );
  }

  console.log('\n=== GUÍA RÁPIDA PARA SERGIO ===');
  console.log(`  Login aprobador: ${summary.aprobador} / QaTest123! · PIN 4821`);
  console.log(`  Login admin: admin@almahue.local / Admin123!`);
  console.log(`  Bloque 1: Compras › Aprobaciones → ${summary.ocPend} (PIN)`);
  console.log(`  Bloque 2: Órdenes → ${summary.ocOk} (print+CC) · Libro compras → ${summary.facturaCompra} (${summary.ocRec})`);
  console.log(`  Bloque 3: Libro ventas → folio ${summary.facturaVenta} (reverso) · borrador ${summary.borrador}`);
  console.log(`  Cliente: ${summary.cliente} · Proveedor: ${summary.proveedor} · CC: ${summary.cc}`);
  console.log('\nListo.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
