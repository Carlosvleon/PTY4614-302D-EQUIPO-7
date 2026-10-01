import { BadRequestException } from '@nestjs/common';
import type { CanonicalDocumentV1 } from './types';
import { assertCanonical } from './canonical';

function validDoc(): CanonicalDocumentV1 {
  return {
    schemaVersion: '1.0',
    idempotencyKey: 'erp:empresa:documento',
    source: { erpId: 'erp', empresaId: 'EMP-1', documentoId: 'DOC-1' },
    emisor: { rut: '76.000.000-0', razonSocial: 'Emisor' },
    receptor: {
      rut: '55.555.555-5',
      razonSocial: 'Receptor',
      direccion: 'Av. Prueba 100',
      comuna: 'Santiago',
      ciudad: 'Santiago',
    },
    documento: {
      tipoDte: 33,
      fechaEmision: '2026-08-19',
      numeroInterno: 'FAC-1',
    },
    totales: { neto: 100, exento: 0, iva: 19, total: 119 },
    lineas: [
      { nro: 1, descripcion: 'Producto', cantidad: 1, precio: 100, montoNeto: 100 },
    ],
  };
}

describe('assertCanonical', () => {
  it('exige dirección y comuna del receptor en DTE nacional 33', () => {
    const doc = validDoc();
    delete doc.receptor.direccion;
    delete doc.receptor.comuna;
    expect(() => assertCanonical(doc)).toThrow(/receptor.direccion/);
  });

  it('acepta comex opcional en canónico 110 sin exigir códigos Aduana (validación GUF)', () => {
    const doc = validDoc();
    doc.documento.tipoDte = 110;
    doc.documento.moneda = 'USD';
    doc.documento.comex = {
      tpoMoneda: '13',
      codPaisRecep: '225',
      clausulaVenta: 'FOB',
      bultoMarca: '-',
    };
    doc.totales = { neto: 100, exento: 100, iva: 0, total: 100 };
    doc.indicadores = { exportacion: true, exento: true };
    expect(() => assertCanonical(doc)).not.toThrow();
  });

  it('acepta source.billerId UUID y rechaza uno inválido', () => {
    const ok = validDoc();
    ok.source.billerId = 'd23bdecb-0776-433b-aaf2-ab4e11e76501';
    expect(() => assertCanonical(ok)).not.toThrow();

    const bad = validDoc();
    bad.source.billerId = 'no-es-uuid';
    expect(() => assertCanonical(bad)).toThrow(/source.billerId/);
  });

  it.each([34, 110, 111, 112])(
    'acepta canónico exento/exportación real ERP para tipo %s sin sumar exento dos veces',
    (tipoDte) => {
      const doc = validDoc();
      doc.documento.tipoDte = tipoDte;
      doc.totales = { neto: 100, exento: 100, iva: 0, total: 100 };
      doc.indicadores = { exento: true, exportacion: tipoDte >= 110 };
      expect(() => assertCanonical(doc)).not.toThrow();
    },
  );

  it('acepta receptor EX estricto solo en exportación', () => {
    const doc = validDoc();
    doc.receptor.rut = 'EX-US-CLIENT-123';
    doc.indicadores = { exportacion: true, exento: true };
    expect(() => assertCanonical(doc)).not.toThrow();
  });

  it('rechaza receptor EX en documento nacional', () => {
    const doc = validDoc();
    doc.receptor.rut = 'EX-US-CLIENT-123';
    expect(() => assertCanonical(doc)).toThrow(/receptor.rut inválido/);
  });

  it.each(['76.000.000-0', '55.555.555-5'])(
    'acepta RUT chileno válido en exportación: %s',
    (rut) => {
      const doc = validDoc();
      doc.receptor.rut = rut;
      doc.indicadores = { exportacion: true };
      expect(() => assertCanonical(doc)).not.toThrow();
    },
  );

  it.each([
    'EX-US-CLIENT<123',
    'EX-US--CLIENT',
    `EX-${'A'.repeat(48)}`,
  ])('rechaza identificador extranjero inseguro: %s', (rut) => {
    const doc = validDoc();
    doc.receptor.rut = rut;
    doc.indicadores = { exportacion: true };
    expect(() => assertCanonical(doc)).toThrow(BadRequestException);
  });

  it('acepta reconciliación de línea con descuento', () => {
    const doc = validDoc();
    doc.lineas[0] = {
      nro: 1,
      descripcion: 'Producto con descuento',
      cantidad: 2,
      precio: 50,
      descuentoPct: 10,
      montoNeto: 90,
    };
    doc.totales = { neto: 90, iva: 17.1, total: 107.1 };
    expect(() => assertCanonical(doc)).not.toThrow();
  });

  it.each(['2026-08-19', '2026-08-20'])(
    'acepta fechaVencimiento igual o posterior: %s',
    (fechaVencimiento) => {
      const doc = validDoc();
      doc.documento.fechaVencimiento = fechaVencimiento;
      expect(() => assertCanonical(doc)).not.toThrow();
    },
  );

  it('rechaza fechaVencimiento anterior a fechaEmision', () => {
    const doc = validDoc();
    doc.documento.fechaVencimiento = '2026-08-18';
    expect(() => assertCanonical(doc)).toThrow(/no puede ser anterior/);
  });

  const invalidCases: Array<[string, (doc: CanonicalDocumentV1) => void]> = [
    ['tipo DTE', (doc: CanonicalDocumentV1) => { doc.documento.tipoDte = 999; }],
    ['RUT', (doc: CanonicalDocumentV1) => { doc.emisor.rut = 'no-es-rut'; }],
    ['checksum RUT', (doc: CanonicalDocumentV1) => { doc.emisor.rut = '76.000.000-1'; }],
    ['fecha imposible', (doc: CanonicalDocumentV1) => { doc.documento.fechaEmision = '2026-02-31'; }],
    ['cantidad', (doc: CanonicalDocumentV1) => { doc.lineas[0].cantidad = 0; }],
    ['precio infinito', (doc: CanonicalDocumentV1) => { doc.lineas[0].precio = Infinity; }],
    ['monto de línea incoherente', (doc: CanonicalDocumentV1) => { doc.lineas[0].montoNeto = 90; }],
    ['suma de líneas incoherente', (doc: CanonicalDocumentV1) => {
      doc.lineas.push({
        nro: 2,
        descripcion: 'Otro producto',
        cantidad: 1,
        precio: 10,
        montoNeto: 10,
      });
    }],
    ['total incoherente', (doc: CanonicalDocumentV1) => { doc.totales.total = 120; }],
    ['exento mayor que neto', (doc: CanonicalDocumentV1) => { doc.totales.exento = 101; }],
    ['descripción vacía', (doc: CanonicalDocumentV1) => { doc.lineas[0].descripcion = ' '; }],
  ];

  it.each(invalidCases)('rechaza canónico inválido: %s', (_name, mutate) => {
    const doc = validDoc();
    mutate(doc);
    expect(() => assertCanonical(doc)).toThrow(BadRequestException);
  });

  it('mantiene prohibidos los campos contables incluso anidados', () => {
    const doc = validDoc() as CanonicalDocumentV1 & {
      extra?: { centroCostoId: string };
    };
    doc.extra = { centroCostoId: 'CC-1' };
    expect(() => assertCanonical(doc)).toThrow(/Campo prohibido/);
  });

  it('limita cantidad de líneas y tamaño total del canónico', () => {
    const tooMany = validDoc();
    tooMany.lineas = Array.from({ length: 501 }, (_, index) => ({
      nro: index + 1,
      descripcion: 'Producto',
      cantidad: 1,
      precio: 1,
      montoNeto: 1,
    }));
    tooMany.totales = { neto: 501, iva: 0, total: 501 };
    expect(() => assertCanonical(tooMany)).toThrow(/máximo de 500/);

    const tooLarge = validDoc();
    tooLarge.receptor.razonSocial = 'x'.repeat(300_000);
    expect(() => assertCanonical(tooLarge)).toThrow(/excede el máximo/);
  });

  it('acepta detalle DTE opcional y rechaza si excede 1000', () => {
    const ok = validDoc();
    ok.lineas[0].detalle = 'Caja 5 kg calibre 28';
    expect(() => assertCanonical(ok)).not.toThrow();

    const vacio = validDoc();
    vacio.lineas[0].detalle = '   ';
    expect(() => assertCanonical(vacio)).not.toThrow();

    const largo = validDoc();
    largo.lineas[0].detalle = 'x'.repeat(1001);
    expect(() => assertCanonical(largo)).toThrow(/lineas\[0\]\.detalle/);
  });
});
