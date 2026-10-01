import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { EmissionsService } from './emissions.service';
import { SqliteEmissionsStore } from './emissions.store';
import { RegistryService } from '../registry/registry.service';
import { StubAdapter } from '../adapters/stub/stub.adapter';
import { GoSocketAdapter } from '../adapters/gosocket/gosocket.adapter';
import type { CanonicalDocumentV1 } from '../common/types';
import { STUB_DISCLAIMER } from '../common/types';

function sampleDoc(overrides: Partial<CanonicalDocumentV1> = {}): CanonicalDocumentV1 {
  return {
    schemaVersion: '1.0',
    idempotencyKey: 'almahue:EMP-1:doc-test:1',
    source: { erpId: 'almahue', empresaId: 'EMP-1', documentoId: 'doc-test' },
    emisor: {
      rut: '76.000.000-0',
      razonSocial: 'Emisor de prueba SpA',
      direccion: 'Calle Falsa 123',
      nroResolucion: '80',
      fechaResolucion: '2024-01-01',
      acteco: '461001',
    },
    receptor: {
      rut: '55.555.555-5',
      razonSocial: 'Receptor de prueba',
      direccion: 'Av. Prueba 100',
      comuna: 'Santiago',
      ciudad: 'Santiago',
    },
    documento: {
      tipoDte: 110,
      fechaEmision: '2026-08-06',
      moneda: 'USD',
      numeroInterno: '1332999279944',
    },
    totales: { neto: 100, iva: 0, total: 100 },
    lineas: [{ nro: 1, descripcion: 'CEREZA', cantidad: 1, precio: 100, montoNeto: 100 }],
    indicadores: { exportacion: true, exento: true },
    ...overrides,
  };
}

