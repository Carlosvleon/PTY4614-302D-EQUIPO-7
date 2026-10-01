import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clavesFolioLibro } from './libroVentasCsv.ts';

describe('clavesFolioLibro (solape RCV)', () => {
  it('une folio interno y oficial del mismo tipo', () => {
    const keys = clavesFolioLibro('FACTURA', 'FA-70', '70');
    assert.deepEqual(keys.sort(), ['FACTURA|70', 'FACTURA|fa-70'].sort());
  });

  it('no cruza tipos: NC 70 no choca con factura 70', () => {
    const fa = new Set(clavesFolioLibro('FACTURA', '70'));
    const nc = clavesFolioLibro('NC', '70');
    assert.equal(nc.some((k) => fa.has(k)), false);
  });
});
