import { DashboardService } from './dashboard.service';
import { NotificacionesService } from './notificaciones.service';
import {
  createPrismaMock,
  tenantUser,
} from '../../test-utils/prisma-mock';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: ReturnType<typeof createPrismaMock>['prisma'];
  let notificaciones: { listForUser: jest.Mock; upsert: jest.Mock };

  beforeEach(() => {
    const harness = createPrismaMock();
    prisma = harness.prisma;
    notificaciones = {
      listForUser: jest.fn().mockResolvedValue({ total: 0, totalItems: 0, items: [] }),
      upsert: jest.fn().mockResolvedValue(null),
    };
    service = new DashboardService(
      harness.mock,
      notificaciones as unknown as NotificacionesService,
    );
  });

  describe('getKpis', () => {
    it('retorna KPIs con OC pendientes, proformas y TC', async () => {
      prisma.aprobacionOc.count.mockResolvedValue(3);
      prisma.proformaContratista.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1);
      prisma.indicadorBc.findFirst.mockResolvedValue({
        id: 'bc1',
        fecha: new Date('2026-07-27'),
        usd: 972.5,
        eur: 1055,
        cny: 134.2,
        fuente: 'BCCh',
        completadoFeriado: false,
      });

      const kpis = await service.getKpis(
        tenantUser({
          permisos: [
            'compras:read',
            'contratistas:read',
            'contratistas:write',
            'catalogos:read',
          ],
        }),
        'EMP-1',
      );

      expect(prisma.aprobacionOc.count).toHaveBeenCalledWith({
        where: {
          empresaId: 'EMP-1',
          estado: 'PENDIENTE',
          OR: [{ aprobadorId: 'U-2' }, { aprobadorId: null }],
        },
      });
      expect(kpis.ocPorAprobar).toBe(3);
      expect(kpis.proformasSinFactura).toBe(2);
      expect(kpis.facturasPorRecibir).toBe(1);
      expect(kpis.tcUsdHoy).toBe(972.5);
      expect(kpis.tcCnyHoy).toBe(134.2);
      expect(kpis.tcEurHoy).toBe(1055);
      expect(kpis.tcUsdHoyFecha).toBe('2026-07-27');
    });

    it('admin ve pendientes de toda la empresa', async () => {
      prisma.aprobacionOc.count.mockResolvedValue(8);
      prisma.proformaContratista.count.mockResolvedValue(0);
      prisma.indicadorBc.findFirst.mockResolvedValue(null);

      await service.getKpis(
        tenantUser({ sub: 'U-1', rolId: 'ROL-1', permisos: ['*'] }),
        'EMP-1',
      );

      expect(prisma.aprobacionOc.count).toHaveBeenCalledWith({
        where: { empresaId: 'EMP-1', estado: 'PENDIENTE' },
      });
    });

    it('usa tcUsdHoy=0 si no hay indicador', async () => {
      prisma.aprobacionOc.count.mockResolvedValue(0);
      prisma.proformaContratista.count.mockResolvedValue(0);
      prisma.indicadorBc.findFirst.mockResolvedValue(null);

      const kpis = await service.getKpis(tenantUser(), 'EMP-1');
      expect(kpis.tcUsdHoy).toBe(0);
      expect(kpis.tcUsdHoyFecha).toBeNull();
      expect(kpis.facturasPorRecibir).toBe(0);
    });

    it('no consulta OC ni proformas si el rol no las ve', async () => {
      prisma.indicadorBc.findFirst.mockResolvedValue(null);
      const kpis = await service.getKpis(
        tenantUser({ permisos: ['comercial:read', 'catalogos:read'] }),
        'EMP-1',
      );
      expect(prisma.aprobacionOc.count).not.toHaveBeenCalled();
      expect(prisma.proformaContratista.count).not.toHaveBeenCalled();
      expect(kpis.ocPorAprobar).toBe(0);
      expect(kpis.proformasSinFactura).toBe(0);
    });
  });

  describe('getNotificacionesPendientes', () => {
    it('sincroniza pendientes y lista inbox', async () => {
      prisma.aprobacionOc.findMany.mockResolvedValue([
        {
          id: 'ap1',
          ocNumero: 'OC-1',
          proveedor: 'Prov',
          monto: 1000,
          solicitante: 'Ana',
          aprobadorId: 'u1',
        },
      ]);
      notificaciones.listForUser.mockResolvedValue({
        total: 1,
        totalItems: 1,
        items: [{ id: 'n1', leida: false, href: '/compras/aprobaciones?open=ap1' }],
      });

      const out = await service.getNotificacionesPendientes(
        tenantUser({ permisos: ['compras:read', 'contratistas:read'] }),
        'EMP-1',
      );
      expect(notificaciones.upsert).toHaveBeenCalled();
      expect(out.total).toBe(1);
      expect(out.items[0].href).toContain('open=');
    });
  });

  describe('getTendencia', () => {
    it('devuelve 6 meses con valor agregado de asientos', async () => {
      prisma.asiento.aggregate.mockResolvedValue({ _sum: { debe: 2_000_000 } });

      const tendencia = await service.getTendencia(
        tenantUser({ permisos: ['contabilidad:read'] }),
        'EMP-1',
      );

      expect(tendencia).toHaveLength(6);
      expect(tendencia[0]).toEqual(
        expect.objectContaining({ mes: expect.any(String), valor: expect.any(Number) }),
      );
    });
  });
});
