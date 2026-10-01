import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CuentaCorrienteService } from './cuenta-corriente.service';
import { createPrismaMock, tenantUser } from '../../test-utils/prisma-mock';
import { fechaExclusivaTrasPeriodo, formatRutDisplay, normalizeRut, splitCalceRefs } from './cuenta-corriente.util';

const RUT_DUAL = '76.882.110-4';
const RUT_NORM = '768821104';

function ccRow(partial: Record<string, unknown>) {
  return {
    id: 'CC-1',
    empresaId: 'EMP-1',
    terceroTipo: 'CLIENTE',
    terceroId: 'CLI-1',
    terceroNombre: 'COMERCIAL FRUTAM SPA',
    fecha: new Date('2026-08-12'),
    createdAt: new Date('2026-08-12T10:00:00Z'),
    documentoRef: 'FAC-45821',
    documentoTipo: 'FACTURA',
    debe: 1_000_000,
    haber: 0,
    saldo: 1_000_000,
    glosa: 'Venta',
    origen: 'VENTA',
    pagoId: null,
    documentoComercialId: 'DOC-1',
    registroCompraId: null,
    movimientoCartolaId: null,
    ...partial,
  };
}

describe('cuenta-corriente.util', () => {
  it('normaliza RUT sin puntos ni guión', () => {
    expect(normalizeRut('76.882.110-4')).toBe(RUT_NORM);
    expect(normalizeRut('76882110-4')).toBe(RUT_NORM);
  });

  it('formatea display chileno', () => {
    expect(formatRutDisplay(RUT_NORM)).toBe('76.882.110-4');
  });

  it('corte de mes contable: 2026-08 excluye desde el 1 de septiembre UTC', () => {
    expect(fechaExclusivaTrasPeriodo('2026-08')?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(fechaExclusivaTrasPeriodo('2026-12')?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(fechaExclusivaTrasPeriodo('malo')).toBeNull();
  });

  it('parte refs de calce con espacio o coma', () => {
    expect(splitCalceRefs('FEX-1973 TRF-8842')).toEqual(['FEX-1973', 'TRF-8842']);
    expect(splitCalceRefs('FAC-C-8810, PAG-22')).toEqual(['FAC-C-8810', 'PAG-22']);
  });
});

describe('CuentaCorrienteService estado de cuenta por RUT', () => {
  let service: CuentaCorrienteService;
  let prisma: ReturnType<typeof createPrismaMock>['prisma'];

  beforeEach(() => {
    const harness = createPrismaMock();
    prisma = harness.prisma;
    prisma.cliente.findMany.mockResolvedValue([]);
    prisma.proveedor.findMany.mockResolvedValue([]);
    prisma.cuentaCorrienteMovimiento.findMany.mockResolvedValue([]);
    prisma.pago.findMany.mockResolvedValue([]);
    prisma.anticipoProductor.findMany.mockResolvedValue([]);
    prisma.documentoAging.findMany.mockResolvedValue([]);
    service = new CuentaCorrienteService(harness.mock);
  });

  it('fusiona cliente y proveedor del mismo RUT (dual) y expone calce', async () => {
    prisma.cliente.findMany.mockResolvedValue([
      { id: 'CLI-1', rut: RUT_DUAL, razonSocial: 'COMERCIAL FRUTAM SPA', esProductor: false },
    ]);
    prisma.proveedor.findMany.mockResolvedValue([
      { id: 'PRV-1', rut: '76882110-4', razonSocial: 'COMERCIAL FRUTAM SPA', esProductor: false },
    ]);
    prisma.cuentaCorrienteMovimiento.findMany.mockResolvedValue([
      ccRow({
        id: 'CC-VTA',
        terceroTipo: 'CLIENTE',
        terceroId: 'CLI-1',
        documentoRef: 'FAC-45821',
        origen: 'VENTA',
        documentoComercialId: 'DOC-1',
        debe: 2_400_000,
        haber: 0,
      }),
      ccRow({
        id: 'CC-CMP',
        terceroTipo: 'PROVEEDOR',
        terceroId: 'PRV-1',
        terceroNombre: 'COMERCIAL FRUTAM SPA',
        fecha: new Date('2026-08-08'),
        documentoRef: 'FAC-C-8901',
        origen: 'COMPRA',
        documentoComercialId: null,
        registroCompraId: 'RC-1',
        debe: 0,
        haber: 2_400_000,
      }),
      ccRow({
        id: 'CC-PAGO',
        terceroTipo: 'CLIENTE',
        terceroId: 'CLI-1',
        fecha: new Date('2026-08-14'),
        documentoRef: 'TRF-9001',
        documentoTipo: 'PAGO',
        origen: 'PAGO',
        pagoId: 'PAG-1',
        documentoComercialId: null,
        debe: 0,
        haber: 2_400_000,
      }),
    ]);
    prisma.pago.findMany.mockResolvedValue([
      {
        id: 'PAG-1',
        tipo: 'PAGO_TOTAL',
        documentosCalce: 'FAC-45821 TRF-9001',
        medio: 'Transferencia',
        clienteId: 'CLI-1',
        proveedorId: null,
      },
    ]);
    prisma.documentoAging.findMany.mockResolvedValue([
      {
        documento: 'FAC-45821',
        saldo: 0,
        montoPagado: 2_400_000,
        documentoComercialId: 'DOC-1',
        registroCompraId: null,
      },
      {
        documento: 'FAC-C-8901',
        saldo: 2_400_000,
        montoPagado: 0,
        documentoComercialId: null,
        registroCompraId: 'RC-1',
      },
    ]);

    const result = await service.getEstadoCuentaPorRut(
      tenantUser({ permisos: ['tesoreria:read'] }),
      { rut: '76.882.110-4' },
      'EMP-1',
    );

    expect(result.dual).toBe(true);
    expect(result.rut).toBe(RUT_NORM);
    expect(result.cliente?.id).toBe('CLI-1');
    expect(result.proveedor?.id).toBe('PRV-1');
    expect(result.roles).toEqual(expect.arrayContaining(['CLIENTE', 'PROVEEDOR']));
    expect(result.movimientos).toHaveLength(3);

    const factura = result.movimientos.find((m) => m.folio === 'FAC-45821');
    expect(factura?.estadoLiquidacion).toBe('CALZADO');
    expect(factura?.linkTarget?.tipo).toBe('LIBRO_VENTAS');
    expect(factura?.linkTarget?.to).toContain('/comercial/libro');
    expect(factura?.calces.some((c) => c.id === 'PAG-1')).toBe(true);

    const compra = result.movimientos.find((m) => m.folio === 'FAC-C-8901');
    expect(compra?.estadoLiquidacion).toBe('PENDIENTE');
    expect(compra?.linkTarget?.tipo).toBe('LIBRO_COMPRAS');
    expect(compra?.linkTarget?.to).toContain('/compras/libro');
  });

  it('404 si el RUT no existe como cliente ni proveedor del tenant', async () => {
    await expect(
      service.getEstadoCuentaPorRut(
        tenantUser({ permisos: ['tesoreria:read'] }),
        { rut: '111111111' },
        'EMP-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.cliente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { empresaId: 'EMP-1' } }),
    );
    expect(prisma.cuentaCorrienteMovimiento.findMany).not.toHaveBeenCalled();
  });

  it('aísla tenant: no usa fichas de otra empresa', async () => {
    prisma.cliente.findMany.mockImplementation(async ({ where }: { where: { empresaId: string } }) => {
      if (where.empresaId === 'EMP-2') {
        return [{ id: 'CLI-X', rut: RUT_DUAL, razonSocial: 'OTRO', esProductor: false }];
      }
      return [];
    });
    prisma.proveedor.findMany.mockResolvedValue([]);

    await expect(
      service.getEstadoCuentaPorRut(
        tenantUser({ empresaId: 'EMP-1', permisos: ['tesoreria:read'] }),
        { rut: RUT_DUAL },
        'EMP-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.cliente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { empresaId: 'EMP-1' } }),
    );
  });

  it('RUT con ficha y sin movimientos devuelve lista vacía (no 404)', async () => {
    prisma.cliente.findMany.mockResolvedValue([
      { id: 'CLI-1', rut: RUT_NORM, razonSocial: 'COMERCIAL FRUTAM SPA', esProductor: false },
    ]);
    const result = await service.getEstadoCuentaPorRut(
      tenantUser({ permisos: ['tesoreria:read'] }),
      { rut: RUT_DUAL },
      'EMP-1',
    );
    expect(result.movimientos).toEqual([]);
    expect(result.cliente?.razonSocial).toBe('COMERCIAL FRUTAM SPA');
    expect(result.saldoNeto).toBe(0);
  });

  it('filtro PENDIENTE oculta facturas ya calzadas', async () => {
    prisma.cliente.findMany.mockResolvedValue([
      { id: 'CLI-1', rut: RUT_DUAL, razonSocial: 'FRUTAM', esProductor: false },
    ]);
    prisma.cuentaCorrienteMovimiento.findMany.mockResolvedValue([
      ccRow({
        id: 'CC-OK',
        documentoRef: 'FAC-1',
        documentoComercialId: 'DOC-1',
        debe: 100,
      }),
      ccRow({
        id: 'CC-OPEN',
        documentoRef: 'FAC-2',
        documentoComercialId: 'DOC-2',
        debe: 50,
      }),
    ]);
    prisma.documentoAging.findMany.mockResolvedValue([
      { documento: 'FAC-1', saldo: 0, montoPagado: 100, documentoComercialId: 'DOC-1' },
      { documento: 'FAC-2', saldo: 50, montoPagado: 0, documentoComercialId: 'DOC-2' },
    ]);
    prisma.pago.findMany.mockResolvedValue([
      { id: 'PAG-1', tipo: 'PAGO_TOTAL', documentosCalce: 'FAC-1', medio: 'TEF' },
    ]);

    const result = await service.getEstadoCuentaPorRut(
      tenantUser({ permisos: ['tesoreria:read'] }),
      { rut: RUT_NORM, filtro: 'PENDIENTE' },
      'EMP-1',
    );
    expect(result.movimientos.map((m) => m.folio)).toEqual(['FAC-2']);
  });

  it('listSaldos agrupa dual por RUT y no parte en dos filas', async () => {
    prisma.cliente.findMany.mockResolvedValue([
      { id: 'CLI-1', rut: RUT_DUAL, razonSocial: 'COMERCIAL FRUTAM SPA', esProductor: false },
    ]);
    prisma.proveedor.findMany.mockResolvedValue([
      { id: 'PRV-1', rut: RUT_DUAL, razonSocial: 'COMERCIAL FRUTAM SPA', esProductor: false },
    ]);
    prisma.cuentaCorrienteMovimiento.findMany.mockResolvedValue([
      ccRow({ terceroTipo: 'CLIENTE', terceroId: 'CLI-1', debe: 100, haber: 0 }),
      ccRow({ terceroTipo: 'PROVEEDOR', terceroId: 'PRV-1', debe: 0, haber: 40 }),
    ]);

    const items = await service.listSaldos(
      tenantUser({ permisos: ['tesoreria:read'] }),
      {},
      'EMP-1',
    );
    expect(items).toHaveLength(1);
    expect(items[0].rut).toBe(RUT_NORM);
    expect(items[0].roles).toEqual(expect.arrayContaining(['CLIENTE', 'PROVEEDOR']));
    expect(items[0].saldoCliente).toBe(100);
    expect(items[0].saldoProveedor).toBe(-40);
    expect(items[0].saldo).toBe(60);
  });

  it('listSaldos con periodo ignora movimientos posteriores al mes', async () => {
    prisma.cliente.findMany.mockResolvedValue([
      { id: 'CLI-1', rut: RUT_DUAL, razonSocial: 'COMERCIAL FRUTAM SPA', esProductor: false },
    ]);
    prisma.cuentaCorrienteMovimiento.findMany.mockResolvedValue([
      ccRow({ id: 'CC-AGO', fecha: new Date('2026-08-12'), debe: 100, haber: 0 }),
      ccRow({ id: 'CC-OCT', fecha: new Date('2026-10-05'), debe: 999, haber: 0 }),
    ]);
    const items = await service.listSaldos(
      tenantUser({ permisos: ['tesoreria:read'] }),
      { periodo: '2026-08' },
      'EMP-1',
    );
    expect(items).toHaveLength(1);
    expect(items[0].debe).toBe(100);
    expect(items[0].saldo).toBe(100);
  });

  it('rechaza RUT demasiado corto', async () => {
    await expect(
      service.getEstadoCuentaPorRut(
        tenantUser({ permisos: ['tesoreria:read'] }),
        { rut: '12' },
        'EMP-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
