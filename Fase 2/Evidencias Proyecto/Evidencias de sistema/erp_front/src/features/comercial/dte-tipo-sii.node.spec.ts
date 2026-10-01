import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { esCodigoTipoDteListado, filterOptionsTipoDteLibro, labelTipoDteSii } from './dte-tipo-sii.ts';

describe('labelTipoDteSii', () => {
  it('arma código · nombre', () => {
    assert.equal(labelTipoDteSii('33'), '33 · Factura afecta');
    assert.equal(labelTipoDteSii('110'), '110 · Factura exportación');
    assert.equal(labelTipoDteSii('39'), '39 · Boleta afecta');
  });
});

describe('esCodigoTipoDteListado', () => {
  it('acepta códigos SII del libro y rechaza basura', () => {
    assert.equal(esCodigoTipoDteListado('112'), true);
    assert.equal(esCodigoTipoDteListado('110'), true);
    assert.equal(esCodigoTipoDteListado('999'), false);
    assert.equal(esCodigoTipoDteListado('FACTURA'), false);
  });
});

describe('filterOptionsTipoDteLibro', () => {
  it('incluye tipos no emitibles aún y 110', () => {
    const opts = filterOptionsTipoDteLibro();
    assert.ok(opts.some((o) => o.value === '39'));
    assert.ok(opts.some((o) => o.value === '41'));
    assert.ok(!opts.some((o) => o.value === '101'));
    assert.equal(opts.filter((o) => /Factura exportación/i.test(o.label)).length, 1);
    assert.ok(opts.some((o) => o.value === '110'));
    assert.ok(!opts.some((o) => o.value === 'ORDEN_VENTA'));
    assert.ok(!opts.some((o) => /OV/i.test(o.label)));
  });
});
