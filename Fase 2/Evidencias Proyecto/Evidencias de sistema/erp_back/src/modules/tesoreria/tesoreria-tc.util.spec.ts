import { calcularDiferenciaTc } from './tesoreria-tc.util';

describe('calcularDiferenciaTc', () => {
  it('calcula ganancia por diferencia de cambio en cobro de factura COMEX (USD)', () => {
    // Factura emitida por 10,000 USD a TC $950 ($9,500,000 CLP)
    // Cobrada a TC $965.71 ($9,657,100 CLP) -> Ganancia de +$157,100 CLP
    const res = calcularDiferenciaTc({
      monto: 10000,
      monedaDocumento: 'USD',
      monedaPago: 'CLP',
      tcDocumento: 950,
      tcPago: 965.71,
      sentido: 'COBRO',
    });

    expect(res.aplica).toBe(true);
    expect(res.tipoResultado).toBe('GANANCIA');
    expect(res.diferenciaTc).toBe(157100);
    expect(res.montoOrigenClp).toBe(9500000);
    expect(res.montoLiquidadoClp).toBe(9657100);
    expect(res.glosa).toContain('Ganancia por Diferencia de Cambio USD');
  });

  it('calcula pérdida por diferencia de cambio en cobro de factura si el dólar baja', () => {
    // Factura 10,000 USD a TC $950 ($9,500,000 CLP)
    // Cobrada a TC $940 ($9,400,000 CLP) -> Pérdida de -$100,000 CLP
    const res = calcularDiferenciaTc({
      monto: 10000,
      monedaDocumento: 'USD',
      monedaPago: 'CLP',
      tcDocumento: 950,
      tcPago: 940,
      sentido: 'CLIENTE',
    });

    expect(res.aplica).toBe(true);
    expect(res.tipoResultado).toBe('PERDIDA');
    expect(res.diferenciaTc).toBe(-100000);
  });

  it('calcula pérdida por diferencia de cambio en pago a proveedor si el dólar sube', () => {
    // Compra de 5,000 USD registrada a TC $950 ($4,750,000 CLP)
    // Pagada a TC $965 ($4,825,000 CLP) -> Pagamos más pesos, Pérdida de -$75,000 CLP
    const res = calcularDiferenciaTc({
      monto: 5000,
      monedaDocumento: 'USD',
      monedaPago: 'CLP',
      tcDocumento: 950,
      tcPago: 965,
      sentido: 'PAGO',
    });

    expect(res.aplica).toBe(true);
    expect(res.tipoResultado).toBe('PERDIDA');
    expect(res.diferenciaTc).toBe(-75000);
  });

  it('calcula ganancia por diferencia de cambio en pago a proveedor si el dólar baja', () => {
    // Compra 5,000 USD a TC $950 ($4,750,000 CLP)
    // Pagada a TC $930 ($4,650,000 CLP) -> Pagamos menos pesos, Ganancia de +$100,000 CLP
    const res = calcularDiferenciaTc({
      monto: 5000,
      monedaDocumento: 'USD',
      monedaPago: 'CLP',
      tcDocumento: 950,
      tcPago: 930,
      sentido: 'PROVEEDOR',
    });

    expect(res.aplica).toBe(true);
    expect(res.tipoResultado).toBe('GANANCIA');
    expect(res.diferenciaTc).toBe(100000);
  });

  it('retorna neutro si la moneda es CLP o los tipos de cambio son idénticos', () => {
    const resClp = calcularDiferenciaTc({
      monto: 100000,
      monedaDocumento: 'CLP',
      monedaPago: 'CLP',
      tcDocumento: 1,
      tcPago: 1,
      sentido: 'COBRO',
    });
    expect(resClp.aplica).toBe(false);
    expect(resClp.diferenciaTc).toBe(0);
    expect(resClp.tipoResultado).toBe('NEUTRO');

    const resMismoTc = calcularDiferenciaTc({
      monto: 1000,
      monedaDocumento: 'USD',
      monedaPago: 'CLP',
      tcDocumento: 950,
      tcPago: 950,
      sentido: 'PAGO',
    });
    expect(resMismoTc.aplica).toBe(false);
    expect(resMismoTc.diferenciaTc).toBe(0);
  });
});
