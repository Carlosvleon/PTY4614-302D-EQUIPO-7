import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { codigoPuertoAduana, PUERTOS_ADUANA } from './comex-aduana.ts';
import {
  ovAccionesVisibles,
  ovTieneItemsSinCuenta,
  lineasSinCuentaContable,
  pathWizardOvItems,
  quitarSplitBodega,
  tooltipOtraBodega,
  labelEstadoOv,
  labelIndicadorVenta,
  esFilaLibroVentas,
  esOvPorFacturar,
  esDtePorContabilizar,
  folioInternoSortValue,
  itemsParaCorreccion,
  sumaCantidadProducto,
  sumaTotalesLineasUsd,
  montoClpDesdeUsd,
  montosComexDesdeCajas,
  aplicarDefaultsComex,
  emptyComexForm,
  applyDocumentoCabecera,
  mergeFacturaDraftConOv,
  patchComexSoloMontos,
  precioUnitarioDesdeInsumo,
  huecosComexFactura110,
  pisoPrecioVentaInsumo,
  labelInsumoSelector,
  violaPisoPrecioVenta,
  mensajePrecioBajoPiso,
  emptyEmitirLine,
  detalleDteOpcional,
  aplicarDetalleDesdeInsumo,
  emitirItemsToOvPayloadLineas,
  docsOrigenNcNd,
  labelOrigenNcNd,
  mapTipoDteErp,
  referenciaManualCompleta,
  puedeAnularFacturaLibro,
  textoCorreccionNc,
  saldoNcSobreFactura,
  noPuedeAnularCienPorSaldo,
  seedLineasNcRebaja,
  lineasNcDesdeEdicion,
  ncIgualaOSuperaFactura,
  historialDocumentosAsociados,
  etiquetaHistorialAsociacion,
  comexDesdeFacturaOrigen,
  payloadCierreComexDesdeFactura,
  puedeCerrarComexLibro,
  prefijarObservacionTc,
  resumenPanelTotales,
  tcBcchSugeridoDesdeKpi,
  aplicarTipoCambioSugerido,
  textoHintTcBcchSugerido,
  tipoCambioNcEfectivo,
  comexCamposDesdeFactura,
  totalBrutoDocumento,
  type EmitirLineItem,
} from './emitir-ov-helpers.ts';

describe('quitarSplitBodega', () => {
  it('no deja la línea sin bodega', () => {
    const only = [{ bodegaId: 'B1', cantidad: '2' }];
    assert.deepEqual(quitarSplitBodega(only, 0, 2), only);
  });

  it('al volver a una bodega usa la cantidad de la línea', () => {
    const splits = [
      { bodegaId: 'FRIG', cantidad: '1' },
      { bodegaId: '', cantidad: '0' },
    ];
    assert.deepEqual(quitarSplitBodega(splits, 1, 3), [
      { bodegaId: 'FRIG', cantidad: '3' },
    ]);
  });

  it('quita una fila intermedia y deja el resto', () => {
    const splits = [
      { bodegaId: 'A', cantidad: '1' },
      { bodegaId: 'B', cantidad: '2' },
      { bodegaId: 'C', cantidad: '3' },
    ];
    assert.deepEqual(quitarSplitBodega(splits, 1, 6), [
      { bodegaId: 'A', cantidad: '1' },
      { bodegaId: 'C', cantidad: '3' },
    ]);
  });
});

describe('tooltipOtraBodega', () => {
  it('explica por qué no se puede partir el stock', () => {
    assert.equal(
      tooltipOtraBodega(1, 'EX-CEREZA-CAJ · Cereza export caja 5 kg'),
      'Solo una bodega con stock del producto "EX-CEREZA-CAJ · Cereza export caja 5 kg"',
    );
    assert.equal(tooltipOtraBodega(2, 'Cereza'), undefined);
  });
});

describe('ovAccionesVisibles', () => {
  it('permite confirmar desde el alta', () => {
    const a = ovAccionesVisibles(null);
    assert.equal(a.guardar, true);
    assert.equal(a.confirmar, true);
  });

  it('permite guardar edición de OV confirmada (lápiz antes de facturar)', () => {
    const a = ovAccionesVisibles('CONFIRMADA');
    assert.equal(a.guardar, true);
    assert.equal(a.confirmar, false);
    assert.equal(a.facturar, true);
  });

  it('permite facturar cuando el stock ya está confirmado', () => {
    const a = ovAccionesVisibles('CONFIRMADA');
    assert.equal(a.confirmar, false);
    assert.equal(a.facturar, true);
  });

  it('no permite guardar una OV ya emitida', () => {
    assert.equal(ovAccionesVisibles('EMITIDO').guardar, false);
    assert.equal(ovAccionesVisibles('FACTURADO').guardar, false);
  });
});

describe('totalBrutoDocumento', () => {
  it('usa total del API y si falta suma neto+IVA', () => {
    assert.equal(totalBrutoDocumento({ total: 11900, neto: 10000, iva: 1900 }), 11900);
    assert.equal(totalBrutoDocumento({ neto: 10000, iva: 1900 }), 11900);
  });
});

