import { parseCartolaCsv, parseCartolaPdfText } from './cartola-parser.util';

describe('parseCartolaCsv', () => {
  it('parsea CSV simple fecha;glosa;monto', () => {
    const text = [
      '2026-07-01;Abono cliente;150000',
      '2026-07-02;Pago proveedor;-80000',
    ].join('\n');
    const res = parseCartolaCsv(text);
    expect(res.lineas).toHaveLength(2);
    expect(res.lineas[0].tipo).toBe('INGRESO');
    expect(res.lineas[0].monto).toBe(150000);
    expect(res.lineas[1].tipo).toBe('EGRESO');
    expect(res.lineas[1].monto).toBe(80000);
  });

  it('detecta headers cargo/abono', () => {
    const text = [
      'Fecha;Descripcion;Cargo;Abono;Referencia',
      '15/07/2026;Transferencia;0;250000;TRX-1',
      '16/07/2026;Cheque;120000;0;CH-9',
    ].join('\n');
    const res = parseCartolaCsv(text);
    expect(res.formatoDetectado).toBe('csv-headers');
    expect(res.lineas).toHaveLength(2);
    expect(res.lineas[0].tipo).toBe('INGRESO');
    expect(res.lineas[0].referencia).toBe('TRX-1');
    expect(res.lineas[1].tipo).toBe('EGRESO');
    expect(res.lineas[1].monto).toBe(120000);
  });

  it('respeta columna tipo explícita aunque el monto sea positivo (TES-CART-TIPO)', () => {
    const text = [
      'fecha;glosa;monto;tipo',
      '2026-08-25;Pago proveedor QA;8000;EGRESO',
      '2026-08-25;Abono cliente QA;5000;INGRESO',
    ].join('\n');
    const res = parseCartolaCsv(text);
    expect(res.lineas).toHaveLength(2);
    expect(res.lineas[0].tipo).toBe('EGRESO');
    expect(res.lineas[0].monto).toBe(8000);
    expect(res.lineas[1].tipo).toBe('INGRESO');
    expect(res.lineas[1].monto).toBe(5000);
  });
});

describe('parseCartolaPdfText', () => {
  it('extrae filas fecha + glosa + monto', () => {
    const text = [
      'Cartola Banco Demo',
      '01/07/2026 Abono cliente Exportadora 150.000',
      '02/07/2026 Pago proveedor Agro -80.000',
      'Saldo final',
    ].join('\n');
    const res = parseCartolaPdfText(text);
    expect(res.formatoDetectado).toBe('pdf-text');
    expect(res.lineas.length).toBeGreaterThanOrEqual(2);
    expect(res.lineas[0].fecha).toBe('2026-07-01');
    expect(res.lineas[0].tipo).toBe('INGRESO');
    expect(res.lineas[1].tipo).toBe('EGRESO');
  });

  it('avisa si no hay texto útil', () => {
    const res = parseCartolaPdfText('   ');
    expect(res.lineas).toHaveLength(0);
    expect(res.avisos.some((a) => /texto/i.test(a))).toBe(true);
  });
});
