import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { LIBRO_COMPRAS_TAB_LABEL, type LibroComprasTab } from './LibroComprasEstadoTabs';

type Props = {
  open: boolean;
  tab: LibroComprasTab;
  rutReceptor?: string;
  razonSocialReceptor?: string;
  onClose: () => void;
  onSync: (desde: string, hasta: string) => void;
  saving?: boolean;
};

function firstDayOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Modal "Sincronizar Documentos {Tab}" — trae del inbox GoSocket un período dado. */
export function SincronizarComprasGoSocketModal({
  open,
  tab,
  rutReceptor,
  razonSocialReceptor,
  onClose,
  onSync,
  saving,
}: Props) {
  const [desde, setDesde] = useState(firstDayOfMonth());
  const [hasta, setHasta] = useState(today());
  const label = LIBRO_COMPRAS_TAB_LABEL[tab];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`Sincronizar documentos ${label.toLowerCase()}`}
      footer={(
        <>
          <Button variant="ghost" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button disabled={saving || !desde || !hasta} onClick={() => onSync(desde, hasta)}>
            {saving ? 'Sincronizando…' : 'Sincronizar'}
          </Button>
        </>
      )}
    >
      <div className="space-y-3 text-sm">
        <p className="text-[var(--color-muted)]">
          Consulta el inbox de GoSocket (Document/GetReceivedDocument) para el período indicado y trae
          {tab === 'TODOS' ? ' los documentos recibidos' : ` los documentos en estado ${label.toLowerCase()}`}
          {' '}por tu empresa.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde">
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </Field>
        </div>
        <Field label="Empresa receptora (informativo)">
          <Input
            value={razonSocialReceptor?.trim() || '—'}
            readOnly
            className="bg-[var(--color-surface-2)]"
          />
        </Field>
        <Field label="RUT receptor">
          <Input value={rutReceptor ?? ''} readOnly className="bg-[var(--color-surface-2)] font-mono" />
        </Field>
        <p className="text-xs text-[var(--color-muted)]">
          GoSocket permite consultar un máximo de ~1 mes por llamada en producción.
        </p>
      </div>
    </Modal>
  );
}
