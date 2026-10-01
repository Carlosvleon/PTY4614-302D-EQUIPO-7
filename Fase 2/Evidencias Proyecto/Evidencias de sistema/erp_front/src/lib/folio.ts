/**
 * P1-8: los folios ya no se sugieren con Math.random() (rango acotado de
 * ~1000-9000 valores → colisión frecuente contra folios ya emitidos). En su
 * lugar se propone el correlativo siguiente en base a los folios existentes
 * de la empresa. Esto es una solución mínima viable: el folio "oficial" y
 * definitivo (con timbre/CAF) lo entregará GoSocket una vez integrado, así
 * que no se construye aquí un correlativo formal por tipo de documento.
 */
export function sugerirSiguienteFolio(
  folios: Array<string | number | null | undefined>,
  base = 1000,
): string {
  let max = 0;
  for (const raw of folios) {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (!digits) continue;
    const n = Number(digits);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(Math.max(max + 1, base));
}
