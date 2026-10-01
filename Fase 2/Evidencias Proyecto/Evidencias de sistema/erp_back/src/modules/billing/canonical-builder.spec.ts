import { BadRequestException } from '@nestjs/common';
import {
  assertExportacionFailClosed,
  mapTipoDte,
  buildCanonicalFromDocumento,
} from './canonical-builder';

describe('canonical-builder', () => {
  const empresa = {
    id: 'EMP-1',
    rut: '76.000.000-0',
    razonSocial: 'Almahue SpA',
  };

  it('mapea FACTURA EXPORTACION → 110', () => {
    expect(mapTipoDte('FACTURA', 'EXPORTACION')).toBe(110);
    expect(mapTipoDte('FACTURA', 'EXENTO')).toBe(34);
    expect(mapTipoDte('FACTURA', 'VENTA')).toBe(33);
    expect(mapTipoDte('NC', 'EXPORTACION')).toBe(112);
    expect(mapTipoDte('ND', 'VENTA')).toBe(56);
    expect(mapTipoDte('ND', 'EXPORTACION')).toBe(111);
    expect(mapTipoDte('GUIA', 'VENTA')).toBe(52);
  });

  it('no incluye cuentaContableId ni centroCostoId', () => {
    const doc = buildCanonicalFromDocumento(
      {
        id: 'd1',
        folio: 'F-1',
        tipo: 'FACTURA',
        cliente: 'Cliente',
        fecha: new Date('2026-08-06'),
        neto: 100,
        iva: 0,
        lineas: [{ descripcion: 'X', cantidad: 1, precioUnitario: 100, total: 100 }],
        indicadorVenta: 'EXPORTACION',
        receptorRut: '55.555.555-5',
        empresaId: 'EMP-1',
        cuentaContableId: 'SECRET',
        centroCostoId: 'CC-SECRET',
      } as never,
      empresa,
    );
    const raw = JSON.stringify(doc);
    expect(raw).not.toContain('cuentaContableId');
    expect(raw).not.toContain('centroCostoId');
    expect(raw).not.toContain('SECRET');
    expect(doc.documento.tipoDte).toBe(110);
    expect(doc.indicadores?.exportacion).toBe(true);
  });

  it('incluye source.billerId desde gosocketBillerId de la empresa', () => {
    const doc = buildCanonicalFromDocumento(
      {
        id: 'd-biller',
        folio: 'F-3',
        tipo: 'FACTURA',
        cliente: 'Cliente',
        fecha: new Date('2026-08-26'),
        neto: 100,
        iva: 19,
        lineas: [{ descripcion: 'X', cantidad: 1, precioUnitario: 100, total: 100 }],
        empresaId: 'EMP-SERVICES',
      } as never,
      {
        id: 'EMP-SERVICES',
        rut: '77.032.639-7',
        razonSocial: 'ALM SERVICES SPA',
        gosocketBillerId: 'd23bdecb-0776-433b-aaf2-ab4e11e76501',
      },
    );
    expect(doc.source.billerId).toBe('d23bdecb-0776-433b-aaf2-ab4e11e76501');
  });

  it('no envía ApiUser/password en el canónico (viven en el gateway por empresaId)', () => {
    const doc = buildCanonicalFromDocumento(
      {
        id: 'd-api',
        folio: 'F-api',
        tipo: 'FACTURA',
        cliente: 'Cliente',
        fecha: new Date('2026-09-17'),
        neto: 100,
        iva: 19,
        lineas: [{ descripcion: 'X', cantidad: 1, precioUnitario: 100, total: 100 }],
        empresaId: 'EMP-SERVICES',
      } as never,
      {
        id: 'EMP-SERVICES',
        rut: '77.032.639-7',
        razonSocial: 'ALM SERVICES SPA',
        gosocketBillerId: 'eda79c0c-8771-4a84-8c95-ef700ecc67c9',
      },
    );
    expect(doc.source.empresaId).toBe('EMP-SERVICES');
    expect(doc.source.billerId).toBe('eda79c0c-8771-4a84-8c95-ef700ecc67c9');
    expect(doc.source).not.toHaveProperty('apiUser');
    expect(doc.source).not.toHaveProperty('apiPassword');
  });

  it('incluye nro y fecha de resolución desde la empresa, no desde env del gateway', () => {
    const doc = buildCanonicalFromDocumento(
      {
        id: 'd-cae',
        folio: 'F-4',
        tipo: 'FACTURA',
        cliente: 'Cliente',
        fecha: new Date('2026-09-01'),
        neto: 100,
        iva: 19,
        lineas: [{ descripcion: 'X', cantidad: 1, precioUnitario: 100, total: 100 }],
        empresaId: 'EMP-EXPORT',
      } as never,
      {
        id: 'EMP-EXPORT',
        rut: '77.032.638-9',
        razonSocial: 'ALMAHUE EXPORT SPA',
        gosocketNroResolucion: '9',
        gosocketFechaResolucion: '2024-01-15',
        gosocketActeco: '461001',
      },
    );
    expect(doc.emisor.nroResolucion).toBe('9');
    expect(doc.emisor.fechaResolucion).toBe('2024-01-15');
    expect(doc.emisor.acteco).toBe('461001');
  });

  it('emite flete como línea de detalle, no como recargo SII', () => {
    const doc = buildCanonicalFromDocumento(
      {
        id: 'd2',
        folio: 'F-2',
        tipo: 'FACTURA',
        cliente: 'Cliente',
        fecha: new Date('2026-08-16'),
        neto: 110000,
        iva: 20900,
        lineas: [
          { descripcion: 'Caja', cantidad: 1, precioUnitario: 100000, total: 100000, tipoLinea: 'PRODUCTO' },
          { descripcion: 'Despacho', cantidad: 1, precioUnitario: 10000, total: 10000, tipoLinea: 'RECARGO' },
        ],
        empresaId: 'EMP-1',
      } as never,
      empresa,
    );
    expect(doc.lineas).toHaveLength(2);
    expect(doc.lineas[1].descripcion).toMatch(/^Flete/);
    expect(JSON.stringify(doc)).not.toMatch(/recargoSii|Recargo/i);
  });

  it('mapea COMEX y referencia.codRef desde el documento', () => {
    const doc = buildCanonicalFromDocumento(
      {
        id: 'd-comex',
        folio: 'NC-EXP-1',
        tipo: 'NC',
        cliente: 'Foreign Client',
        fecha: new Date('2026-09-04'),
        neto: 80,
        iva: 0,
        lineas: [{ descripcion: 'Cereza', cantidad: 1, precioUnitario: 80, total: 80 }],
        indicadorVenta: 'EXPORTACION',
        monedaCodigo: 'USD',
        tipoCambio: 950.5,
        montoOtraMoneda: 80,
        montoExentoOtraMoneda: 80,
        bultoCantidad: 12,
        bultoTipoCodigo: '1',
        bultoMarca: '-',
        paisRecepCodigo: '225',
        paisDestino: 'US',
        puertoEmbarque: 'CLVAP',
        puertoDesembarque: 'USLAX',
        clausulaVenta: 'CIF',
        viaTransporte: '1',
        modalidadVenta: '1',
        indTraslado: 'DESPACHO POR CUENTA DEL EMISOR',
        referenciaTipo: '110',
        referenciaFolio: '58',
        referenciaFecha: new Date('2026-09-01'),
        referenciaCod: 3,
        empresaId: 'EMP-1',
      } as never,
      empresa,
    );
    expect(doc.documento.tipoDte).toBe(112);
    expect(doc.documento.comex).toEqual({
      tipoCambio: 950.5,
      montoOtraMoneda: 80,
      montoExentoOtraMoneda: 80,
      bultoCantidad: 12,
      bultoTipoCodigo: '1',
      bultoMarca: '-',
      paisDestino: 'US',
      puertoEmbarque: 'CLVAP',
      puertoDesembarque: 'USLAX',
      clausulaVenta: 'CIF',
      viaTransporte: '1',
      modalidadVenta: '1',
      tpoMoneda: '13',
      codPaisRecep: '225',
      indTraslado: 'DESPACHO POR CUENTA DEL EMISOR',
    });
    expect(doc.documento.referencia).toEqual({
      tipo: '110',
      folio: '58',
      fecha: '2026-09-01',
      codRef: 3,
    });
  });

  it('no agrega comex en factura nacional sin campos COMEX', () => {
    const doc = buildCanonicalFromDocumento(
      {
        id: 'd-nac',
        folio: 'F-33',
        tipo: 'FACTURA',
        cliente: 'Cliente',
        fecha: new Date('2026-09-04'),
        neto: 100,
        iva: 19,
        lineas: [{ descripcion: 'X', cantidad: 1, precioUnitario: 100, total: 100 }],
        empresaId: 'EMP-1',
      } as never,
      empresa,
    );
    expect(doc.documento.tipoDte).toBe(33);
    expect(doc.documento.comex).toBeUndefined();
  });

  it('NC CodRef 2 nacional: tasa 19 aunque IVA sea 0; no marca exento por monto 0', () => {
    const doc = buildCanonicalFromDocumento(
      {
        id: 'nc-txt',
        folio: '10155928',
        tipo: 'NC',
        cliente: 'Importadora Pacific Fruit SpA',
        fecha: new Date('2026-09-08'),
        neto: 0,
        iva: 0,
        lineas: [{
          descripcion: 'Donde dice Av. Apoquindo 4501 debe decir Avenida Apoquindo 4501',
          cantidad: 1,
          precioUnitario: 0,
          total: 0,
          tipoLinea: 'SERVICIO',
        }],
        indicadorVenta: 'VENTA',
        referenciaTipo: '33',
        referenciaFolio: '70',
        referenciaFecha: new Date('2026-09-08'),
        referenciaCod: 2,
        empresaId: 'EMP-1',
      } as never,
      empresa,
    );
    expect(doc.totales.tasaIva).toBe(19);
    expect(doc.indicadores?.exento).toBe(false);
    expect(doc.documento.referencia?.codRef).toBe(2);
  });

  it('FACTURA EXPORTACION sin paisRecep no es canónico válido (fail-closed)', () => {
    const doc = buildCanonicalFromDocumento(
      {
        id: 'd-exp-sin-pais',
        folio: 'F-110',
        tipo: 'FACTURA',
        cliente: 'Foreign Client',
        fecha: new Date('2026-09-10'),
        neto: 100,
        iva: 19,
        lineas: [{ descripcion: 'Caja', cantidad: 1, precioUnitario: 100, total: 100 }],
        indicadorVenta: 'EXPORTACION',
        tipoCambio: 950,
        bultoCantidad: 10,
        receptorDireccion: 'Harbor St 1',
        receptorCiudad: 'Miami',
        empresaId: 'EMP-1',
      } as never,
      empresa,
    );
    expect(doc.documento.tipoDte).toBe(110);
    expect(doc.documento.moneda).toBe('USD');
    expect(doc.documento.comex?.tpoMoneda).toBe('13');
    expect(doc.documento.comex?.codPaisRecep).toBeUndefined();
    expect(doc.totales.iva).toBe(0);
    expect(doc.totales.exento).toBe(100);
    expect(() => assertExportacionFailClosed(doc)).toThrow(BadRequestException);
    expect(() => assertExportacionFailClosed(doc)).toThrow(/país del receptor/i);
  });

  it('FACTURA nacional no exige COMEX', () => {
    const doc = buildCanonicalFromDocumento(
      {
        id: 'd-nac-2',
        folio: 'F-33b',
        tipo: 'FACTURA',
        cliente: 'Cliente',
        fecha: new Date('2026-09-10'),
        neto: 100,
        iva: 19,
        lineas: [{ descripcion: 'X', cantidad: 1, precioUnitario: 100, total: 100 }],
        indicadorVenta: 'VENTA',
        empresaId: 'EMP-1',
      } as never,
      empresa,
    );
    expect(doc.documento.tipoDte).toBe(33);
    expect(doc.documento.comex).toBeUndefined();
    expect(() => assertExportacionFailClosed(doc)).not.toThrow();
  });

  it('110 completo pasa fail-closed', () => {
    const doc = buildCanonicalFromDocumento(
      {
        id: 'd-exp-ok',
        folio: 'F-110-ok',
        tipo: 'FACTURA',
        cliente: 'Foreign Client',
        fecha: new Date('2026-09-10'),
        neto: 100,
        iva: 0,
        lineas: [{ descripcion: 'Caja', cantidad: 1, precioUnitario: 100, total: 100 }],
        indicadorVenta: 'EXPORTACION',
        tipoCambio: 950.5,
        bultoCantidad: 12,
        paisRecepCodigo: '225',
        receptorDireccion: 'Harbor St 1',
        receptorCiudad: 'Miami',
        empresaId: 'EMP-1',
      } as never,
      empresa,
    );
    expect(doc.documento.tipoDte).toBe(110);
    expect(doc.lineas[0].unidad).toBe('CAJA');
    expect(() => assertExportacionFailClosed(doc)).not.toThrow();
  });

  it('NC 112 sin referencia a 110 queda fail-closed', () => {
    const doc = buildCanonicalFromDocumento(
      {
        id: 'nc-exp-noref',
        folio: 'NC-112',
        tipo: 'NC',
        cliente: 'Foreign Client',
        fecha: new Date('2026-09-10'),
        neto: 20,
        iva: 0,
        lineas: [{ descripcion: 'Cereza', cantidad: 1, precioUnitario: 20, total: 20, unidadMedida: 'CAJA' }],
        indicadorVenta: 'EXPORTACION',
        tipoCambio: 950.5,
        paisRecepCodigo: '225',
        receptorDireccion: 'Harbor St 1',
        receptorCiudad: 'Miami',
        empresaId: 'EMP-1',
      } as never,
      empresa,
    );
    expect(doc.documento.tipoDte).toBe(112);
    expect(() => assertExportacionFailClosed(doc)).toThrow(/referenci/i);
  });

  it('NC 112 con referencia 110 pasa fail-closed', () => {
    const doc = buildCanonicalFromDocumento(
      {
        id: 'nc-exp-ok',
        folio: 'NC-112-ok',
        tipo: 'NC',
        cliente: 'Foreign Client',
        fecha: new Date('2026-09-10'),
        neto: 20,
        iva: 0,
        lineas: [{ descripcion: 'Cereza', cantidad: 1, precioUnitario: 20, total: 20, unidadMedida: 'CAJA' }],
        indicadorVenta: 'EXPORTACION',
        tipoCambio: 950.5,
        paisRecepCodigo: '225',
        receptorDireccion: 'Harbor St 1',
        receptorCiudad: 'Miami',
        referenciaTipo: '110',
        referenciaFolio: '62',
        referenciaFecha: new Date('2026-09-10'),
        referenciaCod: 3,
        empresaId: 'EMP-1',
      } as never,
      empresa,
    );
    expect(doc.documento.tipoDte).toBe(112);
    expect(doc.lineas[0].unidad).toBe('CAJA');
    expect(() => assertExportacionFailClosed(doc)).not.toThrow();
  });

  it('no pone el nombre en detalle y omite DscItem si la línea no trae detalle', () => {
    const sin = buildCanonicalFromDocumento(
      {
        id: 'd-sin-det',
        folio: 'F-det-0',
        tipo: 'FACTURA',
        cliente: 'Cliente',
        fecha: new Date('2026-09-17'),
        neto: 100,
        iva: 19,
        lineas: [{ descripcion: 'Cereza premium', cantidad: 1, precioUnitario: 100, total: 100 }],
        empresaId: 'EMP-1',
      } as never,
      empresa,
    );
    expect(sin.lineas[0].descripcion).toBe('Cereza premium');
    expect(sin.lineas[0].detalle).toBeUndefined();

    const con = buildCanonicalFromDocumento(
      {
        id: 'd-con-det',
        folio: 'F-det-1',
        tipo: 'FACTURA',
        cliente: 'Cliente',
        fecha: new Date('2026-09-17'),
        neto: 100,
        iva: 19,
        lineas: [{
          descripcion: 'Cereza premium',
          detalle: 'Caja 5 kg, calibre 28',
          cantidad: 1,
          precioUnitario: 100,
          total: 100,
        }],
        empresaId: 'EMP-1',
      } as never,
      empresa,
    );
    expect(con.lineas[0].descripcion).toBe('Cereza premium');
    expect(con.lineas[0].detalle).toBe('Caja 5 kg, calibre 28');
  });
});
