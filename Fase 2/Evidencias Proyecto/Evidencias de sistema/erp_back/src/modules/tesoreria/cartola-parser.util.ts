/**
 * Parser básico CSV/Excel/PDF de movimientos de cartola bancaria.
 * Parsers banco-específicos: `./parsers/` (detectBank + stubs Chile/Estado/Santander).
 */

export type { MovimientoCartolaParsed, CartolaParseResult } from './parsers/types';
import type { MovimientoCartolaParsed, CartolaParseResult } from './parsers/types';
import { avisoFormatoNoReconocido, detectBank, tryParseBankSpecific } from './parsers/detect-bank';
import { FORMATO_NO_RECONOCIDO } from './parsers/types';

function normHeader(h: string) {
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
    // Excel serial date
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
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function num(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return raw;
  const s = String(raw)
    .trim()
    .replace(/\s/g, '')
    .replace(/\./g, (_m, _i, str: string) => (str.includes(',') ? '' : _m))
    .replace(',', '.');
  const n = Number(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function splitCsvLine(line: string): string[] {
  if (line.includes(';')) return line.split(';').map((p) => p.trim());
  if (line.includes('\t')) return line.split('\t').map((p) => p.trim());
  return line.split(',').map((p) => p.trim());
}

function parseTipoCelda(raw: unknown): 'INGRESO' | 'EGRESO' | null {
  if (raw == null || raw === '') return null;
  const t = String(raw).trim().toUpperCase();
  if (!t) return null;
  if (/(INGRESO|ABONO|HABER|CREDITO|CR[EÉ]DITO|DEPOSITO|DEP[OÓ]SITO)/.test(t)) return 'INGRESO';
  if (/(EGRESO|CARGO|DEBE|DEBITO|D[EÉ]BITO|RETIRO|CARGO)/.test(t)) return 'EGRESO';
  return null;
}

function mapRow(
  cells: unknown[],
  idx: {
    fecha: number;
    glosa: number;
    monto?: number;
    cargo?: number;
    abono?: number;
    ref?: number;
    tipo?: number;
  },
  rowIndex: number,
): MovimientoCartolaParsed | null {
  const fecha = parseFecha(cells[idx.fecha]);
  if (!fecha) return null;
  const glosa = String(cells[idx.glosa] ?? '').trim() || `Movimiento ${rowIndex + 1}`;
  const ref =
    idx.ref != null && cells[idx.ref] != null && String(cells[idx.ref]).trim()
      ? String(cells[idx.ref]).trim()
      : `MOV-${rowIndex + 1}`;

  let montoSigned = 0;
  if (idx.cargo != null || idx.abono != null) {
    const cargo = idx.cargo != null ? Math.abs(num(cells[idx.cargo])) : 0;
    const abono = idx.abono != null ? Math.abs(num(cells[idx.abono])) : 0;
    montoSigned = abono - cargo;
  } else if (idx.monto != null) {
    montoSigned = num(cells[idx.monto]);
  }
  if (montoSigned === 0) return null;
  // Columna tipo explícita manda sobre el signo del monto (TES-CART-TIPO).
  const tipoCol = idx.tipo != null ? parseTipoCelda(cells[idx.tipo]) : null;
  const tipo: 'INGRESO' | 'EGRESO' = tipoCol ?? (montoSigned >= 0 ? 'INGRESO' : 'EGRESO');
  return {
    fecha,
    referencia: ref,
    glosa,
    monto: Math.abs(montoSigned),
    tipo,
  };
}

function detectHeaderIndex(headers: string[]) {
  const norms = headers.map(normHeader);
  const find = (...cands: string[]) => {
    for (const c of cands) {
      const i = norms.findIndex((h) => h.includes(c) || h === c);
      if (i >= 0) return i;
    }
    return -1;
  };
  const findExact = (...cands: string[]) => {
    for (const c of cands) {
      const i = norms.findIndex((h) => h === c);
      if (i >= 0) return i;
    }
    return -1;
  };
  const fecha = find('fecha', 'date', 'fec');
  const glosa = find('glosa', 'descripcion', 'detalle', 'concepto', 'descrip', 'movimiento');
  const monto = find('monto', 'importe', 'valor', 'amount');
  // cargo/abono: columnas de monto, no confundir con columna «tipo»
  const cargo = find('cargo', 'debe', 'debito', 'retiro');
  const abono = find('abono', 'haber', 'credito', 'deposito');
  const ref = find('referencia', 'ref', 'nro', 'numero', 'documento', 'folio', 'id');
  // Columna tipo explícita (TES-CART-TIPO): tipomov / tipo / tipomovimiento
  const tipo = findExact('tipo', 'tipomov', 'tipomovimiento', 'naturaleza');
  return { fecha, glosa, monto, cargo, abono, ref, tipo };
}

export function parseCartolaCsv(text: string): CartolaParseResult {
  const avisos: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) {
    return { lineas: [], avisos: ['Archivo vacío'], formatoDetectado: 'csv' };
  }

  const first = splitCsvLine(lines[0]);
  const headerIdx = detectHeaderIndex(first);
  const hasHeader = headerIdx.fecha >= 0 && headerIdx.glosa >= 0
    && (headerIdx.monto >= 0 || headerIdx.cargo >= 0 || headerIdx.abono >= 0);

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const idx = hasHeader
    ? {
        fecha: headerIdx.fecha,
        glosa: headerIdx.glosa,
        monto: headerIdx.monto >= 0 ? headerIdx.monto : undefined,
        cargo: headerIdx.cargo >= 0 ? headerIdx.cargo : undefined,
        abono: headerIdx.abono >= 0 ? headerIdx.abono : undefined,
        ref: headerIdx.ref >= 0 ? headerIdx.ref : undefined,
        tipo: headerIdx.tipo >= 0 ? headerIdx.tipo : undefined,
      }
    : { fecha: 0, glosa: 1, monto: 2, ref: 3 };

  if (!hasHeader) {
    avisos.push('Sin headers: se asume fecha;glosa;monto[;referencia]');
  }

  const lineas: MovimientoCartolaParsed[] = [];
  dataLines.forEach((line, i) => {
    const cells = splitCsvLine(line);
    const m = mapRow(cells, idx, i);
    if (m) lineas.push(m);
  });

  if (!lineas.length) {
    avisos.push(
      'No se parsearon movimientos. Formato esperado CSV: fecha;glosa;monto o con headers fecha/glosa/monto|cargo|abono.',
    );
  }
  return { lineas, avisos, formatoDetectado: hasHeader ? 'csv-headers' : 'csv-simple' };
}

export function parseCartolaWorkbook(
  XLSX: typeof import('xlsx'),
  buffer: Buffer,
): CartolaParseResult {
  // Preferir parser multi-hoja MJ si aplica
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parseAlmahueWebWorkbook } = require('./parsers/almahue-web') as {
      parseAlmahueWebWorkbook: (
        x: typeof import('xlsx'),
        b: Buffer,
      ) => CartolaParseResult;
    };
    const mj = parseAlmahueWebWorkbook(XLSX, buffer);
    if (mj.lineas.length) return mj;
  } catch {
    /* fallback genérico */
  }

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { lineas: [], avisos: ['Excel sin hojas'], formatoDetectado: 'xlsx' };
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];
  const nonEmpty = rows.filter((r) => Array.isArray(r) && r.some((c) => c !== '' && c != null));
  if (!nonEmpty.length) {
    return { lineas: [], avisos: ['Hoja vacía'], formatoDetectado: 'xlsx' };
  }

  // Buscar header en las primeras 40 filas (cartolas banco web)
  let headerAt = 0;
  let headerIdx = detectHeaderIndex((nonEmpty[0] as unknown[]).map((c) => String(c ?? '')));
  let hasHeader = headerIdx.fecha >= 0 && headerIdx.glosa >= 0
    && (headerIdx.monto >= 0 || headerIdx.cargo >= 0 || headerIdx.abono >= 0);
  if (!hasHeader) {
    for (let i = 1; i < Math.min(nonEmpty.length, 40); i += 1) {
      const cand = detectHeaderIndex((nonEmpty[i] as unknown[]).map((c) => String(c ?? '')));
      const ok = cand.fecha >= 0 && cand.glosa >= 0
        && (cand.monto >= 0 || cand.cargo >= 0 || cand.abono >= 0);
      if (ok) {
        headerAt = i;
        headerIdx = cand;
        hasHeader = true;
        break;
      }
    }
  }

  const data = hasHeader ? nonEmpty.slice(headerAt + 1) : nonEmpty;
  const idx = hasHeader
    ? {
        fecha: headerIdx.fecha,
        glosa: headerIdx.glosa,
        monto: headerIdx.monto >= 0 ? headerIdx.monto : undefined,
        cargo: headerIdx.cargo >= 0 ? headerIdx.cargo : undefined,
        abono: headerIdx.abono >= 0 ? headerIdx.abono : undefined,
        ref: headerIdx.ref >= 0 ? headerIdx.ref : undefined,
        tipo: headerIdx.tipo >= 0 ? headerIdx.tipo : undefined,
      }
    : { fecha: 0, glosa: 1, monto: 2, ref: 3 };

  const avisos: string[] = [];
  if (!hasHeader) avisos.push('Excel sin headers reconocibles: columnas A=fecha B=glosa C=monto');
  else if (headerAt > 0) avisos.push(`Header detectado en fila ${headerAt + 1}`);

  const lineas: MovimientoCartolaParsed[] = [];
  data.forEach((cells, i) => {
    const m = mapRow(cells as unknown[], idx, i);
    if (m) lineas.push(m);
  });
  if (!lineas.length) {
    avisos.push('No se parsearon filas. Use headers fecha/glosa/monto o cargo/abono.');
  }
  return { lineas, avisos, formatoDetectado: hasHeader ? 'xlsx-headers' : 'xlsx-simple' };
}

