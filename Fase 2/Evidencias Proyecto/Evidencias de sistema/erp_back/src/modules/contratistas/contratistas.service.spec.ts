import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ContratistasService } from './contratistas.service';
import {
  createPrismaMock,
  tenantUser,
} from '../../test-utils/prisma-mock';

describe('ContratistasService', () => {
  let service: ContratistasService;
  let prisma: ReturnType<typeof createPrismaMock>['prisma'];

  beforeEach(() => {
    const harness = createPrismaMock();
    prisma = harness.prisma;
    service = new ContratistasService(harness.mock);
  });

  describe('createContratista', () => {
    it('crea contratista en empresa del tenant (happy path)', async () => {
      prisma.contratista.count.mockResolvedValue(2);
      prisma.contratista.create.mockResolvedValue({
        id: 'CTR-EMP-1-3',
        rut: '76.000.111-2',
        razonSocial: 'Nuevo CTR',
        especialidad: 'Cosecha',
        activo: true,
        empresaId: 'EMP-1',
      });

      const result = await service.createContratista(
        tenantUser(),
        {
          rut: '76.000.111-2',
          razonSocial: 'Nuevo CTR',
          especialidad: 'Cosecha',
        },
        'EMP-1',
      );

      expect(result.id).toBe('CTR-EMP-1-3');
      expect(prisma.contratista.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ empresaId: 'EMP-1', rut: '76.000.111-2' }),
        }),
      );
    });

    it('lanza ConflictException ante RUT duplicado en empresa', async () => {
      prisma.contratista.count.mockResolvedValue(1);
      prisma.contratista.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.createContratista(
          tenantUser(),
          { rut: '76.111.222-3', razonSocial: 'Dup', especialidad: 'X' },
          'EMP-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updateContratista', () => {
    it('bloquea update cross-tenant', async () => {
      prisma.contratista.findUnique.mockResolvedValue({
        id: 'CTR-EMP-2-1',
        empresaId: 'EMP-2',
        activo: true,
        vigenciaHasta: null,
      });

      await expect(
        service.updateContratista(tenantUser({ empresaId: 'EMP-1' }), 'CTR-EMP-2-1', {
          rut: '1-9',
          razonSocial: 'Hack',
          especialidad: 'X',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.contratista.update).not.toHaveBeenCalled();
    });
  });

  describe('createProforma', () => {
    it('crea proforma BORRADOR (happy path)', async () => {
      prisma.contratista.findUnique.mockResolvedValue({
        id: 'CTR-EMP-1-1',
        empresaId: 'EMP-1',
        activo: true,
      });
      prisma.tipoContratoContratista.findFirst.mockResolvedValue({
        id: 'TC-1',
        empresaId: 'EMP-1',
        activa: true,
      });
      prisma.ingresoLaborDiario.findMany.mockResolvedValue([
        {
          id: 'ILD-1',
          empresaId: 'EMP-1',
          contratistaId: 'CTR-EMP-1-1',
          tipoContratoId: 'TC-1',
          fecha: new Date(2026, 6, 10, 12),
          monto: 1000,
          estado: 'PENDIENTE',
        },
      ]);
      prisma.ingresoLaborDiario.updateMany.mockResolvedValue({ count: 1 });
      prisma.proformaContratista.create.mockResolvedValue({
        id: 'prf-1',
        numero: 'PRF-99',
        contratistaId: 'CTR-EMP-1-1',
        empresaId: 'EMP-1',
        tipoContratoId: 'TC-1',
        periodo: '2026-07',
        montoNeto: 1000,
        moneda: 'CLP',
        estado: 'BORRADOR',
        facturaNumeroRef: null,
        contratista: { razonSocial: 'Servicios' },
        factura: null,
        registroCompra: null,
        tipoContrato: { nombre: 'Mano de obra', codigo: 'MANO_OBRA' },
      });

      const result = await service.createProforma(tenantUser(), {
        numero: 'PRF-99',
        contratistaId: 'CTR-EMP-1-1',
        tipoContratoId: 'TC-1',
        periodo: '2026-07',
        montoNeto: 1000,
        ingresoIds: ['ILD-1'],
      });

      expect(result.estado).toBe('BORRADOR');
      expect(result.numero).toBe('PRF-99');
    });
  });

  describe('ingresos labor diario', () => {
    it('asocia ingresos a proforma', async () => {
      prisma.proformaContratista.findUnique.mockResolvedValue({
        id: 'PRF-1',
        empresaId: 'EMP-1',
        contratistaId: 'CTR-1',
        tipoContratoId: 'TC-1',
        periodo: '2026-07',
        montoNeto: 150,
        estado: 'BORRADOR',
        factura: null,
        facturaNumeroRef: null,
      });
      prisma.ingresoLaborDiario.findMany.mockResolvedValue([
        {
          id: 'ILD-1',
          monto: 100,
          estado: 'PENDIENTE',
          contratistaId: 'CTR-1',
          tipoContratoId: 'TC-1',
          fecha: new Date(2026, 6, 10, 12),
        },
        {
          id: 'ILD-2',
          monto: 50,
          estado: 'PENDIENTE',
          contratistaId: 'CTR-1',
          tipoContratoId: 'TC-1',
          fecha: new Date(2026, 6, 11, 12),
        },
      ]);
      prisma.ingresoLaborDiario.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.asociarIngresosAProforma(tenantUser(), {
        ingresoIds: ['ILD-1', 'ILD-2'],
        proformaId: 'PRF-1',
      });

      expect(result.asociados).toBe(2);
      expect(result.monto).toBe(150);
    });

    it('rechaza asociar si faltan ingresos', async () => {
      prisma.proformaContratista.findUnique.mockResolvedValue({
        id: 'PRF-1',
        empresaId: 'EMP-1',
        contratistaId: 'CTR-1',
        tipoContratoId: 'TC-1',
        periodo: '2026-07',
        montoNeto: 150,
        estado: 'BORRADOR',
        factura: null,
        facturaNumeroRef: null,
      });
      prisma.ingresoLaborDiario.findMany.mockResolvedValue([{ id: 'ILD-1', monto: 100 }]);

      await expect(
        service.asociarIngresosAProforma(tenantUser(), {
          ingresoIds: ['ILD-1', 'ILD-2'],
          proformaId: 'PRF-1',
        }),
      ).rejects.toThrow(/ingresos/);
    });
  });

  describe('EX-20 asociarFacturaProforma N>1', () => {
    it('genera una sola OC en Compras y enlaza varias proformas', async () => {
      const createOrden = jest.fn().mockResolvedValue({
        id: 'OC-1',
        numero: 'OC-2026-0001',
        estado: 'PENDIENTE_APROBACION',
      });
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ContratistasService(
        harness.mock,
        undefined,
        undefined,
        undefined,
        { createOrden } as never,
      );
      const primary = {
        id: 'PRF-1',
        numero: 'P-1',
        empresaId: 'EMP-1',
        contratistaId: 'CTR-1',
        periodo: '2026-07',
        moneda: 'CLP',
        tipoContratoId: 'TC-1',
        estado: 'DEFINITIVA',
        montoNeto: 100,
        factura: null,
        registroCompraId: null,
        registroCompra: null,
        facturaNumeroRef: null,
      };
      const secundaria = {
        id: 'PRF-2',
        numero: 'P-2',
        empresaId: 'EMP-1',
        contratistaId: 'CTR-1',
        periodo: '2026-07',
        moneda: 'CLP',
        tipoContratoId: 'TC-1',
        estado: 'DEFINITIVA',
        montoNeto: 50,
        factura: null,
        registroCompraId: null,
        registroCompra: null,
        facturaNumeroRef: null,
      };
      prisma.proformaContratista.findUnique.mockResolvedValue(primary);
      prisma.proformaContratista.findMany.mockResolvedValue([primary, secundaria]);
      prisma.contratista.findUnique.mockResolvedValue({
        id: 'CTR-1',
        empresaId: 'EMP-1',
        proveedor: {
          id: 'PROV-1',
          razonSocial: 'CTR Demo',
          activo: true,
        },
      });
      prisma.tipoContratoContratista.findFirst.mockResolvedValue({
        id: 'TC-1',
        empresaId: 'EMP-1',
        activa: true,
        nombre: 'Mano de obra',
        cuentaDebeId: 'CTA-GASTO',
        cuentaHaberId: 'CTA-FPR',
        cuentaAdministracionId: 'CTA-ADM',
        cuentaDebe: { activa: true, noImputable: false },
        cuentaHaber: { activa: true, noImputable: false },
        cuentaAdministracion: { activa: true, noImputable: false },
      });
      prisma.usuario.findUnique.mockResolvedValue({ nombre: 'Operador QA' });
      prisma.ingresoLaborDiario.updateMany.mockResolvedValue({ count: 2 });
      prisma.proformaContratista.updateMany.mockResolvedValue({ count: 2 });
      prisma.proformaContratista.findUniqueOrThrow.mockResolvedValue({
        ...primary,
        estado: 'FACTURADA',
        ordenCompraId: 'OC-1',
        contratista: { razonSocial: 'CTR Demo' },
        factura: null,
        registroCompra: null,
        ordenCompra: {
          id: 'OC-1',
          numero: 'OC-2026-0001',
          estado: 'PENDIENTE_APROBACION',
          proformasContratista: [{ id: 'PRF-1' }, { id: 'PRF-2' }],
        },
        tipoContrato: { nombre: 'Mano de obra', codigo: 'MANO_OBRA' },
      });

      const result = await service.asociarFacturaProforma(tenantUser(), 'PRF-1', {
        numero: 'F-GRP-1',
        fecha: '2026-07-15',
        proformaIds: ['PRF-2'],
      });

      expect(createOrden).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          proveedorId: 'PROV-1',
          neto: 150,
          referenciaTipo: 'PROFORMA_CONTRATISTA',
          referenciaFolio: 'F-GRP-1',
          lineas: expect.arrayContaining([
            expect.objectContaining({ proformaId: 'PRF-1' }),
            expect.objectContaining({ proformaId: 'PRF-2' }),
          ]),
        }),
        'EMP-1',
      );
      expect(prisma.proformaContratista.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['PRF-1', 'PRF-2'] }, empresaId: 'EMP-1' },
        data: {
          estado: 'FACTURADA',
          facturaNumeroRef: null,
          ordenCompraId: 'OC-1',
        },
      });
      expect(result.estado).toBe('FACTURADA');
      expect(result.facturaAsociada).toBe('OC-2026-0001');
      expect(result.ordenCompraId).toBe('OC-1');
    });
  });

  describe('EX-04/EX-05 traspasoCierre', () => {
    it('pasa periodo YYYY-MM a createAsiento', async () => {
      const createAsiento = jest.fn().mockResolvedValue({ id: 'ASI-1', numero: 'A-100' });
      const harness = createPrismaMock();
      prisma = harness.prisma;
      service = new ContratistasService(harness.mock, { createAsiento } as never);

      prisma.periodoCierreContratista.findUnique.mockResolvedValue(null);
      prisma.proformaContratista.findMany.mockResolvedValue([
        {
          id: 'PRF-1',
          numero: 'PRF-1',
          periodo: '2026-07',
          montoNeto: 200,
          moneda: 'CLP',
          tipoContratoId: 'TC-1',
          tipoContrato: { nombre: 'Mano de obra' },
          estado: 'DEFINITIVA',
          contratista: { razonSocial: 'Ctr Demo' },
        },
      ]);
      prisma.ingresoLaborDiario.findMany.mockResolvedValue([
        {
          id: 'ILD-1',
          proformaId: 'PRF-1',
          tipoContratoId: 'TC-1',
          centroCostoId: 'CC-1',
          monto: 200,
        },
      ]);
      prisma.tipoContratoContratista.findFirst.mockResolvedValue({
        id: 'TC-1',
        empresaId: 'EMP-1',
        activa: true,
        nombre: 'Mano de obra',
        cuentaDebeId: 'CTA-GASTO',
        cuentaHaberId: 'CTA-PROV',
        cuentaAdministracionId: 'CTA-ADM',
        cuentaDebe: { activa: true, noImputable: false },
        cuentaHaber: { activa: true, noImputable: false },
        cuentaAdministracion: { activa: true, noImputable: false },
      });
      prisma.usuario.findUnique.mockResolvedValue({ nombre: 'Admin' });
      prisma.periodoCierreContratista.upsert.mockResolvedValue({
        id: 'CIE-1',
        periodo: '2026-07',
        cerrado: true,
        montoTotal: 200,
        tipoCambio: null,
        monedaTc: 'USD',
        tiposCambio: { CLP: 1 },
        asientoId: 'ASI-1',
        asientoNumero: 'A-100',
        proformaIds: ['PRF-1'],
        glosa: 'Traspaso/cierre contratistas 2026-07',
      });

      const result = await service.traspasoCierre(
        tenantUser(),
        { periodo: '2026-07' },
        'EMP-1',
      );

      expect(createAsiento).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId: 'EMP-1',
          origen: 'TRASPASO-CTR:2026-07',
          periodo: '2026-07',
          lineas: [
            expect.objectContaining({ debe: 200, haber: 0, cuentaId: 'CTA-GASTO' }),
            expect.objectContaining({ debe: 0, haber: 200, cuentaId: 'CTA-PROV' }),
          ],
        }),
        expect.anything(),
      );
      expect(prisma.periodoCierreContratista.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ proformaIds: ['PRF-1'] }),
        }),
      );
      expect(result.asientoNumero).toBe('A-100');
      expect(result.proformas).toBe(1);
      expect(result.detalle).toHaveLength(1);
    });

    it('rechaza re-traspaso de periodo ya cerrado', async () => {
      prisma.periodoCierreContratista.findUnique.mockResolvedValue({
        cerrado: true,
        asientoNumero: 'A-99',
      });

      await expect(
        service.traspasoCierre(tenantUser(), { periodo: '2026-07' }, 'EMP-1'),
      ).rejects.toThrow(/está cerrado/);
    });
  });

  describe('proforma definitiva con aprobación supervisor', () => {
    it('BORRADOR → PENDIENTE_APROBACION al solicitar aprobación', async () => {
      prisma.proformaContratista.findUnique.mockResolvedValue({
        id: 'PRF-2',
        numero: 'PRF-2',
        empresaId: 'EMP-1',
        periodo: '2026-07',
        estado: 'BORRADOR',
        montoNeto: new Prisma.Decimal(100_000),
        aprobadorId: null,
      });
      prisma.usuario.findFirst.mockResolvedValue({
        id: 'U-SUP',
        nombre: 'Supervisor',
      });
      prisma.ingresoLaborDiario.findMany.mockResolvedValue([
        { monto: new Prisma.Decimal(100_000) },
      ]);
      prisma.proformaContratista.update.mockResolvedValue({
        id: 'PRF-2',
        numero: 'PRF-2',
        contratistaId: 'CTR-1',
        empresaId: 'EMP-1',
        periodo: '2026-07',
        montoNeto: new Prisma.Decimal(100_000),
        moneda: 'CLP',
        estado: 'PENDIENTE_APROBACION',
        facturaNumeroRef: null,
        aprobadorId: 'U-SUP',
        aprobadorNombre: 'Supervisor',
        aprobadoPorId: null,
        aprobadoPorNombre: null,
        aprobadaAt: null,
        contratista: { razonSocial: 'CTR' },
        factura: null,
        registroCompra: null,
        tipoContrato: null,
      });

      const result = await service.marcarProformaDefinitiva(
        tenantUser({ sub: 'U-ANALISTA', permisos: ['contratistas:write'] }),
        'PRF-2',
        { aprobadorId: 'U-SUP' },
      );
      expect(result.estado).toBe('PENDIENTE_APROBACION');
      expect(prisma.proformaContratista.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'PRF-2' },
          data: expect.objectContaining({
            estado: 'PENDIENTE_APROBACION',
            aprobadorId: 'U-SUP',
            aprobacionCadenaIds: ['U-SUP'],
          }),
        }),
      );
    });

    it('PENDIENTE_APROBACION → DEFINITIVA al aprobar', async () => {
      prisma.proformaContratista.findUnique.mockResolvedValue({
        id: 'PRF-2',
        numero: 'PRF-2',
        empresaId: 'EMP-1',
        periodo: '2026-07',
        estado: 'PENDIENTE_APROBACION',
        aprobadorId: 'U-SUP',
      });
      prisma.usuario.findUnique.mockResolvedValue({ nombre: 'Supervisor' });
      prisma.proformaContratista.update.mockResolvedValue({
        id: 'PRF-2',
        numero: 'PRF-2',
        contratistaId: 'CTR-1',
        empresaId: 'EMP-1',
        periodo: '2026-07',
        montoNeto: new Prisma.Decimal(100_000),
        moneda: 'CLP',
        estado: 'DEFINITIVA',
        facturaNumeroRef: null,
        aprobadorId: 'U-SUP',
        aprobadorNombre: 'Supervisor',
        aprobadoPorId: 'U-SUP',
        aprobadoPorNombre: 'Supervisor',
        aprobadaAt: new Date('2026-07-31T12:00:00Z'),
        contratista: { razonSocial: 'CTR' },
        factura: null,
        registroCompra: null,
        tipoContrato: null,
      });

      const result = await service.aprobarProformaDefinitiva(
        tenantUser({ sub: 'U-SUP', permisos: ['contratistas:finalize'] }),
        'PRF-2',
      );
      expect(result.estado).toBe('DEFINITIVA');
    });
  });

  describe('R4-04 reversarProforma', () => {
    it('reversa DEFINITIVA a BORRADOR con clave de reversa válida', async () => {
      const hash = await bcrypt.hash('4821', 10);
      prisma.proformaContratista.findUnique.mockResolvedValue({
        id: 'PRF-1',
        numero: 'PRF-1',
        empresaId: 'EMP-1',
        periodo: '2026-07',
        estado: 'DEFINITIVA',
      });
      prisma.usuario.findUnique.mockResolvedValue({
        activo: true,
        claveReversaHash: hash,
      });
      prisma.proformaContratista.update.mockResolvedValue({
        id: 'PRF-1',
        numero: 'PRF-1',
        contratistaId: 'CTR-1',
        empresaId: 'EMP-1',
        periodo: '2026-07',
        montoNeto: 1000,
        moneda: 'CLP',
        estado: 'BORRADOR',
        facturaNumeroRef: null,
        contratista: { razonSocial: 'CTR' },
        factura: null,
        registroCompra: null,
        tipoContrato: null,
      });

      const result = await service.reversarProforma(
        tenantUser({ permisos: ['contratistas:reverse'] }),
        'PRF-1',
        { claveReversa: '4821' },
      );
      expect(result.estado).toBe('BORRADOR');
      expect(prisma.proformaContratista.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ estado: 'BORRADOR' }),
        }),
      );
    });

    it('rechaza clave de reversa incorrecta', async () => {
      const hash = await bcrypt.hash('4821', 10);
      prisma.proformaContratista.findUnique.mockResolvedValue({
        id: 'PRF-1',
        empresaId: 'EMP-1',
        periodo: '2026-07',
        estado: 'DEFINITIVA',
      });
      prisma.usuario.findUnique.mockResolvedValue({
        activo: true,
        claveReversaHash: hash,
      });

      await expect(
        service.reversarProforma(
          tenantUser({ permisos: ['contratistas:reverse'] }),
          'PRF-1',
          { claveReversa: '0000' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza reversa si no está DEFINITIVA', async () => {
      prisma.proformaContratista.findUnique.mockResolvedValue({
        id: 'PRF-1',
        empresaId: 'EMP-1',
        periodo: '2026-07',
        estado: 'BORRADOR',
      });
      await expect(
        service.reversarProforma(
          tenantUser({ permisos: ['contratistas:reverse'] }),
          'PRF-1',
          { claveReversa: '4821' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('reglas Nivel 1', () => {
    const ingresoDto = {
      fecha: '2026-07-10',
      contratistaId: 'CTR-1',
      centroCostoId: 'CC-1',
      laborId: 'LAB-1',
      actividadId: 'ACT-1',
      tipoJornada: 'TRATO',
      cantidad: 2,
    };

    function mockIngresoRefs() {
      prisma.periodoCierreContratista.findUnique.mockResolvedValue(null);
    prisma.periodoContable.findUnique.mockResolvedValue({ estado: 'ABIERTO' });
      prisma.contratista.findUnique.mockResolvedValue({
        id: 'CTR-1',
        empresaId: 'EMP-1',
        activo: true,
      });
      prisma.centroCosto.findUnique.mockResolvedValue({
        id: 'CC-1',
        empresaId: 'EMP-1',
        activa: true,
      });
      prisma.labor.findUnique.mockResolvedValue({
        id: 'LAB-1',
        empresaId: 'EMP-1',
        activa: true,
      });
      prisma.actividad.findUnique.mockResolvedValue({
        id: 'ACT-1',
        empresaId: 'EMP-1',
        activa: true,
      });
      prisma.laborActividad.findUnique.mockResolvedValue({
        laborId: 'LAB-1',
        actividadId: 'ACT-1',
      });
      prisma.tarifaContratista.findMany.mockResolvedValue([
        {
          id: 'TAR-1',
          empresaId: 'EMP-1',
          tipoContratoId: 'TC-1',
          tarifa: new Prisma.Decimal(2500),
          unidad: 'JOR',
        },
      ]);
    }

    it('guarda snapshot de la tarifa vigente al capturar un ingreso', async () => {
      mockIngresoRefs();
      prisma.ingresoLaborDiario.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'ILD-1',
          ...data,
          estado: 'PENDIENTE',
          proformaId: null,
          facturaNumero: null,
          contratista: { razonSocial: 'CTR' },
          centroCosto: { nombre: 'Campo' },
          labor: { nombre: 'Cosecha' },
          actividad: { nombre: 'Cereza' },
          proforma: null,
        }),
      );

      const result = await service.createIngresoLaborDiario(
        tenantUser({ permisos: ['contratistas:capture', 'contratistas:finalize'] }),
        ingresoDto,
        'EMP-1',
      );

      expect(result.precioUnitario).toBe(2500);
      expect(result.tarifaId).toBe('TAR-1');
      expect(result.precioOverride).toBe(false);
      expect(prisma.ingresoLaborDiario.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tarifaId: 'TAR-1',
            tarifaAplicada: 2500,
            tipoContratoId: 'TC-1',
            precioUnitario: 2500,
            monto: 5000,
          }),
        }),
      );
    });

    it('rechaza override de tarifa sin permiso y motivo', async () => {
      mockIngresoRefs();
      await expect(
        service.createIngresoLaborDiario(
          tenantUser({ permisos: ['contratistas:capture'] }),
          { ...ingresoDto, precioUnitario: 3000 },
          'EMP-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.ingresoLaborDiario.create).not.toHaveBeenCalled();
    });

    it('bloquea captura cuando el período de Contratistas está cerrado', async () => {
      prisma.periodoCierreContratista.findUnique.mockResolvedValue({
        cerrado: true,
      });
      await expect(
        service.createIngresoLaborDiario(
          tenantUser({ permisos: ['contratistas:capture'] }),
          ingresoDto,
          'EMP-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.ingresoLaborDiario.create).not.toHaveBeenCalled();
    });

    it('rechaza vigencias de tarifa solapadas', async () => {
      prisma.contratista.findUnique.mockResolvedValue({
        id: 'CTR-1',
        empresaId: 'EMP-1',
        activo: true,
      });
      prisma.centroCosto.findUnique.mockResolvedValue({
        id: 'CC-1',
        empresaId: 'EMP-1',
        activa: true,
      });
      prisma.labor.findUnique.mockResolvedValue({
        id: 'LAB-1',
        empresaId: 'EMP-1',
        activa: true,
      });
      prisma.actividad.findUnique.mockResolvedValue({
        id: 'ACT-1',
        empresaId: 'EMP-1',
        activa: true,
      });
      prisma.laborActividad.findUnique.mockResolvedValue({
        laborId: 'LAB-1',
        actividadId: 'ACT-1',
      });
      prisma.unidadMedida.findUnique.mockResolvedValue({
        codigo: 'JOR',
        activa: true,
      });
      prisma.tipoContratoContratista.findFirst.mockResolvedValue({
        id: 'TC-1',
        empresaId: 'EMP-1',
        activa: true,
      });
      prisma.tarifaContratista.findFirst.mockResolvedValue({ id: 'TAR-OLD' });

      await expect(
        service.createTarifa(tenantUser(), {
          contratistaId: 'CTR-1',
          laborId: 'LAB-1',
          actividadId: 'ACT-1',
          tipoContratoId: 'TC-1',
          tarifa: 2500,
          unidad: 'JOR',
          centroCostoId: 'CC-1',
          vigenciaDesde: '2026-07-01',
          vigenciaHasta: '2026-07-31',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.tarifaContratista.create).not.toHaveBeenCalled();
    });
  });
});
