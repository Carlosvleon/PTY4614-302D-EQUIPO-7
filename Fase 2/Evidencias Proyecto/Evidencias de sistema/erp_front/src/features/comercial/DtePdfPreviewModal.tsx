import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { DocumentoComercial } from '@/types/domain';
import * as api from '@/services/api';

type Props = {
  doc: DocumentoComercial | null;
  onClose: () => void;
};

export function DtePdfPreviewModal({ doc, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState('dte.pdf');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!doc?.id || !doc.billingEmissionId || doc.billingStub) {
      setUrl(null);
      setBlob(null);
      setError(doc && (!doc.billingEmissionId || doc.billingStub)
        ? 'Este documento no tiene PDF del facturador.'
        : null);
      return;
    }
    let revoked = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const result = await api.fetchDocumentoDteBlob(doc.id, 'pdf');
        if (revoked) return;
        objectUrl = URL.createObjectURL(result.blob);
        setBlob(result.blob);
        setFilename(result.filename);
        setUrl(objectUrl);
        if (result.dummy) toast.message('PDF de preview (stub). No es timbre SII.');
      } catch (e) {
        if (revoked) return;
        const err = e as Error;
        setError(err.message || 'No se pudo cargar el PDF');
      } finally {
        if (!revoked) setLoading(false);
      }
    })();
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc]);

  const download = () => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const folio = doc?.folioOficial || doc?.folio || '';

  return (
    <Modal
      open={Boolean(doc)}
      onClose={onClose}
      size="full"
      title={folio ? `Factura ${folio}` : 'PDF del facturador'}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          <Button onClick={download} disabled={!blob}>Descargar PDF</Button>
        </>
      )}
    >
      {loading && <p className="text-sm text-[var(--color-muted)]">Cargando PDF…</p>}
      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      {url && (
        <iframe
          title={`PDF ${folio}`}
          src={url}
          className="h-[75vh] w-full rounded border border-[var(--color-border)] bg-white"
        />
      )}
    </Modal>
  );
}
