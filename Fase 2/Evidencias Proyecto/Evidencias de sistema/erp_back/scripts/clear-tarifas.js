require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  try {
    const n = await prisma.$executeRawUnsafe('DELETE FROM erp."TarifaContratista"');
    console.log('Tarifas borradas:', n);
  } catch (e) {
    console.log('Skip delete (tabla puede no existir aún):', e.message);
  }
}

main().finally(() => prisma.$disconnect());
