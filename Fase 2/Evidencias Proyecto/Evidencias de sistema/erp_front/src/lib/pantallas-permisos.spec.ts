import { describe, expect, it } from 'vitest';
import { codesFromMatrix, mergeConCatalogo, usuarioPuedeVerPantalla } from './pantallas-permisos';

describe('pantallas-permisos', () => {
  it('Ventas en la matriz emite comercial, no ventas', () => {
    expect(
      codesFromMatrix([
        { pantalla: 'Ventas · Órdenes de venta', lectura: true, escritura: true },
      ]),
    ).toEqual(['comercial:write', 'comercial:read']);
  });

  it('alias Emitir documento y Guías de despacho migran al catálogo nuevo', () => {
    const merged = mergeConCatalogo([
      { pantalla: 'Ventas · Emitir documento', lectura: true, escritura: true },
      { pantalla: 'Ventas · Guías de despacho', lectura: true, escritura: false },
    ]);
    const emitir = merged.find((p) => p.pantalla === 'Ventas · Emitir DTE');
    const guias = merged.find((p) => p.pantalla === 'Ventas · Libro de guías');
    expect(emitir).toEqual({ pantalla: 'Ventas · Emitir DTE', lectura: true, escritura: true });
    expect(guias).toEqual({ pantalla: 'Ventas · Libro de guías', lectura: true, escritura: false });
    expect(merged.some((p) => p.pantalla === 'Ventas · Emitir documento')).toBe(false);
  });

  it('usuarioPuedeVerPantalla acepta la clave vieja persistida', () => {
    const user = {
      permisos: ['comercial:read'],
      permisosPantalla: [
        { pantalla: 'Ventas · Emitir documento', lectura: true, escritura: false },
      ],
    };
    expect(usuarioPuedeVerPantalla(user, 'Ventas · Emitir DTE')).toBe(true);
    expect(usuarioPuedeVerPantalla(user, 'Ventas · Libro de ventas')).toBe(false);
  });

  it('con matriz restrictiva no abre Unidades si solo hay Monedas', () => {
    const user = {
      permisos: ['catalogos:read'],
      permisosPantalla: [
        { pantalla: 'Parametrización · Monedas', lectura: true, escritura: false },
      ],
    };
    expect(usuarioPuedeVerPantalla(user, 'Parametrización · Monedas')).toBe(true);
    expect(usuarioPuedeVerPantalla(user, 'Parametrización · Unidades de medida')).toBe(false);
  });
});
