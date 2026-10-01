import { describe, expect, it } from 'vitest';
import {
  PATH_EMITIR_DTE,
  PATH_OV_WIZARD,
  pathEmitirFacturaOv,
  pathEmitirTipoLibre,
  pathCargarBorradorEmision,
  etiquetaTipoDteBorrador,
  pathWizardOv,
  filterOvsMiasFacturables,
  ovEsFacturable,
  labelEstadoOv,
  pathLibroVentas,
  folioSiiDeDocumento,
} from './emitir-ov-helpers';
import type { DocumentoComercial } from '@/types/domain';

describe('rutas de emisión desde OV', () => {
  it('envía el alta sin parámetros al wizard de orden de venta', () => {
    expect(PATH_OV_WIZARD).toBe('/comercial/ordenes-venta/nueva');
    expect(pathWizardOv()).toBe('/comercial/ordenes-venta/nueva');
  });

  it('conserva el id de OV en query string', () => {
    expect(pathWizardOv({ ov: 'OV-2026-001' })).toBe(
      '/comercial/ordenes-venta/nueva?ov=OV-2026-001',
    );
  });

  it('no deja contexto=ov (el modo ya lo define la URL /ordenes-venta/nueva)', () => {
    expect(pathWizardOv({ contexto: 'ov' })).not.toContain('contexto=ov');
    expect(pathWizardOv({ contexto: 'ov', ov: 'x' })).toBe(
      '/comercial/ordenes-venta/nueva?ov=x',
    );
  });

  it('no devuelve la ruta de Emitir DTE', () => {
    expect(PATH_EMITIR_DTE).toBe('/comercial/emitir');
    expect(PATH_OV_WIZARD).not.toBe(PATH_EMITIR_DTE);
    expect(pathWizardOv()).not.toBe('/comercial/emitir');
    expect(pathWizardOv({ ov: 'OV-2026-001' })).not.toContain('/comercial/emitir');
  });

  it('busca el libro por folio SII y tipo DTE, no por correlativo interno', () => {
    expect(pathLibroVentas('60')).toBe('/comercial/libro?q=60');
    expect(pathLibroVentas('52', '112')).toBe('/comercial/libro?q=52&tipo=112');
    expect(pathLibroVentas('52', '999')).toBe('/comercial/libro?q=52');
    expect(pathLibroVentas('', '110')).toBe('/comercial/libro?tipo=110');
    expect(pathLibroVentas('')).toBe('/comercial/libro');
    expect(folioSiiDeDocumento({ folioOficial: '60' })).toBe('60');
    expect(folioSiiDeDocumento({ folioOficial: null })).toBe('');
  });

  it('arma factura-ov con origen y draft opcional', () => {
    expect(pathEmitirFacturaOv('OV-1')).toBe(
      '/comercial/emitir?contexto=factura-ov&origen=OV-1',
    );
    expect(pathEmitirFacturaOv('OV-1', { draft: 'FAC-9' })).toBe(
      '/comercial/emitir?contexto=factura-ov&origen=OV-1&draft=FAC-9',
    );
  });

  it('arma NC/ND/GUIA sin OV', () => {
    expect(pathEmitirTipoLibre('NC')).toBe('/comercial/emitir?tipo=NC');
  });
});

describe('pathCargarBorradorEmision', () => {
  it('factura con origen abre wizard factura-ov con draft', () => {
    expect(pathCargarBorradorEmision({
      id: 'FAC-9',
      tipo: 'FACTURA',
      documentoOrigenId: 'OV-1',
    })).toEqual({
      path: '/comercial/emitir?contexto=factura-ov&origen=OV-1&draft=FAC-9',
    });
  });

  it('NC 112 y guía retoman el wizard de emisión', () => {
    expect(pathCargarBorradorEmision({ id: 'NC-1', tipo: 'NC' })).toEqual({
      path: '/comercial/emitir?draft=NC-1&tipo=NC',
    });
    expect(pathCargarBorradorEmision({ id: 'G-1', tipo: 'GUIA' })).toEqual({
      path: '/comercial/emitir?draft=G-1&tipo=GUIA',
    });
  });

  it('etiqueta distingue 33, 110, 61 y 112', () => {
    expect(etiquetaTipoDteBorrador({ tipo: 'FACTURA', indicadorVenta: 'VENTA' })).toBe('33 · Factura afecta');
    expect(etiquetaTipoDteBorrador({ tipo: 'FACTURA', indicadorVenta: 'EXPORTACION' })).toBe('110 · Factura exportación');
    expect(etiquetaTipoDteBorrador({ tipo: 'NC', indicadorVenta: 'EXPORTACION' })).toBe('112 · Nota de crédito exportación');
    expect(etiquetaTipoDteBorrador({ tipo: 'NC' })).toBe('61 · Nota de crédito');
  });
});

describe('filterOvsMiasFacturables', () => {
  const base = {
    tipo: 'ORDEN_VENTA',
    cliente: 'X',
    fecha: '2026-08-01',
    neto: 1,
    folio: 'OV-1',
  } as DocumentoComercial;

  it('solo OV del usuario en CONFIRMADA/EMITIDO', () => {
    const rows = [
      { ...base, id: '1', estado: 'CONFIRMADA', creadoPorId: 'U-1' },
      { ...base, id: '2', estado: 'EMITIDO', creadoPorId: 'U-1' },
      { ...base, id: '3', estado: 'BORRADOR', creadoPorId: 'U-1' },
      { ...base, id: '4', estado: 'CONFIRMADA', creadoPorId: 'U-2' },
      { ...base, id: '5', tipo: 'FACTURA', estado: 'CONFIRMADA', creadoPorId: 'U-1' },
    ] as DocumentoComercial[];
    expect(filterOvsMiasFacturables(rows, 'U-1').map((d) => d.id)).toEqual(['1', '2']);
    expect(ovEsFacturable('PENDIENTE_APROBACION')).toBe(false);
  });
});

describe('labelEstadoOv', () => {
  it('muestra Confirmada para CONFIRMADA (no APROBADO de Compras)', () => {
    expect(labelEstadoOv('CONFIRMADA')).toBe('Confirmada');
    expect(labelEstadoOv('APROBADO')).toBe('Confirmada');
    expect(labelEstadoOv('EMITIDO')).toBe('Emitida');
    expect(labelEstadoOv('BORRADOR')).toBe('Borrador');
  });
});
