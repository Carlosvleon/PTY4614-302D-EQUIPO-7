import { parseFlexibleDate } from './catalog-excel.util';

export type IndicadorBcImportRow = {
  fecha: string;
  usd?: number;
  cny?: number;
  eur?: number;
};

export type ParseIndicadoresBcResult = {
  items: IndicadorBcImportRow[];
  skippedInFile: string[];
  ignoredHeaders: string[];
};

function normHeader(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function col(labels: string[], aliases: string[]): number {
  for (const a of aliases) {
    const exact = labels.findIndex((l) => l === a);
    if (exact >= 0) return exact;
  }
  for (const a of aliases) {
    if (a.length < 4) continue;
    const fuzzy = labels.findIndex((l) => l.includes(a));
    if (fuzzy >= 0) return fuzzy;
  }
  return -1;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fecha de calendario: serial/UTC-midnight → UTC; resto → local. */
function calendarIso(d: Date): string {
  if (
    d.getUTCHours() === 0
    && d.getUTCMinutes() === 0
    && d.getUTCSeconds() === 0
    && d.getUTCMilliseconds() === 0
  ) {
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function cell(row: unknown[], idx: number): string {
  if (idx < 0) return '';
  const v = row[idx];
  if (v instanceof Date) return calendarIso(v);
  return String(v ?? '').trim();
}

function fechaFromCell(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return calendarIso(raw);
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 20000 && raw < 80000) {
    const epoch = Date.UTC(1899, 11, 30);
    return calendarIso(new Date(epoch + Math.round(raw) * 86400000));
  }
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = parseFlexibleDate(s);
  return d ? calendarIso(d) : null;
}

function parseTcNumber(raw: string): number | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s || /^nd$/i.test(s) || s === '-') return undefined;
  const n = s.includes(',') && !s.includes('.')
    ? Number(s.replace(/\./g, '').replace(',', '.'))
    : Number(s.replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

/** Encabezados: fecha, usd/dolar, cny/yuan, eur/euro (opcional). */
export function parseIndicadoresBcRows(rows: unknown[][]): ParseIndicadoresBcResult {
  let headerIdx = -1;
  let idxFecha = -1;
  let idxUsd = -1;
  let idxCny = -1;
  let idxEur = -1;

  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const labels = (rows[i] ?? []).map(normHeader);
    idxFecha = col(labels, ['FECHA', 'DIA', 'DATE']);
    idxUsd = col(labels, ['USD', 'DOLAR', 'DOLAROBSERVADO', 'TIPODECAMBIOUSD', 'TCUSD']);
    idxCny = col(labels, ['CNY', 'YUAN', 'RMB', 'RENMINBI']);
    idxEur = col(labels, ['EUR', 'EURO']);
    if (idxFecha >= 0 && (idxUsd >= 0 || idxCny >= 0 || idxEur >= 0)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error('No se encontraron columnas Fecha y USD/CNY/EUR');
  }

  const headerRow = rows[headerIdx] ?? [];
  const labels = headerRow.map(normHeader);
  const mapped = new Set(
    [idxFecha, idxUsd, idxCny, idxEur].filter((i) => i >= 0),
  );
  const ignoredHeaders = labels
    .map((label, i) => ({ label, raw: String(headerRow[i] ?? '').trim(), i }))
    .filter((h) => h.label && !mapped.has(h.i))
    .map((h) => h.raw || h.label);

  const items: IndicadorBcImportRow[] = [];
  const seen = new Set<string>();
  const skippedInFile: string[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const fecha = fechaFromCell(idxFecha >= 0 ? row[idxFecha] : '');
    if (!fecha) continue;
    const usd = parseTcNumber(cell(row, idxUsd));
    const cny = parseTcNumber(cell(row, idxCny));
    const eur = parseTcNumber(cell(row, idxEur));
    if (usd == null && cny == null && eur == null) continue;
    if (seen.has(fecha)) {
      skippedInFile.push(fecha);
      continue;
    }
    seen.add(fecha);
    items.push({ fecha, usd, cny, eur });
  }
  if (!items.length) throw new Error('El archivo no tiene filas de indicadores');
  return { items, skippedInFile, ignoredHeaders };
}

function splitCsvLine(line: string, fs: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === fs && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseCsvBuffer(buffer: Buffer): unknown[][] {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const first = lines[0];
  const fs = first.includes(';') && first.split(';').length >= first.split(',').length ? ';' : ',';
  return lines.map((line) => splitCsvLine(line, fs));
}

export function parseIndicadoresBcWorkbook(
  XLSX: typeof import('xlsx'),
  buffer: Buffer,
  filename?: string,
): ParseIndicadoresBcResult {
  const sniff = buffer.slice(0, 400).toString('utf8').replace(/^\uFEFF/, '');
  const firstLine = sniff.split(/\r?\n/, 1)[0] ?? '';
  const looksCsv = Boolean(filename && /\.csv$/i.test(filename))
    || /^fecha[;,]/i.test(firstLine.trim());
  if (looksCsv) {
    return parseIndicadoresBcRows(parseCsvBuffer(buffer));
  }
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const name = wb.SheetNames[0];
  if (!name) throw new Error('El archivo no tiene hojas');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], {
    header: 1,
    defval: null,
    raw: true,
    dateNF: 'yyyy-mm-dd',
  }) as unknown[][];
  return parseIndicadoresBcRows(rows);
}

export const INDICADORES_BC_IMPORT_MAX = 25_000;
