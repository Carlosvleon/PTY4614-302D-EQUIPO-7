export type LogicaAprobacion = 'SIMPLE' | 'AND' | 'OR';

/** Cantidad de aprobadores de un nodo (principal + extras, o lista aprobadores). */
export function countAprobadores(nodo: {
  logica?: LogicaAprobacion | string | null;
  usuarioId?: string;
  aprobadores?: Array<{ usuarioId: string }>;
}): number {
  if (nodo.aprobadores?.length) return nodo.aprobadores.length;
  return nodo.usuarioId ? 1 : 0;
}

/** Lista ordenada de firmantes del nodo (principal primero si no hay `aprobadores`). */
export function listAprobadores(nodo: {
  usuarioId?: string;
  usuarioNombre?: string | null;
  aprobadores?: Array<{ usuarioId: string; usuarioNombre?: string | null; orden?: number | null }>;
}): Array<{ usuarioId: string; nombre: string }> {
  if (nodo.aprobadores?.length) {
    return [...nodo.aprobadores]
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      .map((a) => ({
        usuarioId: a.usuarioId,
        nombre: a.usuarioNombre?.trim() || a.usuarioId,
      }));
  }
  if (!nodo.usuarioId) return [];
  return [{ usuarioId: nodo.usuarioId, nombre: nodo.usuarioNombre?.trim() || nodo.usuarioId }];
}

/** true si el nodo es multi-firma (AND/OR con ≥2). */
export function isGrupoMultiFirma(nodo: {
  logica?: LogicaAprobacion | string | null;
  usuarioId?: string;
  aprobadores?: Array<{ usuarioId: string }>;
}): boolean {
  return (nodo.logica === 'AND' || nodo.logica === 'OR') && countAprobadores(nodo) > 1;
}

/** Separador visual entre firmantes: «(and)» / «(or)». */
export function logicaJoinLabel(logica?: LogicaAprobacion | string | null): string | null {
  if (logica === 'AND') return '(and)';
  if (logica === 'OR') return '(or)';
  return null;
}

/** Badge: OR → «GRUPO X»; AND → «AND · X»; SIMPLE → null. */
export function logicaBadgeLabel(
  logica?: LogicaAprobacion | string | null,
  count = 1,
): string | null {
  if (!logica || logica === 'SIMPLE') return null;
  if (logica === 'OR') return `GRUPO ${count}`;
  if (logica === 'AND') return `AND · ${count}`;
  return null;
}

type StyleSet = {
  /** Contenedor / tarjeta */
  card: string;
  cardSelected: string;
  /** Texto principal */
  text: string;
  /** Badge */
  badge: string;
  badgeOnSelected: string;
  /** Botón tipo en modal (no seleccionado / seleccionado) */
  tipoBtn: string;
  tipoBtnSelected: string;
};

const STYLES: Record<LogicaAprobacion, StyleSet> = {
  SIMPLE: {
    card: 'border-violet-500/30 bg-violet-500/10 hover:border-violet-500/50 hover:bg-violet-500/15',
    cardSelected: 'border-violet-500/60 bg-violet-600/15 ring-1 ring-violet-400/30',
    text: 'text-violet-900 dark:text-violet-100',
    badge: 'bg-violet-600/20 text-violet-700 dark:text-violet-300',
    badgeOnSelected: 'bg-white/20 text-white',
    tipoBtn: 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]',
    tipoBtnSelected: 'border-violet-500/50 bg-violet-500/15 text-violet-900 dark:text-violet-100',
  },
  AND: {
    card: 'border-amber-500/35 bg-amber-500/10 hover:border-amber-500/55 hover:bg-amber-500/15',
    cardSelected: 'border-amber-500/70 bg-amber-500/20 ring-1 ring-amber-400/40',
    text: 'text-amber-950 dark:text-amber-100',
    badge: 'bg-amber-600/20 text-amber-800 dark:text-amber-200',
    badgeOnSelected: 'bg-white/20 text-white',
    tipoBtn: 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]',
    tipoBtnSelected: 'border-amber-500/50 bg-amber-500/15 text-amber-950 dark:text-amber-100',
  },
  OR: {
    card: 'border-emerald-500/35 bg-emerald-500/10 hover:border-emerald-500/55 hover:bg-emerald-500/15',
    cardSelected: 'border-emerald-500/70 bg-emerald-500/20 ring-1 ring-emerald-400/40',
    text: 'text-emerald-950 dark:text-emerald-100',
    badge: 'bg-emerald-600/20 text-emerald-800 dark:text-emerald-200',
    badgeOnSelected: 'bg-white/20 text-white',
    tipoBtn: 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]',
    tipoBtnSelected: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100',
  },
};

export function logicaStyles(logica?: LogicaAprobacion | string | null): StyleSet {
  if (logica === 'AND' || logica === 'OR') return STYLES[logica];
  return STYLES.SIMPLE;
}

/** Clases compactas para chip/botón de nodo en el árbol. */
export function logicaChipClasses(
  logica: LogicaAprobacion | string | null | undefined,
  selected: boolean,
): string {
  if (selected) {
    if (logica === 'AND') return 'bg-amber-600 text-white hover:ring-amber-400/50';
    if (logica === 'OR') return 'bg-emerald-600 text-white hover:ring-emerald-400/50';
    return 'bg-violet-600 text-white hover:ring-violet-400/50';
  }
  if (logica === 'AND') {
    return 'bg-amber-500/15 text-amber-950 dark:text-amber-100 hover:ring-amber-400/50';
  }
  if (logica === 'OR') {
    return 'bg-emerald-500/15 text-emerald-950 dark:text-emerald-100 hover:ring-emerald-400/50';
  }
  return 'bg-violet-500/15 text-violet-900 dark:text-violet-100 hover:ring-violet-400/50';
}
