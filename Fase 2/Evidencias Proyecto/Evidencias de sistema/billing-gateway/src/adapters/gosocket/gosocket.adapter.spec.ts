import { BadGatewayException, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import type { CanonicalDocumentV1, TenantBillingConfig } from '../../common/types';
import { ForbiddenException } from '@nestjs/common';
import { GOSOCKET_EVENT_ACEPTACION, GOSOCKET_EVENT_ACUSE_RECIBO, GOSOCKET_EVENT_RECLAMO } from './document-status';
import {
  assertArtifactLimits,
  assertGoSocketRequestUrl,
  decodeGoSocketFile,
  GOSOCKET_CHILE_PDF_TYPE,
  GOSOCKET_CHILE_XML_TYPE,
  GOSOCKET_PDF_MAX_BYTES,
  GoSocketAdapter,
  resolveGoSocketBillerId,
} from './gosocket.adapter';

const tenant: TenantBillingConfig = {
  erpId: 'erp-test',
  empresaId: 'EMP-1',
  rutEmisor: '*',
  partner: 'gosocket',
  connectionMode: 'sandbox',
  activo: true,
  billerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
};

function doc(): CanonicalDocumentV1 {
  return {
    schemaVersion: '1.0',
    idempotencyKey: 'erp-test:EMP-1:DOC-1',
    source: { erpId: 'erp-test', empresaId: 'EMP-1', documentoId: 'DOC-1' },
    emisor: {
      rut: '76.000.000-0',
      razonSocial: 'Emisor de prueba',
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
    documento: { tipoDte: 33, fechaEmision: '2026-08-19', numeroInterno: 'FAC-1' },
    totales: { neto: 100, iva: 19, total: 119 },
    lineas: [
      { nro: 1, descripcion: 'Producto', cantidad: 1, precio: 100, montoNeto: 100 },
    ],
  };
}

describe('GoSocketAdapter manejo de errores', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GOSOCKET_API_USER: 'usuario-test',
      GOSOCKET_API_PASSWORD: 'password-test',
    };
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('no expone el body crudo de errores HTTP del partner', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('password=secreto-real detalle interno', { status: 500 }),
    );

    try {
      await new GoSocketAdapter().emit(doc(), tenant);
      throw new Error('se esperaba BadGatewayException');
    } catch (error) {
      expect(error).toBeInstanceOf(BadGatewayException);
      const response = (error as BadGatewayException).getResponse();
      expect(JSON.stringify(response)).toContain('GOSOCKET_HTTP_500');
      expect(JSON.stringify(response)).not.toContain('secreto-real');
      expect(JSON.stringify(response)).not.toContain('detalle interno');
    }
    const loggedError = JSON.stringify(errorSpy.mock.calls);
    expect(loggedError).toContain('status=500');
    expect(loggedError).toContain('documentoId=DOC-1');
    expect(loggedError).not.toContain('secreto-real');
    expect(loggedError).not.toContain('detalle interno');
    const loggedOut = JSON.stringify(logSpy.mock.calls);
    expect(loggedOut).toContain('GOSOCKET OUTBOUND');
    expect(loggedOut).toContain('FileContent');
    expect(loggedOut).not.toContain('password-test');
    expect(loggedOut).not.toContain('Basic ');
  });

  it('sanitiza y trunca mensajes devueltos por GoSocket', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          Success: false,
          Messages: [`token=valor-secreto ${'x'.repeat(500)}`],
          Description: 'CAF no disponible',
        }),
        { status: 200 },
      ),
    );

    const result = await new GoSocketAdapter().emit(doc(), tenant);
    expect(result.result.status).toBe('REJECTED');
    expect(result.result.partnerRequest?.body.FileContent).toContain('<');
    expect(result.result.partnerHttpStatus).toBe(200);
    expect(result.result.messages.join(' ')).not.toContain('valor-secreto');
    expect(result.result.messages[0].length).toBeLessThanOrEqual(300);
    expect(result.result.partnerPayload?.Success).toBe(false);
    expect(JSON.stringify(result.result.partnerPayload)).not.toContain('valor-secreto');
  });

  it('envía RUT genérico SII al partner para receptor EX de exportación', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ Success: false, Messages: [] }), { status: 200 }),
    );
    const exportDoc = doc();
    exportDoc.receptor.rut = 'EX-US-CLIENT-123';
    exportDoc.indicadores = { exportacion: true, exento: true };

    await new GoSocketAdapter().emit(exportDoc, tenant);

    const request = fetchSpy.mock.calls[0][1];
    expect(request).toEqual(expect.objectContaining({ redirect: 'error' }));
    const body = JSON.parse(String(request?.body)) as { FileContent: string };
    expect(body.FileContent).toContain('<NroDocRecep>55555555-5</NroDocRecep>');
    expect(body.FileContent).not.toContain('EX-US-CLIENT-123');
  });

  it('envía BillerId, ValidateNumber y DefaultCertificate del portal y no llama si falta biller', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ Success: false, Messages: [] }), { status: 200 }),
    );
    const withBiller = doc();
    withBiller.source.billerId = '9a518154-b579-4d43-9cd8-af38762199c0';

    await new GoSocketAdapter().emit(withBiller, { ...tenant, billerId: undefined });

    const request = fetchSpy.mock.calls[0][1];
    const body = JSON.parse(String(request?.body)) as {
      BillerId: string;
      ValidateNumber: boolean;
      DefaultCertificate: boolean;
    };
    expect(body.BillerId).toBe('9a518154-b579-4d43-9cd8-af38762199c0');
    expect(body.ValidateNumber).toBe(false);
    expect(body.DefaultCertificate).toBe(false);

    fetchSpy.mockClear();
    const tenantSinBiller: TenantBillingConfig = { ...tenant, billerId: undefined };
    await expect(new GoSocketAdapter().emit(doc(), tenantSinBiller)).rejects.toThrow(/BillerID/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('usa el BillerId del canónico (Admin) aunque el tenant tenga otro', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ Success: true, GlobalDocumentId: '0' }), { status: 200 }),
    );
    const fromAdmin = doc();
    fromAdmin.source.billerId = '9a518154-b579-4d43-9cd8-af38762199c0';
    await new GoSocketAdapter().emit(fromAdmin, tenant);
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)) as { BillerId: string };
    expect(body.BillerId).toBe('9a518154-b579-4d43-9cd8-af38762199c0');
    expect(
      resolveGoSocketBillerId(
        { ...fromAdmin, source: { ...fromAdmin.source, billerId: undefined } },
        tenant,
      ),
    ).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('autentica con ApiUser de la sociedad y no con el del .env', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ Success: false, Messages: [] }), { status: 200 }),
    );
    const withAuth = doc();
    withAuth.source.apiUser = '00000000-0000-4000-8000-000000000002';
    withAuth.source.apiPassword = 'clave-alm';
    await new GoSocketAdapter().emit(withAuth, tenant);
    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    const expected = Buffer.from(
      '00000000-0000-4000-8000-000000000002:clave-alm',
      'utf8',
    ).toString('base64');
    expect(headers.Authorization).toBe(`Basic ${expected}`);
  });

  it('SendDocument con folio en OtherData queda PENDING; ACE solo por GetDocument', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          Success: true,
          GlobalDocumentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          OtherData: { Folio: 56, Country: 'cl' },
        }),
        { status: 200 },
      ),
    );
    const result = await new GoSocketAdapter().emit(doc(), tenant);
    expect(result.result.status).toBe('PENDING');
    expect(result.result.folioOficial).toBe('56');
    expect(result.result.globalDocumentId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('HTTP 200 con GlobalDocumentId 0 es REJECTED aunque Success sea true', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          Success: true,
          GlobalDocumentId: '00000000-0000-0000-0000-000000000000',
          Messages: ['no se puede encontrar información del archivo de rango de número'],
        }),
        { status: 200 },
      ),
    );

    const result = await new GoSocketAdapter().emit(doc(), tenant);
    expect(result.result.status).toBe('REJECTED');
    expect(result.result.globalDocumentId).toBeNull();
    expect(result.result.partnerHttpStatus).toBe(200);
  });
});

