/** Estados de OC con los que se puede asociar una factura al libro (incl. no aprobada). */
export const OC_ESTADOS_ASOCIAR = new Set([
  'BORRADOR',
  'PENDIENTE_APROBACION',
  'EMITIDO',
  'APROBADO',
  'RECEPCIONADA',
  'CONTABILIZADA',
  'FACTURADO',
]);

/** Estados de OC que permiten contabilizar o pagar la factura asociada. */
export const OC_ESTADOS_OPERAR = new Set([
  'APROBADO',
  'RECEPCIONADA',
  'CONTABILIZADA',
  'FACTURADO',
]);

export function ocPermiteAsociarFactura(estado?: string | null): boolean {
  return Boolean(estado && OC_ESTADOS_ASOCIAR.has(estado));
}

export function ocPermiteContabilizarOPagar(estado?: string | null): boolean {
  return Boolean(estado && OC_ESTADOS_OPERAR.has(estado));
}

/** Hay OC ligada y aún no está APROBADO (ni posterior). */
export function ocNoAprobada(estado?: string | null): boolean {
  return Boolean(estado) && !OC_ESTADOS_OPERAR.has(estado as string);
}
