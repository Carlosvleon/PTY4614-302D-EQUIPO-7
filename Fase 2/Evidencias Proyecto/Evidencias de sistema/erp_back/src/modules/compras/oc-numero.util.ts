import type { PrismaClient } from '@prisma/client';

type OcNumeroDb = {
  ordenCompra: {
    findMany: (args: {
      where: { empresaId: string; numero: { startsWith: string } };
      select: { numero: true };
    }) => Promise<{ numero: string }[]>;
  };
};

/** Correlativo OC-AAAA-NNNN. Si `requested` viene informado, se respeta. */
export async function allocateOcNumero(
  db: OcNumeroDb | PrismaClient,
  empresaId: string,
  requested?: string,
): Promise<string> {
  const trimmed = requested?.trim() ?? '';
  if (trimmed) return trimmed;
  const year = new Date().getFullYear();
  const prefix = `OC-${year}-`;
  const rows = await db.ordenCompra.findMany({
    where: { empresaId, numero: { startsWith: prefix } },
    select: { numero: true },
  });
  let max = 0;
  for (const r of rows) {
    const n = Number(r.numero.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}
