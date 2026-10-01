import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bancoDesdeDetectado,
  bancoSugeridoPorHoja,
  labelMonedaCartola,
  monedaSugeridaPorHoja,
  hojasDefaultPorEmpresa,
  inferPeriodoDesdeFechas,
  mesesContablesCercanos,
  periodoDesdeCodigoYm,
} from './cartola-periodo.ts';

describe('inferPeriodoDesdeFechas', () => {
  it('junio 2026', () => {
    const r = inferPeriodoDesdeFechas(['2026-06-19', '2026-06-01', '2026-06-30']);
    assert.deepEqual(r, {
      periodo: '2026-06-01/2026-06-30',
      mesContable: '2026/06',
    });
  });
});

describe('periodoDesdeCodigoYm', () => {
  it('header 2026-06 → rango de junio', () => {
    assert.deepEqual(periodoDesdeCodigoYm('2026-06'), {
      periodo: '2026-06-01/2026-06-30',
      mesContable: '2026/06',
    });
  });
});

describe('hojasDefaultPorEmpresa', () => {
  const hojas = [
    { nombre: 'ALM CLP', movimientos: 10 },
    { nombre: 'ALMAHUE CLP', movimientos: 20 },
    { nombre: 'ALMAHUE USD', movimientos: 5 },
  ];
  it('EXPORT elige ALMAHUE*', () => {
    assert.deepEqual(
      hojasDefaultPorEmpresa(hojas, 'ALMAHUE EXPORT SPA'),
      ['ALMAHUE CLP', 'ALMAHUE USD'],
    );
  });
  it('SERVICES elige ALM y no Almahue', () => {
    assert.deepEqual(hojasDefaultPorEmpresa(hojas, 'ALM SERVICES SpA'), ['ALM CLP']);
  });
});

describe('bancoDesdeDetectado', () => {
  it('cartola web Chile', () => {
    assert.equal(bancoDesdeDetectado('banco-chile-web'), 'Banco Chile');
  });
});

describe('bancoSugeridoPorHoja', () => {
  it('Scotia por nombre de hoja; resto Chile', () => {
    assert.equal(bancoSugeridoPorHoja('BANCO SCOTIABANK'), 'Scotiabank');
    assert.equal(bancoSugeridoPorHoja('ALMAHUE CLP'), 'Banco Chile');
    assert.equal(bancoSugeridoPorHoja('ALM USD'), 'Banco Chile');
  });
});

describe('monedaSugeridaPorHoja', () => {
  it('CLP / USD / Yuan', () => {
    assert.equal(monedaSugeridaPorHoja('ALMAHUE CLP'), 'CLP');
    assert.equal(monedaSugeridaPorHoja('ALM USD'), 'USD');
    assert.equal(monedaSugeridaPorHoja('ALMAHUE YUAN'), 'CNY');
    assert.equal(labelMonedaCartola('CNY'), 'Yuan');
  });
});

describe('mesesContablesCercanos', () => {
  it('incluye el mes del header', () => {
    const meses = mesesContablesCercanos('2026-06', 3);
    assert.deepEqual(meses, ['2026/06', '2026/05', '2026/04']);
  });
});
