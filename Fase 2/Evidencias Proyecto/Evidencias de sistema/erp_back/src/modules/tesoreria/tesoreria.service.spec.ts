import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TesoreriaService } from './tesoreria.service';
import { createPrismaMock, tenantUser } from '../../test-utils/prisma-mock';

describe('TesoreriaService', () => {
  let service: TesoreriaService;
  let prisma: ReturnType<typeof createPrismaMock>['prisma'];

  beforeEach(() => {
    const harness = createPrismaMock();
    prisma = harness.prisma;
    prisma.registroCompra.findMany.mockResolvedValue([]);
    prisma.documentoComercial.findMany.mockResolvedValue([]);
    prisma.ordenCompra.findMany.mockResolvedValue([]);
    prisma.documentoAging.findFirst.mockResolvedValue(null);
    prisma.indicadorBc.findMany.mockResolvedValue([]);
    service = new TesoreriaService(harness.mock);
  });

  it('desconcilia movimiento selectivo', async () => {
    prisma.movimientoConciliacion.findUnique.mockResolvedValue({
      id: 'MC-1',
      conciliacionId: 'CON-1',
      fecha: new Date('2026-07-01'),
      referencia: 'REF',
      glosa: 'G',
      monto: 100,
      tipo: 'INGRESO',
      origen: 'MANUAL',
      estado: 'CONCILIADO',
      empresaId: 'EMP-1',
    });
    prisma.movimientoConciliacion.update.mockResolvedValue({
      id: 'MC-1',
      conciliacionId: 'CON-1',
      fecha: new Date('2026-07-01'),
      referencia: 'REF',
      glosa: 'G',
      monto: 100,
      tipo: 'INGRESO',
      origen: 'MANUAL',
      estado: 'PENDIENTE',
      empresaId: 'EMP-1',
    });
    prisma.conciliacion.findUnique.mockResolvedValue({
      id: 'CON-1',
      conciliados: 2,
      diferencia: 0,
      estado: 'ACTIVO',
    });
    prisma.conciliacion.update.mockResolvedValue({});

    const result = await service.desconciliarMovimiento(
      tenantUser({ permisos: ['tesoreria:write'] }),
      'MC-1',
    );
    expect(result.estado).toBe('PENDIENTE');
  });

  it('rechaza contabilizar movimiento ya contabilizado', async () => {
    prisma.movimientoCartola.findUnique.mockResolvedValue({
      id: 'M1',
      cartolaId: 'C1',
      empresaId: 'EMP-1',
      estadoContable: 'CONTABILIZADO',
      monto: 10,
      tipo: 'INGRESO',
      referencia: 'R',
      glosa: 'G',
      fecha: new Date(),
    });
    await expect(
      service.contabilizarMovimientoCartola(tenantUser(), 'M1', {
        cuentaContraId: 'CTA-2',
        destinoTipo: 'OTRO',
        codigoFinancieroId: 'CF-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza crear pago con estado inválido (no 500 Prisma)', async () => {
    await expect(
      service.createPago(
        tenantUser({ permisos: ['tesoreria:write'] }),
        {
          fecha: '2026-08-15',
          beneficiario: 'Proveedor QA',
          monto: 1000,
          medio: 'TRANSFERENCIA',
          estado: 'CONFIRMADO',
        },
        'EMP-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.pago.create).not.toHaveBeenCalled();
  });

  it('crea cobro de factura con clienteId y genera aging si no existía', async () => {
    const fecha = new Date('2026-08-16');
    prisma.cliente.findFirst.mockResolvedValue({
      id: 'CLI-1',
      razonSocial: 'Comercial Packing Centro',
      empresaId: 'EMP-1',
      activo: true,
    });
    prisma.pago.create.mockResolvedValue({
      id: 'PAG-1',
      fecha,
      beneficiario: 'Comercial Packing Centro',
      monto: 220151.38,
      medio: 'Transferencia',
      estado: 'ACTIVO',
      tcManual: null,
      monedaPago: 'CLP',
      monedaFactura: 'CLP',
      diferenciaTc: null,
      documentosCalce: '8001786776898086',
      movimientoCartolaId: null,
      proveedorId: null,
      clienteId: 'CLI-1',
    });
    prisma.documentoAging.findFirst.mockResolvedValue(null);
    prisma.documentoComercial.findMany.mockResolvedValue([
      { folio: '8001786776898086', estado: 'CONTABILIZADA' },
    ]);
    prisma.documentoComercial.findFirst.mockResolvedValue({
      id: 'DOC-1',
      empresaId: 'EMP-1',
      folio: '8001786776898086',
      tipo: 'FACTURA',
      estado: 'CONTABILIZADA',
      cliente: 'Comercial Packing Centro',
      neto: 185001,
      iva: 35150.38,
      fecha,
      fechaVencimiento: null,
    });
    prisma.documentoAging.create.mockResolvedValue({
      id: 'AG-1',
      saldo: 220151.38,
      monto: 220151.38,
      montoPagado: 0,
    });
    prisma.documentoAging.update.mockResolvedValue({});

    const row = await service.createPago(
      tenantUser({ permisos: ['tesoreria:write'] }),
      {
        fecha: '2026-08-16',
        beneficiario: 'Comercial Packing Centro',
        monto: 220151.38,
        medio: 'Transferencia',
        estado: 'ACTIVO',
        clienteId: 'CLI-1',
        documentosCalce: '8001786776898086',
        monedaPago: 'CLP',
        monedaFactura: 'CLP',
      },
      'EMP-1',
    );

    expect(row.clienteId).toBe('CLI-1');
    expect(row.proveedorId).toBeUndefined();
    expect(prisma.pago.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clienteId: 'CLI-1',
          proveedorId: null,
          documentosCalce: '8001786776898086',
        }),
      }),
    );
    expect(prisma.documentoAging.create).toHaveBeenCalled();
    expect(prisma.documentoAging.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ saldo: 0 }),
      }),
    );
  });

  it('rechaza pago si la factura está ligada a OC PENDIENTE_APROBACION', async () => {
    prisma.proveedor.findFirst.mockResolvedValue({
      id: 'PROV-1',
      razonSocial: 'Prov',
      empresaId: 'EMP-1',
      activo: true,
    });
    prisma.registroCompra.findMany.mockResolvedValue([
      {
        ocId: 'OC-1',
        ocNumero: 'OC-100',
        factura: 'F-99',
        ordenCompra: { estado: 'PENDIENTE_APROBACION', numero: 'OC-100' },
      },
    ]);
    await expect(
      service.createPago(
        tenantUser({ permisos: ['tesoreria:write'] }),
        {
          fecha: '2026-08-15',
          beneficiario: 'Prov',
          monto: 1000,
          medio: 'TRANSFERENCIA',
          estado: 'PENDIENTE',
          proveedorId: 'PROV-1',
          documentosCalce: 'F-99',
        },
        'EMP-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.pago.create).not.toHaveBeenCalled();
  });

  it('rechaza cobro si la factura de venta no está CONTABILIZADA', async () => {
    prisma.cliente.findFirst.mockResolvedValue({
      id: 'CLI-1',
      razonSocial: 'Cliente',
      empresaId: 'EMP-1',
      activo: true,
    });
    prisma.documentoComercial.findMany.mockResolvedValue([
      { folio: 'FAC-1', estado: 'EMITIDO' },
    ]);
    await expect(
      service.createPago(
        tenantUser({ permisos: ['tesoreria:write'] }),
        {
          fecha: '2026-08-15',
          beneficiario: 'Cliente',
          monto: 1000,
          medio: 'TRANSFERENCIA',
          estado: 'ACTIVO',
          clienteId: 'CLI-1',
          documentosCalce: 'FAC-1',
        },
        'EMP-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.pago.create).not.toHaveBeenCalled();
  });

  it('rechaza pago si el calce es número OC no operable (TES-PRE-1)', async () => {
    prisma.proveedor.findFirst.mockResolvedValue({
      id: 'PROV-1',
      razonSocial: 'Prov',
      empresaId: 'EMP-1',
      activo: true,
    });
    prisma.ordenCompra.findMany.mockResolvedValue([
      { numero: 'OC-NO-OPERABLE', estado: 'BORRADOR' },
    ]);
    await expect(
      service.createPago(
        tenantUser({ permisos: ['tesoreria:write'] }),
        {
          fecha: '2026-08-15',
          beneficiario: 'Prov',
          monto: 1000,
          medio: 'TRANSFERENCIA',
          estado: 'ACTIVO',
          proveedorId: 'PROV-1',
          documentosCalce: 'OC-NO-OPERABLE',
        },
        'EMP-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.pago.create).not.toHaveBeenCalled();
  });

  it('rechaza pago sin deuda contabilizada antes de persistir (TES-PRE-3)', async () => {
    prisma.cliente.findFirst.mockResolvedValue({
      id: 'CLI-1',
      razonSocial: 'Cliente',
      empresaId: 'EMP-1',
      activo: true,
    });
    prisma.documentoComercial.findMany.mockResolvedValue([]);
    prisma.documentoComercial.findFirst.mockResolvedValue(null);
    prisma.documentoAging.findFirst.mockResolvedValue(null);
    await expect(
      service.createPago(
        tenantUser({ permisos: ['tesoreria:write'] }),
        {
          fecha: '2026-08-15',
          beneficiario: 'Cliente',
          monto: 1000,
          medio: 'TRANSFERENCIA',
          estado: 'ACTIVO',
          clienteId: 'CLI-1',
          documentosCalce: 'FAC-NO-CONTAB',
        },
        'EMP-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.pago.create).not.toHaveBeenCalled();
  });

  it('rechaza cerrar cartola con ingreso sin calzar (TES-CART-6)', async () => {
    prisma.cartolaBancaria.findUnique.mockResolvedValue({
      id: 'CART-1',
      empresaId: 'EMP-1',
      estado: 'ABIERTA',
    });
    prisma.movimientoCartola.count
      .mockResolvedValueOnce(0) // pendientes contabilizar
      .mockResolvedValueOnce(1); // sin calce (cualquier tipo)
    await expect(
      service.cerrarCartola(tenantUser({ permisos: ['tesoreria:write'] }), 'CART-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.cartolaBancaria.update).not.toHaveBeenCalled();
  });

  it('rechaza editar calce o monto de un pago existente', async () => {
    prisma.pago.findUnique.mockResolvedValue({
      id: 'PAG-1',
      empresaId: 'EMP-1',
      beneficiario: 'Prov',
      monto: 1000,
      documentosCalce: 'F-1',
      proveedorId: 'PROV-1',
      clienteId: null,
    });
    await expect(
      service.updatePago(
        tenantUser({ permisos: ['tesoreria:write'] }),
        'PAG-1',
        {
          fecha: '2026-08-15',
          beneficiario: 'Prov',
          monto: 2000,
          medio: 'TRANSFERENCIA',
          estado: 'ACTIVO',
          proveedorId: 'PROV-1',
          documentosCalce: 'F-1',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.pago.update).not.toHaveBeenCalled();
  });

  it('aplaza compromiso a YYYY-MM-Sn sin mutar vencimiento', async () => {
    const existing = {
      id: 'AGE-1',
      tipo: 'POR_PAGAR',
      documento: 'FAC-1',
      contraparte: 'Prov',
      fechaEmision: new Date('2026-08-01T00:00:00.000Z'),
      fechaVencimiento: new Date('2026-08-05T00:00:00.000Z'),
      monto: 1000,
      saldo: 1000,
      montoPagado: 0,
      diasAtraso: 21,
      estado: 'ATRASADO',
      documentoComercialId: null,
      registroCompraId: 'RC-1',
      semanaCompromiso: '2026-08-S1',
      vencimientoHistorial: null,
      empresaId: 'EMP-1',
    };
    prisma.documentoAging.findUnique.mockResolvedValue(existing);
    prisma.documentoAging.update.mockResolvedValue({ ...existing, semanaCompromiso: '2026-08-S3' });
    const result = await service.updateDocumentoAging(
      tenantUser({ permisos: ['tesoreria:write'] }),
      'AGE-1',
      { semanaCompromiso: '2026-08-S3' },
    );
    expect(result.semanaCompromiso).toBe('2026-08-S3');
    expect(result.aplazada).toBe(true);
    expect(result.semanaNatural).toBe('2026-08-S1');
    expect(prisma.documentoAging.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { semanaCompromiso: '2026-08-S3' },
      }),
    );
  });

  it('rechaza aplazar un documento ya pagado', async () => {
    prisma.documentoAging.findUnique.mockResolvedValue({
      id: 'AGE-2',
      tipo: 'POR_PAGAR',
      documento: 'FAC-2',
      saldo: 0,
      fechaVencimiento: new Date('2026-08-05T00:00:00.000Z'),
      empresaId: 'EMP-1',
    });
    await expect(
      service.updateDocumentoAging(
        tenantUser({ permisos: ['tesoreria:write'] }),
        'AGE-2',
        { semanaCompromiso: '2026-08-S4' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.documentoAging.update).not.toHaveBeenCalled();
  });

  it('aplaza lote y revierte a la semana de emisión', async () => {
    const row = {
      id: 'AGE-3',
      tipo: 'POR_PAGAR',
      documento: 'FAC-3',
      contraparte: 'Prov',
      fechaEmision: new Date('2026-09-21T17:35:00.000Z'),
      fechaVencimiento: new Date('2026-10-21T00:00:00.000Z'),
      monto: 500,
      saldo: 500,
      montoPagado: 0,
      diasAtraso: 0,
      estado: 'AL_DIA',
      documentoComercialId: null,
      registroCompraId: null,
      semanaCompromiso: '2026-10-S3',
      vencimientoHistorial: null,
      empresaId: 'EMP-1',
    };
    prisma.documentoAging.findMany.mockResolvedValue([row]);
    prisma.documentoAging.update.mockResolvedValue({ ...row, semanaCompromiso: '2026-09-S3' });
    const result = await service.aplazarNominaLote(
      tenantUser({ permisos: ['tesoreria:write'] }),
      { ids: ['AGE-3'], revertir: true },
    );
    expect(result).toHaveLength(1);
    expect(result[0].semanaCompromiso).toBe('2026-09-S3');
    expect(result[0].aplazada).toBe(false);
    expect(prisma.documentoAging.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { semanaCompromiso: '2026-09-S3' },
      }),
    );
  });

  it('contabiliza destino otro sin crear pago', async () => {
    const harness = createPrismaMock();
    prisma = harness.prisma;
    const createAsiento = jest.fn().mockResolvedValue({ id: 'ASI-1', numero: '20260001' });
    service = new TesoreriaService(harness.mock, { createAsiento } as never);
    const fecha = new Date('2026-08-10');
    prisma.movimientoCartola.findUnique.mockResolvedValue({
      id: 'M1',
      cartolaId: 'C1',
      empresaId: 'EMP-1',
      estadoContable: 'PENDIENTE',
      monto: 100,
      tipo: 'EGRESO',
      referencia: 'TRX-1',
      glosa: 'Sueldo',
      fecha,
      pagoId: null,
    });
    prisma.cartolaBancaria.findUnique.mockResolvedValue({
      id: 'C1',
      banco: 'Banco Estado',
      estado: 'CARGADA',
      empresaId: 'EMP-1',
    });
    prisma.codigoFinanciero.findFirst.mockResolvedValue({
      id: 'CF-1',
      codigo: 'SUELDO',
      nombre: 'Remuneraciones',
      activa: true,
      empresaId: 'EMP-1',
    });
    prisma.cuentaContable.findFirst.mockResolvedValue({
      id: 'CTA-2',
      codigo: '2-1-01-01',
      activa: true,
      noImputable: false,
      empresaId: 'EMP-1',
    });
    prisma.configContableSii.findFirst.mockResolvedValue({ cuentaContableId: 'CTA-BANCO' });
    prisma.asiento.findFirst.mockResolvedValue(null);
    prisma.movimientoCartola.update.mockResolvedValue({
      id: 'M1',
      cartolaId: 'C1',
      fecha,
      referencia: 'TRX-1',
      glosa: 'Sueldo',
      monto: 100,
      tipo: 'EGRESO',
      estadoContable: 'CONTABILIZADO',
      asientoNumero: '20260001',
      pagoId: null,
      destinoTipo: 'OTRO',
      codigoFinancieroId: 'CF-1',
      codigoFinanciero: { codigo: 'SUELDO', nombre: 'Remuneraciones' },
    });
    prisma.movimientoCartola.count.mockResolvedValue(0);
    prisma.cartolaBancaria.update.mockResolvedValue({});

    const result = await service.contabilizarMovimientoCartola(
      tenantUser({ permisos: ['tesoreria:write'] }),
      'M1',
      { cuentaContraId: 'CTA-2', destinoTipo: 'OTRO', codigoFinancieroId: 'CF-1' },
    );
    expect(result.estadoContable).toBe('CONTABILIZADO');
    expect(result.destinoTipo).toBe('OTRO');
    expect(prisma.pago.create).not.toHaveBeenCalled();
    expect(createAsiento).toHaveBeenCalledWith(expect.objectContaining({ origen: 'CARTOLA:M1' }));
  });

  it('rechaza contracuenta que exige CC sin centros ligados en el plan', async () => {
    const harness = createPrismaMock();
    prisma = harness.prisma;
    const createAsiento = jest.fn();
    service = new TesoreriaService(harness.mock, { createAsiento } as never);
    prisma.movimientoCartola.findUnique.mockResolvedValue({
      id: 'M1',
      cartolaId: 'C1',
      empresaId: 'EMP-1',
      estadoContable: 'PENDIENTE',
      monto: 100,
      tipo: 'EGRESO',
      referencia: 'TRX-1',
      glosa: 'Gasto',
      fecha: new Date('2026-08-10'),
      pagoId: null,
    });
    prisma.cartolaBancaria.findUnique.mockResolvedValue({
      id: 'C1',
      banco: 'Banco Estado',
      estado: 'CARGADA',
      empresaId: 'EMP-1',
    });
    prisma.codigoFinanciero.findFirst.mockResolvedValue({
      id: 'CF-1',
      codigo: 'GAS',
      nombre: 'Gastos',
      activa: true,
      empresaId: 'EMP-1',
    });
    prisma.cuentaContable.findFirst.mockResolvedValue({
      id: 'CTA-2',
      codigo: '5-1-01-01',
      activa: true,
      noImputable: false,
      empresaId: 'EMP-1',
      requiereCc: true,
      requiereArea: false,
      requiereElemento: false,
      centrosCosto: [],
      areasNegocio: [],
      elementosCosto: [],
    });

    await expect(
      service.contabilizarMovimientoCartola(tenantUser({ permisos: ['tesoreria:write'] }), 'M1', {
        cuentaContraId: 'CTA-2',
        destinoTipo: 'OTRO',
        codigoFinancieroId: 'CF-1',
        centroCostoId: 'CC-1',
      }),
    ).rejects.toThrow(/no tiene centros ligados/);
    expect(createAsiento).not.toHaveBeenCalled();
  });

  it('contabiliza con el centro ligado al plan', async () => {
    const harness = createPrismaMock();
    prisma = harness.prisma;
    const createAsiento = jest.fn().mockResolvedValue({ id: 'ASI-1', numero: '20260002' });
    service = new TesoreriaService(harness.mock, { createAsiento } as never);
    const fecha = new Date('2026-08-10');
    prisma.movimientoCartola.findUnique.mockResolvedValue({
      id: 'M1',
      cartolaId: 'C1',
      empresaId: 'EMP-1',
      estadoContable: 'PENDIENTE',
      monto: 100,
      tipo: 'EGRESO',
      referencia: 'TRX-1',
      glosa: 'Gasto',
      fecha,
      pagoId: null,
    });
    prisma.cartolaBancaria.findUnique.mockResolvedValue({
      id: 'C1',
      banco: 'Banco Estado',
      estado: 'CARGADA',
      empresaId: 'EMP-1',
    });
    prisma.codigoFinanciero.findFirst.mockResolvedValue({
      id: 'CF-1',
      codigo: 'GAS',
      nombre: 'Gastos',
      activa: true,
      empresaId: 'EMP-1',
    });
    prisma.cuentaContable.findFirst.mockResolvedValue({
      id: 'CTA-2',
      codigo: '5-1-01-01',
      activa: true,
      noImputable: false,
      empresaId: 'EMP-1',
      requiereCc: true,
      requiereArea: false,
      requiereElemento: false,
      centrosCosto: [{ centroCostoId: 'CC-1' }],
      areasNegocio: [],
      elementosCosto: [],
    });
    prisma.centroCosto.findFirst.mockResolvedValue({ id: 'CC-1', empresaId: 'EMP-1' });
    prisma.configContableSii.findFirst.mockResolvedValue({ cuentaContableId: 'CTA-BANCO' });
    prisma.asiento.findFirst.mockResolvedValue(null);
    prisma.movimientoCartola.update.mockResolvedValue({
      id: 'M1',
      cartolaId: 'C1',
      fecha,
      referencia: 'TRX-1',
      glosa: 'Gasto',
      monto: 100,
      tipo: 'EGRESO',
      estadoContable: 'CONTABILIZADO',
      asientoNumero: '20260002',
      pagoId: null,
      destinoTipo: 'OTRO',
      codigoFinancieroId: 'CF-1',
      codigoFinanciero: { codigo: 'GAS', nombre: 'Gastos' },
    });
    prisma.movimientoCartola.count.mockResolvedValue(0);
    prisma.cartolaBancaria.update.mockResolvedValue({});

    const result = await service.contabilizarMovimientoCartola(
      tenantUser({ permisos: ['tesoreria:write'] }),
      'M1',
      {
        cuentaContraId: 'CTA-2',
        destinoTipo: 'OTRO',
        codigoFinancieroId: 'CF-1',
        centroCostoId: 'CC-1',
      },
    );
    expect(result.estadoContable).toBe('CONTABILIZADO');
    expect(createAsiento).toHaveBeenCalled();
  });

  it('rechaza factura si el documento no existe (no cambia a anticipo)', async () => {
    prisma.movimientoCartola.findUnique.mockResolvedValue({
      id: 'M2',
      cartolaId: 'C1',
      empresaId: 'EMP-1',
      estadoContable: 'PENDIENTE',
      monto: 50,
      tipo: 'EGRESO',
      referencia: 'TRX-2',
      glosa: 'Pago',
      fecha: new Date('2026-08-11'),
      pagoId: null,
    });
    prisma.cartolaBancaria.findUnique.mockResolvedValue({
      id: 'C1',
      banco: 'Banco Estado',
      estado: 'CARGADA',
      empresaId: 'EMP-1',
    });
    prisma.codigoFinanciero.findFirst.mockResolvedValue({
      id: 'CF-1',
      codigo: 'PROV',
      nombre: 'Proveedores',
      activa: true,
      empresaId: 'EMP-1',
    });
    prisma.cuentaContable.findFirst.mockResolvedValue({
      id: 'CTA-2',
      activa: true,
      noImputable: false,
      empresaId: 'EMP-1',
    });
    prisma.registroCompra.findFirst.mockResolvedValue(null);
    prisma.documentoComercial.findFirst.mockResolvedValue(null);

    await expect(
      service.contabilizarMovimientoCartola(tenantUser({ permisos: ['tesoreria:write'] }), 'M2', {
        cuentaContraId: 'CTA-2',
        destinoTipo: 'FACTURA',
        codigoFinancieroId: 'CF-1',
        folioDocumento: 'NO-EXISTE',
      }),
    ).rejects.toThrow(/Anticipo/);
    expect(prisma.pago.create).not.toHaveBeenCalled();
  });

  it('lookup documento sin match indica anticipo', async () => {
    prisma.registroCompra.findFirst.mockResolvedValue(null);
    prisma.documentoComercial.findFirst.mockResolvedValue(null);
    const result = await service.lookupDocumentoCartola(
      tenantUser({ permisos: ['tesoreria:read'] }),
      { folio: 'NO-EXISTE', sentido: 'EGRESO' },
      'EMP-1',
    );
    expect(result.found).toBe(false);
    expect(result.mensaje).toMatch(/Anticipo/);
  });

  it('create ANTICIPO_PRODUCTOR escribe evento TC inicial', async () => {
    const fecha = new Date('2026-09-02');
    prisma.proveedor.findFirst.mockResolvedValue({
      id: 'PROV-1',
      razonSocial: 'Viña Productor',
      empresaId: 'EMP-1',
      activo: true,
      esProductor: true,
    });
    prisma.pago.create.mockResolvedValue({
      id: 'PAG-AP',
      fecha,
      beneficiario: 'Viña Productor',
      monto: 10000000,
      medio: 'Transferencia',
      estado: 'ACTIVO',
      tcManual: 965.5,
      monedaPago: 'CLP',
      monedaFactura: 'USD',
      diferenciaTc: null,
      documentosCalce: null,
      movimientoCartolaId: null,
      proveedorId: 'PROV-1',
      clienteId: null,
      tipo: 'ANTICIPO_PRODUCTOR',
    });
    prisma.pagoTcEvento.create.mockResolvedValue({ id: 'TCE-1' });

    const row = await service.createPago(
      tenantUser({ permisos: ['tesoreria:write'] }),
      {
        fecha: '2026-09-02',
        beneficiario: 'Viña Productor',
        monto: 10000000,
        medio: 'Transferencia',
        estado: 'ACTIVO',
        proveedorId: 'PROV-1',
        tipo: 'ANTICIPO_PRODUCTOR',
        tcManual: 965.5,
        monedaPago: 'CLP',
        monedaFactura: 'USD',
      },
      'EMP-1',
    );

    expect(row.tipo).toBe('ANTICIPO_PRODUCTOR');
    expect(prisma.pagoTcEvento.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pagoId: 'PAG-AP',
          empresaId: 'EMP-1',
          tcAnterior: null,
          tcNuevo: 965.5,
          usuarioId: 'U-2',
          usuarioEmail: 'user@almahue.local',
        }),
      }),
    );
    expect(prisma.indicadorBc.findMany).not.toHaveBeenCalled();
  });

  it('create ANTICIPO_PRODUCTOR rechaza ficha sin casilla Productor', async () => {
    prisma.proveedor.findFirst.mockResolvedValue({
      id: 'PROV-INS',
      razonSocial: 'Insumos Packing Sur SpA',
      empresaId: 'EMP-1',
      activo: true,
      esProductor: false,
    });

    await expect(
      service.createPago(
        tenantUser({ permisos: ['tesoreria:write'] }),
        {
          fecha: '2026-09-02',
          beneficiario: 'Insumos Packing Sur SpA',
          monto: 1_000_000,
          medio: 'Transferencia',
          estado: 'PENDIENTE',
          proveedorId: 'PROV-INS',
          tipo: 'ANTICIPO_PRODUCTOR',
          tcManual: 916,
        },
        'EMP-1',
      ),
    ).rejects.toThrow(/casilla Productor/);
    expect(prisma.pago.create).not.toHaveBeenCalled();
  });

  it('create pago USD sin TC usa IndicadorBc de la fecha (último hábil)', async () => {
    prisma.proveedor.findFirst.mockResolvedValue({
      id: 'PROV-1',
      razonSocial: 'Insumos Packing',
      empresaId: 'EMP-1',
      activo: true,
      esProductor: false,
    });
    prisma.indicadorBc.findMany.mockResolvedValue([
      { fecha: new Date('2026-08-28T00:00:00.000Z'), usd: 945.5, eur: 1100, cny: 131 },
    ]);
    prisma.pago.create.mockResolvedValue({
      id: 'PAG-USD',
      fecha: new Date('2026-08-30'),
      beneficiario: 'Insumos Packing',
      monto: 1000,
      medio: 'Transferencia',
      estado: 'PENDIENTE',
      tcManual: 945.5,
      monedaPago: 'USD',
      monedaFactura: 'USD',
      diferenciaTc: null,
      documentosCalce: null,
      movimientoCartolaId: null,
      proveedorId: 'PROV-1',
      clienteId: null,
      tipo: 'ANTICIPO',
    });

    await service.createPago(
      tenantUser({ permisos: ['tesoreria:write'] }),
      {
        fecha: '2026-08-30',
        beneficiario: 'Insumos Packing',
        monto: 1000,
        medio: 'Transferencia',
        estado: 'PENDIENTE',
        proveedorId: 'PROV-1',
        tipo: 'ANTICIPO',
        monedaPago: 'USD',
      },
      'EMP-1',
    );

    expect(prisma.pago.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tcManual: 945.5, monedaPago: 'USD' }),
      }),
    );
    expect(prisma.pagoTcEvento.create).not.toHaveBeenCalled();
  });

  it('create pago no pisa TC tipeado ni ANTICIPO_PRODUCTOR', async () => {
    prisma.proveedor.findFirst.mockResolvedValue({
      id: 'PROV-1',
      razonSocial: 'Insumos Packing',
      empresaId: 'EMP-1',
      activo: true,
      esProductor: true,
    });
    prisma.indicadorBc.findMany.mockResolvedValue([
      { fecha: new Date('2026-09-01T00:00:00.000Z'), usd: 999, eur: 1, cny: 1 },
    ]);
    prisma.pago.create.mockResolvedValue({
      id: 'PAG-TC',
      fecha: new Date('2026-09-01'),
      beneficiario: 'Insumos Packing',
      monto: 500,
      medio: 'Transferencia',
      estado: 'PENDIENTE',
      tcManual: 912,
      monedaPago: 'USD',
      monedaFactura: 'USD',
      diferenciaTc: null,
      documentosCalce: null,
      movimientoCartolaId: null,
      proveedorId: 'PROV-1',
      clienteId: null,
      tipo: 'ANTICIPO',
    });

    await service.createPago(
      tenantUser({ permisos: ['tesoreria:write'] }),
      {
        fecha: '2026-09-01',
        beneficiario: 'Insumos Packing',
        monto: 500,
        medio: 'Transferencia',
        estado: 'PENDIENTE',
        proveedorId: 'PROV-1',
        tipo: 'ANTICIPO',
        monedaPago: 'USD',
        tcManual: 912,
      },
      'EMP-1',
    );

    expect(prisma.pago.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tcManual: 912 }),
      }),
    );
    expect(prisma.indicadorBc.findMany).not.toHaveBeenCalled();
  });

  it('updatePago escribe evento TC y no deja cambiar monto', async () => {
    prisma.pago.findUnique.mockResolvedValue({
      id: 'PAG-AP',
      empresaId: 'EMP-1',
      beneficiario: 'Viña Productor',
      monto: 10000000,
      documentosCalce: null,
      proveedorId: 'PROV-1',
      clienteId: null,
      tcManual: 900,
    });
    prisma.proveedor.findFirst.mockResolvedValue({
      id: 'PROV-1',
      razonSocial: 'Viña Productor',
      empresaId: 'EMP-1',
      activo: true,
    });
    prisma.pago.update.mockResolvedValue({
      id: 'PAG-AP',
      fecha: new Date('2026-09-02'),
      beneficiario: 'Viña Productor',
      monto: 10000000,
      medio: 'Transferencia',
      estado: 'ACTIVO',
      tcManual: 965,
      monedaPago: 'CLP',
      monedaFactura: 'USD',
      diferenciaTc: null,
      documentosCalce: null,
      movimientoCartolaId: null,
      proveedorId: 'PROV-1',
      clienteId: null,
      tipo: 'ANTICIPO_PRODUCTOR',
    });
    prisma.pagoTcEvento.create.mockResolvedValue({ id: 'TCE-2' });

    const updated = await service.updatePago(
      tenantUser({ permisos: ['tesoreria:write'] }),
      'PAG-AP',
      {
        fecha: '2026-09-02',
        beneficiario: 'Viña Productor',
        monto: 10000000,
        medio: 'Transferencia',
        estado: 'ACTIVO',
        proveedorId: 'PROV-1',
        tcManual: 965,
        motivo: 'Corrección contrato',
      },
    );
    expect(updated.tcManual).toBe(965);
    expect(prisma.pagoTcEvento.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tcAnterior: 900,
          tcNuevo: 965,
          motivo: 'Corrección contrato',
        }),
      }),
    );

    prisma.pago.findUnique.mockResolvedValue({
      id: 'PAG-AP',
      empresaId: 'EMP-1',
      beneficiario: 'Viña Productor',
      monto: 10000000,
      documentosCalce: null,
      proveedorId: 'PROV-1',
      clienteId: null,
      tcManual: 965,
    });
    await expect(
      service.updatePago(
        tenantUser({ permisos: ['tesoreria:write'] }),
        'PAG-AP',
        {
          fecha: '2026-09-02',
          beneficiario: 'Viña Productor',
          monto: 1,
          medio: 'Transferencia',
          estado: 'ACTIVO',
          proveedorId: 'PROV-1',
          tcManual: 965,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('calzar-productor ok si no había folio; 400 si ya había calce', async () => {
    const base = {
      id: 'PAG-AP',
      empresaId: 'EMP-1',
      tipo: 'ANTICIPO_PRODUCTOR',
      documentosCalce: null as string | null,
      tcManual: 900,
      monto: 10000000,
      beneficiario: 'Viña Productor',
      proveedorId: 'PROV-1',
      clienteId: null,
      movimientoCartolaId: 'MOV-1',
      fecha: new Date('2026-09-02'),
      medio: 'Transferencia',
      estado: 'ACTIVO',
      monedaPago: 'CLP',
      monedaFactura: 'USD',
      diferenciaTc: null,
    };
    prisma.pago.findUnique.mockResolvedValue({ ...base });
    prisma.pago.update.mockResolvedValue({ ...base, documentosCalce: 'FAC-99', tcManual: 965 });
    prisma.pagoTcEvento.create.mockResolvedValue({ id: 'TCE-3' });

    const calzado = await service.calzarProductor(
      tenantUser({ permisos: ['tesoreria:write'] }),
      'PAG-AP',
      { documentosCalce: 'FAC-99', tcManual: 965, motivo: 'Calce liquidación' },
    );
    expect(calzado.documentosCalce).toBe('FAC-99');
    expect(prisma.pago.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ documentosCalce: 'FAC-99', tcManual: 965 }),
      }),
    );
    expect(prisma.pagoTcEvento.create).toHaveBeenCalled();

    prisma.pago.findUnique.mockResolvedValue({ ...base, documentosCalce: 'FAC-99' });
    prisma.pago.update.mockClear();
    await expect(
      service.calzarProductor(
        tenantUser({ permisos: ['tesoreria:write'] }),
        'PAG-AP',
        { documentosCalce: 'FAC-100', tcManual: 965 },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.pago.update).not.toHaveBeenCalled();
  });

  it('calzar-productor no toca monto de cartola', async () => {
    prisma.pago.findUnique.mockResolvedValue({
      id: 'PAG-AP',
      empresaId: 'EMP-1',
      tipo: 'ANTICIPO_PRODUCTOR',
      documentosCalce: null,
      tcManual: 965,
      monto: 10000000,
      beneficiario: 'Viña Productor',
      proveedorId: 'PROV-1',
      clienteId: null,
      movimientoCartolaId: 'MOV-1',
      fecha: new Date('2026-09-02'),
      medio: 'Transferencia',
      estado: 'ACTIVO',
      monedaPago: 'CLP',
      monedaFactura: 'USD',
      diferenciaTc: null,
    });
    prisma.pago.update.mockResolvedValue({
      id: 'PAG-AP',
      fecha: new Date('2026-09-02'),
      beneficiario: 'Viña Productor',
      monto: 10000000,
      medio: 'Transferencia',
      estado: 'ACTIVO',
      tcManual: 965,
      monedaPago: 'CLP',
      monedaFactura: 'USD',
      diferenciaTc: null,
      documentosCalce: 'FAC-88',
      movimientoCartolaId: 'MOV-1',
      proveedorId: 'PROV-1',
      clienteId: null,
      tipo: 'ANTICIPO_PRODUCTOR',
    });

    await service.calzarProductor(
      tenantUser({ permisos: ['tesoreria:write'] }),
      'PAG-AP',
      { documentosCalce: 'FAC-88', tcManual: 965 },
    );

    expect(prisma.movimientoCartola.update).not.toHaveBeenCalled();
    const updateArgs = prisma.pago.update.mock.calls[0]?.[0] as { data?: Record<string, unknown> };
    expect(updateArgs?.data).not.toHaveProperty('monto');
  });

  it('GET tc-eventos 404 si no existe y forbidden si otra empresa', async () => {
    prisma.pago.findUnique.mockResolvedValue(null);
    await expect(
      service.getPagoTcEventos(tenantUser({ permisos: ['tesoreria:read'] }), 'NOPE'),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.pago.findUnique.mockResolvedValue({ id: 'PAG-X', empresaId: 'EMP-2' });
    await expect(
      service.getPagoTcEventos(
        tenantUser({ permisos: ['tesoreria:read'], empresaId: 'EMP-1' }),
        'PAG-X',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.pagoTcEvento.findMany).not.toHaveBeenCalled();
  });

  it('GET flujo-caja une aperturas + cartola CONTABILIZADO, sin copiar a MovimientoCaja', async () => {
    prisma.movimientoCaja.findMany.mockResolvedValue([
      {
        id: 'MC-AP',
        fecha: new Date('2026-08-01'),
        concepto: 'Apertura',
        ingreso: 1000,
        egreso: 0,
        saldo: 1000,
        banco: 'Banco Estado',
        moneda: 'CLP',
        esApertura: true,
      },
    ]);
    prisma.movimientoCartola.findMany.mockResolvedValue([
      {
        id: 'M1',
        cartolaId: 'C1',
        fecha: new Date('2026-08-05'),
        referencia: 'TRF-1',
        glosa: 'Pago proveedor',
        monto: 200,
        tipo: 'EGRESO',
        estadoContable: 'CONTABILIZADO',
        cartola: { banco: 'Banco Estado', bancoCodigo: '1101' },
        codigoFinanciero: { codigo: 'PAGO-PROV', nombre: 'Pago a proveedores' },
      },
      {
        id: 'M2',
        cartolaId: 'C2',
        fecha: new Date('2026-08-06'),
        referencia: 'DEP-USD',
        glosa: 'Abono export',
        monto: 50,
        tipo: 'INGRESO',
        estadoContable: 'CONTABILIZADO',
        cartola: { banco: 'Banco Chile USD', bancoCodigo: null },
        codigoFinanciero: null,
      },
    ]);

    const result = await service.getFlujoCaja(
      tenantUser({ permisos: ['tesoreria:read'] }),
      {},
      'EMP-1',
    );

    expect(prisma.movimientoCaja.create).not.toHaveBeenCalled();
    expect(prisma.movimientoCartola.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { empresaId: 'EMP-1', estadoContable: 'CONTABILIZADO' },
      }),
    );
    expect(result.filas).toHaveLength(3);
    const clp = result.filas.filter((f: { moneda: string }) => f.moneda === 'CLP');
    expect(clp.reduce((a: number, f: { saldo: number }) => a + f.saldo, 0)).toBe(800);
    const usd = result.filas.find((f: { moneda: string }) => f.moneda === 'USD');
    expect(usd?.ingreso).toBe(50);
    expect(usd?.codigoFinancieroCodigo).toBeUndefined();
    const pago = result.filas.find((f: { codigoFinancieroCodigo?: string }) => f.codigoFinancieroCodigo === 'PAGO-PROV');
    expect(pago?.egreso).toBe(200);
    expect(pago?.conceptoNombre).toBe('Sin clasificar');
    expect(result.totalesMoneda.find((t: { moneda: string }) => t.moneda === 'CLP')?.saldo).toBe(800);
  });

  it('GET flujo-caja filtra moneda nativa (Yuan = CNY)', async () => {
    prisma.movimientoCaja.findMany.mockResolvedValue([]);
    prisma.movimientoCartola.findMany.mockResolvedValue([
      {
        id: 'M-CNY',
        cartolaId: 'C-CNY',
        fecha: new Date('2026-08-10'),
        referencia: 'CNY-1',
        glosa: 'Cobro yuan',
        monto: 1200,
        tipo: 'INGRESO',
        estadoContable: 'CONTABILIZADO',
        cartola: { banco: 'Banco China CNY', bancoCodigo: null },
        codigoFinanciero: null,
      },
      {
        id: 'M-CLP',
        cartolaId: 'C-CLP',
        fecha: new Date('2026-08-10'),
        referencia: 'CLP-1',
        glosa: 'Local',
        monto: 999,
        tipo: 'INGRESO',
        estadoContable: 'CONTABILIZADO',
        cartola: { banco: 'Banco Estado', bancoCodigo: null },
        codigoFinanciero: null,
      },
    ]);

    const result = await service.getFlujoCaja(
      tenantUser({ permisos: ['tesoreria:read'] }),
      { moneda: 'YUAN' },
      'EMP-1',
    );
    expect(result.filas).toHaveLength(1);
    expect(result.filas[0].moneda).toBe('CNY');
    expect(result.filas[0].ingreso).toBe(1200);
  });

  it('createCartola inserta movimientos con createMany', async () => {
    prisma.cartolaBancaria.create.mockResolvedValue({
      id: 'C-JUN',
      banco: 'Banco Chile',
      bancoCodigo: null,
      fechaCarga: new Date('2026-06-30'),
      periodo: '2026-06-01/2026-06-30',
      mesContable: '2026/06',
      archivoNombre: '06-CARTOLA_JUNIO_2026.xls',
      formato: 'EXCEL',
      movimientos: 2,
      montoTotal: 150,
      estado: 'CARGADA',
      pendientesContabilizar: 2,
      usuarioCarga: 'user@almahue.local',
    });
    prisma.movimientoCartola.createMany.mockResolvedValue({ count: 2 });

    const result = await service.createCartola(
      tenantUser({ permisos: ['tesoreria:write'] }),
      {
        banco: 'Banco Chile',
        periodo: '2026-06-01/2026-06-30',
        mesContable: '2026/06',
        archivoNombre: '06-CARTOLA_JUNIO_2026.xls',
        lineas: [
          { fecha: '2026-06-19', referencia: 'R1', glosa: 'Traspaso', monto: 100, tipo: 'EGRESO' },
          { fecha: '2026-06-19', referencia: 'R2', glosa: 'Abono', monto: 50, tipo: 'INGRESO' },
        ],
      },
      'EMP-1',
    );

    expect(result.mesContable).toBe('2026/06');
    expect(prisma.movimientoCartola.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.movimientoCartola.create).not.toHaveBeenCalled();
    const payload = prisma.movimientoCartola.createMany.mock.calls[0][0] as { data: unknown[] };
    expect(payload.data).toHaveLength(2);
  });

  it('asocia nómina solo a egresos de cartola', async () => {
    const egreso = {
      id: 'MCAR-E',
      cartolaId: 'CAR-5',
      empresaId: 'EMP-1',
      fecha: new Date(Date.UTC(2026, 7, 13)),
      referencia: 'COM-20',
      glosa: 'Comisión bancaria',
      monto: 18500,
      tipo: 'EGRESO',
      estadoContable: 'PENDIENTE',
      asientoNumero: null,
      pagoId: null,
      nominaSemana: null,
      codigoFinanciero: null,
    };
    prisma.movimientoCartola.findMany
      .mockResolvedValueOnce([egreso])
      .mockResolvedValueOnce([{ ...egreso, nominaSemana: '2026-08-S2' }]);
    prisma.movimientoCartola.updateMany.mockResolvedValue({ count: 1 });
    prisma.documentoAging.findMany.mockResolvedValue([]);

    const res = await service.asociarNominaCartola(
      tenantUser({ permisos: ['tesoreria:write'] }),
      { ids: ['MCAR-E'], nominaSemana: '2026-08-S2' },
    );

    expect(res.ok).toBe(true);
    expect(res.nominaSemana).toBe('2026-08-S2');
    expect(res.asociados).toBe(1);
    expect(prisma.movimientoCartola.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['MCAR-E'] }, empresaId: 'EMP-1' },
      data: { nominaSemana: '2026-08-S2' },
    });
  });

  it('rechaza asociar nómina a un ingreso de cartola', async () => {
    prisma.movimientoCartola.findMany.mockResolvedValue([
      {
        id: 'MCAR-I',
        cartolaId: 'CAR-5',
        empresaId: 'EMP-1',
        tipo: 'INGRESO',
        monto: 2500000,
      },
    ]);

    await expect(
      service.asociarNominaCartola(
        tenantUser({ permisos: ['tesoreria:write'] }),
        { ids: ['MCAR-I'], nominaSemana: '2026-08-S2' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.movimientoCartola.updateMany).not.toHaveBeenCalled();
  });

  it('rechaza contabilizar un ingreso con semana de nómina', async () => {
    prisma.movimientoCartola.findUnique.mockResolvedValue({
      id: 'MCAR-I',
      cartolaId: 'CAR-5',
      empresaId: 'EMP-1',
      tipo: 'INGRESO',
      estadoContable: 'PENDIENTE',
      monto: 2500000,
    });
    prisma.cartolaBancaria.findUnique.mockResolvedValue({
      id: 'CAR-5',
      empresaId: 'EMP-1',
      estado: 'CARGADA',
    });

    await expect(
      service.contabilizarMovimientoCartola(
        tenantUser({ permisos: ['tesoreria:write'] }),
        'MCAR-I',
        {
          cuentaContraId: 'CT-1',
          destinoTipo: 'OTRO',
          codigoFinancieroId: 'CF-1',
          nominaSemana: '2026-08-S2',
        },
      ),
    ).rejects.toMatchObject({ message: 'La nómina solo se asocia a egresos' });
    expect(prisma.codigoFinanciero.findFirst).not.toHaveBeenCalled();
  });

  describe('Diferencia de Cambio (Paso 3)', () => {
    it('previewDiferenciaTc calcula ganancia en cobro USD con TC de la fecha', async () => {
      const res = await service.previewDiferenciaTc(
        tenantUser({ permisos: ['tesoreria:read'] }),
        {
          monto: 10000,
          monedaFactura: 'USD',
          monedaPago: 'CLP',
          tcDocumento: 950,
          tcPago: 965.71,
          sentido: 'COBRO',
        },
      );
      expect(res.aplica).toBe(true);
      expect(res.tipoResultado).toBe('GANANCIA');
      expect(res.diferenciaTc).toBe(157100);
      expect(res.montoOrigenClp).toBe(9500000);
      expect(res.montoLiquidadoClp).toBe(9657100);
    });

    it('createPago calcula automáticamente diferenciaTc al calzar factura de venta en USD', async () => {
      const fecha = new Date('2026-09-25');
      prisma.cliente.findFirst.mockResolvedValue({
        id: 'CLI-EXP',
        razonSocial: 'Dole Fresh Fruit LLC',
        empresaId: 'EMP-1',
        activo: true,
      });
      prisma.documentoComercial.findMany.mockResolvedValue([
        { folio: 'EXP-11001', estado: 'CONTABILIZADA' },
      ]);
      prisma.documentoComercial.findFirst.mockResolvedValue({
        id: 'DOC-EXP-1',
        empresaId: 'EMP-1',
        folio: 'EXP-11001',
        tipo: 'FACTURA',
        estado: 'CONTABILIZADA',
        cliente: 'Dole Fresh Fruit LLC',
        clienteId: 'CLI-EXP',
        neto: 9500000,
        iva: 0,
        monedaCodigo: 'USD',
        tipoCambio: 950,
        montoOtraMoneda: 10000,
        fecha: new Date('2026-09-10'),
      });
      prisma.documentoAging.findFirst.mockResolvedValue({ id: 'AG-EXP', saldo: 9500000 });
      prisma.pago.create.mockResolvedValue({
        id: 'PAG-EXP-1',
        fecha,
        beneficiario: 'Dole Fresh Fruit LLC',
        monto: 9657100,
        medio: 'Transferencia',
        estado: 'ACTIVO',
        tcManual: 965.71,
        monedaPago: 'CLP',
        monedaFactura: 'USD',
        diferenciaTc: 157100,
        documentosCalce: 'EXP-11001',
        movimientoCartolaId: null,
        proveedorId: null,
        clienteId: 'CLI-EXP',
      });

      await service.createPago(
        tenantUser({ permisos: ['tesoreria:write'] }),
        {
          fecha: '2026-09-25',
          beneficiario: 'Dole Fresh Fruit LLC',
          monto: 9657100,
          medio: 'Transferencia',
          estado: 'ACTIVO',
          clienteId: 'CLI-EXP',
          tcManual: 965.71,
          monedaFactura: 'USD',
          documentosCalce: 'EXP-11001',
        },
        'EMP-1',
      );

      expect(prisma.pago.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            diferenciaTc: 157100,
            tcManual: 965.71,
            monedaFactura: 'USD',
          }),
        }),
      );
    });

    it('contabilizarMovimientoCartola genera asiento de 3 líneas con Diferencia de Cambio balanceada en cobro USD', async () => {
      const harness = createPrismaMock();
      prisma = harness.prisma;
      const createAsiento = jest.fn().mockResolvedValue({ id: 'ASI-DIF', numero: '20260901' });
      service = new TesoreriaService(harness.mock, { createAsiento } as never);
      const fecha = new Date('2026-09-25');

      prisma.movimientoCartola.findUnique.mockResolvedValue({
        id: 'MOV-USD-1',
        cartolaId: 'CART-CLP-1',
        empresaId: 'EMP-1',
        estadoContable: 'PENDIENTE',
        monto: 9657100,
        tipo: 'INGRESO',
        referencia: 'ABONO-EXP',
        glosa: 'Cobro Exportacion Dole',
        fecha,
        pagoId: null,
      });
      prisma.cartolaBancaria.findUnique.mockResolvedValue({
        id: 'CART-CLP-1',
        banco: 'Banco Santander',
        moneda: 'CLP',
        estado: 'CARGADA',
        empresaId: 'EMP-1',
      });
      prisma.codigoFinanciero.findFirst.mockResolvedValue({
        id: 'CF-VTAS',
        codigo: 'VTAS_EXP',
        nombre: 'Ventas Exportación',
        activa: true,
        empresaId: 'EMP-1',
      });
      prisma.cuentaContable.findFirst
        .mockResolvedValueOnce({
          id: 'CTA-CLIENTES',
          codigo: '1-1-02-01-001',
          activa: true,
          noImputable: false,
          empresaId: 'EMP-1',
        })
        .mockResolvedValueOnce({
          id: 'CTA-DIF-CAMBIO',
          codigo: '6-3-01-01-003',
          nombre: 'DIFERENCIA TIPO CAMBIO',
          activa: true,
          noImputable: false,
          empresaId: 'EMP-1',
        });

      prisma.configContableSii.findFirst
        .mockResolvedValueOnce({ cuentaContableId: 'CTA-BANCO' })
        .mockResolvedValueOnce({ cuentaContableId: 'CTA-CLIENTES' })
        .mockResolvedValueOnce(null); // resolveCuentaDiferenciaCambio cae al plan de cuentas

      prisma.documentoComercial.findFirst.mockResolvedValue({
        id: 'DOC-EXP-1',
        folio: 'EXP-11001',
        tipo: 'FACTURA',
        estado: 'CONTABILIZADA',
        cliente: 'Dole Fresh Fruit LLC',
        clienteId: 'CLI-EXP',
        neto: 9500000,
        iva: 0,
        monedaCodigo: 'USD',
        tipoCambio: 950,
        montoOtraMoneda: 10000,
        fecha: new Date('2026-09-10'),
      });
      prisma.cliente.findFirst.mockResolvedValue({
        id: 'CLI-EXP',
        razonSocial: 'Dole Fresh Fruit LLC',
        empresaId: 'EMP-1',
        activo: true,
      });
      prisma.asiento.findFirst.mockResolvedValue(null);
      prisma.pago.findUnique.mockResolvedValue(null);
      prisma.pago.create.mockResolvedValue({ id: 'PAG-AUTO-1' });
      prisma.movimientoCartola.update.mockResolvedValue({
        id: 'MOV-USD-1',
        cartolaId: 'CART-CLP-1',
        fecha,
        referencia: 'ABONO-EXP',
        glosa: 'Cobro Exportacion Dole',
        monto: 9657100,
        tipo: 'INGRESO',
        estadoContable: 'CONTABILIZADO',
        asientoNumero: '20260901',
      });

      await service.contabilizarMovimientoCartola(
        tenantUser({ permisos: ['tesoreria:write'] }),
        'MOV-USD-1',
        {
          cuentaContraId: 'CTA-CLIENTES',
          destinoTipo: 'FACTURA',
          folioDocumento: 'EXP-11001',
          codigoFinancieroId: 'CF-VTAS',
          tcManual: 965.71,
        },
      );

      expect(createAsiento).toHaveBeenCalledTimes(1);
      const asientoArg = createAsiento.mock.calls[0][0];
      expect(asientoArg.lineas).toHaveLength(3);

      // Línea 1: Banco (Debe 9,657,100)
      expect(asientoArg.lineas[0].cuentaId).toBe('CTA-BANCO');
      expect(asientoArg.lineas[0].debe).toBe(9657100);
      expect(asientoArg.lineas[0].haber).toBe(0);

      // Línea 2: Clientes (Haber 9,500,000)
      expect(asientoArg.lineas[1].cuentaId).toBe('CTA-CLIENTES');
      expect(asientoArg.lineas[1].debe).toBe(0);
      expect(asientoArg.lineas[1].haber).toBe(9500000);

      // Línea 3: Diferencia de Cambio (Haber 157,100 por ganancia)
      expect(asientoArg.lineas[2].cuentaId).toBe('CTA-DIF-CAMBIO');
      expect(asientoArg.lineas[2].debe).toBe(0);
      expect(asientoArg.lineas[2].haber).toBe(157100);

      // Cuadratura contable exacta: Debe = Haber
      const totalDebe = asientoArg.lineas.reduce((s: number, l: { debe: number }) => s + l.debe, 0);
      const totalHaber = asientoArg.lineas.reduce((s: number, l: { haber: number }) => s + l.haber, 0);
      expect(totalDebe).toBe(9657100);
      expect(totalHaber).toBe(9657100);
    });
  });
});
