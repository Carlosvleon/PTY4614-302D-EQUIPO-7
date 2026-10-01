import { BadRequestException } from '@nestjs/common';

/** Códigos nuevos de centros / elementos / códigos financieros: solo dígitos. */
export const CODIGO_CATALOGO_NUMERICO_RE = /^\d+$/;

export function assertCodigoCatalogoNuevo(codigo: string): string {
  const c = String(codigo ?? '').trim();
  if (!CODIGO_CATALOGO_NUMERICO_RE.test(c)) {
    throw new BadRequestException('El código solo admite dígitos (0-9)');
  }
  return c;
}

/** En update el código es inmutable (no se reasigna ni se pisa). */
export function assertCodigoCatalogoInmutable(existing: string, incoming: string): void {
  const next = String(incoming ?? '').trim();
  if (next.toUpperCase() !== String(existing ?? '').toUpperCase()) {
    throw new BadRequestException('El código no se puede modificar');
  }
}

export function normalizeNombreCatalogo(nombre: string): string {
  return String(nombre ?? '').trim().toUpperCase();
}

/** Fecha de alta local (YYYY-MM-DD) para vigencia automática. */
export function hoyIsoDateLocal(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Siguiente entero libre entre códigos que ya son solo dígitos (si no hay, 1). */
export function siguienteCodigoNumericoLibre(codigos: Iterable<string>): string {
  let max = 0;
  for (const raw of codigos) {
    const c = String(raw ?? '').trim();
    if (!CODIGO_CATALOGO_NUMERICO_RE.test(c)) continue;
    const n = Number(c);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}
