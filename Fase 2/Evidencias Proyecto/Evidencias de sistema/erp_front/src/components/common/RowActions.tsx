import type { ReactNode } from 'react';
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileDown,
  FileCode,
  Mail,
  Paperclip,
  Pencil,
  Printer,
  Receipt,
  RefreshCw,
  Send,
  Banknote,
  BadgeDollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type RowActionTone = 'default' | 'accent' | 'success' | 'danger' | 'muted';

export type RowActionItem = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: RowActionTone;
  /** Resalta el botón como pill con fondo (pago / primario). */
  filled?: boolean;
};

const toneClass: Record<RowActionTone, string> = {
  default: 'text-[var(--color-text)] hover:bg-[var(--color-surface-2)]',
  accent: 'text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]',
  success: 'text-emerald-400 hover:bg-emerald-500/15',
  danger: 'text-[var(--color-danger)] hover:bg-red-500/10',
  muted: 'text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]',
};

const filledTone: Record<RowActionTone, string> = {
  default: 'bg-[var(--color-surface-2)] text-[var(--color-text)]',
  accent: 'bg-[var(--color-accent)]/20 text-[var(--color-accent)]',
  success: 'bg-emerald-600 text-white hover:bg-emerald-500',
  danger: 'bg-red-500/15 text-[var(--color-danger)]',
  muted: 'bg-[var(--color-surface-2)] text-[var(--color-muted)]',
};

type Props = {
  actions: RowActionItem[];
  className?: string;
  /** Densidad: sm = tablas densas */
  size?: 'sm' | 'md';
};

/**
 * Barra de acciones de fila (ref Sergio Reu5).
 * Outline; grupo al inicio de la columna (bajo el título ACCIONES / icono ojo).
 */
export function RowActions({ actions, className, size = 'sm' }: Props) {
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';

  return (
    <div
      className={cn('flex w-full items-center justify-start gap-0.5', className)}
      onClick={(e) => e.stopPropagation()}
      role="group"
      aria-label="Acciones"
    >
      {actions.map((a) => {
        const tone = a.tone ?? 'default';
        return (
          <button
            key={a.key}
            type="button"
            title={a.label}
            aria-label={a.label}
            disabled={a.disabled}
            onClick={a.onClick}
            className={cn(
              dim,
              'inline-flex shrink-0 items-center justify-center rounded-full border-0 bg-transparent transition-colors',
              'disabled:pointer-events-none disabled:opacity-35',
              a.filled ? filledTone[tone] : toneClass[tone],
            )}
          >
            {a.icon}
          </button>
        );
      })}
    </div>
  );
}

/** Iconos estándar del menú de accesos (ref. 01 + 03). */
export const RowActionIcons = {
  ver: (s = 16) => <Eye size={s} strokeWidth={1.75} />,
  editar: (s = 16) => <Pencil size={s} strokeWidth={1.75} />,
  detalle: (s = 16) => <ClipboardList size={s} strokeWidth={1.75} />,
  facturar: (s = 16) => <Receipt size={s} strokeWidth={1.75} />,
  peso: (s = 16) => <BadgeDollarSign size={s} strokeWidth={1.75} />,
  pago: (s = 16) => <Banknote size={s} strokeWidth={1.75} />,
  imprimir: (s = 16) => <Printer size={s} strokeWidth={1.75} />,
  dtePdf: (s = 16) => <FileDown size={s} strokeWidth={1.75} />,
  dteXml: (s = 16) => <FileCode size={s} strokeWidth={1.75} />,
  dteSync: (s = 16) => <RefreshCw size={s} strokeWidth={1.75} />,
  correo: (s = 16) => <Mail size={s} strokeWidth={1.75} />,
  adjuntar: (s = 16) => <Paperclip size={s} strokeWidth={1.75} />,
  anular: (s = 16) => <Ban size={s} strokeWidth={1.75} />,
  emitir: (s = 16) => <Send size={s} strokeWidth={1.75} />,
  aceptar: (s = 16) => <CheckCircle2 size={s} strokeWidth={1.75} />,
};

type PreviewBarProps = {
  onDownloadPdf?: () => void;
  onPrint?: () => void;
  /** Si se omite, no se muestra el botón Cerrar (el modal ya tiene X). */
  onClose?: () => void;
  className?: string;
};

/**
 * Barra del detalle en modal.
 * Solo renderiza los botones cuyos callbacks se pasan (p.ej. vista previa: solo PDF).
 */
export function DocumentPreviewActions({ onDownloadPdf, onPrint, onClose, className }: PreviewBarProps) {
  if (!onDownloadPdf && !onPrint && !onClose) return null;
  return (
    <div className={cn('mb-3 flex flex-wrap items-center justify-end gap-2', className)}>
      {onDownloadPdf && (
        <button
          type="button"
          onClick={onDownloadPdf}
          title="Descargar PDF"
          className="rounded-full bg-emerald-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
        >
          PDF
        </button>
      )}
      {onPrint && (
        <button
          type="button"
          onClick={onPrint}
          title="Imprimir"
          className="rounded-full bg-[var(--color-accent)] px-3.5 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          Imprimir
        </button>
      )}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          title="Cerrar"
          className="rounded-full bg-[var(--color-surface-2)] px-3.5 py-1.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)]"
        >
          Cerrar
        </button>
      )}
    </div>
  );
}
