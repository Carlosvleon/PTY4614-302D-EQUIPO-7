import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  agruparFlujoPorConcepto,
  aperturasFaltantes,
  applySaldosNativos,
  buildFlujoCaja,
  codigoFinancieroLabel,
  inferMonedaBanco,
  kpisFlujoNativos,
  mapCartolaToFilaFlujo,
  matchesMonedaFiltro,
  normalizeMonedaCodigo,
  parseMonedaFiltro,
  rollupFlujoExcel,
  sumarNativo,
} from './flujo-caja.ts';

describe('flujo-caja moneda', () => {
  it('normaliza YUAN/RMB a CNY y vacío a CLP', () => {
    assert.equal(normalizeMonedaCodigo('yuan'), 'CNY');
    assert.equal(normalizeMonedaCodigo('RMB'), 'CNY');
    assert.equal(normalizeMonedaCodigo(''), 'CLP');
    assert.equal(normalizeMonedaCodigo('usd'), 'USD');
  });

  it('filtro Yuan acepta CNY y YUAN; no convierte montos', () => {
    assert.equal(parseMonedaFiltro('Yuan'), 'CNY');
    assert.equal(parseMonedaFiltro('YUAN'), 'CNY');
    assert.equal(matchesMonedaFiltro('CNY', 'CNY'), true);
    assert.equal(matchesMonedaFiltro('YUAN', 'CNY'), true);
    assert.equal(matchesMonedaFiltro('CLP', 'USD'), false);
    assert.equal(matchesMonedaFiltro('USD', 'TODAS'), true);
  });

  it('infiere moneda del banco; default CLP (no inventa yuan)', () => {
    assert.equal(inferMonedaBanco('Banco Estado', '110102001'), 'CLP');
    assert.equal(inferMonedaBanco('Banco Chile USD'), 'USD');
    assert.equal(inferMonedaBanco('Banco China CNY'), 'CNY');
    assert.equal(inferMonedaBanco('Cuenta yuan export'), 'CNY');
    assert.equal(inferMonedaBanco('Banco Chile'), 'CLP');
  });
});

describe('flujo-caja map y sumas nativas', () => {
  it('cartola PENDIENTE no entra; INGRESO/EGRESO nativos', () => {
    assert.equal(
      mapCartolaToFilaFlujo({
        id: 'x',
        cartolaId: 'c',
        fecha: '2026-08-01',
        glosa: 'pendiente',
        monto: 100,
        tipo: 'INGRESO',
        estadoContable: 'PENDIENTE',
        banco: 'Banco Estado',
      }),
      null,
    );
    const ing = mapCartolaToFilaFlujo({
      id: '1',
      cartolaId: 'c',
      fecha: '2026-08-02',
      glosa: 'Abono',
      referencia: 'TRF-1',
      monto: 1500,
      tipo: 'INGRESO',
      estadoContable: 'CONTABILIZADO',
      banco: 'Banco Estado',
      codigoFinanciero: 'COBRO-CLI · Cobro a clientes',
    });
    assert.ok(ing);
    assert.equal(ing.ingreso, 1500);
    assert.equal(ing.egreso, 0);
    assert.equal(ing.moneda, 'CLP');
    assert.equal(ing.codigoFinancieroCodigo, 'COBRO-CLI');
    assert.equal(codigoFinancieroLabel(ing), 'COBRO-CLI · Cobro a clientes');

    const egr = mapCartolaToFilaFlujo({
      id: '2',
      cartolaId: 'c',
      fecha: '2026-08-03',
      glosa: 'Pago',
      monto: 200,
      tipo: 'EGRESO',
      estadoContable: 'CONTABILIZADO',
      banco: 'Banco Chile USD',
    });
    assert.ok(egr);
    assert.equal(egr.ingreso, 0);
    assert.equal(egr.egreso, 200);
    assert.equal(egr.moneda, 'USD');
    assert.equal(codigoFinancieroLabel(egr), '—');
  });

  it('suma nativa por moneda: no mezcla CLP con USD', () => {
    const filas = buildFlujoCaja({
      aperturas: [
        { id: 'a-clp', fecha: '2026-08-01', concepto: 'Apertura CLP', ingreso: 1000, banco: 'Estado', moneda: 'CLP', esApertura: true },
        { id: 'a-usd', fecha: '2026-08-01', concepto: 'Apertura USD', ingreso: 80, banco: 'Chile USD', moneda: 'USD', esApertura: true },
      ],
      cartolas: [
        { id: 'c1', banco: 'Estado' },
        { id: 'c2', banco: 'Chile USD' },
      ],
      movimientos: [
        {
          id: 'm1', cartolaId: 'c1', fecha: '2026-08-05', glosa: 'Pago', monto: 100,
          tipo: 'EGRESO', estadoContable: 'CONTABILIZADO',
        },
        {
          id: 'm2', cartolaId: 'c2', fecha: '2026-08-05', glosa: 'Cobro', monto: 10,
          tipo: 'INGRESO', estadoContable: 'CONTABILIZADO',
        },
        {
          id: 'm3', cartolaId: 'c1', fecha: '2026-08-06', glosa: 'Pendiente', monto: 99999,
          tipo: 'INGRESO', estadoContable: 'PENDIENTE',
        },
      ],
    });
    const clp = filas.filter((f) => matchesMonedaFiltro(f.moneda, 'CLP'));
    const usd = filas.filter((f) => matchesMonedaFiltro(f.moneda, 'USD'));
    assert.equal(sumarNativo(clp).saldo, 900);
    assert.equal(sumarNativo(usd).saldo, 90);
    const kpis = kpisFlujoNativos(filas);
    assert.equal(kpis.find((k) => k.moneda === 'CLP')?.saldo, 900);
    assert.equal(kpis.find((k) => k.moneda === 'USD')?.saldo, 90);
    assert.equal(kpis.find((k) => k.moneda === 'CLP')?.ingreso, 1000);
    assert.equal(kpis.find((k) => k.moneda === 'CLP')?.egreso, 100);
  });

  it('saldo corriendo nativo por banco+moneda; apertura antes que cartola el mismo día', () => {
    const rows = applySaldosNativos([
      {
        id: 'cartola:1', origen: 'CARTOLA', fecha: '2026-08-01', concepto: 'x',
        ingreso: 5, egreso: 0, saldo: 0, banco: 'A', moneda: 'USD', esApertura: false,
      },
      {
        id: 'apertura:1', origen: 'APERTURA', fecha: '2026-08-01', concepto: 'ap',
        ingreso: 10, egreso: 0, saldo: 0, banco: 'A', moneda: 'USD', esApertura: true,
      },
    ].sort((a, b) => (a.origen === 'APERTURA' ? -1 : 1) - (b.origen === 'APERTURA' ? -1 : 1) || a.id.localeCompare(b.id)));
    const ap = rows.find((r) => r.esApertura);
    const ca = rows.find((r) => !r.esApertura);
    assert.equal(ap?.saldo, 10);
    assert.equal(ca?.saldo, 15);
  });

  it('aperturas faltantes: banco de cartola sin esApertura', () => {
    const filas = buildFlujoCaja({
      aperturas: [
        { id: 'a1', fecha: '2026-08-01', concepto: 'Ap', ingreso: 1, banco: 'Estado', moneda: 'CLP', esApertura: true },
      ],
      cartolas: [{ id: 'c1', banco: 'Chile USD' }],
      movimientos: [{
        id: 'm1', cartolaId: 'c1', fecha: '2026-08-02', glosa: 'x', monto: 1,
        tipo: 'INGRESO', estadoContable: 'CONTABILIZADO',
      }],
    });
    const miss = aperturasFaltantes(filas);
    assert.deepEqual(miss, [{ banco: 'Chile USD', moneda: 'USD' }]);
  });
});

