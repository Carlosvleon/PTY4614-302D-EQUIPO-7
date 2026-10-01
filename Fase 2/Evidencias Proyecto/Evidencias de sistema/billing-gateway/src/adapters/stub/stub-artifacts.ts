import type { CanonicalDocumentV1 } from '../../common/types';
import { STUB_DISCLAIMER } from '../../common/types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** XML dummy para QA: mismo shape de descarga que un partner, contenido no fiscal. */
export function buildStubXml(doc: CanonicalDocumentV1, folioSimulado: string, emissionId: string): string {
  const lineas = doc.lineas
    .map(
      (l) => `    <Linea nro="${l.nro}">
      <Descripcion>${esc(l.descripcion)}</Descripcion>
      <Cantidad>${l.cantidad}</Cantidad>
      <Precio>${l.precio}</Precio>
      <MontoNeto>${l.montoNeto}</MontoNeto>
    </Linea>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ${STUB_DISCLAIMER} -->
<StubDte xmlns="urn:billing-gateway:stub:v1" ambiente="QA-PREVIEW" timbreSii="false">
  <Meta>
    <EmissionId>${esc(emissionId)}</EmissionId>
    <FolioSimulado>${esc(folioSimulado)}</FolioSimulado>
    <ErpId>${esc(doc.source.erpId)}</ErpId>
    <EmpresaId>${esc(doc.source.empresaId)}</EmpresaId>
    <DocumentoId>${esc(doc.source.documentoId)}</DocumentoId>
    <Disclaimer>${esc(STUB_DISCLAIMER)}</Disclaimer>
  </Meta>
  <Emisor>
    <Rut>${esc(doc.emisor.rut)}</Rut>
    <RazonSocial>${esc(doc.emisor.razonSocial)}</RazonSocial>
  </Emisor>
  <Receptor>
    <Rut>${esc(doc.receptor.rut)}</Rut>
    <RazonSocial>${esc(doc.receptor.razonSocial)}</RazonSocial>
  </Receptor>
  <Documento>
    <TipoDte>${doc.documento.tipoDte}</TipoDte>
    <FechaEmision>${esc(doc.documento.fechaEmision)}</FechaEmision>
    <NumeroInterno>${esc(doc.documento.numeroInterno)}</NumeroInterno>
    <Moneda>${esc(doc.documento.moneda || 'CLP')}</Moneda>
  </Documento>
  <Totales>
    <Neto>${doc.totales.neto}</Neto>
    <Iva>${doc.totales.iva}</Iva>
    <Total>${doc.totales.total}</Total>
  </Totales>
  <Detalle>
${lineas}
  </Detalle>
</StubDte>
`;
}

/**
 * PDF mínimo (texto) marcado STUB — suficiente para probar descarga de artefacto
 * en preview/QA multi-ERP. No es representación gráfica SII.
 */
export function buildStubPdf(doc: CanonicalDocumentV1, folioSimulado: string, emissionId: string): Buffer {
  const lines = [
    'DOCUMENTO DUMMY — QA / PREVIEW',
    STUB_DISCLAIMER,
    '',
    `EmissionId: ${emissionId}`,
    `Folio simulado: ${folioSimulado}`,
    `ERP: ${doc.source.erpId} / ${doc.source.empresaId}`,
    `TipoDTE: ${doc.documento.tipoDte}  Fecha: ${doc.documento.fechaEmision}`,
    `Emisor: ${doc.emisor.razonSocial} (${doc.emisor.rut})`,
    `Receptor: ${doc.receptor.razonSocial} (${doc.receptor.rut})`,
    `Total: ${doc.totales.total} ${doc.documento.moneda || ''}`,
    '',
    'Timbre SII: NO  |  Ambiente: stub',
  ];

  const contentLines = lines.map((t, i) => {
    const y = 800 - i * 18;
    const safe = t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    return `BT /F1 10 Tf 40 ${y} Td (${safe}) Tj ET`;
  });
  const stream = contentLines.join('\n');
  const streamLen = Buffer.byteLength(stream, 'utf8');

  const objects: string[] = [];
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n');
  objects.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n',
  );
  objects.push(`4 0 obj<< /Length ${streamLen} >>stream\n${stream}\nendstream\nendobj\n`);
  objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n');

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}
