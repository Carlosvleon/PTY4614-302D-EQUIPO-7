'use strict';

/**
 * Regenera la colección Postman de emisiones ALM ↔ Export.
 * Uso: node postman/generate-postman.cjs
 * Las claves van en Almahue-DTE.local.postman_environment.json (gitignored).
 */
const { writeFileSync } = require('fs');
const { join } = require('path');
const { buildGufXml } = require('../dist/adapters/gosocket/guf-mapper');

const EXPORT = {
  empresaId: 'EMP-EXPORT',
  rut: '77.032.638-9',
  razon: 'ALMAHUE EXPORT SPA',
  giro: 'Exportacion de fruta fresca y servicios de packing',
  direccion: 'Camino Fundo El Maiten 1200',
  comuna: 'San Fernando',
  ciudad: 'San Fernando',
  billerId: 'd159916d-4977-499f-a52e-70550fc379ee',
  nroResolucion: '0',
  fechaResolucion: '2024-10-11',
  acteco: '461001',
};

const ALM = {
  empresaId: 'EMP-SERVICES',
  rut: '77.032.639-7',
  razon: 'ALM SERVICES SPA',
  giro: 'Servicios logisticos, transporte y soporte operacional',
  direccion: 'Av. Logistica 845, Modulo B',
  comuna: 'Renca',
  ciudad: 'Santiago',
  billerId: 'eda79c0c-8771-4a84-8c95-ef700ecc67c9',
  nroResolucion: '0',
  fechaResolucion: '2020-02-14',
  acteco: '016100',
};

function canonical(emisor, receptor, folio) {
  return {
    schemaVersion: '1.0',
    idempotencyKey: `almahue:${emisor.empresaId}:${folio}:1`,
    source: {
      erpId: 'almahue',
      empresaId: emisor.empresaId,
      documentoId: folio,
      billerId: emisor.billerId,
    },
    emisor: {
      rut: emisor.rut,
      razonSocial: emisor.razon,
      giro: emisor.giro,
      direccion: emisor.direccion,
      comuna: emisor.comuna,
      ciudad: emisor.ciudad,
      nroResolucion: emisor.nroResolucion,
      fechaResolucion: emisor.fechaResolucion,
      acteco: emisor.acteco,
    },
    receptor: {
      rut: receptor.rut,
      razonSocial: receptor.razon,
      giro: receptor.giro,
      direccion: receptor.direccion,
      comuna: receptor.comuna,
      ciudad: receptor.ciudad,
    },
    documento: {
      tipoDte: 33,
      fechaEmision: '2026-09-17',
      formaPago: 'CREDITO',
      moneda: 'CLP',
      numeroInterno: folio,
    },
    totales: { neto: 10000, exento: 0, iva: 1900, tasaIva: 19, total: 11900 },
    lineas: [
      {
        nro: 1,
        descripcion: 'QA intercompany pallet',
        cantidad: 1,
        unidad: 'UN',
        precio: 10000,
        descuentoPct: 0,
        montoNeto: 10000,
      },
    ],
    glosas: [],
    indicadores: { exportacion: false, exento: false },
  };
}

function gufTemplate(emisor, receptor, placeholder) {
  return buildGufXml(canonical(emisor, receptor, placeholder));
}

function gosocketPre(userVar, passVar, gufReadyVar, billerVar) {
  return [
    `const user = pm.environment.get('${userVar}');`,
    `const pass = pm.environment.get('${passVar}');`,
    "pm.variables.set('gosocket_basic', btoa(user + ':' + pass));",
    `let xml = pm.collectionVariables.get('${gufReadyVar}') || '';`,
    "xml = xml.replace(/<(GiroRecep)>([^<]*)<\\/\\1>/g, function (_, tag, val) {",
    "  return '<' + tag + '>' + String(val).slice(0, 40) + '</' + tag + '>';",
    '});',
    'const payload = {',
    '  FileContent: xml,',
    "  Async: true,",
    "  Mapping: '11111111-1111-1111-1111-111111111111',",
    '  Sign: true,',
    '  DefaultCertificate: false,',
    '  IgnoreDownWorkload: false,',
    `  BillerId: pm.environment.get('${billerVar}'),`,
    '  ValidateNumber: false',
    '};',
    "pm.variables.set('gosocket_payload', JSON.stringify(payload));",
  ];
}

