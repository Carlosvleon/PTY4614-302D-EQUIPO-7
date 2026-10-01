import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import {
  renderDocumentoHtml,
  subscribeDocumentoPreview,
  type PrintEmpresaDocumentoOpts,
} from '@/lib/documentoPrint';

/** Recibe `printEmpresaDocumento` y lo muestra en modal, sin ventana nueva. */
export function DocumentoPreviewHost() {
  const [opts, setOpts] = useState<PrintEmpresaDocumentoOpts | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => subscribeDocumentoPreview(setOpts), []);

  useEffect(() => {
    if (!opts) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setOpts(null);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [opts]);

  const html = opts ? renderDocumentoHtml(opts) : '';

  return (
    <Modal
      open={Boolean(opts)}
      onClose={() => setOpts(null)}
      size="xl"
      overlayClassName="z-[70]"
      title={opts?.title || 'Vista previa'}
      footer={(
        <>
          <Button variant="ghost" onClick={() => setOpts(null)}>Cerrar</Button>
          <Button
            onClick={() => iframeRef.current?.contentWindow?.print()}
            disabled={!opts}
          >
            Imprimir
          </Button>
        </>
      )}
    >
      {html ? (
        <iframe
          ref={iframeRef}
          title={opts?.title || 'Vista previa del documento'}
          srcDoc={html}
          className="h-[75vh] w-full rounded border border-[var(--color-border)] bg-white"
        />
      ) : null}
    </Modal>
  );
}
