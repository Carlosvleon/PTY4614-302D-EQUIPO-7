import {
  normalizeSemanaCompromiso,
  periodWeekFromYmd,
} from './period-week.ts';

/** Subconjunto de DocumentoAging que usa la nómina (sin acoplar tests a path aliases). */
export type NominaAgingRow = {
  id: string;
  tipo: 'POR_COBRAR' | 'POR_PAGAR';
  documento: string;
  contraparte: string;
  fechaEmision: string;
  fechaVencimiento: string;
  monto: number;
  saldo: number;
  montoPagado?: number;
  diasAtraso: number;
  estado: 'AL_DIA' | 'ATRASADO' | 'CRITICO';
  semanaCompromiso?: string;
  semanaNatural?: string;
  aplazada?: boolean;
  nominaEstado?: 'PENDIENTE' | 'PAGADA';
  rut?: string;
  ocNumero?: string;
};

export type NominaFiltro = 'TODOS' | 'PENDIENTES';

export function hydrateDocumentoAging<T extends NominaAgingRow>(row: T): T {
  const semanaNatural = row.semanaNatural ?? periodWeekFromYmd(row.fechaEmision);
  const semanaCompromiso = normalizeSemanaCompromiso(row.semanaCompromiso, row.fechaEmision);
  const saldo = row.saldo ?? 0;
  return {
    ...row,
    semanaNatural,
    semanaCompromiso,
    aplazada: semanaCompromiso !== semanaNatural,
    nominaEstado: saldo <= 0 ? 'PAGADA' : 'PENDIENTE',
    montoPagado: row.montoPagado ?? Math.max(0, (row.monto ?? 0) - saldo),
  };
}

export function matchesNominaFiltro(row: NominaAgingRow, filtro: NominaFiltro): boolean {
  if (filtro === 'TODOS') return true;
  if (row.nominaEstado) return row.nominaEstado === 'PENDIENTE';
  return (row.saldo ?? 0) > 0;
}

export function kpisNomina(rows: NominaAgingRow[]) {
  const pendientes = rows.filter((r) => (r.saldo ?? 0) > 0);
  return {
    asignados: pendientes.reduce((a, r) => a + r.saldo, 0),
    pagados: rows.reduce((a, r) => a + (r.montoPagado ?? 0), 0),
    atrasados: pendientes.filter((r) => r.diasAtraso > 0).reduce((a, r) => a + r.saldo, 0),
    adelantados: pendientes
      .filter((r) => (r.semanaCompromiso ?? '') < (r.semanaNatural ?? ''))
      .reduce((a, r) => a + r.saldo, 0),
    docs: rows.length,
    docsPendientes: pendientes.length,
  };
}

/**
 * Al cambiar de mes, no quedarse en S3 vacío si ese mes tiene facturas en otra semana (S1, S2…).
 * Si el mes no tiene ninguna, deja preferredWeek (el vacío se explica con chips de otros meses).
 */
export function pickSemanaEnPeriodo(
  rows: Array<{ tipo?: string; semanaCompromiso?: string }>,
  periodoYm: string,
  preferredWeek: string,
): string {
  const prefix = `${periodoYm}-S`;
  const inPeriod = [...new Set(
    rows
      .filter((r) => (r.tipo ?? 'POR_PAGAR') === 'POR_PAGAR' && r.semanaCompromiso?.startsWith(prefix))
      .map((r) => r.semanaCompromiso as string),
  )].sort();
  if (!inPeriod.length) return preferredWeek;
  if (inPeriod.includes(preferredWeek)) return preferredWeek;
  return inPeriod[0]!;
}

/** Semana inicial: la de hoy si tiene docs; si no, la más reciente con pendientes (o cualquier POR_PAGAR). */
export function pickSemanaNominaInicial(
  rows: Array<{
    tipo?: string;
    semanaCompromiso?: string;
    nominaEstado?: string;
    saldo?: number;
  }>,
  todayWeek: string,
): string {
  const pagar = rows.filter((r) => r.tipo === 'POR_PAGAR' && r.semanaCompromiso);
  if (pagar.some((r) => r.semanaCompromiso === todayWeek)) return todayWeek;
  const pendientes = pagar.filter((r) => (
    r.nominaEstado ? r.nominaEstado === 'PENDIENTE' : (r.saldo ?? 0) > 0
  ));
  const pool = pendientes.length ? pendientes : pagar;
  if (!pool.length) return todayWeek;
  const weeks = [...new Set(pool.map((r) => r.semanaCompromiso as string))].sort();
  const pastOrToday = weeks.filter((w) => w <= todayWeek);
  return pastOrToday.length ? pastOrToday[pastOrToday.length - 1]! : weeks[0]!;
}

export function nominaExportFilename(semanaKey: string): string {
  return `nomina-semanal-pagos-${semanaKey}`;
}

export const NOMINA_EXPORT_COLUMNS: Array<{
  key: string;
  header: string;
  value: (row: NominaAgingRow) => string | number | boolean | null | undefined;
}> = [
  { key: 'documento', header: 'Documento', value: (r) => r.documento },
  { key: 'proveedor', header: 'Proveedor', value: (r) => r.contraparte },
  { key: 'rut', header: 'RUT', value: (r) => r.rut ?? '' },
  { key: 'emision', header: 'Emisión', value: (r) => r.fechaEmision },
  { key: 'vencimiento', header: 'Vencimiento DTE', value: (r) => r.fechaVencimiento },
  { key: 'semanaNatural', header: 'Semana emisión', value: (r) => r.semanaNatural ?? '' },
  { key: 'semanaCompromiso', header: 'Semana compromiso', value: (r) => r.semanaCompromiso ?? '' },
  { key: 'monto', header: 'Monto', value: (r) => r.monto },
  { key: 'saldo', header: 'Saldo', value: (r) => r.saldo },
  { key: 'pagado', header: 'Pagado', value: (r) => r.montoPagado ?? 0 },
  { key: 'dias', header: 'Días atraso', value: (r) => r.diasAtraso },
  { key: 'estado', header: 'Estado', value: (r) => r.nominaEstado ?? '' },
  { key: 'aplazada', header: 'Aplazada', value: (r) => (r.aplazada ? 'sí' : 'no') },
  { key: 'oc', header: 'OC', value: (r) => r.ocNumero ?? '' },
];
