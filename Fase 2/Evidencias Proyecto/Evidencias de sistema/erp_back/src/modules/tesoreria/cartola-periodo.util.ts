/** Periodo de cartola desde las fechas de movimiento (no hardcodear agosto). */

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

export function resumenHojas(
  lineas: Array<{ hoja?: string }>,
): Array<{ nombre: string; movimientos: number }> {
  const map = new Map<string, number>();
  for (const l of lineas) {
    const nombre = (l.hoja ?? '').trim();
    if (!nombre) continue;
    map.set(nombre, (map.get(nombre) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([nombre, movimientos]) => ({ nombre, movimientos }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Hojas por defecto: EXPORT → ALMAHUE*; SERVICES → ALM * (no Almahue). */
export function hojasDefaultPorEmpresa(
  hojas: Array<{ nombre: string }>,
  razonSocial?: string | null,
): string[] {
  const names = hojas.map((h) => h.nombre);
  if (!names.length) return [];
  const r = String(razonSocial ?? '').toLowerCase();
  if (/export/.test(r)) {
    const match = names.filter((n) => /^almahue/i.test(n.trim()));
    if (match.length) return match;
  }
  if (/service/.test(r)) {
    const match = names.filter((n) => /^alm(?!ahue)/i.test(n.trim()));
    if (match.length) return match;
  }
  return names;
}

export function normalizeCartolaMoneda(raw?: string | null): string {
  const m = String(raw ?? '').trim().toUpperCase();
  if (m === 'YUAN' || m === 'RMB' || m === 'CNY') return 'CNY';
  if (m === 'USD' || m === 'DOLAR' || m === 'DÓLAR') return 'USD';
  return 'CLP';
}

export function monedaSugeridaPorHoja(nombreHoja: string): string {
  const s = String(nombreHoja ?? '').toUpperCase();
  if (/\b(YUAN|CNY|RMB)\b/.test(s)) return 'CNY';
  if (/\bUSD\b/.test(s) || /D[OÓ]LAR/.test(s)) return 'USD';
  return 'CLP';
}
