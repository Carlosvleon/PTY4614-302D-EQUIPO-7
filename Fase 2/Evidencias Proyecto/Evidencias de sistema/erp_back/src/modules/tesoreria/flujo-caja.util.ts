/** Inferencia nativa de moneda para flujo de caja (T3). Sin conversión TC. */

export function normalizeMonedaCodigo(raw?: string | null): string {
  const m = String(raw ?? '').trim().toUpperCase();
  if (!m) return 'CLP';
  if (m === 'YUAN' || m === 'RMB') return 'CNY';
  return m;
}

export function matchesMonedaFiltro(moneda: string | undefined, filtro?: string): boolean {
  const f = normalizeMonedaCodigo(filtro);
  if (!filtro?.trim() || f === 'TODAS' || f === 'ALL') return true;
  const want = filtro.trim().toUpperCase() === 'YUAN' || filtro.trim().toUpperCase() === 'RMB'
    ? 'CNY'
    : f;
  return normalizeMonedaCodigo(moneda) === want;
}

export function inferMonedaBanco(banco?: string | null, bancoCodigo?: string | null): string {
  const blob = `${banco ?? ''} ${bancoCodigo ?? ''}`.toUpperCase();
  if (/\b(CNY|YUAN|RMB)\b/.test(blob)) return 'CNY';
  if (/\bUSD\b/.test(blob) || /D[OÓ]LAR/.test(blob)) return 'USD';
  return 'CLP';
}

export const MONEDAS_FLUJO = new Set(['CLP', 'USD', 'CNY']);

/** Misma lista que BANCOS_CARTOLA en el front. La cartola no trae el banco en el archivo. */
export const BANCOS_APERTURA = ['Banco Chile', 'Banco Estado', 'Santander', 'Scotiabank'] as const;

export function esBancoApertura(raw?: string | null): boolean {
  const banco = String(raw ?? '').trim();
  return (BANCOS_APERTURA as readonly string[]).includes(banco);
}

