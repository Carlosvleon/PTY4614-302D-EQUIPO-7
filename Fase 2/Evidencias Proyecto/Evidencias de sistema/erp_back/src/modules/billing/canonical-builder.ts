import { BadRequestException } from '@nestjs/common';
import type { CanonicalDocumentV1 } from './billing-gateway.client';
import { clipSii, SII_DTE } from './sii-dte-limits';

const TIPOS_DTE_EXPORTACION = new Set([110, 111, 112]);

type DocRow = {
  id: string;
  folio: string;
  tipo: string;
  cliente: string;
  fecha: Date;
  neto: unknown;
  iva?: unknown | null;
  lineas?: unknown;
  formaPago?: string | null;
  fechaVencimiento?: Date | null;
  indicadorVenta?: string | null;
  receptorRut?: string | null;
  receptorGiro?: string | null;
  receptorDireccion?: string | null;
  receptorComuna?: string | null;
  receptorCiudad?: string | null;
  monedaCodigo?: string | null;
  tpoMoneda?: string | null;
  tipoCambio?: unknown | null;
  paisRecepCodigo?: string | null;
  paisDestino?: string | null;
  puertoEmbarque?: string | null;
  puertoDesembarque?: string | null;
  clausulaVenta?: string | null;
  viaTransporte?: string | null;
  modalidadVenta?: string | null;
  indTraslado?: string | null;
  bultoTipoCodigo?: string | null;
  bultoCantidad?: number | null;
  bultoMarca?: string | null;
  montoOtraMoneda?: unknown | null;
  montoExentoOtraMoneda?: unknown | null;
  referenciaTipo?: string | null;
  referenciaFolio?: string | null;
  referenciaFecha?: Date | null;
  referenciaCod?: number | null;
  empresaId: string;
};

type EmpresaRow = {
  id: string;
  rut: string;
  razonSocial: string;
  giro?: string | null;
  direccion?: string | null;
  comuna?: string | null;
  ciudad?: string | null;
  gosocketBillerId?: string | null;
  gosocketNroResolucion?: string | null;
  gosocketFechaResolucion?: string | null;
  gosocketActeco?: string | null;
};

function parseLineas(raw: unknown): Array<{
  descripcion: string;
  detalle?: string;
  cantidad: number;
  precioUnitario: number;
  descuentoPct?: number;
  total: number;
  tipoLinea?: string;
  unidadMedida?: string;
}> {
  if (!Array.isArray(raw)) return [];
  return raw.map((l) => {
    const x = l as Record<string, unknown>;
    const tipoRaw = String(x.tipoLinea ?? '').toUpperCase();
    const tipoLinea = tipoRaw === 'RECARGO' || tipoRaw === 'FLETE' ? 'FLETE' : tipoRaw || undefined;
    const unidad = String(x.unidadMedida ?? '').trim();
    const detalle = String(x.detalle ?? '').trim();
    return {
      descripcion: String(x.descripcion ?? ''),
      ...(detalle ? { detalle } : {}),
      cantidad: Number(x.cantidad ?? 0),
      precioUnitario: Number(x.precioUnitario ?? 0),
      descuentoPct: x.descuentoPct != null ? Number(x.descuentoPct) : undefined,
      total: Number(x.total ?? 0),
      tipoLinea,
      ...(unidad ? { unidadMedida: unidad } : {}),
    };
  });
}

