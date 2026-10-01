/**
 * @deprecated Usar seedFlujoOperativoOcOv desde seed-flujo-oc-ov-almahue.ts
 * Mantenido para imports legacy.
 */
import type { PrismaClient } from '@prisma/client';
import { seedFlujoOperativoOcOv } from './seed-flujo-oc-ov-almahue';

export async function seedDemoPropuestaComercial(prisma: PrismaClient) {
  await seedFlujoOperativoOcOv(prisma);
}
