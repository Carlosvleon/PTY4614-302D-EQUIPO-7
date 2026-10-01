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
const r = JSON.parse(row.result_json);
console.log('gid', r.globalDocumentId, 'status', r.status, 'folio', r.folioOficial);
const guf = buildGufXml(JSON.parse(row.canonical_json));
const i = guf.indexOf("name='OtrMnda'");
console.log('guf_otrmnda', i >= 0 ? guf.slice(i, i + 80) : 'MISSING');
const om = guf.indexOf('<OtraMoneda>');
console.log('guf_otra', om >= 0 ? guf.slice(om, om + 220) : 'MISSING');
const sii = String(row.xml ?? '');
console.log('sii_len', sii.length);
const m = sii.match(/<OtraMoneda>[\s\S]{0,500}<\/OtraMoneda>/);
console.log('sii_otra', m ? m[0] : (sii.includes('OtraMoneda') ? 'partial' : 'no OtraMoneda in stored xml'));
console.log('sii_tpo', sii.match(/<TpoMoneda>[^<]*<\/TpoMoneda>/g));
