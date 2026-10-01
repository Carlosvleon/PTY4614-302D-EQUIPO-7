import { avisoMaestrosFaltantes } from './plan-cuentas-import-aviso.util';

describe('avisoMaestrosFaltantes', () => {
  it('no avisa si hay maestros', () => {
    expect(avisoMaestrosFaltantes({ centrosCount: 1, elementosCount: 2, areasCount: 1 })).toBeNull();
  });

  it('avisa un solo maestro vacío (no bloquea)', () => {
    const msg = avisoMaestrosFaltantes({ centrosCount: 0, elementosCount: 3, areasCount: 1 });
    expect(msg).toMatch(/centros de costo/);
    expect(msg).toMatch(/¿Desea continuar\?/);
    expect(msg).not.toMatch(/elementos de costo/);
  });

  it('lista varios faltantes en un solo diálogo', () => {
    const msg = avisoMaestrosFaltantes({ centrosCount: 0, elementosCount: 0, areasCount: 0 });
    expect(msg).toMatch(/centros de costo/);
    expect(msg).toMatch(/elementos de costo/);
    expect(msg).toMatch(/áreas de negocio/);
  });
});
