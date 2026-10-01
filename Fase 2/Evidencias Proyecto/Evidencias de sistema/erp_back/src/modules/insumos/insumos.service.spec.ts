import { BadRequestException } from '@nestjs/common';
import { InsumosService } from './insumos.service';
import { createPrismaMock, tenantUser } from '../../test-utils/prisma-mock';

describe('InsumosService', () => {
  let service: InsumosService;
  let prisma: ReturnType<typeof createPrismaMock>['prisma'];

  beforeEach(() => {
    const harness = createPrismaMock();
    prisma = harness.prisma;
    service = new InsumosService(harness.mock);
    prisma.bodega.findFirst.mockResolvedValue({
      id: 'BOD-1',
      codigo: 'CENTRAL',
      nombre: 'Central',
      empresaId: 'EMP-1',
    });
    prisma.insumo.findFirst.mockResolvedValue({
      id: 'I1',
      codigo: 'INS-1',
      nombre: 'Urea',
      stock: 40,
      costoPromedio: 500,
      empresaId: 'EMP-1',
    });
    prisma.stockInsumoBodega.findUnique.mockResolvedValue({ cantidad: 40 });
    prisma.stockInsumoBodega.upsert.mockResolvedValue({});
    prisma.stockInsumoBodega.aggregate.mockResolvedValue({ _sum: { cantidad: 30 } });
  });

  it('lista insumos', async () => {
    prisma.insumo.findMany.mockResolvedValue([
      {
        id: 'I1',
        codigo: 'INS-1',
        familia: 'Agro',
        subfamilia: 'Fert',
        nombre: 'Urea',
        unidad: 'KG',
        stock: 10,
        costoPromedio: 500,
        cuentaContableId: null,
      },
    ]);
    const rows = await service.getInsumos(tenantUser(), 'EMP-1');
    expect(rows[0].stock).toBe(10);
    expect(rows[0].detalle).toBeUndefined();
  });

  it('expone detalle del maestro cuando está cargado', async () => {
    prisma.insumo.findMany.mockResolvedValue([
      {
        id: 'I1',
        codigo: 'INS-1',
        familia: 'Agro',
        subfamilia: 'Fert',
        nombre: 'Urea',
        detalle: 'Saco 25 kg, origen Quillota',
        unidad: 'KG',
        stock: 10,
        costoPromedio: 500,
        cuentaContableId: null,
      },
    ]);
    const rows = await service.getInsumos(tenantUser(), 'EMP-1');
    expect(rows[0].detalle).toBe('Saco 25 kg, origen Quillota');
  });

  it('rechaza tipo de movimiento inválido', async () => {
    await expect(
      service.createMovimiento(
        tenantUser(),
        {
          fecha: '2026-07-01',
          tipo: 'X',
          insumoId: 'I1',
          bodegaId: 'B1',
          cantidad: 1,
          precioUnitario: 1,
        },
        'EMP-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('DEVOLUCION_NC suma stock (reingreso NC)', async () => {
    prisma.movimientoBodega.create.mockImplementation(async ({ data }) => ({
      id: 'MOV-NC',
      fecha: data.fecha,
      tipo: data.tipo,
      estado: data.estado,
      bodega: data.bodega,
      bodegaDestino: null,
      articulo: data.articulo,
      cantidad: data.cantidad,
      precioUnitario: data.precioUnitario,
      facturaRef: data.facturaRef,
      nota: data.nota,
      parId: null,
      insumoId: data.insumoId,
    }));
    prisma.insumo.findUnique
      .mockResolvedValueOnce({ id: 'I1', stock: 20, costoPromedio: 500, empresaId: 'EMP-1' })
      .mockResolvedValueOnce({ id: 'I1', stock: 25, costoPromedio: 500 });

    await service.createMovimiento(
      tenantUser(),
      {
        fecha: '2026-07-01',
        tipo: 'DEVOLUCION_NC',
        insumoId: 'I1',
        bodegaId: 'BOD-1',
        cantidad: 5,
        precioUnitario: 500,
      },
      'EMP-1',
    );

    expect(prisma.stockInsumoBodega.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { cantidad: 45 },
      }),
    );
  });

  describe('EX-25 anular movimiento CONFIRMADO', () => {
    const movBase = {
      id: 'MOV-1',
      fecha: new Date('2026-07-01'),
      tipo: 'ENTRADA_PROVEEDOR',
      estado: 'CONFIRMADO',
      bodega: 'CENTRAL',
      bodegaId: 'BOD-1',
      bodegaDestino: null,
      bodegaDestinoId: null,
      articulo: 'Urea',
      cantidad: 10,
      precioUnitario: 500,
      facturaRef: null,
      nota: '',
      parId: null,
      empresaId: 'EMP-1',
      insumoId: 'I1',
    };

    it('revierte stock al anular ENTRADA_PROVEEDOR', async () => {
      prisma.movimientoBodega.findUnique.mockResolvedValue(movBase);
      prisma.insumo.findUnique.mockResolvedValue({ id: 'I1', stock: 30, costoPromedio: 500 });
      prisma.movimientoBodega.update.mockResolvedValue({
        ...movBase,
        estado: 'ANULADO',
      });

      const result = await service.updateMovimiento(
        tenantUser(),
        'MOV-1',
        {
          fecha: '2026-07-01',
          tipo: 'ENTRADA_PROVEEDOR',
          estado: 'ANULADO',
          bodegaId: 'BOD-1',
          insumoId: 'I1',
          articulo: 'Urea',
          cantidad: 10,
          precioUnitario: 500,
        },
      );

      expect(prisma.insumo.update).toHaveBeenCalledWith({
        where: { id: 'I1' },
        data: { stock: 30 },
      });
      expect(prisma.insumo.update).toHaveBeenCalledWith({
        where: { id: 'I1' },
        data: { costoPromedio: 500 },
      });
      expect(result.estado).toBe('ANULADO');
      expect(result.stockActual).toBe(30);
    });

    it('restaura stock al anular SALIDA_PROVEEDOR', async () => {
      prisma.movimientoBodega.findUnique.mockResolvedValue({
        ...movBase,
        tipo: 'SALIDA_PROVEEDOR',
      });
      prisma.insumo.findUnique.mockResolvedValue({ id: 'I1', stock: 30, costoPromedio: 500 });
      prisma.movimientoBodega.update.mockResolvedValue({
        ...movBase,
        tipo: 'SALIDA_PROVEEDOR',
        estado: 'ANULADO',
      });

      const result = await service.updateMovimiento(
        tenantUser(),
        'MOV-1',
        {
          fecha: '2026-07-01',
          tipo: 'SALIDA_PROVEEDOR',
          estado: 'ANULADO',
          bodegaId: 'BOD-1',
          insumoId: 'I1',
          articulo: 'Urea',
          cantidad: 10,
          precioUnitario: 500,
        },
      );

      expect(prisma.insumo.update).toHaveBeenCalledWith({
        where: { id: 'I1' },
        data: { stock: 30 },
      });
      expect(result.stockActual).toBe(30);
    });

    it('anula movimiento par si existe', async () => {
      prisma.movimientoBodega.findUnique.mockResolvedValue({
        ...movBase,
        tipo: 'TRASLADO',
        bodegaDestino: 'SUR',
        bodegaDestinoId: 'BOD-2',
        parId: 'MOV-PAR',
      });
      prisma.insumo.findUnique.mockResolvedValue({
        id: 'I1',
        stock: 40,
        costoPromedio: 500,
      });
      prisma.movimientoBodega.update.mockResolvedValue({
        ...movBase,
        tipo: 'TRASLADO',
        bodegaDestino: 'Bodega Sur',
        estado: 'ANULADO',
        parId: 'MOV-PAR',
      });

      await service.updateMovimiento(
        tenantUser(),
        'MOV-1',
        {
          fecha: '2026-07-01',
          tipo: 'TRASLADO',
          estado: 'ANULADO',
          bodegaId: 'BOD-1',
          bodegaDestinoId: 'BOD-2',
          insumoId: 'I1',
          articulo: 'Urea',
          cantidad: 10,
          precioUnitario: 500,
        },
      );

      expect(prisma.movimientoBodega.update).toHaveBeenCalledWith({
        where: { id: 'MOV-PAR' },
        data: { estado: 'ANULADO' },
      });
    });
  });

  describe('P0-4 confirmar borrador de insumo', () => {
    it('actualiza stock/CPP al confirmar un borrador de ENTRADA_PROVEEDOR', async () => {
      prisma.movimientoBodega.findUnique.mockResolvedValue({
        id: 'MOV-1',
        fecha: new Date('2026-07-01'),
        tipo: 'ENTRADA_PROVEEDOR',
        estado: 'BORRADOR',
        bodega: 'Central',
        bodegaDestino: null,
        articulo: 'Urea',
        cantidad: 10,
        precioUnitario: 500,
        facturaRef: null,
        nota: '',
        parId: null,
        empresaId: 'EMP-1',
        insumoId: 'I1',
      });
      prisma.insumo.findFirst.mockResolvedValueOnce({
        id: 'I1',
        codigo: 'INS-1',
        nombre: 'Urea',
        stock: 20,
        costoPromedio: 400,
        empresaId: 'EMP-1',
      });
      prisma.insumo.findUnique.mockResolvedValue({ id: 'I1', stock: 30, costoPromedio: 433.33 });
      prisma.movimientoBodega.update.mockResolvedValue({
        id: 'MOV-1',
        tipo: 'ENTRADA_PROVEEDOR',
        estado: 'CONFIRMADO',
        bodega: 'Central',
        bodegaDestino: null,
        articulo: 'Urea',
        cantidad: 10,
        precioUnitario: 500,
        fecha: new Date('2026-07-01'),
        facturaRef: null,
        nota: '',
        parId: null,
        insumoId: 'I1',
      });

      const result = await service.updateMovimiento(
        tenantUser(),
        'MOV-1',
        {
          fecha: '2026-07-01',
          tipo: 'ENTRADA_PROVEEDOR',
          estado: 'CONFIRMADO',
          bodegaId: 'BOD-1',
          insumoId: 'I1',
          articulo: 'Urea',
          cantidad: 10,
          precioUnitario: 500,
        },
      );

      // (20*400 + 10*500) / 30 = 433.33...
      expect(prisma.insumo.update).toHaveBeenCalledWith({
        where: { id: 'I1' },
        data: { stock: 30 },
      });
      expect(prisma.insumo.update).toHaveBeenCalledWith({
        where: { id: 'I1' },
        data: { costoPromedio: expect.closeTo(433.33, 1) },
      });
      expect(result.stockActual).toBe(30);
    });

    it('no toca stock si el borrador queda como borrador', async () => {
      prisma.movimientoBodega.findUnique.mockResolvedValue({
        id: 'MOV-1',
        fecha: new Date('2026-07-01'),
        tipo: 'ENTRADA_PROVEEDOR',
        estado: 'BORRADOR',
        bodega: 'Central',
        bodegaDestino: null,
        articulo: 'Urea',
        cantidad: 10,
        precioUnitario: 500,
        facturaRef: null,
        nota: '',
        parId: null,
        empresaId: 'EMP-1',
        insumoId: 'I1',
      });
      prisma.movimientoBodega.update.mockResolvedValue({
        id: 'MOV-1',
        tipo: 'ENTRADA_PROVEEDOR',
        estado: 'BORRADOR',
        bodega: 'Central',
        bodegaDestino: null,
        articulo: 'Urea',
        cantidad: 10,
        precioUnitario: 500,
        fecha: new Date('2026-07-01'),
        facturaRef: null,
        nota: 'edición',
        parId: null,
        insumoId: 'I1',
      });

      await service.updateMovimiento(
        tenantUser(),
        'MOV-1',
        {
          fecha: '2026-07-01',
          tipo: 'ENTRADA_PROVEEDOR',
          estado: 'BORRADOR',
          bodegaId: 'BOD-1',
          insumoId: 'I1',
          articulo: 'Urea',
          cantidad: 10,
          precioUnitario: 500,
          nota: 'edición',
        },
      );

      expect(prisma.insumo.update).not.toHaveBeenCalled();
    });
  });
});
