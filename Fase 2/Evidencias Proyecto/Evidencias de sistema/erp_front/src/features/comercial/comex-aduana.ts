/** Catálogo Anexo 51 / SII. Fuente viva: http://comext.aduana.cl:7001/codigos/ */

import { PUERTOS_ADUANA } from './comex-aduana-puertos.ts';
import {
  BULTOS_ADUANA,
  CLAUSULAS_ADUANA,
  FORMAS_PAGO_ADUANA,
  MONEDAS_ADUANA,
  PAISES_ADUANA,
  UNIDADES_ADUANA,
  VIAS_ADUANA,
} from './comex-aduana-catalogos.ts';

export {
  PUERTOS_ADUANA,
  BULTOS_ADUANA,
  CLAUSULAS_ADUANA,
  FORMAS_PAGO_ADUANA,
  MONEDAS_ADUANA,
  PAISES_ADUANA,
  UNIDADES_ADUANA,
  VIAS_ADUANA,
};

export type CodigoAduana = { codigo: string; nombre: string };

export function labelAduana(row: CodigoAduana): string {
  return `${row.codigo} · ${row.nombre}`;
}

export function opcionesAduana(rows: readonly CodigoAduana[]): { value: string; label: string }[] {
  return rows.map((r) => ({ value: r.codigo, label: labelAduana(r) }));
}

/** Incluye el valor actual si el operador escribió un código fuera del seed. */
export function opcionesConCodigoLibre(
  rows: readonly CodigoAduana[],
  valor: string | null | undefined,
): { value: string; label: string }[] {
  const base = opcionesAduana(rows);
  const v = String(valor ?? '').trim();
  if (!v || base.some((o) => o.value === v)) return base;
  const known = rows.find((r) => r.codigo === v);
  return [...base, { value: v, label: known ? labelAduana(known) : v }];
}

function aliasMap(rows: readonly CodigoAduana[], extras: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...extras };
  for (const r of rows) {
    out[r.codigo] = r.codigo;
    out[r.nombre.toUpperCase()] = r.codigo;
  }
  return out;
}

function pickCodigo(raw: string | null | undefined, aliases: Record<string, string>, fallback = ''): string {
  const t = String(raw ?? '').trim();
  if (!t) return fallback;
  return aliases[t.toUpperCase()] ?? aliases[t] ?? t;
}

/** Modalidad de venta (CodModVenta). No está en comext; tabla Aduana/SII. 3 = consignación libre (factura MJ). */
export const MODALIDADES_ADUANA: readonly CodigoAduana[] = [
  { codigo: '1', nombre: 'A firme' },
  { codigo: '2', nombre: 'Bajo condición' },
  { codigo: '3', nombre: 'En consignación libre' },
  { codigo: '4', nombre: 'En consignación con mínimo a firme' },
  { codigo: '9', nombre: 'Sin pago' },
];

export const COMEX_IND_TRASLADO_DEFAULT = 'DESPACHO POR CUENTA DEL EMISOR';
export const COMEX_BULTO_MARCA_DEFAULT = '-';

