/**
 * Audita OC/aprobaciones, limpia datos transaccionales de compras viejos
 * y siembra un set coherente para QA del flujo de aprobación.
 *
 * Uso: npx ts-node -r tsconfig-paths/register scripts/audit-and-reset-flujo-oc.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function audit() {
  const ocs = await prisma.ordenCompra.findMany({
    orderBy: { createdAt: 'desc' },
    include: { aprobaciones: true },
  });
  console.log('\n=== AUDIT OrdenCompra + AprobacionOc ===');
  console.log(`Total OC: ${ocs.length}`);
  for (const o of ocs) {
    const ap = o.aprobaciones.map((a) => `${a.estado}(jefe=${a.aprobadorNombre ?? '—'})`).join(', ') || 'sin bandeja';
    console.log(
      `  ${o.numero} | OC=${o.estado} | jefeOC=${o.aprobadorNombre ?? '—'} | neto=${o.neto} | bandeja: ${ap}`,
    );
  }
  const zombie = ocs.filter(
    (o) => o.estado === 'ANULADO' && o.aprobaciones.some((a) => a.estado === 'PENDIENTE'),
  );
  const sinJefe = ocs.filter(
    (o) =>
      (o.estado === 'EMITIDO' || o.estado === 'BORRADOR') &&
      o.aprobaciones.some((a) => a.estado === 'PENDIENTE') &&
      !o.aprobadorId,
  );
  console.log(`\nZombies ANULADO+PENDIENTE: ${zombie.length}`);
  console.log(`EMITIDO/BORRADOR pendiente sin jefe: ${sinJefe.length}`);
  return { ocs, zombie, sinJefe };
}

async function main() {
  const before = await audit();

  const empresa = await prisma.empresa.findFirst({ where: { activa: true } });
  if (!empresa) throw new Error('No hay empresa activa');

  const aprobador =
    (await prisma.usuario.findFirst({ where: { email: 'qa.aprobador@almahue.local' } })) ??
    (await prisma.usuario.findFirst({ where: { email: 'admin@almahue.local' } }));
  const solicitante =
    (await prisma.usuario.findFirst({ where: { email: 'qa.solicitante@almahue.local' } })) ??
    (await prisma.usuario.findFirst({ where: { email: 'admin@almahue.local' } }));
  if (!aprobador || !solicitante) throw new Error('Faltan usuarios QA');

  const proveedor = await prisma.proveedor.findFirst({
    where: { empresaId: empresa.id, activo: true },
  });
  if (!proveedor) throw new Error('No hay proveedor');

  const cc = await prisma.centroCosto.findFirst({ where: { empresaId: empresa.id } });
  const el = await prisma.elementoCosto.findFirst({ where: { empresaId: empresa.id } });

  const wf = await prisma.workflowConfig.findFirst({
    where: { empresaId: empresa.id, modulo: 'Compras', activo: true },
  });
  if (wf) {
    const ids = Array.isArray(wf.aprobadorIds) ? [...wf.aprobadorIds] : [];
    if (!ids.includes(aprobador.id)) {
      await prisma.workflowConfig.update({
        where: { id: wf.id },
        data: { aprobadorIds: [...ids, aprobador.id] },
      });
      console.log(`\nWorkflow Compras actualizado: +${aprobador.nombre}`);
    }
  }

  console.log('\n=== LIMPIEZA transaccional compras ===');
  // Orden por FKs
  const delReg = await prisma.registroCompra.deleteMany({ where: { empresaId: empresa.id } });
  const delRec = await prisma.recepcionOc.deleteMany({ where: { empresaId: empresa.id } });
  const delAp = await prisma.aprobacionOc.deleteMany({ where: { empresaId: empresa.id } });
  const delOc = await prisma.ordenCompra.deleteMany({ where: { empresaId: empresa.id } });
  console.log(`  registros-compra: ${delReg.count}`);
  console.log(`  recepciones: ${delRec.count}`);
  console.log(`  aprobaciones-oc: ${delAp.count}`);
  console.log(`  ordenes-compra: ${delOc.count}`);
  console.log(`  (antes había ${before.ocs.length} OC)`);

  console.log('\n=== SEED flujo coherente ===');
  const hoy = new Date('2026-07-30T12:00:00.000Z');

  // 1) Pendiente de aprobación (flujo normal: OC=EMITIDO + bandeja=PENDIENTE + jefe)
  const ocPend = await prisma.ordenCompra.create({
    data: {
      numero: 'OC-QA-PEND-001',
      fecha: hoy,
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
      centroCostoId: cc?.id,
      elementoCostoId: el?.id,
      distribucionCc: cc
        ? [{
            centroCostoId: cc.id,
            centroCosto: `${cc.codigo} · ${cc.nombre}`,
            monto: 850_000,
            porcentaje: 100,
          }]
        : undefined,
      lineas: [
        {
          descripcion: 'Fertilizante NPK QA',
          cantidad: 10,
          precioUnitario: 85_000,
          total: 850_000,
        },
      ],
      empresaId: empresa.id,
    },
  });
  await prisma.aprobacionOc.create({
    data: {
      ocId: ocPend.id,
      ocNumero: ocPend.numero,
      proveedor: ocPend.proveedor,
      monto: ocPend.neto,
      solicitante: ocPend.solicitante,
      aprobadorId: aprobador.id,
      aprobadorNombre: aprobador.nombre,
      estado: 'PENDIENTE',
      fecha: hoy,
      empresaId: empresa.id,
    },
  });
  console.log(`  ${ocPend.numero}: EMITIDO + bandeja PENDIENTE → jefe ${aprobador.nombre}`);

  // 2) Ya aprobada (lista para recepción)
  const ocOk = await prisma.ordenCompra.create({
    data: {
      numero: 'OC-QA-OK-002',
      fecha: new Date('2026-07-28T12:00:00.000Z'),
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
      centroCostoId: cc?.id,
      elementoCostoId: el?.id,
      distribucionCc: cc
        ? [{
            centroCostoId: cc.id,
            centroCosto: `${cc.codigo} · ${cc.nombre}`,
            monto: 420_000,
            porcentaje: 100,
          }]
        : undefined,
      lineas: [
        {
          descripcion: 'Herbicida selectivo QA',
          cantidad: 20,
          precioUnitario: 21_000,
          total: 420_000,
        },
      ],
      empresaId: empresa.id,
    },
  });
  await prisma.aprobacionOc.create({
    data: {
      ocId: ocOk.id,
      ocNumero: ocOk.numero,
      proveedor: ocOk.proveedor,
      monto: ocOk.neto,
      solicitante: ocOk.solicitante,
      aprobadorId: aprobador.id,
      aprobadorNombre: aprobador.nombre,
      estado: 'APROBADA',
      resueltoPorId: aprobador.id,
      resueltoPorNombre: aprobador.nombre,
      fecha: new Date('2026-07-28T12:00:00.000Z'),
      empresaId: empresa.id,
    },
  });
  console.log(`  ${ocOk.numero}: APROBADO + bandeja APROBADA`);

  // 3) Rechazada (editable/anulable, sin reabrir bandeja)
  const ocRech = await prisma.ordenCompra.create({
    data: {
      numero: 'OC-QA-RECH-003',
      fecha: new Date('2026-07-27T12:00:00.000Z'),
      proveedor: proveedor.razonSocial,
      proveedorId: proveedor.id,
      solicitante: solicitante.nombre,
      creadoPorId: solicitante.id,
      creadoPorNombre: solicitante.nombre,
      aprobadorId: aprobador.id,
      aprobadorNombre: aprobador.nombre,
      moneda: 'CLP',
      neto: 150_000,
      afacto: 'EXENTO',
      estado: 'RECHAZADO',
      departamento: 'Compras',
      lineas: [
        {
          descripcion: 'Herramienta menor QA',
          cantidad: 5,
          precioUnitario: 30_000,
          total: 150_000,
        },
      ],
      empresaId: empresa.id,
    },
  });
  await prisma.aprobacionOc.create({
    data: {
      ocId: ocRech.id,
      ocNumero: ocRech.numero,
      proveedor: ocRech.proveedor,
      monto: ocRech.neto,
      solicitante: ocRech.solicitante,
      aprobadorId: aprobador.id,
      aprobadorNombre: aprobador.nombre,
      estado: 'RECHAZADA',
      resueltoPorId: aprobador.id,
      resueltoPorNombre: aprobador.nombre,
      fecha: new Date('2026-07-27T12:00:00.000Z'),
      empresaId: empresa.id,
    },
  });
  console.log(`  ${ocRech.numero}: RECHAZADO + bandeja RECHAZADA`);

  // 4) Anulada con bandeja cerrada (ANULADA) — caso correcto post-fix
  const ocAnul = await prisma.ordenCompra.create({
    data: {
      numero: 'OC-QA-ANUL-004',
      fecha: new Date('2026-07-26T12:00:00.000Z'),
      proveedor: proveedor.razonSocial,
      proveedorId: proveedor.id,
      solicitante: solicitante.nombre,
      creadoPorId: solicitante.id,
      creadoPorNombre: solicitante.nombre,
      aprobadorId: aprobador.id,
      aprobadorNombre: aprobador.nombre,
      moneda: 'CLP',
      neto: 50_000,
      afacto: 'AFECTO',
      estado: 'ANULADO',
      departamento: 'Compras',
      lineas: [
        {
          descripcion: 'Prueba anulación QA',
          cantidad: 1,
          precioUnitario: 50_000,
          total: 50_000,
        },
      ],
      empresaId: empresa.id,
    },
  });
  await prisma.aprobacionOc.create({
    data: {
      ocId: ocAnul.id,
      ocNumero: ocAnul.numero,
      proveedor: ocAnul.proveedor,
      monto: ocAnul.neto,
      solicitante: ocAnul.solicitante,
      aprobadorId: aprobador.id,
      aprobadorNombre: aprobador.nombre,
      estado: 'ANULADA',
      resueltoPorId: solicitante.id,
      resueltoPorNombre: `${solicitante.nombre} (OC anulada)`,
      fecha: new Date('2026-07-26T12:00:00.000Z'),
      empresaId: empresa.id,
    },
  });
  console.log(`  ${ocAnul.numero}: ANULADO + bandeja ANULADA`);

  // 5) E2E: OC recepcionada + registro de compra (elegible libro compras)
  const ocRec = await prisma.ordenCompra.create({
    data: {
      numero: 'OC-QA-REC-005',
      fecha: new Date('2026-07-25T12:00:00.000Z'),
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
      centroCostoId: cc?.id,
      elementoCostoId: el?.id,
      distribucionCc: cc
        ? [{
            centroCostoId: cc.id,
            centroCosto: `${cc.codigo} · ${cc.nombre}`,
            monto: 300_000,
            porcentaje: 100,
          }]
        : undefined,
      lineas: [
        {
          descripcion: 'Semilla QA E2E',
          cantidad: 15,
          precioUnitario: 20_000,
          total: 300_000,
        },
      ],
      empresaId: empresa.id,
    },
  });
  await prisma.aprobacionOc.create({
    data: {
      ocId: ocRec.id,
      ocNumero: ocRec.numero,
      proveedor: ocRec.proveedor,
      monto: ocRec.neto,
      solicitante: ocRec.solicitante,
      aprobadorId: aprobador.id,
      aprobadorNombre: aprobador.nombre,
      estado: 'APROBADA',
      resueltoPorId: aprobador.id,
      resueltoPorNombre: aprobador.nombre,
      fecha: new Date('2026-07-25T14:00:00.000Z'),
      empresaId: empresa.id,
    },
  });
  await prisma.recepcionOc.create({
    data: {
      ocId: ocRec.id,
      ocNumero: ocRec.numero,
      fecha: new Date('2026-07-26T12:00:00.000Z'),
      tcAplicado: 1,
      moneda: 'CLP',
      monto: ocRec.neto,
      estado: 'CONFIRMADA',
      lineas: ocRec.lineas ?? undefined,
      empresaId: empresa.id,
    },
  });
  await prisma.registroCompra.create({
    data: {
      ocId: ocRec.id,
      ocNumero: ocRec.numero,
      factura: 'FAC-QA-E2E-001',
      proveedorOc: ocRec.proveedor,
      proveedorFactura: ocRec.proveedor,
      proveedorId: proveedor.id,
      monto: ocRec.neto,
      afactoOc: 'AFECTO',
      afactoFactura: 'AFECTO',
      afactoOk: true,
      estado: 'BORRADOR',
      lineas: ocRec.lineas ?? undefined,
      empresaId: empresa.id,
    },
  });
  console.log(`  ${ocRec.numero}: RECEPCIONADA + recepción CONFIRMADA + registro FAC-QA-E2E-001`);

  // Bodega: alinear movimientos huérfanos a nombre de catálogo
  const bodegas = await prisma.bodega.findMany({
    where: { empresaId: empresa.id },
    select: { nombre: true, activa: true },
  });
  const nombresBodega = bodegas.map((b) => b.nombre);
  const bodegaActiva = bodegas.find((b) => b.activa) ?? bodegas[0];
  if (bodegaActiva && nombresBodega.length) {
    const orphans = await prisma.movimientoBodega.findMany({
      where: {
        empresaId: empresa.id,
        bodega: { notIn: nombresBodega },
      },
      select: { id: true },
      take: 50,
    });
    if (orphans.length) {
      const upd = await prisma.movimientoBodega.updateMany({
        where: { id: { in: orphans.map((o) => o.id) } },
        data: { bodega: bodegaActiva.nombre },
      });
      console.log(`\nBodega: ${upd.count} movimiento(s) huérfano(s) → «${bodegaActiva.nombre}»`);
    } else {
      console.log('\nBodega: sin movimientos huérfanos');
    }
  }

  await audit();
  console.log('\nOK. Credenciales sugeridas:');
  console.log('  Solicitante: qa.solicitante@almahue.local / QaTest123!');
  console.log('  Aprobador:   qa.aprobador@almahue.local / QaTest123!');
  console.log('  Crear desde front: Compras → Órdenes → Nueva OC (elige jefe QA Aprobador)');
  console.log('  E2E listo: OC-QA-REC-005 → recepción + registro en Libro de compras');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
