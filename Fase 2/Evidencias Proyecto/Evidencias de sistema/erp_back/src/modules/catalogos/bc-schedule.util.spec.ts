import { dueCronSlot, parseHorarios } from './bc-schedule.util';

describe('bc-schedule.util', () => {
  it('parseHorarios deduplica y ordena', () => {
    expect(parseHorarios('18:00, 09:00, 09:00')).toEqual(['09:00', '18:00']);
  });

  it('no dispara si autoSync está apagado', () => {
    expect(
      dueCronSlot({
        autoSync: false,
        horarios: ['09:00'],
        frecuenciaMinutos: null,
        ventanaInicio: '09:00',
        ventanaFin: '18:00',
        diasHabiles: false,
      }),
    ).toBeNull();
  });
});
