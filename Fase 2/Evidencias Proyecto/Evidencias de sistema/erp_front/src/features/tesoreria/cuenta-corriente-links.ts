export type MovCcLinkInput = {
  documentoRef?: string;
  documentoTipo?: string;
  origen?: string;
  pagoId?: string;
  facturaId?: string;
  documentoComercialId?: string;
  registroCompraId?: string;
  movimientoCartolaId?: string;
};

export type DocLink = { to: string; label: string };

/** Extrae token útil para búsqueda (p.ej. "Cartola TRX-7781" → "TRX-7781"). */
export function searchToken(ref: string): string {
  const cartola = ref.match(/cartola\s+(.+)/i);
  if (cartola?.[1]) return cartola[1].trim();
  return ref.trim();
}

export function linksDocumento(r: MovCcLinkInput): DocLink[] {
  const ref = r.documentoRef?.trim();
  const tipo = (r.documentoTipo ?? '').toUpperCase();
  const origen = (r.origen ?? '').toUpperCase();
  if (!ref || tipo === 'AJUSTE' || origen === 'AJUSTE' || ref.toUpperCase() === 'AJUSTE') {
    return [];
  }

  const token = searchToken(ref);
  const q = encodeURIComponent(token);
  const links: DocLink[] = [];

  if (r.pagoId) {
    links.push({ to: `/tesoreria/pagos?q=${encodeURIComponent(r.pagoId)}`, label: 'Ver pago' });
  }
  if (r.documentoComercialId) {
    links.push({ to: `/comercial/libro?q=${q}&todos=1`, label: 'Ver factura' });
  }
          if (r.registroCompraId) {
            links.push({ to: `/compras/libro?q=${q}`, label: 'Ver factura' });
  }
  if (r.movimientoCartolaId) {
    links.push({ to: `/tesoreria/cartolas?q=${q}`, label: 'Ver cartola' });
  }
  if (links.length) return links;

  const isOc = tipo === 'OC' || /^OC([-_]|$)/i.test(tipo) || /^OC[-_]?\d/i.test(token);
  const isCartola = /cartola/i.test(ref) || /^TRX[-_]?\w+/i.test(token);
  const isCompraFolio = /^FAC-C[-_]?\w*/i.test(token) || /^FC[-_]?\w*/i.test(token);
  const isPago =
    Boolean(r.pagoId)
    || tipo === 'PAGO'
    || origen === 'PAGO'
    || origen === 'TESORERIA'
    || /^PAG[-_]?\w*/i.test(ref)
    || /^TRF[-_]?\w*/i.test(token)
    || tipo === 'ANTICIPO'
    || origen === 'ANTICIPO'
    || /^ANT[-_]?\w*/i.test(token)
    || isCartola;
  const isVenta =
    !isCompraFolio
    && origen !== 'COMPRA'
    && (
      Boolean(r.facturaId || r.documentoComercialId)
      || origen === 'VENTA'
      || /^(FAC|FACTURA|FA|NC|ND|NP|BOL|FEX|GD)([-_]|$)/i.test(tipo)
      || /^(FAC|FA|NC|ND|NP|BOL|FEX|GD)[-_]?\w*/i.test(ref)
    );
  const isCompra =
    !isOc
    && origen !== 'VENTA'
    && (
      isCompraFolio
      || origen === 'COMPRA'
      || /^(FACT|FC|FACTURA)([-_]|$)/i.test(tipo)
      || /^(FACT|FC)[-_]?\w*/i.test(ref)
    );

  if (isOc) {
    links.push({ to: `/compras/ordenes?q=${q}`, label: 'Ver OC' });
  }
  if (isCartola) {
    links.push({ to: `/tesoreria/cartolas?q=${q}`, label: 'Ver cartola' });
  }
  if (isPago && !isOc) {
    const pagoQ = encodeURIComponent(r.pagoId || token);
    links.push({ to: `/tesoreria/pagos?q=${pagoQ}`, label: 'Ver pago' });
  }
  if (isVenta && !isCartola && !isOc) {
    links.push({ to: `/comercial/libro?q=${q}&todos=1`, label: 'Ver factura' });
  }
  if (isCompra && !isCartola) {
    links.push({ to: `/compras/libro?q=${q}`, label: 'Ver factura' });
  }

  if (links.length === 0) {
    links.push({ to: `/comercial/libro?q=${q}&todos=1`, label: 'Ver documento' });
  }

  return links;
}

export function linkDocumento(r: MovCcLinkInput): DocLink | null {
  const links = linksDocumento(r);
  if (!links.length) return null;
  const primary = links.find((l) => /factura|pago|documento|OC/i.test(l.label)) ?? links[0];
  return { to: primary.to, label: r.documentoRef?.trim() || primary.label };
}