describe('itemsParaCorreccion', () => {
  it('en NC/ND deja solo las líneas incluidas', () => {
    const a = { ...emptyEmitirLine(), id: 'a', incluirEnCorreccion: true };
    const b = { ...emptyEmitirLine(), id: 'b', incluirEnCorreccion: false };
    const out = itemsParaCorreccion([a, b], 'NC');
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'a');
  });

  it('en FACTURA no filtra', () => {
    const b = { ...emptyEmitirLine(), id: 'b', incluirEnCorreccion: false };
    assert.equal(itemsParaCorreccion([b], 'FACTURA').length, 1);
  });
});

describe('defaults COMEX', () => {
  it('país receptor 225 si la OV no lo trae', () => {
    const out = aplicarDefaultsComex(emptyComexForm());
    assert.equal(out.paisRecepCodigo, '225');
    assert.equal(out.paisDestino, '225');
    assert.equal(out.tpoMoneda, '13');
  });

  it('al hidratar OV EXPORTACION aplica país 225', () => {
    const cab = applyDocumentoCabecera({
      id: 'OV-1',
      tipo: 'ORDEN_VENTA',
      estado: 'CONFIRMADA',
      folio: '10100050',
      cliente: 'IMPORTADORA PACIFIC FRUIT SPA',
      fecha: '2026-09-10',
      neto: 19900,
      indicadorVenta: 'EXPORTACION',
    } as never, []);
    assert.equal(cab.comex.paisRecepCodigo, '225');
  });

  it('merge de factura borrador 110 conserva COMEX y no se queda en VENTA de la OV', () => {
    const ov = {
      id: 'OV-1',
      tipo: 'ORDEN_VENTA',
      estado: 'CONFIRMADA',
      folio: '10100050',
      cliente: 'IMPORTADORA PACIFIC FRUIT SPA',
      fecha: '2026-09-10',
      neto: 80,
      indicadorVenta: 'VENTA',
    } as never;
    const draft = {
      id: 'FA-1',
      tipo: 'FACTURA',
      estado: 'BORRADOR',
      folio: 'FA-1',
      cliente: 'IMPORTADORA PACIFIC FRUIT SPA',
      fecha: '2026-09-10',
      neto: 80,
      indicadorVenta: 'EXPORTACION',
      paisRecepCodigo: '225',
      tipoCambio: 933.8,
      tpoMoneda: '13',
      documentoOrigenId: 'OV-1',
    } as never;
    const out = mergeFacturaDraftConOv(ov, draft);
    assert.equal(out.tipo, 'FACTURA');
    assert.equal(out.indicadorVenta, 'EXPORTACION');
    assert.equal(out.paisRecepCodigo, '225');
    assert.equal(out.tipoCambio, 933.8);
    assert.equal(out.documentoOrigenId, 'OV-1');
  });
});

describe('COMEX desde líneas', () => {
  const prod = (patch: Partial<EmitirLineItem>): EmitirLineItem => ({
    ...emptyEmitirLine(),
    tipoLinea: 'PRODUCTO',
    cantidad: 2,
    precioUnitario: 10,
    ...patch,
  });

  it('suma cajas de producto y USD de todas las líneas', () => {
    const rows = [
      prod({ cantidad: 3, precioUnitario: 5 }),
      prod({ cantidad: 2, precioUnitario: 4 }),
      { ...emptyEmitirLine(), tipoLinea: 'FLETE', cantidad: 1, precioUnitario: 10 },
    ];
    assert.equal(sumaCantidadProducto(rows), 5);
    assert.equal(sumaTotalesLineasUsd(rows), 3 * 5 + 2 * 4 + 10);
  });

  it('CLP = USD * TC redondeado', () => {
    assert.equal(montoClpDesdeUsd(100.4, 950.25), Math.round(100.4 * 950.25));
    assert.equal(montoClpDesdeUsd(10, 0), 0);
  });

  it('el cálculo de cajas solo produce USD y CLP', () => {
    const rows = [prod({ cantidad: 4, precioUnitario: 12.5 })];
    const out = montosComexDesdeCajas(rows, 900);
    assert.equal(out.cajas, 4);
    assert.equal(out.usd, 50);
    assert.equal(out.clp, 45_000);
    const prev = { montoOtraMoneda: '', bultoCantidad: '99', montoExentoOtraMoneda: '1' };
    const patched = patchComexSoloMontos(prev, rows, 900);
    assert.equal(patched.montoOtraMoneda, '50');
    assert.equal(patched.bultoCantidad, '99');
    assert.equal(patched.montoExentoOtraMoneda, '1');
  });

  it('en COMEX no usa el precio de bodega del maestro', () => {
    assert.equal(precioUnitarioDesdeInsumo(80, { ignorarPrecioBodega: true }), 0);
    assert.equal(precioUnitarioDesdeInsumo(80, { ignorarPrecioBodega: true, precioActual: 15 }), 15);
    assert.equal(precioUnitarioDesdeInsumo(80, { ignorarPrecioBodega: false }), 80);
  });

  it('nacional muestra y precarga el piso de precioCompra', () => {
    const ins = { codigo: 'CER', nombre: 'Cereza', precioCompra: 120, costoPromedio: 80 };
    assert.equal(pisoPrecioVentaInsumo(ins), 120);
    assert.equal(pisoPrecioVentaInsumo({ costoPromedio: 80, precioCompra: 0 }), 80);
    assert.equal(labelInsumoSelector(ins, { mostrarPiso: true }), 'CER · Cereza · piso $120');
    assert.equal(labelInsumoSelector(ins, { mostrarPiso: false }), 'CER · Cereza');
    assert.equal(precioUnitarioDesdeInsumo(pisoPrecioVentaInsumo(ins), { ignorarPrecioBodega: false }), 120);
    assert.equal(precioUnitarioDesdeInsumo(pisoPrecioVentaInsumo(ins), { ignorarPrecioBodega: true }), 0);
    assert.equal(violaPisoPrecioVenta(1830, 1850), true);
    assert.equal(violaPisoPrecioVenta(1850, 1850), false);
    assert.equal(violaPisoPrecioVenta(1830, 1850, { ignorarPrecioBodega: true }), false);
    assert.match(mensajePrecioBajoPiso('EX-CEREZA-CAJ', 1850), /1850/);
  });
});

