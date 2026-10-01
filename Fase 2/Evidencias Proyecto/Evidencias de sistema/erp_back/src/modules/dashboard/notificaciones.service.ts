import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type NotificacionInput = {
  userId: string;
  empresaId?: string | null;
  tipo: string;
  titulo: string;
  detalle?: string | null;
  href: string;
  refKey: string;
  monto?: number | null;
  /** Si true, deja leida=false al upsert (nueva actividad). */
  resetLeida?: boolean;
};

@Injectable()
export class NotificacionesService {
  constructor(private prisma: PrismaService) {}

  async upsert(input: NotificacionInput) {
    if (!input.userId) return null;
    const data = {
      empresaId: input.empresaId ?? null,
      tipo: input.tipo,
      titulo: input.titulo,
      detalle: input.detalle ?? null,
      href: input.href,
      monto:
        input.monto == null
          ? null
          : new Prisma.Decimal(input.monto),
      ...(input.resetLeida !== false ? { leida: false } : {}),
    };
    return this.prisma.notificacion.upsert({
      where: {
        userId_refKey: { userId: input.userId, refKey: input.refKey },
      },
      create: {
        userId: input.userId,
        refKey: input.refKey,
        ...data,
        leida: false,
      },
      update: data,
    });
  }

  async listForUser(userId: string, empresaId?: string) {
    const rows = await this.prisma.notificacion.findMany({
      where: {
        userId,
        ...(empresaId
          ? { OR: [{ empresaId }, { empresaId: null }] }
          : {}),
      },
      orderBy: [{ leida: 'asc' }, { createdAt: 'desc' }],
      take: 80,
    });
    const items = rows.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      titulo: r.titulo,
      detalle: r.detalle,
      href: r.href,
      monto: r.monto != null ? Number(r.monto) : null,
      leida: r.leida,
      refKey: r.refKey,
      fecha: r.createdAt.toISOString().slice(0, 10),
      createdAt: r.createdAt.toISOString(),
    }));
    const noLeidas = items.filter((i) => !i.leida).length;
    return { total: noLeidas, totalItems: items.length, items };
  }

  async setLeida(userId: string, id: string, leida: boolean) {
    const row = await this.prisma.notificacion.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Notificación no encontrada');
    const updated = await this.prisma.notificacion.update({
      where: { id },
      data: { leida },
    });
    return {
      id: updated.id,
      leida: updated.leida,
    };
  }

  /** Marca leídas todas las notificaciones con ese refKey (cualquier destinatario). */
  async setLeidaByRef(refKey: string, leida: boolean) {
    if (!refKey) return { count: 0 };
    const result = await this.prisma.notificacion.updateMany({
      where: { refKey },
      data: { leida },
    });
    return { count: result.count };
  }

  async markAllRead(userId: string) {
    await this.prisma.notificacion.updateMany({
      where: { userId, leida: false },
      data: { leida: true },
    });
    return { ok: true };
  }
}
