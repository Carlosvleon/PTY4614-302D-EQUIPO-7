import { tryParseBankSpecific, detectBank } from './detect-bank';

describe('bank-specific parsers (fixtures)', () => {
  const fixture = (header: string) =>
    `${header}\n2026-07-01;TRX-1;Pago proveedor;150000;EGRESO\n2026-07-02;TRX-2;Abono cliente;80000;INGRESO`;

  it('detecta y parsea Banco de Chile', async () => {
    const text = fixture('BANCO DE CHILE CARTOLA');
    const bank = detectBank({ buffer: Buffer.from(text), filename: 'bchile.txt', textHint: text });
    expect(bank?.id).toBe('banco-chile');
    const parsed = await tryParseBankSpecific({
      buffer: Buffer.from(text),
      filename: 'cartola-bchile.txt',
      textHint: text,
    });
    expect(parsed?.result.lineas).toHaveLength(2);
    expect(parsed?.result.lineas[0].monto).toBe(150000);
    expect(parsed?.result.lineas[0].tipo).toBe('EGRESO');
    expect(parsed?.result.lineas[1].tipo).toBe('INGRESO');
  });

  it('detecta y parsea BancoEstado', async () => {
    const text = fixture('Cartola BancoEstado Julio');
    const parsed = await tryParseBankSpecific({
      buffer: Buffer.from(text),
      filename: 'estado.csv',
      textHint: text,
    });
    expect(parsed?.banco.id).toBe('banco-estado');
    expect(parsed?.result.lineas).toHaveLength(2);
  });

  it('detecta y parsea Santander', async () => {
    const text = fixture('Santander Chile movimientos');
    const parsed = await tryParseBankSpecific({
      buffer: Buffer.from(text),
      filename: 'santander-mov.txt',
      textHint: text,
    });
    expect(parsed?.banco.id).toBe('santander');
    expect(parsed?.result.formatoDetectado).toBe('santander');
    expect(parsed?.result.lineas[1].referencia).toBe('TRX-2');
  });
});
