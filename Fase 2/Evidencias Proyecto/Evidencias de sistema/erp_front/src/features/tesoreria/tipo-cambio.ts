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

export function isMonedaTc(raw?: string | null): boolean {
  const m = normalizeMonedaTc(raw);
  return m === 'USD' || m === 'CNY' || m === 'EUR';
}

export function valorMonedaTc(row: IndicadorTcRow, moneda: MonedaTc): number | null {
  const v = moneda === 'USD' ? Number(row.usd) : moneda === 'CNY' ? Number(row.cny) : Number(row.eur);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

/** TC vigente a esa fecha y el día del indicador que lo aporta (el mismo o el hábil anterior). */
export function tcAplicado(
  rows: IndicadorTcRow[] | null | undefined,
  fecha: string,
  moneda: MonedaTc,
): { tc: number; fecha: string } | null {
  if (!rows?.length) return null;
  const target = isoFecha(fecha);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return null;
  let last: { tc: number; fecha: string } | null = null;
  const sorted = [...rows].sort((a, b) => isoFecha(a.fecha).localeCompare(isoFecha(b.fecha)));
  for (const row of sorted) {
    const day = isoFecha(row.fecha);
    if (day > target) break;
    const v = valorMonedaTc(row, moneda);
    if (v != null) last = { tc: v, fecha: day };
    if (day === target && v != null) return { tc: v, fecha: day };
  }
  return last;
}

export function tcDeFecha(
  rows: IndicadorTcRow[] | null | undefined,
  fecha: string,
  moneda: MonedaTc,
): number | null {
  return tcAplicado(rows, fecha, moneda)?.tc ?? null;
}

/** Productor siempre; resto solo si pago o factura no es CLP. */
export function necesitaCampoTc(opts: {
  tipoPago?: string | null;
  monedaPago?: string | null;
  monedaFactura?: string | null;
}): boolean {
  const tipo = String(opts.tipoPago ?? '').trim().toUpperCase();
  if (tipo === 'ANTICIPO_PRODUCTOR') return true;
  return isMonedaTc(opts.monedaPago) || isMonedaTc(opts.monedaFactura);
}

export function monedaParaSugerirTc(
  monedaPago?: string | null,
  monedaFactura?: string | null,
): MonedaTc | null {
  const pago = normalizeMonedaTc(monedaPago);
  if (pago === 'USD' || pago === 'CNY' || pago === 'EUR') return pago;
  const fac = normalizeMonedaTc(monedaFactura);
  if (fac === 'USD' || fac === 'CNY' || fac === 'EUR') return fac;
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

export const EQUIVALENTE_MODO_DEFAULT: EquivalenteModo = 'nativo';

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
  if (moneda !== 'USD' && moneda !== 'CNY' && moneda !== 'EUR') return null;
  const day = opts.modo === 'hoy'
    ? isoFecha(opts.hoyIso ?? new Date().toISOString())
    : isoFecha(opts.fecha);
  const tc = tcDeFecha(opts.indicadores, day, moneda);
  if (tc == null) return null;
  return monto * tc;
}

export function fmtEquivalenteClp(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(n);
}

export function sugerirTcFormulario(opts: {
  tipo: string;
  monedaPago: string;
  monedaFactura?: string;
  fecha: string;
  tcActual: string | number;
  indicadores: IndicadorTcRow[];
}): number | '' {
  if (!debeSugerirTcBc({
    tipoPago: opts.tipo,
    monedaPago: opts.monedaPago,
    monedaFactura: opts.monedaFactura,
    tcManual: opts.tcActual,
  })) {
    return opts.tcActual === '' || opts.tcActual == null ? '' : Number(opts.tcActual);
  }
  const moneda = monedaParaSugerirTc(opts.monedaPago, opts.monedaFactura);
  if (!moneda) return '';
  const tc = tcDeFecha(opts.indicadores, opts.fecha, moneda);
  return tc ?? '';
}

/** Día hábil Chile (lun–vie). El BC no publica sábado/domingo. */
export function esDiaHabilBc(isoDate: string): boolean {
  const weekday = new Date(`${isoFecha(isoDate)}T16:00:00.000Z`).toLocaleString('en-US', {
    timeZone: 'America/Santiago',
    weekday: 'short',
  });
  return weekday !== 'Sat' && weekday !== 'Sun';
}

/**
 * True si hoy es hábil y no hay USD del día (el cron local no corrió).
 * Si el operador ya sincronizó a mano, hay fila de hoy y no alerta.
 */
export function faltaUsdBcDelDia(
  rows: IndicadorTcRow[] | null | undefined,
  hoyIso: string,
): boolean {
  if (!esDiaHabilBc(hoyIso)) return false;
  const target = isoFecha(hoyIso);
  return !(rows ?? []).some(
    (r) => isoFecha(r.fecha) === target && valorMonedaTc(r, 'USD') != null,
  );
}

export interface ClientDiferenciaTcOpts {
  monto: number;
  tcPago: number;
  tcDocumento: number;
  sentido: 'COBRO' | 'PAGO' | 'INGRESO' | 'EGRESO' | 'CLIENTE' | 'PROVEEDOR';
  monedaDocumento?: string | null;
  monedaPago?: string | null;
  montoMonedaExtranjera?: number | null;
}

export interface ClientDiferenciaTcResult {
  aplica: boolean;
  diferenciaTc: number;
  tipoResultado: 'GANANCIA' | 'PERDIDA' | 'NEUTRO';
  montoOrigenClp: number;
  montoLiquidadoClp: number;
  moneda: string;
  glosa: string;
}

/**
 * Calcula en el cliente la Diferencia de Tipo de Cambio en tiempo real (NIC 21).
 */
export function calcularDiferenciaTcClient(opts: ClientDiferenciaTcOpts): ClientDiferenciaTcResult {
  const monedaPago = normalizeMonedaTc(opts.monedaPago);
  const monedaDoc = normalizeMonedaTc(opts.monedaDocumento);
  const monedaExtranjera = monedaDoc !== 'CLP' ? monedaDoc : (monedaPago !== 'CLP' ? monedaPago : 'CLP');

  const tcPago = Number(opts.tcPago);
  const tcDoc = Number(opts.tcDocumento);

  if (
    monedaExtranjera === 'CLP' ||
    !Number.isFinite(tcPago) ||
    !Number.isFinite(tcDoc) ||
    tcPago <= 0 ||
    tcDoc <= 0 ||
    tcPago === tcDoc
  ) {
    const monto = Number(opts.monto) || 0;
    return {
      aplica: false,
      diferenciaTc: 0,
      tipoResultado: 'NEUTRO',
      montoOrigenClp: monto,
      montoLiquidadoClp: monto,
      moneda: monedaExtranjera,
      glosa: 'Sin diferencia de tipo de cambio',
    };
  }

  let baseMe = Number(opts.montoMonedaExtranjera);
  if (!Number.isFinite(baseMe) || baseMe <= 0) {
    if (monedaDoc !== 'CLP' && opts.monto < 1_000_000) {
      baseMe = Number(opts.monto);
    } else {
      baseMe = Number(opts.monto) / tcDoc;
    }
  }

  const esVenta =
    opts.sentido === 'INGRESO' ||
    opts.sentido === 'COBRO' ||
    opts.sentido === 'CLIENTE';

  const montoOrigenClp = Math.round(baseMe * tcDoc);
  const montoLiquidadoClp = Math.round(baseMe * tcPago);

  let diferenciaTc = 0;
  if (esVenta) {
    diferenciaTc = montoLiquidadoClp - montoOrigenClp;
  } else {
    diferenciaTc = montoOrigenClp - montoLiquidadoClp;
  }

  const tipoResultado: 'GANANCIA' | 'PERDIDA' | 'NEUTRO' =
    diferenciaTc > 0 ? 'GANANCIA' : diferenciaTc < 0 ? 'PERDIDA' : 'NEUTRO';

  const sentidoDesc = esVenta ? 'Cobro factura' : 'Pago proveedor';
  const resultadoDesc = tipoResultado === 'GANANCIA' ? 'Ganancia' : tipoResultado === 'PERDIDA' ? 'Pérdida' : 'Neutro';
  const glosa = `${resultadoDesc} por Diferencia de Cambio ${monedaExtranjera} (${sentidoDesc}): TC Pago $${tcPago.toFixed(2)} vs TC Doc $${tcDoc.toFixed(2)}`;

  return {
    aplica: true,
    diferenciaTc,
    tipoResultado,
    montoOrigenClp,
    montoLiquidadoClp,
    moneda: monedaExtranjera,
    glosa,
  };
}
