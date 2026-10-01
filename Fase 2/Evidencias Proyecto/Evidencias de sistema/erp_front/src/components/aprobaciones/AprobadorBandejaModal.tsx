import { Link } from 'react-router-dom';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import type { AprobadorSinBandejaItem } from '@/lib/bandejaAprobacion';
import { puedeEditarUsuarios } from '@/lib/bandejaAprobacion';
import type { SessionUser } from '@/types/domain';

type Props = {
  open: boolean;
  onClose: () => void;
  invalidos: AprobadorSinBandejaItem[];
  user: SessionUser | null;
  titulo?: string;
};

export function AprobadorBandejaModal({
  open,
  onClose,
  invalidos,
  user,
  titulo = 'Aprobador sin acceso a la bandeja',
}: Props) {
  const esAdmin = puedeEditarUsuarios(user);

  return (
    <Modal open={open} onClose={onClose} title={titulo} size="md">
      <div className="space-y-4 text-sm">
        <p className="text-[var(--color-muted)]">
          Para poder aprobar o rechazar solicitudes, el usuario debe tener en su rol la pantalla
          {' '}
          <strong>Compras → Aprobaciones</strong>
          {' '}
          con lectura y escritura.
        </p>
        <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-[var(--color-border)] p-3">
          {invalidos.map((item) => (
            <li key={item.usuarioId} className="space-y-1">
              <div className="font-medium">{item.nombre}</div>
              <div className="text-xs text-[var(--color-muted)]">
                Rol: {item.rolNombre} · Falta: {item.pantallaRequerida}
              </div>
            </li>
          ))}
        </ul>
        {esAdmin ? (
          <div className="flex flex-wrap gap-2">
            {invalidos.map((item) => (
              <Link
                key={item.usuarioId}
                to={`/admin/usuarios?edit=${encodeURIComponent(item.usuarioId)}`}
                onClick={onClose}
                className="inline-flex h-8 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-medium hover:bg-[var(--color-surface-2)]"
              >
                Ir a editar {item.nombre.split(' ')[0]}
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-md bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-200">
            Como administrador de concepto no puede editar usuarios. Solicite al administrador del
            sistema que actualice el rol con los permisos indicados.
          </p>
        )}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Entendido
          </Button>
        </div>
      </div>
    </Modal>
  );
}
