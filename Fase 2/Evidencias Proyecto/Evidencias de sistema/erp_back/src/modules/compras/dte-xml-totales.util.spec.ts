import {
  extractTotalesFromDteXml,
  resolveMontoNetoRegistroCompra,
} from './dte-xml-totales.util';

describe('extractTotalesFromDteXml', () => {
  it('lee MntNeto y MntTotal estándar SII', () => {
    const xml = `
      <Encabezado><Totales>
        <MntNeto>100000</MntNeto>
        <IVA>19000</IVA>
        <MntTotal>119000</MntTotal>
      </Totales></Encabezado>`;
    expect(extractTotalesFromDteXml(xml)).toEqual({
      montoNeto: 100000,
      montoIva: 19000,
      montoTotal: 119000,
    });
  });

  it('lee montos en ExtraInfoTotal (GUF GoSocket)', () => {
    const xml = `
      <Totales>
        <ExtraInfoTotal name="MntNeto">250000</ExtraInfoTotal>
        <ExtraInfoTotal name="IVAProp">47500</ExtraInfoTotal>
        <ExtraInfoTotal name="MntTotal">297500</ExtraInfoTotal>
      </Totales>`;
    expect(extractTotalesFromDteXml(xml)).toEqual({
      montoNeto: 250000,
      montoIva: 47500,
      montoTotal: 297500,
    });
  });
});

describe('resolveMontoNetoRegistroCompra', () => {
  it('prioriza API neto, luego XML', () => {
    expect(resolveMontoNetoRegistroCompra(500, null, { montoNeto: 100, montoIva: null, montoTotal: 119 })).toBe(500);
    expect(resolveMontoNetoRegistroCompra(null, null, { montoNeto: 100, montoIva: null, montoTotal: 119 })).toBe(100);
    expect(resolveMontoNetoRegistroCompra(0, 0, { montoNeto: null, montoIva: null, montoTotal: 119000 })).toBe(119000);
  });
});
