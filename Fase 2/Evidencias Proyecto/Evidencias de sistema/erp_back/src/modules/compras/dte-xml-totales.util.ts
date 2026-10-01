export type DteTotalesXml = {
  montoNeto: number | null;
  montoIva: number | null;
  montoTotal: number | null;
};

/** Totales del DTE (Encabezado/Totales). Soporta tags SII y ExtraInfoTotal (GUF GoSocket). */
export function extractTotalesFromDteXml(xml: string): DteTotalesXml {
  if (!xml?.trim()) {
    return { montoNeto: null, montoIva: null, montoTotal: null };
  }

  const totalesBlock = /<Totales\b[^>]*>([\s\S]*?)<\/Totales>/i.exec(xml)?.[1] ?? xml;

  const montoNeto =
    parseDteAmount(pickXmlElementText(totalesBlock, 'MntNeto'))
    ?? parseDteAmount(pickExtraInfoTotal(xml, 'MntNeto'))
    ?? parseDteAmount(pickExtraInfoTotal(xml, 'ValComNeto'));
  const montoIva =
    parseDteAmount(pickXmlElementText(totalesBlock, 'IVA'))
    ?? parseDteAmount(pickExtraInfoTotal(xml, 'IVA'))
    ?? parseDteAmount(pickExtraInfoTotal(xml, 'ValComIVA'))
    ?? parseDteAmount(pickExtraInfoTotal(xml, 'IVAProp'));
  const montoTotal =
    parseDteAmount(pickXmlElementText(totalesBlock, 'MntTotal'))
    ?? parseDteAmount(pickExtraInfoTotal(xml, 'MntTotal'))
    ?? parseDteAmount(pickExtraInfoTotal(xml, 'MntTotOtrMnda'));

  return { montoNeto, montoIva, montoTotal };
}

/** Monto neto para `RegistroCompra.monto` (columna “Total neto” del libro). */
export function resolveMontoNetoRegistroCompra(
  apiNeto: number | null | undefined,
  apiTotal: number | null | undefined,
  xml: DteTotalesXml,
): number {
  const fromApi = positiveAmount(apiNeto) ?? positiveAmount(apiTotal);
  if (fromApi != null) return fromApi;
  const fromXml = positiveAmount(xml.montoNeto) ?? positiveAmount(xml.montoTotal);
  return fromXml ?? 0;
}

function positiveAmount(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function pickXmlElementText(scope: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>\\s*([^<]+?)\\s*<\\/${tag}>`, 'i');
  return re.exec(scope)?.[1]?.trim() ?? null;
}

function pickExtraInfoTotal(xml: string, name: string): string | null {
  const re = new RegExp(
    `<ExtraInfoTotal\\b[^>]*\\bname=["']${name}["'][^>]*>\\s*([^<]+?)\\s*<\\/ExtraInfoTotal>`,
    'i',
  );
  return re.exec(xml)?.[1]?.trim() ?? null;
}

function parseDteAmount(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const t = raw.replace(/\s+/g, '').replace(/,/g, '').trim();
  if (!t || t === '.' || /^\.+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
