import type { CanonicalDocumentV1 } from '../../common/types';
import { buildGufXml } from './guf-mapper';

function sampleComex(
  overrides: NonNullable<CanonicalDocumentV1['documento']['comex']> = {},
): NonNullable<CanonicalDocumentV1['documento']['comex']> {
  return {
    tipoCambio: 950.5,
    montoOtraMoneda: 80,
    montoExentoOtraMoneda: 80,
    bultoCantidad: 12,
    bultoTipoCodigo: 'CAJA',
    bultoMarca: '-',
    paisDestino: '225',
    puertoEmbarque: 'CLVAP',
    puertoDesembarque: 'USLAX',
    clausulaVenta: 'FOB',
    viaTransporte: 'MARITIMA',
    modalidadVenta: 'CONSIGNACION_LIBRE',
    tpoMoneda: '13',
    codPaisRecep: '225',
    ...overrides,
  };
}

function sampleDoc(overrides: Partial<CanonicalDocumentV1> = {}): CanonicalDocumentV1 {
  return {
    schemaVersion: '1.0',
    idempotencyKey: 'erp-test:EMP-1:doc-guf:1',
    source: { erpId: 'erp-test', empresaId: 'EMP-1', documentoId: 'doc-guf' },
    emisor: {
      rut: '76.000.000-0',
      razonSocial: 'Emisor de prueba SpA',
      giro: 'Comercio',
      direccion: 'Calle Falsa 123',
      comuna: 'Santiago',
      ciudad: 'Santiago',
      nroResolucion: '80',
      fechaResolucion: '2024-01-01',
      acteco: '461001',
    },
    receptor: {
      rut: '55.555.555-5',
      razonSocial: 'Receptor de prueba',
      giro: 'Comercio',
      direccion: 'Av. Prueba 456',
      comuna: 'Santiago',
      ciudad: 'Santiago',
    },
    documento: {
      tipoDte: 33,
      fechaEmision: '2026-08-19',
      numeroInterno: 'FAC-1234',
    },
    totales: { neto: 1000, iva: 190, tasaIva: 19, total: 1190 },
    lineas: [
      {
        nro: 1,
        descripcion: 'Cereza & <premium> "QA"',
        cantidad: 2,
        unidad: 'KG',
        precio: 500,
        montoNeto: 1000,
      },
    ],
    ...overrides,
  };
}

