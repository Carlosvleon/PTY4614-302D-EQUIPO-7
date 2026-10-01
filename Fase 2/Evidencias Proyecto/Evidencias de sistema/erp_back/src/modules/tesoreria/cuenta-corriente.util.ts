/** RUT sin puntos, espacios ni guión (mayúsculas). */
export function normalizeRut(rut: string): string {
  return (rut || '').replace(/[.\s-]/g, '').toUpperCase();
}

export function formatRutDisplay(rut: string): string {
  const norm = normalizeRut(rut);
  if (norm.length < 2) return rut?.trim() || norm;
  const body = norm.slice(0, -1);
  const dv = norm.slice(-1);
  const dotted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${dotted}-${dv}`;
}

export function looksLikeRut(value: string): boolean {
  const n = normalizeRut(value);
  return n.length >= 8 && n.length <= 12 && /^\d+[0-9K]$/.test(n);
}

/** Primer instante del mes siguiente (UTC). Movimientos con fecha >= este corte quedan fuera del mes contable. */
export function fechaExclusivaTrasPeriodo(periodo?: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec((periodo ?? '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const ny = month === 12 ? y + 1 : y;
  const nm = month === 12 ? 1 : month + 1;
  return new Date(`${ny}-${String(nm).padStart(2, '0')}-01T00:00:00.000Z`);
}

export function fechaDentroOAntesDelPeriodo(fecha: Date | string, periodo?: string): boolean {
  const corte = fechaExclusivaTrasPeriodo(periodo);
  if (!corte) return true;
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return true;
  return d.getTime() < corte.getTime();
}

/** Tokens de calce: coma/punto y coma/pipe **y** espacios (demo usa "FEX-1973 TRF-8842"). */
export function splitCalceRefs(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;|/]+|\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isCalceLibreRef(raw?: string | null): boolean {
  const s = raw?.trim();
  if (!s) return true;
  return /^cartola\b/i.test(s);
}

export function refsEqual(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

export type EstadoLiquidacionCc = 'PENDIENTE' | 'CALZADO';
export type FiltroEstadoCuenta = 'PENDIENTE' | 'HISTORICO' | 'TODOS';
export type LinkTargetTipo = 'LIBRO_VENTAS' | 'LIBRO_COMPRAS' | 'PAGO' | 'CARTOLA' | 'OC';

export type CalceRefDto = {
  tipo: 'PAGO' | 'ANTICIPO' | 'COMPROBANTE';
  id: string;
  ref: string;
  label: string;
  to?: string;
};

export type LinkTargetDto = {
  tipo: LinkTargetTipo;
  to: string;
  label: string;
};

function searchQ(ref: string): string {
  const cartola = ref.match(/cartola\s+(.+)/i);
  const token = (cartola?.[1] ?? ref).trim();
  return encodeURIComponent(token);
}

export function linkTargetForMovimiento(input: {
  documentoRef?: string | null;
  documentoTipo?: string | null;
  origen?: string | null;
  pagoId?: string | null;
  documentoComercialId?: string | null;
  registroCompraId?: string | null;
  movimientoCartolaId?: string | null;
}): LinkTargetDto | null {
  const ref = input.documentoRef?.trim();
  const tipo = (input.documentoTipo ?? '').toUpperCase();
  const origen = (input.origen ?? '').toUpperCase();
  if (!ref || tipo === 'AJUSTE' || origen === 'AJUSTE' || ref.toUpperCase() === 'AJUSTE') {
    return null;
  }
  const q = searchQ(ref);

  if (input.documentoComercialId || origen === 'VENTA') {
    return { tipo: 'LIBRO_VENTAS', to: `/comercial/libro?q=${q}&todos=1`, label: ref };
  }
  if (input.registroCompraId || origen === 'COMPRA') {
    return { tipo: 'LIBRO_COMPRAS', to: `/compras/libro?q=${q}`, label: ref };
  }
  if (input.pagoId || tipo === 'PAGO' || origen === 'PAGO' || origen === 'TESORERIA' || origen === 'ANTICIPO') {
    const pagoQ = encodeURIComponent(input.pagoId || ref);
    return { tipo: 'PAGO', to: `/tesoreria/pagos?q=${pagoQ}`, label: ref };
  }
  if (input.movimientoCartolaId || /cartola/i.test(ref)) {
    return { tipo: 'CARTOLA', to: `/tesoreria/cartolas?q=${q}`, label: ref };
  }
  if (tipo === 'OC' || /^OC([-_]|$)/i.test(tipo) || /^OC[-_]?\d/i.test(ref)) {
    return { tipo: 'OC', to: `/compras/ordenes?q=${q}`, label: ref };
  }
  if (/^(FAC-C|FC[-_])/i.test(ref) || origen === 'COMPRA') {
    return { tipo: 'LIBRO_COMPRAS', to: `/compras/libro?q=${q}`, label: ref };
  }
  return { tipo: 'LIBRO_VENTAS', to: `/comercial/libro?q=${q}&todos=1`, label: ref };
}

export function pagoToCalceRef(pago: {
  id: string;
  tipo?: string | null;
  documentosCalce?: string | null;
  medio?: string | null;
}): CalceRefDto {
  const tipoPago = (pago.tipo ?? 'PAGO_TOTAL').toUpperCase();
  const esAnt = tipoPago === 'ANTICIPO' || tipoPago === 'ANTICIPO_PRODUCTOR';
  const refs = splitCalceRefs(pago.documentosCalce).filter((r) => !/^cartola\b/i.test(r));
  const comprobante = refs.find((r) => /^(TRF|PAG|ANT|TRX)([-_]|$)/i.test(r));
  const folio = refs.find((r) => r !== comprobante) ?? refs[0] ?? pago.id;
  const label = esAnt
    ? `Anticipo ${comprobante || folio}`
    : `Pago ${comprobante || pago.medio || pago.id}`;
  return {
    tipo: esAnt ? 'ANTICIPO' : 'PAGO',
    id: pago.id,
    ref: folio,
    label,
    to: `/tesoreria/pagos?q=${encodeURIComponent(pago.id)}`,
  };
}

export function anticipoToCalceRef(ant: {
  id: string;
  nroDocto?: string | null;
  nroComprobante?: string | null;
  documentosCalce?: string | null;
}): CalceRefDto {
  const ref = ant.nroComprobante || ant.nroDocto || ant.documentosCalce || ant.id;
  return {
    tipo: 'ANTICIPO',
    id: ant.id,
    ref,
    label: `Anticipo ${ref}`,
    to: `/tesoreria/pagos?q=${encodeURIComponent(ant.id)}`,
  };
}
