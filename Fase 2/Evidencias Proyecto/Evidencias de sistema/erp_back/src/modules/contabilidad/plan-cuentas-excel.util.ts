/**
 * Parseo Excel Agrosoft hoja PlanDeCuenta → items bulk (código UI X-X-XX-XX).
 * Formato: encabezados cerca de fila 5, datos desde la siguiente (ver README parametrización).
 */
import { assertHojaPlantilla } from '../catalogos/catalog-excel.util';

export type PlanCuentaExcelItem = {
  codigo: string;
  codigoExcel: string;
  nombre: string;
  nivel: number;
  tipo: 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'GASTO';
  padreCodigo: string | null;
  /** undefined = no informado (no pisar al reimportar). */
  requiereCc?: boolean;
  requiereArea?: boolean;
  requiereEspecie?: boolean;
  requiereElemento?: boolean;
  centroCostoCodigos?: string[];
  elementoCostoCodigos?: string[];
  areaNegocioCodigos?: string[];
  noImputable: boolean;
  activa: boolean;
};

export type ParsePlanOptions = {
  aplicarArrastre?: boolean;
};

export type ParsePlanResult = {
  items: PlanCuentaExcelItem[];
  ignoredHeaders: string[];
  hasDimensionCodes: boolean;
};

function ynOptional(v: unknown): boolean | undefined {
  const s = String(v ?? '')
    .trim()
    .toUpperCase();
  if (!s) return undefined;
  if (['N', 'NO', '0', 'FALSE'].includes(s)) return false;
  if (['S', 'SI', 'Y', '1', 'TRUE'].includes(s)) return true;
  return undefined;
}

function tipoFromDigito(digito: number): PlanCuentaExcelItem['tipo'] {
  if (digito === 1) return 'ACTIVO';
  if (digito === 2) return 'PASIVO';
  if (digito === 3 || digito === 4) return 'PATRIMONIO';
  if (digito === 5) return 'INGRESO';
  return 'GASTO';
}

/** Normaliza código Excel a 9 dígitos. */
export function normalizeExcelCodigo(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(9, '0').slice(0, 9);
}

/** Truncar código Excel al patrón del nivel (padre / self). */
export function truncateExcelToNivel(excel9: string, nivel: number): string {
  const d = excel9.padStart(9, '0').slice(0, 9);
  if (nivel <= 1) return `${d[0]}00000000`;
  if (nivel === 2) return `${d.slice(0, 2)}0000000`;
  if (nivel === 3) return `${d.slice(0, 4)}00000`;
  if (nivel === 4) return `${d.slice(0, 6)}000`;
  return d;
}

/** ABCDEFGHI → A-B-CD-EF o A-B-CD-EF-GHI si nivel≥5 y GHI≠000 */
export function excelToUiCodigo(excel9: string, nivel: number): string {
  const d = excel9.padStart(9, '0').slice(0, 9);
  const a = d[0];
  const b = d[1];
  const cd = d.slice(2, 4);
  const ef = d.slice(4, 6);
  const ghi = d.slice(6, 9);
  if (nivel >= 5 && ghi !== '000') return `${a}-${b}-${cd}-${ef}-${ghi}`;
  return `${a}-${b}-${cd}-${ef}`;
}

