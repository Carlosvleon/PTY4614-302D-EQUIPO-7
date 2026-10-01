import {
  chileSenderCode,
  disclaimerFromDocumentStatus,
  GetDocumentInconclusiveError,
  mapChangeDocumentStatusResponse,
  parseChangeDocumentStatusBody,
  mapGetDocumentToPurchaseList,
  mapGetDocumentToStatus,
  normalizeFolioOficial,
} from './document-status';

describe('document-status Chile GetDocument', () => {
  it('normaliza SenderCode sin puntos', () => {
    expect(chileSenderCode('77.032.638-9')).toBe('77032638-9');
    expect(chileSenderCode(' 77032638-9 ')).toBe('77032638-9');
  });

  it('folio 54 AuthorityStatus 2 es ACE aunque la nota sea Recibido', () => {
    const sync = mapGetDocumentToStatus({
      Documents: [
        {
          Number: 54,
          NumberStr: '0000054',
          SeriesNumber: '0000054',
          ExternalId: '10037771',
          DocumentTags: [{ Code: 'AuthorityStatus', Value: '2' }],
          Notes: [
            {
              Source: 'SII',
              Code: '0',
              Note: 'Recibido por el Sii, TrackId: 257173516',
            },
          ],
        },
      ],
    });
    expect(sync.status).toBe('ACCEPTED');
    expect(sync.folioOficial).toBe('54');
    expect(sync.authorityStatus).toBe('2');
    expect(sync.messages[0]).toMatch(/TrackId: 257173516/);
    expect(disclaimerFromDocumentStatus(sync)).toContain('Folio oficial 54');
  });

  it('folio 53 AuthorityStatus 3 + nota RCH es rechazo SII', () => {
    const sync = mapGetDocumentToStatus({
      Documents: [
        {
          Number: 53,
          NumberStr: '0000053',
          DocumentTags: [{ Code: 'AuthorityStatus', Value: '3' }],
          Notes: [
            { Source: 'SII', Code: '0', Note: 'Recibido por el Sii, TrackId: 257152688' },
            {
              Source: 'SII',
              Code: 'RCH',
              Note: '(HED-3-845) RECHAZO- DTE Sin Direccion del Receptor. password=secreto',
            },
          ],
        },
      ],
    });
    expect(sync.status).toBe('REJECTED');
    expect(sync.folioOficial).toBe('53');
    expect(sync.messages.join(' ')).toMatch(/HED-3-845/);
    expect(sync.messages.join(' ')).not.toContain('secreto');
    expect(disclaimerFromDocumentStatus(sync)).toMatch(/HED-3-845|rechaz/i);
  });

  it('Documents vacío sin error queda PENDING y no inventa folio', () => {
    const sync = mapGetDocumentToStatus({ Documents: [] });
    expect(sync.status).toBe('PENDING');
    expect(sync.folioOficial).toBeNull();
  });

  it('Documents vacío con empresa no autorizada no se trata como PENDING', () => {
    expect(() => mapGetDocumentToStatus({
      Documents: [],
      Description: 'Unauthorized Action, empresa no autorizada',
    })).toThrow(GetDocumentInconclusiveError);
  });

  it('no toma un DTE cuyo GID no coincide con el consultado', () => {
    expect(() => mapGetDocumentToStatus({
      Documents: [
        {
          Number: 99,
          GlobalDocumentId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          DocumentTags: [{ Code: 'AuthorityStatus', Value: '2' }],
        },
      ],
    }, '4c2fe456-8eef-b47a-f082-c65d7d66529b')).toThrow(GetDocumentInconclusiveError);
  });

  it('amarra el DTE al GID consultado si vienen varios', () => {
    const sync = mapGetDocumentToStatus({
      Documents: [
        {
          Number: 99,
          GlobalDocumentId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          DocumentTags: [{ Code: 'AuthorityStatus', Value: '2' }],
        },
        {
          Number: 54,
          GlobalDocumentId: '4c2fe456-8eef-b47a-f082-c65d7d66529b',
          DocumentTags: [{ Code: 'AuthorityStatus', Value: '2' }],
        },
      ],
    }, '4c2fe456-8eef-b47a-f082-c65d7d66529b');
    expect(sync.status).toBe('ACCEPTED');
    expect(sync.folioOficial).toBe('54');
  });

  it('nota RCH gana aunque el tag diga 2', () => {
    const sync = mapGetDocumentToStatus({
      Documents: [
        {
          Number: 10,
          DocumentTags: [{ Code: 'AuthorityStatus', Value: '2' }],
          Notes: [{ Source: 'SII', Code: 'RCH', Note: 'RECHAZO' }],
        },
      ],
    });
    expect(sync.status).toBe('REJECTED');
  });

  it('normaliza folio con ceros a la izquierda', () => {
    expect(normalizeFolioOficial(undefined, '0000054', '0000054')).toBe('54');
    expect(normalizeFolioOficial(54, '0000054', null)).toBe('54');
  });
});

