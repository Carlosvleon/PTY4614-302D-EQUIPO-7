import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingGatewayClient, CanonicalDocumentV1 } from './billing-gateway.client';

describe('BillingGatewayClient', () => {
  const validApiKey = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4P5q6';
  const doc: CanonicalDocumentV1 = {
    schemaVersion: '1.0',
    idempotencyKey: 'almahue:EMP-1:DOC-1:1',
    source: {
      erpId: 'almahue',
      empresaId: 'EMP-1',
      documentoId: 'DOC-1',
      billerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    },
    emisor: {
      rut: '76.000.000-0',
      razonSocial: 'Emisor de prueba SpA',
      direccion: 'Calle Falsa 123',
      nroResolucion: '80',
      fechaResolucion: '2024-01-01',
      acteco: '461001',
    },
    receptor: { rut: '11.111.111-1', razonSocial: 'Cliente Demo' },
    documento: {
      tipoDte: 33,
      fechaEmision: '2026-08-19',
      numeroInterno: 'FAC-1',
    },
    totales: { neto: 1000, iva: 190, total: 1190 },
    lineas: [{ nro: 1, descripcion: 'Servicio', cantidad: 1, precio: 1000, montoNeto: 1000 }],
  };

  let fetchMock: jest.Mock;

  function clientWith(values: Record<string, string | undefined>): BillingGatewayClient {
    const config = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
    return new BillingGatewayClient(config);
  }

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Date, 'now').mockReturnValue(1_234_567_890);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('usa stub inline sin llamar fetch', async () => {
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: 'true',
      BILLING_STUB_INLINE: 'true',
    });

    const result = await client.emit(doc);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.partner).toBe('stub-inline');
    expect(result.status).toBe('ACCEPTED_STUB');
    expect(result.folioSimulado).toMatch(/^STUB-33-/);
    expect(result.stub).toBe(true);
  });

  it('falla por configuración y no hace request HTTP si falta API key', async () => {
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: 'true',
      BILLING_STUB_INLINE: 'false',
      BILLING_GATEWAY_API_KEY: '   ',
    });

    await expect(client.emit(doc)).rejects.toThrow(
      'Configuración billing-gateway incompleta: falta API key',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['corta', 'short-key'],
    ['demo conocida', 'almahue-demo-key'],
    ['placeholder', 'placeholder'.padEnd(40, '-')],
  ])('rechaza API key %s sin hacer request ni revelar su valor', async (_case, apiKey) => {
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: 'true',
      BILLING_STUB_INLINE: 'false',
      BILLING_GATEWAY_API_KEY: apiKey,
    });

    const error = await client.emit(doc).catch((caught: unknown) => caught);

    expect((error as Error).message).toBe(
      'Configuración billing-gateway inválida: API key débil o placeholder',
    );
    expect((error as Error).message).not.toContain(apiKey);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(Logger.prototype.log).not.toHaveBeenCalled();
    expect(Logger.prototype.error).not.toHaveBeenCalled();
  });

  it('no llama HTTP si la empresa no trae resolución SII en el canónico', async () => {
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: 'true',
      BILLING_STUB_INLINE: 'false',
      BILLING_GATEWAY_API_KEY: validApiKey,
    });
    const sinResolucion: CanonicalDocumentV1 = {
      ...doc,
      emisor: { rut: doc.emisor.rut, razonSocial: doc.emisor.razonSocial, direccion: doc.emisor.direccion },
    };

    await expect(client.emit(sinResolucion)).rejects.toThrow(/resolución SII/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no llama HTTP si la empresa no trae Acteco de 6 dígitos', async () => {
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: 'true',
      BILLING_STUB_INLINE: 'false',
      BILLING_GATEWAY_API_KEY: validApiKey,
    });
    const sinActeco: CanonicalDocumentV1 = {
      ...doc,
      emisor: { ...doc.emisor, acteco: undefined },
    };

    await expect(client.emit(sinActeco)).rejects.toThrow(/Acteco/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('acepta API key válida y emite por HTTP', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        emissionId: 'em-1',
        partner: 'billing-gateway-stub',
        connectionMode: 'http',
        status: 'ACCEPTED',
        folioOficial: '33',
        folioSimulado: null,
        globalDocumentId: 'global-1',
        countryDocumentId: 'cl-1',
        messages: ['ok'],
        disclaimer: null,
        artifacts: { pdfAvailable: true, xmlAvailable: true, dummy: { foo: 'bar' } },
        stub: false,
      }),
    } as Response);
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: 'yes',
      BILLING_STUB_INLINE: 'false',
      BILLING_GATEWAY_URL: 'http://127.0.0.1:3040/',
      BILLING_GATEWAY_API_KEY: validApiKey,
    });

    const result = await client.emit(doc);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3040/v1/emissions',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          'X-Billing-Api-Key': validApiKey,
        },
        body: JSON.stringify(doc),
      }),
    );
    expect(result.emissionId).toBe('em-1');
    expect(result.folioOficial).toBe('33');
    expect(result.artifacts.dummy).toEqual({ foo: 'bar' });
  });

  it('acepta PENDING async de partner real con GlobalDocumentId', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        emissionId: 'emi_925d0b4b7ce64e7a',
        partner: 'gosocket',
        connectionMode: 'sandbox',
        status: 'PENDING',
        folioOficial: null,
        folioSimulado: null,
        globalDocumentId: '31f5fdbb-bfae-abc9-c45f-a3c4944d5b5a',
        countryDocumentId: null,
        messages: [],
        disclaimer: null,
        artifacts: { pdfAvailable: false, xmlAvailable: false, dummy: false },
        stub: false,
      }),
    } as Response);
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: 'true',
      BILLING_STUB_INLINE: 'false',
      BILLING_GATEWAY_API_KEY: validApiKey,
    });

    const result = await client.emit(doc);

    expect(result.status).toBe('PENDING');
    expect(result.globalDocumentId).toBe('31f5fdbb-bfae-abc9-c45f-a3c4944d5b5a');
    expect(result.folioOficial).toBeNull();
    expect(result.stub).toBe(false);
  });

  it.each([
    ['sin GlobalDocumentId', null],
    ['con GID 0', '0'],
    ['con UUID cero', '00000000-0000-0000-0000-000000000000'],
  ])('falla cerrado si PENDING llega %s', async (_label, globalDocumentId) => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        emissionId: 'em-pending-bad',
        partner: 'gosocket',
        connectionMode: 'sandbox',
        status: 'PENDING',
        folioOficial: null,
        folioSimulado: null,
        globalDocumentId,
        countryDocumentId: null,
        messages: [],
        disclaimer: null,
        artifacts: { pdfAvailable: false, xmlAvailable: false },
        stub: false,
      }),
    } as Response);
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: 'true',
      BILLING_STUB_INLINE: 'false',
      BILLING_GATEWAY_API_KEY: validApiKey,
    });

    await expect(client.emit(doc)).rejects.toThrow('Respuesta inválida de billing-gateway');
  });

  it('acepta SIMULATED solo para stub HTTP explícito del registry', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        emissionId: 'em-stub-1',
        partner: 'stub',
        connectionMode: 'stub',
        status: 'SIMULATED',
        folioOficial: null,
        folioSimulado: 'SIM-33',
        globalDocumentId: null,
        countryDocumentId: null,
        messages: ['simulado'],
        disclaimer: 'No fiscal',
        artifacts: { pdfAvailable: false, xmlAvailable: false },
        stub: true,
      }),
    } as Response);
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: 'true',
      BILLING_STUB_INLINE: 'false',
      BILLING_GATEWAY_API_KEY: validApiKey,
    });

    const result = await client.emit(doc);

    expect(result.status).toBe('SIMULATED');
    expect(result.partner).toBe('stub');
    expect(result.connectionMode).toBe('stub');
    expect(result.stub).toBe(true);
  });

  it('falla cerrado ante HTTP 503 sin caer a stub', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'api_key=secreto-interno stack trace privado',
    } as Response);
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: 'true',
      BILLING_STUB_INLINE: 'false',
      BILLING_GATEWAY_API_KEY: validApiKey,
    });

    const error = await client.emit(doc).catch((caught: unknown) => caught);
    expect((error as Error).message).toBe('billing-gateway rechazó la emisión HTTP 503');
    expect((error as Error).message).not.toContain('secreto-interno');
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.not.stringContaining('secreto-interno'),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['PENDING', 'gateway', 'http', false],
    ['SIMULATED', 'gateway', 'stub', true],
    ['SIMULATED', 'stub', 'http', true],
    ['SIMULATED', 'stub', 'stub', false],
  ])(
    'falla cerrado si HTTP mezcla estado %s, partner %s, modo %s y stub %s',
    async (status, partner, connectionMode, stub) => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          emissionId: `em-${status.toLowerCase()}`,
          partner,
          connectionMode,
          status,
          folioOficial: null,
          folioSimulado: null,
          globalDocumentId: null,
          countryDocumentId: null,
          messages: [],
          disclaimer: null,
          artifacts: { pdfAvailable: false, xmlAvailable: false },
          stub,
        }),
      } as Response);
      const client = clientWith({
        BILLING_GATEWAY_ENABLED: 'true',
        BILLING_STUB_INLINE: 'false',
        BILLING_GATEWAY_API_KEY: validApiKey,
      });

      await expect(client.emit(doc)).rejects.toThrow('Respuesta inválida de billing-gateway');
    },
  );

  it('falla cerrado ante respuesta HTTP malformada', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ACCEPTED',
        messages: [],
        artifacts: { pdfAvailable: false, xmlAvailable: false },
        stub: false,
      }),
    } as Response);
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: 'true',
      BILLING_STUB_INLINE: 'false',
      BILLING_GATEWAY_API_KEY: validApiKey,
    });

    await expect(client.emit(doc)).rejects.toThrow('Respuesta inválida de billing-gateway');
  });

  it.each([
    ['folioOficial', { valor: '33' }],
    ['folioSimulado', ['SIM-33']],
    ['globalDocumentId', { id: 'global-1' }],
    ['countryDocumentId', 123],
    ['disclaimer', { texto: 'privado' }],
    ['messages', ['ok', { secreto: true }]],
    ['artifacts', { pdfAvailable: 'sí', xmlAvailable: false }],
    ['disclaimer', 'x'.repeat(2_001)],
  ])('rechaza tipo o límite inválido en %s', async (field, value) => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        emissionId: 'em-invalid',
        partner: 'gosocket',
        connectionMode: 'sandbox',
        status: 'ACCEPTED',
        folioOficial: null,
        folioSimulado: null,
        globalDocumentId: null,
        countryDocumentId: null,
        messages: [],
        disclaimer: null,
        artifacts: { pdfAvailable: false, xmlAvailable: false },
        stub: false,
        [field]: value,
      }),
    } as Response);
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: 'true',
      BILLING_STUB_INLINE: 'false',
      BILLING_GATEWAY_API_KEY: validApiKey,
    });

    await expect(client.emit(doc)).rejects.toThrow('Respuesta inválida de billing-gateway');
  });

  it('sanitiza REJECTED sin perder el motivo CAF/rango', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        emissionId: 'em-rejected',
        partner: 'gateway',
        connectionMode: 'http',
        status: 'REJECTED',
        folioOficial: null,
        folioSimulado: null,
        globalDocumentId: null,
        countryDocumentId: null,
        messages: [
          '<b>CAF</b>\n sin rango disponible 1-10',
          'api_key=super-secreta',
          'Authorization: Bearer colon-secret',
          'authorization=Bearer equal-secret',
          'AUTHORIZATION:header-secret',
        ],
        disclaimer: null,
        artifacts: { pdfAvailable: false, xmlAvailable: false },
        stub: false,
      }),
    } as Response);
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: '1',
      BILLING_STUB_INLINE: 'false',
      BILLING_GATEWAY_API_KEY: validApiKey,
    });

    const error = await client.emit(doc).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toContain('CAF sin rango disponible 1-10');
    expect((error as Error).message).toContain('api_key=[REDACTED]');
    expect((error as Error).message).toContain('Authorization=[REDACTED]');
    expect((error as Error).message).toContain('authorization=[REDACTED]');
    expect((error as Error).message).toContain('AUTHORIZATION=[REDACTED]');
    for (const secret of [
      'super-secreta',
      'colon-secret',
      'equal-secret',
      'header-secret',
    ]) {
      expect((error as Error).message).not.toContain(secret);
      expect(JSON.stringify((Logger.prototype.error as jest.Mock).mock.calls)).not.toContain(secret);
      expect(JSON.stringify((Logger.prototype.log as jest.Mock).mock.calls)).not.toContain(secret);
    }
    expect((error as Error).message.length).toBeLessThanOrEqual(600);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('queda deshabilitado con BILLING_GATEWAY_ENABLED=false', () => {
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: 'false',
      BILLING_STUB_INLINE: 'true',
    });

    expect(client.isEnabled()).toBe(false);
  });

  it('GET artifact usa la misma API key y no reemite', async () => {
    const pdf = Buffer.from('%PDF-1.4 qa');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => {
          if (name === 'content-type') return 'application/pdf';
          if (name === 'content-disposition') return 'attachment; filename="folio-53.pdf"';
          if (name === 'x-billing-artifact-dummy') return null;
          return null;
        },
      },
      arrayBuffer: async () => pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength),
    } as Response);
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: 'true',
      BILLING_STUB_INLINE: 'false',
      BILLING_GATEWAY_URL: 'http://127.0.0.1:3040/',
      BILLING_GATEWAY_API_KEY: validApiKey,
    });

    const art = await client.getArtifact('emi_d57c76c6b22f46fe', 'pdf');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3040/v1/emissions/emi_d57c76c6b22f46fe/artifacts/pdf',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: expect.objectContaining({
          'X-Billing-Api-Key': validApiKey,
        }),
      }),
    );
    expect(art.body.equals(pdf)).toBe(true);
    expect(art.dummy).toBe(false);
    expect(art.filename).toBe('folio-53.pdf');
    expect(JSON.stringify((Logger.prototype.log as jest.Mock).mock.calls)).not.toContain(
      validApiKey,
    );
  });

  it('POST refresh consulta estado y acepta REJECTED sin lanzar', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        emissionId: 'emi_bbdb38708c4f4e3c',
        partner: 'gosocket',
        connectionMode: 'sandbox',
        status: 'REJECTED',
        folioOficial: '53',
        folioSimulado: null,
        globalDocumentId: 'ae352c22-6c9e-c6b1-6614-4bec8369dba7',
        countryDocumentId: null,
        messages: ['(HED-3-845) RECHAZO'],
        disclaimer: 'El SII rechazó el DTE.',
        artifacts: { pdfAvailable: true, xmlAvailable: true, dummy: false },
        stub: false,
      }),
    } as unknown as Response);
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: 'true',
      BILLING_STUB_INLINE: 'false',
      BILLING_GATEWAY_URL: 'http://127.0.0.1:3040',
      BILLING_GATEWAY_API_KEY: validApiKey,
    });

    const result = await client.refreshEmission('emi_bbdb38708c4f4e3c');

    expect(result.status).toBe('REJECTED');
    expect(result.folioOficial).toBe('53');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3040/v1/emissions/emi_bbdb38708c4f4e3c/refresh',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({ 'X-Billing-Api-Key': validApiKey }),
      }),
    );
  });

  it.each([404, 409])('HTTP %s de artifact es “aún no disponible”, no rechazo SII', async (status) => {
    fetchMock.mockResolvedValue({
      ok: false,
      status,
      text: async () => 'does not exist',
      headers: { get: () => null },
    } as unknown as Response);
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: 'true',
      BILLING_STUB_INLINE: 'false',
      BILLING_GATEWAY_API_KEY: validApiKey,
    });

    await expect(client.getArtifact('emi_d57c76c6b22f46fe', 'xml')).rejects.toThrow(
      /aún no disponible/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('no llama HTTP si el gateway está en stub inline', async () => {
    const client = clientWith({
      BILLING_GATEWAY_ENABLED: 'true',
      BILLING_STUB_INLINE: 'true',
    });

    await expect(client.getArtifact('inline-1', 'pdf')).rejects.toThrow(/aún no disponible/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('Compras (documentos recibidos) — /v1/purchases', () => {
    it('getReceivedPurchaseDocuments llama a /v1/purchases/received y devuelve el arreglo', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          { globalDocumentId: 'gid-1', folioOficial: '81', estado: 'PENDIENTE' },
        ],
      } as Response);
      const client = clientWith({
        BILLING_GATEWAY_ENABLED: 'true',
        BILLING_STUB_INLINE: 'false',
        BILLING_GATEWAY_URL: 'http://127.0.0.1:3040',
        BILLING_GATEWAY_API_KEY: validApiKey,
      });

      const list = await client.getReceivedPurchaseDocuments(
        '77.032.638-9',
        'EMP-1',
        '2026-09-01',
        '2026-09-30',
      );

      expect(list).toHaveLength(1);
      expect(list[0].globalDocumentId).toBe('gid-1');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:3040/v1/purchases/received',
        expect.objectContaining({
          method: 'POST',
          redirect: 'error',
          headers: expect.objectContaining({ 'X-Billing-Api-Key': validApiKey }),
          body: JSON.stringify({
            empresaRut: '77.032.638-9',
            empresaId: 'EMP-1',
            desde: '2026-09-01',
            hasta: '2026-09-30',
          }),
        }),
      );
    });

    it('getReceivedPurchaseDocuments lanza ServiceUnavailable si el gateway está deshabilitado', async () => {
      const client = clientWith({ BILLING_GATEWAY_ENABLED: 'false' });
      await expect(
        client.getReceivedPurchaseDocuments('77.032.638-9', 'EMP-1', '2026-09-01', '2026-09-30'),
      ).rejects.toThrow('Billing gateway deshabilitado');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('getReceivedPurchaseDocuments mapea HTTP no-ok a BadGateway sin exponer el body', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => 'detalle interno',
        headers: { get: () => null },
      } as unknown as Response);
      const client = clientWith({
        BILLING_GATEWAY_ENABLED: 'true',
        BILLING_STUB_INLINE: 'false',
        BILLING_GATEWAY_API_KEY: validApiKey,
      });
      const error = await client
        .getReceivedPurchaseDocuments('77.032.638-9', 'EMP-1', '2026-09-01', '2026-09-30')
        .catch((caught: unknown) => caught);
      expect((error as Error).message).not.toContain('detalle interno');
      expect((error as Error).message).toContain('HTTP 502');
    });

    it('getReceivedPurchaseDocuments rechaza una respuesta que no sea un arreglo', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ Description: 'no autorizado' }),
      } as Response);
      const client = clientWith({
        BILLING_GATEWAY_ENABLED: 'true',
        BILLING_STUB_INLINE: 'false',
        BILLING_GATEWAY_API_KEY: validApiKey,
      });
      await expect(
        client.getReceivedPurchaseDocuments('77.032.638-9', 'EMP-1', '2026-09-01', '2026-09-30'),
      ).rejects.toThrow('Respuesta inválida de billing-gateway (received)');
    });

    it('getReceivedPurchaseDocuments mapea error de transporte (fetch throw) a ServiceUnavailable', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
      const client = clientWith({
        BILLING_GATEWAY_ENABLED: 'true',
        BILLING_STUB_INLINE: 'false',
        BILLING_GATEWAY_API_KEY: validApiKey,
      });
      await expect(
        client.getReceivedPurchaseDocuments('77.032.638-9', 'EMP-1', '2026-09-01', '2026-09-30'),
      ).rejects.toThrow('No fue posible conectar con billing-gateway');
    });

    it('getPurchaseArtifact descarga bytes/filename desde /v1/purchases/artifacts/:gid/:kind', async () => {
      const xml = Buffer.from('<DTE/>');
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'application/xml; charset=utf-8';
            if (name === 'content-disposition') return 'attachment; filename="folio-81.xml"';
            return null;
          },
        },
        arrayBuffer: async () => xml.buffer.slice(xml.byteOffset, xml.byteOffset + xml.byteLength),
      } as unknown as Response);
      const client = clientWith({
        BILLING_GATEWAY_ENABLED: 'true',
        BILLING_STUB_INLINE: 'false',
        BILLING_GATEWAY_URL: 'http://127.0.0.1:3040',
        BILLING_GATEWAY_API_KEY: validApiKey,
      });

      const art = await client.getPurchaseArtifact('gid-1', 'xml', '77.032.638-9', 'EMP-1');

      expect(art.body.equals(xml)).toBe(true);
      expect(art.filename).toBe('folio-81.xml');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:3040/v1/purchases/artifacts/gid-1/xml?empresaRut=77.032.638-9&empresaId=EMP-1',
        expect.objectContaining({ method: 'GET', redirect: 'error' }),
      );
    });

    it.each([404, 409])(
      'getPurchaseArtifact con HTTP %s lanza NotFoundException "aún no disponible"',
      async (status) => {
        fetchMock.mockResolvedValue({
          ok: false,
          status,
          text: async () => 'does not exist',
          headers: { get: () => null },
        } as unknown as Response);
        const client = clientWith({
          BILLING_GATEWAY_ENABLED: 'true',
          BILLING_STUB_INLINE: 'false',
          BILLING_GATEWAY_API_KEY: validApiKey,
        });
        await expect(
          client.getPurchaseArtifact('gid-1', 'pdf', '77.032.638-9'),
        ).rejects.toThrow(/aún no disponible/);
      },
    );

    it('getPurchaseArtifact rechaza globalDocumentId vacío sin llamar a fetch', async () => {
      const client = clientWith({
        BILLING_GATEWAY_ENABLED: 'true',
        BILLING_STUB_INLINE: 'false',
        BILLING_GATEWAY_API_KEY: validApiKey,
      });
      await expect(client.getPurchaseArtifact('   ', 'pdf', '77.032.638-9')).rejects.toThrow(
        'globalDocumentId inválido',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('changePurchaseDocumentStatus llama a /v1/purchases/:gid/status con eventCode/note', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, code: 'OK', description: 'Procesado', messages: [] }),
      } as Response);
      const client = clientWith({
        BILLING_GATEWAY_ENABLED: 'true',
        BILLING_STUB_INLINE: 'false',
        BILLING_GATEWAY_URL: 'http://127.0.0.1:3040',
        BILLING_GATEWAY_API_KEY: validApiKey,
      });

      const result = await client.changePurchaseDocumentStatus(
        'gid-1',
        30,
        '77.032.638-9',
        'EMP-1',
        'Acuse de recibo vía ERP',
      );

      expect(result.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:3040/v1/purchases/gid-1/status',
        expect.objectContaining({
          method: 'POST',
          redirect: 'error',
          body: JSON.stringify({
            empresaRut: '77.032.638-9',
            empresaId: 'EMP-1',
            eventCode: 30,
            note: 'Acuse de recibo vía ERP',
          }),
        }),
      );
    });

    it('changePurchaseDocumentStatus rechaza globalDocumentId vacío sin llamar a fetch', async () => {
      const client = clientWith({
        BILLING_GATEWAY_ENABLED: 'true',
        BILLING_STUB_INLINE: 'false',
        BILLING_GATEWAY_API_KEY: validApiKey,
      });
      await expect(
        client.changePurchaseDocumentStatus('', 30, '77.032.638-9'),
      ).rejects.toThrow('globalDocumentId inválido');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('changePurchaseDocumentStatus lanza ServiceUnavailable si el gateway está deshabilitado', async () => {
      const client = clientWith({ BILLING_GATEWAY_ENABLED: 'false' });
      await expect(
        client.changePurchaseDocumentStatus('gid-1', 30, '77.032.638-9'),
      ).rejects.toThrow('Billing gateway deshabilitado');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('changePurchaseDocumentStatus mapea HTTP no-ok a BadGateway', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'boom',
        headers: { get: () => null },
      } as unknown as Response);
      const client = clientWith({
        BILLING_GATEWAY_ENABLED: 'true',
        BILLING_STUB_INLINE: 'false',
        BILLING_GATEWAY_API_KEY: validApiKey,
      });
      await expect(
        client.changePurchaseDocumentStatus('gid-1', 30, '77.032.638-9'),
      ).rejects.toThrow(/HTTP 500/);
    });

    it('changePurchaseDocumentStatus arma AbortController con timeout de 6 minutos', async () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, code: 'OK', description: null, messages: [] }),
      } as Response);
      const client = clientWith({
        BILLING_GATEWAY_ENABLED: 'true',
        BILLING_STUB_INLINE: 'false',
        BILLING_GATEWAY_URL: 'http://127.0.0.1:3040',
        BILLING_GATEWAY_API_KEY: validApiKey,
      });
      await client.changePurchaseDocumentStatus('gid-1', 30, '77.032.638-9');
      expect(setTimeoutSpy.mock.calls.some((call) => call[1] === 6 * 60_000)).toBe(true);
    });

    it('changePurchaseDocumentStatus rechaza JSON malformado (null) como BadGateway', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => null,
      } as Response);
      const client = clientWith({
        BILLING_GATEWAY_ENABLED: 'true',
        BILLING_STUB_INLINE: 'false',
        BILLING_GATEWAY_API_KEY: validApiKey,
      });
      await expect(
        client.changePurchaseDocumentStatus('gid-1', 30, '77.032.638-9'),
      ).rejects.toThrow('Respuesta inválida de billing-gateway (status)');
    });
  });
});