const CLAUSULA_ALIAS = aliasMap(CLAUSULAS_ADUANA, { FOB: '5', CIF: '1' });
const VIA_ALIAS = aliasMap(VIAS_ADUANA, {
  MARITIMA: '1',
  MARÍTIMA: '1',
  '01': '1',
  'MARITIMA, FLUVIAL Y LACUSTRE': '1',
  'MARÍTIMA, FLUVIAL Y LACUSTRE': '1',
  AEREA: '4',
  AÉREA: '4',
  AEREO: '4',
  AÉREO: '4',
  '04': '4',
});
const PUERTO_ALIAS = aliasMap(PUERTOS_ADUANA, {
  PHILADELPHIA: '135',
  FILADELFIA: '135',
  VALPARAÍSO: '905',
  VALPARAISO: '905',
  'SAN ANTONIO': '906',
  'LOS ANGELES': '174',
  ROTTERDAM: '622',
  'OTROS PUERTOS EE.UU.': '180',
  'OTROS PUERTOS EE UU': '180',
  'OTROS PUERTOS EEUU': '180',
  'OTROS PUERTOS DE ESTADOS UNIDOS': '180',
  'OTROS PUERTOS DE ESTADOS UNIDOS NO ESPECIFICADOS': '180',
  /** Seed corto previo (no Anexo 51-11). */
  '201': '905',
  '203': '906',
  '2704': '174',
  '3014': '622',
  /**
   * Chancén / Chancay: no figura en Anexo 51-11 (Pía: SII sí, Aduana no).
   * Código oficial más cercano: 251 OTROS PTOS. DE PERU.
   */
  CHANCEN: '251',
  CHANCÉN: '251',
  CHANCAY: '251',
});
const MODALIDAD_ALIAS = aliasMap(MODALIDADES_ADUANA, {
  CONSIGNACION_LIBRE: '3',
  'CONSIGNACIÓN LIBRE': '3',
  'CONSIGNACION LIBRE': '3',
  'EN CONSIGNACION LIBRE': '3',
  'EN CONSIGNACIÓN LIBRE': '3',
  'A FIRME': '1',
  FIRME: '1',
  BAJO_CONDICION: '2',
  'BAJO CONDICION': '2',
  'BAJO CONDICIÓN': '2',
  'SIN PAGO': '9',
});
const BULTO_ALIAS = aliasMap(BULTOS_ADUANA, {
  CAJA: '22',
  CAJACARTON: '22',
  'CAJA CARTON': '22',
  'CAJA DE CARTON': '22',
  'CAJA DE CARTÓN': '22',
});
const MONEDA_ALIAS = aliasMap(MONEDAS_ADUANA, {
  USD: '13',
  DOLAR: '13',
  DÓLAR: '13',
  'DOLAR USA': '13',
  CNY: '48',
  YUAN: '48',
  RMB: '48',
  'YUAN CN': '48',
  EUR: '142',
  EURO: '142',
  /** Códigos que usamos un día en el seed corto (no Aduana). */
  '37': '142',
});
const PAIS_ALIAS = aliasMap(PAISES_ADUANA, {
  US: '225',
  USA: '225',
  'U.S.A.': '225',
  'U.S.A': '225',
  CN: '336',
  NL: '515',
  GB: '510',
  UK: '510',
  DE: '563',
  BR: '220',
  CA: '226',
  JP: '331',
});

export function codigoClausulaAduana(raw: string | null | undefined): string {
  return pickCodigo(raw, CLAUSULA_ALIAS);
}

export function codigoViaAduana(raw: string | null | undefined): string {
  return pickCodigo(raw, VIA_ALIAS);
}

export function codigoPuertoAduana(raw: string | null | undefined): string {
  return pickCodigo(raw, PUERTO_ALIAS, '');
}

export function codigoModalidadAduana(raw: string | null | undefined): string {
  return pickCodigo(raw, MODALIDAD_ALIAS);
}

export function codigoMonedaAduana(raw: string | null | undefined): string {
  return pickCodigo(raw, MONEDA_ALIAS);
}

export function codigoPaisAduana(raw: string | null | undefined): string {
  return pickCodigo(raw, PAIS_ALIAS, '');
}

export function codigoBultoAduana(raw: string | null | undefined): string {
  return pickCodigo(raw, BULTO_ALIAS, '');
}

const PAIS_CHILE_ADUANA = '997';
const PAIS_USA_ADUANA = '225';

function normGlosaAduana(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function paisDesdeGlosaPuerto(nombre: string): string | undefined {
  const n = normGlosaAduana(nombre);
  if (/\bEE UU\b|\bEEUU\b|ESTADOS UNIDOS|\bU S A\b/.test(n)) return PAIS_USA_ADUANA;
  if (/COREA N/.test(n)) return '334';
  if (/COREA S/.test(n)) return '333';
  let best: { codigo: string; len: number } | undefined;
  for (const p of PAISES_ADUANA) {
    if (p.codigo === '999' || p.codigo === '998') continue;
    const pn = normGlosaAduana(p.nombre);
    if (pn.length < 4 || pn === 'OTROS') continue;
    if (n.includes(pn) && (!best || pn.length > best.len)) best = { codigo: p.codigo, len: pn.length };
  }
  return best?.codigo;
}

let puertoPaisCache: Map<string, string> | null = null;

function mapaPuertoPaisAduana(): Map<string, string> {
  if (puertoPaisCache) return puertoPaisCache;
  const sorted = [...PUERTOS_ADUANA].sort((a, b) => Number(a.codigo) - Number(b.codigo));
  const out = new Map<string, string>();
  for (const p of sorted) {
    const num = Number(p.codigo);
    if ((num >= 900 && num <= 996) || num === 199 || (num >= 204 && num <= 209)) {
      out.set(p.codigo, PAIS_CHILE_ADUANA);
      continue;
    }
    const m = paisDesdeGlosaPuerto(p.nombre);
    if (m) out.set(p.codigo, m);
  }
  const maxGap = 10;
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (let i = 0; i < sorted.length; i++) {
      const pais = out.get(sorted[i].codigo);
      if (!pais) continue;
      const code = Number(sorted[i].codigo);
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= sorted.length) continue;
        if (out.has(sorted[j].codigo)) continue;
        if (Math.abs(Number(sorted[j].codigo) - code) > maxGap) continue;
        out.set(sorted[j].codigo, pais);
        expanded = true;
      }
    }
  }
  puertoPaisCache = out;
  return out;
}

