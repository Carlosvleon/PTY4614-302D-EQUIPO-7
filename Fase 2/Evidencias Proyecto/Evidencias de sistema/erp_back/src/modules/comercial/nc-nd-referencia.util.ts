/** Tipos ERP que una NC/ND puede referenciar si ya están en la BD. */
export const TIPOS_ORIGEN_NC_ND = ['FACTURA', 'NC', 'ND', 'GUIA'] as const;

/** TpoDocRef SII admitidos para la referencia de una NC/ND. */
export const TIPOS_DTE_REFERENCIA = ['33', '34', '52', '56', '61', '110', '111', '112'] as const;

export function esTipoOrigenNcNd(tipo: string | null | undefined): boolean {
  return TIPOS_ORIGEN_NC_ND.includes((tipo || '').toUpperCase() as (typeof TIPOS_ORIGEN_NC_ND)[number]);
}

export function esTipoDteReferencia(tipo: string | null | undefined): boolean {
  return TIPOS_DTE_REFERENCIA.includes(String(tipo || '').trim() as (typeof TIPOS_DTE_REFERENCIA)[number]);
}

export function esCodRefSii(n: unknown): n is 1 | 2 | 3 {
  return n === 1 || n === 2 || n === 3;
}

/** Referencia SII mínima: tipo DTE + folio + fecha + CodRef. Sin alta fantasma. */
export function referenciaManualCompleta(d: {
  referenciaTipo?: string | null;
  referenciaFolio?: string | null;
  referenciaFecha?: string | Date | null;
  referenciaCod?: number | null;
}): boolean {
  const folio = String(d.referenciaFolio || '').trim();
  const fecha = d.referenciaFecha instanceof Date
    ? !Number.isNaN(d.referenciaFecha.getTime())
    : Boolean(String(d.referenciaFecha || '').trim());
  return esTipoDteReferencia(d.referenciaTipo) && folio.length > 0 && fecha && esCodRefSii(d.referenciaCod);
}
