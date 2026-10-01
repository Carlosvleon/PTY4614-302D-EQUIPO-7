/** Lookup de TC histórico (IndicadorBc). No llama al BC: usa filas ya persistidas. */

export type MonedaTc = 'USD' | 'CNY' | 'EUR';

export type IndicadorTcRow = {
  fecha: string;
  usd: number;
  eur: number;
  cny: number;
};

export function isoFecha(raw: Date | string): string {
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s.slice(0, 10);
    raw = d;
  }
  const y = raw.getFullYear();
  const m = String(raw.getMonth() + 1).padStart(2, '0');
  const day = String(raw.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function normalizeMonedaTc(raw?: string | null): string {
  const m = String(raw ?? '').trim().toUpperCase();
  if (!m) return 'CLP';
  if (m === 'YUAN' || m === 'RMB') return 'CNY';
  if (m === 'DOLAR' || m === 'DÓLAR') return 'USD';
  if (m === 'EURO') return 'EUR';
  return m;
}

export function isMonedaTc(raw?: string | null): raw is MonedaTc {
  const m = normalizeMonedaTc(raw);
  return m === 'USD' || m === 'CNY' || m === 'EUR';
}

/** 0 o negativo = sin dato (no usar como TC). */
export function valorMonedaTc(row: IndicadorTcRow, moneda: MonedaTc): number | null {
  const v = moneda === 'USD' ? Number(row.usd) : moneda === 'CNY' ? Number(row.cny) : Number(row.eur);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

/**
 * TC de `fecha` o, si falta (feriado/finde/hueco), el último día anterior con valor.
 * Filas con 0 no cuentan.
 */
export function tcDeFecha(
  rows: IndicadorTcRow[] | null | undefined,
  fecha: string,
  moneda: MonedaTc,
): number | null {
  if (!rows?.length) return null;
  const target = isoFecha(fecha);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return null;
  let last: number | null = null;
  const sorted = [...rows].sort((a, b) => isoFecha(a.fecha).localeCompare(isoFecha(b.fecha)));
  for (const row of sorted) {
    const day = isoFecha(row.fecha);
    if (day > target) break;
    const v = valorMonedaTc(row, moneda);
    if (v != null) last = v;
    if (day === target && v != null) return v;
  }
  return last;
}

/**
 * Default BC solo si el usuario no tipeó TC, la moneda no es CLP
 * y el pago NO es anticipo productor (T1: negociado).
 */
export function monedaParaSugerirTc(
  monedaPago?: string | null,
  monedaFactura?: string | null,
): MonedaTc | null {
  const pago = normalizeMonedaTc(monedaPago);
  if (isMonedaTc(pago)) return pago;
  const fac = normalizeMonedaTc(monedaFactura);
  if (isMonedaTc(fac)) return fac;
  return null;
}

export function debeSugerirTcBc(opts: {
  tipoPago?: string | null;
  monedaPago?: string | null;
  monedaFactura?: string | null;
  tcManual?: number | string | null;
}): boolean {
  const tipo = String(opts.tipoPago ?? '').trim().toUpperCase();
  if (tipo === 'ANTICIPO_PRODUCTOR') return false;
  const typed = Number(opts.tcManual);
  if (opts.tcManual != null && opts.tcManual !== '' && Number.isFinite(typed) && typed > 0) {
    return false;
  }
  return monedaParaSugerirTc(opts.monedaPago, opts.monedaFactura) != null;
}

export type EquivalenteModo = 'nativo' | 'fecha' | 'hoy';

/**
 * Equivalente CLP. `nativo` no convierte (null = no mostrar).
 * Sin indicador → null (UI debe pintar "—", nunca 0 mentiroso).
 */
export function equivalenteClp(opts: {
  monto: number;
  moneda: string;
  fecha: string;
  indicadores: IndicadorTcRow[];
  modo: EquivalenteModo;
  hoyIso?: string;
}): number | null {
  if (opts.modo === 'nativo') return null;
  const monto = Number(opts.monto);
  if (!Number.isFinite(monto)) return null;
  const moneda = normalizeMonedaTc(opts.moneda);
  if (moneda === 'CLP') return monto;
  if (!isMonedaTc(moneda)) return null;
  const day = opts.modo === 'hoy' ? isoFecha(opts.hoyIso ?? new Date().toISOString()) : isoFecha(opts.fecha);
  const tc = tcDeFecha(opts.indicadores, day, moneda);
  if (tc == null) return null;
  return monto * tc;
}

/** mindicador.cl: yuan ≠ yen. */
export function mapeoSerieMindicador(codigo: string): MonedaTc | null {
  const c = String(codigo ?? '').trim().toLowerCase();
  if (c === 'dolar' || c === 'dolar_observado') return 'USD';
  if (c === 'euro') return 'EUR';
  if (c === 'yuan') return 'CNY';
  return null;
}
