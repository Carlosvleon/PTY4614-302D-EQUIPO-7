import { BadRequestException } from '@nestjs/common';
import {
  crearReservasOv,
  consumirReservasOv,
  liberarReservasOv,
  disponibleFrom,
} from './stock-bodega.util';

describe('reserva stock util', () => {
  it('disponible = físico − reservado', () => {
    expect(disponibleFrom(100, 30)).toBe(70);
    expect(disponibleFrom(10, 15)).toBe(0);
  });

  it('crearReservasOv valida disponible y crea ACTIVA', async () => {
    const creates: unknown[] = [];
    const tx = {
      insumo: {
        findFirst: jest.fn().mockResolvedValue({ inventariable: true, codigo: 'P1' }),
      },
      bodega: {
        findFirst: jest.fn().mockResolvedValue({ id: 'B1', codigo: 'BOD-1' }),
      },
      stockInsumoBodega: {
        findUnique: jest.fn().mockResolvedValue({ cantidad: 10 }),
      },
      reservaStock: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { cantidad: 3 } }),
        create: jest.fn(async (args: { data: unknown }) => {
          creates.push(args.data);
          return args.data;
        }),
      },
    };

    await crearReservasOv(tx as never, {
      empresaId: 'EMP-1',
      documentoId: 'OV1',
      lineas: [
        {
          tipoLinea: 'PRODUCTO',
          insumoId: 'I1',
          cantidad: 5,
          splits: [{ bodegaId: 'B1', cantidad: 5 }],
        },
      ],
      ahora: new Date('2026-08-20T12:00:00Z'),
    });

    expect(creates).toHaveLength(1);
    const row = creates[0] as { estado: string; cantidad: number; documentoId: string };
    expect(row.estado).toBe('ACTIVA');
    expect(row.cantidad).toBe(5);
    expect(row.documentoId).toBe('OV1');
  });

  it('crearReservasOv rechaza si disponible < qty', async () => {
    const tx = {
      insumo: {
        findFirst: jest.fn().mockResolvedValue({ inventariable: true, codigo: 'P1' }),
      },
      bodega: {
        findFirst: jest.fn().mockResolvedValue({ id: 'B1', codigo: 'BOD-1' }),
      },
      stockInsumoBodega: {
        findUnique: jest.fn().mockResolvedValue({ cantidad: 10 }),
      },
      reservaStock: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { cantidad: 8 } }),
        create: jest.fn(),
      },
    };

    await expect(
      crearReservasOv(tx as never, {
        empresaId: 'EMP-1',
        documentoId: 'OV1',
        lineas: [
          {
            tipoLinea: 'PRODUCTO',
            insumoId: 'I1',
            cantidad: 5,
            splits: [{ bodegaId: 'B1', cantidad: 5 }],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.reservaStock.create).not.toHaveBeenCalled();
  });

  it('consumir y liberar usan updateMany con estado ACTIVA', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = { reservaStock: { updateMany } };

    await consumirReservasOv(tx as never, { empresaId: 'EMP-1', documentoId: 'OV1' });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ estado: 'ACTIVA', documentoId: 'OV1' }),
        data: { estado: 'CONSUMIDA' },
      }),
    );

    await liberarReservasOv(tx as never, { empresaId: 'EMP-1', documentoId: 'OV1' });
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { estado: 'LIBERADA' },
      }),
    );
  });
});