describe('agruparFlujoPorConcepto', () => {
  it('pone el concepto como título y Totales por moneda en la columna de código', () => {
    const vista = agruparFlujoPorConcepto([
      {
        id: '1', periodo: '2026-09', conceptoNombre: 'Exportación', conceptoOrden: 1,
        codigoFinancieroCodigo: 'EXP-CER', codigoFinancieroNombre: 'Cereza',
        ingreso: 120000, egreso: 0, saldo: 120000, moneda: 'USD',
      },
      {
        id: '2', periodo: '2026-09', conceptoNombre: 'Exportación', conceptoOrden: 1,
        codigoFinancieroCodigo: 'EXP-CER', codigoFinancieroNombre: 'Cereza',
        ingreso: 80_000_000, egreso: 0, saldo: 80_000_000, moneda: 'CLP',
      },
      {
        id: '3', periodo: '2026-09', conceptoNombre: 'Gastos', conceptoOrden: 2,
        codigoFinancieroCodigo: 'CF-12', codigoFinancieroNombre: 'Gastos varios',
        ingreso: 0, egreso: 1_200_000, saldo: -1_200_000, moneda: 'CLP',
      },
    ]);
    assert.deepEqual(vista.map((r) => [r.kind, r.conceptoNombre, r.codigo, r.moneda, r.saldo]), [
      ['titulo', 'Exportación', '', '', 0],
      ['linea', 'Exportación', 'EXP-CER · Cereza', 'CLP', 80_000_000],
      ['linea', 'Exportación', 'EXP-CER · Cereza', 'USD', 120000],
      ['totales', 'Exportación', 'Totales', 'CLP', 80_000_000],
      ['totales', 'Exportación', 'Totales', 'USD', 120000],
      ['titulo', 'Gastos', '', '', 0],
      ['linea', 'Gastos', 'CF-12 · Gastos varios', 'CLP', -1_200_000],
      ['totales', 'Gastos', 'Totales', 'CLP', -1_200_000],
    ]);
  });

  it('la apertura muestra el banco y no junta dos bancos de la misma moneda', () => {
    const filas = rollupFlujoExcel([
      {
        periodo: '2026-09', moneda: 'CLP', ingreso: 10, egreso: 0, esApertura: true,
        banco: 'Banco Chile', movimientoCajaId: 'a1', fecha: '2026-09-01',
      },
      {
        periodo: '2026-09', moneda: 'CLP', ingreso: 20, egreso: 0, esApertura: true,
        banco: 'Banco Estado', movimientoCajaId: 'a2', fecha: '2026-09-02',
      },
    ]);
    const vista = agruparFlujoPorConcepto(filas);
    const lineas = vista.filter((r) => r.kind === 'linea');
    assert.deepEqual(lineas.map((r) => [r.codigo, r.moneda, r.aperturaId, r.ingreso]), [
      ['Banco Chile', 'CLP', 'a1', 10],
      ['Banco Estado', 'CLP', 'a2', 20],
    ]);
  });
});
