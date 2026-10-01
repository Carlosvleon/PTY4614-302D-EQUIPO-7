/**
 * Re-seed / import plan de cuentas (+ elementos/centros) desde JSON generados del Excel Agrosoft.
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register scripts/import-plan-cuentas.ts
 *   npx ts-node -r tsconfig-paths/register scripts/import-plan-cuentas.ts --empresa EMP-1
 *
 * Regenerar JSON desde Excel (Python + openpyxl) — ver README en
 * docs/.../fuentes/parametrizacion-2026-07-28/
 */
import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type PlanRow = {
  codigoExcel: string;
  codigo: string;
  nombre: string;
  nivel: number;
  tipo: 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'GASTO';
  requiereCc: boolean;
  requiereArea: boolean;
  requiereEspecie: boolean;
  requiereElemento: boolean;
  noImputable: boolean;
  padreCodigoExcel: string | null;
};

function loadJson<T>(name: string): T {
  const path = join(__dirname, '..', 'prisma', 'data', name);
  if (!existsSync(path)) throw new Error(`No existe ${path}`);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

async function importPlan(empresaId: string) {
  const rows = loadJson<PlanRow[]>('plan-cuentas-almahue.json');
  const existing = await prisma.cuentaContable.findMany({
    where: { empresaId },
    select: { id: true, nivel: true },
    orderBy: { nivel: 'desc' },
  });
  for (const r of existing) {
    await prisma.cuentaContable.delete({ where: { id: r.id } });
  }

  const sorted = [...rows].sort((a, b) => a.nivel - b.nivel || a.codigo.localeCompare(b.codigo));
  const idByExcel = new Map<string, string>();
  for (const r of sorted) {
    const padreId = r.padreCodigoExcel ? idByExcel.get(r.padreCodigoExcel) ?? null : null;
    const created = await prisma.cuentaContable.create({
      data: {
        codigo: r.codigo,
        codigoExcel: r.codigoExcel,
        nombre: r.nombre,
        tipo: r.tipo,
        nivel: r.nivel,
        padreId,
        requiereCc: r.requiereCc,
        requiereArea: r.requiereArea,
        requiereEspecie: r.requiereEspecie,
        requiereElemento: r.requiereElemento,
        noImputable: r.noImputable,
        activa: true,
        empresaId,
      },
    });
    idByExcel.set(r.codigoExcel, created.id);
  }
  console.log(`OK plan cuentas ${sorted.length} → ${empresaId}`);
}

async function main() {
  const empresaArg = process.argv.find((a) => a.startsWith('--empresa='));
  const empresaId = empresaArg?.split('=')[1] || 'EMP-1';
  await importPlan(empresaId);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
