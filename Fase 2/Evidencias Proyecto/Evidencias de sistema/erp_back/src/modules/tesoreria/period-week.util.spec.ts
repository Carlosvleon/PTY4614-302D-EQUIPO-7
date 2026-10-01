import {
  assertPeriodWeek,
  currentWeekOfPeriod,
  lastWeekIndex,
  nextPeriodS1,
  normalizeSemanaCompromiso,
  periodWeekFromDate,
  semanaCompromisoDesdeEmision,
  weekIndexFromDay,
  weeksOfPeriod,
} from './period-week.util';

describe('period-week.util', () => {
  it('parte el mes en bloques 1–7 … 29–fin', () => {
    expect(weekIndexFromDay(1)).toBe(1);
    expect(weekIndexFromDay(7)).toBe(1);
    expect(weekIndexFromDay(8)).toBe(2);
    expect(weekIndexFromDay(22)).toBe(4);
    expect(weekIndexFromDay(26)).toBe(4);
    expect(weekIndexFromDay(31)).toBe(5);
  });

  it('febrero 2026 tiene 4 semanas; agosto 5', () => {
    expect(lastWeekIndex(2026, 2)).toBe(4);
    expect(lastWeekIndex(2026, 8)).toBe(5);
    expect(weeksOfPeriod('2026-02')).toHaveLength(4);
    expect(weeksOfPeriod('2026-08').map((w) => w.key)).toEqual([
      '2026-08-S1',
      '2026-08-S2',
      '2026-08-S3',
      '2026-08-S4',
      '2026-08-S5',
    ]);
    expect(weeksOfPeriod('2026-08')[0]).toMatchObject({ desde: '2026-08-01', hasta: '2026-08-07' });
    expect(weeksOfPeriod('2026-08')[4]).toMatchObject({ desde: '2026-08-29', hasta: '2026-08-31' });
  });

  it('asigna la fecha al bloque del mes', () => {
    expect(periodWeekFromDate(new Date('2026-08-26T00:00:00.000Z'))).toBe('2026-08-S4');
    expect(periodWeekFromDate(new Date('2026-08-01T00:00:00.000Z'))).toBe('2026-08-S1');
    expect(periodWeekFromDate(new Date('2026-08-31T00:00:00.000Z'))).toBe('2026-08-S5');
  });

  it('semana actual del periodo y S1 del mes siguiente', () => {
    expect(currentWeekOfPeriod('2026-08', new Date('2026-08-26T12:00:00.000Z'))).toBe('2026-08-S4');
    expect(currentWeekOfPeriod('2026-07', new Date('2026-08-26T12:00:00.000Z'))).toBeNull();
    expect(nextPeriodS1('2026-08')).toBe('2026-09-S1');
    expect(nextPeriodS1('2026-12')).toBe('2027-01-S1');
  });

  it('normaliza ISO legado y rechaza S5 de febrero', () => {
    const venc = new Date('2026-08-17T00:00:00.000Z');
    expect(normalizeSemanaCompromiso(null, venc)).toBe('2026-08-S3');
    expect(normalizeSemanaCompromiso('2026-08-s3', venc)).toBe('2026-08-S3');
    const fromIso = normalizeSemanaCompromiso('2026-W34', venc);
    expect(fromIso).toMatch(/^2026-\d{2}-S[1-5]$/);
    expect(() => assertPeriodWeek('2026-02-S5')).toThrow();
    expect(assertPeriodWeek('2026-08-S5')).toBe('2026-08-S5');
    const emision = new Date('2026-09-21T17:35:00.000Z');
    const venc30 = new Date(emision);
    venc30.setUTCDate(venc30.getUTCDate() + 30);
    expect(periodWeekFromDate(emision)).toBe('2026-09-S3');
    expect(periodWeekFromDate(venc30)).toBe('2026-10-S3');
    expect(normalizeSemanaCompromiso(null, emision)).toBe('2026-09-S3');
    expect(semanaCompromisoDesdeEmision(null, emision, venc30)).toBe('2026-09-S3');
    expect(semanaCompromisoDesdeEmision('2026-10-S3', emision, venc30)).toBe('2026-09-S3');
    expect(semanaCompromisoDesdeEmision('2026-11-S1', emision, venc30)).toBe('2026-11-S1');
  });
});
