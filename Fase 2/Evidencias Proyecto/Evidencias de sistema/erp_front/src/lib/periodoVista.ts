/** Fecha de un listado → YYYY-MM, sin desfase UTC. */
export function ymFromFecha(fecha: string | Date | null | undefined): string | null {
  if (fecha == null || fecha === '') return null;
  if (fecha instanceof Date && !Number.isNaN(fecha.getTime())) {
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
  }
  const f = String(fecha).trim();
  if (/^\d{4}[-/]\d{2}/.test(f)) return `${f.slice(0, 4)}-${f.slice(5, 7)}`;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(f);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}`;
  const named = /^([A-Za-záéíóúÁÉÍÓÚ]+)\s+(\d{4})$/.exec(f);
  if (named) {
    const key = named[1]
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .slice(0, 3)
      .toLowerCase();
    const mm: Record<string, string> = {
      ene: '01', jan: '01', feb: '02', mar: '03', abr: '04', apr: '04',
      may: '05', jun: '06', jul: '07', ago: '08', aug: '08',
      sep: '09', oct: '10', nov: '11', dic: '12', dec: '12',
    };
    return mm[key] ? `${named[2]}-${mm[key]}` : null;
  }
  return null;
}

export function fechaEnPeriodoYm(
  fecha: string | Date | null | undefined,
  codigoYm: string,
): boolean {
  const ym = ymFromFecha(fecha);
  return Boolean(ym && ym === codigoYm);
}

export function filterByPeriodoVista<T>(
  rows: T[],
  getFecha: (row: T) => string | Date | null | undefined,
  codigoYm: string,
  todo: boolean,
): T[] {
  if (todo) return rows;
  return rows.filter((row) => fechaEnPeriodoYm(getFecha(row), codigoYm));
}

export function emptyPeriodoVista(entidad: string, codigoYm: string, todo: boolean): string {
  if (todo) return `Sin ${entidad}`;
  return `Sin ${entidad} en ${codigoYm}. Marca Todos en esta pantalla para ver otros meses.`;
}

/** Cartola mesContable `2026/06` desde código `2026-06`. */
export function mesContableSlash(codigoYm: string): string | null {
  const ym = String(codigoYm ?? '').trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  return ym.replace('-', '/');
}
