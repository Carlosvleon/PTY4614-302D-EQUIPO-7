// Para cada mapeo Config SII con problema, muestra las opciones acotadas de esa empresa.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const run = async () => {
  const rows = await prisma.configContableSii.findMany({
    include: { cuentaContable: true },
  });

  const problemas = rows.filter((r) => {
    const c = r.cuentaContable;
    return !c.activa || c.noImputable
      || (c.requiereCc && !r.centroCostoId)
      || (c.requiereArea && !r.areaNegocioId)
      || (c.requiereElemento && !r.elementoCostoId);
  });

  for (const r of problemas) {
    const c = r.cuentaContable;
    console.log(`\n### ${r.tipoDocumentoSii} · empresa ${r.empresaId} · cuenta ${c.codigo} ${c.nombre}`);
    console.log(`    noImputable=${c.noImputable} activa=${c.activa} requiere CC=${c.requiereCc} AREA=${c.requiereArea} EC=${c.requiereElemento}`);
    console.log(`    tiene CC=${r.centroCostoId ?? '-'} AREA=${r.areaNegocioId ?? '-'} EC=${r.elementoCostoId ?? '-'}`);

    if (c.noImputable || !c.activa) {
      const hijas = await prisma.cuentaContable.findMany({
        where: {
          empresaId: r.empresaId,
          activa: true,
          noImputable: false,
          codigo: { startsWith: `${c.codigo}-` },
        },
        select: { id: true, codigo: true, nombre: true, requiereCc: true, requiereArea: true, requiereElemento: true },
        orderBy: { codigo: 'asc' },
        take: 12,
      });
      console.log('    hijas imputables:');
      for (const h of hijas) {
        const exige = [h.requiereCc && 'CC', h.requiereArea && 'AREA', h.requiereElemento && 'EC'].filter(Boolean).join('+') || '—';
        console.log(`      ${h.codigo.padEnd(16)} exige ${exige.padEnd(9)} ${h.nombre}  [${h.id}]`);
      }
    }

    if (c.requiereCc && !r.centroCostoId) {
      const ccs = await prisma.centroCosto.findMany({
        where: { empresaId: r.empresaId, activa: true },
        select: { id: true, codigo: true, nombre: true },
        orderBy: { codigo: 'asc' },
        take: 12,
      });
      console.log('    CC disponibles:', ccs.map((x) => `${x.codigo}=${x.nombre}[${x.id}]`).join(' | ') || '(ninguno)');
    }
    if (c.requiereArea && !r.areaNegocioId) {
      const areas = await prisma.areaNegocio.findMany({
        where: { empresaId: r.empresaId, activa: true },
        select: { id: true, codigo: true, nombre: true },
        orderBy: { codigo: 'asc' },
        take: 12,
      });
      console.log('    AREA disponibles:', areas.map((x) => `${x.codigo}=${x.nombre}[${x.id}]`).join(' | ') || '(ninguna)');
    }
    if (c.requiereElemento && !r.elementoCostoId) {
      const ecs = await prisma.elementoCosto.findMany({
        where: { empresaId: r.empresaId },
        select: { id: true, codigo: true, nombre: true },
        orderBy: { codigo: 'asc' },
        take: 12,
      });
      console.log('    EC (primeros):', ecs.map((x) => `${x.codigo}=${x.nombre}[${x.id}]`).join(' | ') || '(ninguno)');
    }
  }
  if (!problemas.length) console.log('Sin mapeos con problema.');
};

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