describe('resumenPanelTotales', () => {
  it('en venta nacional no agrega COMEX', () => {
    const out = resumenPanelTotales({
      indicadorVenta: 'VENTA',
      totals: { subtotal: 100, montoDescuento: 0, neto: 100, iva: 19, exento: 0, total: 119 },
      comex: emptyComexForm(),
      items: [],
    });
    assert.equal(out.esExport, false);
    assert.equal(out.extra.length, 0);
    assert.ok(out.filas.some((f) => f.key === 'cliente' && f.valor === 'Sin cliente'));
    assert.ok(out.filas.some((f) => f.key === 'total' && /\$/.test(f.valor)));
  });

  it('en exportación muestra USD, TC y Total CLP, sin COMEX de cabecera', () => {
    const comex = aplicarDefaultsComex(emptyComexForm());
    comex.tipoCambio = '950.5';
    const items = [{
      ...emptyEmitirLine(),
      tipoLinea: 'PRODUCTO' as const,
      cantidad: 2,
      precioUnitario: 10,
    }];
    const out = resumenPanelTotales({
      indicadorVenta: 'EXPORTACION',
      totals: { subtotal: 20, montoDescuento: 0, neto: 20, iva: 0, exento: 20, total: 20 },
      comex,
      items,
      clienteNombre: 'USA Fruit LLC',
    });
    assert.equal(out.esExport, true);
    assert.ok(out.filas.some((f) => f.key === 'cliente' && f.valor === 'USA Fruit LLC'));
    assert.ok(out.filas.some((f) => f.label === 'Total USD'));
    assert.ok(out.extra.some((f) => f.key === 'moneda' && /13/.test(f.valor)));
    assert.ok(out.extra.some((f) => f.key === 'tc'));
    assert.ok(out.extra.some((f) => f.key === 'clp' && /19/.test(f.valor)));
    assert.equal(out.extra.length, 3);
    assert.equal(out.extra.some((f) => f.key === 'pais-recep'), false);
    assert.match(out.collapsed, /USD/i);
    assert.match(out.collapsed, /CLP/i);
  });

  it('en exportación CNY etiqueta yuan, no USD', () => {
    const comex = aplicarDefaultsComex(emptyComexForm());
    comex.tpoMoneda = '48';
    comex.monedaCodigo = 'CNY';
    comex.tipoCambio = '130';
    const out = resumenPanelTotales({
      indicadorVenta: 'EXPORTACION',
      totals: { subtotal: 20, montoDescuento: 0, neto: 20, iva: 0, exento: 20, total: 20 },
      comex,
      items: [],
    });
    assert.ok(out.filas.some((f) => f.label === 'Total CNY'));
    assert.ok(out.extra.some((f) => f.key === 'moneda' && /48/.test(f.valor)));
    assert.match(out.collapsed, /CNY/i);
  });
});

describe('prefijarObservacionTc', () => {
  it('rellena y actualiza el prefijo TC sin borrar el resto', () => {
    assert.equal(prefijarObservacionTc('', 950.25), 'TC 950.25');
    assert.equal(prefijarObservacionTc('TC 900 resto', '950.5'), 'TC 950.5 resto');
    assert.equal(prefijarObservacionTc('Cierre COMEX', 900), 'TC 900 Cierre COMEX');
  });
});