function gosocketSaveGid(senderCode) {
  return [
    'try {',
    '  const json = pm.response.json();',
    "  const gid = json.GlobalDocumentId || json.globalDocumentId || (json.Documents && json.Documents[0] && json.Documents[0].GlobalDocumentId);",
    '  if (gid) {',
    "    pm.environment.set('global_document_id', String(gid));",
    `    pm.environment.set('sender_code', '${senderCode}');`,
    '  }',
    '} catch (e) {}',
  ];
}

function getDocumentPre() {
  return [
    "const sender = String(pm.environment.get('sender_code') || '').replace(/[.\\s]/g, '');",
    "const useAlm = sender === '77032639-7';",
    "const user = pm.environment.get(useAlm ? 'alm_api_user' : 'export_api_user');",
    "const pass = pm.environment.get(useAlm ? 'alm_api_password' : 'export_api_password');",
    "pm.variables.set('gosocket_basic', btoa(String(user) + ':' + String(pass)));",
    "if (!pm.environment.get('global_document_id')) {",
    "  console.warn('global_document_id vacío: primero SendDocument (el test script lo guarda).');",
    '}',
  ];
}

function getDocumentListPre(userVar, passVar) {
  return [
    `const user = pm.environment.get('${userVar}');`,
    `const pass = pm.environment.get('${passVar}');`,
    "pm.variables.set('gosocket_basic', btoa(String(user) + ':' + String(pass)));",
  ];
}

function requestJson(name, url, header, rawBody) {
  return {
    name,
    request: {
      method: 'POST',
      header,
      body: { mode: 'raw', raw: rawBody, options: { raw: { language: 'json' } } },
      url,
    },
    response: [],
  };
}

const headerGoSocket = [
  { key: 'Authorization', value: 'Basic {{gosocket_basic}}', type: 'text' },
  { key: 'Content-Type', value: 'application/json', type: 'text' },
  { key: 'Accept', value: 'application/json', type: 'text' },
];

function getDocumentListItem(name, userVar, passVar, senderCode, receiverCode, description) {
  return {
    name,
    event: [
      {
        listen: 'prerequest',
        script: {
          type: 'text/javascript',
          exec: getDocumentListPre(userVar, passVar),
        },
      },
    ],
    request: {
      method: 'POST',
      header: headerGoSocket,
      body: {
        mode: 'raw',
        raw: JSON.stringify(
          {
            Country: 'cl',
            SenderCode: senderCode,
            ReceiverCode: receiverCode,
            DateFrom: '{{date_from}}',
            DateTo: '{{date_to}}',
            ResultMaxItemCount: 50,
          },
          null,
          2,
        ),
        options: { raw: { language: 'json' } },
      },
      url: '{{gosocket_base}}/Document/GetDocument',
      description,
    },
  };
}

function getReceivedDocumentItem(name, userVar, passVar, accountCode, description) {
  return {
    name,
    event: [
      {
        listen: 'prerequest',
        script: {
          type: 'text/javascript',
          exec: getDocumentListPre(userVar, passVar),
        },
      },
    ],
    request: {
      method: 'GET',
      header: [
        { key: 'Authorization', value: 'Basic {{gosocket_basic}}', type: 'text' },
        { key: 'Accept', value: 'application/json', type: 'text' },
      ],
      url: `{{gosocket_base}}/Document/GetReceivedDocument?AccountCode=${accountCode}`,
      description,
    },
  };
}

const headerGateway = [
  { key: 'X-Billing-Api-Key', value: '{{billing_api_key}}', type: 'text' },
  { key: 'Content-Type', value: 'application/json', type: 'text' },
  { key: 'Accept', value: 'application/json', type: 'text' },
];

const gatewayUrl = '{{gateway_base}}/v1/emissions';

function canonicalWithAuth(emisor, receptor, folio, userVar, passVar) {
  const doc = canonical(emisor, receptor, folio);
  doc.source.apiUser = `{{${userVar}}}`;
  doc.source.apiPassword = `{{${passVar}}}`;
  doc.idempotencyKey = `postman:{{$guid}}`;
  doc.source.documentoId = `postman-{{$timestamp}}`;
  doc.documento.numeroInterno = `PM-{{$timestamp}}`;
  return JSON.stringify(doc, null, 2);
}

