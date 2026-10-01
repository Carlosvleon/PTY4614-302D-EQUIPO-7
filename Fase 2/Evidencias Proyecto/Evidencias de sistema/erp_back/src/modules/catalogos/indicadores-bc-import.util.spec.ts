import { parseIndicadoresBcRows, parseIndicadoresBcWorkbook } from './indicadores-bc-import.util';
import * as XLSX from 'xlsx';

describe('indicadores-bc-import.util', () => {
  it('parsea fecha + usd + cny; eur opcional; duplicado se omite', () => {
    const parsed = parseIndicadoresBcRows([
      ['Fecha', 'USD', 'Yuan', 'Euro'],
      ['2026-08-28', '945,5', '131.2', '1104'],
      ['29-08-2026', '946', '131.4', ''],
      ['2026-08-28', '999', '1', '1'],
    ]);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toEqual({
      fecha: '2026-08-28',
      usd: 945.5,
      cny: 131.2,
      eur: 1104,
    });
    expect(parsed.items[1].usd).toBe(946);
    expect(parsed.items[1].eur).toBeUndefined();
    expect(parsed.skippedInFile).toContain('2026-08-28');
  });

  it('0 o vacío no es TC; exige encabezado fecha', () => {
    expect(() => parseIndicadoresBcRows([['USD', 'CNY'], ['940', '130']])).toThrow(/Fecha/i);
    const parsed = parseIndicadoresBcRows([
      ['fecha', 'dolar', 'cny'],
      ['2026-09-01', '0', '132'],
    ]);
    expect(parsed.items[0].usd).toBeUndefined();
    expect(parsed.items[0].cny).toBe(132);
  });

  it('parsea CSV plantilla con punto y coma', () => {
    const csv = 'fecha;usd;cny;eur\n2026-08-28;945.5;131.2;1104\n';
    const parsed = parseIndicadoresBcWorkbook(XLSX, Buffer.from(csv, 'utf8'), 'plantilla.csv');
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({ fecha: '2026-08-28', usd: 945.5, cny: 131.2, eur: 1104 });
  });
});