describe('comexDesdeFacturaOrigen', () => {
  it('hereda COMEX y referencia 110 desde factura de exportación', () => {
    const doc = {
      id: 'FA',
      tipo: 'FACTURA',
      indicadorVenta: 'EXPORTACION',
      estado: 'EMITIDO',
      folio: 'FA-110',
      folioOficial: '58',
      cliente: 'USA Fruit',
      fecha: '2026-09-01',
      neto: 100,
      monedaCodigo: 'USD',
      tpoMoneda: '13',
      tipoCambio: 940,
      paisRecepCodigo: '225',
      paisDestino: '',
      puertoEmbarque: '201',
      puertoDesembarque: '2704',
      clausulaVenta: 'FOB',
      viaTransporte: 'MARITIMA',
      modalidadVenta: 'CONSIGNACION_LIBRE',
      indTraslado: 'DESPACHO POR CUENTA DEL EMISOR',
      bultoTipoCodigo: '22',
      bultoMarca: '-',
    } as never;
    const out = comexDesdeFacturaOrigen(doc);
    assert.equal(out?.indicadorVenta, 'EXPORTACION');
    assert.equal(out?.referencia.tipo, '110');
    assert.equal(out?.referencia.folio, '58');
    assert.equal(out?.referencia.fecha, '2026-09-01');
    assert.equal(out?.comex.clausulaVenta, '5');
    assert.equal(out?.comex.viaTransporte, '1');
    assert.equal(out?.comex.modalidadVenta, '3');
    assert.equal(out?.comex.tpoMoneda, '13');
    assert.equal(out?.comex.paisRecepCodigo, '225');
    assert.equal(out?.comex.paisDestino, '225');
    assert.equal(out?.comex.puertoEmbarque, '905');
    assert.equal(out?.comex.puertoDesembarque, '174');
  });

  it('no hereda factura nacional', () => {
    assert.equal(comexDesdeFacturaOrigen({
      id: 'X', tipo: '110', estado: 'EMITIDO', folio: '1', cliente: 'A', fecha: '2026-09-01', neto: 1,
      paisRecepCodigo: '336',
    } as never)?.referencia.tipo, '110');
    assert.equal(comexDesdeFacturaOrigen({
      id: 'N', tipo: 'FACTURA', indicadorVenta: 'VENTA', estado: 'EMITIDO',
      folio: '33', folioOficial: '10', cliente: 'A', fecha: '2026-09-01', neto: 1,
    } as never), null);
  });
});

describe('payloadCierreComexDesdeFactura', () => {
  const factura = {
    id: 'FA',
    tipo: 'FACTURA',
    indicadorVenta: 'EXPORTACION',
    estado: 'EMITIDO',
    folio: 'FA-110',
    folioOficial: '58',
    cliente: 'USA Fruit',
    clienteId: 'CL-1',
    fecha: '2026-09-01',
    neto: 100,
    receptorRut: 'EX-USA',
    receptorCiudad: 'Miami',
    monedaCodigo: 'USD',
    tpoMoneda: '13',
    tipoCambio: 940,
    paisRecepCodigo: '225',
    paisDestino: '',
    puertoEmbarque: '201',
    puertoDesembarque: '2704',
    clausulaVenta: 'FOB',
    viaTransporte: 'MARITIMA',
    modalidadVenta: 'CONSIGNACION_LIBRE',
    indTraslado: 'DESPACHO POR CUENTA DEL EMISOR',
    bultoTipoCodigo: '22',
    bultoCantidad: 10,
    bultoMarca: '-',
    montoOtraMoneda: 50,
  } as never;

  it('arma NC CodRef 3 con COMEX y referencia 110, no anulación', () => {
    const out = payloadCierreComexDesdeFactura(factura, { tipo: 'NC', codRef: 3 });
    assert.ok(out);
    assert.equal(out.tipo, 'NC');
    assert.equal(out.referenciaTipo, '110');
    assert.equal(out.referenciaFolio, '58');
    assert.equal(out.referenciaCod, 3);
    assert.notEqual(out.referenciaCod, 1);
    assert.equal(out.paisRecepCodigo, '225');
    assert.equal(out.tpoMoneda, '13');
    assert.equal(out.tipoCambio, 940);
    assert.equal(out.puertoEmbarque, '905');
    assert.equal(out.clausulaVenta, '5');
    assert.equal(out.viaTransporte, '1');
    assert.equal(out.observaciones, 'TC 940 Corrige Monto: NC por cierre');
    assert.equal(out.indicadorVenta, 'EXPORTACION');
    assert.equal(out.receptorRut, 'EX-USA');
    assert.match(String(out.observaciones), /cierre/i);
    assert.doesNotMatch(String(out.observaciones), /anula/i);
  });

  it('permite ND con el mismo COMEX', () => {
    const out = payloadCierreComexDesdeFactura(factura, { tipo: 'ND', codRef: 3 });
    assert.equal(out?.tipo, 'ND');
    assert.equal(out?.referenciaCod, 3);
    assert.equal(out?.referenciaTipo, '110');
    assert.equal(out?.observaciones, 'TC 940 Corrige Monto: ND por cierre');
  });

  it('usa el TC de la factura si no hay override', () => {
    assert.equal(tipoCambioNcEfectivo(factura), 940);
    const out = payloadCierreComexDesdeFactura(factura, { tipo: 'NC', codRef: 3 });
    assert.equal(out?.tipoCambio, 940);
  });

  it('persiste el TC editado en el payload de cierre', () => {
    assert.equal(tipoCambioNcEfectivo(factura, '955.5'), 955.5);
    const out = payloadCierreComexDesdeFactura(factura, { tipo: 'NC', codRef: 3, tipoCambio: '955.5' });
    assert.equal(out?.tipoCambio, 955.5);
    assert.equal(out?.observaciones, 'TC 955.5 Corrige Monto: NC por cierre');
    const campos = comexCamposDesdeFactura(factura, { tipoCambio: 900 });
    assert.equal(campos.tipoCambio, 900);
  });

  it('no arma cierre sobre factura nacional', () => {
    assert.equal(payloadCierreComexDesdeFactura({
      id: 'N', tipo: 'FACTURA', indicadorVenta: 'VENTA', estado: 'EMITIDO',
      folio: '33', folioOficial: '10', cliente: 'A', fecha: '2026-09-01', neto: 1,
    } as never, { tipo: 'NC', codRef: 3 }), null);
  });

  it('si la 110 no trae marca de bulto, el cierre usa -', () => {
    const out = payloadCierreComexDesdeFactura({ ...factura, bultoMarca: '' } as never, { tipo: 'NC', codRef: 3 });
    assert.equal(out?.bultoMarca, '-');
  });
});

