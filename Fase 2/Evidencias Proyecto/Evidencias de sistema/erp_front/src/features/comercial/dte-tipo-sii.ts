/**
 * Catálogo SII para listados y filtros. No habilita emisión de tipos aún no cableados.
 * Factura de exportación electrónica = 110 (no el 101 papel).
 */
export type TipoDteSiiListado = {
  codigo: string;
  nombre: string;
  /** Ya se puede emitir desde el wizard actual. */
  implementado: boolean;
};

export const TIPOS_DTE_SII_LISTADO: readonly TipoDteSiiListado[] = [
  { codigo: '39', nombre: 'Boleta afecta', implementado: false },
  { codigo: '41', nombre: 'Boleta exenta', implementado: false },
  { codigo: '33', nombre: 'Factura afecta', implementado: true },
  { codigo: '34', nombre: 'Factura exenta', implementado: true },
  { codigo: '56', nombre: 'Nota de débito', implementado: true },
  { codigo: '61', nombre: 'Nota de crédito', implementado: true },
  { codigo: '52', nombre: 'Guía de despacho', implementado: true },
  { codigo: '110', nombre: 'Factura exportación', implementado: true },
  { codigo: '111', nombre: 'Nota de débito exportación', implementado: true },
  { codigo: '112', nombre: 'Nota de crédito exportación', implementado: true },
];

export function labelTipoDteSii(codigo: string | null | undefined): string {
  const c = String(codigo ?? '').trim();
  if (!c) return '—';
  const row = TIPOS_DTE_SII_LISTADO.find((t) => t.codigo === c);
  return row ? `${row.codigo} · ${row.nombre}` : c;
}

export function esCodigoTipoDteListado(codigo: string | null | undefined): boolean {
  const c = String(codigo ?? '').trim();
  return TIPOS_DTE_SII_LISTADO.some((t) => t.codigo === c);
}

export function filterOptionsTipoDteLibro(): { value: string; label: string }[] {
  return TIPOS_DTE_SII_LISTADO.map((t) => ({
    value: t.codigo,
    label: `${t.codigo} · ${t.nombre}`,
  }));
}
