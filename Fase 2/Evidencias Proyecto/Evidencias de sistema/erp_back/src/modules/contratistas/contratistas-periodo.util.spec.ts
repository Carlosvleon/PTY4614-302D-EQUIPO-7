import { BadRequestException } from '@nestjs/common';
import {
  assertPeriodoContratista,
  limitesPeriodo,
  periodoDesdeFecha,
} from './contratistas-periodo.util';

describe('contratistas-periodo.util', () => {
  it('acepta período canónico YYYY-MM', () => {
    expect(assertPeriodoContratista('2026-07')).toBe('2026-07');
  });

  it.each(['2026-7', '07/2026', '2026-13', 'texto', ''])(
    'rechaza período no canónico: %s',
    (value) => {
      expect(() => assertPeriodoContratista(value)).toThrow(BadRequestException);
    },
  );

  it('deriva período desde fecha local', () => {
    expect(periodoDesdeFecha(new Date(2026, 6, 31, 12))).toBe('2026-07');
  });

  it('calcula límites inclusivos del mes', () => {
    const { desde, hasta } = limitesPeriodo('2026-02');
    expect(desde.getFullYear()).toBe(2026);
    expect(desde.getMonth()).toBe(1);
    expect(desde.getDate()).toBe(1);
    expect(hasta.getDate()).toBe(28);
  });
});
