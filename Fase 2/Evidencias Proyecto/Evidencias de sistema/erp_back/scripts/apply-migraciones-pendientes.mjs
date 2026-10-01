// Aplica a mano el DDL de las migraciones que Prisma no puede correr en local:
// `erp._prisma_migrations` está vacía, así que `migrate deploy` rompe en `init`.
// Idempotente (todo con IF NOT EXISTS).
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DDL = [
  ['20260903120000_insumo_precio_compra', `
    ALTER TABLE erp."Insumo"
      ADD COLUMN IF NOT EXISTS "precioCompra" DECIMAL(18, 4) NOT NULL DEFAULT 0
  `],
  ['20260903150000_config_sii_dimensiones', `
    ALTER TABLE erp."ConfigContableSii"
      ADD COLUMN IF NOT EXISTS "areaNegocioId" TEXT,
      ADD COLUMN IF NOT EXISTS "elementoCostoId" TEXT
  `],
];

const run = async () => {
  for (const [nombre, sql] of DDL) {
    await prisma.$executeRawUnsafe(sql);
    console.log(`OK ${nombre}`);
  }
};

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
