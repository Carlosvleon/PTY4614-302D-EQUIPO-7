import type { CanonicalDocumentV1 } from '../../common/types';
import {
  EXPORT_RECEIVER_RUT,
  isForeignReceiverId,
  looksLikeForeignReceiverId,
} from '../../common/receiver-id';

export const GOSOCKET_DEFAULT_MAPPING = '11111111-1111-1111-1111-111111111111';

/** XSD SII formato_dte 2.5. GoSocket no documenta estos tope; el SII sí (RCH cvc-maxLength). */
const NMB_EMISOR_MAX = 100;
const RZN_SOC_RECEP_MAX = 100;
const GIRO_EMIS_MAX = 80;
const GIRO_RECEP_MAX = 40;
const DIR_ORIGEN_MAX = 60;
const DIR_RECEP_MAX = 70;
const CMNA_CIUDAD_MAX = 20;
const NMB_ITEM_MAX = 80;
const DSC_ITEM_MAX = 1000;
const UNMD_ITEM_MAX = 4;
const TIPOS_CON_CODREF = new Set([56, 61, 111, 112]);
const TIPOS_EXPORT_DTE = new Set([110, 111, 112]);
const TIPOS_DOMICILIO_NACIONAL = new Set([33, 34, 52, 56, 61]);

export class GufValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GufValidationError';
  }
}

