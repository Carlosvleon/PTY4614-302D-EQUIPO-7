import assert from 'node:assert/strict';
import test from 'node:test';
import { buildXlsxBytes } from '../../lib/exportTable.ts';
import { filasCatalogoDesdeHoja } from './demo-catalog-excel.ts';
import { leerPrimeraHojaXlsx } from './xlsx-sheet.ts';

test('la hoja de la plantilla se lee y un código ya creado no se pisa', async () => {
  const bytes = buildXlsxBytes('Centros de costo', [
    ['La primera fila es un ejemplo.'],
    ['Código', 'Nombre', 'Contacto', 'Activa'],
    ['1002', 'packing nuevo', 'Ana', 'SI'],
    ['1002', 'otro nombre', '', 'NO'],
    ['8811', 'bodega norte', 'Luis', 'SI'],
    ['ADM', 'administración', '', 'SI'],
  ]);
  const rows = await leerPrimeraHojaXlsx(bytes);
  const parsed = filasCatalogoDesdeHoja(rows, 'centro', ['1002']);
  assert.equal(parsed.items.length, 3);
  assert.equal(parsed.items[0].accion, 'SIN_CAMBIOS');
  assert.equal(parsed.items[0].nombre, 'PACKING NUEVO');
  assert.match(parsed.items[0].cambios[0], /No se pisa/);
  assert.equal(parsed.items[1].accion, 'SIN_CAMBIOS');
  assert.equal(parsed.items[2].accion, 'NUEVO');
  assert.equal(parsed.items[2].codigo, '8811');
  assert.equal(parsed.items[2].nombre, 'BODEGA NORTE');
  assert.equal(parsed.items[2].contactoEncargado, 'Luis');
  assert.ok(parsed.skippedInFile.some((s) => s.startsWith('ADM')));
});

test('un código repetido en el mismo archivo no genera una segunda alta', () => {
  const parsed = filasCatalogoDesdeHoja(
    [
      ['Código', 'Nombre', 'Departamento'],
      ['7', 'mano de obra', 'Campo'],
      ['7', 'otro', 'Packing'],
    ],
    'elemento',
    [],
  );
  assert.equal(parsed.items.filter((it) => it.accion === 'NUEVO').length, 1);
  assert.equal(parsed.items[1].accion, 'SIN_CAMBIOS');
  assert.equal(parsed.items[0].nombre, 'MANO DE OBRA');
});