const FECHA_RE = /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})/;
const MONTO_TOKEN = /[-+]?\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|[-+]?\d+(?:[.,]\d{1,2})?/g;

/**
 * Heurística sobre texto plano de PDF: una línea con fecha + al menos un monto.
 */
export function parseCartolaPdfText(text: string): CartolaParseResult {
  const avisos: string[] = [
    'Parser PDF genérico (mejor esfuerzo): requiere texto seleccionable. '
      + 'PDFs escaneados o layouts banco-específicos pueden fallar; prefiera CSV/Excel si es posible.',
  ];
  const raw = (text || '').replace(/\r/g, '\n');
  if (!raw.trim()) {
    return {
      lineas: [],
      avisos: [...avisos, 'PDF sin texto extraíble (¿escaneado?)'],
      formatoDetectado: 'pdf',
    };
  }

  const lines = raw.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const lineas: MovimientoCartolaParsed[] = [];
  let idx = 0;

  for (const line of lines) {
    const fm = FECHA_RE.exec(line);
    if (!fm) continue;
    const fecha = parseFecha(fm[1]);
    if (!fecha) continue;

    const afterFecha = line.slice(fm.index! + fm[0].length);
    const montos: number[] = [];
    let mm: RegExpExecArray | null;
    const re = new RegExp(MONTO_TOKEN.source, 'g');
    while ((mm = re.exec(afterFecha)) != null) {
      const n = num(mm[0]);
      if (n !== 0 && Math.abs(n) >= 1) montos.push(n);
    }
    if (!montos.length) continue;

    let montoSigned = montos[montos.length - 1];
    if (montos.length === 2) {
      const [, b] = montos;
      montoSigned = b;
    }

    const glosa = afterFecha
      .replace(new RegExp(MONTO_TOKEN.source, 'g'), ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200) || `Movimiento PDF ${idx + 1}`;

    const tipo: 'INGRESO' | 'EGRESO' = montoSigned >= 0 ? 'INGRESO' : 'EGRESO';
    lineas.push({
      fecha,
      referencia: `PDF-${idx + 1}`,
      glosa,
      monto: Math.abs(montoSigned),
      tipo,
    });
    idx += 1;
  }

  if (!lineas.length) {
    avisos.push(
      'No se detectaron filas fecha+monto en el PDF. Exporte a CSV/Excel o envíe muestra del banco para un parser específico.',
    );
  } else if (lineas.length < 3) {
    avisos.push(`Solo se detectaron ${lineas.length} movimiento(s); revise el preview antes de importar.`);
  }

  return { lineas, avisos, formatoDetectado: 'pdf-text' };
}

