import assert from 'node:assert/strict';
import test from 'node:test';
import { siguienteCodigoNumerico } from './siguiente-codigo.ts';

test('sugiere 1 si no hay códigos numéricos', () => {
  assert.equal(siguienteCodigoNumerico([]), '1');
  assert.equal(siguienteCodigoNumerico(['ADM', '']), '1');
});

test('sugiere el siguiente al mayor, sin rellenar huecos', () => {
  assert.equal(siguienteCodigoNumerico(['1002', '1005', '881']), '1006');
});
