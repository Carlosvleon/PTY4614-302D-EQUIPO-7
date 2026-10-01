import { Badge } from '@/components/ui/badge';
import type { EstadoDocumento, EstadoAsiento, EstadoGenerico } from '@/types/domain';

export function EstadoGenericoBadge({ estado }: { estado?: EstadoGenerico | null }) {
  const map: Record<EstadoGenerico, 'success' | 'warning' | 'info' | 'muted'> = {
    ACTIVO: 'success', INACTIVO: 'muted', PENDIENTE: 'warning', BORRADOR: 'info',
  };
  if (!estado) return <Badge tone="muted">—</Badge>;
  return <Badge tone={map[estado] ?? 'muted'}>{String(estado).replace('_', ' ')}</Badge>;
}

export function EstadoDocumentoBadge({
  estado,
  label,
  onClick,
  toneOverride,
}: {
  estado: EstadoDocumento;
  /** Texto visible; si se omite, se usa el mapa genérico o el código. */
  label?: string;
  onClick?: () => void;
  /** Fuerza tono (p. ej. «Por contabilizar» gris si no aplica). */
  toneOverride?: 'success' | 'warning' | 'info' | 'muted' | 'danger' | 'accent';
}) {
  const labels: Partial<Record<EstadoDocumento, string>> = {
    PENDIENTE_APROBACION: 'Pendiente aprobación',
    AUTORIZADA: 'Autorizada',
    CONFIRMADA: 'Confirmada',
  };
  const map: Record<EstadoDocumento, 'success' | 'warning' | 'info' | 'muted' | 'danger' | 'accent'> = {
    BORRADOR: 'muted',
    PENDIENTE_APROBACION: 'warning',
    AUTORIZADA: 'info',
    EMITIDO: 'info',
    APROBADO: 'accent',
    CONFIRMADA: 'accent',
    FACTURADO: 'success',
    ANULADO: 'danger',
    VENCIDO: 'warning',
    RECHAZADO: 'danger',
    CONTABILIZADA: 'success',
    RECEPCIONADA: 'info',
  };
  const text = label ?? labels[estado] ?? estado;
  const tone = toneOverride ?? map[estado] ?? 'muted';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="shrink-0 rounded-full text-left">
        <Badge tone={tone} className="cursor-pointer whitespace-nowrap underline decoration-dotted">
          {text}
        </Badge>
      </button>
    );
  }
  return <Badge tone={tone} className="whitespace-nowrap">{text}</Badge>;
}

export function EstadoAsientoBadge({ estado }: { estado: EstadoAsiento }) {
  const map: Record<EstadoAsiento, 'success' | 'warning' | 'info' | 'muted'> = {
    BORRADOR: 'warning', CONTABILIZADO: 'success', ANULADO: 'muted',
  };
  const label: Record<EstadoAsiento, string> = {
    BORRADOR: 'Pendiente', CONTABILIZADO: 'Contabilizado', ANULADO: 'Anulado',
  };
  return <Badge tone={map[estado]}>{label[estado]}</Badge>;
}

export function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
        <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${v}%` }} />
      </div>
      <span className="text-xs tabular-nums text-[var(--color-muted)]">{Math.round(v)}%</span>
    </div>
  );
}