describe('huecosComexFactura110', () => {
  it('exige los campos del manual (pts 20–26, 31), no solo país/TC/bulto', () => {
    assert.deepEqual(huecosComexFactura110({
      paisRecepCodigo: '',
      tipoCambio: '',
      bultoTipoCodigo: '',
      bultoCantidad: '',
    }, 0), [
      'modalidad de venta',
      'país destino',
      'país receptor',
      'cláusula',
      'vía de transporte',
      'puerto de embarque',
      'puerto de desembarque',
      'cantidad de bultos',
      'tipo de cambio',
    ]);
  });

  it('rellena traslado, bulto 22, marca - y USD; no inventa país ni puertos', () => {
    assert.deepEqual(huecosComexFactura110({
      paisRecepCodigo: '336',
      paisDestino: '336',
      tipoCambio: '940',
      bultoTipoCodigo: '',
      bultoCantidad: '10',
      modalidadVenta: '3',
      clausulaVenta: '5',
      viaTransporte: '1',
      puertoEmbarque: '905',
      puertoDesembarque: '174',
    }, 10), []);
  });

  it('bloquea cierre si la 110 no trae puerto de desembarque', () => {
    assert.deepEqual(huecosComexFactura110({
      paisRecepCodigo: '336',
      paisDestino: '336',
      tipoCambio: '940',
      bultoTipoCodigo: '22',
      bultoCantidad: '10',
      modalidadVenta: '3',
      clausulaVenta: '5',
      viaTransporte: '1',
      puertoEmbarque: '905',
      puertoDesembarque: '',
    }, 10), ['puerto de desembarque']);
  });
});

describe('labelEstadoOv', () => {
  it('usa CONFIRMADA, no el APROBADO de la OC', () => {
    assert.equal(labelEstadoOv('CONFIRMADA'), 'Confirmada');
    assert.equal(labelEstadoOv('APROBADO'), 'Confirmada');
    assert.equal(labelEstadoOv('EMITIDO'), 'Emitida');
    assert.equal(labelEstadoOv('BORRADOR'), 'Borrador');
  });
});

describe('labelIndicadorVenta', () => {
  it('distingue venta nacional de exportación', () => {
    assert.equal(labelIndicadorVenta('VENTA'), 'Venta');
    assert.equal(labelIndicadorVenta('EXPORTACION'), 'Exportación');
    assert.equal(labelIndicadorVenta(undefined), 'Venta');
  });
});

describe('folioInternoSortValue', () => {
  it('ordena 1012 sobre 1011 y deja texto de prueba al final', () => {
    const rows = ['1011', 'OV-SIST5-SRV', '1012', '1010'];
    const sorted = [...rows].sort((a, b) => folioInternoSortValue(b) - folioInternoSortValue(a));
    assert.deepEqual(sorted, ['1012', '1011', '1010', 'OV-SIST5-SRV']);
  });
});

describe('esFilaLibroVentas', () => {
  it('incluye DTE emitido, no OV ni borradores', () => {
    assert.equal(esOvPorFacturar({ tipo: 'ORDEN_VENTA', estado: 'CONFIRMADA' }), true);
    assert.equal(esDtePorContabilizar({ tipo: 'FACTURA', estado: 'EMITIDO' }), true);
    assert.equal(esDtePorContabilizar({ tipo: 'ORDEN_VENTA', estado: 'CONFIRMADA' }), false);
    assert.equal(esFilaLibroVentas({ tipo: 'ORDEN_VENTA', estado: 'CONFIRMADA' }), false);
    assert.equal(esFilaLibroVentas({ tipo: 'ORDEN_VENTA', estado: 'BORRADOR' }), false);
    assert.equal(esFilaLibroVentas({ tipo: 'FACTURA', estado: 'EMITIDO' }), true);
    assert.equal(esFilaLibroVentas({ tipo: 'FACTURA', estado: 'BORRADOR' }), false);
  });
});