export async function parseCartolaPdf(
  buffer: Buffer,
  filename = 'cartola.pdf',
): Promise<CartolaParseResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages?: number }>;
  try {
    const data = await pdfParse(buffer);
    const text = data.text || '';
    const bankTry = await tryParseBankSpecific({ buffer, filename, textHint: text.slice(0, 2000) });
    if (bankTry?.result.lineas.length) {
      return bankTry.result;
    }
    const bank = detectBank({ buffer, filename, textHint: text.slice(0, 2000) });
    const res = parseCartolaPdfText(text);
    if (bank) {
      res.bancoDetectado = bank.id;
      res.avisos.unshift(
        `Banco detectado: ${bank.label}. Parser específico aún sin muestra calibrada — usando genérico.`,
      );
    }
    if (data.numpages != null) {
      res.avisos.unshift(`PDF: ${data.numpages} página(s).`);
    }
    if (!res.lineas.length) {
      res.avisos = avisoFormatoNoReconocido(res.avisos);
    }
    return res;
  } catch (e) {
    return {
      lineas: [],
      avisos: avisoFormatoNoReconocido([
        `No se pudo leer el PDF: ${e instanceof Error ? e.message : String(e)}. `
          + 'Use CSV/Excel o un PDF con texto seleccionable.',
        FORMATO_NO_RECONOCIDO,
      ]),
      formatoDetectado: 'pdf-error',
    };
  }
}
