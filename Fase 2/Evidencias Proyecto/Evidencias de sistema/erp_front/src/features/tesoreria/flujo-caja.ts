/** Vista de flujo de caja (T3): solo lectura, montos nativos, sin conversión TC. */

export type FlujoOrigen = 'APERTURA' | 'CARTOLA';
export type FlujoMonedaFiltro = 'TODAS' | 'CLP' | 'USD' | 'CNY';

export type FlujoCajaFila = {
  id: string;
  origen: FlujoOrigen;
  fecha: string;
  concepto: string;
  referencia?: string;
  ingreso: number;
  egreso: number;
  saldo: number;
  banco?: string;
  moneda: string;
  esApertura: boolean;
  codigoFinancieroCodigo?: string;
  codigoFinancieroNombre?: string;
  movimientoCartolaId?: string;
  cartolaId?: string;
  movimientoCajaId?: string;
};

export type FlujoCajaAperturaInput = {
  id: string;
  fecha: string;
  concepto: string;
  ingreso?: number;
  egreso?: number;
  banco?: string;
  moneda?: string;
  esApertura?: boolean;
};

export type FlujoCajaCartolaInput = {
  id: string;
  cartolaId: string;
  fecha: string;
  referencia?: string;
  glosa: string;
  monto: number;
  tipo: string;
  estadoContable: string;
  codigoFinancieroId?: string;
  codigoFinanciero?: string | { codigo: string; nombre: string } | null;
  banco?: string;
  bancoCodigo?: string;
};

export type FlujoKpiBanco = {
  banco: string;
  ingreso: number;
  egreso: number;
  saldo: number;
};

export type FlujoKpiMoneda = {
  moneda: string;
  ingreso: number;
  egreso: number;
  saldo: number;
  bancos: FlujoKpiBanco[];
};

const MONEDA_ORDER = ['CLP', 'USD', 'CNY'];

export function normalizeMonedaCodigo(raw?: string | null): string {
  const m = String(raw ?? '').trim().toUpperCase();
  if (!m) return 'CLP';
  if (m === 'YUAN' || m === 'RMB') return 'CNY';
  return m;
}

export function parseMonedaFiltro(raw?: string | null): FlujoMonedaFiltro {
  const m = String(raw ?? '').trim().toUpperCase();
  if (!m || m === 'TODAS' || m === 'ALL') return 'TODAS';
  if (m === 'CLP') return 'CLP';
  if (m === 'USD') return 'USD';
  if (m === 'CNY' || m === 'YUAN' || m === 'RMB') return 'CNY';
  return 'TODAS';
}

export function matchesMonedaFiltro(moneda: string | undefined, filtro: FlujoMonedaFiltro): boolean {
  if (filtro === 'TODAS') return true;
  return normalizeMonedaCodigo(moneda) === filtro;
}

/**
 * Cartola no trae moneda: infiere de banco/cuenta. Default CLP.
 * No inventa yuan si el banco no lo declara.
 */
export function inferMonedaBanco(banco?: string | null, bancoCodigo?: string | null): string {
  const blob = `${banco ?? ''} ${bancoCodigo ?? ''}`.toUpperCase();
  if (/\b(CNY|YUAN|RMB)\b/.test(blob)) return 'CNY';
  if (/\bUSD\b/.test(blob) || /D[OÓ]LAR/.test(blob)) return 'USD';
  return 'CLP';
}

export function parseCodigoFinanciero(
  raw?: string | { codigo: string; nombre: string } | null,
): { codigo?: string; nombre?: string } {
  if (!raw) return {};
  if (typeof raw === 'object') {
    const codigo = raw.codigo?.trim() || undefined;
    const nombre = raw.nombre?.trim() || undefined;
    return { codigo, nombre };
  }
  const s = raw.trim();
  if (!s) return {};
  const sep = s.split(/\s+·\s+|\s+\|\s+/);
  if (sep.length >= 2) {
    return { codigo: sep[0].trim() || undefined, nombre: sep.slice(1).join(' · ').trim() || undefined };
  }
  return { codigo: s };
}

export function codigoFinancieroLabel(fila: {
  codigoFinancieroCodigo?: string;
  codigoFinancieroNombre?: string;
}): string {
  const codigo = fila.codigoFinancieroCodigo?.trim();
  const nombre = fila.codigoFinancieroNombre?.trim();
  if (codigo && nombre) return `${codigo} · ${nombre}`;
  if (codigo) return codigo;
  if (nombre) return nombre;
  return '—';
}

