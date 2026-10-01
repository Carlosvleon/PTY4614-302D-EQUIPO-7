/**
 * Longitudes XSD SII formato_dte 2.5 (PDF 2026-02).
 * GoSocket GUF no publica maxLength de Chile; el SII rechaza (RCH) si se exceden.
 */
export const SII_DTE = {
  rznSoc: 100,
  giroEmis: 80,
  dirOrigen: 60,
  cmnaOrigen: 20,
  ciudadOrigen: 20,
  rznSocRecep: 100,
  giroRecep: 40,
  dirRecep: 70,
  cmnaRecep: 20,
  ciudadRecep: 20,
  nmbItem: 80,
  dscItem: 1000,
  unmdItem: 4,
} as const;

export function clipSii(value: string | null | undefined, max: number): string | undefined {
  const t = value?.trim();
  if (!t) return undefined;
  return t.length <= max ? t : t.slice(0, max);
}
