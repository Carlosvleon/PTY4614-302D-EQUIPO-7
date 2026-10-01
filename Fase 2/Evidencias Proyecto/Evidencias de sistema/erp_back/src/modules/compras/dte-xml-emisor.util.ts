export type DteEmisorXml = {
  rut: string | null;
  razonSocial: string | null;
};

/** Emisor del DTE (Encabezado/Emisor o tags sueltas en el XML). */
export function extractEmisorFromDteXml(xml: string): DteEmisorXml {
  if (!xml?.trim()) return { rut: null, razonSocial: null };

  const emisorBlock = /<Emisor\b[^>]*>([\s\S]*?)<\/Emisor>/i.exec(xml)?.[1];
  const scope = emisorBlock ?? xml;

  const rut =
    pickXmlText(scope, 'RUTEmisor')
    ?? pickXmlText(scope, 'IDEmisor')
    ?? pickXmlText(xml, 'RUTEmisor');
  const razonSocial =
    pickXmlText(scope, 'RznSoc')
    ?? pickXmlText(scope, 'RznSocEmisor')
    ?? pickXmlText(scope, 'RznSocial');

  return {
    rut: cleanDteText(rut),
    razonSocial: cleanDteText(razonSocial),
  };
}

function pickXmlText(scope: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>\\s*([^<]+?)\\s*<\\/${tag}>`, 'i');
  const m = re.exec(scope);
  return m?.[1] ?? null;
}

function cleanDteText(value: string | null): string | null {
  if (value == null) return null;
  const t = value.replace(/\s+/g, ' ').trim();
  if (!t || t === '.' || /^\.+$/.test(t)) return null;
  return t;
}

export const GOSOCKET_PROVEEDOR_PLACEHOLDER = 'Proveedor GoSocket';

export function isProveedorFacturaPlaceholder(value: string | null | undefined): boolean {
  const t = (value ?? '').trim();
  return !t || t === GOSOCKET_PROVEEDOR_PLACEHOLDER;
}
