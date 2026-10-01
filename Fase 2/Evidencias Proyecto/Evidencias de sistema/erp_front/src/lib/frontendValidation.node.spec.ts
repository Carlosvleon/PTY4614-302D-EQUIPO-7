import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateFiscalId } from './inputValidation.ts';
import { parseLibroVentasCsv } from './libroVentasCsv.ts';

describe('política de identificador fiscal', () => {
  it('bloquea checksum chileno inválido en real y avisa al permitir fixture demo', () => {
    const real = validateFiscalId('76.123.456-7', { demoMode: false });
    assert.equal(real.valid, false);
    const demo = validateFiscalId('76.123.456-7', { demoMode: true });
    assert.equal(demo.valid, true);
    assert.match(demo.warning ?? '', /Modo demo/);
  });

  it('acepta RUT válido y limita EX-* a receptor extranjero', () => {
    assert.equal(validateFiscalId('55.555.555-5', { demoMode: false }).valid, true);
    assert.equal(validateFiscalId('EX-1001', { demoMode: false }).valid, false);
    assert.equal(
      validateFiscalId('EX-1001', { demoMode: false, allowForeign: true }).valid,
      true,
    );
  });
});

describe('parser Libro de ventas', () => {
  it('tolera BOM, delimitador coma y campos entre comillas', () => {
    const result = parseLibroVentasCsv(
      '\uFEFFfolio,tipo,cliente,fecha,neto\r\nF-1,FACTURA,"Cliente, Norte",2026-08-19,1234.5',
    );
    assert.equal(result.fatalError, undefined);
    assert.equal(result.rows[0]?.cliente, 'Cliente, Norte');
    assert.equal(result.rows[0]?.neto, 1234.5);
    assert.equal(result.rows[0]?.error, undefined);
  });

  it('informa errores por fila y nunca produce NaN', () => {
    const result = parseLibroVentasCsv(
      'folio;tipo;cliente;fecha;neto\n;OC;;2026-02-30;no-numero',
    );
    assert.match(result.rows[0]?.error ?? '', /Fila 2/);
    assert.equal(Number.isNaN(result.rows[0]?.neto), false);
    assert.equal(result.rows[0]?.neto, 0);
  });

  it('limita tamaño y cantidad de filas', () => {
    assert.match(
      parseLibroVentasCsv('folio;tipo;cliente;fecha;neto', { sizeBytes: 3_000_000 }).fatalError ?? '',
      /2 MB/,
    );
    const twoRows = 'folio;tipo;cliente;fecha;neto\nF1;FACTURA;A;2026-08-01;1\nF2;NC;B;2026-08-02;2';
    assert.match(parseLibroVentasCsv(twoRows, { maxRows: 1 }).fatalError ?? '', /máximo de 1 filas/);
  });
});
