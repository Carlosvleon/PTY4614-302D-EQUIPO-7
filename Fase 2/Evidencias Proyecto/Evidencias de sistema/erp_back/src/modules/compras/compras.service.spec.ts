import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ComprasService, MOTIVO_RECHAZO_REQUIRED_MSG } from './compras.service';
import { createPrismaMock, tenantUser } from '../../test-utils/prisma-mock';

describe('ComprasService', () => {
  let service: ComprasService;
  let prisma: ReturnType<typeof createPrismaMock>['prisma'];

  beforeEach(() => {
    const harness = createPrismaMock();
    prisma = harness.prisma;
    prisma.delegacionAprobacion.findMany.mockResolvedValue([]);
    prisma.grupoAprobacion.findMany.mockResolvedValue([]);
    prisma.nodoEscalaAprobacion.findMany.mockResolvedValue([]);
    prisma.usuario.findMany.mockResolvedValue([]);
    prisma.registroCompra.aggregate.mockResolvedValue({ _sum: { monto: 0 } });
    service = new ComprasService(harness.mock);
  });

  it('crea OC en borrador sin bandeja ni cadena', async () => {
    const oc = {
      id: 'OC-1',
      numero: 'OC-100',
      fecha: new Date('2026-07-01'),
      proveedor: 'Prov',
      solicitante: 'Ana',
      moneda: 'CLP',
      neto: 1000,
      afacto: 'AFECTO',
      estado: 'BORRADOR',
      departamento: 'Compras',
      distribucionCc: null,
      empresaId: 'EMP-1',
    };
    prisma.proveedor.findFirst.mockResolvedValue({
      id: 'PROV-1',
      razonSocial: 'Prov',
      empresaId: 'EMP-1',
    });
    prisma.usuario.findUnique.mockResolvedValue({ id: 'U-2', nombre: 'User' });
    prisma.ordenCompra.create.mockResolvedValue({
      ...oc,
      creadoPorId: 'U-2',
      creadoPorNombre: 'User',
    });

    const result = await service.createOrden(
      tenantUser({ permisos: ['compras:write'] }),
      {
        numero: 'OC-100',
        fecha: '2026-07-01',
        proveedor: 'Prov',
        solicitante: 'Ana',
        moneda: 'CLP',
        neto: 1000,
        afacto: 'AFECTO',
        estado: 'BORRADOR',
        departamento: 'Compras',
      },
      'EMP-1',
    );

    expect(result.numero).toBe('OC-100');
    expect(result.estado).toBe('BORRADOR');
    expect(prisma.proveedor.findFirst).toHaveBeenCalled();
    expect(prisma.aprobacionOc.create).not.toHaveBeenCalled();
    expect(prisma.grupoAprobacion.findMany).not.toHaveBeenCalled();
  });

  it('al emitir OC con cadena queda PENDIENTE_APROBACION y bandeja', async () => {
    const oc = {
      id: 'OC-1',
      numero: 'OC-100',
      fecha: new Date('2026-07-01'),
      proveedor: 'Prov',
      solicitante: 'Ana',
      moneda: 'CLP',
      neto: 1000,
      afacto: 'AFECTO',
      estado: 'PENDIENTE_APROBACION',
      departamento: 'Compras',
      distribucionCc: null,
      empresaId: 'EMP-1',
    };
    prisma.proveedor.findFirst.mockResolvedValue({
      id: 'PROV-1',
      razonSocial: 'Prov',
      empresaId: 'EMP-1',
    });
    prisma.workflowConfig.findMany.mockResolvedValue([
      {
        montoMin: 0,
        montoMax: 999999999,
        aprobadorIds: ['U-JEFE'],
        activo: true,
        modulo: 'Compras',
      },
    ]);
    prisma.usuario.findUnique.mockResolvedValue({ id: 'U-2', nombre: 'User' });
    prisma.usuario.findMany.mockResolvedValue([
      { id: 'U-2', nombre: 'Ana', jefeId: 'U-JEFE', montoMaxAprobacion: null, activo: true },
      { id: 'U-JEFE', nombre: 'Jefe', jefeId: null, montoMaxAprobacion: 5_000_000, activo: true },
    ]);
    prisma.ordenCompra.create.mockResolvedValue({
      ...oc,
      creadoPorId: 'U-2',
      creadoPorNombre: 'User',
    });
    prisma.aprobacionOc.create.mockResolvedValue({});
    prisma.aprobacionOc.findFirst.mockResolvedValue({ id: 'AP-1' });

    const result = await service.createOrden(
      tenantUser({ sub: 'U-2', permisos: ['compras:write'] }),
      {
        numero: 'OC-100',
        fecha: '2026-07-01',
        proveedor: 'Prov',
        solicitante: 'Ana',
        moneda: 'CLP',
        neto: 1000,
        afacto: 'AFECTO',
        estado: 'EMITIDO',
        departamento: 'Compras',
      },
      'EMP-1',
    );

    expect(result.estado).toBe('PENDIENTE_APROBACION');
    expect(prisma.ordenCompra.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: 'PENDIENTE_APROBACION' }),
      }),
    );
    expect(prisma.aprobacionOc.create).toHaveBeenCalled();
  });

  it('updateOrden lanza NotFound si no existe', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue(null);
    await expect(
      service.updateOrden(tenantUser(), 'x', {
        numero: 'OC-1',
        fecha: '2026-07-01',
        proveedor: 'P',
        solicitante: 'S',
        moneda: 'CLP',
        neto: 1,
        afacto: 'AFECTO',
        estado: 'APROBADO',
        departamento: 'D',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza OC si no hay cadena de aprobación (sin jefe configurado)', async () => {
    prisma.proveedor.findFirst.mockResolvedValue({
      id: 'PROV-1',
      razonSocial: 'Prov',
      empresaId: 'EMP-1',
    });
    prisma.workflowConfig.findMany.mockResolvedValue([
      {
        montoMin: 0,
        montoMax: 999999999,
        aprobadorIds: ['U-JEFE'],
        activo: true,
        modulo: 'Compras',
      },
    ]);
    prisma.usuario.findUnique.mockResolvedValue({ id: 'U-2', nombre: 'Ana' });
    prisma.usuario.findMany.mockResolvedValue([
      { id: 'U-2', nombre: 'Ana', jefeId: null, montoMaxAprobacion: null, activo: true },
    ]);
    await expect(
      service.createOrden(
        tenantUser({ sub: 'U-2', permisos: ['compras:write'] }),
        {
          numero: 'OC-X',
          fecha: '2026-07-01',
          proveedor: 'Prov',
          solicitante: 'Ana',
          moneda: 'CLP',
          neto: 1000,
          afacto: 'AFECTO',
          estado: 'PENDIENTE_APROBACION',
          departamento: 'Compras',
        },
        'EMP-1',
      ),
    ).rejects.toThrow(/cadena de aprobación/);
  });

  it('asigna jefe automático desde organigrama', async () => {
    prisma.proveedor.findFirst.mockResolvedValue({
      id: 'PROV-1',
      razonSocial: 'Prov',
      empresaId: 'EMP-1',
    });
    prisma.workflowConfig.findMany.mockResolvedValue([
      {
        montoMin: 0,
        montoMax: 999999999,
        aprobadorIds: ['U-JEFE'],
        activo: true,
        modulo: 'Compras',
      },
    ]);
    prisma.usuario.findUnique.mockResolvedValue({ id: 'U-2', nombre: 'Ana' });
    prisma.usuario.findMany.mockResolvedValue([
      { id: 'U-2', nombre: 'Ana', jefeId: 'U-JEFE', montoMaxAprobacion: null, activo: true },
      { id: 'U-JEFE', nombre: 'Jefe', jefeId: null, montoMaxAprobacion: 5_000_000, activo: true },
    ]);
    const oc = {
      id: 'OC-1',
      numero: 'OC-Y',
      fecha: new Date('2026-07-01'),
      proveedor: 'Prov',
      solicitante: 'Ana',
      moneda: 'CLP',
      neto: 1000,
      afacto: 'AFECTO',
      estado: 'PENDIENTE_APROBACION',
      departamento: 'Compras',
      distribucionCc: null,
      empresaId: 'EMP-1',
      aprobadorId: 'U-JEFE',
      aprobadorNombre: 'Jefe',
    };
    prisma.ordenCompra.create.mockResolvedValue({
      ...oc,
      creadoPorId: 'U-2',
      creadoPorNombre: 'Ana',
    });
    prisma.aprobacionOc.create.mockResolvedValue({});
    prisma.aprobacionOc.findFirst.mockResolvedValue({ id: 'AP-1' });

    await service.createOrden(
      tenantUser({ sub: 'U-2', permisos: ['compras:write'] }),
      {
        numero: 'OC-Y',
        fecha: '2026-07-01',
        proveedor: 'Prov',
        solicitante: 'Ana',
        moneda: 'CLP',
        neto: 1000,
        afacto: 'AFECTO',
        estado: 'PENDIENTE_APROBACION',
        departamento: 'Compras',
      },
      'EMP-1',
    );

    expect(prisma.ordenCompra.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aprobadorId: 'U-JEFE',
          aprobadorNombre: 'Jefe',
        }),
      }),
    );
  });

  describe('R4-05 createRegistro OC elegible', () => {
    const baseDto = {
      ocNumero: 'OC-100',
      factura: 'F-1',
      proveedorOc: 'Prov',
      proveedorFactura: 'Prov',
      monto: 1000,
      estado: 'BORRADOR',
    };

    function mockOc(estado: string) {
      prisma.ordenCompra.findFirst.mockResolvedValue({
        id: 'OC-1',
        numero: 'OC-100',
        estado,
        afacto: 'AFECTO',
        proveedorId: null,
        lineas: null,
        neto: 1000,
        empresaId: 'EMP-1',
      });
    }

    function mockCreate() {
      prisma.proveedor.findFirst.mockResolvedValue(null);
      prisma.registroCompra.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ id: 'RC-1', ...data }),
      );
    }

    it('acepta asociar factura a OC APROBADO', async () => {
      mockOc('APROBADO');
      mockCreate();
      const row = await service.createRegistro(
        tenantUser({ permisos: ['compras:write'] }),
        baseDto,
        'EMP-1',
      );
      expect(row.factura).toBe('F-1');
      expect(row.ocNoAprobada).toBe(false);
      expect(prisma.registroCompra.create).toHaveBeenCalled();
    });

    it('acepta asociar factura a OC BORRADOR', async () => {
      mockOc('BORRADOR');
      mockCreate();
      const row = await service.createRegistro(
        tenantUser({ permisos: ['compras:write'] }),
        baseDto,
        'EMP-1',
      );
      expect(row.factura).toBe('F-1');
      expect(row.ocNoAprobada).toBe(true);
      expect(prisma.registroCompra.create).toHaveBeenCalled();
    });

    it('acepta OC RECEPCIONADA', async () => {
      mockOc('RECEPCIONADA');
      mockCreate();
      const row = await service.createRegistro(
        tenantUser({ permisos: ['compras:write'] }),
        baseDto,
        'EMP-1',
      );
      expect(row.factura).toBe('F-1');
      expect(prisma.registroCompra.create).toHaveBeenCalled();
    });

    it('rechaza createRegistro CONTABILIZADA con OC BORRADOR', async () => {
      mockOc('BORRADOR');
      await expect(
        service.createRegistro(
          tenantUser({ permisos: ['compras:write'] }),
          { ...baseDto, estado: 'CONTABILIZADA' },
          'EMP-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.registroCompra.create).not.toHaveBeenCalled();
    });

    it('acepta createRegistro CONTABILIZADA con OC APROBADO (sin asiento si no hay contabilizar)', async () => {
      mockOc('APROBADO');
      mockCreate();
      const row = await service.createRegistro(
        tenantUser({ permisos: ['compras:write'] }),
        { ...baseDto, estado: 'CONTABILIZADA' },
        'EMP-1',
      );
      expect(row.estado).toBe('CONTABILIZADA');
      expect(prisma.registroCompra.create).toHaveBeenCalled();
    });

    it('P0-1 createRegistro CONTABILIZADA manda cuentaId imputable (SII padre se ignora)', async () => {
      const createAsiento = jest.fn().mockResolvedValue({ id: 'ASI-1', numero: '20260099' });
      service = new ComprasService(prisma as never, { createAsiento } as never);
      mockOc('APROBADO');
      mockCreate();
      prisma.configContableSii.findMany.mockResolvedValue([]);
      prisma.configContableSii.findFirst.mockResolvedValue({
        cuentaContableId: 'CTA-PADRE-PROV',
      });
      prisma.cuentaContable.findFirst
        .mockResolvedValueOnce({ id: 'CTA-GASTO' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'CTA-PROV-HOJA' });

      const row = await service.createRegistro(
        tenantUser({ permisos: ['compras:write'] }),
        { ...baseDto, estado: 'CONTABILIZADA' },
        'EMP-1',
      );

      expect(row.estado).toBe('CONTABILIZADA');
      expect(prisma.registroCompra.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ asientoId: 'ASI-1', asientoNumero: '20260099' }),
        }),
      );
      expect(createAsiento).toHaveBeenCalledWith(
        expect.objectContaining({
          origen: 'COMPRA:F-1',
          lineas: [
            expect.objectContaining({ debe: 1000, haber: 0, cuentaId: 'CTA-GASTO' }),
            expect.objectContaining({ debe: 0, haber: 1000, cuentaId: 'CTA-PROV-HOJA' }),
          ],
        }),
      );
      expect(createAsiento.mock.calls[0][0].lineas.every((l: { cuentaId?: string }) => l.cuentaId)).toBe(
        true,
      );
    });

    it('P0-1 usa cuenta de la OC si es imputable', async () => {
      const createAsiento = jest.fn().mockResolvedValue({ id: 'ASI-2', numero: '20260100' });
      service = new ComprasService(prisma as never, { createAsiento } as never);
      prisma.ordenCompra.findFirst.mockResolvedValue({
        id: 'OC-1',
        numero: 'OC-100',
        estado: 'APROBADO',
        afacto: 'AFECTO',
        proveedorId: null,
        lineas: null,
        neto: 1000,
        empresaId: 'EMP-1',
        cuentaContableId: 'CTA-OC',
        centroCostoId: 'CC-1',
      });
      mockCreate();
      prisma.configContableSii.findFirst.mockResolvedValue({
        cuentaContableId: 'CTA-PROV',
      });
      prisma.cuentaContable.findFirst
        .mockResolvedValueOnce({ id: 'CTA-OC', codigo: '5-1-01', activa: true, noImputable: false })
        .mockResolvedValueOnce({ id: 'CTA-PROV' });

      await service.createRegistro(
        tenantUser({ permisos: ['compras:write'] }),
        { ...baseDto, estado: 'CONTABILIZADA' },
        'EMP-1',
      );

      expect(createAsiento).toHaveBeenCalledWith(
        expect.objectContaining({
          lineas: [
            expect.objectContaining({
              cuentaId: 'CTA-OC',
              centroCostoId: 'CC-1',
              glosa: 'Gasto/compra',
            }),
            expect.objectContaining({ cuentaId: 'CTA-PROV', glosa: 'Proveedores' }),
          ],
        }),
      );
    });

    it('P0-1 updateRegistro a CONTABILIZADA no crea asiento sin cuentaId', async () => {
      const createAsiento = jest.fn().mockResolvedValue({ id: 'ASI-3', numero: '20260101' });
      service = new ComprasService(prisma as never, { createAsiento } as never);
      prisma.registroCompra.findUnique.mockResolvedValue({
        id: 'RC-1',
        ocId: 'OC-1',
        ocNumero: 'OC-100',
        factura: 'F-1',
        proveedorOc: 'Prov',
        proveedorFactura: 'Prov',
        proveedorId: null,
        monto: 1000,
        afactoOc: 'AFECTO',
        afactoFactura: 'AFECTO',
        afactoOk: true,
        estado: 'BORRADOR',
        asientoId: null,
        asientoNumero: null,
        lineas: null,
        empresaId: 'EMP-1',
      });
      prisma.ordenCompra.findFirst.mockResolvedValue({
        id: 'OC-1',
        numero: 'OC-100',
        estado: 'APROBADO',
        empresaId: 'EMP-1',
      });
      prisma.registroCompra.update.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'RC-1',
          ocNumero: 'OC-100',
          factura: 'F-1',
          proveedorFactura: 'Prov',
          proveedorId: null,
          updatedAt: new Date(),
          ...data,
        }),
      );
      prisma.configContableSii.findMany.mockResolvedValue([]);
      prisma.configContableSii.findFirst.mockResolvedValue(null);
      prisma.cuentaContable.findFirst
        .mockResolvedValueOnce({ id: 'CTA-A' })
        .mockResolvedValueOnce({ id: 'CTA-B' });

      await service.updateRegistro(
        tenantUser({ permisos: ['compras:write'] }),
        'RC-1',
        { ...baseDto, estado: 'CONTABILIZADA' },
      );

      const lineas = createAsiento.mock.calls[0][0].lineas as { cuentaId?: string }[];
      expect(lineas).toHaveLength(2);
      expect(lineas.every((l) => Boolean(l.cuentaId))).toBe(true);
    });

    it('rechaza updateRegistro a CONTABILIZADA con OC PENDIENTE_APROBACION', async () => {
      prisma.registroCompra.findUnique.mockResolvedValue({
        id: 'RC-1',
        ocId: 'OC-1',
        ocNumero: 'OC-100',
        factura: 'F-1',
        proveedorOc: 'Prov',
        proveedorFactura: 'Prov',
        proveedorId: null,
        monto: 1000,
        afactoOc: 'AFECTO',
        afactoFactura: 'AFECTO',
        afactoOk: true,
        estado: 'BORRADOR',
        asientoId: null,
        asientoNumero: null,
        lineas: null,
        empresaId: 'EMP-1',
      });
      prisma.ordenCompra.findFirst.mockResolvedValue({
        id: 'OC-1',
        numero: 'OC-100',
        estado: 'PENDIENTE_APROBACION',
        empresaId: 'EMP-1',
      });
      await expect(
        service.updateRegistro(
          tenantUser({ permisos: ['compras:write'] }),
          'RC-1',
          { ...baseDto, estado: 'CONTABILIZADA' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.registroCompra.update).not.toHaveBeenCalled();
    });
  });

  describe('P0-3 createRecepcion', () => {
    const baseDto = {
      ocNumero: 'OC-100',
      fecha: '2026-07-01',
      tcAplicado: 1,
      moneda: 'CLP',
      monto: 500,
    };

    it('rechaza recepcionar una OC en BORRADOR', async () => {
      prisma.ordenCompra.findFirst.mockResolvedValue({
        id: 'OC-1',
        numero: 'OC-100',
        estado: 'BORRADOR',
        neto: 1000,
        lineas: null,
        empresaId: 'EMP-1',
      });
      await expect(
        service.createRecepcion(tenantUser({ permisos: ['compras:write'] }), baseDto, 'EMP-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.recepcionOc.create).not.toHaveBeenCalled();
    });

    it('rechaza recepcionar una OC RECHAZADA', async () => {
      prisma.ordenCompra.findFirst.mockResolvedValue({
        id: 'OC-1',
        numero: 'OC-100',
        estado: 'RECHAZADO',
        neto: 1000,
        lineas: null,
        empresaId: 'EMP-1',
      });
      await expect(
        service.createRecepcion(tenantUser({ permisos: ['compras:write'] }), baseDto, 'EMP-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ignora recepciones BORRADOR previas al calcular el tope', async () => {
      prisma.ordenCompra.findFirst.mockResolvedValue({
        id: 'OC-1',
        numero: 'OC-100',
        estado: 'APROBADO',
        neto: 800,
        lineas: null,
        empresaId: 'EMP-1',
      });
      // Si el aggregate sumara también borradores (800 previos), esta
      // recepción de 500 excedería el neto de la OC (800). Al filtrar por
      // CONFIRMADA, el mock debe simular que la suma previa confirmada es 0.
      prisma.recepcionOc.aggregate.mockResolvedValue({ _sum: { monto: 0 } });
      prisma.recepcionOc.create.mockResolvedValue({
        id: 'REC-1',
        ocNumero: 'OC-100',
        fecha: new Date('2026-07-01'),
        tcAplicado: 1,
        moneda: 'CLP',
        monto: 500,
        estado: 'BORRADOR',
        lineas: null,
      });

      const row = await service.createRecepcion(
        tenantUser({ permisos: ['compras:write'] }),
        baseDto,
        'EMP-1',
      );
      expect(row.monto).toBe(500);
      expect(prisma.recepcionOc.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ocId: 'OC-1', estado: 'CONFIRMADA' } }),
      );
      expect(prisma.ordenCompra.update).not.toHaveBeenCalled();
    });

    it('marca la OC como RECEPCIONADA solo si la recepción es CONFIRMADA', async () => {
      prisma.ordenCompra.findFirst.mockResolvedValue({
        id: 'OC-1',
        numero: 'OC-100',
        estado: 'APROBADO',
        neto: 800,
        lineas: null,
        empresaId: 'EMP-1',
      });
      prisma.recepcionOc.aggregate.mockResolvedValue({ _sum: { monto: 0 } });
      prisma.recepcionOc.create.mockResolvedValue({
        id: 'REC-1',
        ocNumero: 'OC-100',
        fecha: new Date('2026-07-01'),
        tcAplicado: 1,
        moneda: 'CLP',
        monto: 500,
        estado: 'CONFIRMADA',
        lineas: null,
      });
      prisma.ordenCompra.update.mockResolvedValue({});

      await service.createRecepcion(
        tenantUser({ permisos: ['compras:write'] }),
        { ...baseDto, estado: 'CONFIRMADA' },
        'EMP-1',
      );
      expect(prisma.ordenCompra.update).toHaveBeenCalledWith({
        where: { id: 'OC-1' },
        data: { estado: 'RECEPCIONADA' },
      });
    });
  });

  describe('P0-3/P0-4 updateRecepcion confirma borrador', () => {
    it('al confirmar un borrador, marca la OC como RECEPCIONADA', async () => {
      prisma.recepcionOc.findUnique.mockResolvedValue({
        id: 'REC-1',
        ocId: 'OC-1',
        ocNumero: 'OC-100',
        estado: 'BORRADOR',
        empresaId: 'EMP-1',
        fecha: new Date('2026-07-01'),
        tcAplicado: 1,
        moneda: 'CLP',
        monto: 500,
        lineas: null,
      });
      prisma.ordenCompra.findUnique.mockResolvedValue({
        id: 'OC-1',
        estado: 'APROBADO',
      });
      prisma.recepcionOc.update.mockResolvedValue({
        id: 'REC-1',
        ocNumero: 'OC-100',
        estado: 'CONFIRMADA',
        fecha: new Date('2026-07-01'),
        tcAplicado: 1,
        moneda: 'CLP',
        monto: 500,
        lineas: null,
      });

      await service.updateRecepcion(
        tenantUser({ permisos: ['compras:write'] }),
        'REC-1',
        { estado: 'CONFIRMADA' } as never,
      );

      expect(prisma.ordenCompra.update).toHaveBeenCalledWith({
        where: { id: 'OC-1' },
        data: { estado: 'RECEPCIONADA' },
      });
    });
  });

  describe('P1-10 recepción parcial real', () => {
    const ocConLineas = {
      id: 'OC-1',
      numero: 'OC-100',
      estado: 'APROBADO',
      neto: 1000,
      lineas: [
        { descripcion: 'Fertilizante', cantidad: 100, precioUnitario: 10, total: 1000 },
      ],
      empresaId: 'EMP-1',
    };

    it('permite recepcionar solo una parte de la cantidad de la línea de la OC', async () => {
      prisma.ordenCompra.findFirst.mockResolvedValue(ocConLineas);
      prisma.recepcionOc.findMany.mockResolvedValue([]);
      prisma.recepcionOc.aggregate.mockResolvedValue({ _sum: { monto: 0 } });
      prisma.recepcionOc.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ id: 'REC-1', ...data }),
      );

      const row = await service.createRecepcion(
        tenantUser({ permisos: ['compras:write'] }),
        {
          ocNumero: 'OC-100',
          fecha: '2026-08-01',
          tcAplicado: 1,
          moneda: 'CLP',
          monto: 400,
          lineas: [{ descripcion: 'Fertilizante', cantidad: 40, precioUnitario: 10, total: 400 }],
        },
        'EMP-1',
      );
      expect(row.monto).toBe(400);
      expect(prisma.recepcionOc.create).toHaveBeenCalled();
    });

    it('rechaza una segunda recepción que, sumada a la primera, exceda la cantidad de la línea', async () => {
      prisma.ordenCompra.findFirst.mockResolvedValue(ocConLineas);
      // Ya hay 70 unidades CONFIRMADAS de las 100 de la OC.
      prisma.recepcionOc.findMany.mockResolvedValue([
        { lineas: [{ descripcion: 'Fertilizante', cantidad: 70, precioUnitario: 10, total: 700 }] },
      ]);
      prisma.recepcionOc.aggregate.mockResolvedValue({ _sum: { monto: 700 } });

      await expect(
        service.createRecepcion(
          tenantUser({ permisos: ['compras:write'] }),
          {
            ocNumero: 'OC-100',
            fecha: '2026-08-01',
            tcAplicado: 1,
            moneda: 'CLP',
            monto: 400,
            lineas: [{ descripcion: 'Fertilizante', cantidad: 40, precioUnitario: 10, total: 400 }],
          },
          'EMP-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.recepcionOc.create).not.toHaveBeenCalled();
    });

    it('sin líneas explícitas, recepciona por defecto solo el saldo pendiente', async () => {
      prisma.ordenCompra.findFirst.mockResolvedValue(ocConLineas);
      prisma.recepcionOc.findMany.mockResolvedValue([
        { lineas: [{ descripcion: 'Fertilizante', cantidad: 60, precioUnitario: 10, total: 600 }] },
      ]);
      prisma.recepcionOc.aggregate.mockResolvedValue({ _sum: { monto: 600 } });
      prisma.recepcionOc.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ id: 'REC-2', ...data }),
      );

      const row = await service.createRecepcion(
        tenantUser({ permisos: ['compras:write'] }),
        {
          ocNumero: 'OC-100',
          fecha: '2026-08-01',
          tcAplicado: 1,
          moneda: 'CLP',
          monto: 0,
        },
        'EMP-1',
      );
      // Saldo pendiente: 100 - 60 = 40 unidades × 10 = 400.
      expect(row.monto).toBe(400);
    });
  });

  describe('P1-10 matching de 3 vías en createRegistro', () => {
    it('marca matchOk=false si el monto de la factura no calza con lo recepcionado', async () => {
      prisma.ordenCompra.findFirst.mockResolvedValue({
        id: 'OC-1',
        numero: 'OC-100',
        estado: 'RECEPCIONADA',
        afacto: 'AFECTO',
        proveedorId: null,
        lineas: null,
        empresaId: 'EMP-1',
      });
      prisma.recepcionOc.aggregate.mockResolvedValue({ _sum: { monto: 500 } });
      prisma.proveedor.findFirst.mockResolvedValue(null);
      prisma.registroCompra.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ id: 'RC-1', ...data }),
      );

      const row = await service.createRegistro(
        tenantUser({ permisos: ['compras:write'] }),
        {
          ocNumero: 'OC-100',
          factura: 'F-1',
          proveedorOc: 'Prov',
          proveedorFactura: 'Prov',
          monto: 800,
        },
        'EMP-1',
      );
      expect(row.matchOk).toBe(false);
      expect(row.matchDiff).toBe(300);
    });

    it('marca matchOk=true si el monto de la factura calza con lo recepcionado', async () => {
      prisma.ordenCompra.findFirst.mockResolvedValue({
        id: 'OC-1',
        numero: 'OC-100',
        estado: 'RECEPCIONADA',
        afacto: 'AFECTO',
        proveedorId: null,
        lineas: null,
        empresaId: 'EMP-1',
      });
      prisma.recepcionOc.aggregate.mockResolvedValue({ _sum: { monto: 800 } });
      prisma.proveedor.findFirst.mockResolvedValue(null);
      prisma.registroCompra.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ id: 'RC-2', ...data }),
      );

      const row = await service.createRegistro(
        tenantUser({ permisos: ['compras:write'] }),
        {
          ocNumero: 'OC-100',
          factura: 'F-2',
          proveedorOc: 'Prov',
          proveedorFactura: 'Prov',
          monto: 800,
        },
        'EMP-1',
      );
      expect(row.matchOk).toBe(true);
      expect(row.matchDiff).toBe(0);
    });
  });

  describe('previewCadena', () => {
    it('con neto 0 no finge cadena', async () => {
      const res = await service.previewCadena(
        tenantUser({ permisos: ['compras:read'] }),
        0,
        'EMP-1',
      );
      expect(res.status).toBe('no_pool');
      expect(res.cadena).toEqual([]);
      expect(res.modulo).toBe('Compras');
    });

    it('con neto 0 resuelve grupo para Departamento', async () => {
      prisma.grupoAprobacion.findMany.mockResolvedValue([
        {
          id: 'GRP-1',
          modulo: 'Compras',
          aprobadorInicialId: 'U-3',
          activo: true,
          miembros: [{ usuarioId: 'U-15' }],
        },
      ]);
      prisma.grupoAprobacion.findFirst.mockResolvedValue({
        id: 'GRP-1',
        nombre: 'Packing',
      });
      const res = await service.previewCadena(
        tenantUser({ sub: 'U-15', permisos: ['compras:read'] }),
        0,
        'EMP-1',
      );
      expect(res.status).toBe('no_pool');
      expect(res.cadena).toEqual([]);
      expect(res.grupo).toEqual({ id: 'GRP-1', nombre: 'Packing' });
    });

    it('sin grupos ni workflow retorna no_pool', async () => {
      prisma.workflowConfig.findMany.mockResolvedValue([]);
      const res = await service.previewCadena(
        tenantUser({ permisos: ['compras:read'] }),
        200_000,
        'EMP-1',
      );
      expect(res.status).toBe('no_pool');
    });

    it('con grupos Compras y usuario ajeno retorna sin_grupo', async () => {
      prisma.workflowConfig.findMany.mockResolvedValue([
        { nombre: 'OC', montoMin: 0, montoMax: 9_999_999, aprobadorIds: ['U-3'] },
      ]);
      prisma.grupoAprobacion.findMany.mockResolvedValue([
        {
          id: 'GRP-1',
          modulo: 'Compras',
          aprobadorInicialId: 'U-3',
          activo: true,
          miembros: [{ usuarioId: 'U-15' }],
        },
      ]);
      prisma.nodoEscalaAprobacion.findMany.mockResolvedValue([
        {
          id: 'N-1',
          grupoId: 'GRP-1',
          logica: 'SIMPLE',
          usuarioId: 'U-3',
          aprobadores: [{ usuarioId: 'U-3', orden: 0 }],
          montoMax: 500_000,
          escalaAId: null,
          escalaAUsuarioId: null,
          activo: true,
        },
      ]);
      const res = await service.previewCadena(
        tenantUser({ sub: 'U-1', permisos: ['compras:read'] }),
        200_000,
        'EMP-1',
      );
      expect(res.status).toBe('sin_grupo');
      expect(res.cadena).toEqual([]);
    });

    it('el mantenedor ROL-1 arma cadena sin ser miembro del grupo', async () => {
      prisma.workflowConfig.findMany.mockResolvedValue([
        { nombre: 'OC', montoMin: 0, montoMax: 9_999_999, aprobadorIds: ['U-3'] },
      ]);
      prisma.grupoAprobacion.findMany.mockResolvedValue([
        {
          id: 'GRP-1',
          modulo: 'Compras',
          aprobadorInicialId: 'U-3',
          activo: true,
          miembros: [{ usuarioId: 'U-15' }],
        },
      ]);
      prisma.nodoEscalaAprobacion.findMany.mockResolvedValue([
        {
          id: 'N-1',
          grupoId: 'GRP-1',
          logica: 'SIMPLE',
          usuarioId: 'U-3',
          aprobadores: [{ usuarioId: 'U-3', orden: 0 }],
          montoMax: 5_000_000,
          escalaAId: null,
          escalaAUsuarioId: null,
          activo: true,
        },
      ]);
      prisma.usuario.findMany.mockResolvedValue([
        { id: 'U-1', nombre: 'Admin', jefeId: null, montoMaxAprobacion: null, activo: true },
        { id: 'U-3', nombre: 'Jorge', jefeId: null, montoMaxAprobacion: 5_000_000, activo: true },
      ]);
      const { superAdminUser } = await import('../../test-utils/prisma-mock');
      const res = await service.previewCadena(superAdminUser(), 200_000, 'EMP-1');
      expect(res.status).toBe('ok');
      expect(res.cadena.map((c) => c.id)).toEqual(['U-3']);
      expect(res.grupo?.id).toBe('GRP-1');
    });

    it('convierte monto en moneda extranjera USD con tipo de cambio del BC para la escala', async () => {
      prisma.workflowConfig.findMany.mockResolvedValue([
        { nombre: 'OC', montoMin: 0, montoMax: 9_999_999, aprobadorIds: ['U-3'] },
      ]);
      prisma.grupoAprobacion.findMany.mockResolvedValue([
        {
          id: 'GRP-1',
          modulo: 'Compras',
          aprobadorInicialId: 'U-3',
          activo: true,
          miembros: [{ usuarioId: 'U-15' }],
        },
      ]);
      prisma.nodoEscalaAprobacion.findMany.mockResolvedValue([
        {
          id: 'N-1',
          grupoId: 'GRP-1',
          logica: 'SIMPLE',
          usuarioId: 'U-3',
          aprobadores: [{ usuarioId: 'U-3', orden: 0 }],
          montoMax: 5_000_000,
          escalaAId: null,
          escalaAUsuarioId: null,
          activo: true,
        },
      ]);
      prisma.usuario.findMany.mockResolvedValue([
        { id: 'U-1', nombre: 'Admin', jefeId: null, montoMaxAprobacion: null, activo: true },
        { id: 'U-3', nombre: 'Jorge', jefeId: null, montoMaxAprobacion: 5_000_000, activo: true },
      ]);
      (prisma.indicadorBc.findMany as jest.Mock).mockResolvedValueOnce([
        {
          fecha: new Date('2026-09-25T00:00:00.000Z'),
          usd: 965.71,
          eur: 1098.15,
          cny: 143.79,
        },
      ]);
      const { superAdminUser } = await import('../../test-utils/prisma-mock');
      // 200 USD * 965.71 = 193,142 CLP -> calza en la regla de 200_000
      const res = await service.previewCadena(superAdminUser(), 200, 'EMP-1', 'USD');
      expect(res.status).toBe('ok');
      expect(res.cadena.map((c) => c.id)).toEqual(['U-3']);
    });
  });

  describe('AND/OR runtime + campana + bandeja', () => {
    const dtoAprobar = {
      numero: 'OC-AND',
      fecha: '2026-07-01',
      proveedor: 'Prov',
      solicitante: 'Ana',
      moneda: 'CLP',
      neto: 1000,
      afacto: 'AFECTO',
      estado: 'APROBADO',
      departamento: 'Compras',
      pinAprobacion: '4821',
    };

    function ocAnd(over: Record<string, unknown> = {}) {
      return {
        id: 'OC-1',
        numero: 'OC-AND',
        fecha: new Date('2026-07-01'),
        proveedor: 'Prov',
        proveedorId: 'PROV-1',
        solicitante: 'Ana',
        creadoPorId: 'U-SOL',
        creadoPorNombre: 'Solicitante',
        aprobadorId: 'U-A',
        aprobadorNombre: 'A',
        aprobacionCadenaIds: ['U-A'],
        aprobacionCadena: [
          {
            logica: 'AND',
            aprobadores: [
              { id: 'U-A', nombre: 'A', estado: 'PENDIENTE' },
              { id: 'U-B', nombre: 'B', estado: 'PENDIENTE' },
            ],
          },
        ],
        aprobacionPasoActual: 1,
        aprobacionPasosTotal: 1,
        moneda: 'CLP',
        neto: 1000,
        afacto: 'AFECTO',
        estado: 'PENDIENTE_APROBACION',
        departamento: 'Compras',
        cuentaContableId: null,
        centroCostoId: null,
        elementoCostoId: null,
        distribucionCc: null,
        lineas: null,
        empresaId: 'EMP-1',
        ...over,
      };
    }

    function mockPinSkip() {
      prisma.usuario.findUnique.mockResolvedValue({
        activo: true,
        pinAprobacionHash: null,
        id: 'U-A',
        nombre: 'A',
        rolId: 'ROL-2',
        rol: { permisos: [] },
      });
      prisma.workflowConfig.findFirst.mockResolvedValue(null);
      prisma.nodoEscalaAprobacion.findFirst.mockResolvedValue(null);
    }

    it('AND: un PIN no cierra la OC', async () => {
      const oc = ocAnd();
      prisma.ordenCompra.findUnique.mockResolvedValue(oc);
      prisma.aprobacionOc.findMany.mockResolvedValue([
        { id: 'AP-A', aprobadorId: 'U-A', pasoOrden: 1, pasoTotal: 1, logica: 'AND', estado: 'PENDIENTE' },
        { id: 'AP-B', aprobadorId: 'U-B', pasoOrden: 1, pasoTotal: 1, logica: 'AND', estado: 'PENDIENTE' },
      ]);
      mockPinSkip();
      prisma.ordenCompra.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...oc,
        ...data,
      }));
      prisma.aprobacionOc.update.mockResolvedValue({});

      const result = await service.updateOrden(
        tenantUser({ sub: 'U-A', permisos: ['compras:write'] }),
        'OC-1',
        dtoAprobar,
      );

      expect(result.estado).toBe('PENDIENTE_APROBACION');
      expect(prisma.ordenCompra.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ estado: 'PENDIENTE_APROBACION' }),
        }),
      );
      expect(prisma.aprobacionOc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'AP-A' },
          data: expect.objectContaining({ estado: 'APROBADA' }),
        }),
      );
      expect(prisma.aprobacionOc.updateMany).not.toHaveBeenCalled();
      expect(prisma.aprobacionOc.create).not.toHaveBeenCalled();
    });

    it('AND: dos PIN cierran la OC', async () => {
      const oc = ocAnd({
        aprobacionCadena: [
          {
            logica: 'AND',
            aprobadores: [
              { id: 'U-A', nombre: 'A', estado: 'APROBADA' },
              { id: 'U-B', nombre: 'B', estado: 'PENDIENTE' },
            ],
          },
        ],
      });
      prisma.ordenCompra.findUnique.mockResolvedValue(oc);
      prisma.aprobacionOc.findMany.mockResolvedValue([
        { id: 'AP-B', aprobadorId: 'U-B', pasoOrden: 1, pasoTotal: 1, logica: 'AND', estado: 'PENDIENTE' },
      ]);
      mockPinSkip();
      prisma.ordenCompra.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...oc,
        ...data,
      }));
      prisma.aprobacionOc.update.mockResolvedValue({});

      const result = await service.updateOrden(
        tenantUser({ sub: 'U-B', permisos: ['compras:write'] }),
        'OC-1',
        dtoAprobar,
      );

      expect(result.estado).toBe('APROBADO');
      expect(prisma.aprobacionOc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'AP-B' },
          data: expect.objectContaining({ estado: 'APROBADA' }),
        }),
      );
    });

    it('OR: un PIN omite al otro y cierra', async () => {
      const oc = ocAnd({
        aprobacionCadena: [
          {
            logica: 'OR',
            aprobadores: [
              { id: 'U-A', nombre: 'A', estado: 'PENDIENTE' },
              { id: 'U-B', nombre: 'B', estado: 'PENDIENTE' },
            ],
          },
        ],
      });
      prisma.ordenCompra.findUnique.mockResolvedValue(oc);
      prisma.aprobacionOc.findMany.mockResolvedValue([
        { id: 'AP-A', aprobadorId: 'U-A', pasoOrden: 1, pasoTotal: 1, logica: 'OR', estado: 'PENDIENTE' },
        { id: 'AP-B', aprobadorId: 'U-B', pasoOrden: 1, pasoTotal: 1, logica: 'OR', estado: 'PENDIENTE' },
      ]);
      mockPinSkip();
      prisma.ordenCompra.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...oc,
        ...data,
      }));
      prisma.aprobacionOc.update.mockResolvedValue({});
      prisma.aprobacionOc.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updateOrden(
        tenantUser({ sub: 'U-A', permisos: ['compras:write'] }),
        'OC-1',
        dtoAprobar,
      );

      expect(result.estado).toBe('APROBADO');
      expect(prisma.aprobacionOc.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            aprobadorId: { in: ['U-B'] },
          }),
          data: expect.objectContaining({ estado: 'OMITIDA' }),
        }),
      );
    });

    it('AND rechazo cierra OC y omite hermanas', async () => {
      const oc = ocAnd();
      prisma.ordenCompra.findUnique.mockResolvedValue(oc);
      prisma.aprobacionOc.findMany.mockResolvedValue([
        { id: 'AP-A', aprobadorId: 'U-A', pasoOrden: 1, pasoTotal: 1, logica: 'AND', estado: 'PENDIENTE' },
        { id: 'AP-B', aprobadorId: 'U-B', pasoOrden: 1, pasoTotal: 1, logica: 'AND', estado: 'PENDIENTE' },
      ]);
      mockPinSkip();
      prisma.ordenCompra.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...oc,
        ...data,
      }));
      prisma.aprobacionOc.update.mockResolvedValue({});
      prisma.aprobacionOc.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updateOrden(
        tenantUser({ sub: 'U-A', permisos: ['compras:write'] }),
        'OC-1',
        {
          ...dtoAprobar,
          estado: 'RECHAZADO',
          motivoRechazo: 'Precio fuera de presupuesto',
        },
      );

      expect(result.estado).toBe('RECHAZADO');
      expect(prisma.aprobacionOc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ estado: 'RECHAZADA' }),
        }),
      );
      expect(prisma.aprobacionOc.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ estado: 'OMITIDA' }),
        }),
      );
    });

    it('al enviar: una fila por integrante AND y campana al solicitante', async () => {
      const notificaciones = { upsert: jest.fn(), setLeidaByRef: jest.fn() };
      const harness = createPrismaMock();
      prisma = harness.prisma;
      prisma.delegacionAprobacion.findMany.mockResolvedValue([]);
      prisma.registroCompra.aggregate.mockResolvedValue({ _sum: { monto: 0 } });
      service = new ComprasService(
        harness.mock,
        undefined,
        undefined,
        notificaciones as never,
      );

      prisma.proveedor.findFirst.mockResolvedValue({
        id: 'PROV-1',
        razonSocial: 'Prov',
        empresaId: 'EMP-1',
      });
      prisma.workflowConfig.findMany.mockResolvedValue([
        { nombre: 'OC', montoMin: 0, montoMax: 9_999_999, aprobadorIds: ['U-A', 'U-B'] },
      ]);
      prisma.grupoAprobacion.findMany.mockResolvedValue([
        {
          id: 'GRP-1',
          modulo: 'Compras',
          aprobadorInicialId: 'U-A',
          activo: true,
          miembros: [{ usuarioId: 'U-SOL' }],
        },
      ]);
      prisma.nodoEscalaAprobacion.findMany.mockResolvedValue([
        {
          id: 'N-AND',
          grupoId: 'GRP-1',
          logica: 'AND',
          usuarioId: 'U-A',
          aprobadores: [
            { usuarioId: 'U-A', orden: 0 },
            { usuarioId: 'U-B', orden: 1 },
          ],
          montoMax: 5_000_000,
          escalaAId: null,
          escalaAUsuarioId: null,
          activo: true,
        },
      ]);
      prisma.usuario.findUnique.mockResolvedValue({ id: 'U-SOL', nombre: 'Solicitante' });
      prisma.usuario.findMany.mockResolvedValue([
        { id: 'U-SOL', nombre: 'Solicitante', jefeId: 'U-A', montoMaxAprobacion: null, activo: true },
        { id: 'U-A', nombre: 'A', jefeId: null, montoMaxAprobacion: 5_000_000, activo: true },
        { id: 'U-B', nombre: 'B', jefeId: null, montoMaxAprobacion: 5_000_000, activo: true },
      ]);
      const oc = {
        id: 'OC-1',
        numero: 'OC-AND',
        fecha: new Date('2026-07-01'),
        proveedor: 'Prov',
        solicitante: 'Ana',
        creadoPorId: 'U-SOL',
        creadoPorNombre: 'Solicitante',
        moneda: 'CLP',
        neto: 1000,
        afacto: 'AFECTO',
        estado: 'PENDIENTE_APROBACION',
        departamento: 'Compras',
        distribucionCc: null,
        empresaId: 'EMP-1',
      };
      prisma.ordenCompra.create.mockResolvedValue(oc);
      prisma.aprobacionOc.create.mockResolvedValue({});
      prisma.aprobacionOc.findMany.mockResolvedValue([
        { id: 'AP-A', aprobadorId: 'U-A' },
        { id: 'AP-B', aprobadorId: 'U-B' },
      ]);

      const result = await service.createOrden(
        tenantUser({ sub: 'U-SOL', permisos: ['compras:write'] }),
        {
          numero: 'OC-AND',
          fecha: '2026-07-01',
          proveedor: 'Prov',
          solicitante: 'Ana',
          moneda: 'CLP',
          neto: 1000,
          afacto: 'AFECTO',
          estado: 'PENDIENTE_APROBACION',
          departamento: 'Compras',
        },
        'EMP-1',
      );

      expect(result.estado).toBe('PENDIENTE_APROBACION');
      expect(prisma.aprobacionOc.create).toHaveBeenCalledTimes(2);
      expect(prisma.ordenCompra.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            aprobacionCadena: [
              {
                logica: 'AND',
                aprobadores: [
                  { id: 'U-A', nombre: 'A', estado: 'PENDIENTE' },
                  { id: 'U-B', nombre: 'B', estado: 'PENDIENTE' },
                ],
              },
            ],
          }),
        }),
      );
      expect(notificaciones.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'U-A',
          tipo: 'OC_PENDIENTE',
        }),
      );
      expect(notificaciones.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'U-B',
          tipo: 'OC_PENDIENTE',
        }),
      );
      expect(notificaciones.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'U-SOL',
          tipo: 'OC_ENVIADA',
          titulo: 'OC OC-AND enviada a aprobación',
        }),
      );
    });

    it('getAprobaciones incluye logica (extra AND ve su fila)', async () => {
      prisma.aprobacionOc.findMany.mockResolvedValue([
        {
          id: 'AP-B',
          ocId: 'OC-1',
          ocNumero: 'OC-AND',
          proveedor: 'Prov',
          monto: 1000,
          solicitante: 'Ana',
          aprobadorId: 'U-B',
          aprobadorNombre: 'B',
          resueltoPorNombre: null,
          logica: 'AND',
          pasoOrden: 1,
          pasoTotal: 1,
          estado: 'PENDIENTE',
          fecha: new Date('2026-07-01'),
          motivoRechazo: null,
        },
      ]);
      const rows = await service.getAprobaciones(
        tenantUser({ sub: 'U-B', permisos: ['compras:read'] }),
        'EMP-1',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].logica).toBe('AND');
      expect(rows[0].aprobadorId).toBe('U-B');
      expect(rows[0].motivoRechazo).toBeUndefined();
      expect(prisma.aprobacionOc.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ aprobadorId: 'U-B' }]),
          }),
        }),
      );
    });

    describe('motivo de rechazo OC', () => {
      const motivo = 'Precio fuera de presupuesto';

      it('400 si rechaza sin motivo o con menos de 5 caracteres', async () => {
        prisma.ordenCompra.findUnique.mockResolvedValue(ocAnd());
        await expect(
          service.updateOrden(
            tenantUser({ sub: 'U-A', permisos: ['compras:write'] }),
            'OC-1',
            { ...dtoAprobar, estado: 'RECHAZADO' },
          ),
        ).rejects.toMatchObject({
          response: { message: MOTIVO_RECHAZO_REQUIRED_MSG },
        });
        await expect(
          service.updateOrden(
            tenantUser({ sub: 'U-A', permisos: ['compras:write'] }),
            'OC-1',
            { ...dtoAprobar, estado: 'RECHAZADO', motivoRechazo: '  ab  ' },
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.ordenCompra.update).not.toHaveBeenCalled();
        expect(prisma.aprobacionOc.update).not.toHaveBeenCalled();
      });

      it('persiste motivoRechazo en OC y en la fila que rechaza', async () => {
        const oc = ocAnd();
        prisma.ordenCompra.findUnique.mockResolvedValue(oc);
        prisma.aprobacionOc.findMany.mockResolvedValue([
          { id: 'AP-A', aprobadorId: 'U-A', pasoOrden: 1, pasoTotal: 1, logica: 'AND', estado: 'PENDIENTE' },
          { id: 'AP-B', aprobadorId: 'U-B', pasoOrden: 1, pasoTotal: 1, logica: 'AND', estado: 'PENDIENTE' },
        ]);
        mockPinSkip();
        prisma.ordenCompra.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          ...oc,
          ...data,
        }));
        prisma.aprobacionOc.update.mockResolvedValue({});
        prisma.aprobacionOc.updateMany.mockResolvedValue({ count: 1 });

        const result = await service.updateOrden(
          tenantUser({ sub: 'U-A', permisos: ['compras:write'] }),
          'OC-1',
          { ...dtoAprobar, estado: 'RECHAZADO', motivoRechazo: `  ${motivo}  ` },
        );

        expect(result.estado).toBe('RECHAZADO');
        expect(result.motivoRechazo).toBe(motivo);
        expect(prisma.ordenCompra.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ estado: 'RECHAZADO', motivoRechazo: motivo }),
          }),
        );
        expect(prisma.aprobacionOc.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'AP-A' },
            data: expect.objectContaining({ estado: 'RECHAZADA', motivoRechazo: motivo }),
          }),
        );
      });

      it('campana OC_RESULTADO incluye el motivo en detalle', async () => {
        const notificaciones = { upsert: jest.fn(), setLeidaByRef: jest.fn() };
        const harness = createPrismaMock();
        prisma = harness.prisma;
        prisma.delegacionAprobacion.findMany.mockResolvedValue([]);
        prisma.grupoAprobacion.findMany.mockResolvedValue([]);
        prisma.nodoEscalaAprobacion.findMany.mockResolvedValue([]);
        prisma.usuario.findMany.mockResolvedValue([]);
        prisma.registroCompra.aggregate.mockResolvedValue({ _sum: { monto: 0 } });
        service = new ComprasService(
          harness.mock,
          undefined,
          undefined,
          notificaciones as never,
        );

        const oc = ocAnd();
        prisma.ordenCompra.findUnique.mockResolvedValue(oc);
        prisma.aprobacionOc.findMany.mockResolvedValue([
          { id: 'AP-A', aprobadorId: 'U-A', pasoOrden: 1, pasoTotal: 1, logica: 'AND', estado: 'PENDIENTE' },
        ]);
        mockPinSkip();
        prisma.ordenCompra.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          ...oc,
          ...data,
        }));
        prisma.aprobacionOc.update.mockResolvedValue({});
        prisma.aprobacionOc.updateMany.mockResolvedValue({ count: 0 });

        await service.updateOrden(
          tenantUser({ sub: 'U-A', permisos: ['compras:write'] }),
          'OC-1',
          { ...dtoAprobar, estado: 'RECHAZADO', motivoRechazo: motivo },
        );

        expect(notificaciones.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'U-SOL',
            tipo: 'OC_RESULTADO',
            titulo: 'OC OC-AND rechazada',
            detalle: `Tu solicitud fue rechazada. Motivo: ${motivo}`,
          }),
        );
      });

      it('al reenviar limpia motivoRechazo en la OC', async () => {
        const oc = ocAnd({
          estado: 'RECHAZADO',
          motivoRechazo: motivo,
        });
        prisma.ordenCompra.findUnique.mockResolvedValue(oc);
        prisma.proveedor.findFirst.mockResolvedValue({
          id: 'PROV-1',
          razonSocial: 'Prov',
          empresaId: 'EMP-1',
          activo: true,
        });
        prisma.workflowConfig.findMany.mockResolvedValue([
          {
            montoMin: 0,
            montoMax: 999999999,
            aprobadorIds: ['U-JEFE'],
            activo: true,
            modulo: 'Compras',
          },
        ]);
        prisma.usuario.findMany.mockResolvedValue([
          { id: 'U-SOL', nombre: 'Solicitante', jefeId: 'U-JEFE', montoMaxAprobacion: null, activo: true },
          { id: 'U-JEFE', nombre: 'Jefe', jefeId: null, montoMaxAprobacion: 5_000_000, activo: true },
        ]);
        prisma.ordenCompra.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          ...oc,
          ...data,
          estado: 'PENDIENTE_APROBACION',
          motivoRechazo: data.motivoRechazo ?? null,
        }));
        prisma.aprobacionOc.deleteMany.mockResolvedValue({ count: 0 });
        prisma.aprobacionOc.create.mockResolvedValue({});
        prisma.aprobacionOc.findMany.mockResolvedValue([{ id: 'AP-NEW', aprobadorId: 'U-JEFE' }]);

        const result = await service.updateOrden(
          tenantUser({ sub: 'U-SOL', permisos: ['compras:write'] }),
          'OC-1',
          {
            numero: 'OC-AND',
            fecha: '2026-07-01',
            proveedor: 'Prov',
            solicitante: 'Ana',
            moneda: 'CLP',
            neto: 1000,
            afacto: 'AFECTO',
            estado: 'PENDIENTE_APROBACION',
            departamento: 'Compras',
          },
        );

        expect(result.estado).toBe('PENDIENTE_APROBACION');
        expect(result.motivoRechazo).toBeUndefined();
        expect(prisma.ordenCompra.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              estado: 'PENDIENTE_APROBACION',
              motivoRechazo: null,
            }),
          }),
        );
      });
    });
  });

  describe('GoSocket (Fase 2): inbox de compras (sync/aceptar/rechazar)', () => {
    function billingMock() {
      return {
        getReceivedPurchaseDocuments: jest.fn(),
        getPurchaseArtifact: jest.fn().mockResolvedValue({
          body: Buffer.from(''),
          filename: 'doc.xml',
          contentType: 'application/xml',
        }),
        changePurchaseDocumentStatus: jest.fn(),
      };
    }

    function docBase(over: Record<string, unknown> = {}) {
      return {
        globalDocumentId: 'gid-81',
        countryDocumentId: null,
        folioOficial: '81',
        fechaEmision: '2026-09-01',
        emisorRut: '76.111.222-3',
        emisorRazonSocial: 'Proveedor Demo SPA',
        montoNeto: 100_000,
        montoIva: 19_000,
        montoTotal: 119_000,
        authorityStatus: '2',
        estado: 'PENDIENTE',
        rechazoOrigen: null,
        rechazoMotivo: null,
        messages: [],
        ...over,
      };
    }

    describe('syncRegistrosCompraGoSocket', () => {
      beforeEach(() => {
        prisma.ordenCompra.findFirst.mockResolvedValue(null);
        prisma.proveedor.findMany.mockResolvedValue([]);
      });
      it('lanza ServiceUnavailable si no hay BillingGatewayClient inyectado', async () => {
        prisma.empresa.findUnique.mockResolvedValue({ id: 'EMP-1', rut: '77.032.638-9' });
        await expect(
          service.syncRegistrosCompraGoSocket(tenantUser(), { desde: '2026-09-01', hasta: '2026-09-30' }),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
      });

      it('lanza NotFound si la empresa no existe', async () => {
        const billing = billingMock();
        service = new ComprasService(prisma as never, undefined, undefined, undefined, billing as never);
        prisma.empresa.findUnique.mockResolvedValue(null);
        await expect(
          service.syncRegistrosCompraGoSocket(tenantUser(), { desde: '2026-09-01', hasta: '2026-09-30' }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(billing.getReceivedPurchaseDocuments).not.toHaveBeenCalled();
      });

      it('sin match previo, auto-crea un RegistroCompra en EMITIDO (inbox GoSocket)', async () => {
        const billing = billingMock();
        service = new ComprasService(prisma as never, undefined, undefined, undefined, billing as never);
        prisma.empresa.findUnique.mockResolvedValue({ id: 'EMP-1', rut: '77.032.638-9' });
        billing.getReceivedPurchaseDocuments.mockResolvedValue([
          docBase({ montoNeto: null, montoTotal: null }),
        ]);
        billing.getPurchaseArtifact.mockResolvedValue({
          body: Buffer.from(
            '<DTE><Encabezado><Totales><ExtraInfoTotal name="MntNeto">100000</ExtraInfoTotal></Totales></Encabezado></DTE>',
          ),
          filename: 'doc.xml',
          contentType: 'application/xml',
        });
        prisma.proveedor.findMany.mockResolvedValue([{ id: 'PROV-9', rut: '76111222-3' }]);
        prisma.registroCompra.findFirst.mockResolvedValue(null);
        prisma.registroCompra.create.mockImplementation(
          async ({ data }: { data: Record<string, unknown> }) => ({ id: 'RC-NEW', ...data }),
        );

        const result = await service.syncRegistrosCompraGoSocket(
          tenantUser(),
          { desde: '2026-09-01', hasta: '2026-09-30' },
        );

        expect(result.creados).toBe(1);
        expect(result.actualizados).toBe(0);
        expect(result.sinCambios).toBe(0);
        expect(billing.getReceivedPurchaseDocuments).toHaveBeenCalledWith(
          '77.032.638-9',
          'EMP-1',
          '2026-09-01',
          '2026-09-30',
        );
        expect(prisma.registroCompra.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              estado: 'EMITIDO',
              empresaId: 'EMP-1',
              factura: '81',
              proveedorId: 'PROV-9',
              proveedorFactura: 'Proveedor Demo SPA',
              monto: 100000,
              gosocketGlobalDocumentId: 'gid-81',
              gosocketEstado: 'PENDIENTE',
            }),
          }),
        );
        expect(result.rows[0]).toMatchObject({ id: 'RC-NEW' });
      });

      it('con match por GlobalDocumentId y estado cambiado, actualiza (no crea)', async () => {
        const billing = billingMock();
        service = new ComprasService(prisma as never, undefined, undefined, undefined, billing as never);
        prisma.empresa.findUnique.mockResolvedValue({ id: 'EMP-1', rut: '77.032.638-9' });
        billing.getReceivedPurchaseDocuments.mockResolvedValue([
          docBase({ estado: 'ACEPTADO' }),
        ]);
        prisma.registroCompra.findFirst.mockResolvedValueOnce({
          id: 'RC-1',
          gosocketGlobalDocumentId: 'gid-81',
          gosocketEstado: 'PENDIENTE',
          gosocketAuthorityStatus: '2',
          gosocketRechazoOrigen: null,
        });
        prisma.registroCompra.update.mockResolvedValue({ id: 'RC-1', gosocketEstado: 'ACEPTADO' });

        const result = await service.syncRegistrosCompraGoSocket(
          tenantUser(),
          { desde: '2026-09-01', hasta: '2026-09-30' },
        );

        expect(result.creados).toBe(0);
        expect(result.actualizados).toBe(1);
        expect(result.sinCambios).toBe(0);
        expect(prisma.registroCompra.create).not.toHaveBeenCalled();
        expect(prisma.registroCompra.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'RC-1' },
            data: expect.objectContaining({ gosocketEstado: 'ACEPTADO' }),
          }),
        );
      });

      it('con match por GlobalDocumentId sin cambios, cuenta sinCambios (no actualizados)', async () => {
        const billing = billingMock();
        service = new ComprasService(prisma as never, undefined, undefined, undefined, billing as never);
        prisma.empresa.findUnique.mockResolvedValue({ id: 'EMP-1', rut: '77.032.638-9' });
        billing.getReceivedPurchaseDocuments.mockResolvedValue([docBase()]);
        prisma.registroCompra.findFirst.mockResolvedValueOnce({
          id: 'RC-1',
          gosocketGlobalDocumentId: 'gid-81',
          gosocketEstado: 'PENDIENTE',
          gosocketAuthorityStatus: '2',
          gosocketRechazoOrigen: null,
        });
        prisma.registroCompra.update.mockResolvedValue({ id: 'RC-1', gosocketEstado: 'PENDIENTE' });

        const result = await service.syncRegistrosCompraGoSocket(
          tenantUser(),
          { desde: '2026-09-01', hasta: '2026-09-30' },
        );

        expect(result.actualizados).toBe(0);
        expect(result.sinCambios).toBe(1);
      });

      it('sin match por GID pero con match por folio (no enlazado aún), enlaza y cuenta actualizados', async () => {
        const billing = billingMock();
        service = new ComprasService(prisma as never, undefined, undefined, undefined, billing as never);
        prisma.empresa.findUnique.mockResolvedValue({ id: 'EMP-1', rut: '77.032.638-9' });
        billing.getReceivedPurchaseDocuments.mockResolvedValue([docBase()]);
        prisma.registroCompra.findFirst
          .mockResolvedValueOnce(null) // no match por GID
          .mockResolvedValueOnce({
            id: 'RC-EXISTENTE',
            gosocketGlobalDocumentId: null,
            gosocketEstado: null,
            gosocketAuthorityStatus: null,
            gosocketRechazoOrigen: null,
          });
        prisma.registroCompra.update.mockResolvedValue({ id: 'RC-EXISTENTE', gosocketEstado: 'PENDIENTE' });

        const result = await service.syncRegistrosCompraGoSocket(
          tenantUser(),
          { desde: '2026-09-01', hasta: '2026-09-30' },
        );

        expect(result.creados).toBe(0);
        expect(result.actualizados).toBe(1);
        expect(prisma.registroCompra.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ factura: '81', gosocketGlobalDocumentId: null }),
          }),
        );
      });
    });

    describe('aceptarRegistroCompraGoSocket / rechazarRegistroCompraGoSocket', () => {
      function pendingRow(over: Record<string, unknown> = {}) {
        return {
          id: 'RC-1',
          empresaId: 'EMP-1',
          gosocketGlobalDocumentId: 'gid-81',
          gosocketEstado: 'PENDIENTE',
          empresa: { rut: '77.032.638-9' },
          ...over,
        };
      }

      it('lanza NotFound si el registro no existe', async () => {
        const billing = billingMock();
        service = new ComprasService(prisma as never, undefined, undefined, undefined, billing as never);
        prisma.registroCompra.findFirst.mockResolvedValue(null);
        await expect(
          service.aceptarRegistroCompraGoSocket(tenantUser(), 'RC-1', {}),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('lanza NotFound si el registro no proviene de GoSocket (sin GlobalDocumentId)', async () => {
        const billing = billingMock();
        service = new ComprasService(prisma as never, undefined, undefined, undefined, billing as never);
        prisma.registroCompra.findFirst.mockResolvedValue(
          pendingRow({ gosocketGlobalDocumentId: null }),
        );
        await expect(
          service.aceptarRegistroCompraGoSocket(tenantUser(), 'RC-1', {}),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(billing.changePurchaseDocumentStatus).not.toHaveBeenCalled();
      });

      it('lanza Conflict si el documento ya fue aceptado/rechazado antes', async () => {
        const billing = billingMock();
        service = new ComprasService(prisma as never, undefined, undefined, undefined, billing as never);
        prisma.registroCompra.findFirst.mockResolvedValue(
          pendingRow({ gosocketEstado: 'ACEPTADO' }),
        );
        await expect(
          service.aceptarRegistroCompraGoSocket(tenantUser(), 'RC-1', {}),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(billing.changePurchaseDocumentStatus).not.toHaveBeenCalled();
      });

      it('rechazar sin comentario lanza BadRequest y no llama a GoSocket', async () => {
        const billing = billingMock();
        service = new ComprasService(prisma as never, undefined, undefined, undefined, billing as never);
        prisma.registroCompra.findFirst.mockResolvedValue(pendingRow());
        await expect(
          service.rechazarRegistroCompraGoSocket(tenantUser(), 'RC-1', { comentario: '   ' } as never),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(billing.changePurchaseDocumentStatus).not.toHaveBeenCalled();
      });

      it('lanza ServiceUnavailable si no hay BillingGatewayClient inyectado', async () => {
        prisma.registroCompra.findFirst.mockResolvedValue(pendingRow());
        await expect(
          service.aceptarRegistroCompraGoSocket(tenantUser(), 'RC-1', {}),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
      });

      it('ACEPTAR: llama Acuse (30) y luego Aceptación (33); persiste ACEPTADO', async () => {
        const billing = billingMock();
        service = new ComprasService(prisma as never, undefined, undefined, undefined, billing as never);
        prisma.registroCompra.findFirst.mockResolvedValue(pendingRow());
        billing.changePurchaseDocumentStatus
          .mockResolvedValueOnce({ success: true, code: 'OK', description: null, messages: [] })
          .mockResolvedValueOnce({ success: true, code: 'OK', description: null, messages: [] })
          .mockResolvedValueOnce({ success: true, code: 'OK', description: null, messages: [] });
        prisma.registroCompra.update.mockResolvedValue({ id: 'RC-1' });
        prisma.usuario.findUnique.mockResolvedValue({ nombre: 'Ana', email: 'ana@almahue.local' });

        await service.aceptarRegistroCompraGoSocket(
          tenantUser({ sub: 'U-2' }),
          'RC-1',
          { comentario: 'Todo conforme' },
        );

        expect(billing.changePurchaseDocumentStatus).toHaveBeenNthCalledWith(
          1,
          'gid-81',
          30,
          '77.032.638-9',
          'EMP-1',
        );
        expect(billing.changePurchaseDocumentStatus).toHaveBeenNthCalledWith(
          2,
          'gid-81',
          32,
          '77.032.638-9',
          'EMP-1',
          'Todo conforme',
        );
        expect(billing.changePurchaseDocumentStatus).toHaveBeenNthCalledWith(
          3,
          'gid-81',
          33,
          '77.032.638-9',
          'EMP-1',
          'Todo conforme',
        );
        // El acuse (paso 1) se persiste de inmediato, antes del paso 2.
        expect(prisma.registroCompra.update).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            where: { id: 'RC-1' },
            data: expect.objectContaining({ gosocketSincronizadoAt: expect.any(Date) }),
          }),
        );
        expect(prisma.registroCompra.update).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            where: { id: 'RC-1' },
            data: expect.objectContaining({
              aceptacionEstado: 'ACEPTADA_PLAZO',
              aceptacionOrigen: 'GOSOCKET',
              gosocketEstado: 'ACEPTADO',
              aceptadaPorId: 'U-2',
              aceptadaPorNombre: 'Ana',
            }),
          }),
        );
      });

      it('RECHAZAR: llama Acuse (30) y luego Reclamo (31); persiste RECHAZADO/COMERCIAL', async () => {
        const billing = billingMock();
        service = new ComprasService(prisma as never, undefined, undefined, undefined, billing as never);
        prisma.registroCompra.findFirst.mockResolvedValue(pendingRow());
        billing.changePurchaseDocumentStatus
          .mockResolvedValueOnce({ success: true, code: 'OK', description: null, messages: [] })
          .mockResolvedValueOnce({ success: true, code: 'OK', description: null, messages: [] });
        prisma.registroCompra.update.mockResolvedValue({ id: 'RC-1' });
        prisma.usuario.findUnique.mockResolvedValue({ nombre: 'Ana', email: 'ana@almahue.local' });

        await service.rechazarRegistroCompraGoSocket(
          tenantUser({ sub: 'U-2' }),
          'RC-1',
          { comentario: 'Precio no coincide con lo pactado' },
        );

        expect(billing.changePurchaseDocumentStatus).toHaveBeenNthCalledWith(
          2,
          'gid-81',
          31,
          '77.032.638-9',
          'EMP-1',
          'Precio no coincide con lo pactado',
        );
        expect(prisma.registroCompra.update).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            data: expect.objectContaining({
              aceptacionEstado: 'RECLAMADA',
              gosocketEstado: 'RECHAZADO',
              gosocketRechazoOrigen: 'COMERCIAL',
              gosocketRechazoMotivo: 'Precio no coincide con lo pactado',
            }),
          }),
        );
      });

      it('si el acuse ya fue enviado (gosocketSincronizadoAt), reintento solo ejecuta paso 2', async () => {
        const billing = billingMock();
        service = new ComprasService(prisma as never, undefined, undefined, undefined, billing as never);
        prisma.registroCompra.findFirst.mockResolvedValue({
          ...pendingRow(),
          gosocketSincronizadoAt: new Date('2026-09-01T12:00:00.000Z'),
        });
        billing.changePurchaseDocumentStatus
          .mockResolvedValueOnce({ success: true, code: 'OK', description: null, messages: [] })
          .mockResolvedValueOnce({ success: true, code: 'OK', description: null, messages: [] });
        prisma.registroCompra.update.mockResolvedValue({ id: 'RC-1' });
        prisma.usuario.findUnique.mockResolvedValue({ nombre: 'Ana', email: 'ana@almahue.local' });

        await service.aceptarRegistroCompraGoSocket(tenantUser(), 'RC-1', { comentario: 'ok' });

        expect(billing.changePurchaseDocumentStatus).toHaveBeenCalledTimes(2);
        expect(billing.changePurchaseDocumentStatus).toHaveBeenNthCalledWith(
          1,
          'gid-81',
          32,
          '77.032.638-9',
          'EMP-1',
          'ok',
        );
        expect(billing.changePurchaseDocumentStatus).toHaveBeenNthCalledWith(
          2,
          'gid-81',
          33,
          '77.032.638-9',
          'EMP-1',
          'ok',
        );
      });

      it('si el paso 2 (evento comercial) falla, lanza BadGateway y no marca como aceptado', async () => {
        const billing = billingMock();
        service = new ComprasService(prisma as never, undefined, undefined, undefined, billing as never);
        prisma.registroCompra.findFirst.mockResolvedValue(pendingRow());
        billing.changePurchaseDocumentStatus
          .mockResolvedValueOnce({ success: true, code: 'OK', description: null, messages: [] })
          .mockResolvedValueOnce({ success: true, code: 'OK', description: null, messages: [] })
          .mockResolvedValueOnce({
            success: false,
            code: 'ERR',
            description: 'Evento no aplica para el estado actual',
            messages: [],
          });
        prisma.registroCompra.update.mockResolvedValue({ id: 'RC-1' });

        await expect(
          service.aceptarRegistroCompraGoSocket(tenantUser(), 'RC-1', { comentario: 'ok' }),
        ).rejects.toBeInstanceOf(BadGatewayException);
        // El acuse (paso 1) sí se persiste aunque falle 32 o 33.
        expect(prisma.registroCompra.update).toHaveBeenCalledTimes(1);
      });
    });

    describe('downloadRegistroCompraArtifact / getRegistroCompraXml', () => {
      it('lanza NotFound si el registro no proviene de GoSocket', async () => {
        const billing = billingMock();
        service = new ComprasService(prisma as never, undefined, undefined, undefined, billing as never);
        prisma.registroCompra.findFirst.mockResolvedValue({
          id: 'RC-MANUAL',
          gosocketGlobalDocumentId: null,
          empresa: { rut: '77.032.638-9' },
        });
        await expect(
          service.downloadRegistroCompraArtifact(tenantUser(), 'RC-MANUAL', 'pdf'),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(billing.getPurchaseArtifact).not.toHaveBeenCalled();
      });

      it('getRegistroCompraXml pide el artefacto xml y lo devuelve como texto', async () => {
        const billing = billingMock();
        service = new ComprasService(prisma as never, undefined, undefined, undefined, billing as never);
        prisma.registroCompra.findFirst.mockResolvedValue({
          id: 'RC-1',
          empresaId: 'EMP-1',
          gosocketGlobalDocumentId: 'gid-81',
          empresa: { rut: '77.032.638-9' },
        });
        billing.getPurchaseArtifact.mockResolvedValue({
          body: Buffer.from('<DTE>ok</DTE>', 'utf-8'),
          contentType: 'application/xml',
          filename: '81.xml',
          dummy: false,
        });

        const xml = await service.getRegistroCompraXml(tenantUser(), 'RC-1');
        expect(xml).toBe('<DTE>ok</DTE>');
        expect(billing.getPurchaseArtifact).toHaveBeenCalledWith(
          'gid-81',
          'xml',
          '77.032.638-9',
          'EMP-1',
        );
      });
    });

    describe('runAceptacionCompraAutoIfDue excluye documentos GoSocket', () => {
      it('el filtro de aceptación tácita por plazo excluye registros con gosocketGlobalDocumentId', async () => {
        prisma.empresa.findMany.mockResolvedValue([
          { id: 'EMP-1', aceptacionCompraPlazoDias: 8 },
        ]);
        prisma.registroCompra.updateMany.mockResolvedValue({ count: 3 });

        await service.runAceptacionCompraAutoIfDue();

        expect(prisma.registroCompra.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              empresaId: 'EMP-1',
              aceptacionEstado: 'PENDIENTE',
              gosocketGlobalDocumentId: null,
            }),
          }),
        );
      });
    });
  });
});
