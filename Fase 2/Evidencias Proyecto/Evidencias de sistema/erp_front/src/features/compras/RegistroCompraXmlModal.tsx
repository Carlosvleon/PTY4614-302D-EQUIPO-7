import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import type { RegistroCompra } from '@/types/domain';
import * as api from '@/services/api';

type Props = {
  registro: RegistroCompra | null;
  onClose: () => void;
};

/** Modal "Ver XML" — muestra el XML (EnvioDTE) formateado del documento GoSocket. */
export function RegistroCompraXmlModal({ registro, onClose }: Props) {
  const [xml, setXml] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!registro) {
      setXml('');
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const result = (await api.getRegistroCompraXml(registro.id)) as { xml: string };
        if (!cancelled) setXml(result.xml);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error && e.message !== 'Operación no disponible'
              ? e.message
              : 'XML aún no disponible en este ambiente',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [registro]);

  const download = () => {
    if (!xml || !registro) return;
    const blob = new Blob([xml], { type: 'application/xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${registro.factura || registro.id}.xml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(xml);
      toast.success('XML copiado al portapapeles');
    } catch {
      toast.error('No se pudo copiar el XML');
    }
  };

  return (
    <Modal
      open={Boolean(registro)}
      onClose={onClose}
      size="xl"
      title={registro ? `XML · Factura ${registro.factura}` : 'XML del documento'}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          <Button variant="outline" onClick={() => void copy()} disabled={!xml}>Copiar</Button>
          <Button onClick={download} disabled={!xml}>Descargar .xml</Button>
        </>
      )}
    >
      {registro?.gosocket?.globalDocumentId && (
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          GlobalDocumentId: <span className="font-mono">{registro.gosocket.globalDocumentId}</span>
        </p>
      )}
      {loading && <p className="text-sm text-[var(--color-muted)]">Cargando XML…</p>}
      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      {!loading && !error && xml && (
        <pre className="max-h-[65vh] overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs leading-relaxed whitespace-pre text-[var(--color-text)]">
          {xml}
        </pre>
      )}
    </Modal>
  );
}