const QA_GID = 'ae352c22-6c9e-c6b1-6614-4bec8369dba7';

describe('GoSocketAdapter fetchArtifact', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GOSOCKET_API_USER: 'usuario-test',
      GOSOCKET_API_PASSWORD: 'password-test',
    };
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('decodifica PDF base64 una vez y pide type=pdf en sandbox', async () => {
    const pdf = Buffer.from('%PDF-1.4 hola-qa');
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          Name: 'folio-53.pdf',
          Base64Content: pdf.toString('base64'),
          Type: 'pdf',
        }),
        { status: 200 },
      ),
    );

    const art = await new GoSocketAdapter().fetchArtifact('pdf', QA_GID, 'sandbox');

    expect(art.body.equals(pdf)).toBe(true);
    expect(art.contentType).toBe('application/pdf');
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(fetchSpy.mock.calls[0][1]).toEqual(expect.objectContaining({ redirect: 'error' }));
    expect(url).toContain('developers-sbx.gosocket.net');
    expect(url).toContain('File/DownloadDocumentPdf');
    expect(url).toContain(`type=${GOSOCKET_CHILE_PDF_TYPE}`);
    expect(url).toContain(`GlobalDocumentId=${QA_GID}`);
    expect(url).not.toContain('distribution');
    expect(url).not.toContain('original');
    expect(url).not.toContain('developers.gosocket.net/sandbox');
    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logged).not.toContain(pdf.toString('base64'));
    expect(logged).not.toContain('password-test');
    expect(logged).not.toContain('Base64Content');
  });

  it('XML Chile usa type=xml y una sola decodificación', async () => {
    const xml = Buffer.from('<?xml version="1.0"?><DTE><Documento/></DTE>');
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          Name: 'folio-53.xml',
          Base64Content: xml.toString('base64'),
          Type: 'xml',
        }),
        { status: 200 },
      ),
    );

    const art = await new GoSocketAdapter().fetchArtifact('xml', QA_GID, 'sandbox');

    expect(art.body.equals(xml)).toBe(true);
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain('File/DownloadDocumentXml');
    expect(url).toContain(`type=${GOSOCKET_CHILE_XML_TYPE}`);
    expect(url).not.toContain('type=distribution');
    expect(url).not.toContain('type=original');
  });

  it('404 / does not exist no inventa dummy', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(
        JSON.stringify({
          Message: `Document with GlobalDocumentId (${QA_GID}) does not exist`,
        }),
        { status: 404 },
      ),
    );

    await expect(
      new GoSocketAdapter().fetchArtifact('pdf', QA_GID, 'sandbox'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      new GoSocketAdapter().fetchArtifact('pdf', QA_GID, 'sandbox'),
    ).rejects.toThrow(/aún no disponible/);
  });

  it('mensaje does not exist en HTTP 200 tampoco persiste archivo', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          Message: 'Document with GlobalDocumentId (00000000-0000-0000-0000-000000000000) does not exist',
        }),
        { status: 200 },
      ),
    );

    await expect(
      new GoSocketAdapter().fetchArtifact('xml', QA_GID, 'live'),
    ).rejects.toThrow(/aún no disponible/);
  });

  it('rechaza PDF enorme y no loguea Base64Content', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const huge = Buffer.alloc(GOSOCKET_PDF_MAX_BYTES + 1, 0x20);
    huge.write('%PDF', 0);
    try {
      assertArtifactLimits('pdf', huge);
      throw new Error('se esperaba BadGatewayException');
    } catch (error) {
      expect(error).toBeInstanceOf(BadGatewayException);
      expect(JSON.stringify((error as BadGatewayException).getResponse())).toContain(
        'GOSOCKET_ARTIFACT_TOO_LARGE',
      );
    }
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain('Base64Content');
  });

  it('rechaza URL que no sea host GoSocket https del mode', () => {
    const rejected = [
      'http://developers-sbx.gosocket.net/api/v1/File/DownloadDocumentPdf',
      'https://evil.example/api/v1/File/DownloadDocumentPdf',
      'https://169.254.169.254/latest/meta-data',
      'https://developers-sbx.gosocket.net/api/v1/File/DownloadDocumentPdf',
    ] as const;
    expect(() => assertGoSocketRequestUrl(rejected[0], 'sandbox')).toThrow(BadGatewayException);
    expect(() => assertGoSocketRequestUrl(rejected[1], 'sandbox')).toThrow(BadGatewayException);
    expect(() => assertGoSocketRequestUrl(rejected[2], 'sandbox')).toThrow(BadGatewayException);
    expect(() => assertGoSocketRequestUrl(rejected[3], 'live')).toThrow(BadGatewayException);
    expect(
      assertGoSocketRequestUrl(
        'https://developers-sbx.gosocket.net/api/v1/File/DownloadDocumentPdf?GlobalDocumentId=ae352c22-6c9e-c6b1-6614-4bec8369dba7&type=pdf',
        'sandbox',
      ).hostname,
    ).toBe('developers-sbx.gosocket.net');
    expect(
      assertGoSocketRequestUrl(
        'https://developers-sbx.gosocket.net/api/v1/Document/GetDocument',
        'sandbox',
      ).pathname,
    ).toBe('/api/v1/Document/GetDocument');
    expect(
      assertGoSocketRequestUrl(
        'https://developers-sbx.gosocket.net/api/v1/Document/ChangeDocumentStatus',
        'sandbox',
      ).pathname,
    ).toBe('/api/v1/Document/ChangeDocumentStatus');
  });

  it('GetDocument usa Country cl y RUT emisor sin puntos', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          Documents: [
            {
              Number: 54,
              NumberStr: '0000054',
              DocumentTags: [{ Code: 'AuthorityStatus', Value: '2' }],
              Notes: [{ Source: 'SII', Code: '0', Note: 'Recibido por el Sii' }],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const sync = await new GoSocketAdapter().fetchDocumentStatus(
      '4c2fe456-8eef-b47a-f082-c65d7d66529b',
      'sandbox',
      '77.032.638-9',
    );
    expect(sync.status).toBe('ACCEPTED');
    expect(sync.folioOficial).toBe('54');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://developers-sbx.gosocket.net/api/v1/Document/GetDocument',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: JSON.stringify({
          Country: 'cl',
          SenderCode: '77032638-9',
          GlobalDocumentId: '4c2fe456-8eef-b47a-f082-c65d7d66529b',
        }),
      }),
    );
  });

  it('GetDocument vacío no autorizado no se persiste como PENDING', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          Documents: [],
          Description: 'Unauthorized Action, empresa no autorizada',
        }),
        { status: 200 },
      ),
    );
    await expect(
      new GoSocketAdapter().fetchDocumentStatus(
        '4c2fe456-8eef-b47a-f082-c65d7d66529b',
        'sandbox',
        '77.032.638-9',
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('fetchReceivedDocuments valida RUT/fechas y llama a GetDocument con ReceiverCode', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          Documents: [
            {
              GlobalDocumentId: QA_GID,
              Number: 81,
              DocumentTags: [
                { Code: 'AuthorityStatus', Value: '2' },
                { Code: 'RUTEmisor', Value: '76.111.222-3' },
                { Code: 'MntTotal', Value: '119000' },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const list = await new GoSocketAdapter().fetchReceivedDocuments(
      { receiverRut: '77.032.638-9', desde: '2026-09-01', hasta: '2026-09-30' },
      'sandbox',
    );

    expect(list).toHaveLength(1);
    expect(list[0].globalDocumentId).toBe(QA_GID);
    expect(list[0].estado).toBe('PENDIENTE');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://developers-sbx.gosocket.net/api/v1/Document/GetDocument',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: JSON.stringify({
          Country: 'cl',
          ReceiverCode: '77032638-9',
          DateFrom: '2026-09-01',
          DateTo: '2026-09-30',
          ResultMaxItemCount: 200,
        }),
      }),
    );
  });

  it('fetchReceivedDocuments autentica con el ApiUser de la empresa, no el global', async () => {
    process.env.GOSOCKET_API_USER = 'user-export';
    process.env.GOSOCKET_API_PASSWORD = 'pass-export';
    process.env.GOSOCKET_API_USER_ALMAHUE_EMP_SERVICES = 'user-alm';
    process.env.GOSOCKET_API_PASSWORD_ALMAHUE_EMP_SERVICES = 'pass-alm';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ Documents: [] }), { status: 200 }),
    );

    await new GoSocketAdapter().fetchReceivedDocuments(
      { receiverRut: '77.032.639-7', desde: '2026-09-01', hasta: '2026-09-23' },
      'sandbox',
      { erpId: 'almahue', empresaId: 'EMP-SERVICES' },
    );

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const authorization = (init.headers as Record<string, string>).Authorization;
    const decoded = Buffer.from(authorization.replace(/^Basic /, ''), 'base64').toString('utf8');
    expect(decoded).toBe('user-alm:pass-alm');
  });

  it('fetchReceivedDocuments rechaza RUT receptor inválido sin llamar a GoSocket', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(
      new GoSocketAdapter().fetchReceivedDocuments(
        { receiverRut: 'no-es-rut', desde: '2026-09-01', hasta: '2026-09-30' },
        'sandbox',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetchReceivedDocuments rechaza fechas con formato inválido', async () => {
    await expect(
      new GoSocketAdapter().fetchReceivedDocuments(
        { receiverRut: '77.032.638-9', desde: '01-09-2026', hasta: '2026-09-30' },
        'sandbox',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fetchReceivedDocuments mapea 401 a GOSOCKET_AUTH (BadGateway) sin exponer el body', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid authentication credentials' }), { status: 401 }),
    );
    await expect(
      new GoSocketAdapter().fetchReceivedDocuments(
        { receiverRut: '77.032.638-9', desde: '2026-09-01', hasta: '2026-09-30' },
        'sandbox',
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('fetchReceivedDocuments con Documents vacío + empresa no autorizada lanza BadGateway (no lista vacía)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ Documents: [], Description: 'Unauthorized Action, empresa no autorizada' }),
        { status: 200 },
      ),
    );
    await expect(
      new GoSocketAdapter().fetchReceivedDocuments(
        { receiverRut: '77.032.638-9', desde: '2026-09-01', hasta: '2026-09-30' },
        'sandbox',
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('changeDocumentStatus (evento 30, Acuse de Recibo) llama a ChangeDocumentStatus con Status/Note', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ Success: true, Code: 'OK', Description: 'Procesado' }), { status: 200 }),
    );

    const result = await new GoSocketAdapter().changeDocumentStatus(
      QA_GID,
      GOSOCKET_EVENT_ACUSE_RECIBO,
      'sandbox',
      'Aceptación vía ERP Almahue',
    );

    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://developers-sbx.gosocket.net/api/v1/Document/ChangeDocumentStatus',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: JSON.stringify({
          GlobalDocumentId: QA_GID,
          Status: GOSOCKET_EVENT_ACUSE_RECIBO,
          Note: 'Aceptación vía ERP Almahue',
        }),
      }),
    );
  });

  it('changeDocumentStatus rechaza código de evento inválido sin llamar a GoSocket', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(
      new GoSocketAdapter().changeDocumentStatus(QA_GID, 99, 'sandbox'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('changeDocumentStatus rechaza GlobalDocumentId inválido sin llamar a GoSocket', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(
      new GoSocketAdapter().changeDocumentStatus('', GOSOCKET_EVENT_ACEPTACION, 'sandbox'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('changeDocumentStatus con Success:false devuelve resultado sin lanzar (rechazo del partner, no un error de transporte)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ Success: false, Description: 'Evento no aplica para el estado actual del documento' }),
        { status: 200 },
      ),
    );

    const result = await new GoSocketAdapter().changeDocumentStatus(
      QA_GID,
      GOSOCKET_EVENT_RECLAMO,
      'sandbox',
    );
    expect(result.success).toBe(false);
    expect(result.description).toContain('no aplica');
  });

  it('changeDocumentStatus usa timeout de 6 minutos (evento 30 puede tardar ~4 min)', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ Success: true }), { status: 200 }),
    );
    await new GoSocketAdapter().changeDocumentStatus(QA_GID, GOSOCKET_EVENT_ACUSE_RECIBO, 'sandbox');
    expect(setTimeoutSpy.mock.calls.some((call) => call[1] === 6 * 60_000)).toBe(true);
  });

  it('changeDocumentStatus mapea HTTP 500 a BadGateway sin exponer el body', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('password=secreto-real detalle interno', { status: 500 }),
    );
    await expect(
      new GoSocketAdapter().changeDocumentStatus(QA_GID, GOSOCKET_EVENT_ACUSE_RECIBO, 'sandbox'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('decodeGoSocketFile exige una sola capa base64 y magia PDF/XML', () => {
    const pdf = Buffer.from('%PDF-1.4 x');
    expect(
      decodeGoSocketFile({ Base64Content: pdf.toString('base64') }, 'pdf').equals(pdf),
    ).toBe(true);
    expect(() =>
      decodeGoSocketFile({ Base64Content: Buffer.from('no-es-pdf').toString('base64') }, 'pdf'),
    ).toThrow();
    expect(() => decodeGoSocketFile({ Base64Content: '' }, 'xml')).toThrow(/aún no disponible/);
  });
});