export function mapAperturaToFila(row: FlujoCajaAperturaInput): FlujoCajaFila {
  return {
    id: `apertura:${row.id}`,
    origen: 'APERTURA',
    fecha: row.fecha,
    concepto: row.concepto,
    ingreso: Number(row.ingreso) || 0,
    egreso: Number(row.egreso) || 0,
    saldo: 0,
    banco: row.banco?.trim() || undefined,
    moneda: normalizeMonedaCodigo(row.moneda),
    esApertura: true,
    movimientoCajaId: row.id,
  };
}

export function mapCartolaToFilaFlujo(row: FlujoCajaCartolaInput): FlujoCajaFila | null {
  if (String(row.estadoContable).toUpperCase() !== 'CONTABILIZADO') return null;
  const tipo = String(row.tipo).toUpperCase();
  const monto = Math.abs(Number(row.monto) || 0);
  const cf = parseCodigoFinanciero(row.codigoFinanciero);
  return {
    id: `cartola:${row.id}`,
    origen: 'CARTOLA',
    fecha: row.fecha,
    concepto: row.glosa,
    referencia: row.referencia?.trim() || undefined,
    ingreso: tipo === 'INGRESO' ? monto : 0,
    egreso: tipo === 'EGRESO' ? monto : 0,
    saldo: 0,
    banco: row.banco?.trim() || undefined,
    moneda: inferMonedaBanco(row.banco, row.bancoCodigo),
    esApertura: false,
    codigoFinancieroCodigo: cf.codigo,
    codigoFinancieroNombre: cf.nombre,
    movimientoCartolaId: row.id,
    cartolaId: row.cartolaId,
  };
}

export function applySaldosNativos(filas: FlujoCajaFila[]): FlujoCajaFila[] {
  const running = new Map<string, number>();
  return filas.map((f) => {
    const key = `${f.banco ?? ''}::${normalizeMonedaCodigo(f.moneda)}`;
    const next = (running.get(key) ?? 0) + f.ingreso - f.egreso;
    running.set(key, next);
    return { ...f, saldo: next };
  });
}

