import * as XLSX from 'xlsx';
import {
  parsePlanDeCuentasRows,
  parsePlanDeCuentasWorkbook,
  excelToUiCodigo,
} from './plan-cuentas-excel.util';

describe('plan-cuentas-excel.util', () => {
  const header = [
    'CUENTACONTABLE',
    'DESCRIPCION',
    'NIVEL',
    'CC',
    'A.NEG',
    'ESPECIE',
    'EC',
    'CODEMPRESA',
  ];

  it('mapea código 9 dígitos y padre por nivel', () => {
    const { items } = parsePlanDeCuentasRows([
      header,
      ['110000000', 'ACTIVO', 1, 'N', '', '', '', '1'],
      ['110100000', 'Disponible', 2, 'N', '', '', '', '1'],
      ['110101000', 'Caja', 4, 'S', '', '', 'S', '1'],
    ]);
    expect(items[0]).toMatchObject({
      codigo: '1-1-00-00',
      padreCodigo: null,
      nivel: 1,
      requiereCc: false,
    });
    expect(items.find((i) => i.codigo === '1-1-01-01')).toMatchObject({
      padreCodigo: '1-1-01-00',
      requiereCc: true,
      requiereElemento: true,
    });
  });

  it('deja flags undefined si la celda viene vacía (no inventa N)', () => {
    const { items } = parsePlanDeCuentasRows([
      header,
      ['410101000', 'Ventas', 4, '', '', '', '', '1'],
    ]);
    expect(items[0].requiereCc).toBeUndefined();
    expect(items[0].requiereArea).toBeUndefined();
  });

  it('arrastra flags vacíos desde la fila anterior si aplicarArrastre', () => {
    const rows = [
      header,
      ['410000000', 'INGRESOS', 1, 'S', 'N', '', 'S', '1'],
      ['410101000', 'Ventas', 4, '', '', '', '', '1'],
    ];
    const without = parsePlanDeCuentasRows(rows);
    expect(without.items.find((i) => i.nivel === 4)?.requiereCc).toBeUndefined();

    const withFill = parsePlanDeCuentasRows(rows, { aplicarArrastre: true });
    const hoja = withFill.items.find((i) => i.nivel === 4);
    expect(hoja?.requiereCc).toBe(true);
    expect(hoja?.requiereArea).toBe(false);
    expect(hoja?.requiereElemento).toBe(true);
  });

  it('lee listas de códigos de dimensión si el Excel las trae', () => {
    const { items, hasDimensionCodes, ignoredHeaders } = parsePlanDeCuentasRows([
      ['CUENTACONTABLE', 'DESCRIPCION', 'NIVEL', 'CC', 'CENTRO COSTO'],
      ['410101000', 'Ventas', 4, 'S', '10100, 10200'],
    ]);
    expect(hasDimensionCodes).toBe(true);
    expect(items[0].centroCostoCodigos).toEqual(['10100', '10200']);
    expect(ignoredHeaders).toEqual([]);
    expect(excelToUiCodigo('410101000', 4)).toBe('4-1-01-01');
  });

  it('lista encabezados Agrosoft que no se importan', () => {
    const { ignoredHeaders } = parsePlanDeCuentasRows([
      ['CUENTACONTABLE', 'DESCRIPCION', 'CODEMPRESA', 'USUARIO'],
      ['110000000', 'ACTIVO', '1', 'MJ'],
    ]);
    expect(ignoredHeaders).toEqual(expect.arrayContaining(['CODEMPRESA', 'USUARIO']));
  });

  it('lee ctaContable y nomCtaContable como cuenta hoja, sin inventar el padre', () => {
    const { items } = parsePlanDeCuentasRows([
      ['ctaContable', 'nomCtaContable'],
      ['110101001', 'CAJA'],
    ]);
    expect(items[0]).toMatchObject({
      codigo: '1-1-01-01-001',
      codigoExcel: '110101001',
      nombre: 'CAJA',
      nivel: 5,
      padreCodigo: null,
    });
  });

  it('rechaza el libro de varias hojas', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['ccos', 'nomCcos'],
        ['10100', 'DAGGEN ALM'],
      ]),
      'Centros de costo',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['ctaContable', 'nomCtaContable'],
        ['110101001', 'CAJA'],
      ]),
      'Cuentas contables',
    );
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    expect(() => parsePlanDeCuentasWorkbook(XLSX, buffer)).toThrow(/tiene \d+ hojas/);
  });

  it('acepta la plantilla de una sola hoja Cuentas contables', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Código', 'Nombre', 'Nivel'],
        ['110101001', 'CAJA', 5],
      ]),
      'Cuentas contables',
    );
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const parsed = parsePlanDeCuentasWorkbook(XLSX, buffer);
    expect(parsed.items[0].codigo).toBe('1-1-01-01-001');
  });

  it('lee la hoja PlanDeCuenta con el grupo padre y la cuenta hoja', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Las primeras filas son un ejemplo'],
        [
          'CUENTACONTABLE', 'DESCRIPCION', 'NIVEL', 'PLANTA', 'CC', 'A.NEG', 'ESPECIE',
          'VARIEDAD', 'EC', 'AUXI', 'DES', 'REF', 'FECHA.VEN', 'CODFINAN',
        ],
        ['100000000', 'ACTIVO', 1, 'N', 'N', 'N', 'N', 'N', '0', 'N', 'N', 'N', '', ''],
        ['110101000', 'CAJA', 4, 'N', 'N', 'N', 'N', 'N', '0', 'N', 'N', 'N', '', ''],
        ['110101001', 'CAJA', 5, 'N', 'N', 'N', 'N', 'N', 'N', '0', 'N', 'N', 'N', ''],
      ]),
      'PlanDeCuenta',
    );
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const parsed = parsePlanDeCuentasWorkbook(XLSX, buffer);
    const hoja = parsed.items.find((it) => it.codigoExcel === '110101001');
    const grupo = parsed.items.find((it) => it.codigoExcel === '100000000');
    expect(grupo).toMatchObject({ codigo: '1-0-00-00', padreCodigo: null, noImputable: true });
    expect(hoja).toMatchObject({
      codigo: '1-1-01-01-001',
      padreCodigo: '1-1-01-01',
      noImputable: false,
    });
  });
});
