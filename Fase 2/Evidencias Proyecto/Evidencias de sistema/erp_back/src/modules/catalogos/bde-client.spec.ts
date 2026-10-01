import {
  clpFromParity,
  isoDay,
  observationsByIsoDay,
  parseBdeDate,
  parseBdeNumber,
  parseGetSeriesResponse,
  readBdeAuth,
  buildGetSeriesParams,
  redactBdeUrl,
  fetchBdeSeries,
} from './bde-client';

describe('bde-client', () => {
  it('parsea fechas dd-mm-yyyy', () => {
    const d = parseBdeDate('28-08-2026');
    expect(d).not.toBeNull();
    expect(isoDay(d!)).toBe('2026-08-28');
  });

  it('parsea números con punto o coma', () => {
    expect(parseBdeNumber('945.12')).toBe(945.12);
    expect(parseBdeNumber('945,12')).toBe(945.12);
    expect(parseBdeNumber('ND')).toBeNull();
  });

  it('parseGetSeriesResponse ignora ND y código ≠ 0 lanza', () => {
    const rows = parseGetSeriesResponse({
      Codigo: 0,
      Series: {
        seriesId: 'F073.TCO.PRE.Z.D',
        Obs: [
          { indexDateString: '27-08-2026', value: '940.5', statusCode: 'OK' },
          { indexDateString: '28-08-2026', value: 'ND', statusCode: 'OK' },
        ],
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].valor).toBe(940.5);

    expect(() =>
      parseGetSeriesResponse({ Codigo: 1, Descripcion: 'credenciales inválidas' }),
    ).toThrow(/credenciales/i);
  });

  it('calcula CLP desde paridad (metodología BCCh)', () => {
    expect(clpFromParity(940, 0.94)).toBeCloseTo(1000, 5);
    expect(clpFromParity(940, 0)).toBeNull();
  });

  it('indexa observaciones por día ISO', () => {
    const d = parseBdeDate('27-08-2026')!;
    const map = observationsByIsoDay([{ fecha: d, valor: 1, statusCode: 'OK' }]);
    expect(map.get('2026-08-27')).toBe(1);
  });

  it('readBdeAuth prioriza token REST sobre user/pass', () => {
    expect(
      readBdeAuth({
        BC_BDE_TOKEN: 'tok-oficial',
        BC_BDE_USER: 'u@x.cl',
        BC_BDE_PASS: 'secret',
      }),
    ).toEqual({ mode: 'token', token: 'tok-oficial' });
    expect(readBdeAuth({ BC_BDE_USER: 'u@x.cl', BC_BDE_PASS: 'secret' })).toEqual({
      mode: 'userpass',
      user: 'u@x.cl',
      pass: 'secret',
    });
    expect(readBdeAuth({})).toBeNull();
  });

  it('arma GetSeries con token y no con user/pass', () => {
    const params = buildGetSeriesParams(
      { mode: 'token', token: '$2a$10$ejemplo' },
      'F073.TCO.PRE.Z.D',
      '2026-08-25',
      '2026-08-28',
    );
    expect(params.get('function')).toBe('GetSeries');
    expect(params.get('token')).toBe('$2a$10$ejemplo');
    expect(params.get('user')).toBeNull();
    expect(params.get('pass')).toBeNull();
    expect(params.get('timeseries')).toBe('F073.TCO.PRE.Z.D');
  });

  it('redacta token en URLs de error', () => {
    const url =
      'https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx?token=secreto&function=GetSeries';
    expect(redactBdeUrl(url)).toContain('token=***');
    expect(redactBdeUrl(url)).not.toContain('secreto');
  });

  it('fetchBdeSeries usa token en la query y parsea Obs', async () => {
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain('token=tok123');
      expect(url).not.toContain('user=');
      return {
        ok: true,
        json: async () => ({
          Codigo: 0,
          Series: {
            seriesId: 'F073.TCO.PRE.Z.D',
            Obs: [{ indexDateString: '28-08-2026', value: '925.25', statusCode: 'OK' }],
          },
        }),
      } as Response;
    });
    const rows = await fetchBdeSeries(
      { mode: 'token', token: 'tok123' },
      'F073.TCO.PRE.Z.D',
      '2026-08-28',
      '2026-08-28',
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].valor).toBe(925.25);
  });
});
