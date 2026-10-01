import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { esErrorContablePostEmision, mensajeErrorEmisionDte } from './dte-emit-error.ts';

describe('mensajeErrorEmisionDte', () => {
  it('no atribuye al facturador un fallo de cuenta imputable', () => {
    const msg = mensajeErrorEmisionDte(
      new Error('Cuenta 1-1-02-01 no es imputable o está inactiva'),
      { quedoBorrador: true },
    );
    assert.match(msg, /No se pudo contabilizar/);
    assert.equal(/facturador rechazó/.test(msg), false);
    assert.match(msg, /1-1-02-01/);
  });

  it('no muestra Cannot POST de Express al operador', () => {
    const msg = mensajeErrorEmisionDte(
      new Error('Cannot POST /api/v1/documentos/x/dte/emit'),
      { quedoBorrador: true },
    );
    assert.match(msg, /factura se creó/);
    assert.equal(/Cannot POST/.test(msg), false);
  });

  it('no atribuye al facturador un saldo de NC interno', () => {
    const msg = mensajeErrorEmisionDte(
      new Error('La NC ($66045) supera el saldo pendiente de la factura FA-1 (saldo disponible: $2202)'),
    );
    assert.match(msg, /No se puede emitir esa nota de crédito/);
    assert.equal(/facturador rechazó/.test(msg), false);
    assert.match(msg, /saldo disponible/);
  });

  it('sigue mostrando rechazo del partner para errores de DTE', () => {
    const msg = mensajeErrorEmisionDte(new Error('Biller not found'));
    assert.match(msg, /facturador rechazó/);
    assert.match(msg, /Biller not found/);
  });

  it('detecta errores de periodo y asiento', () => {
    assert.equal(esErrorContablePostEmision('El periodo 2026-08 está cerrado'), true);
    assert.equal(esErrorContablePostEmision('Asiento descuadrado: debe=100 haber=90'), true);
    assert.equal(esErrorContablePostEmision('Biller not found'), false);
  });
});