const almGuf = gufTemplate(ALM, EXPORT, 'NUMERO_INTERNO');
const exportGuf = gufTemplate(EXPORT, ALM, 'NUMERO_INTERNO');

const collection = {
  info: {
    name: 'Almahue DTE — emisiones entre sociedades (sandbox)',
    description:
      'Factura 33 ALM SERVICES SPA ↔ ALMAHUE EXPORT SPA.\n\n1) Importa esta colección y el environment.\n2) Copia Almahue-DTE.postman_environment.example.json → Almahue-DTE.local.postman_environment.json y pega claves.\n3) Selecciona el environment local.\n\nCarpeta GoSocket: llama directo a developers-sbx (ApiUser de la sociedad emisora).\nCarpeta billing-gateway: POST /v1/emissions (canónico). El adapter usa source.apiUser/apiPassword de ese body; no pisa el .env de Export.\n\nBillerId y CAE/Acteco van en el payload (equivalente a Admin › Empresas). Las ApiKeys NO van en el ERP.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  event: [
    {
      listen: 'prerequest',
      script: {
        type: 'text/javascript',
        exec: [
          "const stamp = String(Date.now());",
          "const clipGiroRecep = (xml) => String(xml).replace(/<(GiroRecep)>([^<]*)<\\/\\1>/g, (_, tag, val) => '<' + tag + '>' + String(val).slice(0, 40) + '</' + tag + '>');",
          "const almTpl = clipGiroRecep(pm.collectionVariables.get('guf_alm_to_export') || '');",
          "const expTpl = clipGiroRecep(pm.collectionVariables.get('guf_export_to_alm') || '');",
          "pm.collectionVariables.set('guf_alm_to_export_ready', almTpl.replaceAll('NUMERO_INTERNO', 'PM-' + stamp));",
          "pm.collectionVariables.set('guf_export_to_alm_ready', expTpl.replaceAll('NUMERO_INTERNO', 'PM-' + stamp));",
        ],
      },
    },
  ],
  variable: [
    { key: 'guf_alm_to_export', value: almGuf },
    { key: 'guf_export_to_alm', value: exportGuf },
  ],
  item: [
    {
      name: '0. Health',
      item: [
        {
          name: 'billing-gateway health',
          request: {
            method: 'GET',
            header: [],
            url: '{{gateway_base}}/health',
          },
        },
      ],
    },
    {
      name: '1. GoSocket sandbox (ApiKey de la emisora)',
      item: [
        {
          name: 'ALM SERVICES → ALMAHUE EXPORT',
          event: [
            {
              listen: 'prerequest',
              script: {
                type: 'text/javascript',
                exec: gosocketPre('alm_api_user', 'alm_api_password', 'guf_alm_to_export_ready', 'alm_biller_id'),
              },
            },
            {
              listen: 'test',
              script: {
                type: 'text/javascript',
                exec: gosocketSaveGid('77032639-7'),
              },
            },
          ],
          request: {
            method: 'POST',
            header: headerGoSocket,
            body: {
              mode: 'raw',
              raw: '{{gosocket_payload}}',
              options: { raw: { language: 'json' } },
            },
            url: '{{gosocket_base}}/Document/SendDocumentToAuthority',
            description: 'Emisor ALM (77.032.639-7). Basic = ApiKey ALM. BillerId ALM.',
          },
        },
        {
          name: 'ALMAHUE EXPORT → ALM SERVICES',
          event: [
            {
              listen: 'prerequest',
              script: {
                type: 'text/javascript',
                exec: gosocketPre('export_api_user', 'export_api_password', 'guf_export_to_alm_ready', 'export_biller_id'),
              },
            },
            {
              listen: 'test',
              script: {
                type: 'text/javascript',
                exec: gosocketSaveGid('77032638-9'),
              },
            },
          ],
          request: {
            method: 'POST',
            header: headerGoSocket,
            body: {
              mode: 'raw',
              raw: '{{gosocket_payload}}',
              options: { raw: { language: 'json' } },
            },
            url: '{{gosocket_base}}/Document/SendDocumentToAuthority',
            description: 'Emisor Export (77.032.638-9). Basic = ApiKey Export. BillerId Export.',
          },
        },
        {
          name: 'GetDocument (tras emitir)',
          event: [
            {
              listen: 'prerequest',
              script: {
                type: 'text/javascript',
                exec: getDocumentPre(),
              },
            },
          ],
          request: {
            method: 'POST',
            header: headerGoSocket,
            body: {
              mode: 'raw',
              raw: JSON.stringify(
                {
                  Country: 'cl',
                  SenderCode: '{{sender_code}}',
                  GlobalDocumentId: '{{global_document_id}}',
                },
                null,
                2,
              ),
              options: { raw: { language: 'json' } },
            },
            url: '{{gosocket_base}}/Document/GetDocument',
            description:
              'Corré primero SendDocument: el test script guarda global_document_id y sender_code. GetDocument usa la ApiKey de esa emisora (ALM 77032639-7 / Export 77032638-9).',
          },
        },
        getDocumentListItem(
          'GetDocument listado Export → ALM (77.032.638-9)',
          'export_api_user',
          'export_api_password',
          '77032638-9',
          '77032639-7',
          'POST GetDocument. Emisor Export, receptor ALM. Rango máximo un mes (date_from / date_to). No hace falta GID. Basic = ApiKey Export.',
        ),
        getDocumentListItem(
          'GetDocument listado ALM → Export (77.032.639-7)',
          'alm_api_user',
          'alm_api_password',
          '77032639-7',
          '77032638-9',
          'POST GetDocument. Emisor ALM, receptor Export. Rango máximo un mes (date_from / date_to). No hace falta GID. Basic = ApiKey ALM.',
        ),
        getReceivedDocumentItem(
          'GetReceivedDocument ALM (77.032.639-7)',
          'alm_api_user',
          'alm_api_password',
          '77032639-7',
          'GET bandeja XML pendientes de ALM. No pide RUT de emisor. Vacío = No contiene XMLs hasta que Gosocket distribuya. Tras leer: ConfirmReceivedDocument.',
        ),
        getReceivedDocumentItem(
          'GetReceivedDocument Export (77.032.638-9)',
          'export_api_user',
          'export_api_password',
          '77032638-9',
          'GET bandeja XML pendientes de Export. No pide RUT de emisor. Vacío = No contiene XMLs hasta que Gosocket distribuya. Tras leer: ConfirmReceivedDocument.',
        ),
      ],
    },
    {
      name: '2. billing-gateway (canónico ERP)',
      item: [
        requestJson(
          'ALM SERVICES → ALMAHUE EXPORT',
          gatewayUrl,
          headerGateway,
          canonicalWithAuth(ALM, EXPORT, 'PM-ALM', 'alm_api_user', 'alm_api_password'),
        ),
        requestJson(
          'ALMAHUE EXPORT → ALM SERVICES',
          gatewayUrl,
          headerGateway,
          canonicalWithAuth(EXPORT, ALM, 'PM-EXP', 'export_api_user', 'export_api_password'),
        ),
      ],
    },
  ],
};

