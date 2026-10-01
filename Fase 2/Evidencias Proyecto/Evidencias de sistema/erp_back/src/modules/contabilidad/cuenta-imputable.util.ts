import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';

/** Nueva imputación: la cuenta debe existir, estar activa y ser imputable (Agustín Reu6). */
export async function assertCuentaImputable(
  prisma: PrismaService,
  empresaId: string,
  cuentaId: string | null | undefined,
) {
  const id = cuentaId?.trim();
  if (!id) return;
  const row = await prisma.cuentaContable.findFirst({
    where: { id, empresaId },
    select: { codigo: true, activa: true, noImputable: true },
  });
  if (!row) {
    throw new BadRequestException('La cuenta contable no existe en la empresa');
  }
  if (!row.activa) {
    throw new BadRequestException(
      `La cuenta ${row.codigo} está deshabilitada. No se puede usar en movimientos nuevos.`,
    );
  }
  if (row.noImputable) {
    throw new BadRequestException(`La cuenta ${row.codigo} no es imputable`);
  }
}
