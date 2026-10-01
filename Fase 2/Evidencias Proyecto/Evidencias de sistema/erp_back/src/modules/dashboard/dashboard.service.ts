import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { userHasPermission } from '../../auth/permission.util';
import type { JwtPayload } from '../../auth/jwt.strategy';
import { resolveOperationalEmpresa } from '../../auth/tenant.util';
import { NotificacionesService } from './notificaciones.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private notificaciones: NotificacionesService,
  ) {}

  private can(user: JwtPayload, permission: string) {
    return user.permisos.includes('*') || userHasPermission(user.permisos, permission);
  }

  private canAprobarAll(user: JwtPayload) {
    return (
      user.permisos.includes('*')
      || user.permisos.includes('compras:aprobar-all')
      || user.permisos.includes('admin:write')
    );
  }

  /** Superadmin: pendientes de la empresa. Resto: asignados a mí (o sin asignar). */
  private ocPendientesWhere(user: JwtPayload, empresaId: string) {
    if (this.canAprobarAll(user)) {
      return { empresaId, estado: 'PENDIENTE' as const };
    }
    return {
      empresaId,
      estado: 'PENDIENTE' as const,
      OR: [{ aprobadorId: user.sub }, { aprobadorId: null }],
    };
  }

  async getKpis(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);

    const canCompras = this.can(user, 'compras:read');
    const canContratistas = this.can(user, 'contratistas:read');

    const [ocPorAprobar, proformasSinFactura, facturasPorRecibir, indicador] = await Promise.all([
      canCompras
        ? this.prisma.aprobacionOc.count({
            where: this.ocPendientesWhere(user, empresaId),
          })
        : Promise.resolve(0),
      canContratistas
        ? this.prisma.proformaContratista.count({
            where: {
              empresaId,
              estado: { in: ['BORRADOR', 'DEFINITIVA'] },
            },
          })
        : Promise.resolve(0),
      canContratistas
        ? this.prisma.proformaContratista.count({
            where: { empresaId, estado: 'DEFINITIVA' },
          })
        : Promise.resolve(0),
      (() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return this.prisma.indicadorBc.findFirst({
          where: {
            empresaId: null,
            fecha: { lte: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) },
          },
          orderBy: { fecha: 'desc' },
        });
      })(),
    ]);

    return {
      ocPorAprobar,
      proformasSinFactura,
      facturasPorRecibir,
      tcUsdHoy: indicador ? Number(indicador.usd) : 0,
      tcCnyHoy: indicador ? Number(indicador.cny) : 0,
      tcEurHoy: indicador ? Number(indicador.eur) : 0,
      tcUsdHoyFecha: indicador?.fecha
        ? new Date(indicador.fecha).toISOString().slice(0, 10)
        : null,
    };
  }

  /** Inbox persistente + sync de pendientes de aprobación. */
  async getNotificacionesPendientes(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    await this.syncPendientesAprobacion(user, empresaId);
    return this.notificaciones.listForUser(user.sub, empresaId);
  }

  private async syncPendientesAprobacion(user: JwtPayload, empresaId: string) {
    const canCompras = this.can(user, 'compras:read');

    const ocWhere = this.ocPendientesWhere(user, empresaId);

    const ocs = canCompras
      ? await this.prisma.aprobacionOc.findMany({
          where: ocWhere,
          orderBy: { fecha: 'desc' },
          take: 30,
          select: {
            id: true,
            ocNumero: true,
            proveedor: true,
            monto: true,
            solicitante: true,
            aprobadorId: true,
          },
        })
      : [];

    await Promise.all([
      ...ocs.map((o) =>
        this.notificaciones.upsert({
          userId: o.aprobadorId || user.sub,
          empresaId,
          tipo: 'OC_PENDIENTE',
          titulo: `OC ${o.ocNumero} pendiente`,
          detalle: `${o.proveedor} · ${o.solicitante}`,
          href: `/compras/aprobaciones?open=${encodeURIComponent(o.id)}`,
          refKey: `oc-pend:${o.id}`,
          monto: Number(o.monto),
          resetLeida: false,
        }),
      ),
    ]);
  }

  async getTendencia(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    if (!this.can(user, 'contabilidad:read') && !this.can(user, 'reportes:read')) {
      return [];
    }
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const now = new Date();
    const puntos: { mes: string; valor: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const periodo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const asientos = await this.prisma.asiento.aggregate({
        where: { empresaId, periodo, estado: { not: 'ANULADO' } },
        _sum: { debe: true },
      });
      puntos.push({
        mes: meses[d.getMonth()],
        valor: Math.round(Number(asientos._sum.debe ?? 0) / 1_000_000),
      });
    }
    return puntos;
  }
}
