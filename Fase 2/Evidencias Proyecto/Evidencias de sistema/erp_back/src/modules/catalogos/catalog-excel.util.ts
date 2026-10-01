/** Parseo Excel de maestros (código + nombre) con encabezados flexibles. */

export type CatalogExcelRow = {
  codigo: string;
  nombre: string;
  extra: Record<string, string>;
};

export type ParseCatalogResult = {
  items: CatalogExcelRow[];
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

function col(labels: string[], aliases: string[], skip = new Set<number>()): number {
  for (const a of aliases) {
    const exact = labels.findIndex((l, i) => !skip.has(i) && l === a);
    if (exact >= 0) return exact;
  }
  for (const a of aliases) {
    if (a.length < 5) continue;
    const fuzzy = labels.findIndex((l, i) => !skip.has(i) && l.includes(a));
    if (fuzzy >= 0) return fuzzy;
  }
  return -1;
}

function cell(row: unknown[], idx: number): string {
  if (idx < 0) return '';
  return String(row[idx] ?? '').trim();
}

export function parseCodigoNombreRows(rows: unknown[][]): ParseCatalogResult {
  let headerIdx = -1;
  let idxCodigo = -1;
  let idxNombre = -1;
  const extraIdx: Record<string, number> = {};

  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const labels = (rows[i] ?? []).map(normHeader);
    idxCodigo = col(labels, [
      'CODIGO',
      'COD',
      'CODE',
      'CCOS',
      'CODELEMENTOCOSTO',
      'CODFINANCIERO',
      'CTACONTABLE',
      'ELEMENTODECOSTO',
      'ELEMENTO',
      'CENTRODECOSTO',
      'CENTROCOSTO',
    ]);
    idxNombre = col(
      labels,
      [
        'NOMBRECENTRO',
        'NOMCCOS',
        'NOMELEMENTOCOSTO',
        'NOMFINANCIERO',
        'NOMCTACONTABLE',
        'CENTRODECOSTO',
        'CENTROCOSTO',
        'NOMBRE',
        'DESCRIPCION',
        'DESC',
        'GLOSA',
      ],
      idxCodigo >= 0 ? new Set([idxCodigo]) : new Set(),
    );
    if (idxCodigo >= 0 && idxNombre >= 0) {
      headerIdx = i;
      extraIdx.departamento = col(labels, ['DEPARTAMENTO', 'DEPTO', 'DEPT', 'AREA']);
      extraIdx.vigencia = col(labels, ['VIGENCIA', 'ESTADO']);
      extraIdx.contacto = col(labels, ['CONTACTO', 'ENCARGADO', 'CONTACTOENCARGADO']);
      extraIdx.activa = col(labels, ['ACTIVA', 'ACTIVO']);
      extraIdx.vigenciaDesde = col(labels, ['VIGENCIADESDE', 'DESDE', 'FECHAINICIO']);
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error('No se encontraron columnas Código y Nombre/Descripción');
  }

  const headerRow = rows[headerIdx] ?? [];
  const labels = headerRow.map(normHeader);
  const mapped = new Set<number>(
    [idxCodigo, idxNombre, ...Object.values(extraIdx)].filter((i) => i >= 0),
  );
  const ignoredHeaders = labels
    .map((label, i) => ({ label, raw: String(headerRow[i] ?? '').trim(), i }))
    .filter((h) => h.label && !mapped.has(h.i))
    .map((h) => h.raw || h.label);

  const items: CatalogExcelRow[] = [];
  const seen = new Set<string>();
  const skippedInFile: string[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const codigo = cell(row, idxCodigo).toUpperCase();
    const nombre = cell(row, idxNombre);
    if (!codigo || !nombre) continue;
    if (seen.has(codigo)) {
      skippedInFile.push(codigo);
      continue;
    }
    seen.add(codigo);
    items.push({
      codigo,
      nombre,
      extra: {
        departamento: cell(row, extraIdx.departamento),
        vigencia: cell(row, extraIdx.vigencia),
        contacto: cell(row, extraIdx.contacto),
        activa: cell(row, extraIdx.activa),
        vigenciaDesde: cell(row, extraIdx.vigenciaDesde),
      },
    });
  }
  if (!items.length) throw new Error('El archivo no tiene filas de datos');
  return { items, skippedInFile, ignoredHeaders };
}

/** Una sola hoja, y el nombre tiene que ser el de la plantilla de ese mantenedor. */
export function assertHojaPlantilla(
  sheetNames: string[],
  preferred: RegExp,
  hojaPlantilla: string,
): string {
  if (!sheetNames.length) throw new Error('El archivo no tiene hojas');
  if (sheetNames.length > 1) {
    throw new Error(
      `Este archivo tiene ${sheetNames.length} hojas. Descargue la plantilla de este mantenedor (una hoja llamada «${hojaPlantilla}») y suba solo ese archivo.`,
    );
  }
  const name = sheetNames[0];
  if (!preferred.test(name.replace(/\s+/g, ''))) {
    throw new Error(
      `La hoja «${name}» no corresponde a este mantenedor. Use la plantilla, hoja «${hojaPlantilla}».`,
    );
  }
  return name;
}

export function parseCodigoNombreWorkbook(
  XLSX: typeof import('xlsx'),
  buffer: Buffer,
  preferredSheet: RegExp,
  hojaPlantilla: string,
): ParseCatalogResult {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const name = assertHojaPlantilla(wb.SheetNames, preferredSheet, hojaPlantilla);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], {
    header: 1,
    defval: null,
    raw: false,
  }) as unknown[][];
  return parseCodigoNombreRows(rows);
}

/** Fecha ISO, d/m/aaaa o serial Excel. */
export function parseFlexibleDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(`${s.slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(year, month - 1, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + n * 86400000);
  }
  return null;
}

/** Vacío = no informado (no pisar al reimportar). */
export function parseActiva(raw: string): boolean | undefined {
  const s = raw.trim().toUpperCase();
  if (!s) return undefined;
  if (['N', 'NO', '0', 'FALSE', 'INACTIVO'].includes(s)) return false;
  if (['S', 'SI', '1', 'TRUE', 'ACTIVO', 'ACTIVA'].includes(s)) return true;
  return undefined;
}

/** Vacío = no informado (no forzar VIGENTE sobre un ANULADO ya grabado). */
export function parseVigenciaElemento(raw: string): 'VIGENTE' | 'ANULADO' | undefined {
  const s = raw.trim().toUpperCase();
  if (!s) return undefined;
  if (s === 'ANULADO' || s === 'INACTIVO' || s === 'N') return 'ANULADO';
  if (s === 'VIGENTE' || s === 'ACTIVO' || s === 'S') return 'VIGENTE';
  return undefined;
}