describe('mapGetDocumentToPurchaseList (compras, GetDocument por ReceiverCode)', () => {
  const baseTags = [
    { Code: 'RUTEmisor', Value: '76.111.222-3' },
    { Code: 'RznSoc', Value: 'Proveedor Demo SPA' },
    { Code: 'FchEmis', Value: '2026-09-01' },
    { Code: 'MntNeto', Value: '100000' },
    { Code: 'IVA', Value: '19000' },
    { Code: 'MntTotal', Value: '119000' },
  ];

  it('documento con AuthorityStatus 2 y sin reclamo queda PENDIENTE (aún no hay ACD)', () => {
    const [row] = mapGetDocumentToPurchaseList({
      Documents: [
        {
          GlobalDocumentId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          Number: 81,
          DocumentTags: [...baseTags, { Code: 'AuthorityStatus', Value: '2' }],
        },
      ],
    });
    expect(row.globalDocumentId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(row.folioOficial).toBe('81');
    expect(row.emisorRut).toBe('76.111.222-3');
    expect(row.emisorRazonSocial).toBe('Proveedor Demo SPA');
    expect(row.montoNeto).toBe(100000);
    expect(row.montoIva).toBe(19000);
    expect(row.montoTotal).toBe(119000);
    expect(row.authorityStatus).toBe('2');
    expect(row.estado).toBe('PENDIENTE');
    expect(row.rechazoOrigen).toBeNull();
  });

  it('tag ACD de aceptación marca el documento como ACEPTADO', () => {
    const [row] = mapGetDocumentToPurchaseList({
      Documents: [
        {
          GlobalDocumentId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          Number: 82,
          DocumentTags: [...baseTags, { Code: 'AuthorityStatus', Value: '2' }, { Code: 'ACD', Value: 'ACEPTADO' }],
        },
      ],
    });
    expect(row.estado).toBe('ACEPTADO');
    expect(row.rechazoOrigen).toBeNull();
  });

  it('AuthorityStatus 3 (rechazo SII) prevalece sobre cualquier ACD', () => {
    const [row] = mapGetDocumentToPurchaseList({
      Documents: [
        {
          GlobalDocumentId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
          Number: 83,
          DocumentTags: [...baseTags, { Code: 'AuthorityStatus', Value: '3' }],
          Notes: [{ Source: 'SII', Code: 'RCH', Note: 'DTE Sin Direccion del Receptor' }],
        },
      ],
    });
    expect(row.estado).toBe('RECHAZADO');
    expect(row.rechazoOrigen).toBe('SII');
    expect(row.rechazoMotivo).toMatch(/Sin Direccion/);
  });

  it('tag ACD de reclamo comercial (sin rechazo SII) marca RECHAZADO/COMERCIAL', () => {
    const [row] = mapGetDocumentToPurchaseList({
      Documents: [
        {
          GlobalDocumentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          Number: 84,
          DocumentTags: [...baseTags, { Code: 'AuthorityStatus', Value: '2' }, { Code: 'ACD', Value: 'RECLAMO' }],
        },
      ],
    });
    expect(row.estado).toBe('RECHAZADO');
    expect(row.rechazoOrigen).toBe('COMERCIAL');
  });

  it('documentos sin GlobalDocumentId/CountryDocumentId se omiten de la lista', () => {
    const rows = mapGetDocumentToPurchaseList({
      Documents: [
        { Number: 85, DocumentTags: baseTags },
        { GlobalDocumentId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', Number: 86, DocumentTags: baseTags },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].folioOficial).toBe('86');
  });

  it('Documents vacío devuelve lista vacía sin lanzar', () => {
    expect(mapGetDocumentToPurchaseList({ Documents: [] })).toEqual([]);
  });

  it('empresa no autorizada lanza GetDocumentInconclusiveError (no lista vacía silenciosa)', () => {
    expect(() =>
      mapGetDocumentToPurchaseList({ Documents: [], Description: 'Unauthorized Action, empresa no autorizada' }),
    ).toThrow(GetDocumentInconclusiveError);
  });
});

describe('parseChangeDocumentStatusBody', () => {
  it('vacío o BOM devuelve objeto vacío', () => {
    expect(parseChangeDocumentStatusBody('')).toEqual({});
    expect(parseChangeDocumentStatusBody('\uFEFF  ')).toEqual({});
  });
});

describe('mapChangeDocumentStatusResponse (ChangeDocumentStatus)', () => {
  it('Success como string "true" también cuenta como éxito', () => {
    expect(mapChangeDocumentStatusResponse({ Success: 'true' }).success).toBe(true);
  });

  it('Success true mapea success/code/description', () => {
    const result = mapChangeDocumentStatusResponse({
      Success: true,
      Code: 'OK',
      Description: 'Evento procesado',
      Messages: [],
    });
    expect(result).toEqual({ success: true, code: 'OK', description: 'Evento procesado', messages: [] });
  });

  it('Success false con Messages sanitiza y trunca a 10', () => {
    const messages = Array.from({ length: 15 }, (_, i) => `token=secreto-${i} mensaje ${i}`);
    const result = mapChangeDocumentStatusResponse({
      Success: false,
      Description: 'Evento rechazado',
      Messages: messages,
    });
    expect(result.success).toBe(false);
    expect(result.messages).toHaveLength(10);
    expect(result.messages.join(' ')).not.toContain('secreto');
  });

  it('respuesta no-objeto (undefined/array) no lanza y devuelve success:false', () => {
    expect(mapChangeDocumentStatusResponse(undefined)).toEqual({
      success: false,
      code: null,
      description: null,
      messages: [],
    });
    expect(mapChangeDocumentStatusResponse([1, 2, 3])).toEqual({
      success: false,
      code: null,
      description: null,
      messages: [],
    });
  });

  it('Messages como string único también se sanitiza', () => {
    const result = mapChangeDocumentStatusResponse({ Success: false, Messages: 'password=secreto no autorizado' });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).not.toContain('secreto');
  });
});
