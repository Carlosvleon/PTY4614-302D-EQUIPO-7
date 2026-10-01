import { effectiveRolPermisos } from './permisos-from-pantallas.util';

describe('effectiveRolPermisos', () => {
  it('sin matriz usa el array del rol', () => {
    expect(effectiveRolPermisos(['comercial:write', 'insumos:read'], null)).toEqual([
      'comercial:write',
      'insumos:read',
    ]);
  });

  it('matriz con lecturas manda (Ventas → comercial)', () => {
    expect(
      effectiveRolPermisos(
        ['compras:read', 'compras:write', 'comercial:read'],
        [
          { pantalla: 'Parametrización · Monedas', lectura: true, escritura: false },
          { pantalla: 'Ventas · Órdenes de venta', lectura: true, escritura: true },
        ],
      ),
    ).toEqual(['catalogos:read', 'comercial:write', 'comercial:read']);
  });

  it('solo Monedas no deja compras ni comercial', () => {
    expect(
      effectiveRolPermisos(['comercial:write', 'compras:read'], [
        { pantalla: 'Parametrización · Monedas', lectura: true },
      ]),
    ).toEqual(['catalogos:read']);
  });
});