function finiteOrUndef(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function strOrUndef(value: string | null | undefined): string | undefined {
  const t = value?.trim();
  return t || undefined;
}

function deriveTpoMoneda(d: DocRow, exportacion: boolean): string | undefined {
  const explicit = strOrUndef(d.tpoMoneda);
  if (explicit) return explicit;
  const mon = (d.monedaCodigo || '').trim().toUpperCase();
  if (mon === '13' || mon === 'USD') return '13';
  if (mon === '48' || mon === 'CNY' || mon === 'YUAN') return '48';
  if (mon === '142' || mon === 'EUR' || mon === 'EURO') return '142';
  if (exportacion) return '13';
  return undefined;
}

function buildComex(
  d: DocRow,
  exportacion: boolean,
): NonNullable<CanonicalDocumentV1['documento']['comex']> | undefined {
  const comex: NonNullable<CanonicalDocumentV1['documento']['comex']> = {
    tipoCambio: finiteOrUndef(d.tipoCambio),
    montoOtraMoneda: finiteOrUndef(d.montoOtraMoneda),
    montoExentoOtraMoneda: finiteOrUndef(d.montoExentoOtraMoneda),
    bultoCantidad: finiteOrUndef(d.bultoCantidad),
    bultoTipoCodigo: strOrUndef(d.bultoTipoCodigo),
    bultoMarca: strOrUndef(d.bultoMarca),
    paisDestino: strOrUndef(d.paisDestino),
    puertoEmbarque: strOrUndef(d.puertoEmbarque),
    puertoDesembarque: strOrUndef(d.puertoDesembarque),
    clausulaVenta: strOrUndef(d.clausulaVenta),
    viaTransporte: strOrUndef(d.viaTransporte),
    modalidadVenta: strOrUndef(d.modalidadVenta),
    tpoMoneda: deriveTpoMoneda(d, exportacion),
    codPaisRecep: strOrUndef(d.paisRecepCodigo),
    indTraslado: strOrUndef(d.indTraslado),
  };
  const hasValue = Object.values(comex).some((v) => v != null && v !== '');
  if (hasValue) return comex;
  return exportacion ? { tpoMoneda: '13' } : undefined;
}

function buildReferencia(d: DocRow): CanonicalDocumentV1['documento']['referencia'] {
  const cod = d.referenciaCod;
  const codRef = cod === 1 || cod === 2 || cod === 3 ? (cod as 1 | 2 | 3) : undefined;
  if (!d.referenciaTipo && !d.referenciaFolio && codRef == null) return undefined;
  return {
    tipo: d.referenciaTipo ?? undefined,
    folio: d.referenciaFolio ?? undefined,
    fecha: d.referenciaFecha ? d.referenciaFecha.toISOString().slice(0, 10) : undefined,
    ...(codRef != null ? { codRef } : {}),
  };
}

/** Fail-closed 110/111/112: no HTTP al gateway si faltan campos M (Gap / mapper GUF). */
export function assertExportacionFailClosed(doc: CanonicalDocumentV1): void {
  const tipoDte = doc.documento?.tipoDte;
  if (!TIPOS_DTE_EXPORTACION.has(tipoDte)) return;
  const pais = doc.documento.comex?.codPaisRecep?.trim() ?? '';
  if (!pais) {
    throw new BadRequestException(
      'Exportación: falta el código de país del receptor (CodPaisRecep).',
    );
  }
  if (tipoDte === 110) {
    const tc = doc.documento.comex?.tipoCambio;
    if (!(tc != null && Number.isFinite(tc) && tc > 0)) {
      throw new BadRequestException('Exportación: falta tipo de cambio mayor a 0.');
    }
    const bultos = doc.documento.comex?.bultoCantidad;
    if (!(bultos != null && Number.isFinite(bultos) && bultos > 0)) {
      throw new BadRequestException('Exportación: indique cantidad de bultos mayor a 0.');
    }
  }
  if (tipoDte === 111 || tipoDte === 112) {
    const ref = doc.documento.referencia;
    const tipoRef = String(ref?.tipo ?? '').trim();
    const folioRef = String(ref?.folio ?? '').trim();
    if (!tipoRef || !folioRef) {
      throw new BadRequestException(
        'Exportación: la NC/ND debe referenciar la factura 110 (tipo y folio SII).',
      );
    }
    const tc = doc.documento.comex?.tipoCambio;
    if (!(tc != null && Number.isFinite(tc) && tc > 0)) {
      throw new BadRequestException('Exportación: falta tipo de cambio mayor a 0.');
    }
  }
  const dir = doc.receptor?.direccion?.trim() ?? '';
  const comuna = doc.receptor?.comuna?.trim() ?? '';
  const ciudad = doc.receptor?.ciudad?.trim() ?? '';
  if (!dir || !(comuna || ciudad)) {
    throw new BadRequestException(
      'Exportación: el receptor debe tener dirección y comuna o ciudad.',
    );
  }
}

/** Mapeo ERP → tipoDte (propuesta MVP). */
export function mapTipoDte(tipo: string, indicadorVenta?: string | null): number {
  const ind = (indicadorVenta || '').toUpperCase();
  if (tipo === 'NC') return ind === 'EXPORTACION' ? 112 : 61;
  if (tipo === 'ND') return ind === 'EXPORTACION' ? 111 : 56;
  if (tipo === 'GUIA') return 52;
  if (tipo === 'FACTURA') {
    if (ind === 'EXPORTACION') return 110;
    if (ind === 'EXENTO') return 34;
    return 33;
  }
  // Cotización / NP / OC no son DTE de emisión fiscal; usar 33 solo si se fuerza.
  return 33;
}

export function buildCanonicalFromDocumento(
  d: DocRow,
  empresa: EmpresaRow,
  opts?: { erpId?: string; attempt?: number },
): CanonicalDocumentV1 {
  const erpId = opts?.erpId || 'almahue';
  const attempt = opts?.attempt ?? 1;
  const neto = Number(d.neto);
  const lineas = parseLineas(d.lineas);
  const exportacion = (d.indicadorVenta || '').toUpperCase() === 'EXPORTACION';
  const exento = exportacion || (d.indicadorVenta || '').toUpperCase() === 'EXENTO';
  const comex = buildComex(d, exportacion);
  const ivaEmit = exportacion ? 0 : Number(d.iva ?? 0);

  return {
    schemaVersion: '1.0',
    idempotencyKey: `${erpId}:${d.empresaId}:${d.id}:${attempt}`,
    source: {
      erpId,
      empresaId: d.empresaId,
      documentoId: d.id,
      ...(empresa.gosocketBillerId?.trim()
        ? { billerId: empresa.gosocketBillerId.trim() }
        : {}),
    },
    emisor: {
      rut: empresa.rut,
      razonSocial: clipSii(empresa.razonSocial, SII_DTE.rznSoc) ?? empresa.razonSocial,
      giro: clipSii(empresa.giro, SII_DTE.giroEmis),
      direccion: clipSii(empresa.direccion, SII_DTE.dirOrigen),
      comuna: clipSii(empresa.comuna, SII_DTE.cmnaOrigen),
      ciudad: clipSii(empresa.ciudad, SII_DTE.ciudadOrigen),
      ...(empresa.gosocketNroResolucion?.trim()
        ? { nroResolucion: empresa.gosocketNroResolucion.trim() }
        : {}),
      ...(empresa.gosocketFechaResolucion?.trim()
        ? { fechaResolucion: empresa.gosocketFechaResolucion.trim() }
        : {}),
      ...(empresa.gosocketActeco?.trim()
        ? { acteco: empresa.gosocketActeco.trim() }
        : {}),
    },
    receptor: {
      rut: d.receptorRut || '00.000.000-0',
      razonSocial: clipSii(d.cliente, SII_DTE.rznSocRecep) ?? d.cliente,
      giro: clipSii(d.receptorGiro, SII_DTE.giroRecep),
      direccion: clipSii(d.receptorDireccion, SII_DTE.dirRecep),
      comuna: clipSii(d.receptorComuna, SII_DTE.cmnaRecep),
      ciudad: clipSii(d.receptorCiudad, SII_DTE.ciudadRecep),
    },
    documento: {
      tipoDte: mapTipoDte(d.tipo, d.indicadorVenta),
      fechaEmision: d.fecha.toISOString().slice(0, 10),
      fechaVencimiento: d.fechaVencimiento
        ? d.fechaVencimiento.toISOString().slice(0, 10)
        : undefined,
      formaPago: d.formaPago ?? undefined,
      moneda: d.monedaCodigo || (exportacion ? 'USD' : 'CLP'),
      numeroInterno: d.folio,
      referencia: buildReferencia(d),
      ...(comex ? { comex } : {}),
    },
    totales: {
      neto,
      exento: exento ? neto : 0,
      iva: ivaEmit,
      tasaIva: exento ? 0 : 19,
      total: neto + ivaEmit,
    },
    lineas: (lineas.length
      ? lineas
      : [{ descripcion: d.cliente, cantidad: 1, precioUnitario: neto, total: neto }]
    ).map((l, i) => {
      const detalle = clipSii(l.detalle, SII_DTE.dscItem);
      return {
        nro: i + 1,
        descripcion: clipSii(
          l.tipoLinea === 'FLETE' && !/^flete/i.test(l.descripcion || '')
            ? `Flete · ${l.descripcion || `Ítem ${i + 1}`}`
            : l.descripcion || `Ítem ${i + 1}`,
          SII_DTE.nmbItem,
        )!,
        ...(detalle ? { detalle } : {}),
        cantidad: l.cantidad || 1,
        unidad:
          clipSii(
            exportacion ? (l.unidadMedida?.trim() || 'CAJA') : (l.unidadMedida?.trim() || 'UN'),
            SII_DTE.unmdItem,
          ) ?? (exportacion ? 'CAJA' : 'UN'),
        precio: l.precioUnitario,
        descuentoPct: l.descuentoPct,
        montoNeto: l.total,
      };
    }),
    glosas: [],
    indicadores: { exportacion, exento },
  };
}