describe('cuenta por ítem OV', () => {
  it('detecta líneas sin cuenta', () => {
    assert.equal(lineasSinCuentaContable([
      { insumoId: 'I1', cuentaContableId: '' },
      { insumoId: 'I2', cuentaContableId: 'CTA' },
    ]).length, 1);
    assert.equal(ovTieneItemsSinCuenta({
      lineas: [{ insumoId: 'I1', descripcion: 'Cereza', cuentaContableId: 'CTA' }],
    }), false);
  });

  it('arma la ruta de edición en ítems', () => {
    assert.equal(pathWizardOvItems('OV-1'), '/comercial/ordenes-venta/nueva?ov=OV-1&paso=2');
  });
});

describe('origen NC/ND', () => {
  it('mapea tipos ERP a TpoDocRef', () => {
    assert.equal(mapTipoDteErp('FACTURA', 'VENTA'), '33');
    assert.equal(mapTipoDteErp('FACTURA', 'EXPORTACION'), '110');
    assert.equal(mapTipoDteErp('NC', 'EXPORTACION'), '112');
    assert.equal(mapTipoDteErp('ND', 'EXPORTACION'), '111');
    assert.equal(mapTipoDteErp('ND', 'VENTA'), '56');
    assert.equal(mapTipoDteErp('GUIA'), '52');
  });

  it('lista solo DTE referenciables no borrador', () => {
    const rows = docsOrigenNcNd([
      { id: '1', tipo: 'FACTURA', estado: 'CONTABILIZADA', folio: 'A', cliente: 'X', fecha: '2026-09-01', neto: 1 } as never,
      { id: '2', tipo: 'ND', estado: 'CONTABILIZADA', folio: 'B', folioOficial: '51', cliente: 'X', fecha: '2026-09-07', neto: 1 } as never,
      { id: '3', tipo: 'FACTURA', estado: 'BORRADOR', folio: 'C', cliente: 'X', fecha: '2026-09-01', neto: 1 } as never,
      { id: '4', tipo: 'ORDEN_VENTA', estado: 'CONFIRMADA', folio: 'D', cliente: 'X', fecha: '2026-09-01', neto: 1 } as never,
    ]);
    assert.equal(rows.length, 2);
    assert.match(labelOrigenNcNd(rows[1]), /ND 56 · 51/);
  });

  it('exige ficha SII en registro manual', () => {
    assert.equal(referenciaManualCompleta({ tipo: '33', folio: '66', fecha: '2026-09-07', codRef: 3 }), true);
    assert.equal(referenciaManualCompleta({ tipo: '33', folio: '66', fecha: '2026-09-07' }), false);
  });
});

describe('anulación Libro NC', () => {
  it('solo factura emitida o contabilizada, no si ya hay NC CodRef 1', () => {
    assert.equal(puedeAnularFacturaLibro({ tipo: 'FACTURA', estado: 'CONTABILIZADA' }), true);
    assert.equal(puedeAnularFacturaLibro({ tipo: 'FACTURA', estado: 'EMITIDO' }), true);
    assert.equal(puedeAnularFacturaLibro({ tipo: 'NC', estado: 'CONTABILIZADA' }), false);
    assert.equal(puedeAnularFacturaLibro({ tipo: 'FACTURA', estado: 'CONTABILIZADA', billingStatus: 'REJECTED' }), false);
    assert.equal(puedeAnularFacturaLibro({ tipo: 'FACTURA', estado: 'CONTABILIZADA' }, { yaAnulada: true }), false);
    assert.equal(puedeCerrarComexLibro({ tipo: 'FACTURA', estado: 'EMITIDO', indicadorVenta: 'EXPORTACION' }), true);
    assert.equal(puedeCerrarComexLibro({ tipo: 'FACTURA', estado: 'EMITIDO', indicadorVenta: 'VENTA' }), false);
    assert.equal(puedeCerrarComexLibro({ tipo: 'FACTURA', estado: 'EMITIDO', indicadorVenta: 'EXPORTACION' }, { yaAnulada: true }), false);
  });

  it('arma texto CodRef 2 y rebaja CodRef 3', () => {
    assert.equal(textoCorreccionNc('99999', '8888'), 'Donde dice 99999 debe decir 8888');
    const seed = seedLineasNcRebaja([
      { descripcion: 'Frambuesa', cantidad: 10, precioUnitario: 1000, total: 10000, tipoLinea: 'PRODUCTO', insumoId: 'I1' },
      { descripcion: 'Frutilla', cantidad: 5, precioUnitario: 1000, total: 5000, tipoLinea: 'PRODUCTO', insumoId: 'I2' },
    ]);
    assert.equal(seed.length, 2);
    seed[0].cantidad = 2;
    seed[0].precioUnitario = 800;
    const out = lineasNcDesdeEdicion(seed);
    assert.equal(out.length, 2);
    assert.equal(out[0].cantidad, 2);
    assert.equal(out[0].precioUnitario, 800);
    assert.equal(out[0].total, 1600);
    assert.equal(ncIgualaOSuperaFactura(15000, 15000), true);
    assert.equal(ncIgualaOSuperaFactura(14999, 15000), false);
  });
});

