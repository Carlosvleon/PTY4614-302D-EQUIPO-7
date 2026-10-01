import { toast } from 'sonner';
import type { ExportColumn } from '@/lib/exportTable';
import { exportRowsToExcel } from '@/lib/exportTable';
import type { CentroCosto, CodigoFinanciero, CuentaContable, ElementoCosto } from '@/types/domain';

const NOTA =
  'La primera fila es un ejemplo. Reemplácela con sus datos y suba este mismo archivo. Una sola hoja.';

function plantilla(
  filename: string,
  sheetName: string,
  headers: string[],
  ejemplo: string[] | string[][],
  nota = NOTA,
) {
  const filas = Array.isArray(ejemplo[0]) ? (ejemplo as string[][]) : [ejemplo as string[]];
  const columns: ExportColumn<string[]>[] = headers.map((header, i) => ({
    key: String(i),
    header,
    value: (row) => row[i] ?? '',
  }));
  exportRowsToExcel(filename, columns, filas, sheetName, [[nota]]);
}

function siNo(v: boolean): string {
  return v ? 'SI' : 'NO';
}

/** Código de pantalla (1-1-01-01 o 1-1-01-01-001) → 9 dígitos del Excel. */
export function cuentaAExcel9(cuenta: Pick<CuentaContable, 'codigo' | 'codigoExcel'>): string {
  const stored = String(cuenta.codigoExcel ?? '').replace(/\D/g, '');
  if (stored.length >= 9) return stored.slice(0, 9);
  return String(cuenta.codigo ?? '').replace(/\D/g, '').padEnd(9, '0').slice(0, 9);
}

const centrosCols: ExportColumn<CentroCosto>[] = [
  { key: 'codigo', header: 'Código', value: (r) => r.codigo },
  { key: 'nombre', header: 'Nombre', value: (r) => r.nombre },
  { key: 'contacto', header: 'Contacto', value: (r) => r.contactoEncargado ?? '' },
  { key: 'activa', header: 'Activa', value: (r) => siNo(r.activa) },
];

const elementosCols: ExportColumn<ElementoCosto>[] = [
  { key: 'codigo', header: 'Código', value: (r) => r.codigo },
  { key: 'nombre', header: 'Nombre', value: (r) => r.nombre },
  { key: 'departamento', header: 'Departamento', value: (r) => r.departamento },
];

const codigosCols: ExportColumn<CodigoFinanciero>[] = [
  { key: 'codigo', header: 'Código', value: (r) => r.codigo },
  { key: 'nombre', header: 'Nombre', value: (r) => r.nombre },
  { key: 'activa', header: 'Activa', value: (r) => siNo(r.activa) },
];

function sn(v: boolean | undefined): string {
  if (v == null) return '';
  return v ? 'S' : 'N';
}

/** Columnas del PlanDeCuenta que envió María Jesús (incluye el grupo, nivel 1 a 4). */
export const PLANTILLA_CUENTAS_SHEET = 'PlanDeCuenta';
export const PLANTILLA_CUENTAS_NOTA =
  'Las primeras filas son un ejemplo: nivel 1 a 4 es el grupo (cuenta padre) y nivel 5 es la cuenta hoja. Reemplace el ejemplo con el plan completo, incluyendo cada cuenta padre. Una sola hoja.';
export const PLANTILLA_CUENTAS_HEADERS = [
  'CUENTACONTABLE',
  'Nombre',
  'NIVEL',
  'PLANTA',
  'CC',
  'A.NEG',
  'ESPECIE',
  'VARIEDAD',
  'EC',
  'AUXI',
  'DES',
  'REF',
  'FECHA.VEN',
  'CODFINAN',
] as const;
export const PLANTILLA_CUENTAS_EJEMPLO: string[][] = [
  ['100000000', 'ACTIVO', '1', 'N', 'N', 'N', 'N', 'N', '0', 'N', 'N', 'N', '', ''],
  ['110000000', 'ACTIVO CIRCULANTE', '2', 'N', 'N', 'N', 'N', 'N', '0', 'N', 'N', 'N', '', ''],
  ['110100000', 'DISPONIBLE', '3', 'N', 'N', 'N', 'N', 'N', '0', 'N', 'N', 'N', '', ''],
  ['110101000', 'CAJA', '4', 'N', 'N', 'N', 'N', 'N', '0', 'N', 'N', 'N', '', ''],
  ['110101001', 'CAJA', '5', 'N', 'N', 'N', 'N', 'N', 'N', '0', 'N', 'N', 'N', ''],
];

