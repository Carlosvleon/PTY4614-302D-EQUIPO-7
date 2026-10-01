import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { isDemoMode } from '@/lib/appSettings';
import * as api from '@/services/api';
import type { RegistroCompra } from '@/types/domain';

type Props = {
  registro: RegistroCompra | null;
  onClose: () => void;
};

/** Modal "Ver PDF" — estilo DtePdfPreviewModal (iframe con blob). */
export function RegistroCompraPdfModal({ registro, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disponible = Boolean(registro?.gosocket?.pdfDisponible);

  useEffect(() => {
    if (!registro || !disponible) {
      setUrl(null);
      setBlob(null);
      setError(null);
      return;
    }
    let revoked = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { blob: b } = await api.fetchRegistroCompraPdf(registro.id);
        if (revoked) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
      } catch (e) {
        if (!revoked) setError(e instanceof Error ? e.message : 'No se pudo cargar el PDF');
      } finally {
        if (!revoked) setLoading(false);
      }
    })();
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [registro, disponible]);

  const download = () => {
    if (!blob || !registro) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${registro.factura || registro.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const folio = registro?.factura ?? '';

  return (
    <Modal
      open={Boolean(registro)}
      onClose={onClose}
      size="full"
      title={folio ? `PDF · Factura ${folio}` : 'PDF del documento'}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          <Button onClick={download} disabled={!blob}>Descargar PDF</Button>
        </>
      )}
    >
      {!disponible && (
        <p className="text-sm text-[var(--color-muted)]">PDF no disponible para este documento.</p>
      )}
      {disponible && isDemoMode() && (
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          Vista previa de ejemplo (documento real de prueba de GoSocket QA). En modo real se muestra el
          PDF del documento vía GoSocket.
        </p>
      )}
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
