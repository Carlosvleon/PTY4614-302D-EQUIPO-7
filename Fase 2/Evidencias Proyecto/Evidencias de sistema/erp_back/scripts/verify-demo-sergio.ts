import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const eid = 'EMP-1';

  const asientos = await prisma.asiento.findMany({
    where: {
      empresaId: eid,
      OR: [
        { origen: { startsWith: 'REVERSA:' } },
        { origen: { startsWith: 'DOC-NEW:' } },
        { origen: { contains: 'QA' } },
        { origen: { contains: 'DEMO' } },
        { glosa: { contains: 'QA' } },
        { glosa: { contains: 'DEMO-SERGIO' } },
        { glosa: { contains: 'Reversa doc' } },
        { glosa: { contains: 'Asiento original doc' } },
      ],
    },
    select: { numero: true, glosa: true, origen: true, estado: true },
    orderBy: { numero: 'asc' },
  });
  console.log('ASIENTOS marcados:');
  for (const a of asientos) console.log(`  ${a.numero} | ${a.estado} | ${a.origen ?? '—'} | ${a.glosa}`);

  const docs = await prisma.documentoComercial.findMany({
    where: { empresaId: eid },
    select: {
      folio: true,
      tipo: true,
      estado: true,
      cliente: true,
      neto: true,
      iva: true,
      asientoOriginal: true,
    },
    orderBy: { folio: 'asc' },
  });
  console.log('\nDOCS comerciales:');
  for (const d of docs) {
    console.log(
      `  ${d.folio} | ${d.tipo} | ${d.estado} | ${d.cliente} | neto=${d.neto} iva=${d.iva} asi=${d.asientoOriginal ?? '—'}`,
    );
  }

  const regs = await prisma.registroCompra.findMany({
    where: { empresaId: eid },
    select: { factura: true, ocNumero: true, estado: true, matchOk: true, monto: true },
  });
  console.log('\nREG compras:');
  for (const r of regs) console.log(`  ${r.factura} | OC ${r.ocNumero} | ${r.estado} | match=${r.matchOk} | $${r.monto}`);

  const ocs = await prisma.ordenCompra.findMany({
    where: { empresaId: eid },
    select: { numero: true, estado: true, neto: true, centroCostoId: true, creadoPorNombre: true },
    orderBy: { numero: 'asc' },
  });
  console.log('\nOC:');
  for (const o of ocs) {
    console.log(`  ${o.numero} | ${o.estado} | $${o.neto} | CC=${o.centroCostoId ? 'sí' : 'NO'} | ${o.creadoPorNombre}`);
  }

  const profs = await prisma.proformaContratista.findMany({
    where: { empresaId: eid },
    select: { numero: true, estado: true, montoNeto: true },
  });
  console.log('\nPROFORMAS:');
  for (const p of profs) console.log(`  ${p.numero} | ${p.estado} | $${p.montoNeto}`);

  const aps = await prisma.aprobacionOc.findMany({
    where: { empresaId: eid, estado: 'PENDIENTE' },
    select: { ocNumero: true, aprobadorNombre: true, monto: true },
  });
  console.log('\nAPROBACIONES PEND:');
  for (const a of aps) console.log(`  ${a.ocNumero} → ${a.aprobadorNombre} $${a.monto}`);

  const aging = await prisma.documentoAging.findMany({
    where: { empresaId: eid },
    select: { documento: true, tipo: true, saldo: true, contraparte: true },
  });
  console.log('\nAGING:');
  for (const a of aging) console.log(`  ${a.tipo} ${a.documento} | ${a.contraparte} | saldo=${a.saldo}`);

  const cc = await prisma.cuentaCorrienteMovimiento.findMany({
    where: { empresaId: eid },
    select: { documentoRef: true, terceroNombre: true, debe: true, haber: true, saldo: true, origen: true },
    orderBy: { fecha: 'desc' },
    take: 15,
  });
  console.log('\nCC (últimos 15):');
  for (const m of cc) {
    console.log(`  ${m.documentoRef} | ${m.terceroNombre} | D=${m.debe} H=${m.haber} S=${m.saldo} | ${m.origen}`);
  }

  // Basura no-DEMO restante
  const asientosNoDemo = asientos.filter(
    (a) => !(a.origen?.includes('DEMO-SERGIO') || a.glosa.includes('DEMO-SERGIO')),
  );
  console.log(`\nAsientos basura no-DEMO: ${asientosNoDemo.length}`);
  for (const a of asientosNoDemo) console.log(`  !! ${a.numero} | ${a.origen} | ${a.glosa}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
