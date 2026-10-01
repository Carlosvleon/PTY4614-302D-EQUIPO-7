/**
 * Fechas de documento (OV, DTE, asientos): día calendario, no instante UTC.
 * `new Date('2026-06-03')` es medianoche UTC; en Chile `toLocaleDateString` muestra el 2.
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Día calendario local (Chile), no `toISOString()` UTC. */
export function localIsoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function calendarDateFromInput(value: string | Date): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const utcMidnight =
      value.getUTCHours() === 0
      && value.getUTCMinutes() === 0
      && value.getUTCSeconds() === 0
      && value.getUTCMilliseconds() === 0;
    if (utcMidnight) {
      return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    }
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const s = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const day = Number(iso[3]);
    const d = new Date(y, m - 1, day);
    if (d.getFullYear() !== y || d.getMonth() !== m - 1 || d.getDate() !== day) return null;
    return d;
  }
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return calendarDateFromInput(parsed);
}

export function formatCalendarDate(value: string | Date, locale = 'es-CL'): string {
  const date = calendarDateFromInput(value);
  if (!date) return '—';
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Instante (emisión GoSocket), en hora local Chile. */
export function formatDateTime(value: string | Date, locale = 'es-CL'): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