export function buildGufXml(doc: CanonicalDocumentV1): string {
  const cae = buildCae(doc);
  const fechaEmis = formatDate(doc.documento.fechaEmision);
  const dirOrigenRaw = doc.emisor.direccion?.trim();
  if (!dirOrigenRaw) {
    throw new GufValidationError(
      'Falta dirección de origen del emisor (DirOrigen / DomFiscal/Calle)',
    );
  }
  const dirOrigen = truncate(dirOrigenRaw, DIR_ORIGEN_MAX);
  const nmbRecepRaw = doc.receptor.razonSocial?.trim();
  if (!nmbRecepRaw) {
    throw new GufValidationError('Falta razón social del receptor');
  }
  const nmbRecep = truncate(nmbRecepRaw, RZN_SOC_RECEP_MAX);
  if (!Number.isFinite(doc.totales.total)) {
    throw new GufValidationError('Falta monto total del documento');
  }
  if (!doc.lineas.length) {
    throw new GufValidationError('El documento no tiene ítems');
  }
  const acteco = resolveActeco(doc);
  const rutEmisor = normalizeRut(doc.emisor.rut);
  const rutRecep = receiverDocumentNumber(doc);
  const giroEmis = truncate(doc.emisor.giro || doc.emisor.razonSocial, GIRO_EMIS_MAX);
  const giroRecep = truncate(doc.receptor.giro || nmbRecep, GIRO_RECEP_MAX);
  const rznSoc = truncate(doc.emisor.razonSocial, NMB_EMISOR_MAX);
  const comunaEmis = truncate(doc.emisor.comuna?.trim() || '', CMNA_CIUDAD_MAX);
  const ciudadEmis = truncate(doc.emisor.ciudad?.trim() || comunaEmis, CMNA_CIUDAD_MAX);
  const dirRecep = truncate(doc.receptor.direccion?.trim() || '', DIR_RECEP_MAX);
  const comunaRecep = truncate(doc.receptor.comuna?.trim() || '', CMNA_CIUDAD_MAX);
  const ciudadRecepRaw = doc.receptor.ciudad?.trim() || '';
  const ciudadRecep = truncate(ciudadRecepRaw || comunaRecep, CMNA_CIUDAD_MAX);
  const cmnaRecepXml = truncate(comunaRecep || ciudadRecep, CMNA_CIUDAD_MAX);
  const tipoDte = doc.documento.tipoDte;
  if (TIPOS_DOMICILIO_NACIONAL.has(tipoDte) && (!dirRecep || !comunaRecep)) {
    throw new GufValidationError(
      'Falta dirección o comuna del receptor (DirRecep / CmnaRecep). El SII rechaza el DTE sin esos campos.',
    );
  }
  if (TIPOS_EXPORT_DTE.has(tipoDte) && (!dirRecep || !cmnaRecepXml)) {
    throw new GufValidationError(
      'Falta dirección o ciudad/comuna del receptor (DirRecep / CiudadRecep). El Gap las marca obligatorias en DTE 110/111/112.',
    );
  }
  const emitDomicilioRecep = Boolean(dirRecep && cmnaRecepXml);
  const mntNeto = money(doc.totales.neto);
  const mntIva = money(doc.totales.iva);
  const mntTotal = money(doc.totales.total);
  const mntExeExport = resolveExportMntExe(doc);
  const exentoDoc = Boolean(doc.indicadores?.exento || doc.indicadores?.exportacion);
  const tasaNum = exentoDoc
    ? 0
    : (Number(doc.totales.tasaIva) >= 0.01 ? Number(doc.totales.tasaIva) : 19);
  const tasaXml = tasaNum >= 0.01 ? money(tasaNum) : '';

  return [
    "<?xml version='1.0' encoding='ISO-8859-1'?>",
    "<DTE version='1.0'>",
    `<Documento ID='${xmlEscape(`DTE-${doc.source.documentoId || doc.documento.numeroInterno}`)}'>`,
    '<Encabezado>',
    '<IdDoc>',
    tag('Tipo', String(doc.documento.tipoDte)),
    // Folio SII: el portal/CAF asigna <Numero>. No enviar (indicación GoSocket QA).
    tag('NumeroInterno', doc.documento.numeroInterno),
    tag('FechaEmis', fechaEmis),
    doc.documento.fechaVencimiento ? tag('FechaPago', formatDate(doc.documento.fechaVencimiento)) : '',
    '</IdDoc>',
    '<Emisor>',
    tag('IDEmisor', rutEmisor),
    tag('RUTEmisor', rutEmisor),
    tag('NmbEmisor', rznSoc),
    tag('RznSoc', rznSoc),
    '<NombreEmisor>',
    tag('PrimerNombre', giroEmis),
    '</NombreEmisor>',
    tag('GiroEmis', giroEmis),
    // formato_dte 2.5: Acteco va antes de DirOrigen (Pablo 01/09).
    tag('Acteco', acteco),
    extraInfo('ExtraInfoEmisor', 'Acteco', acteco),
    '<DomFiscal>',
    tag('Calle', dirOrigen),
    tag('Municipio', comunaEmis),
    tag('Ciudad', ciudadEmis),
    '</DomFiscal>',
    '</Emisor>',
    '<Receptor>',
    tag('IDReceptor', rutRecep),
    tag('RUTRecep', rutRecep),
    '<DocRecep>',
    tag('NroDocRecep', rutRecep),
    '</DocRecep>',
    tag('NmbRecep', nmbRecep),
    tag('RznSocRecep', nmbRecep),
    '<NombreRecep>',
    tag('PrimerNombre', giroRecep),
    '</NombreRecep>',
    tag('GiroRecep', giroRecep),
    ...(emitDomicilioRecep
      ? [
        '<DomFiscalRcp>',
        tag('Calle', dirRecep),
        tag('Ciudad', ciudadRecep),
        tag('Municipio', cmnaRecepXml),
        '</DomFiscalRcp>',
        '<LugarRecep>',
        tag('Calle', dirRecep),
        tag('Ciudad', ciudadRecep),
        tag('Municipio', cmnaRecepXml),
        '</LugarRecep>',
        tag('DirRecep', dirRecep),
        tag('CmnaRecep', cmnaRecepXml),
        tag('CiudadRecep', ciudadRecep),
      ]
      : []),
    '</Receptor>',
    '<Totales>',
    ...buildExportTotalesGuf(doc),
    tag('SubTotal', mntNeto),
    tag('MntNeto', mntNeto),
    tag('MntBase', mntNeto),
    ...(mntExeExport != null ? [tag('MntExe', money(mntExeExport))] : []),
    ...(tasaXml
      ? [tag('TasaImp', tasaXml), tag('TasaIVA', tasaXml)]
      : []),
    tag('MntImp', mntIva),
    tag('MontoImp', mntIva),
    tag('IVA', mntIva),
    tag('MntTotal', mntTotal),
    tag('VlrPagar', mntTotal),
    extraInfo('ExtraInfoTotal', 'MntNeto', mntNeto),
    extraInfo('ExtraInfoTotal', 'MntTotal', mntTotal),
    ...(tasaXml ? [extraInfo('ExtraInfoTotal', 'TasaIVA', tasaXml)] : []),
    extraInfo('ExtraInfoTotal', 'IVA', mntIva),
    extraInfo('ExtraInfoTotal', 'IVAProp', mntIva),
    '</Totales>',
    buildExportOtraMonedaGuf(doc),
    buildComexXml(doc),
    '</Encabezado>',
    ...doc.lineas.map((linea, index) => {
      if (!Number.isFinite(linea.montoNeto)) {
        throw new GufValidationError(`Falta monto del ítem ${linea.nro || index + 1}`);
      }
      const nmbItem = truncate((linea.descripcion ?? '').trim(), NMB_ITEM_MAX);
      if (!nmbItem) {
        throw new GufValidationError(`Falta nombre del ítem ${linea.nro || index + 1}`);
      }
      // GAP Chile: SII NmbItem / TED IT1 ← GUF DscComercial. DscItem es la
      // descripción opcional: no copiar el nombre (Pablo: duplicar es mala práctica).
      const dscExtra = truncate((linea.detalle ?? '').trim(), DSC_ITEM_MAX);
      const monto = money(linea.montoNeto);
      const precio = itemPrice(linea.precio);
      return [
        '<Detalle>',
        tag('NroLinDet', String(linea.nro || index + 1)),
        tag('NmbItem', nmbItem),
        ...(dscExtra && dscExtra !== nmbItem ? [tag('DscItem', dscExtra)] : []),
        tag('DscComercial', nmbItem),
        tag('QtyItem', numberValue(linea.cantidad)),
        tag('UnmdItem', truncate(linea.unidad || 'UN', UNMD_ITEM_MAX)),
        tag('PrcItem', precio),
        tag('PrcBrutoItem', precio),
        tag('MontoItem', monto),
        tag('MontoNetoItem', monto),
        tag('MontoTotalItem', monto),
        ...buildLineaOtrMnda(doc, linea),
        '</Detalle>',
      ].join('');
    }),
    buildReferencia(doc),
    cae,
    '</Documento>',
    '</DTE>',
  ].filter(Boolean).join('');
}

