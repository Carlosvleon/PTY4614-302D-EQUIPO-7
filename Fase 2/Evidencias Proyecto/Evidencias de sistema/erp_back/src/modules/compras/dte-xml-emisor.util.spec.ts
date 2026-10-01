import {
  extractEmisorFromDteXml,
  isProveedorFacturaPlaceholder,
} from './dte-xml-emisor.util';

describe('extractEmisorFromDteXml', () => {
  it('lee RUT y razón social del bloque Emisor', () => {
    const xml = `
      <Encabezado>
        <Emisor>
          <RUTEmisor>76111222-3</RUTEmisor>
          <RznSoc>Comercial Demo SpA</RznSoc>
        </Emisor>
      </Encabezado>
    `;
    expect(extractEmisorFromDteXml(xml)).toEqual({
      rut: '76111222-3',
      razonSocial: 'Comercial Demo SpA',
    });
  });

  it('ignora valores placeholder del SII', () => {
    const xml = '<Emisor><RUTEmisor>.</RUTEmisor><RznSoc>.</RznSoc></Emisor>';
    expect(extractEmisorFromDteXml(xml)).toEqual({ rut: null, razonSocial: null });
  });
});

describe('isProveedorFacturaPlaceholder', () => {
  it('detecta placeholder GoSocket', () => {
    expect(isProveedorFacturaPlaceholder('Proveedor GoSocket')).toBe(true);
    expect(isProveedorFacturaPlaceholder('Real SpA')).toBe(false);
  });
});