function envValues() {
  return {
    name: 'Almahue DTE example (sin secretos)',
    values: [
      { key: 'gosocket_base', value: 'https://developers-sbx.gosocket.net/api/v1', enabled: true },
      { key: 'gateway_base', value: 'http://127.0.0.1:3040', enabled: true },
      { key: 'billing_api_key', value: '', enabled: true },
      { key: 'export_biller_id', value: EXPORT.billerId, enabled: true },
      { key: 'alm_biller_id', value: ALM.billerId, enabled: true },
      { key: 'export_api_user', value: '', enabled: true },
      { key: 'export_api_password', value: '', enabled: true },
      { key: 'alm_api_user', value: '', enabled: true },
      { key: 'alm_api_password', value: '', enabled: true },
      { key: 'global_document_id', value: '', enabled: true },
      { key: 'sender_code', value: '77032639-7', enabled: true },
      { key: 'date_from', value: '2026-09-01', enabled: true },
      { key: 'date_to', value: '2026-09-17', enabled: true },
    ],
    _postman_variable_scope: 'environment',
  };
}

const dir = __dirname;
writeFileSync(join(dir, 'Almahue-DTE.postman_collection.json'), JSON.stringify(collection, null, 2));
writeFileSync(
  join(dir, 'Almahue-DTE.postman_environment.example.json'),
  JSON.stringify(envValues(), null, 2),
);
console.log('Wrote postman collection + example environment');
