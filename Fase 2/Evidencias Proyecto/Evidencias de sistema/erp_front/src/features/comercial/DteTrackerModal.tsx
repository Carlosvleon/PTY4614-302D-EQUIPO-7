import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { listQueryKey, useEmpresaScopeId, useQueryScope } from '@/hooks/useQueryScope';
import type { Cliente, DocumentoComercial } from '@/types/domain';
import { EMPTY_ARRAY } from '@/lib/empty';
import * as api from '@/services/api';
import { SMTP_DOCUMENTOS_HABILITADO } from '@/features/comercial/correo-documentos';
import { correoClienteDeLista, pasosTrackerDte, type TrackerTone } from '@/features/comercial/dte-tracker';

type Props = {
  doc: DocumentoComercial | null;
  asociados?: DocumentoComercial[];
  onClose: () => void;
};

const TONE: Record<TrackerTone, string> = {
  ok: 'bg-emerald-600 text-white',
  warn: 'bg-sky-600 text-white',
  error: 'bg-rose-600 text-white',
  muted: 'bg-[var(--color-surface-2)] text-[var(--color-muted)]',
};

export function DteTrackerModal({ doc, asociados = [], onClose }: Props) {
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const clientesQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'clientes'),
    queryFn: api.getClientes,
    enabled: Boolean(doc),
  });
  const clientes = (clientesQ.data ?? EMPTY_ARRAY) as Cliente[];
  const pasos = doc
    ? pasosTrackerDte(doc, {
      clienteEmail: correoClienteDeLista(doc.clienteId, clientes),
      smtpHabilitado: SMTP_DOCUMENTOS_HABILITADO,
      asociados,
    })
    : [];

  return (
    <Modal
      open={Boolean(doc)}
      onClose={onClose}
      size="md"
      title={doc ? `Seguimiento · ${doc.folioOficial || doc.folio}` : 'Seguimiento'}
      footer={<Button variant="ghost" onClick={onClose}>Cerrar</Button>}
    >
      {doc && (
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          {doc.cliente}
          {doc.receptorRut ? ` · ${doc.receptorRut}` : ''}
        </p>
      )}
      <ol className="space-y-3">
        {pasos.map((p, i) => (
          <li key={p.key} className="flex gap-3">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${TONE[p.tone]}`}
            >
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-medium">{p.titulo}</p>
              <p className="text-xs text-[var(--color-muted)]">{p.detalle}</p>
            </div>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
