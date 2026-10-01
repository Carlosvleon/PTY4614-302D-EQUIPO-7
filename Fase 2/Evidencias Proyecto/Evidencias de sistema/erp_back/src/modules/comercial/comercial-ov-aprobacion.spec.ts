import { BadRequestException } from '@nestjs/common';
import { ComercialService } from './comercial.service';
import { createPrismaMock, tenantUser } from '../../test-utils/prisma-mock';

describe('ComercialService — OV sin cadena de aprobación', () => {
  let service: ComercialService;
  let prisma: ReturnType<typeof createPrismaMock>['prisma'];

  const ovBase = {
    id: 'OV1',
    tipo: 'ORDEN_VENTA',
    empresaId: 'EMP-1',
    folio: 'OV-100',
    cliente: 'Cliente SA',
    clienteId: 'C1',
    fecha: new Date(),
    neto: 800_000,
    iva: 0,
    lineas: [
      {
        descripcion: 'Prod',
        cantidad: 1,
        precioUnitario: 800_000,
        total: 800_000,
        tipoLinea: 'SERVICIO',
      },
    ],
    creadoPorId: 'U-2',
    creadoPorNombre: 'Carolina',
  };

  beforeEach(() => {
    const harness = createPrismaMock();
    prisma = harness.prisma;
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    prisma.empresa.findUnique.mockResolvedValue({
      id: 'EMP-1',
    });
    prisma.reservaStock.findMany.mockResolvedValue([]);
    prisma.reservaStock.updateMany.mockResolvedValue({ count: 0 });
    service = new ComercialService(harness.mock);
  });

  it('confirma stock desde BORRADOR', async () => {
    prisma.documentoComercial.findUnique.mockResolvedValue({
      ...ovBase,
      estado: 'BORRADOR',
    });
    prisma.documentoComercial.update.mockResolvedValue({
      ...ovBase,
      estado: 'CONFIRMADA',
    });
    const row = await service.confirmarOrdenVenta(
      tenantUser({ permisos: ['comercial:write'] }),
      'OV1',
    );
    expect(row.estado).toBe('CONFIRMADA');
  });

  it('rechaza confirmar si no está en BORRADOR', async () => {
    prisma.documentoComercial.findUnique.mockResolvedValue({
      ...ovBase,
      estado: 'CONFIRMADA',
    });
    await expect(
      service.confirmarOrdenVenta(tenantUser({ permisos: ['comercial:write'] }), 'OV1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no expone solicitarAprobacionOv', () => {
    expect((service as unknown as { solicitarAprobacionOv?: unknown }).solicitarAprobacionOv).toBeUndefined();
  });

  it('rechaza facturar OV en BORRADOR (debe confirmar stock antes)', async () => {
    prisma.documentoComercial.findUnique.mockResolvedValue({
      ...ovBase,
      estado: 'BORRADOR',
    });
    await expect(
      service.convertirDocumento(
        tenantUser({ permisos: ['comercial:write'] }),
        'OV1',
        { tipoDestino: 'FACTURA' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
