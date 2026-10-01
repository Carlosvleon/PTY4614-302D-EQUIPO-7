import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { buildXlsxBytes } from './exportTable.ts';
import { parseCodigoNombreWorkbook } from '../../../erp_back/src/modules/catalogos/catalog-excel.util.ts';

const require = createRequire(import.meta.url);
const XLSX = require('../../../erp_back/node_modules/xlsx');

test('la plantilla es un xlsx real y el parser lee la hoja', () => {
  const bytes = buildXlsxBytes('Centros de costo', [
    ['Plantilla de una sola hoja. Complete las filas debajo del encabezado.'],
    ['Código', 'Nombre', 'Contacto', 'Activa', 'Vigencia desde'],
    ['10100', 'ADMINISTRACION', 'Mario González', 'SI', '2026-01-01'],
  ]);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const text = Buffer.from(bytes).toString('utf8');
  assert.equal(text.includes('<?mso-application'), false);
  assert.equal(text.includes('name="Centros de costo"'), true);

  const parsed = parseCodigoNombreWorkbook(
    XLSX,
    Buffer.from(bytes),
    /centrosdecosto/i,
    'Centros de costo',
  );
  assert.equal(parsed.items[0].codigo, '10100');
  assert.equal(parsed.items[0].nombre, 'ADMINISTRACION');
  assert.equal(parsed.items[0].extra.contacto, 'Mario González');
  assert.equal(parsed.items[0].extra.activa, 'SI');
});
