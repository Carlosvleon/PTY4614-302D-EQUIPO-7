import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/input';

export type PendienteImpactoItem = {
  id: string;
  tipo: 'OC' | 'PROFORMA';
  documentoId: string;
  identificador: string;
  solicitante: string;
  monto: number;
  detalle?: string | null;
};

type UsuarioOpt = { id: string; nombre: string };

export function PendientesImpactoModal({
  open,
  onClose,
  onConfirm,
  items,
  usuarios,
  sugeridoAprobadorId,
  titulo = 'Reasignar pendientes',
  confirmLabel = 'Continuar',
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (nuevoAprobadorId: string) => void | Promise<void>;
  items: PendienteImpactoItem[];
  usuarios: UsuarioOpt[];
  sugeridoAprobadorId?: string | null;
  titulo?: string;
  confirmLabel?: string;
  busy?: boolean;
}) {
  const [destinoId, setDestinoId] = useState('');

  useEffect(() => {
    if (!open) return;
    const sug = sugeridoAprobadorId?.trim() || '';
    if (sug && usuarios.some((u) => u.id === sug)) {
      setDestinoId(sug);
    } else {
      setDestinoId('');
    }
  }, [open, sugeridoAprobadorId, usuarios]);

  const canConfirm = Boolean(destinoId) && !busy;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titulo}
      size="lg"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button
            disabled={!canConfirm}
            onClick={() => {
              if (!destinoId) return;
              void onConfirm(destinoId);
            }}
          >
            {busy ? 'Procesando…' : confirmLabel}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-muted)]">
          Hay <strong className="text-[var(--color-text)]">{items.length}</strong> documento(s) pendiente(s)
          asignados a este aprobador. Elija el destino de reasignación. El historial ya resuelto no se modifica.
        </p>
        <Field label="Nuevo aprobador">
          <Select value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
            <option value="">— Seleccionar —</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </Select>
        </Field>
        <div className="max-h-56 overflow-auto rounded-md border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-2)] text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Documento</th>
                <th className="px-3 py-2 font-medium">Solicitante</th>
                <th className="px-3 py-2 font-medium text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={`${it.tipo}-${it.id}`} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">{it.tipo}</td>
                  <td className="px-3 py-2">{it.identificador}</td>
                  <td className="px-3 py-2">{it.solicitante}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {it.monto.toLocaleString('es-CL')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
