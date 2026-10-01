import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ComercialService } from './comercial.service';
import { ContabilizarService } from '../contabilidad/contabilizar.service';
import { createPrismaMock, superAdminUser, tenantUser } from '../../test-utils/prisma-mock';

describe('ComercialService', () => {
  let service: ComercialService;
  let prisma: ReturnType<typeof createPrismaMock>['prisma'];

  beforeEach(() => {
    const harness = createPrismaMock();
    prisma = harness.prisma;
    prisma.documentoComercial.findMany.mockResolvedValue([]);
    service = new ComercialService(harness.mock);
  });

  it('rechaza crear cliente sin dirección fiscal y comuna', async () => {
    await expect(
      service.createCliente(tenantUser(), {
        rut: '76.210.101-7',
        razonSocial: 'Cliente sin domicilio',
        credito: 0,
        vendedor: 'Ana',
      } as never, 'EMP-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.cliente.create).not.toHaveBeenCalled();
  });

  it('lista clientes', async () => {
    prisma.cliente.findMany.mockResolvedValue([
      {
        id: 'CL-1',
        rut: '1-9',
        razonSocial: 'Cliente Demo',
        credito: 1000,
        vendedor: 'Ana',
        activo: true,
      },
    ]);
    const rows = await service.getClientes(tenantUser(), 'EMP-1');
    expect(rows[0].razonSocial).toBe('Cliente Demo');
  });

  it('rechaza reversar documento ya anulado', async () => {
    prisma.documentoComercial.findUnique.mockResolvedValue({
      id: 'D1',
      estado: 'ANULADO',
      empresaId: 'EMP-1',
      folio: 'F-1',
      neto: 100,
    });
    await expect(
      service.reversarDocumento(tenantUser(), 'D1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('P0-6 reversarDocumento revierte la CXC', () => {
    it('genera movimiento CC inverso al reversar una FACTURA', async () => {
      const createAsientoReversa = jest.fn().mockResolvedValue({ numero: 'ASI-REV-1' });
      const registrarMovimiento = jest.fn().mockResolvedValue({});
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ComercialService(
        harness.mock,
        { createAsientoReversa } as never,
        { registrarMovimiento } as never,
      );

      prisma.documentoComercial.findUnique.mockResolvedValue({
        id: 'D1',
        tipo: 'FACTURA',
        estado: 'CONTABILIZADA',
        empresaId: 'EMP-1',
        folio: 'FAC-1',
        fecha: new Date('2026-07-01'),
        neto: 1000,
        clienteId: 'CL-1',
        cliente: 'Cliente Demo',
        asientoOriginal: 'ASI-1',
        asientoReversador: null,
        asientoNuevo: null,
      });
      prisma.asiento.findFirst.mockResolvedValue({ id: 'ASI-1', numero: 'ASI-1' });
      prisma.documentoComercial.update.mockResolvedValue({
        id: 'D1',
        tipo: 'FACTURA',
        estado: 'EMITIDO',
        empresaId: 'EMP-1',
        folio: 'FAC-1',
        fecha: new Date('2026-07-01'),
        neto: 1000,
        cliente: 'Cliente Demo',
        asientoOriginal: 'ASI-1',
        asientoReversador: 'ASI-REV-1',
        asientoNuevo: null,
      });

      await service.reversarDocumento(tenantUser(), 'D1');

      expect(registrarMovimiento).toHaveBeenCalledWith(
        expect.objectContaining({
          terceroTipo: 'CLIENTE',
          documentoRef: 'FAC-1',
          debe: 0,
          haber: 1190,
        }),
      );
    });
  });

  describe('EX-08 cliente vs empresa', () => {
    it('rechaza createDocumento con clienteId de otra empresa', async () => {
      prisma.documentoComercial.findFirst.mockResolvedValue({
        id: 'OV-1',
        tipo: 'ORDEN_VENTA',
        estado: 'CONFIRMADA',
        folio: 'OV-1',
      });
      prisma.cliente.findFirst.mockResolvedValue(null);
      await expect(
        service.createDocumento(
          tenantUser(),
          {
            folio: 'FAC-X',
            tipo: 'FACTURA',
            cliente: 'Cliente Ajeno',
            clienteId: 'CL-EMP2',
            fecha: '2026-07-01',
            neto: 1000,
            documentoOrigenId: 'OV-1',
          },
          'EMP-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.documentoComercial.create).not.toHaveBeenCalled();
    });
  });

  describe('Cotización ya no es documento del ERP', () => {
    it('rechaza convertir COTIZACION → NP', async () => {
      prisma.documentoComercial.findUnique.mockResolvedValue({
        id: 'DOC-COT',
        folio: 'COT-1',
        tipo: 'COTIZACION',
        estado: 'EMITIDO',
        empresaId: 'EMP-1',
      });
      await expect(
        service.convertirDocumento(
          tenantUser({ permisos: ['compras:write'] }),
          'DOC-COT',
          { tipoDestino: 'NP', folioNuevo: 'NP-COT-1' },
        ),
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/parten de la orden de compra/i),
      });
      expect(prisma.documentoComercial.create).not.toHaveBeenCalled();
      expect(prisma.ordenCompra.create).not.toHaveBeenCalled();
    });

    it('rechaza convertir COTIZACION → OC', async () => {
      prisma.documentoComercial.findUnique.mockResolvedValue({
        id: 'DOC-COT',
        folio: 'COT-88',
        tipo: 'COTIZACION',
        estado: 'EMITIDO',
        empresaId: 'EMP-1',
      });
      await expect(
        service.convertirDocumento(
          tenantUser({ permisos: ['compras:write'] }),
          'DOC-COT',
          { tipoDestino: 'OC' },
        ),
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/solo referencia/i),
      });
      expect(prisma.ordenCompra.create).not.toHaveBeenCalled();
    });

    it('rechaza createDocumento tipo COTIZACION', async () => {
      await expect(
        service.createDocumento(
          tenantUser({ permisos: ['compras:write'] }),
          {
            folio: 'COT-1',
            tipo: 'COTIZACION',
            cliente: 'Prov SA',
            fecha: '2026-08-01',
            neto: 1000,
          },
          'EMP-1',
        ),
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/parten de la orden de compra/i),
      });
      expect(prisma.documentoComercial.create).not.toHaveBeenCalled();
    });

    it('rechaza createDocumento tipo NP', async () => {
      await expect(
        service.createDocumento(
          tenantUser(),
          {
            folio: 'NP-1',
            tipo: 'NP',
            cliente: 'Cliente Demo',
            fecha: '2026-08-01',
            neto: 1000,
          },
          'EMP-1',
        ),
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/nota de pedido/i),
      });
      expect(prisma.documentoComercial.create).not.toHaveBeenCalled();
    });

    it('getDocumentos con tipo=COTIZACION devuelve lista vacía', async () => {
      const rows = await service.getDocumentos(tenantUser(), 'EMP-1', undefined, {
        tipo: 'COTIZACION',
      });
      expect(rows).toEqual([]);
      expect(prisma.documentoComercial.findMany).not.toHaveBeenCalled();
    });

    it('getDocumentos por defecto excluye COTIZACION y NP', async () => {
      await service.getDocumentos(tenantUser(), 'EMP-1');
      expect(prisma.documentoComercial.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            empresaId: 'EMP-1',
            tipo: { in: ['FACTURA', 'NC', 'ND', 'GUIA', 'ORDEN_VENTA'] },
          }),
        }),
      );
    });

    it('getDocumento de COTIZACION histórica responde 404', async () => {
      prisma.documentoComercial.findFirst.mockResolvedValue({
        id: 'DOC-COT',
        tipo: 'COTIZACION',
        empresaId: 'EMP-1',
        folio: 'COT-1',
      });
      await expect(service.getDocumento(tenantUser(), 'DOC-COT', 'EMP-1')).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('P1-7 IVA real (persistido y contabilizado)', () => {
    it('createDocumento calcula 19% de IVA sobre el neto si no se envía', async () => {
      prisma.documentoComercial.findFirst.mockResolvedValue({
        id: 'OV-1',
        tipo: 'ORDEN_VENTA',
        estado: 'CONFIRMADA',
        folio: 'OV-1',
      });
      prisma.documentoComercial.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ id: 'D-1', ...data }),
      );
      const row = await service.createDocumento(
        tenantUser(),
        {
          folio: 'FAC-IVA-1',
          tipo: 'FACTURA',
          cliente: 'Cliente Demo',
          fecha: '2026-08-01',
          neto: 1000,
          documentoOrigenId: 'OV-1',
        },
        'EMP-1',
      );
      expect(prisma.documentoComercial.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ neto: 1000, iva: 190 }) }),
      );
      expect(row.iva).toBe(190);
      expect(row.total).toBe(1190);
    });

    it('createDocumento no calcula IVA para indicadorVenta EXPORTACION', async () => {
      prisma.documentoComercial.findFirst.mockResolvedValue({
        id: 'OV-1',
        tipo: 'ORDEN_VENTA',
        estado: 'CONFIRMADA',
        folio: 'OV-1',
      });
      prisma.documentoComercial.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ id: 'D-2', ...data }),
      );
      const row = await service.createDocumento(
        tenantUser(),
        {
          folio: 'FAC-EXPO-1',
          tipo: 'FACTURA',
          cliente: 'Cliente Exportador',
          fecha: '2026-08-01',
          neto: 1000,
          indicadorVenta: 'EXPORTACION',
          documentoOrigenId: 'OV-1',
        },
        'EMP-1',
      );
      expect(prisma.documentoComercial.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ iva: 0 }) }),
      );
      expect(row.iva).toBe(0);
      expect(row.total).toBe(1000);
    });

    it('createDocumento FACTURA EXPORTACION no aplica piso D16', async () => {
      prisma.documentoComercial.findFirst.mockResolvedValue({
        id: 'OV-1',
        tipo: 'ORDEN_VENTA',
        estado: 'CONFIRMADA',
        folio: 'OV-1',
      });
      prisma.insumo.findFirst.mockResolvedValue({
        id: 'INS-1',
        codigo: 'A',
        nombre: 'Art',
        unidad: 'UN',
        costoPromedio: 5,
        precioCompra: 10,
        empresaId: 'EMP-1',
      });
      prisma.documentoComercial.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ id: 'D-EXP', ...data }),
      );
      await expect(
        service.createDocumento(
          tenantUser(),
          {
            folio: 'FAC-EXP-D16',
            tipo: 'FACTURA',
            cliente: 'Cliente Exportador',
            fecha: '2026-09-04',
            neto: 8,
            indicadorVenta: 'EXPORTACION',
            documentoOrigenId: 'OV-1',
            lineas: [{
              descripcion: 'Art',
              cantidad: 1,
              precioUnitario: 8,
              total: 8,
              tipoLinea: 'PRODUCTO',
              insumoId: 'INS-1',
            }],
          },
          'EMP-1',
        ),
      ).resolves.toMatchObject({ iva: 0 });
    });

    it('updateDocumento recalcula el IVA si cambia el neto de las líneas', async () => {
      prisma.documentoComercial.findUnique.mockResolvedValue({
        id: 'D1',
        tipo: 'FACTURA',
        estado: 'BORRADOR',
        empresaId: 'EMP-1',
        folio: 'FAC-EDIT-1',
        cliente: 'Cliente Demo',
        clienteId: 'CL-1',
        neto: 1000,
        iva: 190,
        indicadorVenta: null,
        descuentoGlobalPct: 0,
      });
      prisma.insumo.findFirst.mockResolvedValue({
        id: 'INS-1',
        codigo: 'ART-1',
        nombre: 'Artículo',
        unidad: 'UN',
        costoPromedio: 0,
        empresaId: 'EMP-1',
      });
      prisma.documentoComercial.update.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ id: 'D1', ...data }),
      );

      await service.updateDocumento(tenantUser(), 'D1', {
        folio: 'FAC-EDIT-1',
        tipo: 'FACTURA',
        cliente: 'Cliente Demo',
        fecha: '2026-08-01',
        neto: 1000,
        lineas: [{
          descripcion: 'Item',
          cantidad: 1,
          precioUnitario: 2000,
          total: 2000,
          tipoLinea: 'SERVICIO',
          insumoId: 'INS-1',
        }],
      });

      expect(prisma.documentoComercial.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ neto: 2000, iva: 380 }),
        }),
      );
    });

    it('grabarDocumentoContabilizar imputa centro de costo por ítem en el asiento', async () => {
      const createAsiento = jest.fn().mockResolvedValue({ numero: 'ASI-CC-ITEM' });
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ComercialService(harness.mock, { createAsiento } as never);

      prisma.documentoComercial.findFirst.mockResolvedValue({
        id: 'D1',
        tipo: 'FACTURA',
        estado: 'EMITIDO',
        empresaId: 'EMP-1',
        folio: 'FAC-CC-1',
        fecha: new Date('2026-08-01'),
        neto: 1000,
        iva: 190,
        lineas: [
          {
            descripcion: 'Caja 1',
            cantidad: 1,
            precioUnitario: 600,
            descuentoPct: 0,
            total: 600,
            cuentaContableId: 'CTA-VENTAS',
            centroCostoId: 'CC-A',
          },
          {
            descripcion: 'Caja 2',
            cantidad: 1,
            precioUnitario: 400,
            descuentoPct: 0,
            total: 400,
            cuentaContableId: 'CTA-VENTAS',
            centroCostoId: 'CC-B',
          },
        ],
        cuentaContableId: null,
        centroCostoId: 'CC-CABECERA',
        asientoOriginal: null,
        asientoReversador: null,
        asientoNuevo: null,
        cliente: 'Cliente Demo',
        clienteId: 'CL-1',
        indicadorVenta: null,
      });
      prisma.configContableSii.findFirst.mockResolvedValue(null);
      prisma.cuentaContable.findFirst
        .mockResolvedValueOnce({ id: 'CTA-CLIENTES' })
        .mockResolvedValueOnce({ id: 'CTA-IVA' });
      prisma.documentoComercial.update.mockResolvedValue({
        id: 'D1',
        folio: 'FAC-CC-1',
        fecha: new Date('2026-08-01'),
        cliente: 'Cliente Demo',
      });

      await service.grabarDocumentoContabilizar(tenantUser(), 'D1', {
        cuentaContableId: 'CTA-VENTAS',
      });

      expect(createAsiento).toHaveBeenCalledWith(
        expect.objectContaining({
          lineas: expect.arrayContaining([
            expect.objectContaining({
              cuentaId: 'CTA-VENTAS',
              haber: 600,
              centroCostoId: 'CC-A',
            }),
            expect.objectContaining({
              cuentaId: 'CTA-VENTAS',
              haber: 400,
              centroCostoId: 'CC-B',
            }),
          ]),
        }),
      );
      const asientoLineas = createAsiento.mock.calls[0][0].lineas as Array<{ haber: number; centroCostoId?: string }>;
      const ingresos = asientoLineas.filter((l) => l.haber > 0 && l.centroCostoId);
      expect(ingresos).toHaveLength(2);
    });

    it('grabarDocumentoContabilizar genera línea de IVA a la cuenta fiscal correspondiente', async () => {
      const createAsiento = jest.fn().mockResolvedValue({ numero: 'ASI-IVA-1' });
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ComercialService(harness.mock, { createAsiento } as never);

      prisma.documentoComercial.findFirst.mockResolvedValue({
        id: 'D1',
        tipo: 'FACTURA',
        estado: 'EMITIDO',
        empresaId: 'EMP-1',
        folio: 'FAC-IVA-1',
        fecha: new Date('2026-08-01'),
        neto: 1000,
        iva: 190,
        lineas: null,
        cuentaContableId: null,
        centroCostoId: null,
        asientoOriginal: null,
        asientoReversador: null,
        asientoNuevo: null,
        cliente: 'Cliente Demo',
        clienteId: 'CL-1',
        indicadorVenta: null,
      });
      prisma.configContableSii.findFirst.mockResolvedValue(null);
      prisma.cuentaContable.findFirst
        .mockResolvedValueOnce({ id: 'CTA-CLIENTES' })
        .mockResolvedValueOnce({ id: 'CTA-IVA' });
      prisma.documentoComercial.update.mockResolvedValue({
        id: 'D1',
        folio: 'FAC-IVA-1',
        fecha: new Date('2026-08-01'),
        cliente: 'Cliente Demo',
      });

      await service.grabarDocumentoContabilizar(tenantUser(), 'D1', {
        cuentaContableId: 'CTA-VENTAS',
      });

      expect(createAsiento).toHaveBeenCalledWith(
        expect.objectContaining({
          lineas: expect.arrayContaining([
            expect.objectContaining({ cuentaId: 'CTA-CLIENTES', debe: 1190, haber: 0 }),
            expect.objectContaining({ cuentaId: 'CTA-VENTAS', debe: 0, haber: 1000 }),
            expect.objectContaining({
              cuentaId: 'CTA-IVA',
              debe: 0,
              haber: 190,
              glosa: 'IVA débito fiscal',
            }),
          ]),
        }),
      );
    });

    it('emite FACTURA sin cuenta y deja EMITIDO (imputación en libro)', async () => {
      const emit = jest.fn().mockResolvedValue({
        emissionId: 'em-1',
        partner: 'gosocket',
        connectionMode: 'sandbox',
        status: 'PENDING',
        folioOficial: null,
        folioSimulado: null,
        globalDocumentId: 'g1',
        countryDocumentId: null,
        messages: [],
        artifacts: {},
        stub: false,
      });
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ComercialService(
        harness.mock,
        undefined,
        undefined,
        { isEnabled: () => true, emit } as never,
      );
      const current = {
        id: 'D1',
        tipo: 'FACTURA',
        estado: 'BORRADOR',
        empresaId: 'EMP-1',
        folio: 'FA-1',
        fecha: new Date('2026-09-07'),
        neto: 1000,
        iva: 190,
        lineas: [{ descripcion: 'x', cantidad: 1, precioUnitario: 1000, total: 1000 }],
        cuentaContableId: null,
        billingEmissionId: null,
        indicadorVenta: 'VENTA',
        receptorDireccion: 'Av. Principal 100',
        receptorComuna: 'Santiago',
        receptorCiudad: 'Santiago',
      };
      prisma.documentoComercial.findFirst.mockResolvedValue(current);
      prisma.empresa.findUnique.mockResolvedValue({
        id: 'EMP-1',
        rut: '77.032.638-9',
        razonSocial: 'Export',
        gosocketBillerId: 'd159916d-4977-499f-a52e-70550fc379ee',
      });
      prisma.documentoComercial.update.mockResolvedValue({
        ...current,
        estado: 'EMITIDO',
        billingEmissionId: 'em-1',
        empresa: { id: 'EMP-1', razonSocial: 'Export' },
      });

      const row = await service.emitirDocumentoFiscal(tenantUser(), 'D1', 'EMP-1');
      expect(emit).toHaveBeenCalled();
      expect(row.estado).toBe('EMITIDO');
    });

    it('tras emitir PENDING consulta GetDocument y persiste folioOficial', async () => {
      const emit = jest.fn().mockResolvedValue({
        emissionId: 'em-nc-1',
        partner: 'gosocket',
        connectionMode: 'sandbox',
        status: 'PENDING',
        folioOficial: null,
        folioSimulado: null,
        globalDocumentId: 'g-nc',
        countryDocumentId: null,
        messages: [],
        artifacts: {},
        stub: false,
      });
      const refreshEmission = jest.fn().mockResolvedValue({
        emissionId: 'em-nc-1',
        partner: 'gosocket',
        connectionMode: 'sandbox',
        status: 'ACCEPTED',
        folioOficial: '52',
        folioSimulado: null,
        globalDocumentId: 'g-nc',
        countryDocumentId: null,
        messages: [],
        disclaimer: null,
        artifacts: { pdfAvailable: true, xmlAvailable: true },
        stub: false,
      });
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ComercialService(
        harness.mock,
        undefined,
        undefined,
        { isEnabled: () => true, emit, refreshEmission } as never,
      );
      const current = {
        id: 'NC-1',
        tipo: 'NC',
        estado: 'BORRADOR',
        empresaId: 'EMP-1',
        folio: '10155928',
        fecha: new Date('2026-09-08'),
        neto: 183150,
        iva: 0,
        lineas: [{ descripcion: 'x', cantidad: 1, precioUnitario: 183150, total: 183150 }],
        billingEmissionId: null,
        indicadorVenta: 'VENTA',
        receptorDireccion: 'Av. Principal 100',
        receptorComuna: 'Santiago',
        receptorCiudad: 'Santiago',
      };
      prisma.documentoComercial.findFirst.mockResolvedValue(current);
      prisma.empresa.findUnique.mockResolvedValue({
        id: 'EMP-1',
        rut: '77.032.638-9',
        razonSocial: 'Export',
        gosocketBillerId: 'd159916d-4977-499f-a52e-70550fc379ee',
      });
      prisma.documentoComercial.update
        .mockResolvedValueOnce({
          ...current,
          estado: 'EMITIDO',
          billingEmissionId: 'em-nc-1',
          folioOficial: null,
        })
        .mockResolvedValueOnce({
          ...current,
          estado: 'EMITIDO',
          billingEmissionId: 'em-nc-1',
          billingStatus: 'ACCEPTED',
          folioOficial: '52',
        });

      const row = await service.emitirDocumentoFiscal(tenantUser(), 'NC-1', 'EMP-1');
      expect(refreshEmission).toHaveBeenCalledWith('em-nc-1');
      expect(row.folioOficial).toBe('52');
    });

    it('no contabiliza FACTURA si no hay cuenta en ítems ni en cabecera', async () => {
      const emit = jest.fn();
      const createAsiento = jest.fn();
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ComercialService(
        harness.mock,
        { createAsiento, assertAsientoValido: jest.fn() } as never,
        undefined,
        { isEnabled: () => true, emit } as never,
      );
      prisma.documentoComercial.findFirst.mockResolvedValue({
        id: 'D1',
        tipo: 'FACTURA',
        estado: 'BORRADOR',
        empresaId: 'EMP-1',
        folio: 'FA-1',
        fecha: new Date('2026-09-07'),
        neto: 1000,
        iva: 190,
        lineas: [{ descripcion: 'x', cantidad: 1, precioUnitario: 1000, total: 1000 }],
        cuentaContableId: null,
        asientoOriginal: null,
        asientoReversador: null,
        asientoNuevo: null,
      });

      await expect(
        service.grabarDocumentoContabilizar(tenantUser(), 'D1'),
      ).rejects.toThrow(/Asocie cuenta contable/);
      expect(emit).not.toHaveBeenCalled();
      expect(createAsiento).not.toHaveBeenCalled();
    });

    it('persiste billingEmissionId antes del asiento para no reemitir si contabilizar falla', async () => {
      const emit = jest.fn().mockResolvedValue({
        emissionId: 'em-1',
        partner: 'gosocket',
        connectionMode: 'sandbox',
        status: 'ACCEPTED',
        folioOficial: '10',
        folioSimulado: null,
        globalDocumentId: 'g1',
        countryDocumentId: null,
        messages: [],
        disclaimer: null,
        artifacts: { pdfAvailable: false, xmlAvailable: false },
        stub: false,
      });
      const createAsiento = jest.fn().mockRejectedValue(new Error('asiento caido'));
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ComercialService(
        harness.mock,
        { createAsiento } as never,
        undefined,
        { isEnabled: () => true, emit } as never,
      );

      prisma.documentoComercial.findFirst.mockResolvedValue({
        id: 'D1',
        tipo: 'FACTURA',
        estado: 'BORRADOR',
        empresaId: 'EMP-1',
        folio: '8001',
        fecha: new Date('2026-08-19'),
        neto: 1000,
        iva: 190,
        lineas: [{ descripcion: 'x', cantidad: 1, precioUnitario: 1000, total: 1000, cuentaContableId: 'CTA-V' }],
        cuentaContableId: 'CTA-V',
        centroCostoId: null,
        asientoOriginal: null,
        asientoReversador: null,
        asientoNuevo: null,
        cliente: 'Cliente',
        clienteId: 'CL-1',
        indicadorVenta: null,
        billingEmissionId: null,
        receptorRut: '76.210.101-K',
        receptorDireccion: 'Av. Apoquindo 4501',
        receptorComuna: 'Las Condes',
        receptorCiudad: 'Santiago',
      });
      prisma.empresa.findUnique.mockResolvedValue({
        id: 'EMP-1',
        rut: '77.032.638-9',
        razonSocial: 'ALMAHUE EXPORT SPA',
      });
      prisma.configContableSii.findFirst.mockResolvedValue(null);
      prisma.cuentaContable.findFirst.mockResolvedValue({ id: 'CTA-CLI' });
      prisma.documentoComercial.update.mockResolvedValue({ id: 'D1', folio: '8001' });

      await expect(
        service.grabarDocumentoContabilizar(tenantUser(), 'D1', { cuentaContableId: 'CTA-V' }),
      ).rejects.toThrow('asiento caido');

      expect(emit).toHaveBeenCalledTimes(1);
      expect(prisma.documentoComercial.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ billingEmissionId: 'em-1', billingStatus: 'ACCEPTED' }),
        }),
      );
      expect(prisma.documentoComercial.update.mock.invocationCallOrder[0]).toBeLessThan(
        createAsiento.mock.invocationCallOrder[0],
      );
    });

    it('rechaza emitir EXPORTACION sin COMEX mínimo antes de GoSocket', async () => {
      const emit = jest.fn();
      const createAsiento = jest.fn();
      const assertAsientoValido = jest.fn();
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ComercialService(
        harness.mock,
        { createAsiento, assertAsientoValido } as never,
        undefined,
        { isEnabled: () => true, emit } as never,
      );

      prisma.documentoComercial.findFirst.mockResolvedValue({
        id: 'D-EXP',
        tipo: 'FACTURA',
        estado: 'BORRADOR',
        empresaId: 'EMP-1',
        folio: 'FAC-EXP',
        fecha: new Date('2026-09-04'),
        neto: 80,
        iva: 0,
        lineas: [{ descripcion: 'x', cantidad: 1, precioUnitario: 80, total: 80, cuentaContableId: 'CTA-V' }],
        cuentaContableId: 'CTA-V',
        centroCostoId: null,
        asientoOriginal: null,
        asientoReversador: null,
        asientoNuevo: null,
        cliente: 'Export',
        clienteId: 'CL-1',
        indicadorVenta: 'EXPORTACION',
        tipoCambio: null,
        monedaCodigo: null,
        bultoCantidad: null,
        montoOtraMoneda: null,
        billingEmissionId: null,
        receptorRut: 'EX-US-1',
        receptorDireccion: 'Harbor St 1',
        receptorComuna: 'Miami',
        receptorCiudad: 'Miami',
      });
      prisma.empresa.findUnique.mockResolvedValue({
        id: 'EMP-1',
        rut: '77.032.638-9',
        razonSocial: 'Export',
      });
      prisma.configContableSii.findFirst.mockResolvedValue(null);
      prisma.cuentaContable.findFirst.mockResolvedValue({ id: 'CTA-CLI' });

      await expect(
        service.grabarDocumentoContabilizar(tenantUser(), 'D-EXP', { cuentaContableId: 'CTA-V' }),
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/país del receptor|tipo de cambio|bultos/i),
      });
      expect(emit).not.toHaveBeenCalled();
      expect(createAsiento).not.toHaveBeenCalled();
    });

    it('reintenta el asiento sin reemitir si billingEmissionId ya existe', async () => {
      const emit = jest.fn();
      const createAsiento = jest.fn().mockResolvedValue({ numero: 'ASI-RECUPERADO' });
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ComercialService(
        harness.mock,
        { createAsiento } as never,
        undefined,
        { isEnabled: () => true, emit } as never,
      );
      const documento = {
        id: 'D1',
        tipo: 'FACTURA',
        estado: 'BORRADOR',
        empresaId: 'EMP-1',
        folio: '8001',
        fecha: new Date('2026-08-19'),
        neto: 1000,
        iva: 190,
        lineas: [{ descripcion: 'x', cantidad: 1, precioUnitario: 1000, total: 1000, cuentaContableId: 'CTA-V' }],
        cuentaContableId: 'CTA-V',
        centroCostoId: null,
        asientoOriginal: null,
        asientoReversador: null,
        asientoNuevo: null,
        cliente: 'Cliente',
        clienteId: 'CL-1',
        indicadorVenta: null,
        billingEmissionId: 'em-1',
        billingStatus: 'ACCEPTED',
      };
      prisma.documentoComercial.findFirst.mockResolvedValue(documento);
      prisma.configContableSii.findFirst.mockResolvedValue(null);
      prisma.cuentaContable.findFirst.mockResolvedValue({ id: 'CTA-CLI' });
      prisma.documentoComercial.update.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ ...documento, ...data }),
      );

      const result = await service.grabarDocumentoContabilizar(
        tenantUser(),
        'D1',
        { cuentaContableId: 'CTA-V' },
      );

      expect(emit).not.toHaveBeenCalled();
      expect(createAsiento).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expect.objectContaining({
        estado: 'CONTABILIZADA',
        asientoOriginal: 'ASI-RECUPERADO',
        billingEmissionId: 'em-1',
      }));
    });

    it('no envía a GoSocket si la cuenta de clientes no es imputable', async () => {
      const emit = jest.fn();
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ComercialService(
        harness.mock,
        new ContabilizarService(harness.mock),
        undefined,
        { isEnabled: () => true, emit } as never,
      );

      prisma.documentoComercial.findFirst.mockResolvedValue({
        id: 'D1',
        tipo: 'FACTURA',
        estado: 'BORRADOR',
        empresaId: 'EMP-1',
        folio: '10037770',
        fecha: new Date('2026-08-19'),
        neto: 1850,
        iva: 352,
        lineas: [{ descripcion: 'x', cantidad: 1, precioUnitario: 1850, total: 1850, cuentaContableId: 'CTA-V' }],
        cuentaContableId: 'CTA-V',
        centroCostoId: null,
        asientoOriginal: null,
        asientoReversador: null,
        asientoNuevo: null,
        cliente: 'Cliente',
        clienteId: 'CL-1',
        indicadorVenta: null,
        billingEmissionId: null,
      });
      prisma.configContableSii.findFirst.mockImplementation(
        async ({ where }: { where: { tipoDocumentoSii?: { in?: string[] } } }) => {
          const tipos = where.tipoDocumentoSii?.in ?? [];
          if (tipos.includes('CLIENTES') || tipos.includes('CLIENTES_POR_COBRAR')) {
            return { cuentaContableId: 'CTA-PADRE' };
          }
          if (tipos.some((t) => t.startsWith('IVA'))) {
            return { cuentaContableId: 'CTA-IVA' };
          }
          return null;
        },
      );
      prisma.periodoContable.findUnique.mockResolvedValue({
        id: 'PER-1',
        codigo: '2026-08',
        estado: 'ABIERTO',
        empresaId: 'EMP-1',
      });
      prisma.cuentaContable.findMany.mockResolvedValue([
        {
          id: 'CTA-V',
          codigo: '4-1-01-01-01',
          noImputable: false,
          activa: true,
          centrosCosto: [],
          elementosCosto: [],
          areasNegocio: [],
        },
        {
          id: 'CTA-PADRE',
          codigo: '1-1-02-01',
          noImputable: true,
          activa: true,
          centrosCosto: [],
          elementosCosto: [],
          areasNegocio: [],
        },
        {
          id: 'CTA-IVA',
          codigo: '2-1-01-01-01',
          noImputable: false,
          activa: true,
          centrosCosto: [],
          elementosCosto: [],
          areasNegocio: [],
        },
      ]);

      await expect(
        service.grabarDocumentoContabilizar(tenantUser(), 'D1', { cuentaContableId: 'CTA-V' }),
      ).rejects.toThrow(/1-1-02-01/);
      expect(emit).not.toHaveBeenCalled();
      expect(prisma.documentoComercial.update).not.toHaveBeenCalled();
      expect(prisma.asiento.create).not.toHaveBeenCalled();
    });

    it('no emite FACTURA si el servicio contable está ausente', async () => {
      const emit = jest.fn();
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ComercialService(
        harness.mock,
        undefined,
        undefined,
        { isEnabled: () => true, emit } as never,
      );
      prisma.documentoComercial.findFirst.mockResolvedValue({
        id: 'D1',
        tipo: 'FACTURA',
        empresaId: 'EMP-1',
        folio: '8001',
      });

      await expect(
        service.grabarDocumentoContabilizar(tenantUser(), 'D1'),
      ).rejects.toThrow('Servicio de contabilización no disponible');
      expect(emit).not.toHaveBeenCalled();
      expect(prisma.documentoComercial.update).not.toHaveBeenCalled();
    });

    it('GUIA sigue emitiendo sin requerir servicio contable', async () => {
      const emit = jest.fn().mockResolvedValue({
        emissionId: 'inline-guia-1',
        partner: 'stub-inline',
        connectionMode: 'inline',
        status: 'ACCEPTED_STUB',
        folioOficial: null,
        folioSimulado: 'STUB-52-1',
        globalDocumentId: null,
        countryDocumentId: null,
        messages: [],
        disclaimer: 'stub',
        artifacts: { pdfAvailable: false, xmlAvailable: false },
        stub: true,
      });
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ComercialService(
        harness.mock,
        undefined,
        undefined,
        { isEnabled: () => true, emit } as never,
      );
      const guia = {
        id: 'G1',
        tipo: 'GUIA',
        estado: 'BORRADOR',
        empresaId: 'EMP-1',
        folio: 'G-1',
        fecha: new Date('2026-08-19'),
        neto: 1000,
        iva: 0,
        lineas: [],
        cliente: 'Cliente',
        billingEmissionId: null,
        receptorDireccion: 'Av. Apoquindo 4501',
        receptorComuna: 'Las Condes',
        receptorCiudad: 'Santiago',
      };
      prisma.documentoComercial.findFirst.mockResolvedValue(guia);
      prisma.empresa.findUnique.mockResolvedValue({
        id: 'EMP-1',
        rut: '77.032.638-9',
        razonSocial: 'ALMAHUE EXPORT SPA',
      });
      prisma.documentoComercial.update.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ ...guia, ...data }),
      );

      const result = await service.grabarDocumentoContabilizar(tenantUser(), 'G1');

      expect(emit).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expect.objectContaining({
        estado: 'EMITIDO',
        billingEmissionId: 'inline-guia-1',
      }));
    });

    it('responde 404 y consulta por tenant al contabilizar un documento ajeno', async () => {
      prisma.documentoComercial.findFirst.mockResolvedValue(null);

      await expect(
        service.grabarDocumentoContabilizar(tenantUser(), 'DOC-AJENO'),
      ).rejects.toMatchObject({
        status: 404,
        message: 'Documento no encontrado',
      });
      expect(prisma.documentoComercial.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'DOC-AJENO',
          empresaId: { in: ['EMP-1'] },
        },
      });
      expect(prisma.documentoComercial.findUnique).not.toHaveBeenCalled();
    });

    it('mantiene consulta global por ID para superadmin', async () => {
      prisma.documentoComercial.findFirst.mockResolvedValue(null);

      await expect(
        service.grabarDocumentoContabilizar(superAdminUser(), 'DOC-CUALQUIERA'),
      ).rejects.toMatchObject({ status: 404 });
      expect(prisma.documentoComercial.findFirst).toHaveBeenCalledWith({
        where: { id: 'DOC-CUALQUIERA' },
      });
    });
  });

  describe('P1-9 NC con control de saldo contra factura origen', () => {
    const factura = {
      id: 'FAC-1',
      tipo: 'FACTURA',
      estado: 'CONTABILIZADA',
      empresaId: 'EMP-1',
      folio: 'FAC-1000',
      neto: 1000,
      iva: 190,
      indicadorVenta: null,
    };

    it('rechaza una NC que supera el saldo pendiente de la factura origen', async () => {
      prisma.documentoComercial.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => (
        where.id === 'FAC-1' ? factura : null
      ));
      prisma.documentoComercial.findMany.mockResolvedValue([]);

      await expect(
        service.createDocumento(
          tenantUser(),
          {
            folio: 'NC-1',
            tipo: 'NC',
            cliente: 'Cliente Demo',
            fecha: '2026-08-01',
            neto: 2000,
            documentoOrigenId: 'FAC-1',
          },
          'EMP-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.documentoComercial.create).not.toHaveBeenCalled();
    });

    it('acumula NCs previas al validar el saldo disponible', async () => {
      prisma.documentoComercial.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => (
        where.id === 'FAC-1' ? factura : null
      ));
      // Ya existe una NC previa por 1000 + 190 = 1190; solo quedan 0 de saldo.
      prisma.documentoComercial.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { neto: 1000, iva: 190, indicadorVenta: null },
        ]);

      await expect(
        service.createDocumento(
          tenantUser(),
          {
            folio: 'NC-2',
            tipo: 'NC',
            cliente: 'Cliente Demo',
            fecha: '2026-08-01',
            neto: 100,
            documentoOrigenId: 'FAC-1',
          },
          'EMP-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.documentoComercial.create).not.toHaveBeenCalled();
    });

    it('permite una NC dentro del saldo disponible de la factura origen', async () => {
      prisma.documentoComercial.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => (
        where.id === 'FAC-1' ? factura : null
      ));
      prisma.documentoComercial.findMany.mockResolvedValue([]);
      prisma.documentoComercial.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ id: 'NC-3', ...data }),
      );

      const row = await service.createDocumento(
        tenantUser(),
        {
          folio: 'NC-3',
          tipo: 'NC',
          cliente: 'Cliente Demo',
          fecha: '2026-08-01',
          neto: 500,
          documentoOrigenId: 'FAC-1',
        },
        'EMP-1',
      );
      expect(row.neto).toBe(500);
      expect(prisma.documentoComercial.create).toHaveBeenCalled();
    });

    it('NC contra factura EXPORTACION autocompleta referencia 110 y copiar COMEX del origen', async () => {
      prisma.documentoComercial.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => (
        where.id === 'FAC-EXP'
          ? {
              id: 'FAC-EXP',
              tipo: 'FACTURA',
              estado: 'CONTABILIZADA',
              empresaId: 'EMP-1',
              folio: 'FAC-110',
              folioOficial: '58',
              fecha: new Date('2026-09-01'),
              neto: 1000,
              iva: 0,
              indicadorVenta: 'EXPORTACION',
              paisRecepCodigo: '225',
              tpoMoneda: '13',
              monedaCodigo: 'USD',
              tipoCambio: 940,
              puertoEmbarque: '201',
              receptorRut: 'EX-USA',
              receptorCiudad: 'Miami',
            }
          : null
      ));
      prisma.documentoComercial.findMany.mockResolvedValue([]);
      prisma.documentoComercial.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ id: 'NC-EXP', ...data }),
      );

      await service.createDocumento(
        tenantUser(),
        {
          folio: 'NC-EXP-1',
          tipo: 'NC',
          cliente: 'Cliente Exportador',
          fecha: '2026-09-04',
          neto: 100,
          indicadorVenta: 'EXPORTACION',
          documentoOrigenId: 'FAC-EXP',
        },
        'EMP-1',
      );

      expect(prisma.documentoComercial.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            referenciaTipo: '110',
            referenciaFolio: '58',
            referenciaFecha: new Date('2026-09-01'),
            referenciaCod: 3,
            indicadorVenta: 'EXPORTACION',
            paisRecepCodigo: '225',
            tpoMoneda: '13',
            monedaCodigo: 'USD',
            tipoCambio: 940,
            puertoEmbarque: '201',
            receptorRut: 'EX-USA',
            receptorCiudad: 'Miami',
          }),
        }),
      );
    });
  });

  describe('Emitir: ND y GUIA', () => {
    it('rechaza factura con línea sin insumoId del catálogo', async () => {
      prisma.documentoComercial.findFirst.mockResolvedValue({
        id: 'OV-1',
        tipo: 'ORDEN_VENTA',
        estado: 'CONFIRMADA',
        folio: 'OV-1',
      });
      await expect(
        service.createDocumento(
          tenantUser(),
          {
            folio: 'FAC-X',
            tipo: 'FACTURA',
            cliente: 'Cliente Demo',
            fecha: '2026-08-01',
            neto: 1000,
            documentoOrigenId: 'OV-1',
            lineas: [{
              descripcion: 'Texto libre',
              cantidad: 1,
              precioUnitario: 1000,
              total: 1000,
            }],
          },
          'EMP-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.documentoComercial.create).not.toHaveBeenCalled();
    });

    it('rechaza ND sin origen interno ni registro manual', async () => {
      await expect(
        service.createDocumento(
          tenantUser(),
          {
            folio: 'ND-1',
            tipo: 'ND',
            cliente: 'Cliente Demo',
            fecha: '2026-08-01',
            neto: 100,
          },
          'EMP-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.documentoComercial.create).not.toHaveBeenCalled();
    });

    it('permite ND sobre otra ND del ERP', async () => {
      prisma.documentoComercial.findMany.mockResolvedValue([]);
      prisma.documentoComercial.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => (
        where.id === 'ND-ORIG'
          ? {
              id: 'ND-ORIG',
              tipo: 'ND',
              estado: 'CONTABILIZADA',
              empresaId: 'EMP-1',
              folio: '10084807',
              folioOficial: '51',
              fecha: new Date('2026-09-07'),
              neto: 1850,
              iva: 352,
              indicadorVenta: 'VENTA',
            }
          : null
      ));
      prisma.documentoComercial.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ id: 'ND-2', ...data }),
      );
      prisma.usuario.findUnique.mockResolvedValue({ nombre: 'User' });

      await service.createDocumento(
        tenantUser(),
        {
          folio: 'ND-2',
          tipo: 'ND',
          cliente: 'Cliente Demo',
          fecha: '2026-09-07',
          neto: 100,
          documentoOrigenId: 'ND-ORIG',
          referenciaCod: 3,
        },
        'EMP-1',
      );

      expect(prisma.documentoComercial.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            documentoOrigenId: 'ND-ORIG',
            referenciaTipo: '56',
            referenciaFolio: '51',
            referenciaCod: 3,
          }),
        }),
      );
    });

    it('permite ND con registro manual sin documento en la BD', async () => {
      prisma.documentoComercial.findMany.mockResolvedValue([]);
      prisma.documentoComercial.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({ id: 'ND-M', ...data }),
      );
      prisma.usuario.findUnique.mockResolvedValue({ nombre: 'User' });

      await service.createDocumento(
        tenantUser(),
        {
          folio: 'ND-M1',
          tipo: 'ND',
          cliente: 'Cliente Demo',
          fecha: '2026-09-07',
          neto: 100,
          referenciaTipo: '52',
          referenciaFolio: '12',
          referenciaFecha: '2026-08-01',
          referenciaCod: 3,
        },
        'EMP-1',
      );

      expect(prisma.documentoComercial.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            documentoOrigenId: null,
            referenciaTipo: '52',
            referenciaFolio: '12',
            referenciaCod: 3,
          }),
        }),
      );
    });

    it('crea GUIA en DocumentoComercial y proyecta GuiaDespacho', async () => {
      prisma.usuario.findUnique.mockResolvedValue({ nombre: 'User' });
      prisma.documentoComercial.create.mockResolvedValue({
        id: 'G1',
        folio: 'GD-8001',
        tipo: 'GUIA',
        cliente: 'Cliente Demo',
        clienteId: null,
        fecha: new Date('2026-08-14'),
        neto: 100,
        iva: 0,
        estado: 'BORRADOR',
        fromReversa: false,
        folioOrigen: null,
        asientoOriginal: null,
        asientoReversador: null,
        asientoNuevo: null,
        folioReversador: null,
        empresaId: 'EMP-1',
      });
      prisma.guiaDespacho.upsert.mockResolvedValue({ id: 'GD1' });

      const row = await service.createDocumento(
        tenantUser(),
        {
          folio: 'GD-8001',
          tipo: 'GUIA',
          cliente: 'Cliente Demo',
          fecha: '2026-08-14',
          neto: 100,
          iva: 0,
        },
        'EMP-1',
      );
      expect(row.tipo).toBe('GUIA');
      expect(row.folio).toBe('GD-8001');
      expect(prisma.guiaDespacho.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { empresaId_folio: { empresaId: 'EMP-1', folio: 'GD-8001' } },
        }),
      );
    });
  });

  describe('downloadDteArtifact', () => {
    it('pide el archivo al gateway con billingEmissionId y no reemite', async () => {
      const getArtifact = jest.fn().mockResolvedValue({
        body: Buffer.from('%PDF-1.4'),
        contentType: 'application/pdf',
        filename: 'folio-53.pdf',
        dummy: false,
      });
      const emit = jest.fn();
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ComercialService(
        harness.mock,
        undefined,
        undefined,
        { isEnabled: () => true, emit, getArtifact } as never,
      );
      prisma.documentoComercial.findFirst.mockResolvedValue({
        id: 'cmtj7o6v60000mwtyecg6bc3q',
        tipo: 'FACTURA',
        empresaId: 'EMP-1',
        billingEmissionId: 'emi_d57c76c6b22f46fe',
      });

      const art = await service.downloadDteArtifact(
        tenantUser(),
        'cmtj7o6v60000mwtyecg6bc3q',
        'pdf',
        'EMP-1',
      );

      expect(emit).not.toHaveBeenCalled();
      expect(getArtifact).toHaveBeenCalledWith('emi_d57c76c6b22f46fe', 'pdf');
      expect(art.dummy).toBe(false);
      expect(prisma.documentoComercial.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cmtj7o6v60000mwtyecg6bc3q', empresaId: 'EMP-1' },
        }),
      );
    });

    it('no descarga si el documento del tenant no tiene emisión', async () => {
      const getArtifact = jest.fn();
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ComercialService(
        harness.mock,
        undefined,
        undefined,
        { isEnabled: () => true, emit: jest.fn(), getArtifact } as never,
      );
      prisma.documentoComercial.findFirst.mockResolvedValue({
        id: 'D-SIN',
        tipo: 'FACTURA',
        empresaId: 'EMP-1',
        billingEmissionId: null,
      });

      await expect(
        service.downloadDteArtifact(tenantUser(), 'D-SIN', 'xml', 'EMP-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(getArtifact).not.toHaveBeenCalled();
    });
  });

  describe('syncDocumentoDteEstado', () => {
    it('persiste RCH y folio sin reemitir ni cambiar asiento', async () => {
      const refreshEmission = jest.fn().mockResolvedValue({
        emissionId: 'emi_d57c76c6b22f46fe',
        partner: 'gosocket',
        connectionMode: 'sandbox',
        status: 'REJECTED',
        folioOficial: '53',
        folioSimulado: null,
        globalDocumentId: 'ae352c22-6c9e-c6b1-6614-4bec8369dba7',
        countryDocumentId: null,
        messages: ['(HED-3-845) RECHAZO'],
        disclaimer: '(HED-3-845) RECHAZO',
        artifacts: { pdfAvailable: true, xmlAvailable: true },
        stub: false,
      });
      const emit = jest.fn();
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ComercialService(
        harness.mock,
        undefined,
        undefined,
        { isEnabled: () => true, emit, refreshEmission } as never,
      );
      const current = {
        id: 'DOC-53',
        tipo: 'FACTURA',
        empresaId: 'EMP-1',
        billingEmissionId: 'emi_d57c76c6b22f46fe',
        billingStub: false,
        folioOficial: null,
        billingGlobalDocumentId: 'ae352c22-6c9e-c6b1-6614-4bec8369dba7',
        estado: 'EMITIDO',
      };
      prisma.documentoComercial.findFirst.mockResolvedValue(current);
      prisma.documentoComercial.update.mockResolvedValue({
        ...current,
        folio: '10037770',
        cliente: 'Cliente',
        fecha: new Date('2026-08-31T00:00:00.000Z'),
        neto: 1850,
        iva: 352,
        estado: 'EMITIDO',
        billingStatus: 'REJECTED',
        folioOficial: '53',
        billingDisclaimer: '(HED-3-845) RECHAZO',
        empresa: { id: 'EMP-1', razonSocial: 'Demo' },
      });

      const row = await service.syncDocumentoDteEstado(tenantUser(), 'DOC-53', 'EMP-1');

      expect(emit).not.toHaveBeenCalled();
      expect(refreshEmission).toHaveBeenCalledWith('emi_d57c76c6b22f46fe');
      expect(row.billingStatus).toBe('REJECTED');
      expect(row.folioOficial).toBe('53');
      expect(prisma.documentoComercial.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            billingStatus: 'REJECTED',
            folioOficial: '53',
          }),
        }),
      );
    });

    it('no pisa un GID usable con 0 o UUID cero', async () => {
      const keepGid = 'ae352c22-6c9e-c6b1-6614-4bec8369dba7';
      const refreshEmission = jest.fn().mockResolvedValue({
        emissionId: 'emi_d57c76c6b22f46fe',
        partner: 'gosocket',
        connectionMode: 'sandbox',
        status: 'REJECTED',
        folioOficial: '53',
        folioSimulado: null,
        globalDocumentId: '0',
        countryDocumentId: null,
        messages: ['(HED-3-845) RECHAZO'],
        disclaimer: '(HED-3-845) RECHAZO',
        artifacts: { pdfAvailable: true, xmlAvailable: true },
        stub: false,
      });
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ComercialService(
        harness.mock,
        undefined,
        undefined,
        { isEnabled: () => true, emit: jest.fn(), refreshEmission } as never,
      );
      const current = {
        id: 'DOC-53',
        tipo: 'FACTURA',
        empresaId: 'EMP-1',
        billingEmissionId: 'emi_d57c76c6b22f46fe',
        billingStub: false,
        folioOficial: '53',
        billingGlobalDocumentId: keepGid,
        estado: 'EMITIDO',
      };
      prisma.documentoComercial.findFirst.mockResolvedValue(current);
      prisma.documentoComercial.update.mockResolvedValue({
        ...current,
        folio: '10037770',
        cliente: 'Cliente',
        fecha: new Date('2026-08-31T00:00:00.000Z'),
        neto: 1850,
        iva: 352,
        billingStatus: 'REJECTED',
        billingDisclaimer: '(HED-3-845) RECHAZO',
        empresa: { id: 'EMP-1', razonSocial: 'Demo' },
      });

      await service.syncDocumentoDteEstado(tenantUser(), 'DOC-53', 'EMP-1');

      expect(prisma.documentoComercial.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            billingGlobalDocumentId: keepGid,
          }),
        }),
      );
    });

    it('no baja REJECTED a PENDING si el refresh vuelve inconcluso', async () => {
      const refreshEmission = jest.fn().mockResolvedValue({
        emissionId: 'emi_d57c76c6b22f46fe',
        partner: 'gosocket',
        connectionMode: 'sandbox',
        status: 'PENDING',
        folioOficial: null,
        folioSimulado: null,
        globalDocumentId: 'ae352c22-6c9e-c6b1-6614-4bec8369dba7',
        countryDocumentId: null,
        messages: [],
        disclaimer: 'DTE enviado al facturador (proceso asíncrono). Folio oficial pendiente.',
        artifacts: { pdfAvailable: true, xmlAvailable: true },
        stub: false,
      });
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ComercialService(
        harness.mock,
        undefined,
        undefined,
        { isEnabled: () => true, emit: jest.fn(), refreshEmission } as never,
      );
      const current = {
        id: 'DOC-53',
        tipo: 'FACTURA',
        empresaId: 'EMP-1',
        billingEmissionId: 'emi_d57c76c6b22f46fe',
        billingStub: false,
        folioOficial: '53',
        billingGlobalDocumentId: 'ae352c22-6c9e-c6b1-6614-4bec8369dba7',
        billingStatus: 'REJECTED',
        billingDisclaimer: '(HED-3-845) RECHAZO',
        estado: 'EMITIDO',
      };
      prisma.documentoComercial.findFirst.mockResolvedValue(current);
      prisma.documentoComercial.update.mockResolvedValue({
        ...current,
        folio: '10037770',
        cliente: 'Cliente',
        fecha: new Date('2026-08-31T00:00:00.000Z'),
        neto: 1850,
        iva: 352,
        empresa: { id: 'EMP-1', razonSocial: 'Demo' },
      });

      await service.syncDocumentoDteEstado(tenantUser(), 'DOC-53', 'EMP-1');

      expect(prisma.documentoComercial.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            billingStatus: 'REJECTED',
            folioOficial: '53',
            billingDisclaimer: '(HED-3-845) RECHAZO',
          }),
        }),
      );
    });
  });
});
