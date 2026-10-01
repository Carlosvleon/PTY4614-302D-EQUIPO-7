import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EQUIVALENTE_MODO_DEFAULT,
  debeSugerirTcBc,
  equivalenteClp,
  fmtEquivalenteClp,
  necesitaCampoTc,
  sugerirTcFormulario,
  tcAplicado,
  tcDeFecha,
  faltaUsdBcDelDia,
  calcularDiferenciaTcClient,
} from './tipo-cambio.ts';

const ROWS = [
  { fecha: '2026-08-27', usd: 940, eur: 1100, cny: 130 },
  { fecha: '2026-08-28', usd: 945.5, eur: 1104, cny: 131.2 },
  { fecha: '2026-08-31', usd: 950, eur: 0, cny: 132 },
];

describe('faltaUsdBcDelDia', () => {
  it('alerta en hábil si no hay USD de esa fecha, aunque haya días anteriores', () => {
    assert.equal(faltaUsdBcDelDia(ROWS, '2026-08-27'), false);
    assert.equal(faltaUsdBcDelDia(ROWS, '2026-08-28'), false);
    assert.equal(faltaUsdBcDelDia(ROWS, '2026-09-10'), true);
  });

  it('no alerta sábado ni domingo', () => {
    assert.equal(faltaUsdBcDelDia([], '2026-09-12'), false);
    assert.equal(faltaUsdBcDelDia([], '2026-09-13'), false);
  });
});

describe('no pisar productor', () => {
  it('ANTICIPO_PRODUCTOR no toma TC BC', () => {
    assert.equal(
      debeSugerirTcBc({ tipoPago: 'ANTICIPO_PRODUCTOR', monedaPago: 'USD', tcManual: null }),
      false,
    );
    assert.equal(
      sugerirTcFormulario({
        tipo: 'ANTICIPO_PRODUCTOR',
        monedaPago: 'USD',
        fecha: '2026-08-28',
        tcActual: '',
        indicadores: ROWS,
      }),
      '',
    );
  });

  it('pago no productor vacío sí sugiere BC', () => {
    assert.equal(
      sugerirTcFormulario({
        tipo: 'PAGO_TOTAL',
        monedaPago: 'USD',
        fecha: '2026-08-28',
        tcActual: '',
        indicadores: ROWS,
      }),
      945.5,
    );
  });

  it('CLP/CLP no muestra ni sugiere TC; factura USD sí', () => {
    assert.equal(
      necesitaCampoTc({ tipoPago: 'PAGO_TOTAL', monedaPago: 'CLP', monedaFactura: 'CLP' }),
      false,
    );
    assert.equal(
      necesitaCampoTc({ tipoPago: 'ANTICIPO_PRODUCTOR', monedaPago: 'CLP', monedaFactura: 'CLP' }),
      true,
    );
    assert.equal(
      sugerirTcFormulario({
        tipo: 'PAGO_TOTAL',
        monedaPago: 'CLP',
        monedaFactura: 'CLP',
        fecha: '2026-08-28',
        tcActual: '',
        indicadores: ROWS,
      }),
      '',
    );
    assert.equal(
      sugerirTcFormulario({
        tipo: 'PAGO_TOTAL',
        monedaPago: 'CLP',
        monedaFactura: 'USD',
        fecha: '2026-08-28',
        tcActual: '',
        indicadores: ROWS,
      }),
      945.5,
    );
  });
});

describe('equivalente flujo pinzas OFF por defecto', () => {
  it('modo default es nativo (no convierte)', () => {
    assert.equal(EQUIVALENTE_MODO_DEFAULT, 'nativo');
    assert.equal(
      equivalenteClp({
        monto: 10,
        moneda: 'USD',
        fecha: '2026-08-28',
        indicadores: ROWS,
        modo: EQUIVALENTE_MODO_DEFAULT,
      }),
      null,
    );
    assert.equal(fmtEquivalenteClp(null), '—');
  });

  it('TC de la fecha vs TC de hoy; sin dato → em dash', () => {
    assert.equal(
      equivalenteClp({
        monto: 10,
        moneda: 'USD',
        fecha: '2026-08-28',
        indicadores: ROWS,
        modo: 'fecha',
      }),
      9455,
    );
    assert.equal(
      equivalenteClp({
        monto: 10,
        moneda: 'USD',
        fecha: '2026-08-28',
        indicadores: ROWS,
        modo: 'hoy',
        hoyIso: '2026-08-31',
      }),
      9500,
    );
    assert.equal(
      equivalenteClp({
        monto: 10,
        moneda: 'USD',
        fecha: '2026-08-01',
        indicadores: ROWS,
        modo: 'fecha',
      }),
      null,
    );
    assert.deepEqual(tcAplicado(ROWS, '2026-08-29', 'USD'), { tc: 945.5, fecha: '2026-08-28' });
    assert.deepEqual(tcAplicado(ROWS, '2026-08-28', 'USD'), { tc: 945.5, fecha: '2026-08-28' });
  });
});

describe('calcularDiferenciaTcClient (NIC 21)', () => {
  it('calcula ganancia en cobro de venta USD', () => {
    const res = calcularDiferenciaTcClient({
      monto: 10000,
      monedaDocumento: 'USD',
      monedaPago: 'CLP',
      tcDocumento: 950,
      tcPago: 965.71,
      sentido: 'COBRO',
    });
    assert.equal(res.aplica, true);
    assert.equal(res.tipoResultado, 'GANANCIA');
    assert.equal(res.diferenciaTc, 157100);
    assert.equal(res.montoOrigenClp, 9500000);
    assert.equal(res.montoLiquidadoClp, 9657100);
  });

  it('calcula pérdida en cobro de venta USD si baja el tipo de cambio', () => {
    const res = calcularDiferenciaTcClient({
      monto: 10000,
      monedaDocumento: 'USD',
      monedaPago: 'CLP',
      tcDocumento: 950,
      tcPago: 940,
      sentido: 'CLIENTE',
    });
    assert.equal(res.aplica, true);
    assert.equal(res.tipoResultado, 'PERDIDA');
    assert.equal(res.diferenciaTc, -100000);
  });

  it('calcula pérdida en pago a proveedor USD si sube el tipo de cambio', () => {
    const res = calcularDiferenciaTcClient({
      monto: 5000,
      monedaDocumento: 'USD',
      monedaPago: 'CLP',
      tcDocumento: 950,
      tcPago: 965,
      sentido: 'PAGO',
    });
    assert.equal(res.aplica, true);
    assert.equal(res.tipoResultado, 'PERDIDA');
    assert.equal(res.diferenciaTc, -75000);
  });

  it('retorna neutro si es CLP o el TC es idéntico', () => {
    const res = calcularDiferenciaTcClient({
      monto: 100000,
      monedaDocumento: 'CLP',
      monedaPago: 'CLP',
      tcDocumento: 1,
      tcPago: 1,
      sentido: 'COBRO',
    });
    assert.equal(res.aplica, false);
    assert.equal(res.diferenciaTc, 0);
  });
});
