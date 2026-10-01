import { BadRequestException } from '@nestjs/common';
import { ContabilizarService } from './contabilizar.service';
import { createPrismaMock } from '../../test-utils/prisma-mock';

describe('ContabilizarService', () => {
  let service: ContabilizarService;
  let prisma: ReturnType<typeof createPrismaMock>['prisma'];

  beforeEach(() => {
    const harness = createPrismaMock();
    prisma = harness.prisma;
    service = new ContabilizarService(harness.mock);
  });

  it('crea asiento cuadrado (happy path)', async () => {
    prisma.periodoContable.findUnique.mockResolvedValue({
      id: 'PER-1',
      codigo: '2026-07',
      estado: 'ABIERTO',
      empresaId: 'EMP-1',
    });
    prisma.asiento.count.mockResolvedValue(0);
    prisma.cuentaContable.findMany.mockResolvedValue([
      { id: 'CTA-1', codigo: '1-1-01-01', noImputable: false, activa: true },
      { id: 'CTA-2', codigo: '2-1-01-01', noImputable: false, activa: true },
    ]);
    prisma.asiento.create.mockResolvedValue({
      id: 'ASI-1',
      numero: '20260001',
      periodo: '2026-07',
      fecha: new Date('2026-07-01'),
      tipo: 'MANUAL',
      glosa: 'Test',
      debe: 100,
      haber: 100,
      estado: 'CONTABILIZADO',
      origen: 'TEST',
      lineas: [],
    });

    const result = await service.createAsiento({
      empresaId: 'EMP-1',
      glosa: 'Test',
      origen: 'TEST',
      fecha: '2026-07-01',
      periodo: '2026-07',
      lineas: [
        { debe: 100, haber: 0, cuentaId: 'CTA-1' },
        { debe: 0, haber: 100, cuentaId: 'CTA-2' },
      ],
    });

    expect(result.numero).toBe('20260001');
    expect(result.debe).toBe(100);
    expect(prisma.asiento.create).toHaveBeenCalled();
  });

  it('rechaza asiento descuadrado', async () => {
    await expect(
      service.createAsiento({
        empresaId: 'EMP-1',
        glosa: 'Bad',
        lineas: [
          { debe: 100, haber: 0, cuentaId: 'CTA-1' },
          { debe: 0, haber: 50, cuentaId: 'CTA-2' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza asiento con linea sin cuenta contable (P0-1)', async () => {
    await expect(
      service.createAsiento({
        empresaId: 'EMP-1',
        glosa: 'Sin cuenta',
        lineas: [
          { debe: 100, haber: 0, cuentaId: 'CTA-1' },
          { debe: 0, haber: 100 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.asiento.create).not.toHaveBeenCalled();
  });

  it('rechaza cuenta no imputable sin persistir el asiento', async () => {
    prisma.periodoContable.findUnique.mockResolvedValue({
      id: 'PER-1',
      codigo: '2026-08',
      estado: 'ABIERTO',
      empresaId: 'EMP-1',
    });
    prisma.cuentaContable.findMany.mockResolvedValue([
      { id: 'CTA-1', codigo: '4-1-01-01-01', noImputable: false, activa: true },
      { id: 'CTA-PADRE', codigo: '1-1-02-01', noImputable: true, activa: true },
    ]);

    await expect(
      service.assertAsientoValido({
        empresaId: 'EMP-1',
        glosa: 'Preflight',
        fecha: '2026-08-19',
        lineas: [
          { debe: 2202, haber: 0, cuentaId: 'CTA-PADRE' },
          { debe: 0, haber: 2202, cuentaId: 'CTA-1' },
        ],
      }),
    ).rejects.toThrow(/1-1-02-01/);
    expect(prisma.asiento.create).not.toHaveBeenCalled();
  });

  it('createAsientoReversa conserva centro de costo y dimensiones', async () => {
    prisma.asiento.findUnique.mockResolvedValue({
      id: 'ASI-ORIG',
      empresaId: 'EMP-1',
      numero: '20260005',
      periodo: '2026-09',
      tipo: 'MANUAL',
      lineas: [
        {
          debe: 100,
          haber: 0,
          cuentaId: 'CTA-MO',
          centroCostoId: 'CC-1',
          glosa: 'Costo',
        },
        { debe: 0, haber: 100, cuentaId: 'CTA-HABER', glosa: 'Por recibir' },
      ],
    });
    prisma.periodoContable.findUnique.mockResolvedValue({
      id: 'PER-1',
      codigo: '2026-09',
      estado: 'ABIERTO',
      empresaId: 'EMP-1',
    });
    prisma.asiento.count.mockResolvedValue(5);
    prisma.cuentaContable.findMany.mockResolvedValue([
      {
        id: 'CTA-MO',
        codigo: '6-1-01-01-002',
        noImputable: false,
        activa: true,
        requiereCc: true,
        requiereElemento: false,
        requiereArea: false,
        centrosCosto: [{ centroCostoId: 'CC-1' }],
        elementosCosto: [],
        areasNegocio: [],
      },
      {
        id: 'CTA-HABER',
        codigo: '2-1-01-01',
        noImputable: false,
        activa: true,
        requiereCc: false,
        requiereElemento: false,
        requiereArea: false,
        centrosCosto: [],
        elementosCosto: [],
        areasNegocio: [],
      },
    ]);
    prisma.asiento.create.mockImplementation(async ({ data }) => ({
      id: 'ASI-REV',
      numero: '20260006',
      periodo: data.periodo,
      fecha: data.fecha,
      tipo: data.tipo,
      glosa: data.glosa,
      debe: data.debe,
      haber: data.haber,
      estado: data.estado,
      origen: data.origen,
      lineas: data.lineas,
    }));

    await service.createAsientoReversa('EMP-1', 'ASI-ORIG', 'Reapertura test');

    const payload = prisma.asiento.create.mock.calls[0][0].data.lineas as Array<{
      cuentaId: string;
      centroCostoId?: string;
      debe: number;
      haber: number;
    }>;
    const moLine = payload.find((l) => l.cuentaId === 'CTA-MO');
    expect(moLine?.centroCostoId).toBe('CC-1');
    expect(moLine?.debe).toBe(0);
    expect(moLine?.haber).toBe(100);
  });

  it('rechaza contabilizar en periodo cerrado (PC-04)', async () => {
    prisma.periodoContable.findUnique.mockResolvedValue({
      id: 'PER-1',
      codigo: '2026-07',
      estado: 'CERRADO',
      empresaId: 'EMP-1',
    });

    await expect(
      service.createAsiento({
        empresaId: 'EMP-1',
        glosa: 'Cerrado',
        fecha: '2026-07-01',
        periodo: '2026-07',
        estado: 'CONTABILIZADO',
        lineas: [
          { debe: 100, haber: 0, cuentaId: 'CTA-1' },
          { debe: 0, haber: 100, cuentaId: 'CTA-2' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.asiento.create).not.toHaveBeenCalled();
  });
});
