/**
 * Cliente HTTP de la API oficial BDE (SIETE) del Banco Central de Chile.
 * Doc REST: https://si3.bcentral.cl/estadisticas/Principal1/Web_Services/documentacion.html
 *
 * Auth REST: API Key Token (`BC_BDE_TOKEN`). Fallback legado: user + pass BDE.
 * Endpoint: SieteRestWS.ashx · function=GetSeries
 */

export const BDE_API_URL = 'https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx';

/** Dólar observado (CLP por USD), diario. */
export const BDE_SERIES_USD_CLP = 'F073.TCO.PRE.Z.D';
/** Paridad EUR por USD (oficial); CLP/EUR = USD_CLP / EUR_USD. */
export const BDE_SERIES_EUR_USD = 'F072.EUR.USD.N.O.D';
/** Paridad CNY por USD (oficial); CLP/CNY = USD_CLP / CNY_USD. */
export const BDE_SERIES_CNY_USD = 'F072.CNY.USD.N.O.D';

export type BdeAuth =
  | { mode: 'token'; token: string }
  | { mode: 'userpass'; user: string; pass: string };

/** @deprecated usar BdeAuth */
export type BdeCredentials = { user: string; pass: string };

export type BdeObservation = {
  fecha: Date;
  valor: number;
  statusCode: string;
};

type RawObs = {
  indexDateString?: string;
  value?: string;
  statusCode?: string;
};

type RawGetSeriesResponse = {
  Codigo?: number;
  Descripcion?: string;
  Series?: {
    seriesId?: string;
    descripEsp?: string;
    descripIng?: string;
    Obs?: RawObs[];
  } | null;
};

export function readBdeAuth(
  env: NodeJS.ProcessEnv = process.env,
): BdeAuth | null {
  const token = env.BC_BDE_TOKEN?.trim();
  if (token) return { mode: 'token', token };
  const user = env.BC_BDE_USER?.trim();
  const pass = env.BC_BDE_PASS?.trim();
  if (user && pass) return { mode: 'userpass', user, pass };
  return null;
}

/** Solo user/pass legado. Para REST oficial usar readBdeAuth (token). */
export function readBdeCredentials(
  env: NodeJS.ProcessEnv = process.env,
): BdeCredentials | null {
  const user = env.BC_BDE_USER?.trim();
  const pass = env.BC_BDE_PASS?.trim();
  if (!user || !pass) return null;
  return { user, pass };
}

export function resolveBdeSeriesIds(env: NodeJS.ProcessEnv = process.env) {
  return {
    usdClp: env.BC_BDE_SERIES_USD?.trim() || BDE_SERIES_USD_CLP,
    eurUsd: env.BC_BDE_SERIES_EUR_USD?.trim() || BDE_SERIES_EUR_USD,
    cnyUsd: env.BC_BDE_SERIES_CNY_USD?.trim() || BDE_SERIES_CNY_USD,
  };
}

/** dd-mm-yyyy o dd/mm/yyyy → Date local a medianoche. */
export function parseBdeDate(raw: string): Date | null {
  const m = String(raw ?? '')
    .trim()
    .match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  d.setHours(0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseBdeNumber(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || /^nd$/i.test(s) || s === '-') return null;
  // API suele enviar punto decimal; tolerar coma chilena.
  const n = s.includes(',') && !s.includes('.')
    ? Number(s.replace(/\./g, '').replace(',', '.'))
    : Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseGetSeriesResponse(json: RawGetSeriesResponse): BdeObservation[] {
  if (json.Codigo != null && json.Codigo !== 0) {
    throw new Error(json.Descripcion || `BDE error código ${json.Codigo}`);
  }
  if (!json.Series?.Obs?.length) return [];
  const out: BdeObservation[] = [];
  for (const obs of json.Series.Obs) {
    const fecha = parseBdeDate(obs.indexDateString ?? '');
    const valor = parseBdeNumber(obs.value);
    if (!fecha || valor == null) continue;
    const status = String(obs.statusCode ?? 'OK').trim().toUpperCase() || 'OK';
    // Solo descartar códigos explícitamente inválidos; vacío/OK son válidos.
    if (status === 'ND' || status === 'NA' || status === 'ERROR') continue;
    out.push({ fecha, valor, statusCode: status });
  }
  return out;
}

export function buildGetSeriesParams(
  auth: BdeAuth,
  seriesId: string,
  firstdate: string,
  lastdate: string,
): URLSearchParams {
  const params = new URLSearchParams({
    function: 'GetSeries',
    timeseries: seriesId,
    firstdate,
    lastdate,
  });
  if (auth.mode === 'token') {
    params.set('token', auth.token);
  } else {
    params.set('user', auth.user);
    params.set('pass', auth.pass);
  }
  return params;
}

/** Quita token/pass de una URL BDE para logs y mensajes de error. */
export function redactBdeUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of ['token', 'pass', 'user', 'password']) {
      if (u.searchParams.has(key)) u.searchParams.set(key, '***');
    }
    return u.toString();
  } catch {
    return BDE_API_URL;
  }
}

export async function fetchBdeSeries(
  auth: BdeAuth,
  seriesId: string,
  firstdate: string,
  lastdate: string,
  opts?: { timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<BdeObservation[]> {
  const params = buildGetSeriesParams(auth, seriesId, firstdate, lastdate);
  const url = `${BDE_API_URL}?${params.toString()}`;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const res = await fetchImpl(url, {
    signal: AbortSignal.timeout(opts?.timeoutMs ?? 20_000),
  });
  if (!res.ok) {
    throw new Error(`BDE HTTP ${res.status}`);
  }
  const json = (await res.json()) as RawGetSeriesResponse;
  return parseGetSeriesResponse(json);
}

export function observationsByIsoDay(
  rows: BdeObservation[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(isoDay(r.fecha), r.valor);
  return map;
}

/**
 * CLP por unidad de moneda = dólar observado / paridad (moneda por USD).
 * Metodología BCCh (paridades y tipos de cambio nominales).
 */
export function clpFromParity(usdClp: number, parityPerUsd: number): number | null {
  if (!Number.isFinite(usdClp) || !Number.isFinite(parityPerUsd) || parityPerUsd === 0) {
    return null;
  }
  return usdClp / parityPerUsd;
}
