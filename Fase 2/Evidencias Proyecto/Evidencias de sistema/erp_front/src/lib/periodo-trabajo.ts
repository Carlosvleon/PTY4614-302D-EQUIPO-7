import { localIsoDate } from '@/lib/calendar-date';

/** Código aaaa-mm del mes calendario local (hoy). */
export function periodoCalendarioHoy(now = new Date()): string {
  return localIsoDate(now).slice(0, 7);
}

export function periodoSesionDistintoDeHoy(codigoSesion: string | null | undefined, now = new Date()): boolean {
  const s = (codigoSesion || '').trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return false;
  return s !== periodoCalendarioHoy(now);
}
