import { describe, expect, it } from 'vitest';
import {
  mensajeGruposCadenaFaltantes,
  modulosCadenaDesdePermisos,
} from './workflowAprobacion';

describe('modulosCadenaDesdePermisos', () => {
  it('Ventas write no exige grupo de cadena', () => {
    expect(modulosCadenaDesdePermisos(['comercial:write', 'comercial:read'])).toEqual([]);
  });

  it('Gerencia write exige solo Compras', () => {
    expect(modulosCadenaDesdePermisos([
      'compras:write',
      'comercial:write',
      'contratistas:write',
    ])).toEqual(['Compras']);
  });

  it('solo lectura no exige grupo', () => {
    expect(modulosCadenaDesdePermisos(['compras:read', 'comercial:read'])).toEqual([]);
  });

  it('admin * no exige grupo', () => {
    expect(modulosCadenaDesdePermisos(['*'])).toEqual([]);
  });

  it('mensaje si falta el grupo del módulo', () => {
    const msg = mensajeGruposCadenaFaltantes(
      ['compras:write'],
      new Set(),
      [{ id: 'G1', modulo: 'Compras' }],
    );
    expect(msg).toMatch(/Compras/);
  });
});
