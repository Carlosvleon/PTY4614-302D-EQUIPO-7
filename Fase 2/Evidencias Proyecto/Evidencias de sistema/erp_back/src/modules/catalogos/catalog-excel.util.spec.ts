import * as XLSX from 'xlsx';
import {
  parseCodigoNombreRows,
  parseCodigoNombreWorkbook,
  parseActiva,
  parseVigenciaElemento,
} from './catalog-excel.util';

describe('catalog-excel.util', () => {
  it('lee código y nombre con encabezado desplazado', () => {
    const rows = [
      ['Reporte'],
      [],
      ['Código', 'Descripción', 'Departamento'],
      ['1001', 'Servicios', 'GENERAL'],
      ['1002', 'Repuestos', 'TALLER'],
    ];
    const { items } = parseCodigoNombreRows(rows);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ codigo: '1001', nombre: 'Servicios' });
    expect(items[0].extra.departamento).toBe('GENERAL');
  });

  it('ignora duplicados de código en el archivo y los reporta', () => {
    const rows = [
      ['CODIGO', 'NOMBRE'],
      ['ADM', 'Admin'],
      ['ADM', 'Admin 2'],
    ];
    const parsed = parseCodigoNombreRows(rows);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.skippedInFile).toEqual(['ADM']);
  });

  it('parsea vigencia y activa sin inventar valor si viene vacío', () => {
    expect(parseVigenciaElemento('anulado')).toBe('ANULADO');
    expect(parseVigenciaElemento('')).toBeUndefined();
    expect(parseActiva('NO')).toBe(false);
    expect(parseActiva('')).toBeUndefined();
  });

  it('reconoce CODIGO ELEMENTO + DESCRIPCION del reporte MJ', () => {
    const { items, ignoredHeaders } = parseCodigoNombreRows([
      ['ALM SERVICES SPA'],
      ['CODIGO ELEMENTO', 'DESCRIPCION'],
      ['1001      ', 'SERVICIOS DE REPARACIÓN ACTIVOS'],
      ['1002      ', 'REPARACIÓN VEHICULOS/MAQUINARIA'],
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ codigo: '1001', nombre: 'SERVICIOS DE REPARACIÓN ACTIVOS' });
    expect(ignoredHeaders).toEqual([]);
  });

  it('usa CODIGO + CENTRO COSTO del reporte MJ, no la descripción de especie', () => {
    const parsed = parseCodigoNombreRows([
      ['REPORTE'],
      [
        'CODIGO',
        'CENTRO COSTO',
        'CODEMPRESA',
        'NOMFUNDO',
        'ESPECIE',
        'DESCRIPCION',
        'VIGENCIA',
      ],
      ['10100', 'DAGGEN ALM', '1', 'ALM SERVICES', '10', 'DAGGEN', 'S'],
      ['10200', 'NECTARIN ALM', '1', 'ALM SERVICES', '2', 'NECTARIN', 'S'],
    ]);
    expect(parsed.items[0]).toMatchObject({ codigo: '10100', nombre: 'DAGGEN ALM' });
    expect(parsed.items[0].extra.vigencia).toBe('S');
    expect(parsed.ignoredHeaders).toEqual(expect.arrayContaining(['CODEMPRESA', 'ESPECIE', 'DESCRIPCION']));
    expect(parsed.ignoredHeaders).not.toContain('CENTRO COSTO');
    expect(parsed.ignoredHeaders).not.toContain('CODIGO');
  });

  it('reconoce encabezados tipo reporte y lista columnas no mapeadas', () => {
    const parsed = parseCodigoNombreRows([
      ['Cod Empresa', 'Centro de costo', 'Nombre centro', 'Tipo'],
      ['76', 'ADM', 'Administración', 'ADM'],
    ]);
    expect(parsed.items[0]).toMatchObject({ codigo: 'ADM', nombre: 'Administración' });
    expect(parsed.ignoredHeaders).toEqual(expect.arrayContaining(['Cod Empresa', 'Tipo']));
  });

  it('lee las columnas del Excel de maestros de Mario', () => {
    expect(
      parseCodigoNombreRows([
        ['ccos', 'nomCcos'],
        ['10100', 'DAGGEN ALM'],
      ]).items[0],
    ).toMatchObject({ codigo: '10100', nombre: 'DAGGEN ALM' });
    expect(
      parseCodigoNombreRows([
        ['codElementoCosto', 'nomElementoCosto'],
        ['1001', 'SERVICIOS DE REPARACIÓN ACTIVOS'],
      ]).items[0],
    ).toMatchObject({ codigo: '1001', nombre: 'SERVICIOS DE REPARACIÓN ACTIVOS' });
    expect(
      parseCodigoNombreRows([
        ['codFinanciero', 'nomFinanciero'],
        ['1002', 'VENTA EXPORTACIÓN CEREZAS'],
      ]).items[0],
    ).toMatchObject({ codigo: '1002', nombre: 'VENTA EXPORTACIÓN CEREZAS' });
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
        ['codElementoCosto', 'nomElementoCosto'],
        ['1001', 'SERVICIOS'],
      ]),
      'Elementos de costo',
    );
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    expect(() => parseCodigoNombreWorkbook(XLSX, buffer, /centrosdecosto/i, 'Centros de costo')).toThrow(
      /tiene \d+ hojas/,
    );
  });

  it('lee la plantilla SpreadsheetML que descarga el mantenedor', () => {
    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Centros de costo">
  <Table>
   <Row><Cell><Data ss:Type="String">Plantilla de una sola hoja</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Código</Data></Cell><Cell><Data ss:Type="String">Nombre</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">10100</Data></Cell><Cell><Data ss:Type="String">DAGGEN ALM</Data></Cell></Row>
  </Table>
 </Worksheet>
</Workbook>`;
    const parsed = parseCodigoNombreWorkbook(
      XLSX,
      Buffer.from(xml, 'utf8'),
      /centrosdecosto/i,
      'Centros de costo',
    );
    expect(parsed.items[0]).toMatchObject({ codigo: '10100', nombre: 'DAGGEN ALM' });
  });

  it('acepta la plantilla de una sola hoja con el nombre del mantenedor', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Código', 'Nombre'],
        ['10100', 'DAGGEN ALM'],
      ]),
      'Centros de costo',
    );
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    expect(parseCodigoNombreWorkbook(XLSX, buffer, /centrosdecosto/i, 'Centros de costo').items[0].codigo).toBe(
      '10100',
    );
  });

  it('rechaza una hoja de otro mantenedor', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Código', 'Nombre'],
        ['1001', 'SERVICIOS'],
      ]),
      'Elementos de costo',
    );
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    expect(() =>
      parseCodigoNombreWorkbook(XLSX, buffer, /centrosdecosto/i, 'Centros de costo'),
    ).toThrow(/no corresponde/);
  });
});
