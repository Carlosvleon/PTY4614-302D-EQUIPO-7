import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { caretAfterEsClReformat, formatMontoEsCl, parseMontoEsCl } from './monto-es-cl.ts';

describe('monto es-CL', () => {
  it('formatea miles con punto y decimales con coma', () => {
    assert.equal(formatMontoEsCl(1250), '1.250');
    assert.equal(formatMontoEsCl(1250.5, { decimals: 2, padDecimals: true }), '1.250,50');
    assert.equal(formatMontoEsCl(965.1234, { decimals: 4, padDecimals: true }), '965,1234');
  });

  it('parsea 1.250 como mil doscientos cincuenta, no 1,25', () => {
    const r = parseMontoEsCl('1.250');
    assert.equal(r.value, 1250);
    assert.equal(r.complete, true);
  });

  it('parsea decimales solo con coma', () => {
    assert.equal(parseMontoEsCl('1.250,50', { decimals: 2 }).value, 1250.5);
    assert.equal(parseMontoEsCl('965,5', { decimals: 4 }).value, 965.5);
  });

  it('rechaza letras', () => {
    assert.equal(parseMontoEsCl('abc').complete, false);
    assert.equal(parseMontoEsCl('abc').value, null);
  });

  it('no rellena ,00 al parsear enteros (el usuario no escribió coma)', () => {
    const r = parseMontoEsCl('1000', { decimals: 2 });
    assert.equal(r.value, 1000);
    assert.equal(r.display, '1.000');
  });

  it('conserva decimales solo si hay coma', () => {
    assert.equal(parseMontoEsCl('1.000,5', { decimals: 2 }).display, '1.000,5');
    assert.equal(formatMontoEsCl(1000, { decimals: 2, padDecimals: false }), '1.000');
    assert.equal(formatMontoEsCl(1000.5, { decimals: 2, padDecimals: false }), '1.000,50');
  });

  it('deja el caret al final al agrupar 1000 → 1.000', () => {
    assert.equal(caretAfterEsClReformat('1000', 4, '1.000'), 5);
    assert.equal(caretAfterEsClReformat('100', 3, '100'), 3);
  });

  it('deja el caret después de la coma si el usuario la escribió', () => {
    assert.equal(caretAfterEsClReformat('1.000,', 6, '1.000,'), 6);
  });
});