export function paisDePuertoAduana(codigoPuerto: string | null | undefined): string | undefined {
  const code = codigoPuertoAduana(codigoPuerto) || String(codigoPuerto ?? '').trim();
  if (!code) return undefined;
  return mapaPuertoPaisAduana().get(code);
}

/** Desembarque: solo puertos del país destino. Embarque (Chile) no usa este filtro. */
export function puertosDesembarquePorPais(paisCodigo: string | null | undefined): readonly CodigoAduana[] {
  const pais = codigoPaisAduana(paisCodigo) || String(paisCodigo ?? '').trim();
  if (!pais) return PUERTOS_ADUANA;
  const mapped = PUERTOS_ADUANA.filter((p) => paisDePuertoAduana(p.codigo) === pais);
  return mapped.length ? mapped : PUERTOS_ADUANA;
}

/** Un puerto de Brasil no queda elegido si el destino es China. Código libre (sin país) sí se conserva. */
export function puertoPerteneceAPais(
  codigoPuerto: string | null | undefined,
  paisCodigo: string | null | undefined,
): boolean {
  const puerto = String(codigoPuerto ?? '').trim();
  if (!puerto) return true;
  const pais = codigoPaisAduana(paisCodigo) || String(paisCodigo ?? '').trim();
  if (!pais) return true;
  const delPuerto = paisDePuertoAduana(puerto);
  if (!delPuerto) return true;
  return delPuerto === pais;
}

export function opcionesPuertosDesembarque(
  paisCodigo: string | null | undefined,
  valorActual: string | null | undefined,
): { value: string; label: string; group?: string }[] {
  const pais = codigoPaisAduana(paisCodigo) || String(paisCodigo ?? '').trim();
  const primarios = pais
    ? PUERTOS_ADUANA.filter((p) => paisDePuertoAduana(p.codigo) === pais)
    : [];
  const primarioIds = new Set(primarios.map((p) => p.codigo));
  const secundarios = pais && primarios.length
    ? PUERTOS_ADUANA.filter((p) => !primarioIds.has(p.codigo))
    : [...PUERTOS_ADUANA];
  const toOpt = (p: CodigoAduana, group?: string) => ({
    value: p.codigo,
    label: labelAduana(p),
    group,
  });
  const base = pais && primarios.length
    ? [
      ...primarios.map((p) => toOpt(p, 'Puertos del país destino')),
      ...secundarios.map((p) => toOpt(p, 'Otros puertos')),
    ]
    : PUERTOS_ADUANA.map((p) => toOpt(p));
  const v = String(valorActual ?? '').trim();
  if (!v || base.some((o) => o.value === v)) return base;
  const known = PUERTOS_ADUANA.find((r) => r.codigo === v);
  return [...base, {
    value: v,
    label: known ? labelAduana(known) : v,
    group: 'Otros puertos',
  }];
}

/** ISO 4217 para UI, DTE y tesorería. */
export function isoMonedaComex(tpo: string | null | undefined): string {
  const code = codigoMonedaAduana(tpo);
  if (code === '48') return 'CNY';
  if (code === '142') return 'EUR';
  if (code === '13' || !code) return 'USD';
  const row = MONEDAS_ADUANA.find((r) => r.codigo === code);
  const glosa = String(row?.nombre ?? '').toUpperCase();
  if (/YUAN/.test(glosa)) return 'CNY';
  if (/EURO/.test(glosa)) return 'EUR';
  if (/DOLAR USA|DOLAR USA/.test(glosa)) return 'USD';
  if (/^[A-Z]{3}$/i.test(code)) return code.toUpperCase();
  return 'USD';
}

export function monedaCodigoDesdeTpo(tpo: string | null | undefined): string {
  return isoMonedaComex(tpo);
}

export const COMEX_DEFAULTS_ADUANA = {
  tpoMoneda: '13',
  monedaCodigo: 'USD',
  paisRecepCodigo: '225',
  indTraslado: COMEX_IND_TRASLADO_DEFAULT,
  bultoTipoCodigo: '22',
  bultoMarca: COMEX_BULTO_MARCA_DEFAULT,
  clausulaVenta: '5',
  viaTransporte: '1',
  modalidadVenta: '3',
  puertoEmbarque: '905',
} as const;

export function etiquetaCatalogoAduana(
  rows: readonly CodigoAduana[],
  codigo: string | null | undefined,
): string {
  const v = String(codigo ?? '').trim();
  if (!v) return '—';
  const row = rows.find((r) => r.codigo === v);
  return row ? labelAduana(row) : v;
}
