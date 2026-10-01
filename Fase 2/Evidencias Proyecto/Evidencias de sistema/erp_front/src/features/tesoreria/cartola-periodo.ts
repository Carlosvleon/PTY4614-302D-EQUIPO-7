/** Periodo de cartola desde fechas de movimiento o del mes del header (YYYY-MM). */

export type CartolaHojaResumen = { nombre: string; movimientos: number };

export type CartolaPreviewLinea = {
  fecha: string;
  referencia: string;
  glosa: string;
  monto: number;
  tipo: 'INGRESO' | 'EGRESO';
  /** Hoja del Excel de origen; el CSV de demo no la trae. */
  hoja?: string;
};

/** Contrato del preview de cartola, común al parser real y al de demo. */
export type CartolaPreview = {
  archivoNombre: string;
  formatoDetectado: string;
  bancoDetectado?: string;
  movimientos: number;
  montoTotal: number;
  hojas?: CartolaHojaResumen[];
  lineas: CartolaPreviewLinea[];
  avisos: string[];
  suggestedPeriodo?: string;
  suggestedMesContable?: string;
  formatoEsperado: string;
};

export function inferPeriodoDesdeFechas(fechas: string[]): {
  periodo: string;
  mesContable: string;
} | null {
  const yms = fechas
    .map((f) => String(f ?? '').trim().slice(0, 7))
    .filter((s) => /^\d{4}-\d{2}$/.test(s))
    .sort();
  if (!yms.length) return null;
  const first = yms[0];
  const last = yms[yms.length - 1];
  const [y2, m2] = last.split('-').map(Number);
  const lastDay = new Date(y2, m2, 0).getDate();
  const counts = new Map<string, number>();
  for (const ym of yms) counts.set(ym, (counts.get(ym) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  return {
    periodo: `${first}-01/${last}-${String(lastDay).padStart(2, '0')}`,
    mesContable: top.replace('-', '/'),
  };
}

export function periodoDesdeCodigoYm(codigo: string): {
  periodo: string;
  mesContable: string;
} | null {
  const ym = String(codigo ?? '').trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    periodo: `${ym}-01/${ym}-${String(lastDay).padStart(2, '0')}`,
    mesContable: ym.replace('-', '/'),
  };
}

export function mesesContablesCercanos(codigo: string, n = 12): string[] {
  const ym = String(codigo ?? '').trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    return ['2026/06', '2026/07', '2026/08'];
  }
  const [y, m] = ym.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** EXPORT → ALMAHUE*; SERVICES → ALM * (no Almahue). */
export function hojasDefaultPorEmpresa(
  hojas: CartolaHojaResumen[],
  razonSocial?: string | null,
): string[] {
  const names = hojas.map((h) => h.nombre);
  if (!names.length) return [];
  const r = String(razonSocial ?? '').toLowerCase();
  if (/export/.test(r)) {
    const match = names.filter((nombre) => /^almahue/i.test(nombre.trim()));
    if (match.length) return match;
  }
  if (/service/.test(r)) {
    const match = names.filter((nombre) => /^alm(?!ahue)/i.test(nombre.trim()));
    if (match.length) return match;
  }
  return names;
}

export const BANCOS_CARTOLA = ['Banco Chile', 'Banco Estado', 'Santander', 'Scotiabank'] as const;

export function bancoDesdeDetectado(detectado?: string | null): string {
  const s = String(detectado ?? '').toLowerCase();
  if (s.includes('estado')) return 'Banco Estado';
  if (s.includes('santander')) return 'Santander';
  if (s.includes('scotia')) return 'Scotiabank';
  if (s.includes('almahue') || s.includes('chile')) return 'Banco Chile';
  return 'Banco Chile';
}

/** Sugerencia por nombre de hoja; el usuario confirma en el preview. */
export function bancoSugeridoPorHoja(nombreHoja: string): string {
  const s = String(nombreHoja ?? '').toLowerCase();
  if (s.includes('scotia')) return 'Scotiabank';
  if (s.includes('estado')) return 'Banco Estado';
  if (s.includes('santander')) return 'Santander';
  return 'Banco Chile';
}

export const MONEDAS_CARTOLA = [
  { value: 'CLP', label: 'CLP' },
  { value: 'USD', label: 'USD' },
  { value: 'CNY', label: 'Yuan' },
] as const;

export function monedaSugeridaPorHoja(nombreHoja: string): string {
  const s = String(nombreHoja ?? '').toUpperCase();
  if (/\b(YUAN|CNY|RMB)\b/.test(s)) return 'CNY';
  if (/\bUSD\b/.test(s) || /D[OÓ]LAR/.test(s)) return 'USD';
  return 'CLP';
}

export function labelMonedaCartola(moneda?: string | null): string {
  const m = String(moneda ?? '').toUpperCase();
  if (m === 'CNY' || m === 'YUAN') return 'Yuan';
  if (m === 'USD') return 'USD';
  if (m === 'CLP') return 'CLP';
  return moneda?.trim() || '—';
}

export function fmtMontoCartola(n: number, moneda?: string | null): string {
  const m = String(moneda ?? 'CLP').toUpperCase();
  const code = m === 'CNY' || m === 'YUAN' ? 'CNY' : m === 'USD' ? 'USD' : 'CLP';
  if (code === 'CLP') {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
  }
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(n);
}
