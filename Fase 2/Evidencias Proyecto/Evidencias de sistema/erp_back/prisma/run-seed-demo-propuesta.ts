import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedFlujoOperativoOcOv } from './seed-flujo-oc-ov-almahue';

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  try {
    await seedFlujoOperativoOcOv(prisma);
    console.log('\n✅ seed:demo-propuesta (flujo OC/OV Almahue) OK');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
