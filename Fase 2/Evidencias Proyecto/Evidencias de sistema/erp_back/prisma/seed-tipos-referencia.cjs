/**
 * Runner CommonJS para prod (imagen API sin ts-node).
 * Misma fuente JSON que seed-tipos-referencia.ts.
 */
require('dotenv/config');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const MODULO_REFERENCIA = 'Referencia';

function loadItems() {
  const path = join(__dirname, 'data', 'tipos-referencia-agrosoft.json');
  if (!existsSync(path)) throw new Error(`Catálogo no encontrado: ${path}`);
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw new Error('tipos-referencia-agrosoft.json sin items');
  }
  return raw.items.map((it) => ({
    codigo: String(it.codigo).trim().toUpperCase(),
    nombre: String(it.nombre).trim(),
  }));
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const items = loadItems();
    for (const t of items) {
      await prisma.tipoDocumento.upsert({
        where: { codigo_modulo: { codigo: t.codigo, modulo: MODULO_REFERENCIA } },
        update: { nombre: t.nombre, activo: true },
        create: {
          id: `TD-REF-${t.codigo}`,
          codigo: t.codigo,
          nombre: t.nombre,
          modulo: MODULO_REFERENCIA,
          activo: true,
        },
      });
    }
    console.log(`  ${items.length} tipos de referencia Agrosoft (módulo ${MODULO_REFERENCIA})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