describe('historial asociación Libro', () => {
  const factura = {
    id: 'FA', tipo: 'FACTURA', estado: 'EMITIDO', folio: 'FA-70', folioOficial: '70',
    cliente: 'X', fecha: '2026-09-01', neto: 100,
  } as never;
  const nc1 = {
    id: 'NC1', tipo: 'NC', estado: 'EMITIDO', folio: 'NC-54', folioOficial: '54',
    cliente: 'X', fecha: '2026-09-02', neto: 0, referenciaFolio: '70', documentoOrigenId: 'FA',
    referenciaCod: 1,
  } as never;
  const nc2 = {
    id: 'NC2', tipo: 'NC', estado: 'EMITIDO', folio: 'NC-55', folioOficial: '55',
    cliente: 'X', fecha: '2026-09-08', neto: 10, referenciaFolio: '70', documentoOrigenId: 'FA',
  } as never;
  const otra = {
    id: 'FA2', tipo: 'FACTURA', estado: 'EMITIDO', folio: 'FA-99', folioOficial: '99',
    cliente: 'X', fecha: '2026-09-01', neto: 1,
  } as never;

  it('junta factura y varias NC del mismo origen', () => {
    const hist = historialDocumentosAsociados(nc1, [factura, nc1, nc2, otra]);
    assert.equal(hist.map((d) => d.id).join(','), 'FA,NC1,NC2');
    assert.equal(etiquetaHistorialAsociacion(nc1, hist), 'NC → factura 70');
    assert.equal(etiquetaHistorialAsociacion(factura, hist), 'Anulada · ver NC 54 · +1');
  });

  it('factura sin correcciones no muestra etiqueta', () => {
    const hist = historialDocumentosAsociados(otra, [factura, nc1, otra]);
    assert.equal(hist.length, 1);
    assert.equal(etiquetaHistorialAsociacion(otra, hist), null);
  });

  it('no mezcla facturas que solo comparten folioOrigen de OV', () => {
    const faA = { ...factura, id: 'A', folioOrigen: 'OV-1' } as never;
    const faB = { ...otra, id: 'B', folioOrigen: 'OV-1' } as never;
    const hist = historialDocumentosAsociados(faA, [faA, faB]);
    assert.equal(hist.map((d) => d.id).join(','), 'A');
  });

  it('no junta 110 y 33 que solo comparten el número de folio SII', () => {
    const fa110 = {
      ...factura, id: 'FA110', folio: 'FA-110-70', folioOficial: '70', indicadorVenta: 'EXPORTACION',
    } as never;
    const nc33 = {
      id: 'NC33', tipo: 'NC', estado: 'EMITIDO', folio: 'NC-54', folioOficial: '54',
      cliente: 'X', fecha: '2026-09-02', neto: 1,
      referenciaFolio: '70', referenciaTipo: '33', documentoOrigenId: 'FA-NAC',
    } as never;
    const hist = historialDocumentosAsociados(fa110, [fa110, nc33]);
    assert.equal(hist.map((d) => d.id).join(','), 'FA110');
    assert.equal(etiquetaHistorialAsociacion(fa110, hist), null);
  });

  it('sí junta NC de exportación por tipo 110 + folio SII', () => {
    const fa110 = {
      ...factura, id: 'FA110', folio: 'FA-110-70', folioOficial: '70', indicadorVenta: 'EXPORTACION',
    } as never;
    const nc112 = {
      id: 'NC112', tipo: 'NC', estado: 'EMITIDO', folio: 'NC-54', folioOficial: '54',
      cliente: 'X', fecha: '2026-09-02', neto: 1, indicadorVenta: 'EXPORTACION',
      referenciaFolio: '70', referenciaTipo: '110',
    } as never;
    const hist = historialDocumentosAsociados(fa110, [fa110, nc112]);
    assert.equal(hist.map((d) => d.id).join(','), 'FA110,NC112');
    assert.equal(etiquetaHistorialAsociacion(fa110, hist), 'NC 54');
  });
});

