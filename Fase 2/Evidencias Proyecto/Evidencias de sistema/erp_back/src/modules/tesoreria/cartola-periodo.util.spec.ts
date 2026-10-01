import { hojasDefaultPorEmpresa, inferPeriodoDesdeFechas, monedaSugeridaPorHoja, resumenHojas } from './cartola-periodo.util';

describe('inferPeriodoDesdeFechas', () => {
  it('junio 2026: rango y mes contable 2026/06', () => {
    const r = inferPeriodoDesdeFechas(['2026-06-19', '2026-06-01', '2026-06-30']);
    expect(r).toEqual({
      periodo: '2026-06-01/2026-06-30',
      mesContable: '2026/06',
    });
  });

  it('mes mayoritario si hay más de un mes', () => {
    const r = inferPeriodoDesdeFechas(['2026-06-30', '2026-07-01', '2026-06-19']);
    expect(r?.mesContable).toBe('2026/06');
    expect(r?.periodo).toBe('2026-06-01/2026-07-31');
  });
});

describe('hojasDefaultPorEmpresa', () => {
  const hojas = [
    { nombre: 'ALM CLP' },
    { nombre: 'ALMAHUE CLP' },
    { nombre: 'ALMAHUE USD' },
    { nombre: 'BANCO SCOTIABANK' },
  ];

  it('EXPORT elige hojas ALMAHUE*', () => {
    expect(hojasDefaultPorEmpresa(hojas, 'ALMAHUE EXPORT SPA')).toEqual([
      'ALMAHUE CLP',
      'ALMAHUE USD',
    ]);
  });

  it('SERVICES elige ALM * y no Almahue', () => {
    expect(hojasDefaultPorEmpresa(hojas, 'ALM SERVICES SpA')).toEqual(['ALM CLP']);
  });
});

describe('monedaSugeridaPorHoja', () => {
  it('lee CLP / USD / Yuan del nombre', () => {
    expect(monedaSugeridaPorHoja('ALMAHUE CLP')).toBe('CLP');
    expect(monedaSugeridaPorHoja('ALMAHUE USD')).toBe('USD');
    expect(monedaSugeridaPorHoja('ALMAHUE YUAN')).toBe('CNY');
    expect(monedaSugeridaPorHoja('BANCO SCOTIABANK')).toBe('CLP');
  });
});

describe('resumenHojas', () => {
  it('cuenta por hoja', () => {
    const r = resumenHojas([
      { hoja: 'ALM CLP' },
      { hoja: 'ALM CLP' },
      { hoja: 'ALMAHUE CLP' },
    ]);
    expect(r).toEqual([
      { nombre: 'ALM CLP', movimientos: 2 },
      { nombre: 'ALMAHUE CLP', movimientos: 1 },
    ]);
  });
});
