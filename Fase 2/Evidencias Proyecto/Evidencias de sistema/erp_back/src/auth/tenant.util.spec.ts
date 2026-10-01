import { sessionEmpresaIds } from './tenant.util';

describe('sessionEmpresaIds', () => {
  it('da al superadmin todas las empresas del catálogo aunque no esté en usuarioEmpresa', () => {
    expect(
      sessionEmpresaIds({
        rolId: 'ROL-1',
        permisos: ['*'],
        empresaId: 'EMP-BOOT',
        accesoIds: ['EMP-BOOT'],
        catalogoIds: ['EMP-BOOT', 'EMP-EXPORT', 'EMP-SERVICES'],
      }),
    ).toEqual(['EMP-BOOT', 'EMP-EXPORT', 'EMP-SERVICES']);
  });

  it('acota operadores a membresía', () => {
    expect(
      sessionEmpresaIds({
        rolId: 'ROL-VENTAS',
        permisos: ['comercial:read'],
        empresaId: 'EMP-EXPORT',
        accesoIds: ['EMP-EXPORT'],
        catalogoIds: ['EMP-BOOT', 'EMP-EXPORT', 'EMP-SERVICES'],
      }),
    ).toEqual(['EMP-EXPORT']);
  });
});
