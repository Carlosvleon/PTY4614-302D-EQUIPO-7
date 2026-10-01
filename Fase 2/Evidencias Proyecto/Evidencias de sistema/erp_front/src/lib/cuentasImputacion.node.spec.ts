import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CuentaContable } from '../types/domain.ts';
import { labelCuentaImputacion } from './cuentasImputacion.ts';

function cuenta(partial: Partial<CuentaContable> & Pick<CuentaContable, 'id' | 'codigo' | 'nombre' | 'tipo'>): CuentaContable {
  return { activa: true, ...partial };
}

describe('labelCuentaImputacion', () => {
  it('marca Ingreso y Gasto en el selector', () => {
    assert.equal(
      labelCuentaImputacion(cuenta({
        id: '1',
        codigo: '5-1-01-01-001',
        nombre: 'INGRESO POR VENTA PRODUCTO TERMINADO NACIONAL',
        tipo: 'INGRESO',
      })),
      '5-1-01-01-001 · Ingreso · INGRESO POR VENTA PRODUCTO TERMINADO NACIONAL',
    );
    assert.equal(
      labelCuentaImputacion(cuenta({
        id: '2',
        codigo: '6-1-01-04-038',
        nombre: 'COMISIONES',
        tipo: 'GASTO',
      })),
      '6-1-01-04-038 · Gasto · COMISIONES',
    );
  });
});
