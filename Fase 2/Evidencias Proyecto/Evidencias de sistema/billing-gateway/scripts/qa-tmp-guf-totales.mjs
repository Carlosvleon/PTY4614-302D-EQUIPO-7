import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'path';
import { buildGufXml } from '../dist/adapters/gosocket/guf-mapper.js';

const db = new DatabaseSync(resolve('data/emissions.sqlite'));
const row = db.prepare(`
  SELECT canonical_json, xml, result_json
  FROM emissions
  WHERE json_extract(canonical_json, '$.documento.tipoDte') = 110
  ORDER BY rowid DESC LIMIT 1
`).get();
const canonical = JSON.parse(row.canonical_json);
const guf = buildGufXml(canonical);
const tot = guf.indexOf('<Totales>');
console.log('--- GUF Totales ---');
console.log(guf.slice(tot, tot + 900));
const sii = String(row.xml ?? '');
console.log('--- SII Totales ---');
console.log(sii.includes('<Totales>') ? sii.slice(sii.indexOf('<Totales>'), sii.indexOf('<Totales>') + 400) : '(sin xml)');
const r = JSON.parse(row.result_json);
console.log('gid', r.globalDocumentId, 'status', r.status, 'folio', r.folioOficial);
