import { climbPadreCodigos, ContabilidadService } from './contabilidad.service';
import { ContabilizarService } from './contabilizar.service';
import { createPrismaMock, superAdminUser, tenantUser } from '../../test-utils/prisma-mock';

describe('climbPadreCodigos', () => {
  it('si falta el grupo intermedio, sube hasta la categoría', () => {
    expect(climbPadreCodigos('2-1-03-01', '2-1-03-00')).toEqual([
      '2-1-03-00',
      '2-1-00-00',
      '2-0-00-00',
    ]);
  });
});

describe('ContabilidadService', () => {
  let service: ContabilidadService;
  let prisma: ReturnType<typeof createPrismaMock>['prisma'];

  beforeEach(() => {
    const harness = createPrismaMock();
    prisma = harness.prisma;
    const contabilizar = new ContabilizarService(harness.mock);
    service = new ContabilidadService(harness.mock, contabilizar);
  });

  it('lista cuentas de la empresa operativa', async () => {
    prisma.cuentaContable.findMany.mockResolvedValue([
      {
        id: 'C1',
        codigo: '1-1-01-01',
        codigoExcel: '110101000',
        nombre: 'Caja',
        tipo: 'ACTIVO',
        nivel: 4,
        padreId: null,
        activa: true,
        requiereCc: false,
        requiereArea: false,
        requiereEspecie: false,
        requiereElemento: false,
        noImputable: false,
      },
    ]);

    const rows = await service.getCuentas(tenantUser(), 'EMP-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].codigo).toBe('1-1-01-01');
    expect(rows[0].esImputable).toBe(true);
  });

  describe('P1-11 getMayor con arrastre de saldos entre periodos', () => {
    function asiento(periodo: string, lineas: Array<{ cuentaId: string; debe: number; haber: number }>) {
      return {
        id: `ASI-${periodo}`,
        numero: `N-${periodo}`,
        fecha: new Date(`${periodo}-15`),
        glosa: `Asiento ${periodo}`,
        origen: null,
        estado: 'CONTABILIZADO',
        periodo,
        lineas,
        debe: 0,
        haber: 0,
      };
    }

    it('arrastra el saldo de periodos anteriores al calcular el saldo del mes', async () => {
      prisma.asiento.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
        // getLibroDiario filtra por periodo = codigo exacto (string).
        if (where.periodo === '2026-07') {
          return [asiento('2026-07', [
            { cuentaId: 'C1', debe: 0, haber: 200 },
            { cuentaId: 'C2', debe: 200, haber: 0 },
          ])];
        }
        // getSaldosAcumuladosAntesDe filtra por periodo < codigo.
        if (where.periodo && (where.periodo as Record<string, unknown>).lt === '2026-07') {
          return [asiento('2026-06', [
            { cuentaId: 'C1', debe: 1000, haber: 0 },
            { cuentaId: 'C2', debe: 0, haber: 1000 },
          ])];
        }
        return [];
      });
      prisma.cuentaContable.findMany.mockResolvedValue([
        { id: 'C1', codigo: '1-1-01-01', nombre: 'Caja' },
        { id: 'C2', codigo: '2-1-01-01', nombre: 'Proveedores' },
      ]);

      const mayor = await service.getMayor(tenantUser(), '2026-07', undefined, 'EMP-1');
      const c1 = mayor.cuentas.find((c) => c.cuentaId === 'C1')!;
      const c2 = mayor.cuentas.find((c) => c.cuentaId === 'C2')!;

      expect(c1.debe).toBe(0);
      expect(c1.haber).toBe(200);
      expect(c1.saldoInicial).toBe(1000);
      expect(c1.saldo).toBe(800);

      expect(c2.debe).toBe(200);
      expect(c2.haber).toBe(0);
      expect(c2.saldoInicial).toBe(-1000);
      expect(c2.saldo).toBe(-800);
    });

    it('incluye cuentas con saldo arrastrado aunque no tengan movimiento en el mes actual', async () => {
      prisma.asiento.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.periodo === '2026-07') return [];
        if (where.periodo && (where.periodo as Record<string, unknown>).lt === '2026-07') {
          return [asiento('2026-06', [{ cuentaId: 'C3', debe: 500, haber: 0 }])];
        }
        return [];
      });
      prisma.cuentaContable.findMany.mockResolvedValue([
        { id: 'C3', codigo: '1-1-02-01', nombre: 'Banco' },
      ]);

      const mayor = await service.getMayor(tenantUser(), '2026-07', undefined, 'EMP-1');
      const c3 = mayor.cuentas.find((c) => c.cuentaId === 'C3')!;
      expect(c3).toBeDefined();
      expect(c3.debe).toBe(0);
      expect(c3.haber).toBe(0);
      expect(c3.saldoInicial).toBe(500);
      expect(c3.saldo).toBe(500);
    });
  });

  describe('P0-2 updateAsiento sobre CONTABILIZADO', () => {
    const existente = {
      id: 'ASI-1',
      empresaId: 'EMP-1',
      numero: '20260001',
      periodo: '2026-07',
      fecha: new Date('2026-07-01'),
      tipo: 'MANUAL',
      glosa: 'Original',
      debe: 100,
      haber: 100,
      estado: 'CONTABILIZADO',
      origen: 'Manual',
      lineas: [
        { debe: 100, haber: 0, cuentaId: 'CTA-1' },
        { debe: 0, haber: 100, cuentaId: 'CTA-2' },
      ],
    };

    it('rechaza editar montos/cuentas de un asiento ya contabilizado', async () => {
      prisma.asiento.findUnique.mockResolvedValue(existente);
      await expect(
        service.updateAsiento(
          tenantUser(),
          'ASI-1',
          {
            glosa: 'Editado',
            estado: 'CONTABILIZADO',
            lineas: [
              { debe: 200, haber: 0, cuentaId: 'CTA-1' },
              { debe: 0, haber: 200, cuentaId: 'CTA-2' },
            ],
          } as never,
          'EMP-1',
        ),
      ).rejects.toThrow(/no se puede editar/i);
      expect(prisma.asiento.update).not.toHaveBeenCalled();
    });

    it('anular un asiento contabilizado genera el reverso formal', async () => {
      prisma.asiento.findUnique
        .mockResolvedValueOnce(existente) // updateAsiento: existing
        .mockResolvedValueOnce(existente); // createAsientoReversa: original lookup
      prisma.periodoContable.findUnique.mockResolvedValue({
        id: 'PER-1',
        codigo: '2026-07',
        estado: 'ABIERTO',
        empresaId: 'EMP-1',
      });
      prisma.cuentaContable.findMany.mockResolvedValue([
        { id: 'CTA-1', codigo: '1-1-01-01', noImputable: false, activa: true },
        { id: 'CTA-2', codigo: '2-1-01-01', noImputable: false, activa: true },
      ]);
      prisma.asiento.create.mockResolvedValue({
        id: 'ASI-2',
        numero: '20260002',
        periodo: '2026-07',
        fecha: new Date('2026-07-01'),
        tipo: 'MANUAL',
        glosa: 'Reverso por anulación de 20260001',
        debe: 100,
        haber: 100,
        estado: 'CONTABILIZADO',
        origen: 'REVERSA:20260001',
        lineas: [],
      });
      prisma.asiento.update.mockResolvedValue({ ...existente, estado: 'ANULADO' });

      const result = await service.updateAsiento(
        tenantUser(),
        'ASI-1',
        { glosa: 'Original', estado: 'ANULADO', lineas: existente.lineas } as never,
        'EMP-1',
      );

      expect(prisma.asiento.create).toHaveBeenCalled();
      expect(prisma.asiento.update).toHaveBeenCalledWith({
        where: { id: 'ASI-1' },
        data: { estado: 'ANULADO' },
      });
      expect(result.estado).toBe('ANULADO');
      expect((result as { reversaNumero?: string }).reversaNumero).toBe('20260002');
    });
  });

  it('crea elemento de costo', async () => {
    prisma.elementoCosto.create.mockResolvedValue({
      id: 'EC-1',
      codigo: '10',
      nombre: 'MANO DE OBRA',
      departamento: 'Campo',
      vigencia: 'VIGENTE',
      createdAt: new Date('2026-09-24T12:00:00Z'),
    });

    const row = await service.createElementoCosto(
      tenantUser(),
      { codigo: '10', nombre: 'Mano de obra', departamento: 'Campo' },
      'EMP-1',
    );
    expect(row.codigo).toBe('10');
    expect(row.nombre).toBe('MANO DE OBRA');
    expect(row.vigencia).toBe('VIGENTE');
    expect(prisma.elementoCosto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          codigo: '10',
          nombre: 'MANO DE OBRA',
          vigencia: 'VIGENTE',
        }),
      }),
    );
  });

  it('rechaza elemento con código no numérico en alta', async () => {
    await expect(
      service.createElementoCosto(
        tenantUser(),
        { codigo: 'EL-LAB', nombre: 'Labor', departamento: 'Campo' },
        'EMP-1',
      ),
    ).rejects.toMatchObject({ message: expect.stringMatching(/dígitos/i) });
  });

  it('actualiza elemento de costo', async () => {
    prisma.elementoCosto.findUnique.mockResolvedValue({
      id: 'EC-1',
      codigo: '10',
      nombre: 'MANO DE OBRA',
      departamento: 'Campo',
      vigencia: 'VIGENTE',
      empresaId: 'EMP-1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    prisma.elementoCosto.update.mockResolvedValue({
      id: 'EC-1',
      codigo: '10',
      nombre: 'MANO DE OBRA ACTUALIZADA',
      departamento: 'Packing',
      vigencia: 'ANULADO',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    const row = await service.updateElementoCosto(
      tenantUser(),
      'EC-1',
      {
        codigo: '10',
        nombre: 'Mano de obra actualizada',
        departamento: 'Packing',
        vigencia: 'ANULADO',
      },
      'EMP-1',
    );
    expect(row.nombre).toBe('MANO DE OBRA ACTUALIZADA');
    expect(row.departamento).toBe('Packing');
    expect(row.vigencia).toBe('ANULADO');
  });

  it('rechaza update de elemento que intenta cambiar el código', async () => {
    prisma.elementoCosto.findUnique.mockResolvedValue({
      id: 'EC-1',
      codigo: 'EL-LAB',
      nombre: 'MANO DE OBRA',
      departamento: 'Campo',
      vigencia: 'VIGENTE',
      empresaId: 'EMP-1',
    });
    await expect(
      service.updateElementoCosto(
        tenantUser(),
        'EC-1',
        { codigo: '99', nombre: 'Otro', departamento: 'Campo', vigencia: 'VIGENTE' },
        'EMP-1',
      ),
    ).rejects.toMatchObject({ message: expect.stringMatching(/no se puede modificar/i) });
  });

  it('exige archivo al previsualizar Excel de elementos', async () => {
    await expect(
      service.previewElementosCostoExcel(tenantUser(), undefined, 'EMP-1'),
    ).rejects.toThrow(/xlsx/);
  });

  it('rechaza hard-delete de cuenta (D10: solo inactivar)', async () => {
    prisma.cuentaContable.findUnique.mockResolvedValue({
      id: 'C1',
      empresaId: 'EMP-1',
    });
    prisma.cuentaContable.count.mockResolvedValue(0);
    prisma.configContableSii.count.mockResolvedValue(0);
    prisma.ordenCompra.count.mockResolvedValue(0);
    prisma.documentoComercial.count.mockResolvedValue(0);
    prisma.insumo.count.mockResolvedValue(0);
    prisma.cuentaCentroCosto.count.mockResolvedValue(0);
    prisma.cuentaElementoCosto.count.mockResolvedValue(0);
    prisma.cuentaAreaNegocio.count.mockResolvedValue(0);
    prisma.asiento.findMany.mockResolvedValue([]);

    await expect(service.deleteCuenta(tenantUser(), 'C1', 'EMP-1')).rejects.toMatchObject({
      status: 409,
    });
    expect(prisma.cuentaContable.delete).not.toHaveBeenCalled();
  });

  it('diario y mayor usan el nombre actual del maestro tras rename', async () => {
    prisma.asiento.findMany.mockResolvedValue([
      {
        id: 'A1',
        numero: '20260001',
        periodo: '2026-08',
        fecha: new Date('2026-08-01'),
        glosa: 'Pago',
        debe: 100,
        haber: 100,
        estado: 'CONTABILIZADO',
        origen: null,
        tipo: 'MANUAL',
        lineas: [{ cuentaId: 'C1', debe: 100, haber: 0 }],
      },
    ]);
    prisma.cuentaContable.findMany.mockResolvedValue([
      { id: 'C1', codigo: '1-1-01-01', nombre: 'Caja nueva', tipo: 'ACTIVO' },
    ]);

    const diario = await service.getLibroDiario(tenantUser(), '2026-08', 'EMP-1');
    expect(diario.lineas[0].cuentaNombre).toBe('Caja nueva');

    const mayor = await service.getMayor(tenantUser(), '2026-08', undefined, 'EMP-1');
    expect(mayor.cuentas[0].cuentaNombre).toBe('Caja nueva');
  });

  it('rechaza replace del plan si hay asientos (histórico)', async () => {
    prisma.asiento.count.mockResolvedValue(3);
    prisma.configContableSii.count.mockResolvedValue(0);
    await expect(
      service.bulkCuentas(
        tenantUser(),
        { replace: true, items: [{ codigo: '1-0-00-00', nombre: 'ACTIVO', tipo: 'ACTIVO', nivel: 1 }] },
        'EMP-1',
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(prisma.cuentaContable.delete).not.toHaveBeenCalled();
  });

  it('rechaza replace del plan si hay mapeo SII (no 500)', async () => {
    prisma.asiento.count.mockResolvedValue(0);
    prisma.configContableSii.count.mockResolvedValue(2);
    await expect(
      service.bulkCuentas(
        tenantUser(),
        { replace: true, items: [{ codigo: '1-0-00-00', nombre: 'ACTIVO', tipo: 'ACTIVO', nivel: 1 }] },
        'EMP-1',
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(prisma.cuentaContable.delete).not.toHaveBeenCalled();
  });

  describe('bulkCuentas políticas', () => {
    const existente = {
      id: 'C1',
      codigo: '1-1-01-01',
      nombre: 'Caja',
      nivel: 4,
      padreId: null as string | null,
      requiereCc: true,
      requiereArea: false,
      requiereEspecie: false,
      requiereElemento: false,
      noImputable: false,
      centrosCosto: [] as Array<{ centroCostoId: string }>,
      elementosCosto: [] as Array<{ elementoCostoId: string }>,
      areasNegocio: [] as Array<{ areaNegocioId: string }>,
    };

    beforeEach(() => {
      prisma.cuentaContable.findMany.mockResolvedValue([existente]);
      prisma.cuentaContable.update.mockResolvedValue({ ...existente, nombre: 'Caja banco' });
      prisma.cuentaContable.create.mockResolvedValue({ id: 'C-NEW', codigo: '1-1-00-00' });
      prisma.catalogoImportacion.create.mockResolvedValue({ id: 'IMP-1' });
      prisma.usuario.findUnique.mockResolvedValue({ nombre: 'Usuario prueba' });
    });

    it('no pisa padre/nivel de una cuenta existente si actualizarAnidacion está off', async () => {
      await service.bulkCuentas(
        tenantUser(),
        {
          items: [{
            codigo: '1-1-01-01',
            nombre: 'Caja banco',
            tipo: 'ACTIVO',
            nivel: 3,
            padreCodigo: '1-1-00-00',
            requiereCc: false,
          }],
          actualizarAnidacion: false,
          aplicarFlags: false,
          archivoNombre: 'plan.xlsx',
        },
        'EMP-1',
      );
      expect(prisma.cuentaContable.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'C1' },
          data: expect.not.objectContaining({ padreId: expect.anything(), nivel: expect.anything(), requiereCc: false }),
        }),
      );
      expect(prisma.catalogoImportacion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tipo: 'PLAN_CUENTAS',
            archivoNombre: 'plan.xlsx',
            updated: 1,
            usuarioNombre: 'Usuario prueba',
          }),
        }),
      );
    });

    it('aplica padre/nivel si actualizarAnidacion', async () => {
      prisma.cuentaContable.findMany.mockResolvedValue([
        existente,
        {
          ...existente,
          id: 'P1',
          codigo: '1-1-00-00',
          nombre: 'ACTIVO',
          nivel: 1,
          padreId: null,
        },
      ]);
      await service.bulkCuentas(
        tenantUser(),
        {
          items: [{
            codigo: '1-1-01-01',
            nombre: 'Caja',
            tipo: 'ACTIVO',
            nivel: 4,
            padreCodigo: '1-1-00-00',
          }],
          actualizarAnidacion: true,
        },
        'EMP-1',
      );
      expect(prisma.cuentaContable.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ padreId: 'P1', nivel: 4 }),
        }),
      );
    });

    it('no apaga flags si la celda viene vacía (undefined) aunque aplicarFlags', async () => {
      await service.bulkCuentas(
        tenantUser(),
        {
          items: [{ codigo: '1-1-01-01', nombre: 'Caja', tipo: 'ACTIVO', nivel: 4 }],
          aplicarFlags: true,
        },
        'EMP-1',
      );
      expect(prisma.cuentaContable.update).not.toHaveBeenCalled();
    });

    it('arrastra vínculos N:N del padre ya grabado', async () => {
      prisma.cuentaContable.findMany.mockResolvedValue([
        { ...existente, id: 'P1', codigo: '1-1-00-00', nombre: 'ACTIVO', nivel: 1, padreId: null },
        { ...existente, id: 'C1', codigo: '1-1-01-01', padreId: 'P1' },
      ]);
      prisma.cuentaCentroCosto.findMany.mockResolvedValue([
        { cuentaId: 'P1', centroCostoId: 'CC-1' },
      ]);
      prisma.cuentaElementoCosto.findMany.mockResolvedValue([]);
      prisma.cuentaAreaNegocio.findMany.mockResolvedValue([]);
      prisma.centroCosto.findMany.mockResolvedValue([{ id: 'CC-1' }]);
      prisma.elementoCosto.findMany.mockResolvedValue([]);
      prisma.areaNegocio.findMany.mockResolvedValue([]);
      prisma.cuentaCentroCosto.deleteMany.mockResolvedValue({ count: 0 });
      prisma.cuentaCentroCosto.createMany.mockResolvedValue({ count: 1 });
      prisma.cuentaElementoCosto.deleteMany.mockResolvedValue({ count: 0 });
      prisma.cuentaAreaNegocio.deleteMany.mockResolvedValue({ count: 0 });

      await service.bulkCuentas(
        tenantUser(),
        {
          items: [{ codigo: '1-1-01-01', nombre: 'Caja', tipo: 'ACTIVO', nivel: 4, padreCodigo: '1-1-00-00' }],
          vinculos: 'arrastrar_padre',
        },
        'EMP-1',
      );
      expect(prisma.cuentaCentroCosto.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({ cuentaId: 'C1', centroCostoId: 'CC-1' })],
        }),
      );
    });

    it('al reordenar, cuelga la cuenta del grupo superior si falta el padre intermedio', async () => {
      prisma.cuentaContable.findMany.mockResolvedValue([
        {
          ...existente,
          id: 'P1',
          codigo: '4-1-00-00',
          nombre: 'INGRESOS',
          nivel: 2,
          padreId: null,
        },
        {
          ...existente,
          id: 'C-VTA',
          codigo: '4-1-01-01',
          nombre: 'Ventas',
          nivel: 4,
          padreId: null,
        },
      ]);
      await service.bulkCuentas(
        tenantUser(),
        {
          items: [{
            codigo: '4-1-01-01',
            nombre: 'Ventas',
            tipo: 'INGRESO',
            nivel: 4,
            padreCodigo: '4-1-01-00',
          }],
          actualizarAnidacion: true,
        },
        'EMP-1',
      );
      expect(prisma.cuentaContable.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'C-VTA' },
          data: expect.objectContaining({ padreId: 'P1' }),
        }),
      );
    });
  });

  it('rechaza mapeo SII a cuenta inactiva', async () => {
    prisma.cuentaContable.findMany.mockResolvedValue([
      { id: 'C1', codigo: '1-1-01-01', activa: false, noImputable: false },
    ]);
    await expect(
      service.putConfigContableSii(
        tenantUser(),
        { items: [{ tipoDocumentoSii: '33', nombre: 'Factura', cuentaContableId: 'C1' }] },
        'EMP-1',
      ),
    ).rejects.toThrow(/deshabilitada|imputable/);
  });

  it('no crea periodo si la empresa del header no existe', async () => {
    prisma.empresa.findUnique.mockResolvedValue(null);
    await expect(
      service.createPeriodoContable(
        superAdminUser({ empresaId: 'EMP-EXPORT' }),
        { codigo: '2026-07', activo: true },
        'EMP-1',
      ),
    ).rejects.toThrow(/no existe/);
    expect(prisma.periodoContable.create).not.toHaveBeenCalled();
  });
});
