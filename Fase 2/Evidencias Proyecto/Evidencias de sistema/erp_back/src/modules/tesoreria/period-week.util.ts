/** Semana de nómina: bloques de calendario del mes (S1=1–7 … S5=29–fin). No es ISO. */

export const PERIOD_WEEK_RE = /^(\d{4})-(\d{2})-S([1-5])$/i;
const ISO_WEEK_RE = /^(\d{4})-W(\d{2})$/i;

export type PeriodWeek = { year: number; month: number; semana: 1 | 2 | 3 | 4 | 5 };

export function ymdFromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dateFromYmd(ymd: string): Date {
  const [y, m, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, day ?? 1));
}

export function weekIndexFromDay(day: number): 1 | 2 | 3 | 4 | 5 {
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  if (day <= 28) return 4;
  return 5;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function lastWeekIndex(year: number, month: number): 4 | 5 {
  return daysInMonth(year, month) > 28 ? 5 : 4;
}

export function periodWeekFromDate(d: Date): string {
  const ymd = ymdFromDate(d);
  const [y, m, day] = ymd.split('-').map(Number);
  const last = lastWeekIndex(y, m);
  const semana = Math.min(weekIndexFromDay(day), last) as 1 | 2 | 3 | 4 | 5;
  return formatPeriodWeek(y, m, semana);
}

export function formatPeriodWeek(year: number, month: number, semana: number): string {
  return `${year}-${String(month).padStart(2, '0')}-S${semana}`;
}

export function parsePeriodWeek(raw: string): PeriodWeek | null {
  const m = PERIOD_WEEK_RE.exec(raw.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const semana = Number(m[3]) as 1 | 2 | 3 | 4 | 5;
  if (month < 1 || month > 12) return null;
  if (semana > lastWeekIndex(year, month)) return null;
  return { year, month, semana };
}

export function assertPeriodWeek(raw: string): string {
  const parsed = parsePeriodWeek(raw);
  if (!parsed) {
    throw new Error('semanaCompromiso inválida (YYYY-MM-Sn, n=1–5 del mes)');
  }
  return formatPeriodWeek(parsed.year, parsed.month, parsed.semana);
}

export function weekRange(year: number, month: number, semana: number): { desde: string; hasta: string } {
  const dim = daysInMonth(year, month);
  const start = (semana - 1) * 7 + 1;
  const end = Math.min(semana * 7, dim);
  const mm = String(month).padStart(2, '0');
  return {
    desde: `${year}-${mm}-${String(start).padStart(2, '0')}`,
    hasta: `${year}-${mm}-${String(end).padStart(2, '0')}`,
  };
}

export function weeksOfPeriod(periodo: string): Array<{
  key: string;
  semana: number;
  desde: string;
  hasta: string;
}> {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo.trim());
  if (!m) return [];
  const year = Number(m[1]);
  const month = Number(m[2]);
  const last = lastWeekIndex(year, month);
  return Array.from({ length: last }, (_, i) => {
    const semana = (i + 1) as 1 | 2 | 3 | 4 | 5;
    const range = weekRange(year, month, semana);
    return { key: formatPeriodWeek(year, month, semana), semana, ...range };
  });
}

export function nextPeriodS1(periodo: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo.trim());
  if (!m) return periodo;
  let year = Number(m[1]);
  let month = Number(m[2]) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return formatPeriodWeek(year, month, 1);
}

export function periodOfWeek(weekKey: string): string | null {
  const parsed = parsePeriodWeek(weekKey);
  if (!parsed) return null;
  return `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
}

export function currentWeekOfPeriod(periodo: string, today = new Date()): string | null {
  const weeks = weeksOfPeriod(periodo);
  if (!weeks.length) return null;
  const ymd = ymdFromDate(today);
  const hit = weeks.find((w) => ymd >= w.desde && ymd <= w.hasta);
  return hit?.key ?? null;
}

/** Thursday of an ISO week, as calendar Date (UTC date parts). */
export function isoWeekToDate(iso: string): Date | null {
  const m = ISO_WEEK_RE.exec(iso.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const thursdayW1 = new Date(jan4);
  thursdayW1.setUTCDate(jan4.getUTCDate() - (day - 4));
  const thursday = new Date(thursdayW1);
  thursday.setUTCDate(thursdayW1.getUTCDate() + (week - 1) * 7);
  return thursday;
}

/** Normaliza ISO legado (`2026-W34`) o vacío a `YYYY-MM-Sn`. */
export function normalizeSemanaCompromiso(raw: string | null | undefined, venc: Date): string {
  const trimmed = raw?.trim();
  if (trimmed) {
    const period = parsePeriodWeek(trimmed);
    if (period) return formatPeriodWeek(period.year, period.month, period.semana);
    const isoDate = isoWeekToDate(trimmed);
    if (isoDate) return periodWeekFromDate(isoDate);
  }
  return periodWeekFromDate(venc);
}

/**
 * Compromiso de compra: semana de emisión (ingreso). Si el valor guardado
 * coincide con la semana del vencimiento (+30 legado), se trata como default
 * y se corrige a emisión. Un aplazo a otra semana se conserva.
 */
export function semanaCompromisoDesdeEmision(
  raw: string | null | undefined,
  emision: Date,
  venc: Date,
): string {
  const emisionWeek = periodWeekFromDate(emision);
  const vencWeek = periodWeekFromDate(venc);
  const kept = raw?.trim() ? normalizeSemanaCompromiso(raw, emision) : '';
  if (kept && kept !== vencWeek) return kept;
  return emisionWeek;
}

export function comparePeriodWeek(a: string, b: string): number {
  return a.localeCompare(b);
}
