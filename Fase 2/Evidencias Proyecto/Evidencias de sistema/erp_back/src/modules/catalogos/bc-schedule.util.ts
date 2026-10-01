const TZ = 'America/Santiago';

export type BcSchedule = {
  autoSync: boolean;
  horarios: string[];
  frecuenciaMinutos: number | null;
  ventanaInicio: string;
  ventanaFin: string;
  diasHabiles: boolean;
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeHora(raw: string): string | null {
  const t = raw.trim();
  if (!HHMM.test(t)) return null;
  return t;
}

export function parseHorarios(csv: string | null | undefined): string[] {
  const parts = (csv ?? '')
    .split(',')
    .map((p) => normalizeHora(p))
    .filter((p): p is string => Boolean(p));
  return [...new Set(parts)].sort();
}

export function santiagoWall(now = new Date()): {
  ymd: string;
  hhmm: string;
  minutes: number;
  weekday: number;
} {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  );
  const hh = parts.hour ?? '00';
  const mm = parts.minute ?? '00';
  const ymd = `${parts.year}-${parts.month}-${parts.day}`;
  const wdFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const weekday = weekdayMap[wdFmt.format(now)] ?? 1;
  return {
    ymd,
    hhmm: `${hh}:${mm}`,
    minutes: Number(hh) * 60 + Number(mm),
    weekday,
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Si ahora corresponde una corrida, devuelve la clave del slot (YYYY-MM-DDTHH:mm).
 * Tolerancia: ventana de 5 minutos (el cron corre cada 5 min).
 */
export function dueCronSlot(schedule: BcSchedule, now = new Date()): string | null {
  if (!schedule.autoSync) return null;
  const wall = santiagoWall(now);
  if (schedule.diasHabiles && (wall.weekday === 0 || wall.weekday === 6)) return null;

  const freq = schedule.frecuenciaMinutos && schedule.frecuenciaMinutos > 0
    ? schedule.frecuenciaMinutos
    : null;

  if (freq) {
    const start = toMinutes(normalizeHora(schedule.ventanaInicio) ?? '09:00');
    const end = toMinutes(normalizeHora(schedule.ventanaFin) ?? '18:00');
    if (wall.minutes < start || wall.minutes > end) return null;
    const offset = wall.minutes - start;
    if (offset % freq > 4) return null;
    const slotMin = start + Math.floor(offset / freq) * freq;
    return `${wall.ymd}T${fromMinutes(slotMin)}`;
  }

  for (const h of schedule.horarios) {
    const target = toMinutes(h);
    const delta = wall.minutes - target;
    if (delta >= 0 && delta <= 4) return `${wall.ymd}T${h}`;
  }
  return null;
}
