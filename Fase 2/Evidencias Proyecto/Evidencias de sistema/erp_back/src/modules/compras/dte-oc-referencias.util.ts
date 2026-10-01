/** TpoDocRef SII: 801 = Orden de compra (referencia en DTE recibido). */
const TPO_DOC_REF_OC = new Set(['801']);

/**
 * Extrae folios de OC referenciados en el XML del DTE (nodos Referencia / TpoDocRef 801).
 * Sin dependencia XML externa: suficiente para el subset usado en compras GoSocket.
 */
export function extractOcReferenciasFromDteXml(xml: string): string[] {
  if (!xml?.trim()) return [];
  const refs: string[] = [];
  const blockRe = /<Referencia\b[^>]*>([\s\S]*?)<\/Referencia>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(xml)) !== null) {
    const block = match[1];
    const tpo = /<TpoDocRef>\s*([^<]+)\s*<\/TpoDocRef>/i.exec(block)?.[1]?.trim();
    if (!tpo || !TPO_DOC_REF_OC.has(tpo)) continue;
    const num = /<NumeroRef>\s*([^<]+)\s*<\/NumeroRef>/i.exec(block)?.[1]?.trim();
    if (!num || num === '.' || /^\.+$/.test(num)) continue;
    refs.push(num);
  }
  return [...new Set(refs)];
}

export function parseStoredOcReferencias(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean);
}
