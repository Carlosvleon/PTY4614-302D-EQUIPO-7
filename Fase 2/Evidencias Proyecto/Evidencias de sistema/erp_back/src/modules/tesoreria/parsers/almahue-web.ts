import { inferPeriodoDesdeFechas, resumenHojas } from '../cartola-periodo.util';
import type { BankParser, CartolaParseResult, MovimientoCartolaParsed } from './types';

function norm(h: string) {
  return h
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseFecha(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const utc = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(utc);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function num(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  const n = Number(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function cellStr(row: unknown[], i: number | undefined): string {
  if (i == null || i < 0) return '';
  return String(row[i] ?? '').trim();
}

type ColIdx = {
  fecha: number;
  glosa: number;
  cargo?: number;
  abono?: number;
  ref?: number;
};

function detectCols(headers: string[]): ColIdx | null {
  const norms = headers.map((h) => norm(String(h ?? '')));
  const find = (...cands: string[]) => {
    for (const c of cands) {
      const i = norms.findIndex((h) => h.includes(c));
      if (i >= 0) return i;
    }
    return -1;
  };
  const fecha = find('fecha');
  const glosa = find('descripcion', 'glosa', 'detalle', 'concepto');
  const cargo = find('cargo', 'cargos');
  const abono = find('abono', 'abonos');
  const ref = find('nrodocto', 'ndoc', 'documento', 'docto', 'referencia', 'comprobane', 'comprobante');
  if (fecha < 0 || glosa < 0 || (cargo < 0 && abono < 0)) return null;
  return {
    fecha,
    glosa,
    cargo: cargo >= 0 ? cargo : undefined,
    abono: abono >= 0 ? abono : undefined,
    ref: ref >= 0 ? ref : undefined,
  };
}

function parseSheetRows(
  rows: unknown[][],
  sheetName: string,
): { lineas: MovimientoCartolaParsed[]; avisos: string[] } {
  const avisos: string[] = [];
  let headerRow = -1;
  let cols: ColIdx | null = null;
  for (let r = 0; r < Math.min(rows.length, 40); r += 1) {
    const headers = (rows[r] ?? []).map((c) => String(c ?? ''));
    const detected = detectCols(headers);
    if (detected) {
      headerRow = r;
      cols = detected;
      break;
    }
  }
  if (headerRow < 0 || !cols) {
    return { lineas: [], avisos: [`Hoja "${sheetName}": sin header Fecha/Descripción/Cargos`] };
  }

  const lineas: MovimientoCartolaParsed[] = [];
  for (let r = headerRow + 1; r < rows.length; r += 1) {
    const row = (rows[r] ?? []) as unknown[];
    const fecha = parseFecha(row[cols.fecha]);
    if (!fecha) continue;
    const glosa = cellStr(row, cols.glosa) || `Mov ${sheetName} ${r + 1}`;
    const cargo = cols.cargo != null ? Math.abs(num(row[cols.cargo])) : 0;
    const abono = cols.abono != null ? Math.abs(num(row[cols.abono])) : 0;
    if (cargo === 0 && abono === 0) continue;
    const montoSigned = abono - cargo;
    const refRaw = cellStr(row, cols.ref);
    lineas.push({
      fecha,
      referencia: refRaw || `${sheetName.trim()}-${r + 1}`,
      glosa: `[${sheetName.trim()}] ${glosa}`.slice(0, 240),
      monto: Math.abs(montoSigned),
      tipo: montoSigned >= 0 ? 'INGRESO' : 'EGRESO',
      cargo: cargo || undefined,
      abono: abono || undefined,
      hoja: sheetName.trim(),
    });
  }
  if (!lineas.length) {
    avisos.push(`Hoja "${sheetName}": header OK pero sin movimientos`);
  }
  return { lineas, avisos };
}

/**
 * Cartolas multi-hoja estilo portal Banco de Chile / Almahue (pack MJ junio 2026):
 * ALM CLP, ALMAHUE USD, etc. Header ~fila 21 con columnas intercaladas.
 */
export function parseAlmahueWebWorkbook(
  XLSX: typeof import('xlsx'),
  buffer: Buffer,
  opts?: { hojas?: string[] },
): CartolaParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const lineas: MovimientoCartolaParsed[] = [];
  const avisos: string[] = [];
  const hojas: string[] = [];
  const allow = opts?.hojas?.map((h) => h.trim().toLowerCase()).filter(Boolean);
  const allowSet = allow?.length ? new Set(allow) : null;

  for (const sheetName of wb.SheetNames) {
    if (allowSet && !allowSet.has(sheetName.trim().toLowerCase())) continue;
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: true,
    }) as unknown[][];
    const parsed = parseSheetRows(rows, sheetName);
    if (parsed.lineas.length) {
      hojas.push(sheetName.trim());
      lineas.push(...parsed.lineas);
    } else {
      avisos.push(...parsed.avisos);
    }
  }

  if (!lineas.length) {
    avisos.push('Ninguna hoja del archivo produjo movimientos');
  } else {
    avisos.unshift(
      `Cartola multi-hoja: ${lineas.length} mov. en ${hojas.length} hoja(s): ${hojas.join(', ')}`,
    );
  }

  const inferred = inferPeriodoDesdeFechas(lineas.map((l) => l.fecha));
  return {
    lineas,
    avisos,
    formatoDetectado: 'almahue-web-multi',
    bancoDetectado: 'banco-chile-web',
    hojas: resumenHojas(lineas),
    suggestedPeriodo: inferred?.periodo,
    suggestedMesContable: inferred?.mesContable,
  };
}

export const almahueWebParser: BankParser = {
  id: 'almahue-web',
  label: 'Cartola web Banco Chile / Almahue (multi-hoja)',
  detect: ({ filename, buffer }) => {
    const n = filename.toLowerCase();
    if (/\.(txt|csv)$/.test(n)) return false;
    if (/cartola|alm|almahue|scotiabank/.test(n)) return true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx') as typeof import('xlsx');
      const wb = XLSX.read(buffer, { type: 'buffer', bookSheets: true });
      const names = (wb.SheetNames ?? []).map((s) => s.toLowerCase());
      return names.some((s) =>
        /alm|almahue|scotia|clp|usd|yuan|cny/.test(s),
      );
    } catch {
      return false;
    }
  },
  parse: async ({ buffer }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx') as typeof import('xlsx');
    const result = parseAlmahueWebWorkbook(XLSX, buffer);
    return result.lineas.length ? result : null;
  },
};