export function sortFlujoFilas<T extends { fecha: string; origen: string; id: string }>(filas: T[]): T[] {
  return [...filas].sort((a, b) => {
    const d = a.fecha.localeCompare(b.fecha);
    if (d !== 0) return d;
    if (a.origen !== b.origen) return a.origen === 'APERTURA' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

export function applySaldosNativos<T extends {
  banco?: string;
  moneda: string;
  ingreso: number;
  egreso: number;
  saldo: number;
}>(filas: T[]): T[] {
  const running = new Map<string, number>();
  return filas.map((f) => {
    const key = `${f.banco ?? ''}::${normalizeMonedaCodigo(f.moneda)}`;
    const next = (running.get(key) ?? 0) + f.ingreso - f.egreso;
    running.set(key, next);
    return { ...f, saldo: next };
  });
}

export function periodoYmFromFecha(fecha: string): string {
  const s = String(fecha ?? '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : '';
}

export type FlujoRollupInput = {
  periodo: string;
  moneda: string;
  ingreso: number;
  egreso: number;
  esApertura?: boolean;
  conceptoId?: string;
  conceptoCodigo?: string;
  conceptoNombre?: string;
  conceptoOrden?: number;
  codigoFinancieroId?: string;
  codigoFinancieroCodigo?: string;
  codigoFinancieroNombre?: string;
  banco?: string;
  movimientoCajaId?: string;
  fecha?: string;
};

export type FlujoRollupFila = {
  id: string;
  periodo: string;
  conceptoId?: string;
  conceptoCodigo?: string;
  conceptoNombre: string;
  conceptoOrden: number;
  codigoFinancieroId?: string;
  codigoFinancieroCodigo?: string;
  codigoFinancieroNombre?: string;
  ingreso: number;
  egreso: number;
  saldo: number;
  moneda: string;
  esApertura: boolean;
  banco?: string;
  movimientoCajaId?: string;
  fecha?: string;
};

const SIN_CLASIFICAR = { nombre: 'Sin clasificar', orden: 9_999 };
const APERTURA = { nombre: 'Apertura', orden: -1, codigo: 'APERTURA' };

export function rollupFlujoExcel(rows: FlujoRollupInput[]): FlujoRollupFila[] {
  const acc = new Map<string, FlujoRollupFila>();
  for (const r of rows) {
    const moneda = normalizeMonedaCodigo(r.moneda);
    const periodo = r.periodo;
    const esApertura = Boolean(r.esApertura);
    const conceptoNombre = esApertura
      ? APERTURA.nombre
      : (r.conceptoNombre?.trim() || SIN_CLASIFICAR.nombre);
    const conceptoOrden = esApertura
      ? APERTURA.orden
      : (r.conceptoId ? (r.conceptoOrden ?? 0) : SIN_CLASIFICAR.orden);
    const conceptoId = esApertura ? undefined : r.conceptoId;
    const codigoId = esApertura ? 'APERTURA' : (r.codigoFinancieroId || '_sin');
    const codigoCodigo = esApertura ? (r.banco?.trim() || 'Sin banco') : r.codigoFinancieroCodigo;
    const codigoNombre = esApertura ? undefined : r.codigoFinancieroNombre;
    const banco = esApertura ? (r.banco?.trim() || undefined) : undefined;
    const key = esApertura
      ? `${periodo}|${moneda}|APERTURA|${banco ?? ''}|${r.movimientoCajaId ?? ''}`
      : `${periodo}|${moneda}|${conceptoId ?? '_'}|${codigoId}`;
    const prev = acc.get(key);
    if (prev) {
      prev.ingreso += r.ingreso;
      prev.egreso += r.egreso;
      prev.saldo = prev.ingreso - prev.egreso;
      continue;
    }
    acc.set(key, {
      id: esApertura && r.movimientoCajaId ? r.movimientoCajaId : key,
      periodo,
      conceptoId,
      conceptoCodigo: esApertura ? APERTURA.codigo : r.conceptoCodigo,
      conceptoNombre,
      conceptoOrden,
      codigoFinancieroId: esApertura ? undefined : r.codigoFinancieroId,
      codigoFinancieroCodigo: codigoCodigo,
      codigoFinancieroNombre: codigoNombre,
      ingreso: r.ingreso,
      egreso: r.egreso,
      saldo: r.ingreso - r.egreso,
      moneda,
      esApertura,
      banco,
      movimientoCajaId: esApertura ? r.movimientoCajaId : undefined,
      fecha: esApertura ? r.fecha : undefined,
    });
  }
  return [...acc.values()].sort((a, b) => {
    const p = a.periodo.localeCompare(b.periodo);
    if (p) return p;
    const m = a.moneda.localeCompare(b.moneda);
    if (m) return m;
    if (a.conceptoOrden !== b.conceptoOrden) return a.conceptoOrden - b.conceptoOrden;
    const cn = a.conceptoNombre.localeCompare(b.conceptoNombre, 'es');
    if (cn) return cn;
    return (a.codigoFinancieroCodigo ?? '').localeCompare(b.codigoFinancieroCodigo ?? '', 'es');
  });
}

export function totalesMonedaFlujo(
  filas: Array<{ moneda: string; ingreso: number; egreso: number }>,
): Array<{ moneda: string; ingreso: number; egreso: number; saldo: number }> {
  const order = ['CLP', 'USD', 'CNY'];
  const map = new Map<string, { ingreso: number; egreso: number }>();
  for (const f of filas) {
    const m = normalizeMonedaCodigo(f.moneda);
    const cur = map.get(m) ?? { ingreso: 0, egreso: 0 };
    cur.ingreso += f.ingreso;
    cur.egreso += f.egreso;
    map.set(m, cur);
  }
  return [...map.entries()]
    .sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a[0].localeCompare(b[0]);
    })
    .map(([moneda, v]) => ({ moneda, ingreso: v.ingreso, egreso: v.egreso, saldo: v.ingreso - v.egreso }));
}

export function saldosPorBancoMoneda(
  rows: Array<{ banco?: string; moneda: string; ingreso: number; egreso: number }>,
): Array<{ banco: string; moneda: string; ingreso: number; egreso: number; saldo: number }> {
  const map = new Map<string, { banco: string; moneda: string; ingreso: number; egreso: number }>();
  for (const r of rows) {
    const banco = r.banco?.trim() || '—';
    const moneda = normalizeMonedaCodigo(r.moneda);
    const key = `${banco}::${moneda}`;
    const cur = map.get(key) ?? { banco, moneda, ingreso: 0, egreso: 0 };
    cur.ingreso += r.ingreso;
    cur.egreso += r.egreso;
    map.set(key, cur);
  }
  return [...map.values()]
    .map((v) => ({ ...v, saldo: v.ingreso - v.egreso }))
    .sort((a, b) => a.banco.localeCompare(b.banco, 'es') || a.moneda.localeCompare(b.moneda));
}
