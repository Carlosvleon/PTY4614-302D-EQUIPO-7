/**
 * Catálogo del flujo de caja Excel (temporada sep 2024 – ago 2025).
 * Concepto = bloque numerado. Código = línea bajo ese bloque.
 * Los montos viven solo en el modo demo: las celdas ######## no se inventan.
 */

export const MESES_FLUJO_EXCEL = [
  '2024-09', '2024-10', '2024-11', '2024-12',
  '2025-01', '2025-02', '2025-03', '2025-04',
  '2025-05', '2025-06', '2025-07', '2025-08',
] as const;

export type ConceptoFlujoExcel = { codigo: string; nombre: string; orden: number };
export type CodigoFlujoExcel = { codigo: string; nombre: string; conceptoCodigo: string };

export const CONCEPTOS_FLUJO_EXCEL: ConceptoFlujoExcel[] = [
  { codigo: 'ING-OPE', nombre: 'Ingreso operacional', orden: 10 },
  { codigo: 'ING-NOP', nombre: 'Ingreso no operacional', orden: 20 },
  { codigo: 'EGR-OPE', nombre: 'Egresos operacionales', orden: 30 },
  { codigo: 'EGR-NOP', nombre: 'Egreso no operacional', orden: 40 },
  { codigo: 'CAPEX', nombre: 'Capex', orden: 50 },
  { codigo: 'FINAN', nombre: 'Financiamiento', orden: 60 },
  { codigo: 'VENC', nombre: 'Vencimientos', orden: 70 },
];

export const CODIGOS_FLUJO_EXCEL: CodigoFlujoExcel[] = [
  { codigo: 'VTA-EXP-NEC', nombre: 'Venta export. nectarín', conceptoCodigo: 'ING-OPE' },
  { codigo: 'VTA-EXP-CER', nombre: 'Venta exportación cereza', conceptoCodigo: 'ING-OPE' },
  { codigo: 'VTA-EXP-DUR', nombre: 'Venta exportación durazno', conceptoCodigo: 'ING-OPE' },
  { codigo: 'VTA-NAC-CER', nombre: 'Venta nacional cerezas', conceptoCodigo: 'ING-OPE' },
  { codigo: 'VTA-NAC-DUR', nombre: 'Venta nacional durazno', conceptoCodigo: 'ING-OPE' },
  { codigo: 'VTA-NAC-NEC', nombre: 'Venta nacional nectarín', conceptoCodigo: 'ING-OPE' },
  { codigo: 'VTA-PTERM', nombre: 'Venta producto terminal', conceptoCodigo: 'ING-OPE' },
  { codigo: 'DEV-EXP', nombre: 'Devolución / imp. a la exportación', conceptoCodigo: 'ING-NOP' },
  { codigo: 'OTROS-ING', nombre: 'Otros ingresos', conceptoCodigo: 'ING-NOP' },
  { codigo: 'REC-IVA', nombre: 'Recuperación IVA exportación', conceptoCodigo: 'ING-NOP' },
  { codigo: 'VTA-MP', nombre: 'Venta materia prima', conceptoCodigo: 'ING-NOP' },
  { codigo: 'COMB', nombre: 'Combustibles', conceptoCodigo: 'EGR-OPE' },
  { codigo: 'COMPRA-PTERM', nombre: 'Compra producto terminado', conceptoCodigo: 'EGR-OPE' },
  { codigo: 'GASTO-ADU', nombre: 'Gastos aduana', conceptoCodigo: 'EGR-OPE' },
  { codigo: 'GASTO-FLE', nombre: 'Gastos fletes', conceptoCodigo: 'EGR-OPE' },
  { codigo: 'LEYES', nombre: 'Leyes sociales', conceptoCodigo: 'EGR-OPE' },
  { codigo: 'MAT-PRIMA', nombre: 'Materia prima', conceptoCodigo: 'EGR-OPE' },
  { codigo: 'MATERIALES', nombre: 'Materiales', conceptoCodigo: 'EGR-OPE' },
  { codigo: 'REM-CONT', nombre: 'Remuneración contratista', conceptoCodigo: 'EGR-OPE' },
  { codigo: 'REMUN', nombre: 'Remuneraciones', conceptoCodigo: 'EGR-OPE' },
  { codigo: 'RENDIC', nombre: 'Rendiciones de fondos', conceptoCodigo: 'EGR-OPE' },
  { codigo: 'SERV-PACK', nombre: 'Servicio packing', conceptoCodigo: 'EGR-OPE' },
  { codigo: 'SERVICIOS', nombre: 'Servicios', conceptoCodigo: 'EGR-OPE' },
  { codigo: 'PAGO-IMP', nombre: 'Pago impuesto', conceptoCodigo: 'EGR-NOP' },
  { codigo: 'ACT-FIJO', nombre: 'Activo fijo', conceptoCodigo: 'CAPEX' },
  { codigo: 'LEASING', nombre: 'Leasing', conceptoCodigo: 'CAPEX' },
  { codigo: 'FIN-BCHILE', nombre: 'Financiamiento Banco Chile', conceptoCodigo: 'FINAN' },
  { codigo: 'FIN-EERR', nombre: 'Financiamiento EERR', conceptoCodigo: 'FINAN' },
  { codigo: 'DIF-TC', nombre: 'Diferencia tipo de cambio', conceptoCodigo: 'VENC' },
  { codigo: 'INT-BANC', nombre: 'Intereses y comisiones bancarias', conceptoCodigo: 'VENC' },
  { codigo: 'TRASPASO', nombre: 'Traspaso entre cuentas', conceptoCodigo: 'VENC' },
];