const cuentasCols: ExportColumn<CuentaContable>[] = [
  { key: 'codigo', header: 'CUENTACONTABLE', value: (r) => cuentaAExcel9(r) },
  { key: 'nombre', header: 'Nombre', value: (r) => r.nombre },
  { key: 'nivel', header: 'NIVEL', value: (r) => r.nivel ?? '' },
  { key: 'planta', header: 'PLANTA', value: () => '' },
  { key: 'cc', header: 'CC', value: (r) => sn(r.requiereCc) },
  { key: 'aneg', header: 'A.NEG', value: (r) => sn(r.requiereArea) },
  { key: 'especie', header: 'ESPECIE', value: (r) => sn(r.requiereEspecie) },
  { key: 'variedad', header: 'VARIEDAD', value: () => '' },
  { key: 'ec', header: 'EC', value: (r) => sn(r.requiereElemento) },
  { key: 'auxi', header: 'AUXI', value: () => '' },
  { key: 'des', header: 'DES', value: () => '' },
  { key: 'ref', header: 'REF', value: () => '' },
  { key: 'fechaVen', header: 'FECHA.VEN', value: () => '' },
  { key: 'codFinan', header: 'CODFINAN', value: () => '' },
];

export function descargarPlantillaCentros() {
  plantilla('plantilla-centros-de-costo', 'Centros de costo', ['Código', 'Nombre', 'Contacto', 'Activa'], [
    '10100',
    'ADMINISTRACION',
    'Mario González',
    'SI',
  ]);
}

function exportar<T>(filename: string, columns: ExportColumn<T>[], rows: T[], sheetName: string) {
  if (!rows.length) toast.message('No hay registros. El archivo trae solo el encabezado.');
  exportRowsToExcel(filename, columns, rows, sheetName);
}

export function exportarCentros(rows: CentroCosto[]) {
  exportar('centros-de-costo', centrosCols, rows, 'Centros de costo');
}

export function descargarPlantillaElementos() {
  plantilla('plantilla-elementos-de-costo', 'Elementos de costo', ['Código', 'Nombre', 'Departamento'], [
    '1001',
    'SERVICIOS DE REPARACION',
    'GENERAL',
  ]);
}

export function exportarElementos(rows: ElementoCosto[]) {
  exportar('elementos-de-costo', elementosCols, rows, 'Elementos de costo');
}

export function descargarPlantillaCodigos() {
  plantilla('plantilla-codigos-financieros', 'Codigos financieros', ['Código', 'Nombre', 'Activa'], [
    '1002',
    'VENTA EXPORTACION CEREZAS',
    'SI',
  ]);
}

export function exportarCodigos(rows: CodigoFinanciero[]) {
  exportar('codigos-financieros', codigosCols, rows, 'Codigos financieros');
}

export function descargarPlantillaCuentas() {
  plantilla(
    'plantilla-cuentas-contables',
    PLANTILLA_CUENTAS_SHEET,
    [...PLANTILLA_CUENTAS_HEADERS],
    PLANTILLA_CUENTAS_EJEMPLO,
    PLANTILLA_CUENTAS_NOTA,
  );
}

export function exportarCuentas(rows: CuentaContable[]) {
  exportar('cuentas-contables', cuentasCols, rows, PLANTILLA_CUENTAS_SHEET);
}