describe('GoSocket GUF mapper', () => {
  it('genera XML mínimo para DTE 33 con RUT normalizado y descripción escapada', () => {
    const xml = buildGufXml(sampleDoc());

    expect(xml).toContain('<Tipo>33</Tipo>');
    expect(xml).toContain('<IDEmisor>76000000-0</IDEmisor>');
    expect(xml).toContain('<RUTEmisor>76000000-0</RUTEmisor>');
    expect(xml).toContain('<Acteco>461001</Acteco>');
    expect(xml).toContain("name='Acteco'>461001");
    expect(xml.indexOf('<Acteco>')).toBeLessThan(xml.indexOf('<DomFiscal>'));
    expect(xml).toContain('<IDReceptor>55555555-5</IDReceptor>');
    expect(xml).toContain('<RUTRecep>55555555-5</RUTRecep>');
    expect(xml).toContain('<NroDocRecep>55555555-5</NroDocRecep>');
    expect(xml.indexOf('<RUTRecep>')).toBeLessThan(xml.indexOf('<NmbRecep>'));
    expect(xml).toContain('<MntTotal>1190</MntTotal>');
    expect(xml).toContain('<MntNeto>1000</MntNeto>');
    expect(xml).toContain('<IVA>190</IVA>');
    expect(xml).toContain('<MntImp>190</MntImp>');
    expect(xml).toContain("name='IVA'>190");
    expect(xml).toContain('<DirRecep>Av. Prueba 456</DirRecep>');
    expect(xml).toContain('<CmnaRecep>Santiago</CmnaRecep>');
    expect(xml).toContain('<NmbItem>Cereza &amp; &lt;premium&gt; &quot;QA&quot;</NmbItem>');
    expect(xml).toContain('<DscComercial>Cereza &amp; &lt;premium&gt; &quot;QA&quot;</DscComercial>');
    expect(xml).not.toContain('<DscItem>');
    expect(xml).toContain('<MontoItem>1000</MontoItem>');
    expect(xml).toContain('<MontoTotalItem>1000</MontoTotalItem>');
    expect(xml).toContain('<NumeroInterno>FAC-1234</NumeroInterno>');
    expect(xml).toContain('<NroResolucion>80</NroResolucion>');
    expect(xml).toContain('<FechaResolucion>2024-01-01</FechaResolucion>');
    expect(xml).not.toMatch(/<Numero>/);
    expect(xml).not.toContain('cuentaContableId');
    expect(xml).not.toContain('centroCostoId');
  });

  it('trunca GiroRecep a 40 (XSD SII) y deja GiroEmis hasta 80', () => {
    const giroAlm = 'Servicios logisticos, transporte y soporte operacional';
    const giroExport = 'Exportacion de fruta fresca y servicios de packing';
    expect(giroAlm.length).toBeGreaterThan(40);
    expect(giroExport.length).toBeGreaterThan(40);
    expect(giroExport.length).toBeLessThanOrEqual(80);

    const xml = buildGufXml(
      sampleDoc({
        emisor: {
          rut: '77.032.638-9',
          razonSocial: 'ALMAHUE EXPORT SPA',
          giro: giroExport,
          direccion: 'Camino Fundo El Maiten 1200',
          comuna: 'San Fernando',
          ciudad: 'San Fernando',
          nroResolucion: '0',
          fechaResolucion: '2024-10-11',
          acteco: '461001',
        },
        receptor: {
          rut: '77.032.639-7',
          razonSocial: 'ALM SERVICES SPA',
          giro: giroAlm,
          direccion: 'Av. Logistica 845, Modulo B',
          comuna: 'Renca',
          ciudad: 'Santiago',
        },
      }),
    );

    expect(xml).toContain(`<GiroEmis>${giroExport}</GiroEmis>`);
    expect(xml).toContain(`<GiroRecep>${giroAlm.slice(0, 40)}</GiroRecep>`);
    expect(xml).not.toContain(`<GiroRecep>${giroAlm}</GiroRecep>`);
  });

  it('trunca CiudadRecep/CmnaRecep a 20 (XSD CiudadType) y NmbItem a 80', () => {
    const ciudadRegion = "Región del Libertador General Bernardo O'Higgins";
    expect(ciudadRegion.length).toBeGreaterThan(20);
    const nmbLargo = `${'Servicio logistico de packing y soporte operacional '.repeat(2)}X`;
    expect(nmbLargo.length).toBeGreaterThan(80);

    const xml = buildGufXml(
      sampleDoc({
        receptor: {
          rut: '77.032.639-7',
          razonSocial: 'ALM SERVICES SPA',
          giro: 'Agro',
          direccion: 'Av. Prueba 456',
          comuna: ciudadRegion,
          ciudad: ciudadRegion,
        },
        lineas: [
          {
            nro: 1,
            descripcion: nmbLargo,
            cantidad: 1,
            unidad: 'CAJA',
            precio: 1000,
            montoNeto: 1000,
          },
        ],
      }),
    );

    const ciudad20 = ciudadRegion.slice(0, 20);
    expect(xml).toContain(`<CiudadRecep>${ciudad20}</CiudadRecep>`);
    expect(xml).not.toContain(`<CiudadRecep>${ciudadRegion}</CiudadRecep>`);
    expect(xml).toContain(`<CmnaRecep>${ciudad20}</CmnaRecep>`);
    expect(xml).toContain(`<NmbItem>${nmbLargo.slice(0, 80)}</NmbItem>`);
    expect(xml).toContain(`<DscComercial>${nmbLargo.slice(0, 80)}</DscComercial>`);
    expect(xml).not.toContain('<DscItem>');
  });

  it('DscItem solo con detalle extra; DscComercial siempre lleva el nombre (IT1)', () => {
    const conDetalle = buildGufXml(
      sampleDoc({
        lineas: [{
          nro: 1,
          descripcion: 'Cereza premium',
          detalle: 'Caja 5 kg, calibre 28, origen San Fernando',
          cantidad: 1,
          unidad: 'CAJA',
          precio: 1000,
          montoNeto: 1000,
        }],
      }),
    );
    expect(conDetalle).toContain('<NmbItem>Cereza premium</NmbItem>');
    expect(conDetalle).toContain('<DscItem>Caja 5 kg, calibre 28, origen San Fernando</DscItem>');
    expect(conDetalle).toContain('<DscComercial>Cereza premium</DscComercial>');

    const sinDetalle = buildGufXml(
      sampleDoc({
        lineas: [{
          nro: 1,
          descripcion: 'Cereza premium',
          detalle: '   ',
          cantidad: 1,
          unidad: 'CAJA',
          precio: 1000,
          montoNeto: 1000,
        }],
      }),
    );
    expect(sinDetalle).toContain('<NmbItem>Cereza premium</NmbItem>');
    expect(sinDetalle).toContain('<DscComercial>Cereza premium</DscComercial>');
    expect(sinDetalle).not.toContain('<DscItem>');

    const duplicado = buildGufXml(
      sampleDoc({
        lineas: [{
          nro: 1,
          descripcion: 'Cereza premium',
          detalle: 'Cereza premium',
          cantidad: 1,
          unidad: 'CAJA',
          precio: 1000,
          montoNeto: 1000,
        }],
      }),
    );
    expect(duplicado).toContain('<DscComercial>Cereza premium</DscComercial>');
    expect(duplicado).not.toContain('<DscItem>');
  });

  it('rechaza ítem sin NmbItem (IT1 vacío gasta CAF)', () => {
    expect(() =>
      buildGufXml(
        sampleDoc({
          lineas: [{
            nro: 1,
            descripcion: '   ',
            cantidad: 1,
            unidad: 'CAJA',
            precio: 1000,
            montoNeto: 1000,
          }],
        }),
      ),
    ).toThrow(/Falta nombre del ítem/);
  });

  it('exige CAE desde el canónico: no inventa resolución del gateway', () => {
    expect(() =>
      buildGufXml(
        sampleDoc({
          emisor: {
            rut: '76.000.000-0',
            razonSocial: 'Emisor de prueba SpA',
            direccion: 'Calle Falsa 123',
          },
        }),
      ),
    ).toThrow(/canónico no trae/);
  });

  it('usa nro y fecha de resolución que vienen en el emisor', () => {
    const xml = buildGufXml(
      sampleDoc({
        emisor: {
          rut: '11.111.111-1',
          razonSocial: 'Otra sociedad',
          direccion: 'Av. Siempre Viva 742',
          nroResolucion: '9',
          fechaResolucion: '2024-01-15',
          acteco: '461001',
        },
      }),
    );
    expect(xml).toContain('<NroResolucion>9</NroResolucion>');
    expect(xml).toContain('<FechaResolucion>2024-01-15</FechaResolucion>');
    expect(xml).toContain('<IDEmisor>11111111-1</IDEmisor>');
  });

  it('trunca razón social del emisor a 100 caracteres', () => {
    const xml = buildGufXml(
      sampleDoc({
        emisor: {
          rut: '76.000.000-0',
          razonSocial: 'E'.repeat(140),
          direccion: 'Calle Falsa 123',
          nroResolucion: '80',
          fechaResolucion: '2024-01-01',
          acteco: '461001',
        },
      }),
    );
    expect(xml).toMatch(/<NmbEmisor>E{100}<\/NmbEmisor>/);
    expect(xml).not.toMatch(/<NmbEmisor>E{101}/);
  });

  it('exige Acteco de 6 dígitos desde el canónico', () => {
    expect(() =>
      buildGufXml(
        sampleDoc({
          emisor: {
            rut: '76.000.000-0',
            razonSocial: 'Emisor de prueba SpA',
            direccion: 'Calle Falsa 123',
            nroResolucion: '80',
            fechaResolucion: '2024-01-01',
          },
        }),
      ),
    ).toThrow(/Acteco/);
  });

  it('exige CodRef 1-3 en nota de crédito', () => {
    expect(() =>
      buildGufXml(
        sampleDoc({
          documento: {
            tipoDte: 61,
            fechaEmision: '2026-08-19',
            numeroInterno: 'NC-1',
            referencia: { tipo: '33', folio: '100', fecha: '2026-08-01' },
          },
        }),
      ),
    ).toThrow(/Código REF/);

    const xml = buildGufXml(
      sampleDoc({
        documento: {
          tipoDte: 61,
          fechaEmision: '2026-08-19',
          numeroInterno: 'NC-1',
          referencia: { tipo: '33', folio: '100', fecha: '2026-08-01', codRef: 1 },
        },
      }),
    );
    expect(xml).toContain('<CodRef>1</CodRef>');
    expect(xml).toContain('<TpoDocRef>33</TpoDocRef>');
  });

  it('exige dirección y comuna del receptor en DTE nacional', () => {
    expect(() =>
      buildGufXml(
        sampleDoc({
          receptor: {
            rut: '76.210.101-7',
            razonSocial: 'Importadora Pacific Fruit SpA',
          },
        }),
      ),
    ).toThrow(/DirRecep|comuna del receptor/);
  });

  it('mapea receptor extranjero exportación al RUT genérico SII sin inventar tags', () => {
    const xml = buildGufXml(
      sampleDoc({
        receptor: {
          rut: 'EX-US-CLIENT-123',
          razonSocial: 'Foreign Client',
          direccion: '123 Main St',
          ciudad: 'Los Angeles',
        },
        documento: {
          tipoDte: 110,
          fechaEmision: '2026-08-19',
          numeroInterno: 'FAC-EXP-1',
          moneda: 'USD',
          comex: sampleComex(),
        },
        indicadores: { exportacion: true, exento: true },
      }),
    );

    expect(xml).toContain('<NroDocRecep>55555555-5</NroDocRecep>');
    expect(xml).not.toContain('<NroDocRecep>EX-');
    expect(xml).not.toContain('EX-US-CLIENT-123');
  });

  it('DTE 110 usa RUT genérico SII aunque el receptor tenga RUT chileno', () => {
    const xml = buildGufXml(
      sampleDoc({
        receptor: {
          rut: '76.210.101-7',
          razonSocial: 'Importadora Pacific Fruit SpA',
          direccion: 'Av. Kennedy 5600',
          comuna: 'Las Condes',
          ciudad: 'Santiago',
        },
        documento: {
          tipoDte: 110,
          fechaEmision: '2026-09-10',
          numeroInterno: 'FAC-EXP-RUT',
          moneda: 'USD',
          comex: sampleComex(),
        },
        indicadores: { exportacion: true, exento: true },
        totales: { neto: 80, iva: 0, tasaIva: 0, total: 80 },
      }),
    );
    expect(xml).toContain('<NroDocRecep>55555555-5</NroDocRecep>');
    expect(xml).toContain('<RUTRecep>55555555-5</RUTRecep>');
    expect(xml).not.toContain('76210101-7');
  });

  it('incluye TpoCambio, montos otra moneda y bultos en DTE 110', () => {
    const xml = buildGufXml(
      sampleDoc({
        documento: {
          tipoDte: 110,
          fechaEmision: '2026-09-04',
          numeroInterno: 'FAC-EXP-2',
          moneda: 'USD',
          comex: sampleComex({
            bultoTipoCodigo: '1',
            paisDestino: 'US',
            clausulaVenta: 'CIF',
            viaTransporte: '1',
            modalidadVenta: '1',
          }),
        },
        indicadores: { exportacion: true, exento: true },
        totales: { neto: 80, iva: 0, tasaIva: 0, total: 80 },
      }),
    );
    expect(xml).toContain('<Tipo>110</Tipo>');
    expect(xml).toContain('<TpoMoneda>DOLAR USA</TpoMoneda>');
    expect(xml).toContain("name='TpoMoneda'>DOLAR USA");
    expect(xml).not.toContain("name='TpoMoneda'>PESO CL");
    expect(xml).toContain("name='OtrMnda'>PESO CL");
    expect(xml).toContain('<Moneda>DOLAR USA</Moneda>');
    expect(xml).toContain('<OtraMoneda>');
    expect(xml).toContain('<TpoMoneda>PESO CL</TpoMoneda>');
    expect(xml.indexOf('</Totales>')).toBeLessThan(xml.indexOf('<OtraMoneda>'));
    expect(xml).toContain('<FctConv>950.5</FctConv>');
    expect(xml).toContain("name='MntTotOtrMnda'>76040");
    expect(xml).toContain("name='MntExeOtrMnda'>76040");
    expect(xml).toContain('<OtrMnda>');
    expect(xml).toContain('<Moneda>CLP</Moneda>');
    expect(xml).toContain('<MontoItemOtrMnda>950500</MontoItemOtrMnda>');
    expect(xml.indexOf('<Totales>')).toBeLessThan(xml.indexOf("name='MntTotOtrMnda'>76040"));
    expect(xml.indexOf("name='MntTotOtrMnda'>76040")).toBeLessThan(xml.indexOf('</Totales>'));
    expect(xml).toContain("name='TotBultos'>12");
    expect(xml).toContain("name='CodTpoBultos'>1");
    expect(xml).toContain("name='CodPaisDestin'>US");
  });

  it('no emite tags COMEX en DTE 33 aunque vengan en el canónico', () => {
    const xml = buildGufXml(
      sampleDoc({
        documento: {
          tipoDte: 33,
          fechaEmision: '2026-09-04',
          numeroInterno: 'FAC-33',
          comex: { tipoCambio: 900, montoOtraMoneda: 10, bultoCantidad: 2 },
        },
      }),
    );
    expect(xml).toContain('<Tipo>33</Tipo>');
    expect(xml).not.toContain('TpoCambio');
    expect(xml).not.toContain('<MntExe>');
    expect(xml).not.toContain('TpoMoneda');
    expect(xml).not.toContain('CodPaisRecep');
    expect(xml).not.toContain('MntTotOtrMnda');
    expect(xml).not.toContain('TotBultos');
  });

  it('no envía <Numero>: el folio lo asigna el portal/CAF', () => {
    const xml = buildGufXml(
      sampleDoc({
        documento: {
          tipoDte: 33,
          fechaEmision: '2026-08-19',
          numeroInterno: 'X-111222333444555666777',
        },
      }),
    );
    expect(xml).not.toMatch(/<Numero>/);
    expect(xml).toContain('<NumeroInterno>X-111222333444555666777</NumeroInterno>');
  });

  it('NC CodRef 2: no envía TasaIVA 0 ni PrcItem 0 (XSD SII)', () => {
    const xml = buildGufXml(
      sampleDoc({
        documento: {
          tipoDte: 61,
          fechaEmision: '2026-09-08',
          numeroInterno: '10155928',
          referencia: { tipo: '33', folio: '70', fecha: '2026-09-08', codRef: 2 },
        },
        totales: { neto: 0, iva: 0, tasaIva: 19, total: 0 },
        lineas: [{
          nro: 1,
          descripcion: 'Donde dice Av. Apoquindo 4501 debe decir Avenida Apoquindo 4501',
          cantidad: 1,
          unidad: 'UN',
          precio: 0,
          montoNeto: 0,
        }],
      }),
    );
    expect(xml).toContain('<Tipo>61</Tipo>');
    expect(xml).toContain('<TasaIVA>19</TasaIVA>');
    expect(xml).not.toMatch(/<TasaIVA>0<\/TasaIVA>/);
    expect(xml).toContain('<PrcItem>0.000001</PrcItem>');
    expect(xml).not.toMatch(/<PrcItem>0<\/PrcItem>/);
  });

  it('exportación omite TasaIVA si la tasa es 0', () => {
    const xml = buildGufXml(
      sampleDoc({
        indicadores: { exportacion: true, exento: true },
        totales: { neto: 80, iva: 0, tasaIva: 0, total: 80 },
        documento: {
          tipoDte: 110,
          fechaEmision: '2026-09-04',
          numeroInterno: 'FAC-110',
          moneda: 'USD',
          comex: sampleComex({ montoOtraMoneda: 80, montoExentoOtraMoneda: 80 }),
        },
      }),
    );
    expect(xml).not.toContain('<TasaIVA>');
  });

  it('DTE 110 mapea FOB/MARITIMA/CONSIGNACION_LIBRE a códigos Aduana y emite MntExe', () => {
    const xml = buildGufXml(
      sampleDoc({
        documento: {
          tipoDte: 110,
          fechaEmision: '2026-09-10',
          numeroInterno: 'FAC-EXP-FOB',
          moneda: 'USD',
          comex: sampleComex(),
        },
        indicadores: { exportacion: true, exento: true },
        totales: { neto: 80, exento: 80, iva: 0, tasaIva: 0, total: 80 },
      }),
    );
    expect(xml).toContain('<Tipo>110</Tipo>');
    expect(xml).toContain("name='CodClauVenta'>5");
    expect(xml).toContain("name='CodViaTransp'>1");
    expect(xml).toContain("name='CodModVenta'>3");
    expect(xml).toContain('<TpoMoneda>DOLAR USA</TpoMoneda>');
    expect(xml).toContain('<Moneda>DOLAR USA</Moneda>');
    expect(xml).toContain('<Transporte>');
    expect(xml).not.toContain('<TpoMoneda>13</TpoMoneda>');
    expect(xml).toContain('<MntExe>80</MntExe>');
    expect(xml).toContain("name='CodPaisRecep'>225");
    expect(xml).toContain("name='CodTpoBultos'>22");
    expect(xml).toContain("name='Marcas'>-");
    expect(xml).toContain('<DirRecep>Av. Prueba 456</DirRecep>');
    expect(xml).toContain('<CiudadRecep>Santiago</CiudadRecep>');
  });

  it('DTE 110 sin referencia no emite nodo Referencia vacío', () => {
    const xml = buildGufXml(
      sampleDoc({
        documento: {
          tipoDte: 110,
          fechaEmision: '2026-09-10',
          numeroInterno: 'FAC-EXP-NOREF',
          moneda: 'USD',
          referencia: { tipo: '', folio: '' },
          comex: sampleComex(),
        },
        indicadores: { exportacion: true, exento: true },
        totales: { neto: 80, exento: 80, iva: 0, tasaIva: 0, total: 80 },
      }),
    );
    expect(xml).not.toContain('<Referencia>');
  });

  it('DTE 110 sin país receptor lanza GufValidationError', () => {
    expect(() =>
      buildGufXml(
        sampleDoc({
          documento: {
            tipoDte: 110,
            fechaEmision: '2026-09-10',
            numeroInterno: 'FAC-EXP-NOPAIS',
            moneda: 'USD',
            comex: sampleComex({ codPaisRecep: '' }),
          },
          indicadores: { exportacion: true, exento: true },
          totales: { neto: 80, iva: 0, tasaIva: 0, total: 80 },
        }),
      ),
    ).toThrow(/CodPaisRecep/);
  });

  it.each([111, 112])('DTE %s CodRef 3 hereda COMEX y emite Referencia', (tipoDte) => {
    const xml = buildGufXml(
      sampleDoc({
        documento: {
          tipoDte,
          fechaEmision: '2026-09-10',
          numeroInterno: `NC-EXP-${tipoDte}`,
          moneda: 'USD',
          referencia: { tipo: '110', folio: '58', fecha: '2026-09-01', codRef: 3 },
          comex: sampleComex(),
        },
        indicadores: { exportacion: true, exento: true },
        totales: { neto: 80, exento: 80, iva: 0, tasaIva: 0, total: 80 },
      }),
    );
    expect(xml).toContain(`<Tipo>${tipoDte}</Tipo>`);
    expect(xml).toContain('<CodRef>3</CodRef>');
    expect(xml).toContain('<TpoDocRef>110</TpoDocRef>');
    expect(xml).toContain('<NumeroRef>58</NumeroRef>');
    expect(xml).toContain('<FechaRef>2026-09-01</FechaRef>');
    expect(xml).toContain('<TpoMoneda>DOLAR USA</TpoMoneda>');
    expect(xml).toContain('<Moneda>DOLAR USA</Moneda>');
    expect(xml).toContain('<Transporte>');
    expect(xml).not.toContain('<TpoMoneda>13</TpoMoneda>');
    expect(xml).toContain('<MntExe>80</MntExe>');
    expect(xml).toContain("name='CodPaisRecep'>225");
    expect(xml).toContain("name='CodClauVenta'>5");
  });
});
