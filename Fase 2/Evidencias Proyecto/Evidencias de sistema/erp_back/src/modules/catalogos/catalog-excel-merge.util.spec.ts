import { clasificarFilaImport } from './catalog-excel-merge.util';

describe('catalog-excel-merge.util', () => {
  type Row = {
    codigo: string;
    nombre: string;
    departamento?: string;
    vigencia?: string;
  };
  const fields: { key: keyof Row; label: string }[] = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'departamento', label: 'Depto' },
    { key: 'vigencia', label: 'Vigencia' },
  ];

  it('marca NUEVO si el código no existe', () => {
    const r = clasificarFilaImport(
      { codigo: '1001', nombre: 'Servicios', departamento: 'GENERAL' },
      undefined,
      fields,
    );
    expect(r.accion).toBe('NUEVO');
  });

  it('no pisa con campos no informados', () => {
    const r = clasificarFilaImport(
      { codigo: '1001', nombre: 'Servicios', departamento: undefined, vigencia: undefined },
      { codigo: '1001', nombre: 'Servicios', departamento: 'TALLER', vigencia: 'ANULADO' },
      fields,
    );
    expect(r.accion).toBe('SIN_CAMBIOS');
    expect(r.cambios).toEqual([]);
  });

  it('lista solo campos que cambian', () => {
    const r = clasificarFilaImport(
      { codigo: '1001', nombre: 'Servicios 2', departamento: 'TALLER' },
      { codigo: '1001', nombre: 'Servicios', departamento: 'TALLER', vigencia: 'VIGENTE' },
      fields,
    );
    expect(r.accion).toBe('ACTUALIZA');
    expect(r.cambios).toEqual(['Nombre: Servicios → Servicios 2']);
  });
});
