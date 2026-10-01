import { extractOcReferenciasFromDteXml, parseStoredOcReferencias } from './dte-oc-referencias.util';

describe('extractOcReferenciasFromDteXml', () => {
  it('extrae NumeroRef cuando TpoDocRef es 801', () => {
    const xml = `
      <Referencia>
        <TpoDocRef>801</TpoDocRef>
        <NumeroRef>OC-2026-001</NumeroRef>
      </Referencia>
    `;
    expect(extractOcReferenciasFromDteXml(xml)).toEqual(['OC-2026-001']);
  });

  it('ignora referencias que no son OC (801)', () => {
    const xml = `
      <Referencia><TpoDocRef>33</TpoDocRef><NumeroRef>100</NumeroRef></Referencia>
      <Referencia><TpoDocRef>801</TpoDocRef><NumeroRef>363</NumeroRef></Referencia>
    `;
    expect(extractOcReferenciasFromDteXml(xml)).toEqual(['363']);
  });

  it('deduplica folios repetidos', () => {
    const xml = `
      <Referencia><TpoDocRef>801</TpoDocRef><NumeroRef>55</NumeroRef></Referencia>
      <Referencia><TpoDocRef>801</TpoDocRef><NumeroRef>55</NumeroRef></Referencia>
    `;
    expect(extractOcReferenciasFromDteXml(xml)).toEqual(['55']);
  });
});

describe('parseStoredOcReferencias', () => {
  it('normaliza array JSON', () => {
    expect(parseStoredOcReferencias([' a ', '', 'b'])).toEqual(['a', 'b']);
  });
});
