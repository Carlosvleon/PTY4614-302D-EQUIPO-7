import { esCodRefSii, esTipoDteReferencia, esTipoOrigenNcNd, referenciaManualCompleta } from './nc-nd-referencia.util';

describe('nc-nd-referencia.util', () => {
  it('acepta factura, NC, ND y guía como origen interno', () => {
    expect(esTipoOrigenNcNd('FACTURA')).toBe(true);
    expect(esTipoOrigenNcNd('ND')).toBe(true);
    expect(esTipoOrigenNcNd('GUIA')).toBe(true);
    expect(esTipoOrigenNcNd('ORDEN_VENTA')).toBe(false);
  });

  it('acepta TpoDocRef de venta nacional y export', () => {
    expect(esTipoDteReferencia('33')).toBe(true);
    expect(esTipoDteReferencia('52')).toBe(true);
    expect(esTipoDteReferencia('56')).toBe(true);
    expect(esTipoDteReferencia('801')).toBe(false);
  });

  it('exige ficha SII completa en registro manual', () => {
    expect(referenciaManualCompleta({
      referenciaTipo: '33',
      referenciaFolio: '66',
      referenciaFecha: '2026-09-07',
      referenciaCod: 3,
    })).toBe(true);
    expect(referenciaManualCompleta({
      referenciaTipo: '33',
      referenciaFolio: '66',
      referenciaFecha: '2026-09-07',
    })).toBe(false);
    expect(esCodRefSii(1)).toBe(true);
    expect(esCodRefSii(4)).toBe(false);
  });
});
