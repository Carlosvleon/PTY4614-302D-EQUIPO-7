import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  emptyPeriodoVista,
  fechaEnPeriodoYm,
  filterByPeriodoVista,
  mesContableSlash,
  ymFromFecha,
} from './periodoVista.ts';

describe('periodoVista', () => {
  it('parsea ISO y DD-MM-YYYY al YYYY-MM del banner', () => {
    assert.equal(ymFromFecha('2026-06-09'), '2026-06');
    assert.equal(fechaEnPeriodoYm('09-06-2026', '2026-06'), true);
    assert.equal(fechaEnPeriodoYm('2026-09-10', '2026-06'), false);
    assert.equal(mesContableSlash('2026-06'), '2026/06');
    assert.equal(ymFromFecha('2026/06'), '2026-06');
    assert.equal(ymFromFecha('2026-06-01/2026-06-30'), '2026-06');
    assert.equal(ymFromFecha('Jul 2026'), '2026-07');
  });

  it('Todo deja pasar todas las filas; si no, solo el mes activo', () => {
    const rows = [{ fecha: '2026-06-01' }, { fecha: '2026-09-01' }];
    assert.equal(filterByPeriodoVista(rows, (r) => r.fecha, '2026-06', true).length, 2);
    assert.deepEqual(
      filterByPeriodoVista(rows, (r) => r.fecha, '2026-06', false).map((r) => r.fecha),
      ['2026-06-01'],
    );
    assert.match(emptyPeriodoVista('órdenes', '2026-06', false), /Todos/);
  });
});
