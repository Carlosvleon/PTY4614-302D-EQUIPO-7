/** Siguiente entero libre: uno más que el mayor código numérico ya usado. Si no hay, 1. */
export function siguienteCodigoNumerico(codigos: Iterable<string | null | undefined>): string {
  let max = 0;
  for (const raw of codigos) {
    const c = String(raw ?? '').trim();
    if (!/^\d+$/.test(c)) continue;
    const n = Number(c);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

export const HINT_CODIGO_SUGERIDO = 'Sugerido. Puede cambiarlo.';
