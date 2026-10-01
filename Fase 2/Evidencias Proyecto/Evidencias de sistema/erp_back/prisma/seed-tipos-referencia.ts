/**
 * Catálogo Agrosoft «Tipos de referencias» (57 códigos).
 * Idempotente: upsert por (codigo, modulo=Referencia). No borra alias de otros módulos.
 *
 *   npm run seed:tipos-referencia
 *   (también lo llama prisma/seed.ts)
 */
import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export const MODULO_REFERENCIA = 'Referencia';

export type TipoReferenciaItem = { codigo: string; nombre: string };

type CatalogoJson = {
  fuente?: string;
  items: TipoReferenciaItem[];
};

export function loadTiposReferenciaAgrosoft(): TipoReferenciaItem[] {
  const path = join(__dirname, 'data', 'tipos-referencia-agrosoft.json');
  if (!existsSync(path)) {
    throw new Error(`Catálogo no encontrado: ${path}`);
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as CatalogoJson;
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw new Error('tipos-referencia-agrosoft.json sin items');
  }
  return raw.items.map((it) => ({
    codigo: String(it.codigo).trim().toUpperCase(),
    nombre: String(it.nombre).trim(),
  }));
}

export async function seedTiposReferenciaAgrosoft(
  prisma: PrismaClient,
): Promise<number> {
  const items = loadTiposReferenciaAgrosoft();
  for (const t of items) {
    const id = `TD-REF-${t.codigo}`;
    await prisma.tipoDocumento.upsert({
      where: { codigo_modulo: { codigo: t.codigo, modulo: MODULO_REFERENCIA } },
      update: { nombre: t.nombre, activo: true },
      create: {
        id,
        codigo: t.codigo,
        nombre: t.nombre,
        modulo: MODULO_REFERENCIA,
        activo: true,
      },
    });
  }
  return items.length;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  try {
    const n = await seedTiposReferenciaAgrosoft(prisma);
    console.log(`  ${n} tipos de referencia Agrosoft (módulo ${MODULO_REFERENCIA})`);
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