export function sortFlujoFilas(filas: FlujoCajaFila[]): FlujoCajaFila[] {
  return [...filas].sort((a, b) => {
    const d = a.fecha.localeCompare(b.fecha);
    if (d !== 0) return d;
    if (a.origen !== b.origen) return a.origen === 'APERTURA' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

export function buildFlujoCaja(input: {
  aperturas: FlujoCajaAperturaInput[];
  cartolas: Array<{ id: string; banco: string; bancoCodigo?: string }>;
  movimientos: FlujoCajaCartolaInput[];
}): FlujoCajaFila[] {
  const cartolaById = new Map(input.cartolas.map((c) => [c.id, c]));
  const filas: FlujoCajaFila[] = [];
  for (const a of input.aperturas) {
    if (a.esApertura === false) continue;
    filas.push(mapAperturaToFila(a));
  }
  for (const m of input.movimientos) {
    const cartola = cartolaById.get(m.cartolaId);
    const mapped = mapCartolaToFilaFlujo({
      ...m,
      banco: m.banco ?? cartola?.banco,
      bancoCodigo: m.bancoCodigo ?? cartola?.bancoCodigo,
    });
    if (mapped) filas.push(mapped);
  }
  return applySaldosNativos(sortFlujoFilas(filas));
}

export function sumarNativo(filas: FlujoCajaFila[]): { ingreso: number; egreso: number; saldo: number } {
  const ingreso = filas.reduce((s, r) => s + (Number(r.ingreso) || 0), 0);
  const egreso = filas.reduce((s, r) => s + (Number(r.egreso) || 0), 0);
  return { ingreso, egreso, saldo: ingreso - egreso };
}

export function kpisFlujoNativos(filas: FlujoCajaFila[]): FlujoKpiMoneda[] {
  const byMoneda = new Map<string, FlujoCajaFila[]>();
  for (const f of filas) {
    const m = normalizeMonedaCodigo(f.moneda);
    const arr = byMoneda.get(m) ?? [];
    arr.push(f);
    byMoneda.set(m, arr);
  }
  const monedas = [...byMoneda.keys()].sort((a, b) => {
    const ia = MONEDA_ORDER.indexOf(a);
    const ib = MONEDA_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b);
  });
  return monedas.map((moneda) => {
    const rows = byMoneda.get(moneda) ?? [];
    const tot = sumarNativo(rows);
    const byBanco = new Map<string, FlujoCajaFila[]>();
    for (const r of rows) {
      const b = r.banco?.trim() || '—';
      const arr = byBanco.get(b) ?? [];
      arr.push(r);
      byBanco.set(b, arr);
    }
    const bancos = [...byBanco.entries()]
      .map(([banco, rs]) => ({ banco, ...sumarNativo(rs) }))
      .sort((a, b) => a.banco.localeCompare(b.banco));
    return { moneda, ...tot, bancos };
  });
}

export function aperturasFaltantes(filas: FlujoCajaFila[]): Array<{ banco: string; moneda: string }> {
  const have = new Set<string>();
  const need = new Map<string, { banco: string; moneda: string }>();
  for (const f of filas) {
    const banco = f.banco?.trim() || '';
    const moneda = normalizeMonedaCodigo(f.moneda);
    const key = `${banco}::${moneda}`;
    if (f.esApertura || f.origen === 'APERTURA') have.add(key);
    else if (f.origen === 'CARTOLA' && banco) need.set(key, { banco, moneda });
  }
  return [...need.entries()].filter(([k]) => !have.has(k)).map(([, v]) => v);
}

export function fmtMonedaNativa(n: number, moneda: string): string {
  const code = normalizeMonedaCodigo(moneda);
  const digits = code === 'CLP' ? 0 : 2;
  try {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: code === 'CNY' ? 'CNY' : code === 'USD' ? 'USD' : 'CLP',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n);
  } catch {
    return `${n.toLocaleString('es-CL', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${code}`;
  }
}

export function labelMonedaChip(code: FlujoMonedaFiltro): string {
  if (code === 'TODAS') return 'Todas';
  if (code === 'CNY') return 'Yuan (CNY)';
  return code;
}

export function periodoYmFromFecha(fecha: string): string {
  const s = String(fecha ?? '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : '';
}

type FlujoRollupInput = {
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

const SIN_CLASIFICAR = { nombre: 'Sin clasificar', orden: 9_999 };
const APERTURA_GRUPO = { nombre: 'Apertura', orden: -1, codigo: 'APERTURA' };

export function rollupFlujoExcel(rows: FlujoRollupInput[]): import('@/types/domain').FlujoCajaFila[] {
  const acc = new Map<string, import('@/types/domain').FlujoCajaFila>();
  for (const r of rows) {
    const moneda = normalizeMonedaCodigo(r.moneda);
    const esApertura = Boolean(r.esApertura);
    const conceptoNombre = esApertura
      ? APERTURA_GRUPO.nombre
      : (r.conceptoNombre?.trim() || SIN_CLASIFICAR.nombre);
    const conceptoOrden = esApertura
      ? APERTURA_GRUPO.orden
      : (r.conceptoId ? (r.conceptoOrden ?? 0) : SIN_CLASIFICAR.orden);
    const conceptoId = esApertura ? undefined : r.conceptoId;
    const codigoId = esApertura ? 'APERTURA' : (r.codigoFinancieroId || '_sin');
    const banco = esApertura ? (r.banco?.trim() || undefined) : undefined;
    const key = esApertura
      ? `${r.periodo}|${moneda}|APERTURA|${banco ?? ''}|${r.movimientoCajaId ?? ''}`
      : `${r.periodo}|${moneda}|${conceptoId ?? '_'}|${codigoId}`;
    const prev = acc.get(key);
    if (prev) {
      prev.ingreso += r.ingreso;
      prev.egreso += r.egreso;
      prev.saldo = prev.ingreso - prev.egreso;
      continue;
    }
    acc.set(key, {
      id: esApertura && r.movimientoCajaId ? r.movimientoCajaId : key,
      periodo: r.periodo,
      conceptoId,
      conceptoCodigo: esApertura ? APERTURA_GRUPO.codigo : r.conceptoCodigo,
      conceptoNombre,
      conceptoOrden,
      codigoFinancieroId: esApertura ? undefined : r.codigoFinancieroId,
      codigoFinancieroCodigo: esApertura ? (banco || 'Sin banco') : r.codigoFinancieroCodigo,
      codigoFinancieroNombre: esApertura ? undefined : r.codigoFinancieroNombre,
      banco,
      movimientoCajaId: esApertura ? r.movimientoCajaId : undefined,
      fecha: esApertura ? r.fecha : undefined,
      ingreso: r.ingreso,
      egreso: r.egreso,
      saldo: r.ingreso - r.egreso,
      moneda,
      esApertura,
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
  const by = new Map<string, { ingreso: number; egreso: number }>();
  for (const f of filas) {
    const m = normalizeMonedaCodigo(f.moneda);
    const cur = by.get(m) ?? { ingreso: 0, egreso: 0 };
    cur.ingreso += f.ingreso;
    cur.egreso += f.egreso;
    by.set(m, cur);
  }
  return [...by.entries()]
    .sort((a, b) => {
      const ia = MONEDA_ORDER.indexOf(a[0]);
      const ib = MONEDA_ORDER.indexOf(b[0]);
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

export function rollupFlujoDesdeDetalle(input: {
  aperturas: FlujoCajaAperturaInput[];
  cartolas: Array<{ id: string; banco: string; bancoCodigo?: string; moneda?: string }>;
  movimientos: FlujoCajaCartolaInput[];
  codigos: Array<{
    id: string;
    codigo: string;
    nombre: string;
    conceptoId?: string;
    conceptoCodigo?: string;
    conceptoNombre?: string;
  }>;
  conceptos: Array<{ id: string; codigo: string; nombre: string; orden: number }>;
  periodo?: string;
  moneda?: string;
}): import('@/types/domain').FlujoCajaResponse {
  const monedaFiltro = parseMonedaFiltro(input.moneda);
  const periodoFiltro = input.periodo?.trim();
  const cartolaById = new Map(input.cartolas.map((c) => [c.id, c]));
  const cfById = new Map(input.codigos.map((c) => [c.id, c]));
  const cxById = new Map(input.conceptos.map((c) => [c.id, c]));
  const raw: FlujoRollupInput[] = [];

  for (const a of input.aperturas) {
    const moneda = normalizeMonedaCodigo(a.moneda);
    if (!matchesMonedaFiltro(moneda, monedaFiltro)) continue;
    const periodo = periodoYmFromFecha(a.fecha);
    if (periodoFiltro && periodo !== periodoFiltro) continue;
    raw.push({
      periodo,
      moneda,
      ingreso: Number(a.ingreso) || 0,
      egreso: Number(a.egreso) || 0,
      esApertura: true,
      banco: a.banco,
      movimientoCajaId: a.id,
      fecha: a.fecha.slice(0, 10),
    });
  }

  for (const m of input.movimientos) {
    if (String(m.estadoContable).toUpperCase() !== 'CONTABILIZADO') continue;
    const cartola = cartolaById.get(m.cartolaId);
    const moneda = cartola?.moneda
      ? normalizeMonedaCodigo(cartola.moneda)
      : inferMonedaBanco(m.banco ?? cartola?.banco, m.bancoCodigo ?? cartola?.bancoCodigo);
    if (!matchesMonedaFiltro(moneda, monedaFiltro)) continue;
    const periodo = periodoYmFromFecha(m.fecha);
    if (periodoFiltro && periodo !== periodoFiltro) continue;
    const tipo = String(m.tipo).toUpperCase();
    const monto = Math.abs(Number(m.monto) || 0);
    const cf = m.codigoFinancieroId ? cfById.get(m.codigoFinancieroId) : undefined;
    const cx = cf?.conceptoId ? cxById.get(cf.conceptoId) : undefined;
    const parsed = parseCodigoFinanciero(m.codigoFinanciero);
    raw.push({
      periodo,
      moneda,
      ingreso: tipo === 'INGRESO' ? monto : 0,
      egreso: tipo === 'EGRESO' ? monto : 0,
      conceptoId: cx?.id ?? cf?.conceptoId,
      conceptoCodigo: cx?.codigo ?? cf?.conceptoCodigo,
      conceptoNombre: cx?.nombre ?? cf?.conceptoNombre,
      conceptoOrden: cx?.orden,
      codigoFinancieroId: cf?.id ?? m.codigoFinancieroId,
      codigoFinancieroCodigo: cf?.codigo ?? parsed.codigo,
      codigoFinancieroNombre: cf?.nombre ?? parsed.nombre,
    });
  }

  const filas = rollupFlujoExcel(raw);
  return { filas, totalesMoneda: totalesMonedaFlujo(filas) };
}

/** Fila ya agrupada por periodo + concepto + código + moneda (respuesta de flujo). */
export type FlujoConceptoFuente = {
  id: string;
  periodo: string;
  conceptoNombre: string;
  conceptoOrden: number;
  codigoFinancieroCodigo?: string;
  codigoFinancieroNombre?: string;
  ingreso: number;
  egreso: number;
  saldo: number;
  moneda: string;
  esApertura?: boolean;
  banco?: string;
  movimientoCajaId?: string;
  fecha?: string;
};

export type FlujoVistaKind = 'titulo' | 'linea' | 'totales';

/** Fila de la grilla: título de concepto, línea de código, o totales del bloque. */
export type FlujoVistaFila = {
  id: string;
  kind: FlujoVistaKind;
  periodo: string;
  conceptoNombre: string;
  codigo: string;
  moneda: string;
  ingreso: number;
  egreso: number;
  saldo: number;
  esApertura?: boolean;
  aperturaId?: string;
  fecha?: string;
  /** Texto para que el buscador conserve el bloque completo. */
  busqueda: string;
  lineas: FlujoConceptoFuente[];
};

function rankMoneda(moneda: string): number {
  const m = normalizeMonedaCodigo(moneda);
  const i = MONEDA_ORDER.indexOf(m);
  return i >= 0 ? i : MONEDA_ORDER.length;
}

/**
 * Arma bloques tipo Excel: el concepto es el título, los códigos cuelgan debajo
 * y cada moneda del bloque cierra con una fila Totales (no se suman entre sí).
 */
export function agruparFlujoPorConcepto(filas: FlujoConceptoFuente[]): FlujoVistaFila[] {
  const groups = new Map<string, FlujoConceptoFuente[]>();
  for (const f of filas) {
    const key = `${f.periodo}\0${String(f.conceptoOrden).padStart(6, '0')}\0${f.conceptoNombre}`;
    const arr = groups.get(key) ?? [];
    arr.push(f);
    groups.set(key, arr);
  }
  const out: FlujoVistaFila[] = [];
  for (const key of [...groups.keys()].sort((a, b) => a.localeCompare(b, 'es'))) {
    const rows = groups.get(key) ?? [];
    const head = rows[0];
    if (!head) continue;
    const sorted = [...rows].sort((a, b) => {
      const c = codigoFinancieroLabel(a).localeCompare(codigoFinancieroLabel(b), 'es');
      if (c) return c;
      return rankMoneda(a.moneda) - rankMoneda(b.moneda);
    });
    const codigos = [...new Set(sorted.map((r) => (r.esApertura ? (r.banco?.trim() || 'Sin banco') : codigoFinancieroLabel(r))))];
    const monedas = [...new Set(sorted.map((r) => normalizeMonedaCodigo(r.moneda)))]
      .sort((a, b) => rankMoneda(a) - rankMoneda(b));
    const busqueda = [head.periodo, head.conceptoNombre, ...codigos, ...monedas].join(' ');
    out.push({
      id: `titulo:${key}`,
      kind: 'titulo',
      periodo: head.periodo,
      conceptoNombre: head.conceptoNombre,
      codigo: '',
      moneda: '',
      ingreso: 0,
      egreso: 0,
      saldo: 0,
      busqueda,
      lineas: [],
    });
    for (const r of sorted) {
      out.push({
        id: `linea:${r.id}`,
        kind: 'linea',
        periodo: r.periodo,
        conceptoNombre: r.conceptoNombre,
        codigo: r.esApertura ? (r.banco?.trim() || 'Sin banco') : codigoFinancieroLabel(r),
        moneda: normalizeMonedaCodigo(r.moneda),
        esApertura: Boolean(r.esApertura),
        aperturaId: r.esApertura ? r.movimientoCajaId : undefined,
        fecha: r.esApertura ? r.fecha : undefined,
        ingreso: r.ingreso,
        egreso: r.egreso,
        saldo: r.saldo,
        busqueda,
        lineas: [r],
      });
    }
    for (const moneda of monedas) {
      const rs = sorted.filter((r) => normalizeMonedaCodigo(r.moneda) === moneda);
      const ingreso = rs.reduce((s, r) => s + (Number(r.ingreso) || 0), 0);
      const egreso = rs.reduce((s, r) => s + (Number(r.egreso) || 0), 0);
      out.push({
        id: `totales:${key}:${moneda}`,
        kind: 'totales',
        periodo: head.periodo,
        conceptoNombre: head.conceptoNombre,
        codigo: 'Totales',
        moneda,
        ingreso,
        egreso,
        saldo: ingreso - egreso,
        busqueda,
        lineas: rs,
      });
    }
  }
  return out;
}