describe('TC BCCH sugerido', () => {
  it('toma USD y fecha del KPI', () => {
    const sug = tcBcchSugeridoDesdeKpi({ tcUsdHoy: 926.5, tcUsdHoyFecha: '2026-09-10' });
    assert.deepEqual(sug, { fecha: '2026-09-10', valor: 926.5 });
    assert.equal(
      textoHintTcBcchSugerido(sug),
      'tipo de cambio sugerido al día 10/09/2026 a $926,50',
    );
  });

  it('no rellena si el operador ya escribió o el documento trae TC', () => {
    const sug = { fecha: '2026-09-10', valor: 926.5 };
    assert.equal(aplicarTipoCambioSugerido('', sug, false), '926.5');
    assert.equal(aplicarTipoCambioSugerido('926.5', sug, false), null);
    assert.equal(aplicarTipoCambioSugerido('940', sug, true), null);
    assert.equal(aplicarTipoCambioSugerido('940', sug, false), '926.5');
    assert.equal(tcBcchSugeridoDesdeKpi({ tcUsdHoy: 0, tcUsdHoyFecha: '2026-09-10' }), null);
    assert.equal(
      tcBcchSugeridoDesdeKpi({ tcUsdHoy: 926.5, tcCnyHoy: 128.4, tcUsdHoyFecha: '2026-09-10' }, 'CNY')?.valor,
      128.4,
    );
  });
});

describe('puertos Aduana Anexo 51-11', () => {
  it('incluye Filadelfia 135 y Valparaíso 905 (factura MJ)', () => {
    assert.ok(PUERTOS_ADUANA.some((p) => p.codigo === '135' && /FILADELFIA/i.test(p.nombre)));
    assert.ok(PUERTOS_ADUANA.some((p) => p.codigo === '905' && /VALPARAISO/i.test(p.nombre)));
    assert.equal(codigoPuertoAduana('FILADELFIA'), '135');
    assert.equal(codigoPuertoAduana('Philadelphia'), '135');
    assert.equal(codigoPuertoAduana('VALPARAÍSO'), '905');
    assert.equal(codigoPuertoAduana('201'), '905');
    assert.equal(codigoPuertoAduana('2704'), '174');
    assert.ok(PUERTOS_ADUANA.length > 300);
  });
});

describe('saldo NC sobre factura', () => {
  it('resta NCs previas y bloquea anulación al 100%', () => {
    const fac = { id: 'FAC-1', neto: 55500, iva: 10545, total: 66045 };
    const docs = [
      { id: 'NC-1', tipo: 'NC', estado: 'CONTABILIZADA', documentoOrigenId: 'FAC-1', neto: 53700, iva: 10143, total: 63843 },
    ] as never;
    const s = saldoNcSobreFactura(fac, docs);
    assert.equal(Math.round(s.saldo), 2202);
    assert.equal(noPuedeAnularCienPorSaldo(s), true);
  });

  it('NC de texto a $0 no come saldo', () => {
    const fac = { id: 'FAC-1', neto: 1000, iva: 190, total: 1190 };
    const docs = [
      { id: 'NC-2', tipo: 'NC', estado: 'EMITIDO', documentoOrigenId: 'FAC-1', neto: 0, iva: 0, total: 0 },
    ] as never;
    const s = saldoNcSobreFactura(fac, docs);
    assert.equal(s.saldo, 1190);
    assert.equal(noPuedeAnularCienPorSaldo(s), false);
  });
});

describe('detalle DTE opcional', () => {
  it('omite el detalle vacío y recorta a 1000', () => {
    assert.equal(detalleDteOpcional(''), undefined);
    assert.equal(detalleDteOpcional('  '), undefined);
    assert.equal(detalleDteOpcional('Caja 5 kg'), 'Caja 5 kg');
    assert.equal(detalleDteOpcional('x'.repeat(1001))?.length, 1000);
  });

  it('no manda detalle en el payload de OV si está vacío', () => {
    const sin = emitirItemsToOvPayloadLineas([
      { ...emptyEmitirLine(), insumoId: 'I1', descripcion: 'CER · Cereza', detalle: '' },
    ]);
    assert.equal(sin[0].descripcion, 'CER · Cereza');
    assert.equal(sin[0].detalle, undefined);

    const con = emitirItemsToOvPayloadLineas([
      { ...emptyEmitirLine(), insumoId: 'I1', descripcion: 'CER · Cereza', detalle: 'Calibre 28' },
    ]);
    assert.equal(con[0].detalle, 'Calibre 28');
  });

  it('toma el detalle del maestro, no el texto de la línea', () => {
    const insumos = [
      { id: 'I1', codigo: 'CER', familia: 'F', subfamilia: 'S', nombre: 'Cereza', detalle: 'Caja 5 kg', unidad: 'CAJA', stock: 1, costoPromedio: 1 },
    ];
    const filled = aplicarDetalleDesdeInsumo(
      [{ ...emptyEmitirLine(), insumoId: 'I1', descripcion: 'CER · Cereza', detalle: '' }],
      insumos,
    );
    assert.equal(filled[0].detalle, 'Caja 5 kg');
    const fromMaster = aplicarDetalleDesdeInsumo(
      [{ ...emptyEmitirLine(), insumoId: 'I1', descripcion: 'CER · Cereza', detalle: 'Otro' }],
      insumos,
    );
    assert.equal(fromMaster[0].detalle, 'Caja 5 kg');
  });
});
