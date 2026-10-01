import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CatalogosService } from './catalogos.service';
import {
  createPrismaMock,
  tenantUser,
} from '../../test-utils/prisma-mock';

describe('CatalogosService', () => {
  let service: CatalogosService;
  let prisma: ReturnType<typeof createPrismaMock>['prisma'];

  beforeEach(() => {
    const harness = createPrismaMock();
    prisma = harness.prisma;
    service = new CatalogosService(harness.mock);
  });

  describe('createMoneda', () => {
    it('crea moneda (happy path)', async () => {
      prisma.moneda.create.mockResolvedValue({
        id: 'm1',
        codigo: 'CLP',
        nombre: 'Peso chileno',
        simbolo: '$',
        activa: true,
        focoReporteria: true,
      });

      const result = await service.createMoneda({
        codigo: 'clp',
        nombre: 'Peso chileno',
        simbolo: '$',
      });

      expect(result.codigo).toBe('CLP');
      expect(prisma.moneda.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ codigo: 'CLP', focoReporteria: true }),
        }),
      );
    });

    it('lanza ConflictException ante código duplicado', async () => {
      prisma.moneda.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.createMoneda({ codigo: 'CLP', nombre: 'X', simbolo: '$' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('createCentroCosto', () => {
    it('crea CC en empresa del tenant', async () => {
      prisma.centroCosto.count.mockResolvedValue(1);
      prisma.centroCosto.create.mockResolvedValue({
        id: 'CC-EMP-1-2',
        codigo: '10100',
        nombre: 'PACKING',
        empresaId: 'EMP-1',
        activa: true,
        contactoEncargado: null,
        vigenciaDesde: new Date('2026-09-24'),
        vigenciaHasta: null,
        createdAt: new Date('2026-09-24T12:00:00Z'),
        empresa: { razonSocial: 'Almahue SpA' },
      });

      const result = await service.createCentroCosto(
        tenantUser(),
        { codigo: '10100', nombre: 'Packing' },
        'EMP-1',
      );

      expect(result.id).toBe('CC-EMP-1-2');
      expect(result.empresaNombre).toBe('Almahue SpA');
      expect(result.nombre).toBe('PACKING');
      expect(prisma.centroCosto.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ codigo: '10100', nombre: 'PACKING' }),
        }),
      );
    });

    it('rechaza código con letras en alta', async () => {
      await expect(
        service.createCentroCosto(
          tenantUser(),
          { codigo: 'ADM', nombre: 'Administración' },
          'EMP-1',
        ),
      ).rejects.toMatchObject({ message: expect.stringMatching(/dígitos/i) });
      expect(prisma.centroCosto.create).not.toHaveBeenCalled();
    });

    it('lanza ConflictException ante código duplicado', async () => {
      prisma.centroCosto.count.mockResolvedValue(0);
      prisma.centroCosto.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.createCentroCosto(
          tenantUser(),
          { codigo: '10100', nombre: 'Admin' },
          'EMP-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('bloquea update CC de otra empresa', async () => {
      prisma.centroCosto.findUnique.mockResolvedValue({
        id: 'CC-EMP-2-1',
        empresaId: 'EMP-2',
      });

      await expect(
        service.updateCentroCosto(tenantUser({ empresaId: 'EMP-1' }), 'CC-EMP-2-1', {
          codigo: 'LOG',
          nombre: 'Logística',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rechaza update que intenta cambiar el código', async () => {
      prisma.centroCosto.findUnique.mockResolvedValue({
        id: 'CC-1',
        empresaId: 'EMP-1',
        codigo: 'ADM',
        nombre: 'ADMINISTRACIÓN',
        activa: true,
      });
      await expect(
        service.updateCentroCosto(tenantUser(), 'CC-1', {
          codigo: '999',
          nombre: 'Administración',
        }),
      ).rejects.toMatchObject({ message: expect.stringMatching(/no se puede modificar/i) });
      expect(prisma.centroCosto.update).not.toHaveBeenCalled();
    });
  });

  describe('getSyncBcMeta', () => {
    it('crea singleton default si no existe', async () => {
      prisma.syncBcMeta.findUnique.mockResolvedValue(null);
      prisma.syncBcMeta.create.mockResolvedValue({
        id: 'default',
        lastSync: null,
        autoSync: false,
        horaProgramada: '09:00',
      });

      const meta = await service.getSyncBcMeta();
      expect(meta.modo).toBe('manual');
      expect(meta.horaProgramada).toBe('09:00');
    });
  });

  describe('import excel centros', () => {
    it('exige archivo en preview', async () => {
      await expect(
        service.previewCentrosCostoExcel(tenantUser(), undefined, 'EMP-1'),
      ).rejects.toThrow(/xlsx/);
    });

    it('registra CatalogoImportacion al confirmar', async () => {
      prisma.centroCosto.findMany.mockResolvedValue([]);
      prisma.centroCosto.create.mockResolvedValue({ id: 'CC1' });
      prisma.catalogoImportacion.create.mockResolvedValue({ id: 'IMP-1' });
      prisma.usuario.findUnique.mockResolvedValue({ nombre: 'Admin' });
      const result = await service.importCentrosCostoExcel(
        tenantUser(),
        {
          items: [{ codigo: '10100', nombre: 'Administración' }],
          archivoNombre: 'cc.xls',
        },
        'EMP-1',
      );
      expect(result.created).toBe(1);
      expect(prisma.catalogoImportacion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tipo: 'CENTROS_COSTO',
            archivoNombre: 'cc.xls',
            created: 1,
          }),
        }),
      );
    });
  });

  describe('listCatalogoImportaciones', () => {
    it('filtra por tenant y tipo', async () => {
      prisma.catalogoImportacion.findMany.mockResolvedValue([
        {
          id: 'IMP-1',
          tipo: 'PLAN_CUENTAS',
          archivoNombre: 'plan.xlsx',
          created: 2,
          updated: 1,
          unchanged: 0,
          politicas: { actualizarAnidacion: false },
          resumen: [{ codigo: '1-1-01-01', cambios: ['Nombre: A → B'] }],
          usuarioEmail: 'user@almahue.local',
          usuarioNombre: 'Usuario',
          createdAt: new Date('2026-08-26T12:00:00Z'),
        },
      ]);
      const rows = await service.listCatalogoImportaciones(tenantUser(), 'PLAN_CUENTAS', 'EMP-1');
      expect(prisma.catalogoImportacion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { empresaId: 'EMP-1', tipo: 'PLAN_CUENTAS' },
        }),
      );
      expect(rows[0].archivoNombre).toBe('plan.xlsx');
      expect(rows[0].updated).toBe(1);
    });
  });

  describe('codigos financieros', () => {
    it('crea código por tenant y rechaza duplicado', async () => {
      prisma.codigoFinanciero.create.mockResolvedValue({
        id: 'CF-1',
        codigo: '20100',
        nombre: 'PAGO A PROVEEDORES',
        activa: true,
        empresaId: 'EMP-1',
        createdAt: new Date('2026-09-24T12:00:00Z'),
      });
      const row = await service.createCodigoFinanciero(
        tenantUser({ permisos: ['catalogos:write'] }),
        { codigo: '20100', nombre: 'Pago a proveedores' },
        'EMP-1',
      );
      expect(row.codigo).toBe('20100');
      expect(row.nombre).toBe('PAGO A PROVEEDORES');
      expect(prisma.codigoFinanciero.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            codigo: '20100',
            nombre: 'PAGO A PROVEEDORES',
            empresaId: 'EMP-1',
          }),
        }),
      );

      prisma.codigoFinanciero.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '6.0.0',
        }),
      );
      await expect(
        service.createCodigoFinanciero(
          tenantUser({ permisos: ['catalogos:write'] }),
          { codigo: '20100', nombre: 'Otro' },
          'EMP-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rechaza código con letras en alta', async () => {
      await expect(
        service.createCodigoFinanciero(
          tenantUser({ permisos: ['catalogos:write'] }),
          { codigo: 'PAGO-PROV', nombre: 'Pago' },
          'EMP-1',
        ),
      ).rejects.toMatchObject({ message: expect.stringMatching(/dígitos/i) });
    });

    it('rechaza update que intenta cambiar el código', async () => {
      prisma.codigoFinanciero.findUnique.mockResolvedValue({
        id: 'CF-1',
        empresaId: 'EMP-1',
        codigo: 'PAGO-PROV',
        nombre: 'PAGO A PROVEEDORES',
        activa: true,
      });
      await expect(
        service.updateCodigoFinanciero(tenantUser({ permisos: ['catalogos:write'] }), 'CF-1', {
          codigo: '999',
          nombre: 'Otro',
        }),
      ).rejects.toMatchObject({ message: expect.stringMatching(/no se puede modificar/i) });
    });

    it('lista solo activos si el usuario no tiene catalogos:read', async () => {
      prisma.codigoFinanciero.findMany.mockResolvedValue([]);
      await service.getCodigosFinancieros(
        tenantUser({ permisos: ['tesoreria:read'] }),
        'EMP-1',
      );
      expect(prisma.codigoFinanciero.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { empresaId: 'EMP-1', activa: true },
        }),
      );
    });
  });

  describe('createProveedor', () => {
    it('acepta 45 días y persiste condicionIvaDia y monedaPago', async () => {
      const created = {
        id: 'PROV-1',
        rut: '76.000.000-0',
        razonSocial: 'Prov Test',
        giro: null,
        contacto: null,
        email: null,
        telefono: null,
        activo: true,
        empresaId: 'EMP-1',
        esProductor: false,
        condicionPagoDias: 45,
        condicionIvaDia: 12,
        monedaPago: 'USD',
        solicitadoPor: null,
        solicitadoNota: null,
      };
      prisma.proveedor.create.mockResolvedValue(created);
      prisma.contratista.findMany.mockResolvedValue([]);
      prisma.usuario.findUnique.mockResolvedValue({ nombre: 'Admin' });
      prisma.proveedor.findFirst.mockResolvedValue({
        ...created,
        cuentasBancarias: [],
        contactosFicha: [],
        direcciones: [],
        cambios: [],
      });
      prisma.proveedorCambio.create.mockResolvedValue({ id: 'CHG-1' });

      const result = await service.createProveedor(
        tenantUser(),
        {
          rut: '76.000.000-0',
          razonSocial: 'Prov Test',
          condicionPagoDias: 45,
          condicionIvaDia: 12,
          monedaPago: 'usd',
        },
        'EMP-1',
      );

      expect(prisma.proveedor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            condicionPagoDias: 45,
            condicionIvaDia: 12,
            monedaPago: 'USD',
          }),
        }),
      );
      expect(result.condicionPagoDias).toBe(45);
      expect(result.condicionIvaDia).toBe(12);
      expect(result.monedaPago).toBe('USD');
    });
  });
});
