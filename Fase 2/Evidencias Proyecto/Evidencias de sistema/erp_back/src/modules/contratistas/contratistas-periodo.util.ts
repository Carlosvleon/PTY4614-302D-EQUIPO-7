import { BadRequestException } from '@nestjs/common';

const PERIODO_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Acepta exclusivamente el período contable canónico YYYY-MM. */
export function assertPeriodoContratista(value: string): string {
  const periodo = String(value ?? '').trim();
  if (!PERIODO_RE.test(periodo)) {
    throw new BadRequestException('periodo debe tener formato YYYY-MM');
  }
  return periodo;
}

/** Obtiene YYYY-MM sin depender de UTC para fechas creadas a mediodía local. */
export function periodoDesdeFecha(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new BadRequestException('Fecha inválida');
  }
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

export function limitesPeriodo(periodoRaw: string): {
  desde: Date;
  hasta: Date;
} {
  const periodo = assertPeriodoContratista(periodoRaw);
  const [year, month] = periodo.split('-').map(Number);
  return {
    desde: new Date(year, month - 1, 1, 0, 0, 0, 0),
    hasta: new Date(year, month, 0, 23, 59, 59, 999),
  };
}