describe('EmissionsService partner stub', () => {
  let service: EmissionsService;
  let store: SqliteEmissionsStore;
  let registry: RegistryService;
  const originalEnv = { ...process.env };

  function makeService(
    stub: StubAdapter = new StubAdapter(),
    gosocket: GoSocketAdapter = new GoSocketAdapter(),
    emissionsStore: SqliteEmissionsStore = SqliteEmissionsStore.open(':memory:'),
  ): EmissionsService {
    store?.close();
    store = emissionsStore;
    return new EmissionsService(registry, stub, gosocket, store);
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GOSOCKET_API_USER;
    delete process.env.GOSOCKET_API_PASSWORD;

    registry = new RegistryService();
    registry.loadForTests([
      {
        erpId: 'almahue',
        empresaId: 'EMP-1',
        rutEmisor: '*',
        partner: 'stub',
        connectionMode: 'stub',
        activo: true,
      },
      {
        erpId: 'almahue',
        empresaId: 'EMP-2',
        rutEmisor: '*',
        partner: 'stub',
        connectionMode: 'stub',
        activo: true,
      },
      {
        erpId: 'otro-erp',
        empresaId: 'X-1',
        rutEmisor: '*',
        partner: 'gosocket',
        connectionMode: 'sandbox',
        activo: true,
        billerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      },
    ]);
    service = makeService();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    store?.close();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('contrato HTTP stub queda SIMULATED y marcado con las tres señales seguras', async () => {
    const res = await service.emit(sampleDoc());
    expect(res).toMatchObject({
      status: 'SIMULATED',
      stub: true,
      partner: 'stub',
      connectionMode: 'stub',
    });
    expect(res.status).not.toBe('ACCEPTED');
    expect(res.folioOficial).toMatch(/^STUB-/);
    expect(res.artifacts.pdfAvailable).toBe(true);
    expect(res.artifacts.xmlAvailable).toBe(true);
    expect(res.artifacts.dummy).toBe(true);
    expect(res.disclaimer).toBe(STUB_DISCLAIMER);

    const pdf = await service.getArtifact(res.emissionId, 'pdf', 'almahue');
    expect(pdf.body.length).toBeGreaterThan(100);
    expect(pdf.dummy).toBe(true);
    const xml = await service.getArtifact(res.emissionId, 'xml', 'almahue');
    expect(xml.body.toString('utf8')).toContain('StubDte');
    expect(xml.body.toString('utf8')).toContain('timbreSii="false"');
    expect(xml.dummy).toBe(true);
  });

  it('GET lista emisiones del erp de la API key, más reciente primero', async () => {
    const older = await service.emit(sampleDoc({
      idempotencyKey: 'almahue:EMP-1:doc-old:1',
      source: { erpId: 'almahue', empresaId: 'EMP-1', documentoId: 'doc-old' },
    }));
    const newer = await service.emit(sampleDoc({
      idempotencyKey: 'almahue:EMP-2:doc-new:1',
      source: { erpId: 'almahue', empresaId: 'EMP-2', documentoId: 'doc-new' },
    }));

    const all = service.list('almahue');
    expect(all[0].emissionId).toBe(newer.emissionId);
    expect(all[0].tracePath).toBe(`/v1/emissions/${newer.emissionId}/trace`);
    expect(all.map((row) => row.emissionId)).toEqual(
      expect.arrayContaining([older.emissionId, newer.emissionId]),
    );

    const onlyEmp2 = service.list('almahue', 'EMP-2');
    expect(onlyEmp2).toHaveLength(1);
    expect(onlyEmp2[0].documentoId).toBe('doc-new');
    expect(service.list('otro-erp')).toEqual([]);
  });

  it('GET trace expone el canónico inbound y no el XML GUF en stub', async () => {
    const res = await service.emit(sampleDoc());
    expect(res.partnerRequest).toBeUndefined();
    const trace = service.getTrace(res.emissionId, 'almahue');
    expect(trace.inbound.source.documentoId).toBe('doc-test');
    expect(trace.inbound.emisor.rut).toBe('76.000.000-0');
    expect(trace.outbound).toBeNull();
    expect(trace.response.body).toBeNull();
  });

  it('acepta exportación EX validada y la entrega al adapter configurado', async () => {
    const stub = new StubAdapter();
    const adapterSpy = jest.spyOn(stub, 'emit');
    service = makeService(stub);
    const doc = sampleDoc({
      idempotencyKey: 'almahue:EMP-1:export-ex:1',
      receptor: { rut: 'EX-US-CLIENT-123', razonSocial: 'Foreign Client' },
    });

    const result = await service.emit(doc, 'almahue');

    expect(adapterSpy).toHaveBeenCalledTimes(1);
    expect(adapterSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        receptor: expect.objectContaining({ rut: 'EX-US-CLIENT-123' }),
        indicadores: expect.objectContaining({ exportacion: true }),
      }),
      expect.objectContaining({ partner: 'stub' }),
    );
    expect(result.status).toBe('SIMULATED');
  });

  it('idempotencyKey repite la misma emissionId', async () => {
    const a = await service.emit(sampleDoc());
    const b = await service.emit(sampleDoc());
    expect(a.emissionId).toBe(b.emissionId);
  });

  it('aísla la misma idempotencyKey entre empresas', async () => {
    const stub = new StubAdapter();
    const adapterSpy = jest.spyOn(stub, 'emit');
    service = makeService(stub);
    const first = await service.emit(sampleDoc());
    const second = await service.emit(
      sampleDoc({
        source: { erpId: 'almahue', empresaId: 'EMP-2', documentoId: 'doc-test' },
      }),
    );

    expect(adapterSpy).toHaveBeenCalledTimes(2);
    expect(first.emissionId).not.toBe(second.emissionId);
  });

  it('rechaza la misma key compuesta con payload distinto', async () => {
    const stub = new StubAdapter();
    const adapterSpy = jest.spyOn(stub, 'emit');
    service = makeService(stub);
    await service.emit(sampleDoc());
    const changed = sampleDoc({
      receptor: { rut: '55.555.555-5', razonSocial: 'Otro receptor' },
    });

    await expect(service.emit(changed)).rejects.toThrow(/canónico diferente/);
    expect(adapterSpy).toHaveBeenCalledTimes(1);
  });

  it('valida registry antes de devolver una entrada cacheada', async () => {
    await service.emit(sampleDoc());
    registry.loadForTests([]);

    await expect(service.emit(sampleDoc())).rejects.toThrow(/No existe configuración/);
  });

  it('rechaza cuentaContableId en canónico', async () => {
    const bad = sampleDoc() as CanonicalDocumentV1 & { cuentaContableId?: string };
    (bad as { cuentaContableId?: string }).cuentaContableId = 'CTA-1';
    await expect(service.emit(bad)).rejects.toThrow(BadRequestException);
  });

  it('rechaza erpId distinto al ligado a la API key', async () => {
    await expect(service.emit(sampleDoc(), 'otro-erp')).rejects.toThrow(/no autoriza este erpId/);
  });

  it('GET/trace/artifact sin erpId ligado o de otro ERP quedan Forbidden', async () => {
    const res = await service.emit(sampleDoc());
    expect(() => service.get(res.emissionId)).toThrow(ForbiddenException);
    expect(() => service.getTrace(res.emissionId)).toThrow(ForbiddenException);
    await expect(service.getArtifact(res.emissionId, 'pdf')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(() => service.get(res.emissionId, 'otro-erp')).toThrow(/no autoriza este erpId/);
    await expect(service.getArtifact(res.emissionId, 'pdf', 'otro-erp')).rejects.toThrow(
      /no autoriza este erpId/,
    );
    const own = await service.getArtifact(res.emissionId, 'pdf', 'almahue');
    expect(own.dummy).toBe(true);
  });

  it('tenant desconocido falla y no cae silenciosamente a stub', async () => {
    await expect(
      service.emit(
        sampleDoc({
          source: { erpId: 'almahue', empresaId: 'EMP-X', documentoId: 'desconocido' },
          idempotencyKey: 'almahue:EMP-X:desconocido',
        }),
      ),
    ).rejects.toThrow(/No existe configuración/);
  });

  it('partner gosocket sandbox sin ApiKeys falla (hay que usar stub o credenciales)', async () => {
    await expect(
      service.emit(
        sampleDoc({
          idempotencyKey: 'otro:1',
          source: { erpId: 'otro-erp', empresaId: 'X-1', documentoId: 'd2' },
        }),
      ),
    ).rejects.toThrow(/GOSOCKET_API_USER/);
  });

  it('partner gosocket sandbox con credenciales mapea Success sin llamar API real', async () => {
    process.env.GOSOCKET_API_USER = '11111111-1111-1111-1111-111111111111';
    process.env.GOSOCKET_API_PASSWORD = 'placeholder-password-for-test';

    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          Success: true,
          GlobalDocumentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          CountryDocumentId: 'CL-33-1234',
          OtherData: { Folio: 1234 },
          Messages: null,
          ResponseValue: 'OK',
          Code: '200',
          Description: 'Process Pending',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const res = await service.emit(
      sampleDoc({
        idempotencyKey: 'otro:success',
        source: { erpId: 'otro-erp', empresaId: 'X-1', documentoId: 'd3' },
        emisor: {
          rut: '76.000.000-0',
          razonSocial: 'Emisor de prueba SpA',
          direccion: 'Calle Falsa 123',
          nroResolucion: '80',
          fechaResolucion: '2024-01-01',
          acteco: '461001',
        },
        documento: {
          tipoDte: 33,
          fechaEmision: '2026-08-19',
          numeroInterno: 'FAC-1234',
        },
      }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.partner).toBe('gosocket');
    expect(res.stub).toBe(false);
    expect(res.status).toBe('PENDING');
    expect(res.folioOficial).toBe('1234');
    expect(res.globalDocumentId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(res.artifacts.pdfAvailable).toBe(false);
    expect(res.artifacts.xmlAvailable).toBe(false);
    expect(res.partnerRequest).toBeUndefined();
    const trace = service.getTrace(res.emissionId, 'otro-erp');
    expect(trace.inbound.source.documentoId).toBe('d3');
    expect(trace.outbound?.url).toContain('SendDocumentToAuthority');
    expect(trace.outbound?.body.FileContent).toContain('FAC-1234');
    expect(trace.outbound?.body.BillerId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(trace.outbound?.body.ValidateNumber).toBe(false);
    expect(trace.outbound?.body.DefaultCertificate).toBe(false);
    expect(trace.response.httpStatus).toBe(200);
    expect(trace.response.body?.Success).toBe(true);
  });

  it('pide PDF/XML a GoSocket, persiste, dummy=false y no reconsulta si ya está', async () => {
    process.env.GOSOCKET_API_USER = 'u';
    process.env.GOSOCKET_API_PASSWORD = 'p';
    const gs = new GoSocketAdapter();
    const gid = 'ae352c22-6c9e-c6b1-6614-4bec8369dba7';
    const pdf = Buffer.from('%PDF-1.4 testdoc');
    const xml = Buffer.from('<?xml version="1.0"?><DTE/>');
    jest.spyOn(gs, 'emit').mockResolvedValue({
      result: {
        emissionId: 'emi_artifact_1',
        partner: 'gosocket',
        connectionMode: 'sandbox',
        status: 'PENDING',
        folioOficial: '53',
        folioSimulado: null,
        globalDocumentId: gid,
        countryDocumentId: null,
        messages: [],
        disclaimer: null,
        artifacts: { pdfAvailable: false, xmlAvailable: false, dummy: false },
        stub: false,
      },
    });
    const fetchSpy = jest.spyOn(gs, 'fetchArtifact').mockImplementation(async (kind) => ({
      body: kind === 'pdf' ? pdf : xml,
      contentType: kind === 'pdf' ? 'application/pdf' : 'application/xml; charset=utf-8',
      filename: kind === 'pdf' ? 'folio-53.pdf' : 'folio-53.xml',
    }));
    service = makeService(new StubAdapter(), gs);
    const doc = sampleDoc({
      idempotencyKey: 'otro:artifacts',
      source: { erpId: 'otro-erp', empresaId: 'X-1', documentoId: 'd-art' },
    });
    const emitted = await service.emit(doc);

    const firstPdf = await service.getArtifact(emitted.emissionId, 'pdf', 'otro-erp');
    expect(firstPdf.dummy).toBe(false);
    expect(firstPdf.body.equals(pdf)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith('pdf', gid, 'sandbox');

    const cachedPdf = await service.getArtifact(emitted.emissionId, 'pdf', 'otro-erp');
    expect(cachedPdf.body.equals(pdf)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const firstXml = await service.getArtifact(emitted.emissionId, 'xml', 'otro-erp');
    expect(firstXml.dummy).toBe(false);
    expect(firstXml.body.equals(xml)).toBe(true);
    expect(service.get(emitted.emissionId, 'otro-erp').artifacts).toEqual({
      pdfAvailable: true,
      xmlAvailable: true,
      dummy: false,
    });
  });

  it('si GoSocket aún no tiene el archivo responde 404 y no persiste basura', async () => {
    process.env.GOSOCKET_API_USER = 'u';
    process.env.GOSOCKET_API_PASSWORD = 'p';
    const gs = new GoSocketAdapter();
    const gid = 'ae352c22-6c9e-c6b1-6614-4bec8369dba7';
    jest.spyOn(gs, 'emit').mockResolvedValue({
      result: {
        emissionId: 'emi_not_ready',
        partner: 'gosocket',
        connectionMode: 'sandbox',
        status: 'PENDING',
        folioOficial: null,
        folioSimulado: null,
        globalDocumentId: gid,
        countryDocumentId: null,
        messages: [],
        disclaimer: null,
        artifacts: { pdfAvailable: false, xmlAvailable: false, dummy: false },
        stub: false,
      },
    });
    jest.spyOn(gs, 'fetchArtifact').mockRejectedValue(
      new NotFoundException('PDF aún no disponible en el facturador; reintente'),
    );
    service = makeService(new StubAdapter(), gs);
    const emitted = await service.emit(
      sampleDoc({
        idempotencyKey: 'otro:not-ready',
        source: { erpId: 'otro-erp', empresaId: 'X-1', documentoId: 'd-not-ready' },
      }),
    );

    await expect(service.getArtifact(emitted.emissionId, 'pdf', 'otro-erp')).rejects.toThrow(
      /aún no disponible/,
    );
    const stored = store.getById(emitted.emissionId);
    expect(stored?.pdf).toBeUndefined();
    expect(stored?.artifacts.pdfAvailable).toBe(false);
    expect(stored?.artifacts.dummy).toBe(false);
  });

  it('no llama GoSocket si el GID no es usable', async () => {
    const gs = new GoSocketAdapter();
    jest.spyOn(gs, 'emit').mockResolvedValue({
      result: {
        emissionId: 'emi_zero_gid',
        partner: 'gosocket',
        connectionMode: 'sandbox',
        status: 'PENDING',
        folioOficial: null,
        folioSimulado: null,
        globalDocumentId: '00000000-0000-0000-0000-000000000000',
        countryDocumentId: null,
        messages: [],
        disclaimer: null,
        artifacts: { pdfAvailable: false, xmlAvailable: false, dummy: false },
        stub: false,
      },
    });
    const fetchSpy = jest.spyOn(gs, 'fetchArtifact');
    service = makeService(new StubAdapter(), gs);
    const emitted = await service.emit(
      sampleDoc({
        idempotencyKey: 'otro:zero-gid',
        source: { erpId: 'otro-erp', empresaId: 'X-1', documentoId: 'd-zero' },
      }),
    );

    await expect(service.getArtifact(emitted.emissionId, 'pdf', 'otro-erp')).rejects.toThrow(
      /PDF del partner no disponible/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('no reutiliza idempotency de REJECTED (permite reintento tras CAF)', async () => {
    process.env.GOSOCKET_API_USER = 'u';
    process.env.GOSOCKET_API_PASSWORD = 'p';
    const gs = new GoSocketAdapter();
    const bundle = (emissionId: string) => ({
      result: {
        emissionId,
        partner: 'gosocket',
        connectionMode: 'sandbox' as const,
        status: 'REJECTED' as const,
        folioOficial: null,
        folioSimulado: null,
        globalDocumentId: null,
        countryDocumentId: null,
        messages: ['rango de numeros'],
        disclaimer: null,
        artifacts: { pdfAvailable: false, xmlAvailable: false, dummy: false },
        stub: false,
      },
    });
    const spy = jest
      .spyOn(gs, 'emit')
      .mockResolvedValueOnce(bundle('rej-1'))
      .mockResolvedValueOnce(bundle('rej-2'));
    service = makeService(new StubAdapter(), gs);
    const doc = sampleDoc({
      idempotencyKey: 'otro:caf-retry',
      source: { erpId: 'otro-erp', empresaId: 'X-1', documentoId: 'd-caf' },
    });
    const a = await service.emit(doc);
    const b = await service.emit(doc);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(a.emissionId).toBe('rej-1');
    expect(b.emissionId).toBe('rej-2');
  });

  it('reutiliza PENDING idempotente sin segunda llamada al adapter', async () => {
    const gs = new GoSocketAdapter();
    const bundle = (emissionId: string) => ({
      result: {
        emissionId,
        partner: 'gosocket',
        connectionMode: 'sandbox' as const,
        status: 'PENDING' as const,
        folioOficial: null,
        folioSimulado: null,
        globalDocumentId: `global-${emissionId}`,
        countryDocumentId: null,
        messages: [],
        disclaimer: null,
        artifacts: { pdfAvailable: false, xmlAvailable: false, dummy: false },
        stub: false,
      },
    });
    const spy = jest
      .spyOn(gs, 'emit')
      .mockResolvedValueOnce(bundle('pending-1'));
    service = makeService(new StubAdapter(), gs);
    const doc = sampleDoc({
      idempotencyKey: 'otro:pending-retry',
      source: { erpId: 'otro-erp', empresaId: 'X-1', documentoId: 'd-pending' },
    });

    const first = await service.emit(doc);
    const second = await service.emit(doc);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(first.emissionId).toBe('pending-1');
    expect(second.emissionId).toBe('pending-1');
    expect(second.status).toBe('PENDING');
  });

  describe('store durable (reinicio simulado)', () => {
    let dir: string;
    let filePath: string;

    function pendingBundle(emissionId: string) {
      return {
        result: {
          emissionId,
          partner: 'gosocket',
          connectionMode: 'sandbox' as const,
          status: 'PENDING' as const,
          folioOficial: null,
          folioSimulado: null,
          globalDocumentId: `global-${emissionId}`,
          countryDocumentId: null,
          messages: [],
          disclaimer: null,
          artifacts: { pdfAvailable: false, xmlAvailable: false, dummy: false },
          stub: false,
        },
      };
    }

    function acceptedBundle(emissionId: string) {
      return {
        result: {
          emissionId,
          partner: 'gosocket',
          connectionMode: 'sandbox' as const,
          status: 'ACCEPTED' as const,
          folioOficial: '99',
          folioSimulado: null,
          globalDocumentId: `global-${emissionId}`,
          countryDocumentId: 'CL-33-99',
          messages: [],
          disclaimer: null,
          artifacts: { pdfAvailable: false, xmlAvailable: false, dummy: false },
          stub: false,
        },
      };
    }

    function rejectedBundle(emissionId: string) {
      return {
        result: {
          emissionId,
          partner: 'gosocket',
          connectionMode: 'sandbox' as const,
          status: 'REJECTED' as const,
          folioOficial: null,
          folioSimulado: null,
          globalDocumentId: null,
          countryDocumentId: null,
          messages: ['rango de numeros'],
          disclaimer: null,
          artifacts: { pdfAvailable: false, xmlAvailable: false, dummy: false },
          stub: false,
        },
      };
    }

    beforeEach(() => {
      store?.close();
      dir = mkdtempSync(join(tmpdir(), 'billing-store-'));
      filePath = join(dir, 'emissions.sqlite');
    });

    afterEach(() => {
      store?.close();
      rmSync(dir, { recursive: true, force: true });
    });

    it('tras reinicio no reenvía PENDING ni ACCEPTED al adapter', async () => {
      const gs1 = new GoSocketAdapter();
      const spy1 = jest
        .spyOn(gs1, 'emit')
        .mockResolvedValueOnce(pendingBundle('pending-disk'))
        .mockResolvedValueOnce(acceptedBundle('accepted-disk'));
      const store1 = SqliteEmissionsStore.open(filePath);
      const svc1 = new EmissionsService(registry, new StubAdapter(), gs1, store1);

      const pendingDoc = sampleDoc({
        idempotencyKey: 'otro:pending-disk',
        source: { erpId: 'otro-erp', empresaId: 'X-1', documentoId: 'd-pending-disk' },
      });
      const acceptedDoc = sampleDoc({
        idempotencyKey: 'otro:accepted-disk',
        source: { erpId: 'otro-erp', empresaId: 'X-1', documentoId: 'd-accepted-disk' },
      });

      await expect(svc1.emit(pendingDoc)).resolves.toMatchObject({
        emissionId: 'pending-disk',
        status: 'PENDING',
      });
      await expect(svc1.emit(acceptedDoc)).resolves.toMatchObject({
        emissionId: 'accepted-disk',
        status: 'ACCEPTED',
      });
      expect(spy1).toHaveBeenCalledTimes(2);
      store1.close();

      const gs2 = new GoSocketAdapter();
      const spy2 = jest.spyOn(gs2, 'emit');
      const store2 = SqliteEmissionsStore.open(filePath);
      service = new EmissionsService(registry, new StubAdapter(), gs2, store2);
      store = store2;

      await expect(service.emit(pendingDoc)).resolves.toMatchObject({
        emissionId: 'pending-disk',
        status: 'PENDING',
      });
      await expect(service.emit(acceptedDoc)).resolves.toMatchObject({
        emissionId: 'accepted-disk',
        status: 'ACCEPTED',
      });
      expect(spy2).not.toHaveBeenCalled();
    });

    it('REJECTED no queda cacheado en disco y reintenta tras reinicio', async () => {
      const gs1 = new GoSocketAdapter();
      jest.spyOn(gs1, 'emit').mockResolvedValueOnce(rejectedBundle('rej-disk-1'));
      const store1 = SqliteEmissionsStore.open(filePath);
      const svc1 = new EmissionsService(registry, new StubAdapter(), gs1, store1);
      const doc = sampleDoc({
        idempotencyKey: 'otro:caf-disk',
        source: { erpId: 'otro-erp', empresaId: 'X-1', documentoId: 'd-caf-disk' },
      });
      await expect(svc1.emit(doc)).resolves.toMatchObject({ emissionId: 'rej-disk-1' });
      store1.close();

      const gs2 = new GoSocketAdapter();
      const spy2 = jest.spyOn(gs2, 'emit').mockResolvedValueOnce(rejectedBundle('rej-disk-2'));
      const store2 = SqliteEmissionsStore.open(filePath);
      service = new EmissionsService(registry, new StubAdapter(), gs2, store2);
      store = store2;

      await expect(service.emit(doc)).resolves.toMatchObject({ emissionId: 'rej-disk-2' });
      expect(spy2).toHaveBeenCalledTimes(1);
    });

    it('aísla la misma key entre empresas también tras reinicio', async () => {
      const stub1 = new StubAdapter();
      const spy1 = jest.spyOn(stub1, 'emit');
      const store1 = SqliteEmissionsStore.open(filePath);
      const svc1 = new EmissionsService(registry, stub1, new GoSocketAdapter(), store1);
      const first = await svc1.emit(sampleDoc());
      const second = await svc1.emit(
        sampleDoc({
          source: { erpId: 'almahue', empresaId: 'EMP-2', documentoId: 'doc-test' },
        }),
      );
      expect(spy1).toHaveBeenCalledTimes(2);
      expect(first.emissionId).not.toBe(second.emissionId);
      store1.close();

      const stub2 = new StubAdapter();
      const spy2 = jest.spyOn(stub2, 'emit');
      const store2 = SqliteEmissionsStore.open(filePath);
      service = new EmissionsService(registry, stub2, new GoSocketAdapter(), store2);
      store = store2;

      const firstAgain = await service.emit(sampleDoc());
      const secondAgain = await service.emit(
        sampleDoc({
          source: { erpId: 'almahue', empresaId: 'EMP-2', documentoId: 'doc-test' },
        }),
      );
      expect(spy2).not.toHaveBeenCalled();
      expect(firstAgain.emissionId).toBe(first.emissionId);
      expect(secondAgain.emissionId).toBe(second.emissionId);
    });

    it('fingerprint mismatch persiste tras reinicio y no llama adapter', async () => {
      const stub1 = new StubAdapter();
      const spy1 = jest.spyOn(stub1, 'emit');
      const store1 = SqliteEmissionsStore.open(filePath);
      const svc1 = new EmissionsService(registry, stub1, new GoSocketAdapter(), store1);
      await svc1.emit(sampleDoc());
      expect(spy1).toHaveBeenCalledTimes(1);
      store1.close();

      const stub2 = new StubAdapter();
      const spy2 = jest.spyOn(stub2, 'emit');
      const store2 = SqliteEmissionsStore.open(filePath);
      service = new EmissionsService(registry, stub2, new GoSocketAdapter(), store2);
      store = store2;

      const changed = sampleDoc({
        receptor: { rut: '55.555.555-5', razonSocial: 'Otro receptor' },
      });
      await expect(service.emit(changed)).rejects.toThrow(/canónico diferente/);
      expect(spy2).not.toHaveBeenCalled();
    });
  });

  describe('refresh GetDocument', () => {
    it('PENDING + GID RCH no reenvía emit y persiste REJECTED', async () => {
      const gs = new GoSocketAdapter();
      const gid = 'ae352c22-6c9e-c6b1-6614-4bec8369dba7';
      jest.spyOn(gs, 'emit').mockResolvedValue({
        result: {
          emissionId: 'emi-rch',
          partner: 'gosocket',
          connectionMode: 'sandbox',
          status: 'PENDING',
          folioOficial: null,
          folioSimulado: null,
          globalDocumentId: gid,
          countryDocumentId: null,
          messages: [],
          disclaimer: null,
          artifacts: { pdfAvailable: false, xmlAvailable: false, dummy: false },
          stub: false,
        },
      });
      jest.spyOn(gs, 'fetchDocumentStatus').mockResolvedValue({
        status: 'REJECTED',
        folioOficial: '53',
        messages: ['(HED-3-845) RECHAZO- DTE Sin Direccion del Receptor.'],
        authorityStatus: '3',
      });
      service = makeService(new StubAdapter(), gs);
      const doc = sampleDoc({
        idempotencyKey: 'otro:refresh-rch',
        source: { erpId: 'otro-erp', empresaId: 'X-1', documentoId: 'd-rch' },
        emisor: {
          rut: '77.032.638-9',
          razonSocial: 'ALMAHUE EXPORT SPA',
          direccion: 'Camino 1',
          nroResolucion: '0',
          fechaResolucion: '2024-10-11',
          acteco: '461001',
        },
      });
      await service.emit(doc);
      const refreshed = await service.refresh('emi-rch', 'otro-erp');
      expect(refreshed.status).toBe('REJECTED');
      expect(refreshed.folioOficial).toBe('53');
      expect(gs.emit).toHaveBeenCalledTimes(1);
      const again = await service.emit(doc);
      expect(again.emissionId).toBe('emi-rch');
      expect(gs.emit).toHaveBeenCalledTimes(1);
    });

    it('PENDING + ACE persiste folio oficial', async () => {
      const gs = new GoSocketAdapter();
      const gid = '4c2fe456-8eef-b47a-f082-c65d7d66529b';
      jest.spyOn(gs, 'emit').mockResolvedValue({
        result: {
          emissionId: 'emi-ace',
          partner: 'gosocket',
          connectionMode: 'sandbox',
          status: 'PENDING',
          folioOficial: null,
          folioSimulado: null,
          globalDocumentId: gid,
          countryDocumentId: null,
          messages: [],
          disclaimer: null,
          artifacts: { pdfAvailable: false, xmlAvailable: false, dummy: false },
          stub: false,
        },
      });
      jest.spyOn(gs, 'fetchDocumentStatus').mockResolvedValue({
        status: 'ACCEPTED',
        folioOficial: '54',
        messages: ['Recibido por el Sii, TrackId: 257173516'],
        authorityStatus: '2',
      });
      service = makeService(new StubAdapter(), gs);
      const doc = sampleDoc({
        idempotencyKey: 'otro:refresh-ace',
        source: { erpId: 'otro-erp', empresaId: 'X-1', documentoId: 'd-ace' },
      });
      await service.emit(doc);
      const refreshed = await service.refresh('emi-ace', 'otro-erp');
      expect(refreshed.status).toBe('ACCEPTED');
      expect(refreshed.folioOficial).toBe('54');
      expect(refreshed.disclaimer).toMatch(/Folio oficial 54/);
    });

    it('no baja ACE a PENDING si GetDocument vuelve vacío', async () => {
      const gs = new GoSocketAdapter();
      const gid = '4c2fe456-8eef-b47a-f082-c65d7d66529b';
      jest.spyOn(gs, 'emit').mockResolvedValue({
        result: {
          emissionId: 'emi-keep-ace',
          partner: 'gosocket',
          connectionMode: 'sandbox',
          status: 'PENDING',
          folioOficial: null,
          folioSimulado: null,
          globalDocumentId: gid,
          countryDocumentId: null,
          messages: [],
          disclaimer: null,
          artifacts: { pdfAvailable: false, xmlAvailable: false, dummy: false },
          stub: false,
        },
      });
      const fetch = jest.spyOn(gs, 'fetchDocumentStatus')
        .mockResolvedValueOnce({
          status: 'ACCEPTED',
          folioOficial: '54',
          messages: ['Recibido por el Sii'],
          authorityStatus: '2',
        })
        .mockResolvedValueOnce({
          status: 'PENDING',
          folioOficial: null,
          messages: [],
          authorityStatus: null,
        });
      service = makeService(new StubAdapter(), gs);
      const doc = sampleDoc({
        idempotencyKey: 'otro:refresh-keep-ace',
        source: { erpId: 'otro-erp', empresaId: 'X-1', documentoId: 'd-keep-ace' },
      });
      await service.emit(doc);
      await service.refresh('emi-keep-ace', 'otro-erp');
      const kept = await service.refresh('emi-keep-ace', 'otro-erp');
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(kept.status).toBe('ACCEPTED');
      expect(kept.folioOficial).toBe('54');
    });
  });
});
