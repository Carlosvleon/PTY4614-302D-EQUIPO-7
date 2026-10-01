/** OV con stock descontado. Distinto de APROBADO (OC / PIN). */
export const ESTADO_OV_CONFIRMADA = 'CONFIRMADA';

export const ESTADOS_OV_FACTURABLES = ['CONFIRMADA', 'EMITIDO'] as const;

export function normalizeEstadoOv(estado: string): string {
  const e = estado.trim().toUpperCase();
  if (e === 'APROBADO') return ESTADO_OV_CONFIRMADA;
  return e;
}

export function ovEsFacturable(estado: string): boolean {
  return (ESTADOS_OV_FACTURABLES as readonly string[]).includes(normalizeEstadoOv(estado));
}
