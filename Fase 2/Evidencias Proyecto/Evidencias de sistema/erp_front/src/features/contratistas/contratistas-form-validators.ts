import type { MockFormValues } from '@/components/common/MockListPage';

export const PERIODO_YM = /^\d{4}-(0[1-9]|1[0-2])$/;

export function validatePeriodoYm(value: unknown): string | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  if (!PERIODO_YM.test(s)) return 'Use formato YYYY-MM (ej. 2026-09)';
  return null;
}

export function validateCantidadPositiva(value: unknown): string | null {
  if (value === '' || value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 'Debe ser mayor que cero';
  return null;
}

export function validateTarifaPositiva(value: unknown): string | null {
  return validateCantidadPositiva(value);
}

export function validateVigenciaTarifa(_value: unknown, all: MockFormValues): string | null {
  const desde = String(all.vigenciaDesde ?? '').trim();
  const hasta = String(all.vigenciaHasta ?? '').trim();
  if (!desde || !hasta) return null;
  if (hasta < desde) return 'La vigencia hasta no puede ser anterior a la vigencia desde';
  return null;
}

export function validateMotivoMin(value: unknown, min = 5): string | null {
  const s = String(value ?? '').trim();
  if (s.length > 0 && s.length < min) return `Indica al menos ${min} caracteres`;
  return null;
}
