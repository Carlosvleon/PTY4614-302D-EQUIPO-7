import { normalizeMonedaTc } from '../catalogos/tipo-cambio.util';

export interface OpcionesCalcularDiferenciaTc {
  /** Monto en la moneda extranjera del documento (o monto cobrado/pagado) */
  monto: number;
  /** Tipo de cambio aplicado en el pago/cobro (banco/cartola o ingresado) */
  tcPago: number;
  /** Tipo de cambio original del documento (emisión/registro) */
  tcDocumento: number;
  /** Sentido del flujo: INGRESO/COBRO (venta) o EGRESO/PAGO (compra) */
  sentido: 'INGRESO' | 'EGRESO' | 'COBRO' | 'PAGO' | 'CLIENTE' | 'PROVEEDOR';
  /** Moneda del pago (por defecto CLP) */
  monedaPago?: string | null;
  /** Moneda del documento (ej. USD, EUR, CNY) */
  monedaDocumento?: string | null;
  /** Monto original en moneda extranjera si el monto base viene en CLP */
  montoMonedaExtranjera?: number | null;
}

export interface ResultadoDiferenciaTc {
  aplica: boolean;
  diferenciaTc: number;
  tipoResultado: 'GANANCIA' | 'PERDIDA' | 'NEUTRO';
  montoOrigenClp: number;
  montoLiquidadoClp: number;
  moneda: string;
  tcPago: number;
  tcDocumento: number;
  glosa: string;
}

/**
 * Calcula la Diferencia de Tipo de Cambio según norma contable IFRS / NIC 21:
 * - Cobro Cliente (Venta): (TC Pago - TC Doc) * Monto ME. Si sube el TC, ganancia (+).
 * - Pago Proveedor (Compra): (TC Doc - TC Pago) * Monto ME. Si sube el TC, se paga más en CLP -> pérdida (-).
 */
export function calcularDiferenciaTc(opts: OpcionesCalcularDiferenciaTc): ResultadoDiferenciaTc {
  const monedaPago = normalizeMonedaTc(opts.monedaPago);
  const monedaDoc = normalizeMonedaTc(opts.monedaDocumento);
  const monedaExtranjera = monedaDoc !== 'CLP' ? monedaDoc : (monedaPago !== 'CLP' ? monedaPago : 'CLP');

  const tcPago = Number(opts.tcPago);
  const tcDoc = Number(opts.tcDocumento);

  if (
    monedaExtranjera === 'CLP' ||
    !Number.isFinite(tcPago) ||
    !Number.isFinite(tcDoc) ||
    tcPago <= 0 ||
    tcDoc <= 0 ||
    tcPago === tcDoc
  ) {
    const monto = Number(opts.monto) || 0;
    return {
      aplica: false,
      diferenciaTc: 0,
      tipoResultado: 'NEUTRO',
      montoOrigenClp: monto,
      montoLiquidadoClp: monto,
      moneda: monedaExtranjera,
      tcPago: Number.isFinite(tcPago) && tcPago > 0 ? tcPago : 1,
      tcDocumento: Number.isFinite(tcDoc) && tcDoc > 0 ? tcDoc : 1,
      glosa: 'Sin diferencia de tipo de cambio',
    };
  }

  // Base en moneda extranjera: si se pasa montoMonedaExtranjera, se usa; si no, si monto está en ME se usa opts.monto
  let baseMe = Number(opts.montoMonedaExtranjera);
  if (!Number.isFinite(baseMe) || baseMe <= 0) {
    if (monedaDoc !== 'CLP' && opts.monto < 1_000_000) {
      baseMe = Number(opts.monto);
    } else {
      // Si el monto vino convertido en CLP, derivamos la base en ME usando el tcDoc
      baseMe = Number(opts.monto) / tcDoc;
    }
  }

  const esVenta =
    opts.sentido === 'INGRESO' ||
    opts.sentido === 'COBRO' ||
    opts.sentido === 'CLIENTE';

  const montoOrigenClp = Math.round(baseMe * tcDoc);
  const montoLiquidadoClp = Math.round(baseMe * tcPago);

  let diferenciaTc = 0;
  if (esVenta) {
    // Cobro Venta: más pesos recibidos = ganancia (+)
    diferenciaTc = montoLiquidadoClp - montoOrigenClp;
  } else {
    // Pago Compra: más pesos desembolsados = pérdida (-)
    diferenciaTc = montoOrigenClp - montoLiquidadoClp;
  }

  const tipoResultado: 'GANANCIA' | 'PERDIDA' | 'NEUTRO' =
    diferenciaTc > 0 ? 'GANANCIA' : diferenciaTc < 0 ? 'PERDIDA' : 'NEUTRO';

  const sentidoDesc = esVenta ? 'Cobro factura' : 'Pago proveedor';
  const resultadoDesc = tipoResultado === 'GANANCIA' ? 'Ganancia' : tipoResultado === 'PERDIDA' ? 'Pérdida' : 'Neutro';
  const glosa = `${resultadoDesc} por Diferencia de Cambio ${monedaExtranjera} (${sentidoDesc}): TC Pago $${tcPago.toFixed(2)} vs TC Doc $${tcDoc.toFixed(2)}`;

  return {
    aplica: true,
    diferenciaTc,
    tipoResultado,
    montoOrigenClp,
    montoLiquidadoClp,
    moneda: monedaExtranjera,
    tcPago,
    tcDocumento: tcDoc,
    glosa,
  };
}
