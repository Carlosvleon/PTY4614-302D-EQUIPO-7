import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { PrismaService } from '../prisma/prisma.service';

export async function assertClaveReversa(
  prisma: PrismaService,
  userId: string,
  clave: string,
): Promise<void> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: userId },
    select: { activo: true, claveReversaHash: true },
  });
  if (!usuario?.activo || !usuario.claveReversaHash) {
    throw new BadRequestException(
      'Debes registrar tu clave de reversa en Mi Perfil antes de usar esta acción',
    );
  }
  const ok = await bcrypt.compare(clave.trim(), usuario.claveReversaHash);
  if (!ok) {
    throw new BadRequestException('Clave de reversa incorrecta');
  }
}
