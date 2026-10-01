import {
  debeSugerirTcBc,
  equivalenteClp,
  mapeoSerieMindicador,
  tcDeFecha,
  valorMonedaTc,
} from './tipo-cambio.util';

const ROWS = [
  { fecha: '2026-08-27', usd: 940, eur: 1100, cny: 130 },
  { fecha: '2026-08-28', usd: 945.5, eur: 1104, cny: 131.2 },
  { fecha: '2026-08-31', usd: 950, eur: 0, cny: 132 },
];

describe('tipo-cambio.util', () => {
  it('tcDeFecha usa el día exacto', () => {
    expect(tcDeFecha(ROWS, '2026-08-28', 'USD')).toBe(945.5);
    expect(tcDeFecha(ROWS, '2026-08-28', 'CNY')).toBe(131.2);
  });

  it('si no hay hábil ese día, usa el último anterior con valor', () => {
    expect(tcDeFecha(ROWS, '2026-08-30', 'USD')).toBe(945.5);
    expect(tcDeFecha(ROWS, '2026-08-29', 'CNY')).toBe(131.2);
  });

  it('0 no es un TC válido: salta al anterior', () => {
    expect(valorMonedaTc(ROWS[2], 'EUR')).toBeNull();
    expect(tcDeFecha(ROWS, '2026-08-31', 'EUR')).toBe(1104);
  });

  it('sin filas o fecha futura sin histórico → null (no 0)', () => {
    expect(tcDeFecha([], '2026-08-28', 'USD')).toBeNull();
    expect(tcDeFecha(undefined, '2026-08-28', 'USD')).toBeNull();
    expect(tcDeFecha(ROWS, '2026-08-01', 'USD')).toBeNull();
  });

  it('no sugiere TC a ANTICIPO_PRODUCTOR ni si el usuario ya tipeó', () => {
    expect(
      debeSugerirTcBc({ tipoPago: 'ANTICIPO_PRODUCTOR', monedaPago: 'USD', tcManual: null }),
    ).toBe(false);
    expect(
      debeSugerirTcBc({ tipoPago: 'PAGO_TOTAL', monedaPago: 'USD', tcManual: 912 }),
    ).toBe(false);
    expect(
      debeSugerirTcBc({ tipoPago: 'PAGO_TOTAL', monedaPago: 'CLP', tcManual: null }),
    ).toBe(false);
    expect(
      debeSugerirTcBc({ tipoPago: 'ANTICIPO', monedaPago: 'CNY', tcManual: '' }),
    ).toBe(true);
    expect(
      debeSugerirTcBc({ tipoPago: 'PAGO_TOTAL', monedaPago: 'yuan', tcManual: 0 }),
    ).toBe(true);
    expect(
      debeSugerirTcBc({ tipoPago: 'PAGO_TOTAL', monedaPago: 'CLP', monedaFactura: 'USD', tcManual: null }),
    ).toBe(true);
  });

  it('equivalente CLP: pinzas (hoy) vs fecha; nativo no convierte', () => {
    expect(
      equivalenteClp({
        monto: 10,
        moneda: 'USD',
        fecha: '2026-08-28',
        indicadores: ROWS,
        modo: 'nativo',
      }),
    ).toBeNull();
    expect(
      equivalenteClp({
        monto: 10,
        moneda: 'USD',
        fecha: '2026-08-28',
        indicadores: ROWS,
        modo: 'fecha',
      }),
    ).toBeCloseTo(9455, 5);
    expect(
      equivalenteClp({
        monto: 10,
        moneda: 'USD',
        fecha: '2026-08-28',
        indicadores: ROWS,
        modo: 'hoy',
        hoyIso: '2026-08-31',
      }),
    ).toBeCloseTo(9500, 5);
    expect(
      equivalenteClp({
        monto: 10,
        moneda: 'USD',
        fecha: '2026-08-01',
        indicadores: ROWS,
        modo: 'fecha',
      }),
    ).toBeNull();
  });

  it('mindicador: yuan→CNY; yen no se mapea a yuan', () => {
    expect(mapeoSerieMindicador('yuan')).toBe('CNY');
    expect(mapeoSerieMindicador('yen')).toBeNull();
    expect(mapeoSerieMindicador('dolar')).toBe('USD');
  });
});
