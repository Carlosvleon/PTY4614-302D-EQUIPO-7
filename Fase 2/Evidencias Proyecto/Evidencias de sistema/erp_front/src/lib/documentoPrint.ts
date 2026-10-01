import type { Empresa, PlantillaDocumento } from '@/types/domain';
import { fmtCLP } from '@/lib/utils';

/** Logo SVG mínimo Almahue (sin assets del cliente). */
export const DEFAULT_ALMAHUE_LOGO_SVG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="56" viewBox="0 0 220 56">
      <rect width="220" height="56" rx="6" fill="#1a4d2e"/>
      <text x="16" y="36" font-family="Georgia,serif" font-size="26" fill="#f5f0e6">Almahue</text>
    </svg>`,
  );

export const DEFAULT_PLANTILLA_DOC: PlantillaDocumento = {
  showLogo: true,
  showAddress: true,
  showFooter: true,
  footerText: 'Documento generado desde Almahue ERP · uso interno',
  watermarkText: '',
  watermarkOpacity: 0.1,
  columns: {
    folio: true,
    contraparte: true,
    fecha: true,
    neto: true,
    estado: true,
    extra: true,
  },
  /** Acento azul estilo Better Software / ref Sergio Reu5 */
  colorPrimario: '#2563eb',
  colorSecundario: '#eff6ff',
  fontFamily: 'sans',
  logoPosicion: 'izquierda',
  logoTamano: 'M',
  fontSize: 'M',
  colCodigo: true,
  colUnidad: true,
  colDescuento: false,
  showMontoLetras: true,
  estiloTabla: 'moderno',
  showTerminos: false,
  terminosPago: '',
  datosBancarios: '',
};

export function resolvePlantilla(empresa: Empresa | null | undefined): PlantillaDocumento {
  const p = empresa?.plantillaDoc ?? {};
  return {
    ...DEFAULT_PLANTILLA_DOC,
    ...p,
    columns: { ...DEFAULT_PLANTILLA_DOC.columns, ...p.columns },
  };
}

export type PrintDocKind = 'COTIZACION' | 'OC' | 'FACTURA' | 'BOLETA' | 'NC' | 'ND' | 'GUIA' | 'PROFORMA' | 'ORDEN_VENTA';

export type PrintDocLinea = {
  codigo?: string;
  descripcion: string;
  cantidad: number | string;
  unidad?: string;
  descuento?: string;
  precioUnitario: number | string;
  total: number | string;
};

export type PrintDocReferencia = {
  documento: string;
  folio: string;
  fecha: string;
  razon: string;
};

export type PrintDocBulto = {
  tipo: string;
  cantidad: string;
  marca: string;
};

export type PrintDocRow = {
  folio: string;
  contraparte: string;
  fecha: string;
  /** Neto formateado (display). */
  neto: string;
  estado: string;
  extra?: string;
  lineas?: PrintDocLinea[];
  detalleExtra?: string;
  /** Datos del receptor (ref Sergio). */
  receptorRut?: string;
  receptorGiro?: string;
  receptorDireccion?: string;
  receptorComuna?: string;
  receptorCiudad?: string;
  observacion?: string;
  /** Neto numérico para IVA / total. */
  netoNum?: number;
  /** IVA / total ya formateados (opcional). */
  iva?: string;
  total?: string;
  afacto?: 'AFECTO' | 'EXENTO' | 'MIXTO';
  /** Título del recuadro. Si no viene, se usa el tipo de documento. */
  tituloDocumento?: string;
  subtituloDocumento?: string;
  siiOficina?: string;
  fechaVencimiento?: string;
  despachoVia?: string;
  puertoEmbarque?: string;
  puertoDestino?: string;
  paisDestino?: string;
  referencias?: PrintDocReferencia[];
  moneda?: string;
  montoExento?: string;
  otraMoneda?: string;
  montoOtraMoneda?: string;
  totalOtraMoneda?: string;
  totalBultos?: string;
  pesoBruto?: string;
  bultos?: PrintDocBulto[];
};

/** Muestra de Plantilla documentos: la ND de exportación que usa el cliente hoy. */
export const PLANTILLA_PREVIEW_KIND: PrintDocKind = 'ND';

export function plantillaPreviewRow(): PrintDocRow {
  return {
    folio: '1616',
    tituloDocumento: 'NOTA DE DÉBITO DE\nEXPORTACIÓN ELECTRÓNICA',
    subtituloDocumento: 'ELECTRONIC EXPORT DEBIT NOTE',
    siiOficina: 'Rancagua',
    contraparte: 'SHANGHAI HUI ZHAN INTERNATIONAL TRADE CO., LTD',
    receptorDireccion: 'FLOOR 4, NO.288 DINGJIN ROAD, JINHUI TOWN, FENGXIAN DISTRICT, SHANGHAI',
    receptorCiudad: 'SHANGHAI',
    receptorRut: '55555555',
    fecha: '15 de Sep de 2026',
    despachoVia: 'Marítima, Fluvial y Lacustre',
    neto: '15.982',
    netoNum: 15982,
    afacto: 'EXENTO',
    moneda: 'DOLAR USA',
    montoExento: '15.982',
    total: '15.982',
    otraMoneda: 'PESO CL',
    montoOtraMoneda: '13.880.687',
    totalOtraMoneda: '13.880.687',
    estado: 'EMITIDO',
    observacion: 'TC 868,52',
    totalBultos: '2400',
    bultos: [{ tipo: '22-CAJACARTON', cantidad: '2400', marca: '-' }],
    referencias: [{
      documento: 'Factura de Exportación Electrónica',
      folio: '1938',
      fecha: '03/02/2026',
      razon: 'Corrige Monto: ND POR CIERRE',
    }],
    lineas: [{
      codigo: '009',
      descripcion: 'CIRUELA 9KN\nTOTAL NETO: 21600 KG\nN°CNTR: TTNU815309-3\nEMB REF N°395\nNAVE: MSC MARGARITA\nVENTA FOB',
      cantidad: '2.400',
      unidad: 'CAJA',
      precioUnitario: '6,659166',
      total: '15.982',
    }],
  };
}

/** Recuadro tipo DTE chileno (ref. representación Acepta). */
const KIND_BOX: Record<PrintDocKind, { es: string; en?: string }> = {
  COTIZACION: { es: 'COTIZACIÓN' },
  OC: { es: 'ORDEN DE COMPRA' },
  FACTURA: { es: 'FACTURA ELECTRÓNICA', en: 'ELECTRONIC INVOICE' },
  BOLETA: { es: 'BOLETA ELECTRÓNICA', en: 'ELECTRONIC RECEIPT' },
  NC: { es: 'NOTA DE CRÉDITO ELECTRÓNICA', en: 'ELECTRONIC CREDIT NOTE' },
  ND: { es: 'NOTA DE DÉBITO ELECTRÓNICA', en: 'ELECTRONIC DEBIT NOTE' },
  GUIA: { es: 'GUÍA DE DESPACHO ELECTRÓNICA', en: 'ELECTRONIC DISPATCH GUIDE' },
  PROFORMA: { es: 'PROFORMA' },
  ORDEN_VENTA: { es: 'ORDEN DE VENTA' },
};

const DTE_KINDS = new Set<PrintDocKind>(['FACTURA', 'BOLETA', 'NC', 'ND', 'GUIA']);

function filled(value: string | null | undefined): string {
  return (value || '').trim();
}

function nl(value: string): string {
  return esc(value).replace(/\n/g, '<br/>');
}

const LOGO_MAX_HEIGHT: Record<NonNullable<PlantillaDocumento['logoTamano']>, number> = {
  S: 36,
  M: 56,
  L: 80,
};

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseNetoNum(row: PrintDocRow): number {
  if (typeof row.netoNum === 'number' && Number.isFinite(row.netoNum)) return row.netoNum;
  const digits = String(row.neto ?? '').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

function moneyOrDash(formatted: string | undefined, fallbackNum: number): string {
  if (formatted && formatted.trim()) return formatted;
  return fmtCLP(fallbackNum);
}

function terminosBlock(plantilla: PlantillaDocumento) {
  if (!plantilla.showTerminos) return '';
  const terminos = (plantilla.terminosPago || '').trim();
  const bancarios = (plantilla.datosBancarios || '').trim();
  if (!terminos && !bancarios) return '';
  const cols: string[] = [];
  if (terminos) {
    cols.push(`<div class="terminos-col"><h4>Términos y condiciones</h4><p>${esc(terminos).replace(/\n/g, '<br/>')}</p></div>`);
  }
  if (bancarios) {
    cols.push(`<div class="terminos-col"><h4>Datos de pago</h4><p>${esc(bancarios).replace(/\n/g, '<br/>')}</p></div>`);
  }
  return `<div class="terminos">${cols.join('')}</div>`;
}

/** Marca de agua según estado del documento (no SII). */
export function watermarkForEstado(estado?: string): string {
  const e = (estado || '').toUpperCase();
  if (e === 'BORRADOR') return 'BORRADOR';
  if (e === 'PENDIENTE_APROBACION') return 'EN ESPERA DE APROBACIÓN';
  if (e === 'RECHAZADO') return 'RECHAZADO';
  return '';
}

const LETRAS_U = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const LETRAS_DIEZ = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
const LETRAS_D = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const LETRAS_C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function letrasHasta999(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(LETRAS_C[c]);
  if (resto >= 10 && resto < 20) partes.push(LETRAS_DIEZ[resto - 10]);
  else if (resto >= 21 && resto < 30) partes.push(`veinti${LETRAS_U[resto - 20]}`);
  else if (resto >= 20) {
    const dec = Math.floor(resto / 10);
    const u = resto % 10;
    partes.push(u ? `${LETRAS_D[dec]} y ${LETRAS_U[u]}` : LETRAS_D[dec]);
  } else if (resto > 0) partes.push(LETRAS_U[resto]);
  return partes.join(' ');
}

/** Entero en palabras, para el pie «SON: …». */
export function numeroEnLetras(valor: number): string {
  const n = Math.round(Math.abs(valor));
  if (n === 0) return 'cero';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones === 1) partes.push('un millón');
  else if (millones) partes.push(`${letrasHasta999(millones).replace(/uno$/, 'un')} millones`);
  if (miles === 1) partes.push('mil');
  else if (miles) partes.push(`${letrasHasta999(miles).replace(/\buno\b/, 'un')} mil`);
  if (resto) partes.push(letrasHasta999(resto));
  return partes.join(' ').replace(/\s+/g, ' ').replace(/ uno$/, ' un').trim();
}

function montoEnLetras(total: number, moneda: string): string {
  const palabras = numeroEnLetras(total).toUpperCase();
  const m = moneda.toUpperCase();
  const unidad = m.includes('DOLAR') || m.includes('USD')
    ? (Math.round(Math.abs(total)) === 1 ? 'DÓLAR' : 'DÓLARES')
    : (Math.round(Math.abs(total)) === 1 ? 'PESO' : 'PESOS');
  return `SON: ${palabras} ${unidad}`;
}

function pair(label: string, value: string | null | undefined): string {
  return `<div class="pair"><span class="k">${esc(label)}</span><span class="c">:</span><span class="v">${nl(filled(value))}</span></div>`;
}

function renderOneDocumento(opts: {
  empresa: Empresa;
  kind: PrintDocKind;
  row: PrintDocRow;
  plantilla: PlantillaDocumento;
  colorPrimario: string;
  logoHtml: string;
}): string {
  const { empresa, kind, row, plantilla, colorPrimario, logoHtml } = opts;
  const box = KIND_BOX[kind] ?? { es: kind };
  const titulo = filled(row.tituloDocumento) || box.es;
  const subtitulo = filled(row.subtituloDocumento) || box.en || '';
  const netoN = parseNetoNum(row);
  const exento = row.afacto === 'EXENTO' || Boolean(filled(row.montoExento));
  const ivaN = exento ? 0 : Math.round(netoN * 0.19);
  const totalN = netoN + ivaN;
  const ivaLabel = moneyOrDash(row.iva, ivaN);
  const totalLabel = moneyOrDash(row.total, totalN);
  const netoLabel = row.neto?.trim() ? row.neto : fmtCLP(netoN);
  const moneda = filled(row.moneda) || 'PESO CL';
  const logoPos = plantilla.logoPosicion || 'izquierda';
  const estilo = plantilla.estiloTabla || 'clasico';

  const lugarEmpresa = [empresa.comuna, empresa.ciudad].filter(Boolean).join(', ');
  const ciudadReceptor = filled(row.receptorCiudad) || [row.receptorComuna, row.receptorCiudad].filter(Boolean).join(', ');

  const lineas = row.lineas?.length
    ? row.lineas
    : [{
        descripcion: row.extra || row.contraparte || '—',
        cantidad: '1',
        precioUnitario: netoLabel,
        total: netoLabel,
      }];

  const colCodigo = plantilla.colCodigo !== false;
  const colUnidad = plantilla.colUnidad !== false;
  const colDescuento = plantilla.colDescuento === true;
  const lineasHtml = lineas.map((l) => {
    const cant = typeof l.cantidad === 'number'
      ? l.cantidad.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
      : String(l.cantidad);
    return `<tr>
      ${colCodigo ? `<td class="code">${esc(l.codigo || '')}</td>` : ''}
      <td class="desc">${nl(String(l.descripcion))}</td>
      <td class="num">${esc(cant)}</td>
      ${colUnidad ? `<td class="unit">${esc(l.unidad || '')}</td>` : ''}
      <td class="num">${esc(String(l.precioUnitario))}</td>
      ${colDescuento ? `<td class="num">${esc(l.descuento || '—')}</td>` : ''}
      <td class="num">${esc(String(l.total))}</td>
    </tr>`;
  }).join('');

  const showShip = [row.despachoVia, row.puertoEmbarque, row.puertoDestino, row.paisDestino].some((v) => filled(v));
  const refs = row.referencias ?? [];
  const bultos = row.bultos ?? [];
  const showBultos = bultos.length > 0 || Boolean(filled(row.totalBultos) || filled(row.pesoBruto));
  const obs = (row.observacion || row.detalleExtra || '').trim();
  const anioRes = (empresa.gosocketFechaResolucion || '').slice(0, 4);
  const resLine = filled(empresa.gosocketNroResolucion)
    ? `Res. ${esc(empresa.gosocketNroResolucion || '')}${anioRes ? ` de ${esc(anioRes)}` : ''}<br/>`
    : '';

  const totalesHtml = exento
    ? `<table class="tot">
        <tr><th>Moneda / Currency</th><td>${esc(moneda)}</td></tr>
        <tr><th>Monto Exento</th><td>${esc(filled(row.montoExento) || netoLabel)}</td></tr>
        <tr><th>Monto Total</th><td>${esc(totalLabel)}</td></tr>
      </table>
      ${filled(row.otraMoneda) ? `<table class="tot">
        <tr><th>Otra Moneda</th><td>${esc(row.otraMoneda || '')}</td></tr>
        <tr><th>Exento Otra Moneda</th><td>${esc(row.montoOtraMoneda || '')}</td></tr>
        <tr><th>Total Otra Moneda</th><td>${esc(row.totalOtraMoneda || '')}</td></tr>
      </table>` : ''}`
    : `<table class="tot">
        <tr><th>Moneda / Currency</th><td>${esc(moneda)}</td></tr>
        <tr><th>Monto Neto</th><td>${esc(netoLabel)}</td></tr>
        <tr><th>I.V.A. (19%)</th><td>${esc(ivaLabel)}</td></tr>
        <tr><th>Monto Total</th><td>${esc(totalLabel)}</td></tr>
      </table>`;

  const brandLines = [
    empresa.giro ? `<div>${esc(empresa.giro)}</div>` : '',
    plantilla.showAddress !== false && empresa.direccion ? `<div>${esc(empresa.direccion)}</div>` : '',
    plantilla.showAddress !== false && lugarEmpresa ? `<div>${esc(lugarEmpresa)}</div>` : '',
    empresa.telefono ? `<div>${esc(empresa.telefono)}</div>` : '',
    empresa.emailContacto ? `<div>${esc(empresa.emailContacto)}</div>` : '',
  ].filter(Boolean).join('');

  return `
  <article class="doc pos-${logoPos} tabla-${estilo}">
    <header class="doc-head">
      <div class="brand">
        ${logoHtml}
        ${plantilla.showLogo && empresa.logoUrl ? '' : `<div class="brand-name">${esc(empresa.razonSocial)}</div>`}
        ${brandLines ? `<div class="brand-meta">${brandLines}</div>` : ''}
      </div>
      <div class="folio-wrap">
        <div class="folio-box" style="border-color:${colorPrimario};color:${colorPrimario}">
          <div class="folio-rut">R.U.T.: ${esc(empresa.rut || '—')}</div>
          <div class="folio-tipo">${nl(titulo)}</div>
          ${subtitulo ? `<div class="folio-en">(${esc(subtitulo)})</div>` : ''}
          <div class="folio-nro">N° ${esc(row.folio || '—')}</div>
        </div>
        ${filled(row.siiOficina) ? `<div class="sii" style="color:${colorPrimario}">S.I.I. - ${esc(row.siiOficina || '')}</div>` : ''}
      </div>
    </header>

    <div class="box receptor">
      <div class="receptor-main">
        ${pair('Señores / Messrs', row.contraparte)}
        ${pair('Dirección / Address', row.receptorDireccion)}
        ${pair('Ciudad / City', ciudadReceptor)}
        ${pair('Id. Fiscal / Tax Id.', row.receptorRut)}
        ${filled(row.receptorGiro) ? pair('Giro', row.receptorGiro) : ''}
      </div>
      <div class="receptor-dates">
        ${pair('Fecha / Date', row.fecha)}
        ${pair('Fecha Venc./Exp. Date', row.fechaVencimiento)}
      </div>
    </div>

    ${showShip ? `<div class="box ship">
      <div class="ship-via">${pair('Desp. Vía / Shipment', row.despachoVia)}</div>
      <div class="ship-ports">
        ${pair('Pto. Emb./Port Loading', row.puertoEmbarque)}
        ${pair('Pto. Dest./Dest. Port', row.puertoDestino)}
        ${pair('País Dest./D. Country', row.paisDestino)}
      </div>
    </div>` : ''}

    <table class="detalle${lineas.length <= 1 ? ' una-linea' : ''}">
      <thead>
        <tr>
          ${colCodigo ? '<th>Código<br/><span>Code</span></th>' : ''}
          <th>Descripción<br/><span>Description</span></th>
          <th class="num">Cantidad<br/><span>Quantity</span></th>
          ${colUnidad ? '<th>Unidad<br/><span>Unity</span></th>' : ''}
          <th class="num">Precio Unit.<br/><span>Unit. Price</span></th>
          ${colDescuento ? '<th class="num">Descuento<br/><span>Discount</span></th>' : ''}
          <th class="num">Valor Total<br/><span>Total Amount</span></th>
        </tr>
      </thead>
      <tbody>${lineasHtml}</tbody>
    </table>

    <div class="bottom">
      <div class="refs">
        ${refs.length ? `<table class="ref">
          <thead><tr><th>Documento Ref.</th><th>Folio</th><th>Fecha Ref.</th><th>Razón Ref.</th></tr></thead>
          <tbody>${refs.map((r) => `<tr>
            <td>${esc(r.documento)}</td><td class="num">${esc(r.folio)}</td><td>${esc(r.fecha)}</td><td>${nl(r.razon)}</td>
          </tr>`).join('')}</tbody>
        </table>` : ''}
      </div>
      <div class="totales">
        ${totalesHtml}
        ${plantilla.showMontoLetras !== false ? `<div class="letras">${esc(montoEnLetras(totalN, moneda))}</div>` : ''}
      </div>
    </div>

    <div class="box obs">
      <div class="obs-title">OBSERVACIONES:</div>
      <div class="obs-body">${obs ? nl(obs) : ''}</div>
    </div>

    ${(DTE_KINDS.has(kind) || showBultos) ? `<div class="legal">
      ${DTE_KINDS.has(kind) ? `<div class="timbre">
        <div class="timbre-mark">Timbre electrónico SII</div>
        <div class="timbre-legal" style="color:${colorPrimario}">
          Lo incorpora GoSocket al emitir.<br/>${resLine}Verifique documento: www.sii.cl
        </div>
      </div>` : '<div></div>'}
      ${showBultos ? `<div class="bultos">
        <table class="ref">
          <tr><th>T. Bultos / T. Pack.:</th><td>${esc(row.totalBultos || '')}</td><th>P. Bruto / G. Weight:</th><td>${esc(row.pesoBruto || '')}</td></tr>
        </table>
        ${bultos.length ? `<table class="ref">
          <thead><tr><th>Tipo Bultos</th><th>Cantidad</th><th>Marca</th></tr></thead>
          <tbody>${bultos.map((b) => `<tr><td>${esc(b.tipo)}</td><td class="num">${esc(b.cantidad)}</td><td>${esc(b.marca)}</td></tr>`).join('')}</tbody>
        </table>` : ''}
      </div>` : ''}
    </div>` : ''}

    ${terminosBlock(plantilla)}
    ${plantilla.showFooter
      ? `<footer class="doc-footer">${esc(plantilla.footerText || DEFAULT_PLANTILLA_DOC.footerText || '')}</footer>`
      : ''}
  </article>`;
}

/**
 * Genera el HTML completo del documento (layout ref Sergio Reu5 / Better Software).
 * Puro: reutilizable en iframe o ventana de preview.
 */
export function renderDocumentoHtml(opts: {
  empresa: Empresa;
  kind: PrintDocKind;
  title: string;
  rows: PrintDocRow[];
  forceWatermark?: string;
}): string {
  const { empresa, kind, title, rows } = opts;
  const plantilla = resolvePlantilla(empresa);
  const colorPrimario = plantilla.colorPrimario || DEFAULT_PLANTILLA_DOC.colorPrimario!;
  const fontStack = plantilla.fontFamily === 'serif'
    ? "Georgia, 'Times New Roman', serif"
    : 'Arial, Helvetica, sans-serif';
  const logoMaxH = LOGO_MAX_HEIGHT[plantilla.logoTamano ?? 'M'];

  const logoHtml = !plantilla.showLogo
    ? ''
    : empresa.logoUrl
      ? `<img class="logo" src="${esc(empresa.logoUrl)}" alt="Logo"/>`
      : `<div class="slot logo-slot">Logo</div>`;
  const fontPx = plantilla.fontSize === 'S' ? 10 : plantilla.fontSize === 'L' ? 12.5 : 11;

  const autoWm = rows.length === 1
    ? watermarkForEstado(rows[0]?.estado)
    : '';
  const wmText = (opts.forceWatermark || autoWm || plantilla.watermarkText || '').trim();
  const opacity = plantilla.watermarkOpacity ?? 0.1;
  const sello = wmText ? `<div class="wm-text">${esc(wmText)}</div>` : '';

  const docsHtml = (rows.length ? rows : [{
    folio: '—',
    contraparte: '—',
    fecha: '',
    neto: fmtCLP(0),
    estado: '',
  }]).map((row, idx) => {
    const block = renderOneDocumento({
      empresa,
      kind,
      row,
      plantilla,
      colorPrimario,
      logoHtml,
    });
    return idx > 0 ? `<div class="page-break"></div>${block}` : block;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>${esc(title)}</title>
  <style>
    @page { margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: ${fontStack};
      color: #111;
      margin: 0;
      padding: 16px;
      background: #fff;
      font-size: ${fontPx}px;
    }
    .wm {
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      pointer-events: none; z-index: 0; opacity: ${opacity};
    }
    .wm-text {
      font-size: 72px; font-weight: 700; transform: rotate(-28deg);
      color: ${colorPrimario}; letter-spacing: 0.08em;
    }
    .sello { max-width: 280px; max-height: 280px; transform: rotate(-18deg); }
    .content { position: relative; z-index: 1; }
    .doc { max-width: 210mm; margin: 0 auto; }
    .doc-head {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 16px; margin-bottom: 8px;
    }
    .brand {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; align-items: flex-start;
    }
    .pos-centro .brand { align-items: center; text-align: center; }
    .pos-derecha .doc-head { flex-direction: row-reverse; }
    .pos-derecha .brand { align-items: flex-end; text-align: right; }
    .logo { max-height: ${logoMaxH}px; max-width: 240px; display: block; object-fit: contain; }
    .slot {
      border: 1.5px dashed #9ca3af; background: #f8fafc; color: #6b7280;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
    }
    .logo-slot { width: 180px; height: ${logoMaxH}px; margin-bottom: 6px; }
    .letras { margin-top: 6px; font-size: 10px; font-weight: 700; text-align: right; letter-spacing: 0.01em; }
    .brand-name { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
    .brand-meta { margin-top: 4px; font-size: 10px; line-height: 1.35; color: #333; }
    .folio-wrap { flex: 0 0 210px; }
    .folio-box {
      border: 2.5px solid ${colorPrimario};
      padding: 8px 10px 10px;
      text-align: center;
      color: ${colorPrimario};
      min-height: 108px;
    }
    .folio-rut { font-size: 13px; font-weight: 700; }
    .folio-tipo { font-size: 13px; font-weight: 700; line-height: 1.15; margin-top: 4px; text-transform: uppercase; }
    .folio-en { font-size: 10px; font-weight: 700; margin-top: 2px; }
    .folio-nro { font-size: 16px; font-weight: 700; margin-top: 6px; }
    .sii { text-align: center; font-weight: 700; font-size: 12px; margin-top: 4px; }
    .box { border: 1px solid #222; margin-top: 6px; }
    .receptor { display: grid; grid-template-columns: 1.45fr 0.9fr; }
    .receptor-dates { border-left: 1px solid #222; }
    .pair {
      display: grid; grid-template-columns: 132px 10px 1fr;
      gap: 2px; padding: 1px 6px; align-items: start; line-height: 1.25;
    }
    .pair .k { font-weight: 700; }
    .ship { display: grid; grid-template-columns: 1.2fr 1fr; }
    .ship-ports { border-left: 1px solid #222; }
    table.detalle, table.ref, table.tot {
      width: 100%; border-collapse: collapse; margin-top: 6px;
    }
    table.detalle th, table.detalle td, table.ref th, table.ref td, table.tot th, table.tot td {
      border: 1px solid #222; padding: 3px 5px; vertical-align: top; text-align: left;
    }
    table.detalle th { font-weight: 700; text-align: center; font-size: 10px; }
    table.detalle th span { font-weight: 400; }
    table.detalle td { height: 18px; }
    table.detalle .code { width: 52px; }
    table.detalle .desc { white-space: pre-line; }
    table.detalle .num, table.ref .num, table.tot td { text-align: right; font-variant-numeric: tabular-nums; }
    table.detalle .unit { text-align: center; width: 52px; }
    table.detalle.una-linea tbody td { height: 120px; }
    .bottom { display: grid; grid-template-columns: 1.35fr 0.85fr; gap: 10px; align-items: start; margin-top: 8px; }
    .totales { display: grid; gap: 8px; }
    table.tot { margin-top: 0; }
    table.tot th { width: 58%; font-weight: 700; }
    .obs { padding: 4px 6px 8px; min-height: 36px; }
    .obs-title { font-weight: 700; font-size: 11px; }
    .obs-body { min-height: 16px; white-space: pre-line; }
    .legal { display: grid; grid-template-columns: 1fr 1.1fr; gap: 16px; align-items: end; margin-top: 10px; }
    .timbre-mark {
      width: 168px; height: 72px; border: 1px solid #222;
      display: flex; align-items: center; justify-content: center;
      font-size: 9px; letter-spacing: 0.04em; color: #444; text-align: center; padding: 4px;
    }
    .timbre-legal { margin-top: 4px; font-size: 10px; font-weight: 700; line-height: 1.35; }
    .bultos table.ref { margin-top: 0; }
    .bultos table.ref + table.ref { margin-top: 4px; }
    .terminos {
      display: flex; flex-wrap: wrap; gap: 24px;
      margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb;
    }
    .terminos-col { flex: 1 1 220px; }
    .terminos-col h4 {
      margin: 0 0 4px; font-size: 11px; text-transform: uppercase;
      letter-spacing: 0.04em; color: ${colorPrimario};
    }
    .terminos-col p { margin: 0; font-size: 11px; color: #4b5563; line-height: 1.5; }
    .doc-footer {
      margin-top: 24px; font-size: 10px; color: #6b7280;
      border-top: 1px solid #e5e7eb; padding-top: 8px;
    }
    .page-break { break-before: page; height: 32px; }

    /* Preview en pantalla (ref Sergio Reu5) */
    html.preview-mode, html.preview-mode body {
      background: #e8eaed; margin: 0; min-height: 100%;
    }
    html.preview-mode body { padding: 0; }
    .preview-toolbar {
      position: sticky; top: 0; z-index: 20;
      display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center;
      gap: 8px; padding: 12px 16px;
      background: #f3f4f6; border-bottom: 1px solid #d1d5db;
    }
    .preview-toolbar button {
      border: none; border-radius: 9999px; padding: 8px 16px;
      font: 600 13px/1.2 system-ui, sans-serif; cursor: pointer; color: #fff;
    }
    .preview-toolbar .btn-pdf { background: #059669; }
    .preview-toolbar .btn-pdf:hover { background: #047857; }
    .preview-toolbar .btn-print { background: #4f46e5; }
    .preview-toolbar .btn-print:hover { background: #4338ca; }
    .preview-toolbar .btn-close { background: #4b5563; }
    .preview-toolbar .btn-close:hover { background: #374151; }
    .preview-stage {
      padding: 24px 16px 48px; display: flex; justify-content: center;
    }
    .sheet {
      width: 100%; max-width: 210mm; background: #fff; color: #111827;
      padding: 28px 32px; box-shadow: 0 4px 24px rgba(0,0,0,.12);
    }
    @media print {
      html.preview-mode, html.preview-mode body { background: #fff; }
      body { padding: 0; }
      .no-print { display: none !important; }
      .preview-stage { padding: 0; display: block; }
      .sheet { max-width: none; box-shadow: none; padding: 0; }
      .page-break { height: 0; }
    }
  </style>
</head>
<body>
  <div class="wm">${sello}</div>
  <div class="content">
    ${docsHtml}
  </div>
</body>
</html>`;
}

/**
 * Vista previa del documento en un modal del ERP. No abre ventana del navegador.
 */
export type PrintEmpresaDocumentoOpts = {
  empresa: Empresa;
  kind: PrintDocKind;
  title: string;
  rows: PrintDocRow[];
  forceWatermark?: string;
};

const PREVIEW_EVENT = 'almahue-documento-preview';

type PreviewListener = (opts: PrintEmpresaDocumentoOpts | null) => void;

export function subscribeDocumentoPreview(listener: PreviewListener): () => void {
  const handler = (e: Event) => {
    listener((e as CustomEvent<PrintEmpresaDocumentoOpts | null>).detail);
  };
  window.addEventListener(PREVIEW_EVENT, handler);
  return () => window.removeEventListener(PREVIEW_EVENT, handler);
}

export function printEmpresaDocumento(opts: PrintEmpresaDocumentoOpts): void {
  window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: opts }));
}

export function closeDocumentoPreview(): void {
  window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: null }));
}
