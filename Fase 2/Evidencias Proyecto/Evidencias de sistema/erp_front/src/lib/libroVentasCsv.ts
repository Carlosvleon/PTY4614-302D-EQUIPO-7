export function clavesFolioLibro(
  tipo: string,
  folio: string,
  folioOficial?: string | null,
): string[] {
  const t = (tipo || '').toUpperCase();
  const keys = new Set<string>();
  const add = (value: string) => {
    const k = String(value || '').trim().toLowerCase();
    if (k) keys.add(`${t}|${k}`);
  };
  add(folio);
  if (folioOficial) add(folioOficial);
  return [...keys];
}
export const LIBRO_VENTAS_MAX_BYTES = 2 * 1024 * 1024;
export const LIBRO_VENTAS_MAX_ROWS = 1_000;

const HEADERS = ['folio', 'tipo', 'cliente', 'fecha', 'neto'] as const;
const TIPOS_PERMITIDOS = new Set(['FACTURA', 'NC', 'ND']);

export type LibroVentasCsvRow = {
  line: number;
  folio: string;
  tipo: string;
  cliente: string;
  fecha: string;
  neto: number;
  error?: string;
};

export type LibroVentasCsvResult = {
  rows: LibroVentasCsvRow[];
  fatalError?: string;
};

function parseDelimited(text: string, delimiter: string): { rows: string[][]; error?: string } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (char === '\n') {
      row.push(field.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (quoted) return { rows: [], error: 'Hay una comilla sin cerrar en el archivo.' };
  row.push(field.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  return { rows };
}

function delimiterFromHeader(header: string): string {
  const counts = [
    { delimiter: ';', count: (header.match(/;/g) ?? []).length },
    { delimiter: ',', count: (header.match(/,/g) ?? []).length },
    { delimiter: '\t', count: (header.match(/\t/g) ?? []).length },
  ];
  return counts.sort((a, b) => b.count - a.count)[0]?.delimiter ?? ';';
}

function validIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]);
}

function parseAmount(value: string): number {
  const compact = value.replace(/\s/g, '');
  if (!compact) return Number.NaN;
  let normalized = compact;
  const comma = compact.lastIndexOf(',');
  const dot = compact.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot
      ? compact.replace(/\./g, '').replace(',', '.')
      : compact.replace(/,/g, '');
  } else if (comma >= 0) {
    normalized = compact.replace(',', '.');
  }
  return Number(normalized);
}

export function parseLibroVentasCsv(
  rawText: string,
  opts?: { sizeBytes?: number; maxRows?: number },
): LibroVentasCsvResult {
  const sizeBytes = opts?.sizeBytes ?? new TextEncoder().encode(rawText).byteLength;
  if (sizeBytes > LIBRO_VENTAS_MAX_BYTES) {
    return { rows: [], fatalError: 'El archivo supera el máximo de 2 MB.' };
  }

  const text = rawText.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const parsed = parseDelimited(text, delimiterFromHeader(firstLine));
  if (parsed.error) return { rows: [], fatalError: parsed.error };
  if (!parsed.rows.length) {
    return { rows: [], fatalError: 'El archivo está vacío.' };
  }

  const headers = parsed.rows[0].map((value) => value.trim().toLowerCase());
  if (headers.length !== HEADERS.length || !HEADERS.every((header, index) => headers[index] === header)) {
    return {
      rows: [],
      fatalError: 'Columnas inválidas. Use este orden: folio;tipo;cliente;fecha;neto',
    };
  }

  const dataRows = parsed.rows.slice(1);
  const maxRows = opts?.maxRows ?? LIBRO_VENTAS_MAX_ROWS;
  if (dataRows.length > maxRows) {
    return { rows: [], fatalError: `El archivo supera el máximo de ${maxRows} filas.` };
  }

  return {
    rows: dataRows.map((values, index) => {
      const [folio = '', rawTipo = '', cliente = '', fecha = '', rawNeto = ''] = values;
      const tipo = rawTipo.toUpperCase();
      const neto = parseAmount(rawNeto);
      const errors: string[] = [];
      if (values.length !== HEADERS.length) errors.push(`se esperaban ${HEADERS.length} columnas`);
      if (!folio) errors.push('folio obligatorio');
      if (!cliente) errors.push('cliente obligatorio');
      if (!TIPOS_PERMITIDOS.has(tipo)) errors.push('tipo permitido: FACTURA, NC o ND');
      if (!validIsoDate(fecha)) errors.push('fecha inválida; use AAAA-MM-DD');
      if (!Number.isFinite(neto) || neto < 0) errors.push('neto debe ser un número finito no negativo');
      return {
        line: index + 2,
        folio,
        tipo,
        cliente,
        fecha,
        neto: Number.isFinite(neto) && neto >= 0 ? neto : 0,
        error: errors.length ? `Fila ${index + 2}: ${errors.join('; ')}` : undefined,
      };
    }),
  };
}
