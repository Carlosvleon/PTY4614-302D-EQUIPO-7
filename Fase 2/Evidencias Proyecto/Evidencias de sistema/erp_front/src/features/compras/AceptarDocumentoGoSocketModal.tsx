import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/input';
import { fmtCLP, fmtDate } from '@/lib/utils';
import type { RegistroCompra } from '@/types/domain';

type Props = {
  registro: RegistroCompra | null;
  onClose: () => void;
  onAceptar: (comentario: string) => void;
  onRechazar: (comentario: string) => void;
  saving?: boolean;
};

/**
 * Modal "Aceptar documento" (inspirado en Document/ChangeDocumentStatus de GoSocket).
 * En producción (fase 2) dispara: Acuse de recibo (30) → Recibo de mercadería (32) →
 * Aceptación (33); o Acuse de recibo (30) → Reclamo (31) si se rechaza.
 */
export function AceptarDocumentoGoSocketModal({ registro, onClose, onAceptar, onRechazar, saving }: Props) {
  const [comentario, setComentario] = useState('');
  const [accion, setAccion] = useState<'ACEPTAR' | 'RECHAZAR' | null>(null);

  useEffect(() => {
    setComentario('');
    setAccion(null);
  }, [registro?.id]);

  if (!registro) return null;
  const gs = registro.gosocket;

  return (
    <Modal
      open={Boolean(registro)}
      onClose={onClose}
      size="md"
      title={`Aceptación comercial · Factura ${registro.factura}`}
      footer={(
        <>
          <Button variant="ghost" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button
            variant="danger"
            disabled={saving}
            onClick={() => { setAccion('RECHAZAR'); onRechazar(comentario); }}
          >
            {saving && accion === 'RECHAZAR' ? 'Rechazando…' : 'Rechazar / Reclamar'}
          </Button>
          <Button
            disabled={saving}
            onClick={() => { setAccion('ACEPTAR'); onAceptar(comentario); }}
          >
            {saving && accion === 'ACEPTAR' ? 'Aceptando…' : 'Aceptar documento'}
          </Button>
        </>
      )}
    >
      <div className="space-y-3 text-sm">
        <p className="text-[var(--color-muted)]">
          Esta acción registra la aceptación o el reclamo comercial del documento ante el SII (Ley 19.983)
          vía GoSocket. En producción dispara la secuencia confirmada: Acuse de recibo → Recibo de
          mercadería → Aceptación (o Reclamo, si rechazas).
        </p>
        <dl className="grid grid-cols-2 gap-3 rounded-lg border border-[var(--color-border)] p-3">
          <div>
            <dt className="text-[var(--color-muted)]">Proveedor</dt>
            <dd>{registro.proveedorFactura}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">Monto</dt>
            <dd className="font-mono">{fmtCLP(registro.monto)}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">OC asociada</dt>
            <dd className="font-mono">{registro.ocNumero}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">Sincronizado</dt>
            <dd>{gs?.sincronizadoAt ? fmtDate(gs.sincronizadoAt) : '—'}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[var(--color-muted)]">GlobalDocumentId</dt>
            <dd className="font-mono text-xs break-all">{gs?.globalDocumentId ?? '—'}</dd>
          </div>
        </dl>
        <Field label="Comentario / observación (opcional)">
          <Textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Ej: mercadería recibida conforme, o detalle del reclamo si vas a rechazar."
          />
        </Field>
      </div>
    </Modal>
  );
}
