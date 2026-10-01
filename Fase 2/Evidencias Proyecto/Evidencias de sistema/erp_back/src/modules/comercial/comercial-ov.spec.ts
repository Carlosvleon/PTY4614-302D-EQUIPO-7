import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ComercialService } from './comercial.service';
import { createPrismaMock, superAdminUser, tenantUser } from '../../test-utils/prisma-mock';

describe('ComercialService OV', () => {
  let service: ComercialService;
  let prisma: ReturnType<typeof createPrismaMock>['prisma'];

  const docBase = {
    folio: 'OV-1',
    tipo: 'ORDEN_VENTA',
    cliente: 'Cli',
    clienteId: 'C1',
    fecha: new Date(),
    neto: 20,
    iva: 0,
    lineas: [],
    estado: 'CONFIRMADA',
    fromReversa: false,
    folioOrigen: null,
    documentoOrigenId: null,
    asientoOriginal: null,
    asientoReversador: null,
    asientoNuevo: null,
    folioReversador: null,
  };

  beforeEach(() => {
    const harness = createPrismaMock();
    prisma = harness.prisma;
    prisma.empresa.findUnique.mockResolvedValue({ id: 'EMP-1' });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    service = new ComercialService(harness.mock);
  });

  it('rechaza convertir cotización a factura', async () => {
    prisma.documentoComercial.findUnique.mockResolvedValue({
      id: 'D1',
      tipo: 'COTIZACION',
      estado: 'BORRADOR',
      empresaId: 'EMP-1',
      folio: 'C-1',
      proveedorId: 'P1',
    });
    await expect(
      service.convertirDocumento(tenantUser({ permisos: ['compras:write'] }), 'D1', {
        tipoDestino: 'FACTURA',
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/parten de la orden de compra/i),
    });
  });

  it('rechaza convertir cotización a OC', async () => {
    prisma.documentoComercial.findUnique.mockResolvedValue({
      id: 'D1',
      tipo: 'COTIZACION',
      estado: 'EMITIDO',
      empresaId: 'EMP-1',
      folio: 'COT-1',
      proveedorId: 'P1',
    });
    await expect(
      service.convertirDocumento(
        tenantUser({ permisos: ['compras:write'] }),
        'D1',
        { tipoDestino: 'OC', folioNuevo: 'OC-COT-1' },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/solo referencia/i),
    });
    expect(prisma.ordenCompra.create).not.toHaveBeenCalled();
    expect(prisma.documentoComercial.create).not.toHaveBeenCalled();
  });

  it('rechaza convertir NP a factura', async () => {
    prisma.documentoComercial.findUnique.mockResolvedValue({
      id: 'D1',
      tipo: 'NP',
      estado: 'EMITIDO',
      empresaId: 'EMP-1',
      folio: 'NP-1',
    });
    await expect(
      service.convertirDocumento(tenantUser({ permisos: ['comercial:write'] }), 'D1', {
        tipoDestino: 'FACTURA',
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/nota de pedido/i),
    });
  });

  it('confirma OV y crea SALIDA_VENTA', async () => {
    prisma.documentoComercial.findUnique.mockResolvedValue({
      id: 'OV1',
      tipo: 'ORDEN_VENTA',
      estado: 'BORRADOR',
      empresaId: 'EMP-1',
      folio: 'OV-1',
      lineas: [
        {
          descripcion: 'A · Art',
          cantidad: 2,
          precioUnitario: 10,
          total: 20,
          tipoLinea: 'PRODUCTO',
          insumoId: 'INS-1',
          splits: [{ bodegaId: 'B1', cantidad: 2 }],
        },
      ],
    });
    prisma.insumo.findFirst.mockResolvedValue({
      id: 'INS-1',
      codigo: 'A',
      nombre: 'Art',
      unidad: 'UN',
      costoPromedio: 5,
      empresaId: 'EMP-1',
    });
    prisma.bodega.findFirst.mockResolvedValue({ id: 'B1', empresaId: 'EMP-1' });
    prisma.stockInsumoBodega.findUnique.mockResolvedValue({ cantidad: 10 });
    prisma.stockInsumoBodega.upsert.mockResolvedValue({});
    prisma.stockInsumoBodega.aggregate.mockResolvedValue({ _sum: { cantidad: 8 } });
    prisma.insumo.update.mockResolvedValue({});
    prisma.movimientoBodega.create.mockResolvedValue({});
    prisma.documentoComercial.update.mockResolvedValue({
      id: 'OV1',
      folio: 'OV-1',
      tipo: 'ORDEN_VENTA',
      cliente: 'Cli',
      clienteId: 'C1',
      fecha: new Date(),
      neto: 20,
      iva: 0,
      lineas: [],
      estado: 'CONFIRMADA',
      fromReversa: false,
      folioOrigen: null,
    });

    const row = await service.confirmarOrdenVenta(
      tenantUser({ permisos: ['comercial:write'] }),
      'OV1',
    );
    expect(row.estado).toBe('CONFIRMADA');
    expect(prisma.movimientoBodega.create).toHaveBeenCalled();
  });

  describe('D16 piso de venta', () => {
    const ovConPrecio = (precioUnitario: number) => ({
      id: 'OV1',
      tipo: 'ORDEN_VENTA',
      estado: 'BORRADOR',
      empresaId: 'EMP-1',
      folio: 'OV-1',
      lineas: [
        {
          descripcion: 'A · Art',
          cantidad: 1,
          precioUnitario,
          total: precioUnitario,
          tipoLinea: 'PRODUCTO',
          insumoId: 'INS-1',
          splits: [{ bodegaId: 'B1', cantidad: 1 }],
        },
      ],
    });

    const insumo = (over: Record<string, unknown>) => ({
      id: 'INS-1',
      codigo: 'A',
      nombre: 'Art',
      unidad: 'UN',
      costoPromedio: 5,
      empresaId: 'EMP-1',
      ...over,
    });

    const confirmar = () =>
      service.confirmarOrdenVenta(tenantUser({ permisos: ['comercial:write'] }), 'OV1');

    it('rechaza bajo el precio de compra del maestro, no bajo el costo promedio', async () => {
      prisma.documentoComercial.findUnique.mockResolvedValue(ovConPrecio(8));
      prisma.insumo.findFirst.mockResolvedValue(insumo({ precioCompra: 10 }));

      await expect(confirmar()).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/bajo el precio de compra \(10\)/i),
      });
      expect(prisma.movimientoBodega.create).not.toHaveBeenCalled();
    });

    it('acepta sobre el precio de compra aunque esté bajo ningún otro umbral', async () => {
      prisma.documentoComercial.findUnique.mockResolvedValue(ovConPrecio(12));
      prisma.insumo.findFirst.mockResolvedValue(insumo({ precioCompra: 10 }));
      prisma.bodega.findFirst.mockResolvedValue({ id: 'B1', empresaId: 'EMP-1' });
      prisma.stockInsumoBodega.findUnique.mockResolvedValue({ cantidad: 10 });
      prisma.stockInsumoBodega.upsert.mockResolvedValue({});
      prisma.stockInsumoBodega.aggregate.mockResolvedValue({ _sum: { cantidad: 9 } });
      prisma.insumo.update.mockResolvedValue({});
      prisma.movimientoBodega.create.mockResolvedValue({});
      prisma.documentoComercial.update.mockResolvedValue({ ...docBase, id: 'OV1' });

      await expect(confirmar()).resolves.toMatchObject({ estado: 'CONFIRMADA' });
    });

    it('cae al costo promedio cuando el maestro aún no tiene precio de compra', async () => {
      prisma.documentoComercial.findUnique.mockResolvedValue(ovConPrecio(3));
      prisma.insumo.findFirst.mockResolvedValue(insumo({ precioCompra: 0 }));

      await expect(confirmar()).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/bajo costo \(5\)/i),
      });
    });

    it('EXPORTACION permite precio bajo el piso de compra', async () => {
      prisma.documentoComercial.findUnique.mockResolvedValue({
        ...ovConPrecio(8),
        indicadorVenta: 'EXPORTACION',
      });
      prisma.insumo.findFirst.mockResolvedValue(insumo({ precioCompra: 10 }));
      prisma.bodega.findFirst.mockResolvedValue({ id: 'B1', empresaId: 'EMP-1' });
      prisma.stockInsumoBodega.findUnique.mockResolvedValue({ cantidad: 10 });
      prisma.stockInsumoBodega.upsert.mockResolvedValue({});
      prisma.stockInsumoBodega.aggregate.mockResolvedValue({ _sum: { cantidad: 9 } });
      prisma.insumo.update.mockResolvedValue({});
      prisma.movimientoBodega.create.mockResolvedValue({});
      prisma.documentoComercial.update.mockResolvedValue({
        ...docBase,
        id: 'OV1',
        indicadorVenta: 'EXPORTACION',
      });

      await expect(confirmar()).resolves.toMatchObject({ estado: 'CONFIRMADA' });
    });

    it('no bloquea cuando ni precio de compra ni costo promedio están cargados', async () => {
      prisma.documentoComercial.findUnique.mockResolvedValue(ovConPrecio(1));
      prisma.insumo.findFirst.mockResolvedValue(insumo({ precioCompra: 0, costoPromedio: 0 }));
      prisma.bodega.findFirst.mockResolvedValue({ id: 'B1', empresaId: 'EMP-1' });
      prisma.stockInsumoBodega.findUnique.mockResolvedValue({ cantidad: 10 });
      prisma.stockInsumoBodega.upsert.mockResolvedValue({});
      prisma.stockInsumoBodega.aggregate.mockResolvedValue({ _sum: { cantidad: 9 } });
      prisma.insumo.update.mockResolvedValue({});
      prisma.movimientoBodega.create.mockResolvedValue({});
      prisma.documentoComercial.update.mockResolvedValue({ ...docBase, id: 'OV1' });

      await expect(confirmar()).resolves.toMatchObject({ estado: 'CONFIRMADA' });
    });
  });

  it('getDocumento devuelve 404 si el doc no pertenece a la empresa del header (RB1)', async () => {
    prisma.documentoComercial.findFirst.mockResolvedValue(null);
    await expect(
      service.getDocumento(superAdminUser(), 'DOC-EMP1', 'EMP-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.documentoComercial.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'DOC-EMP1', empresaId: 'EMP-2' },
      }),
    );
  });

  it('getDocumento devuelve doc cuando id y empresa operativa coinciden', async () => {
    prisma.documentoComercial.findFirst.mockResolvedValue({
      id: 'DOC-1',
      empresaId: 'EMP-1',
      ...docBase,
    });
    const row = await service.getDocumento(tenantUser(), 'DOC-1', 'EMP-1');
    expect(row.id).toBe('DOC-1');
  });

  it('lookupRut encuentra cliente con RUT formateado (OV12)', async () => {
    prisma.empresa.findFirst.mockResolvedValue({
      id: 'EMP-1',
      rut: '76.000.000-0',
      razonSocial: 'Almahue',
      giro: 'Agro',
    });
    prisma.cliente.findMany.mockResolvedValue([
      {
        id: 'CLI-1',
        rut: '76.111.000-K',
        razonSocial: 'Comercial Packing Centro',
        giro: 'Packing',
        empresaId: 'EMP-1',
        esProductor: true,
        direcciones: [],
      },
    ]);
    prisma.proveedor.findMany.mockResolvedValue([]);
    const result = await service.lookupRut(tenantUser(), '76111000-K', 'EMP-1');
    expect(result.clientes).toHaveLength(1);
    expect(result.clientes[0].id).toBe('CLI-1');
    expect(result.clientes[0].giro).toBe('Packing');
    expect(result.clientes[0].productor).toBe(true);
    expect(result.productores).toHaveLength(1);
  });

  it('lookupRut encuentra proveedor seed (OV13)', async () => {
    prisma.empresa.findFirst.mockResolvedValue({
      id: 'EMP-1',
      rut: '76.000.000-0',
      razonSocial: 'Almahue',
      giro: 'Agro',
    });
    prisma.cliente.findMany.mockResolvedValue([]);
    prisma.proveedor.findMany.mockResolvedValue([
      {
        id: 'PROV-SEED-1',
        rut: '76.543.210-K',
        razonSocial: 'Agro Insumos Sur',
        giro: 'Insumos agrícolas',
        empresaId: 'EMP-1',
      },
    ]);
    const result = await service.lookupRut(tenantUser(), '76543210K', 'EMP-1');
    expect(result.proveedores).toHaveLength(1);
    expect(result.proveedores[0].id).toBe('PROV-SEED-1');
  });

  it('convierte OV confirmada a factura BORRADOR (DTE al emitir, no al convertir)', async () => {
    prisma.documentoComercial.findUnique.mockResolvedValue({
      ...docBase,
      id: 'OV1',
      tipo: 'ORDEN_VENTA',
      estado: 'CONFIRMADA',
      empresaId: 'EMP-1',
    });
    prisma.usuario.findUnique.mockResolvedValue({ nombre: 'Admin' });
    prisma.documentoComercial.create.mockResolvedValue({
      ...docBase,
      id: 'FAC1',
      folio: 'FA-OV-1',
      tipo: 'FACTURA',
      estado: 'BORRADOR',
      empresaId: 'EMP-1',
      fecha: new Date('2026-08-26'),
      documentoOrigenId: 'OV1',
    });
    prisma.documentoComercial.update.mockResolvedValue({
      ...docBase,
      id: 'OV1',
      estado: 'FACTURADO',
      empresaId: 'EMP-1',
    });

    const res = await service.convertirDocumento(
      tenantUser({ permisos: ['comercial:write'] }),
      'OV1',
      { tipoDestino: 'FACTURA' },
    );

    expect(prisma.documentoComercial.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipo: 'FACTURA', estado: 'BORRADOR' }),
      }),
    );
    expect(res.convertido.estado).toBe('BORRADOR');
    expect(prisma.documentoComercial.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { estado: 'FACTURADO' },
      }),
    );
  });

  it('lista borradores de la empresa del header (no del JWT viejo)', async () => {
    prisma.documentoComercial.findMany.mockResolvedValue([
      {
        ...docBase,
        id: 'FAC1',
        folio: 'FA-1002-8391',
        tipo: 'FACTURA',
        estado: 'BORRADOR',
        empresaId: 'EMP-EXPORT',
        fecha: new Date('2026-08-26'),
      },
    ]);

    const rows = await service.getBorradores(
      superAdminUser({ empresaId: 'EMP-BOOT', empresaIds: ['EMP-BOOT'] } as never),
      undefined,
      'EMP-EXPORT',
    );

    expect(prisma.documentoComercial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          estado: 'BORRADOR',
          empresaId: 'EMP-EXPORT',
        }),
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].folio).toBe('FA-1002-8391');
  });

  describe('patchDocumentoImputacion', () => {
    const ovConfirmada = {
      ...docBase,
      id: 'OV1',
      empresaId: 'EMP-1',
      tipo: 'ORDEN_VENTA',
      estado: 'CONFIRMADA',
      cuentaContableId: null,
      centroCostoId: null,
    };

    it('actualiza cuenta y CC en OV confirmada del tenant', async () => {
      prisma.documentoComercial.findFirst.mockResolvedValue(ovConfirmada);
      prisma.cuentaContable.findFirst.mockResolvedValue({
        id: 'CTA-1',
        empresaId: 'EMP-1',
        activa: true,
        noImputable: false,
      });
      prisma.centroCosto.findFirst.mockResolvedValue({
        id: 'CC-1',
        empresaId: 'EMP-1',
        activa: true,
      });
      prisma.documentoComercial.update.mockResolvedValue({
        ...ovConfirmada,
        cuentaContableId: 'CTA-1',
        centroCostoId: 'CC-1',
      });

      const row = await service.patchDocumentoImputacion(
        tenantUser({ permisos: ['comercial:write'] }),
        'OV1',
        { cuentaContableId: 'CTA-1', centroCostoId: 'CC-1' },
        'EMP-1',
      );
      expect(row.cuentaContableId).toBe('CTA-1');
      expect(row.centroCostoId).toBe('CC-1');
      expect(prisma.documentoComercial.update).toHaveBeenCalledWith({
        where: { id: 'OV1' },
        data: { cuentaContableId: 'CTA-1', centroCostoId: 'CC-1' },
      });
    });

    it('rechaza FACTURA (no emite ni contabiliza por este endpoint)', async () => {
      prisma.documentoComercial.findFirst.mockResolvedValue({
        ...ovConfirmada,
        tipo: 'FACTURA',
        estado: 'EMITIDO',
      });
      await expect(
        service.patchDocumentoImputacion(
          tenantUser({ permisos: ['comercial:write'] }),
          'OV1',
          { cuentaContableId: 'CTA-1' },
          'EMP-1',
        ),
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/orden de venta/i),
      });
      expect(prisma.documentoComercial.update).not.toHaveBeenCalled();
    });

    it('rechaza OV en borrador', async () => {
      prisma.documentoComercial.findFirst.mockResolvedValue({
        ...ovConfirmada,
        estado: 'BORRADOR',
      });
      await expect(
        service.patchDocumentoImputacion(
          tenantUser({ permisos: ['comercial:write'] }),
          'OV1',
          { cuentaContableId: 'CTA-1' },
          'EMP-1',
        ),
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/confirmada/i),
      });
    });

    it('404 si el doc no es de la empresa operativa', async () => {
      prisma.documentoComercial.findFirst.mockResolvedValue(null);
      await expect(
        service.patchDocumentoImputacion(
          superAdminUser(),
          'OV1',
          { cuentaContableId: 'CTA-1' },
          'EMP-2',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.documentoComercial.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'OV1', empresaId: 'EMP-2' } }),
      );
    });
  });

  it('permite editar OV CONFIRMADA (lápiz) sin reajustar stock si no cambian ítems', async () => {
    const lineas = [{
      descripcion: 'Servicio packing',
      cantidad: 1,
      precioUnitario: 20,
      descuentoPct: 0,
      total: 20,
      tipoLinea: 'SERVICIO',
    }];
    prisma.documentoComercial.findUnique.mockResolvedValue({
      ...docBase,
      id: 'OV1',
      empresaId: 'EMP-1',
      estado: 'CONFIRMADA',
      lineas,
    });
    prisma.documentoComercial.update.mockResolvedValue({
      ...docBase,
      id: 'OV1',
      empresaId: 'EMP-1',
      estado: 'CONFIRMADA',
      cliente: 'Cli editado',
      lineas,
      fecha: new Date('2026-09-17'),
    });
    const row = await service.updateDocumento(
      tenantUser({ permisos: ['comercial:write'] }),
      'OV1',
      {
        folio: 'OV-1',
        tipo: 'ORDEN_VENTA',
        cliente: 'Cli editado',
        fecha: '2026-09-17',
        neto: 20,
        estado: 'CONFIRMADA',
        lineas,
      },
    );
    expect(row.cliente).toBe('Cli editado');
    expect(prisma.movimientoBodega.findMany).not.toHaveBeenCalled();
  });
});
