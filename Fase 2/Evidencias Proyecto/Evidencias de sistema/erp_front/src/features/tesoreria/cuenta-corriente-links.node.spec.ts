import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { linkDocumento, linksDocumento } from './cuenta-corriente-links.ts';

describe('linksDocumento (modo demo / estado de cuenta)', () => {
  it('no trata una OC como factura de libro de compras', () => {
    const links = linksDocumento({
      documentoRef: 'OC-2026-MJ-001',
      documentoTipo: 'OC',
      origen: 'COMPRA',
    });
    assert.deepEqual(links, [{ to: '/compras/ordenes?q=OC-2026-MJ-001', label: 'Ver OC' }]);
  });

  it('abre factura de compra en el libro cuando el folio existe como FAC-C', () => {
    const links = linksDocumento({
      documentoRef: 'FAC-C-8860',
      documentoTipo: 'FACTURA',
      origen: 'COMPRA',
    });
    assert.deepEqual(links, [{ to: '/compras/libro?q=FAC-C-8860', label: 'Ver factura' }]);
  });

  it('abre factura de venta en libro de ventas', () => {
    const links = linksDocumento({
      documentoRef: 'FEX-1973',
      documentoTipo: 'FACTURA',
      origen: 'VENTA',
    });
    assert.equal(links[0]?.to, '/comercial/libro?q=FEX-1973&todos=1');
    assert.equal(links[0]?.label, 'Ver factura');
  });

  it('abre transferencias de tesorería en pagos', () => {
    const links = linksDocumento({
      documentoRef: 'TRF-8842',
      documentoTipo: 'PAGO',
      origen: 'TESORERIA',
    });
    assert.deepEqual(links, [{ to: '/tesoreria/pagos?q=TRF-8842', label: 'Ver pago' }]);
  });

  it('prioriza ids reales sobre heurística de texto', () => {
    const links = linksDocumento({
      documentoRef: 'FAC-C-8860',
      documentoTipo: 'FACTURA',
      origen: 'COMPRA',
      registroCompraId: 'RC-MJ-ALM',
    });
    assert.deepEqual(links, [{ to: '/compras/libro?q=FAC-C-8860', label: 'Ver factura' }]);
  });

  it('el link principal de una OC muestra el folio, no «Ver factura»', () => {
    const primary = linkDocumento({
      documentoRef: 'OC-2026-MJ-001',
      documentoTipo: 'OC',
      origen: 'COMPRA',
    });
    assert.equal(primary?.to, '/compras/ordenes?q=OC-2026-MJ-001');
    assert.equal(primary?.label, 'OC-2026-MJ-001');
  });
});
