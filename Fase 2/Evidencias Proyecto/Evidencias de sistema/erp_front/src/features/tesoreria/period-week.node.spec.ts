import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaultPeriodWeek,
  defaultWeekForPeriodo,
  lastWeekIndex,
  nextPeriodWeek,
  parsePeriodWeek,
  periodOfWeek,
  resolvePeriodWeekParam,
  semanaDesdeBannerSiCorresponde,
  weekIndexFromDay,
  weeksOfPeriod,
  withSemana,
  withYearMonth,
  yearOptions,
} from './period-week.ts';

describe('period-week (nómina YYYY-MM-Sn)', () => {
  it('parsea YYYY-MM-Sn y rechaza S5 de febrero', () => {
    assert.deepEqual(parsePeriodWeek('2026-08-S3'), { year: 2026, month: 8, semana: 3 });
    assert.equal(parsePeriodWeek('2026-02-S5'), null);
    assert.equal(parsePeriodWeek('2026-W34'), null);
  });

  it('siguiente semana cruza de mes y de año', () => {
    assert.equal(nextPeriodWeek('2026-08-S3'), '2026-08-S4');
    assert.equal(nextPeriodWeek('2026-08-S5'), '2026-09-S1');
    assert.equal(nextPeriodWeek('2026-02-S4'), '2026-03-S1');
    assert.equal(nextPeriodWeek('2026-12-S5'), '2027-01-S1');
    assert.equal(nextPeriodWeek('mal'), null);
  });

  it('cambia año/mes recortando S5 si el mes no la tiene', () => {
    assert.equal(withYearMonth('2026-08-S5', 2026, 2), '2026-02-S4');
    assert.equal(withYearMonth('2026-08-S2', 2027, 1), '2027-01-S2');
    assert.equal(withSemana('2026-09-S1', 5), '2026-09-S5');
    assert.equal(lastWeekIndex(2026, 2), 4);
    assert.equal(weekIndexFromDay(31), 5);
  });

  it('default y URL: año actual, S5 inválida se recorta, semanas futuras quedan', () => {
    const today = new Date(2026, 8, 2); // 2 sep 2026 local
    assert.equal(defaultPeriodWeek(today), '2026-09-S1');
    assert.equal(resolvePeriodWeekParam(null, today), '2026-09-S1');
    assert.equal(resolvePeriodWeekParam(null, today, '2026-08'), '2026-08-S1');
    assert.equal(resolvePeriodWeekParam(null, today, '2026-09'), '2026-09-S1');
    assert.equal(resolvePeriodWeekParam('2026-10-S2', today), '2026-10-S2');
    assert.equal(resolvePeriodWeekParam('2026-02-S5', today), '2026-02-S4');
    assert.equal(periodOfWeek('2026-10-S2'), '2026-10');
    assert.deepEqual(yearOptions(today), [2025, 2026, 2027, 2028]);
    assert.deepEqual(yearOptions(today, 1, 2, 2024), [2024, 2025, 2026, 2027, 2028]);
    assert.equal(weeksOfPeriod('2026-09').length, 5);
  });

  it('defaultWeekForPeriodo usa S1 si hoy no cae en ese mes', () => {
    const today = new Date(2026, 9, 16); // 16 oct 2026
    assert.equal(defaultWeekForPeriodo('2026-08', today), '2026-08-S1');
    assert.equal(defaultWeekForPeriodo('2026-10', today), '2026-10-S3');
  });

  it('semanaDesdeBannerSiCorresponde: al abrir usa el banner; no pisa un mes elegido', () => {
    const today = new Date(2026, 8, 21);
    assert.equal(semanaDesdeBannerSiCorresponde(null, '2026-09', false, today), '2026-09-S3');
    assert.equal(semanaDesdeBannerSiCorresponde('2026-06-S2', '2026-09', false, today), null);
    assert.equal(semanaDesdeBannerSiCorresponde('2026-06-S2', '2026-09', true, today), '2026-09-S3');
    assert.equal(semanaDesdeBannerSiCorresponde('mal', '2026-08', false, today), '2026-08-S1');
  });
});
