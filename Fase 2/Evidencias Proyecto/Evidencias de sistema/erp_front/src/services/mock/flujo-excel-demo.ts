/**
 * Columna agosto del flujo Excel, cargada en el periodo demo 2026-08.
 * El modo demo solo usa agosto. null = celda vacía o ########.
 * Negativo = egreso. Positivo = ingreso.
 */
import type { CartolaBancaria, CodigoFinanciero, ConceptoFlujo, MovimientoCartola } from '@/types/domain';
import { CODIGOS_FLUJO_EXCEL, CONCEPTOS_FLUJO_EXCEL } from '../../../../erp_back/prisma/flujo-excel-almahue';

const PERIODO_DEMO = '2026-08';

const EMP = 'EMP-1';

export const conceptosFlujoExcel: ConceptoFlujo[] = CONCEPTOS_FLUJO_EXCEL.map((c) => ({
  id: `CX-EX-${c.codigo}`,
  codigo: c.codigo,
  nombre: c.nombre,
  orden: c.orden,
  activo: true,
  empresaId: EMP,
}));

const ALTAS_FLUJO = '2026-08-01T00:00:00.000Z';
let seqCodigoFlujo = 20101;
const codigoFlujoPorOrigen = new Map<string, CodigoFinanciero>();

export const codigosFlujoExcel: CodigoFinanciero[] = CODIGOS_FLUJO_EXCEL.map((c) => {
  const concepto = CONCEPTOS_FLUJO_EXCEL.find((x) => x.codigo === c.conceptoCodigo);
  const esTraspaso = c.codigo === 'TRASPASO';
  const row: CodigoFinanciero = {
    id: esTraspaso ? 'CF-4' : `CF-EX-${c.codigo}`,
    codigo: esTraspaso ? '10400' : String(seqCodigoFlujo++),
    nombre: c.nombre.trim().toUpperCase(),
    activa: true,
    empresaId: EMP,
    conceptoId: `CX-EX-${c.conceptoCodigo}`,
    conceptoCodigo: c.conceptoCodigo,
    conceptoNombre: concepto?.nombre,
    createdAt: ALTAS_FLUJO,
  };
  codigoFlujoPorOrigen.set(c.codigo, row);
  return row;
});

/** Agosto de la planilla. El resto de meses no entra al demo. */
const MONTOS_AGOSTO: Record<string, number | null> = {
  'VTA-EXP-NEC': 1617,
  'VTA-EXP-CER': 355000000,
  'DEV-EXP': 206774401,
  'OTROS-ING': 83333089,
  'COMB': -4103327,
  'GASTO-FLE': -13133538,
  'MAT-PRIMA': -905735004,
  'REM-CONT': -61902221,
  'REMUN': -5256147,
  'RENDIC': -4578898,
  'SERVICIOS': -58640035,
  'PAGO-IMP': -28053533,
  'FIN-BCHILE': -13804909,
  'DIF-TC': 3339714,
  'INT-BANC': -2233888,
  'TRASPASO': -4578898,
};

export function movimientosFlujoExcel(): MovimientoCartola[] {
  const out: MovimientoCartola[] = [];
  for (const [codigo, monto] of Object.entries(MONTOS_AGOSTO)) {
    const cf = codigoFlujoPorOrigen.get(codigo);
    if (!cf || monto == null || monto === 0) continue;
    out.push({
      id: `MCAR-EX-${codigo}-${PERIODO_DEMO}`,
      cartolaId: 'CAR-EXCEL',
      fecha: `${PERIODO_DEMO}-15`,
      referencia: `EXCEL-${PERIODO_DEMO}`,
      glosa: `${cf.nombre} ${PERIODO_DEMO}`,
      monto: Math.abs(monto),
      tipo: monto < 0 ? 'EGRESO' : 'INGRESO',
      estadoContable: 'CONTABILIZADO',
      codigoFinancieroId: cf.id,
      codigoFinanciero: `${cf.codigo} · ${cf.nombre}`,
    });
  }
  return out;
}

export function cartolaFlujoExcel(movimientos: MovimientoCartola[]): CartolaBancaria {
  const montoTotal = movimientos.reduce((s, m) => s + m.monto, 0);
  return {
    id: 'CAR-EXCEL',
    banco: 'Banco Chile',
    bancoCodigo: '110102008',
    fechaCarga: '2026-08-31',
    periodo: '2026-08-01/2026-08-31',
    mesContable: '2026/08',
    moneda: 'CLP',
    archivoNombre: 'flujo-caja-excel-agosto.xlsx',
    formato: 'EXCEL',
    movimientos: movimientos.length,
    montoTotal,
    estado: 'CERRADA',
    pendientesContabilizar: 0,
    usuarioCarga: 'demo',
  };
}
