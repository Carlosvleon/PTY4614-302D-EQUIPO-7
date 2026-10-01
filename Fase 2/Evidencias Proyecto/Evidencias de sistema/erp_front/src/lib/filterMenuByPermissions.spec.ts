import { describe, expect, it } from 'vitest';
import { filterMenuByPermissions, type MenuPermissionItem } from './filterMenuByPermissions';
import type { SessionUser } from '@/types/domain';

function user(permisos: string[], extra?: Partial<SessionUser>): SessionUser {
  return {
    id: 'U-V',
    nombre: 'Valentina',
    email: 'v@x.cl',
    rol: 'Ventas',
    rolId: 'ROL-V',
    empresa: 'Export',
    empresaId: 'EMP-EXPORT',
    permisos,
    ...extra,
  };
}

const MENU: MenuPermissionItem[] = [
  { to: '/', label: 'Panel' } as MenuPermissionItem,
  {
    label: 'Ventas',
    anyOf: ['comercial:read', 'admin:read'],
    children: [
      { to: '/comercial/libro', label: 'Libro' } as MenuPermissionItem,
    ],
  },
  {
    label: 'Compras',
    anyOf: ['compras:read', 'admin:read'],
    children: [
      { to: '/compras/ordenes', label: 'OC' } as MenuPermissionItem,
      { to: '/compras/aprobaciones', label: 'Aprobaciones', bandejaModulo: 'Compras' } as MenuPermissionItem,
    ],
  },
  {
    label: 'Contratistas',
    anyOf: ['contratistas:read', 'admin:read'],
    children: [
      { to: '/contratistas', label: 'Listado' } as MenuPermissionItem,
    ],
  },
];

describe('filterMenuByPermissions', () => {
  it('oculta Compras y Contratistas si el rol solo tiene comercial:read', () => {
    const visible = filterMenuByPermissions(MENU, user(['comercial:read']));
    expect(visible.map((i) => i.label ?? i.to)).toEqual(['Panel', 'Ventas']);
  });

  it('muestra Compras si hay compras:read', () => {
    const visible = filterMenuByPermissions(MENU, user(['compras:read']));
    expect(visible.some((i) => i.label === 'Compras')).toBe(true);
    expect(visible.some((i) => i.label === 'Ventas')).toBe(false);
  });

  it('deja la bandeja de Compras si está designado aunque no tenga compras:read', () => {
    const visible = filterMenuByPermissions(
      MENU,
      user(['comercial:read'], { bandejaModulos: ['Compras'] }),
    );
    const compras = visible.find((i) => i.label === 'Compras');
    expect(compras?.children?.map((c) => c.to)).toEqual(['/compras/aprobaciones']);
  });

  it('con matriz restrictiva no muestra todo Parametrización por catalogos:read', () => {
    const menu: MenuPermissionItem[] = [
      {
        label: 'Parametrización',
        anyOf: ['catalogos:read', 'admin:read'],
        children: [
          { to: '/catalogos/monedas', label: 'Monedas' },
          { to: '/catalogos/unidades', label: 'Unidades de medida' },
        ],
      },
    ];
    const visible = filterMenuByPermissions(
      menu,
      user(['catalogos:read'], {
        permisosPantalla: [
          { pantalla: 'Parametrización · Monedas', lectura: true, escritura: false },
        ],
      }),
    );
    expect(visible[0]?.children?.map((c) => c.label)).toEqual(['Monedas']);
  });

  it('mantiene grupos anidados de Ventas y respeta alias de Emitir DTE', () => {
    const menu: MenuPermissionItem[] = [
      {
        label: 'Ventas',
        anyOf: ['comercial:read', 'admin:read'],
        children: [
          {
            label: 'Operación',
            children: [
              { to: '/comercial/ordenes-venta', label: 'Órdenes de venta' },
              { to: '/comercial/emitir', label: 'Emitir DTE' },
            ],
          },
          {
            label: 'Libros',
            children: [
              { to: '/comercial/libro', label: 'Libro de ventas' },
              { to: '/comercial/guias-despacho', label: 'Libro de guías' },
            ],
          },
        ],
      },
    ];
    const visible = filterMenuByPermissions(
      menu,
      user(['comercial:read'], {
        permisosPantalla: [
          { pantalla: 'Ventas · Emitir documento', lectura: true, escritura: false },
          { pantalla: 'Ventas · Órdenes de venta', lectura: true, escritura: false },
        ],
      }),
    );
    const ventas = visible.find((i) => i.label === 'Ventas');
    expect(ventas?.children?.map((c) => c.label)).toEqual(['Operación']);
    expect(ventas?.children?.[0]?.children?.map((c) => c.label)).toEqual([
      'Órdenes de venta',
      'Emitir DTE',
    ]);
  });
});