export function normalizeRut(rut: string): string {
  return rut.replace(/\./g, '').trim().toUpperCase();
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function resolveCaeFromCanonical(
  doc: CanonicalDocumentV1,
): { nro: string; fecha: string } {
  const nro = doc.emisor.nroResolucion?.trim() ?? '';
  const fecha = doc.emisor.fechaResolucion?.trim() ?? '';
  if (!nro || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new GufValidationError(
      'El canónico no trae número y fecha de resolución del emisor (configurarlos en el ERP)',
    );
  }
  return { nro, fecha };
}

export function resolveActecoFromCanonical(doc: CanonicalDocumentV1): string {
  const acteco = doc.emisor.acteco?.trim() ?? '';
  if (!/^\d{6}$/.test(acteco)) {
    throw new GufValidationError(
      'El canónico no trae Acteco SII de 6 dígitos del emisor (configurarlo en el ERP)',
    );
  }
  return acteco;
}

function resolveActeco(doc: CanonicalDocumentV1): string {
  return resolveActecoFromCanonical(doc);
}

function extraInfo(
  tagName: 'ExtraInfoEmisor' | 'ExtraInfoTotal' | 'ExtraInfoTransporte' | 'ExtraInfoCarga' | 'ExtraInfoDoc',
  name: string,
  value: string,
): string {
  return `<${tagName} name='${xmlEscape(name)}'>${xmlEscape(value)}</${tagName}>`;
}

function tag(name: string, value: string): string {
  return `<${name}>${xmlEscape(value)}</${name}>`;
}

function formatDate(value: string): string {
  return value.includes('T') ? value : value.slice(0, 10);
}

function money(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** XSD SII Dec12_6Type: PrcItem minInclusive 0.000001. No usar money() (toFixed 2 deja "0"). */
function itemPrice(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0.000001) return '0.000001';
  if (Number.isInteger(n)) return String(n);
  const formatted = n.toFixed(6).replace(/\.?0+$/, '');
  return formatted === '0' || formatted === '' ? '0.000001' : formatted;
}

function numberValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function receiverDocumentNumber(doc: CanonicalDocumentV1): string {
  const receiverId = doc.receptor.rut;
  // SII HED-2-832: 110/111/112 siempre 55.555.555-5, aunque el cliente tenga RUT chileno.
  if (TIPOS_EXPORT_DTE.has(doc.documento.tipoDte)) {
    if (looksLikeForeignReceiverId(receiverId) && !isForeignReceiverId(receiverId)) {
      throw new Error('Identificador receptor extranjero inválido para GUF');
    }
    return EXPORT_RECEIVER_RUT;
  }
  if (looksLikeForeignReceiverId(receiverId)) {
    throw new Error('Identificador receptor extranjero inválido para GUF');
  }
  return normalizeRut(receiverId);
}

function buildCae(doc: CanonicalDocumentV1): string {
  const { nro, fecha } = resolveCaeFromCanonical(doc);
  return [
    '<CAE>',
    tag('NroResolucion', nro),
    tag('FechaResolucion', fecha),
    '</CAE>',
  ].join('');
}

function resolveExportMntExe(doc: CanonicalDocumentV1): number | null {
  if (!TIPOS_EXPORT_DTE.has(doc.documento.tipoDte)) return null;
  const exento = doc.totales.exento;
  if (exento != null && Number.isFinite(exento) && exento > 0) return exento;
  return doc.totales.neto;
}

function foldAduana(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function asAduanaCodeOrMap(raw: string, mapped: Record<string, string>): string {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const folded = foldAduana(trimmed);
  return mapped[folded] ?? trimmed;
}

function mapClausulaVenta(raw: string): string {
  return asAduanaCodeOrMap(raw, { FOB: '5', CIF: '1' });
}

function mapViaTransporte(raw: string): string {
  return asAduanaCodeOrMap(raw, {
    MARITIMA: '1',
    AEREO: '4',
    AEREA: '4',
    MARITIMA_FLUVIAL_Y_LACUSTRE: '1',
    'MARITIMA,_FLUVIAL_Y_LACUSTRE': '1',
  });
}

function mapModalidadVenta(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const folded = foldAduana(trimmed);
  if (
    folded === 'CONSIGNACION_LIBRE'
    || folded === 'EN_CONSIGNACION_LIBRE'
    || folded === 'CONSIGNACION'
  ) {
    return '3';
  }
  if (folded === 'BAJO_CONDICION' || folded === 'BAJO_CONDICIONES') return '2';
  if (folded === 'A_FIRME' || folded === 'FIRME') return '1';
  if (folded === 'SIN_PAGO') return '9';
  return trimmed;
}

function mapCodTpoBultos(raw: string): string {
  const trimmed = raw.trim();
  const folded = foldAduana(trimmed);
  if (
    trimmed === '22'
    || folded === 'CAJA'
    || folded === 'CAJACARTON'
    || folded === 'CAJA_DE_CARTON'
    || folded === 'CAJA_CARTON'
  ) {
    return '22';
  }
  if (/^\d+$/.test(trimmed)) return trimmed;
  return trimmed;
}

/**
 * XSD SII `TipMonType` (OtraMoneda/TpoMoneda): nombres, no código Aduana.
 * Enviar `13` hace que el XSLT de GoSocket deje el tag vacío y el SII rechace
 * `cvc-enumeration-valid: Value ''`.
 */
const TPO_MONEDA_SII: Record<string, string> = {
  '13': 'DOLAR USA',
  USD: 'DOLAR USA',
  DOLAR: 'DOLAR USA',
  DOLLAR: 'DOLAR USA',
  'DOLAR USA': 'DOLAR USA',
  '142': 'EURO',
  CNY: 'YUAN',
  YUAN: 'YUAN',
  'YUAN CN': 'YUAN',
  '48': 'YUAN',
  '37': 'EURO',
  EURO: 'EURO',
  EUR: 'EURO',
  'PESO CL': 'PESO CL',
  CLP: 'PESO CL',
  PESO: 'PESO CL',
};

function resolveTpoMoneda(
  doc: CanonicalDocumentV1,
  comex: NonNullable<CanonicalDocumentV1['documento']['comex']>,
): string {
  const candidates = [
    comex.tpoMoneda,
    doc.documento.moneda,
  ];
  for (const raw of candidates) {
    const key = String(raw ?? '').trim().toUpperCase();
    if (!key) continue;
    if (TPO_MONEDA_SII[key]) return TPO_MONEDA_SII[key];
    if (TPO_MONEDA_SII[key.replace(/\s+/g, ' ')]) return TPO_MONEDA_SII[key.replace(/\s+/g, ' ')];
  }
  return 'DOLAR USA';
}

function requireExportComex(
  doc: CanonicalDocumentV1,
): NonNullable<CanonicalDocumentV1['documento']['comex']> {
  const c = doc.documento.comex;
  if (!c) {
    throw new GufValidationError(
      'Faltan datos COMEX obligatorios para DTE de exportación (110/111/112)',
    );
  }
  const codPaisRecep = c.codPaisRecep?.trim() || '';
  if (!codPaisRecep) {
    throw new GufValidationError(
      'Falta CodPaisRecep (código Aduana del país del receptor) en DTE de exportación',
    );
  }
  if (doc.documento.tipoDte === 110) {
    if (c.tipoCambio == null || !Number.isFinite(c.tipoCambio)) {
      throw new GufValidationError('Falta TpoCambio (tipo de cambio) en factura de exportación 110');
    }
    if (c.bultoCantidad == null || !Number.isFinite(c.bultoCantidad)) {
      throw new GufValidationError('Falta TotBultos (bultoCantidad) en factura de exportación 110');
    }
  }
  return c;
}

function clpOtraMonedaParts(
  doc: CanonicalDocumentV1,
  c: NonNullable<CanonicalDocumentV1['documento']['comex']>,
): { tc?: string; mntExe?: string; mntTot?: string } {
  const usdRef = doc.totales.exento ?? doc.totales.total;
  const tc = c.tipoCambio;
  const out: { tc?: string; mntExe?: string; mntTot?: string } = {};
  if (tc != null && Number.isFinite(tc)) out.tc = numberValue(tc);
  const mntExeRaw = c.montoExentoOtraMoneda ?? c.montoOtraMoneda;
  if (mntExeRaw != null && Number.isFinite(mntExeRaw)) {
    out.mntExe = money(toClpOtraMoneda(mntExeRaw, tc, usdRef));
  }
  if (c.montoOtraMoneda != null && Number.isFinite(c.montoOtraMoneda)) {
    out.mntTot = money(toClpOtraMoneda(c.montoOtraMoneda, tc, usdRef));
  }
  return out;
}

/** Plantilla GUF: ExtraInfoTotal de otra moneda vive en Totales, no en <OtraMoneda>. */
function buildExportTotalesGuf(doc: CanonicalDocumentV1): string[] {
  if (!TIPOS_EXPORT_DTE.has(doc.documento.tipoDte)) return [];
  const c = requireExportComex(doc);
  const monedaTx = resolveTpoMoneda(doc, c);
  const clp = clpOtraMonedaParts(doc, c);
  const out: string[] = [
    tag('TpoMoneda', monedaTx),
    extraInfo('ExtraInfoTotal', 'TpoMoneda', monedaTx),
    tag('Moneda', monedaTx),
    extraInfo('ExtraInfoTotal', 'Moneda', monedaTx),
    // Gap: OtraMoneda/TpoMoneda = ExtraInfoTotal[@name='OtrMnda'] (PESO CL).
    // ExtraInfoTotal TpoMoneda alimenta Totales, no OtraMoneda (RCH L67).
    extraInfo('ExtraInfoTotal', 'OtrMnda', 'PESO CL'),
  ];
  if (clp.tc) {
    out.push(tag('FctConv', clp.tc));
    out.push(extraInfo('ExtraInfoTotal', 'FctConv', clp.tc));
  }
  if (clp.mntExe) {
    out.push(extraInfo('ExtraInfoTotal', 'MntExeOtrMnda', clp.mntExe));
  }
  if (clp.mntTot) {
    out.push(extraInfo('ExtraInfoTotal', 'MntTotOtrMnda', clp.mntTot));
    out.push(extraInfo('ExtraInfoTotal', 'MntNetoOtrMnda', clp.mntTot));
  }
  return out;
}

/**
 * SII formato_dte tag 129: Encabezado/OtraMoneda (hermano de Totales).
 * ExtraInfoTotal name=TpoMoneda alimenta Totales, no este nodo: un segundo
 * ExtraInfo TpoMoneda=PESO CL deja OtraMoneda vacío (RCH L67). Montos en CLP.
 */
function buildExportOtraMonedaGuf(doc: CanonicalDocumentV1): string {
  if (!TIPOS_EXPORT_DTE.has(doc.documento.tipoDte)) return '';
  const c = doc.documento.comex;
  if (!c) return '';
  const clp = clpOtraMonedaParts(doc, c);
  const parts = ['<OtraMoneda>', tag('TpoMoneda', 'PESO CL')];
  if (clp.tc) {
    parts.push(tag('TpoCambio', clp.tc));
    parts.push(tag('FctConv', clp.tc));
  }
  if (clp.mntExe) parts.push(tag('MntExeOtrMnda', clp.mntExe));
  if (clp.mntTot) parts.push(tag('MntTotOtrMnda', clp.mntTot));
  parts.push('</OtraMoneda>');
  return parts.join('');
}

/**
 * Conversión a CLP para OtraMoneda / OtrMnda. Si el monto ya parece CLP, no remultiplica.
 */
function toClpOtraMoneda(
  amount: number,
  tipoCambio: number | undefined,
  montoTransaccion: number,
): number {
  if (!Number.isFinite(amount)) return amount;
  if (tipoCambio == null || !Number.isFinite(tipoCambio) || tipoCambio <= 0) {
    return amount;
  }
  const alreadyClp =
    montoTransaccion > 0 && amount > montoTransaccion * tipoCambio * 0.5;
  if (alreadyClp) return Math.round(amount);
  return Math.round(amount * tipoCambio);
}

/** Plantilla GUF: OtrMnda en detalle (Moneda = código BC de la conversión). */
function buildLineaOtrMnda(
  doc: CanonicalDocumentV1,
  linea: CanonicalDocumentV1['lineas'][number],
): string[] {
  if (!TIPOS_EXPORT_DTE.has(doc.documento.tipoDte)) return [];
  const c = doc.documento.comex;
  if (!c) return [];
  const clp = clpOtraMonedaParts(doc, c);
  const usdRef = doc.totales.exento ?? doc.totales.total;
  const mntLin = toClpOtraMoneda(linea.montoNeto, c.tipoCambio, usdRef);
  const prcLin = toClpOtraMoneda(linea.precio, c.tipoCambio, usdRef);
  const parts = ['<OtrMnda>', tag('Moneda', 'CLP')];
  if (clp.tc) parts.push(tag('FctConv', clp.tc));
  parts.push(tag('PrcOtrMon', money(prcLin)));
  parts.push(tag('MontoItemOtrMnda', money(mntLin)));
  parts.push('</OtrMnda>');
  return parts;
}

function buildComexXml(doc: CanonicalDocumentV1): string {
  if (!TIPOS_EXPORT_DTE.has(doc.documento.tipoDte)) {
    return '';
  }
  const c = requireExportComex(doc);
  const codPaisRecep = c.codPaisRecep?.trim() || '';
  const transporte: string[] = ['<Transporte>'];
  if (c.bultoCantidad != null && Number.isFinite(c.bultoCantidad)) {
    const tot = String(Math.trunc(c.bultoCantidad));
    transporte.push('<InfoCarga>');
    transporte.push(tag('Cantidad', tot));
    if (c.bultoTipoCodigo?.trim()) {
      transporte.push(extraInfo('ExtraInfoCarga', 'CodTpoBultos', mapCodTpoBultos(c.bultoTipoCodigo)));
    }
    if (c.bultoMarca?.trim()) {
      transporte.push(extraInfo('ExtraInfoCarga', 'Marcas', c.bultoMarca.trim()));
    }
    transporte.push('</InfoCarga>');
    transporte.push(extraInfo('ExtraInfoTransporte', 'TotBultos', tot));
  }
  transporte.push(extraInfo('ExtraInfoTransporte', 'CodPaisRecep', codPaisRecep));
  if (c.paisDestino?.trim()) {
    transporte.push(extraInfo('ExtraInfoTransporte', 'CodPaisDestin', c.paisDestino.trim()));
  }
  if (c.puertoEmbarque?.trim()) {
    transporte.push(extraInfo('ExtraInfoTransporte', 'CodPtoEmbarque', c.puertoEmbarque.trim()));
  }
  if (c.puertoDesembarque?.trim()) {
    transporte.push(extraInfo('ExtraInfoTransporte', 'CodPtoDesemb', c.puertoDesembarque.trim()));
  }
  if (c.clausulaVenta?.trim()) {
    transporte.push(extraInfo('ExtraInfoTransporte', 'CodClauVenta', mapClausulaVenta(c.clausulaVenta)));
  }
  if (c.viaTransporte?.trim()) {
    transporte.push(extraInfo('ExtraInfoTransporte', 'CodViaTransp', mapViaTransporte(c.viaTransporte)));
  }
  if (c.modalidadVenta?.trim()) {
    transporte.push(extraInfo('ExtraInfoTransporte', 'CodModVenta', mapModalidadVenta(c.modalidadVenta)));
  }
  transporte.push('</Transporte>');
  return transporte.join('');
}

function buildReferencia(doc: CanonicalDocumentV1): string {
  const ref = doc.documento.referencia;
  const needsCodRef = TIPOS_CON_CODREF.has(doc.documento.tipoDte);
  if (needsCodRef && ref?.codRef != 1 && ref?.codRef != 2 && ref?.codRef != 3) {
    throw new GufValidationError(
      'Código REF de NC/ND debe ser 1 (anula), 2 (corrige texto) o 3 (corrige montos)',
    );
  }
  const tipo = ref?.tipo?.trim() ?? '';
  const folio = ref?.folio?.trim() ?? '';
  if (!tipo && !folio && ref?.codRef == null) return '';
  /** 110/33: no emitir Referencia vacía (SII RCH: FchRef obligatorio si el nodo existe). */
  if (!needsCodRef && (!tipo || !folio)) return '';
  if (needsCodRef && (!tipo || !folio)) {
    throw new GufValidationError('NC/ND de exportación exige tipo y folio SII de la factura 110');
  }
  const fechaRef = ref?.fecha?.trim() || doc.documento.fechaEmision;

  return [
    '<Referencia>',
    tag('NroLinRef', '1'),
    tipo ? tag('TpoDocRef', tipo) : '',
    folio ? tag('NumeroRef', folio) : '',
    fechaRef ? tag('FechaRef', formatDate(fechaRef)) : '',
    ref?.codRef != null ? tag('CodRef', String(ref.codRef)) : '',
    '</Referencia>',
  ].filter(Boolean).join('');
}
