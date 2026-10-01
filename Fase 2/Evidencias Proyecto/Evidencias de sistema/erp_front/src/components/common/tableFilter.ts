/**
 * Filtrado client-side para DataTable / MockListPage.
 *
 * Las listas del ERP cargan el dataset completo (GET list + paginación en cliente),
 * así que búsqueda rápida y avanzada operan sobre filas ya cargadas — válido en
 * modo demo y real. Si en el futuro una lista pagina en servidor, pasar `q`/filtros
 * al backend en lugar de usar este módulo.
 *
 * Los operadores se normalizan con whitelist (`sanitizeFilterOp`); no se evalúa
 * ni se concatena input a SQL/queries.
 */
import { INPUT_LIMITS, clampString, sanitizeFilterOp } from '@/lib/inputValidation';
import { parseMontoEsCl } from '@/lib/monto-es-cl';

export type FilterDataType = 'text' | 'number' | 'date' | 'boolean' | 'select';

export type TextFilterOp = 'contains' | 'startsWith' | 'equals';
export type NumberFilterOp = 'eq' | 'gt' | 'lt' | 'between';
export type DateFilterOp = 'eq' | 'between';
export type BooleanFilterOp = 'eq';

export type ColumnFilterState = {
  key: string;
  dataType: FilterDataType;
  op: string;
  /** Valor principal (texto, número, fecha desde, 'true'/'false', opción select). */
  value: string;
  /** Segundo valor para rangos (número/fecha «hasta»). */
  valueTo?: string;
};

export type FilterableColumnMeta = {
  key: string;
  headerLabel: string;
  dataType: FilterDataType;
  options?: { value: string; label: string }[];
};

export type SortValue = string | number | boolean | Date | null | undefined;

function isIsoDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(s);
}

/** Infiere tipo de filtro a partir de valores de muestra. */
export function inferFilterDataType(samples: SortValue[]): FilterDataType {
  const defined = samples.filter((v) => v != null && v !== '');
  if (defined.length === 0) return 'text';
  if (defined.every((v) => typeof v === 'boolean')) return 'boolean';
  if (defined.every((v) => typeof v === 'number' || (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) && !isIsoDateString(v)))) {
    const asNum = defined.filter((v) => typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)));
    if (asNum.length === defined.length) return 'number';
  }
  if (defined.every((v) => v instanceof Date || (typeof v === 'string' && isIsoDateString(v)))) return 'date';
  return 'text';
}

export function stringifyFilterValue(v: SortValue): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function normalizeForSearch(v: SortValue): string {
  return stringifyFilterValue(v).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function parseNumber(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  if (t.includes('.') || t.includes(',')) {
    const parsed = parseMontoEsCl(t, { allowNegative: true });
    return parsed.value != null && Number.isFinite(parsed.value) ? parsed.value : null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function toTime(v: SortValue): number | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.getTime();
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}

function toNumber(v: SortValue): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return Number(v);
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function toBool(v: SortValue): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v == null || v === '') return null;
  const s = String(v).toLowerCase();
  if (['true', '1', 'si', 'sí', 'activo', 'yes'].includes(s)) return true;
  if (['false', '0', 'no', 'inactivo'].includes(s)) return false;
  return null;
}

/** ¿El filtro tiene criterios activos? */
export function isFilterActive(f: ColumnFilterState): boolean {
  if (f.dataType === 'boolean' || f.dataType === 'select') return f.value !== '';
  if (f.dataType === 'number' || f.dataType === 'date') {
    if (f.op === 'between') return f.value.trim() !== '' || (f.valueTo ?? '').trim() !== '';
    return f.value.trim() !== '';
  }
  return f.value.trim() !== '';
}

export function matchText(cell: SortValue, op: TextFilterOp, needle: string): boolean {
  const hay = normalizeForSearch(cell);
  const n = needle.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!n) return true;
  if (op === 'startsWith') return hay.startsWith(n);
  if (op === 'equals') return hay === n;
  return hay.includes(n);
}

export function matchNumber(cell: SortValue, op: NumberFilterOp, value: string, valueTo?: string): boolean {
  const num = toNumber(cell);
  if (num == null) return false;
  const a = parseNumber(value);
  const b = valueTo != null && valueTo !== '' ? parseNumber(valueTo) : null;
  if (op === 'between') {
    if (a != null && num < a) return false;
    if (b != null && num > b) return false;
    return a != null || b != null;
  }
  if (a == null) return true;
  if (op === 'gt') return num > a;
  if (op === 'lt') return num < a;
  return num === a;
}

export function matchDate(cell: SortValue, op: DateFilterOp, value: string, valueTo?: string): boolean {
  const t = toTime(cell);
  if (t == null) return false;
  const from = value ? toTime(value) : null;
  const to = valueTo ? toTime(valueTo) : null;
  if (op === 'eq') {
    if (from == null) return true;
    const day = new Date(from);
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    const end = start + 86_400_000 - 1;
    return t >= start && t <= end;
  }
  // between / rango desde-hasta
  if (from != null && t < from) return false;
  if (to != null) {
    const end = to + 86_400_000 - 1;
    if (t > end) return false;
  }
  return from != null || to != null;
}

export function matchBoolean(cell: SortValue, value: string): boolean {
  if (value === '') return true;
  const want = value === 'true';
  const got = toBool(cell);
  return got === want;
}

export function matchSelect(cell: SortValue, value: string): boolean {
  if (value === '') return true;
  return stringifyFilterValue(cell) === value;
}

export function rowMatchesColumnFilter(cell: SortValue, f: ColumnFilterState): boolean {
  if (!isFilterActive(f)) return true;
  const op = sanitizeFilterOp(f.dataType, f.op);
  const value = clampString(f.value, INPUT_LIMITS.search);
  const valueTo = f.valueTo != null ? clampString(f.valueTo, INPUT_LIMITS.search) : undefined;
  switch (f.dataType) {
    case 'number':
      return matchNumber(cell, (op as NumberFilterOp) || 'eq', value, valueTo);
    case 'date':
      return matchDate(cell, (op as DateFilterOp) || 'between', value, valueTo);
    case 'boolean':
      return matchBoolean(cell, value);
    case 'select':
      return matchSelect(cell, value);
    default:
      return matchText(cell, (op as TextFilterOp) || 'contains', value);
  }
}

/**
 * Búsqueda rápida: coincide si el texto aparece en el valor de alguna columna
 * visible (`filterValue` / `sortValue`). No recorre el resto del objeto fila
 * (evita matchear correlativos internos u otros campos ocultos).
 */
export function rowMatchesQuickSearch<T extends object>(
  _row: T,
  query: string,
  columnValues: SortValue[],
): boolean {
  const q = clampString(query.trim(), INPUT_LIMITS.search);
  if (!q) return true;
  const n = q.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  for (const v of columnValues) {
    if (normalizeForSearch(v).includes(n)) return true;
  }
  return false;
}

export function defaultOpForType(dataType: FilterDataType): string {
  switch (dataType) {
    case 'number':
      return 'eq';
    case 'date':
      return 'between';
    case 'boolean':
    case 'select':
      return 'eq';
    default:
      return 'contains';
  }
}
