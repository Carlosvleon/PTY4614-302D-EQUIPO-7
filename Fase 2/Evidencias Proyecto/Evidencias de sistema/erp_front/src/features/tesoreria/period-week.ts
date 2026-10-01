/** Semana de nómina: bloques de calendario del mes (S1=1–7 … S5=29–fin). No es ISO. */

export const PERIOD_WEEK_RE = /^(\d{4})-(\d{2})-S([1-5])$/i;

export type PeriodWeekBucket = {
  key: string;
  semana: number;
  desde: string;
  hasta: string;
};

export function ymdFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Fecha calendario YYYY-MM-DD → DD-MM-YYYY, sin desfase UTC. */
export function fmtYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${d}-${m}-${y}`;
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

export function formatPeriodWeek(year: number, month: number, semana: number): string {
  return `${year}-${String(month).padStart(2, '0')}-S${semana}`;
}

export function periodWeekFromYmd(ymd: string): string {
  const [y, m, day] = ymd.split('-').map(Number);
  const last = lastWeekIndex(y, m);
  const semana = Math.min(weekIndexFromDay(day), last) as 1 | 2 | 3 | 4 | 5;
  return formatPeriodWeek(y, m, semana);
}

export function parsePeriodWeek(raw: string): { year: number; month: number; semana: number } | null {
  const m = PERIOD_WEEK_RE.exec(raw.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const semana = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (semana > lastWeekIndex(year, month)) return null;
  return { year, month, semana };
}

export function periodOfWeek(weekKey: string): string | null {
  const parsed = parsePeriodWeek(weekKey);
  if (!parsed) return null;
  return `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
}

/** Siguiente bloque de nómina (S2 tras S1; S1 del mes siguiente tras la última). */
export function nextPeriodWeek(weekKey: string): string | null {
  const parsed = parsePeriodWeek(weekKey);
  if (!parsed) return null;
  const last = lastWeekIndex(parsed.year, parsed.month);
  if (parsed.semana < last) {
    return formatPeriodWeek(parsed.year, parsed.month, parsed.semana + 1);
  }
  let year = parsed.year;
  let month = parsed.month + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return formatPeriodWeek(year, month, 1);
}

export function withYearMonth(weekKey: string, year: number, month: number): string {
  const parsed = parsePeriodWeek(weekKey);
  const semana = parsed?.semana ?? 1;
  const last = lastWeekIndex(year, month);
  return formatPeriodWeek(year, month, Math.min(Math.max(1, semana), last));
}

export function withSemana(weekKey: string, semana: number): string {
  const parsed = parsePeriodWeek(weekKey);
  if (!parsed) return weekKey;
  const last = lastWeekIndex(parsed.year, parsed.month);
  return formatPeriodWeek(parsed.year, parsed.month, Math.min(Math.max(1, semana), last));
}

export function defaultPeriodWeek(today = new Date()): string {
  return periodWeekFromYmd(ymdFromDate(today));
}

/**
 * Semana inicial del mes contable (YYYY-MM): la semana calendario si cae
 * en ese mes; si no, S1 de ese mes. No salta a otro mes por datos.
 */
export function defaultWeekForPeriodo(periodoCodigo: string, today = new Date()): string {
  const inPeriod = currentWeekOfPeriod(periodoCodigo, today);
  if (inPeriod) return inPeriod;
  const weeks = weeksOfPeriod(periodoCodigo);
  return weeks[0]?.key ?? defaultPeriodWeek(today);
}

/**
 * Al abrir: mes del banner. Si el usuario ya eligió otra semana (URL) y el
 * banner no cambió, no pisar. Si el banner cambia, vuelve al mes de trabajo.
 */
export function semanaDesdeBannerSiCorresponde(
  semanaUrl: string | null | undefined,
  periodoHeader: string,
  headerChanged: boolean,
  today = new Date(),
): string | null {
  const cur = semanaUrl?.trim();
  if (cur && parsePeriodWeek(cur) && !headerChanged) return null;
  return defaultWeekForPeriodo(periodoHeader, today);
}

/** URL `YYYY-MM-Sn` inválida o S5 de mes corto → se recorta; vacío → mes contable o calendario. */
export function resolvePeriodWeekParam(
  raw: string | null | undefined,
  today = new Date(),
  periodoCodigo?: string,
): string {
  const trimmed = raw?.trim();
  if (trimmed) {
    const m = PERIOD_WEEK_RE.exec(trimmed);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]);
      const semana = Number(m[3]);
      if (month >= 1 && month <= 12 && semana >= 1 && semana <= 5) {
        const last = lastWeekIndex(year, month);
        return formatPeriodWeek(year, month, Math.min(semana, last));
      }
    }
  }
  if (periodoCodigo && weeksOfPeriod(periodoCodigo).length) {
    return defaultWeekForPeriodo(periodoCodigo, today);
  }
  return defaultPeriodWeek(today);
}

export function yearOptions(today = new Date(), past = 1, future = 2, extraYear?: number): number[] {
  const y = today.getFullYear();
  const years = new Set<number>();
  for (let i = y - past; i <= y + future; i += 1) years.add(i);
  if (extraYear && extraYear > 1990 && extraYear < 2200) years.add(extraYear);
  return [...years].sort((a, b) => a - b);
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

export function weeksOfPeriod(periodo: string): PeriodWeekBucket[] {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo.trim());
  if (!m) return [];
  const year = Number(m[1]);
  const month = Number(m[2]);
  const last = lastWeekIndex(year, month);
  return Array.from({ length: last }, (_, i) => {
    const semana = i + 1;
    return { key: formatPeriodWeek(year, month, semana), semana, ...weekRange(year, month, semana) };
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

export function currentWeekOfPeriod(periodo: string, today = new Date()): string | null {
  const weeks = weeksOfPeriod(periodo);
  if (!weeks.length) return null;
  const ymd = ymdFromDate(today);
  return weeks.find((w) => ymd >= w.desde && ymd <= w.hasta)?.key ?? null;
}

export function normalizeSemanaCompromiso(raw: string | null | undefined, vencYmd: string): string {
  const trimmed = raw?.trim();
  if (trimmed && PERIOD_WEEK_RE.test(trimmed)) {
    const p = parsePeriodWeek(trimmed);
    if (p) return formatPeriodWeek(p.year, p.month, p.semana);
  }
  return periodWeekFromYmd(vencYmd);
}

export function labelSemanaCorta(key: string): string {
  const p = parsePeriodWeek(key);
  return p ? `S${p.semana}` : key;
}
