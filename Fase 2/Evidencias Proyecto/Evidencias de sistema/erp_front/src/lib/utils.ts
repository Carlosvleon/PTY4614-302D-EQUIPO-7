import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getAppLocale } from './locale';
import { formatCalendarDate, formatDateTime } from './calendar-date';
import { formatRutDisplay } from './inputValidation';

export { calendarDateFromInput, formatDateTime, localIsoDate } from './calendar-date';

export const fmtDateTime = (d: string | Date) => formatDateTime(d, getAppLocale());

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

export const fmtUSD = (n: number) => fmtIso(n, 'USD');

/** Moneda de línea COMEX (USD / CNY / EUR). CLP sigue en `fmtCLP`. */
export function fmtIso(n: number, iso: string): string {
  const code = String(iso || 'USD').toUpperCase();
  if (code === 'CLP') return fmtCLP(n);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n : 0);
  } catch {
    return `${code} ${new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0)}`;
  }
}

export const fmtNumber = (n: number) =>
  new Intl.NumberFormat(getAppLocale()).format(n);

export const fmtDate = (d: string | Date) => formatCalendarDate(d, getAppLocale());

export const fmtRut = (rut: string) => formatRutDisplay(rut) || rut;

export const fmtPct = (n: number) => `${Math.round(n)}%`;