function normLabel(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function parseCodigosLista(raw: unknown): string[] | undefined {
  const s = String(raw ?? '').trim();
  if (!s) return undefined;
  const list = [
    ...new Set(
      s
        .split(/[,;|/]/)
        .map((x) => x.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  return list.length ? list : undefined;
}

function findHeaderRow(rows: unknown[][]): {
  headerIdx: number;
  col: Record<string, number>;
  ignoredHeaders: string[];
} {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i] ?? [];
    const labels = row.map(normLabel);
    const idxCuenta = labels.findIndex(
      (l) => l === 'CUENTACONTABLE' || l === 'CTACONTABLE' || l === 'CODIGO' || l === 'CUENTA',
    );
    const idxDesc = labels.findIndex(
      (l) =>
        l === 'DESCRIPCION' ||
        l === 'NOMBRE' ||
        l === 'DESCRIPCIÓN' ||
        l === 'NOMCTACONTABLE',
    );
    if (idxCuenta >= 0 && idxDesc >= 0) {
      const col: Record<string, number> = {
        cuenta: idxCuenta,
        desc: idxDesc,
        nivel: labels.findIndex((l) => l === 'NIVEL'),
        cc: labels.findIndex((l) => l === 'CC'),
        aneg: labels.findIndex((l) => l === 'A.NEG' || l === 'ANEG' || l === 'A_NEG'),
        especie: labels.findIndex((l) => l === 'ESPECIE'),
        ec: labels.findIndex((l) => l === 'EC'),
        ccCodigos: labels.findIndex(
          (l, idx) =>
            idx !== idxCuenta &&
            (l === 'CENTROCOSTO' ||
              l === 'CENTROSCOSTO' ||
              l === 'CODIGOCC' ||
              l === 'CODIGOSCC' ||
              l === 'CENTROSDECOSTO'),
        ),
        ecCodigos: labels.findIndex(
          (l) =>
            l === 'ELEMENTOCOSTO' ||
            l === 'ELEMENTOSCOSTO' ||
            l === 'CODIGOEC' ||
            l === 'CODIGOSELEMENTO',
        ),
        anegCodigos: labels.findIndex(
          (l) =>
            l === 'AREANEGOCIO' ||
            l === 'AREASNEGOCIO' ||
            l === 'CODIGOANEG' ||
            l === 'CODIGOSAREA',
        ),
      };
      const mapped = new Set(Object.values(col).filter((idx) => idx >= 0));
      const ignoredHeaders = row
        .map((raw, idx) => ({ raw: String(raw ?? '').trim(), idx, label: labels[idx] }))
        .filter((h) => h.label && !mapped.has(h.idx))
        .map((h) => h.raw || h.label);
      return { headerIdx: i, col, ignoredHeaders };
    }
  }
  throw new Error(
    'No se encontró encabezado (CUENTACONTABLE / DESCRIPCION, o ctaContable / nomCtaContable).',
  );
}

function cell(row: unknown[], idx: number | undefined): unknown {
  if (idx == null || idx < 0) return undefined;
  return row[idx];
}

function inferNivel(codigoExcel: string, rawNivel: unknown): number {
  const nivel = Number(rawNivel ?? 0);
  if (Number.isFinite(nivel) && nivel >= 1 && nivel <= 5) return nivel;
  if (codigoExcel.endsWith('00000000')) return 1;
  if (codigoExcel.endsWith('0000000')) return 2;
  if (codigoExcel.endsWith('00000')) return 3;
  if (codigoExcel.endsWith('000')) return 4;
  return 5;
}

/**
 * Parsea filas SheetJS (header:1).
 */
export function parsePlanDeCuentasRows(
  rows: unknown[][],
  opts: ParsePlanOptions = {},
): ParsePlanResult {
  const { headerIdx, col, ignoredHeaders } = findHeaderRow(rows);
  const aplicarArrastre = Boolean(opts.aplicarArrastre);
  const last = {
    cc: '',
    aneg: '',
    especie: '',
    ec: '',
    ccCodigos: '',
    ecCodigos: '',
    anegCodigos: '',
  };

  const take = (row: unknown[], key: keyof typeof col, slot: keyof typeof last): string => {
    const raw = String(cell(row, col[key]) ?? '').trim();
    if (raw) {
      last[slot] = raw;
      return raw;
    }
    return aplicarArrastre ? last[slot] : '';
  };

  const raw: Array<{
    codigoExcel: string;
    nombre: string;
    nivel: number;
    requiereCc?: boolean;
    requiereArea?: boolean;
    requiereEspecie?: boolean;
    requiereElemento?: boolean;
    centroCostoCodigos?: string[];
    elementoCostoCodigos?: string[];
    areaNegocioCodigos?: string[];
  }> = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const codigoExcel = normalizeExcelCodigo(cell(row, col.cuenta));
    if (!codigoExcel) continue;
    const nombre = String(cell(row, col.desc) ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!nombre) continue;
    raw.push({
      codigoExcel,
      nombre,
      nivel: inferNivel(codigoExcel, cell(row, col.nivel)),
      requiereCc: ynOptional(take(row, 'cc', 'cc')),
      requiereArea: ynOptional(take(row, 'aneg', 'aneg')),
      requiereEspecie: ynOptional(take(row, 'especie', 'especie')),
      requiereElemento: ynOptional(take(row, 'ec', 'ec')),
      centroCostoCodigos: parseCodigosLista(take(row, 'ccCodigos', 'ccCodigos')),
      elementoCostoCodigos: parseCodigosLista(take(row, 'ecCodigos', 'ecCodigos')),
      areaNegocioCodigos: parseCodigosLista(take(row, 'anegCodigos', 'anegCodigos')),
    });
  }

  if (!raw.length) throw new Error('El Excel no contiene filas de cuentas útiles');

  const byExcel = new Map(raw.map((r) => [r.codigoExcel, r]));
  const items: PlanCuentaExcelItem[] = [];

  for (const r of raw) {
    const codigo = excelToUiCodigo(r.codigoExcel, r.nivel);
    let padreCodigo: string | null = null;
    if (r.nivel > 1) {
      let parentExcel = truncateExcelToNivel(r.codigoExcel, r.nivel - 1);
      let climb = r.nivel - 1;
      while (climb >= 1 && !byExcel.has(parentExcel)) {
        climb -= 1;
        if (climb < 1) {
          parentExcel = '';
          break;
        }
        parentExcel = truncateExcelToNivel(r.codigoExcel, climb);
      }
      if (parentExcel && byExcel.has(parentExcel)) {
        const parent = byExcel.get(parentExcel)!;
        padreCodigo = excelToUiCodigo(parent.codigoExcel, parent.nivel);
      }
    }
    const digito = Number(r.codigoExcel[0]);
    items.push({
      codigo,
      codigoExcel: r.codigoExcel,
      nombre: r.nombre,
      nivel: r.nivel,
      tipo: tipoFromDigito(digito),
      padreCodigo,
      requiereCc: r.requiereCc,
      requiereArea: r.requiereArea,
      requiereEspecie: r.requiereEspecie,
      requiereElemento: r.requiereElemento,
      centroCostoCodigos: r.centroCostoCodigos,
      elementoCostoCodigos: r.elementoCostoCodigos,
      areaNegocioCodigos: r.areaNegocioCodigos,
      noImputable: r.nivel < 5,
      activa: true,
    });
  }

  const uniq = new Map<string, PlanCuentaExcelItem>();
  for (const it of items) uniq.set(it.codigo, it);
  const sorted = [...uniq.values()].sort(
    (a, b) => a.nivel - b.nivel || a.codigo.localeCompare(b.codigo),
  );
  return {
    items: sorted,
    ignoredHeaders,
    hasDimensionCodes: sorted.some(
      (it) =>
        (it.centroCostoCodigos?.length ?? 0) > 0 ||
        (it.elementoCostoCodigos?.length ?? 0) > 0 ||
        (it.areaNegocioCodigos?.length ?? 0) > 0,
    ),
  };
}

export function parsePlanDeCuentasWorkbook(
  XLSX: typeof import('xlsx'),
  buffer: Buffer,
  opts: ParsePlanOptions = {},
): ParsePlanResult {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const preferred = assertHojaPlantilla(
    wb.SheetNames,
    /plandecuenta|cuentascontables/i,
    'PlanDeCuenta',
  );
  const sheet = wb.Sheets[preferred];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  }) as unknown[][];
  return parsePlanDeCuentasRows(rows, opts);
}
