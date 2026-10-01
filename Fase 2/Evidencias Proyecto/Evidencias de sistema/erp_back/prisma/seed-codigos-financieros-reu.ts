/**
 * Códigos financieros de ejemplo citados en Reu1–Reu3 (MJ en Agrosoft).
 * No es el catálogo completo (R4-25); solo nombres orales para poder contabilizar cartola en local.
 *
 *   npx ts-node -r tsconfig-paths/register prisma/seed-codigos-financieros-reu.ts
 *   (también lo llama prisma/seed.ts)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/** Reu1 ~1:35 (flujo de caja) + Reu2 pago productor. */
export const CODIGOS_FINANCIEROS_REU = [
  { codigo: 'ING-CEREZA', nombre: 'Ingresos cerezas' },
  { codigo: 'VTA-AGROQ', nombre: 'Venta de agroquímico' },
  { codigo: 'VTA-EXP-CEREZA', nombre: 'Venta de exportación cereza' },
  { codigo: 'VTA-EXP-NECTARIN', nombre: 'Venta de exportación nectarín' },
  { codigo: 'MAT-PRIMA', nombre: 'Materia prima' },
] as const;

export async function seedCodigosFinancierosReu(prisma: PrismaClient): Promise<number> {
  const empresas = await prisma.empresa.findMany({ select: { id: true } });
  let n = 0;
  for (const emp of empresas) {
    for (const item of CODIGOS_FINANCIEROS_REU) {
      await prisma.codigoFinanciero.upsert({
        where: { empresaId_codigo: { empresaId: emp.id, codigo: item.codigo } },
        update: { nombre: item.nombre, activa: true },
        create: {
          codigo: item.codigo,
          nombre: item.nombre,
          activa: true,
          empresaId: emp.id,
        },
      });
      n += 1;
    }
  }
  return n;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  try {
    const n = await seedCodigosFinancierosReu(prisma);
    const empresas = await prisma.empresa.count();
    console.log(
      `  ${CODIGOS_FINANCIEROS_REU.length} códigos financieros Reu1–3 × ${empresas} empresa(s) (${n} upserts)`,
    );
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
