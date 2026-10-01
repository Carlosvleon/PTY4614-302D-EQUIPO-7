/**
 * Conceptos y códigos del flujo Excel (sin montos).
 *   npx ts-node -r tsconfig-paths/register prisma/seed-flujo-excel-almahue.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { CODIGOS_FLUJO_EXCEL, CONCEPTOS_FLUJO_EXCEL } from './flujo-excel-almahue';

export async function seedFlujoExcelAlmahue(prisma: PrismaClient): Promise<{ conceptos: number; codigos: number }> {
  const empresas = await prisma.empresa.findMany({ select: { id: true } });
  let conceptos = 0;
  let codigos = 0;
  for (const emp of empresas) {
    const conceptoId = new Map<string, string>();
    for (const c of CONCEPTOS_FLUJO_EXCEL) {
      const row = await prisma.conceptoFlujo.upsert({
        where: { empresaId_codigo: { empresaId: emp.id, codigo: c.codigo } },
        update: { nombre: c.nombre, orden: c.orden, activo: true },
        create: {
          codigo: c.codigo,
          nombre: c.nombre,
          orden: c.orden,
          activo: true,
          empresaId: emp.id,
        },
      });
      conceptoId.set(c.codigo, row.id);
      conceptos += 1;
    }
    for (const item of CODIGOS_FLUJO_EXCEL) {
      const concepto = conceptoId.get(item.conceptoCodigo);
      await prisma.codigoFinanciero.upsert({
        where: { empresaId_codigo: { empresaId: emp.id, codigo: item.codigo } },
        update: { nombre: item.nombre, activa: true, conceptoId: concepto },
        create: {
          codigo: item.codigo,
          nombre: item.nombre,
          activa: true,
          conceptoId: concepto,
          empresaId: emp.id,
        },
      });
      codigos += 1;
    }
  }
  return { conceptos, codigos };
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  try {
    const n = await seedFlujoExcelAlmahue(prisma);
    console.log(`  flujo Excel: ${n.conceptos} conceptos, ${n.codigos} códigos (upsert por empresa)`);
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
