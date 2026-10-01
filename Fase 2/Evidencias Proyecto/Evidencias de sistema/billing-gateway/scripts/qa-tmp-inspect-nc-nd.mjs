import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'path';

const db = new DatabaseSync(resolve('data/emissions.sqlite'));
const rows = db.prepare(`
  SELECT canonical_json, result_json
  FROM emissions
  WHERE json_extract(canonical_json, '$.documento.tipoDte') IN (111, 112)
  ORDER BY rowid DESC LIMIT 4
`).all();
for (const row of rows) {
  const c = JSON.parse(row.canonical_json);
  const r = JSON.parse(row.result_json);
  console.log({
    tipo: c.documento.tipoDte,
    ref: c.documento.referencia,
    unidad: c.lineas?.[0]?.unidad,
    status: r.status,
    folio: r.folioOficial,
    gid: r.globalDocumentId,
    disclaimer: String(r.disclaimer || r.messages || '').slice(0, 180),
  });
}
