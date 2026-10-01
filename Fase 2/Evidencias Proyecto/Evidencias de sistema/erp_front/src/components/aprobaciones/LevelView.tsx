import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, GitBranch, Plus, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GrupoAprobacion, NodoEscalaAprobacion } from '@/types/domain';
import {
  isGrupoMultiFirma,
  listAprobadores,
  logicaChipClasses,
  logicaJoinLabel,
  logicaStyles,
} from './logicaStyles';

// ─── helpers ───────────────────────────────────────────────────────────────

function fmtCount(n: number) {
  return n > 999 ? '999+' : String(n);
}

function fmtMonto(v: number | null | undefined) {
  if (v == null) return 'sin tope';
  return `≤ ${new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(v)}`;
}

// ─── chain builder ──────────────────────────────────────────────────────────

type ChainLevel = { nodo: NodoEscalaAprobacion };

function buildChain(
  grupo: GrupoAprobacion,
  nodosByUser: Map<string, NodoEscalaAprobacion>,
): ChainLevel[] {
  const levels: ChainLevel[] = [];
  const visited = new Set<string>();
  let current: string | null = grupo.aprobadorInicialId;

  while (current && !visited.has(current)) {
    visited.add(current);
    const nodo = nodosByUser.get(current);
    if (!nodo) break;
    levels.push({ nodo });
    current = nodo.escalaAUsuarioId ?? null;
  }
  return levels;
}

// ─── IntegrantesCell ────────────────────────────────────────────────────────

function IntegrantesCell({
  grupo,
  highlighted,
  highlightUsuarioId,
}: {
  grupo: GrupoAprobacion;
  highlighted?: boolean;
  highlightUsuarioId?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const miembros = grupo.miembros?.length
    ? grupo.miembros
    : (grupo.miembroIds ?? []).map((id) => ({ id, nombre: id }));
  const count = miembros.length;

  return (
    <div
      className={cn(
        'rounded-lg border p-2',
        highlighted
          ? 'border-sky-400/70 bg-sky-500/20 ring-2 ring-sky-400/50'
          : 'border-sky-500/30 bg-sky-500/10',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <Users size={13} className="shrink-0 text-sky-600 dark:text-sky-400" />
        <span className="text-sm font-semibold text-sky-900 dark:text-sky-100">
          Integrantes {fmtCount(count)}
        </span>
        {count > 0 && (
          <ChevronDown
            size={12}
            aria-hidden
            className={cn(
              'ml-auto shrink-0 text-sky-600 transition-transform dark:text-sky-400',
              expanded && 'rotate-180',
            )}
          />
        )}
      </button>

      {expanded && count > 0 && (
        <ul className="mt-2 space-y-1 border-t border-sky-500/20 pt-2">
          {miembros.map((m) => {
            const isHit = !!highlightUsuarioId && m.id === highlightUsuarioId;
            return (
              <li
                key={m.id}
                className={cn(
                  'flex items-center gap-1.5 text-xs',
                  isHit
                    ? 'rounded bg-sky-400/25 px-1 font-semibold text-sky-950 dark:text-sky-50'
                    : 'text-sky-800 dark:text-sky-200',
                )}
              >
                <User size={10} className="shrink-0" aria-hidden />
                {m.nombre}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── NodoCell ───────────────────────────────────────────────────────────────

function NodoCell({
  nodo,
  selected,
  highlighted,
  isFinal,
  onEdit,
  onDelete,
}: {
  nodo: NodoEscalaAprobacion;
  selected: boolean;
  highlighted?: boolean;
  isFinal?: boolean;
  onEdit?: (n: NodoEscalaAprobacion) => void;
  onDelete?: (n: NodoEscalaAprobacion) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const styles = logicaStyles(nodo.logica);
  const firmantes = listAprobadores(nodo);
  const multi = isGrupoMultiFirma(nodo);
  const join = logicaJoinLabel(nodo.logica);
  const chipClass = logicaChipClasses(nodo.logica, selected);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div
      ref={ref}
      className={cn(
        'relative rounded-lg border p-2 transition-all',
        multi
          ? 'border-transparent bg-transparent'
          : selected
            ? styles.cardSelected
            : styles.card,
        !multi && highlighted && 'ring-2 ring-sky-400/60',
      )}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setMenuOpen((v) => !v)}
      >
        {multi ? (
          <div
            className="flex flex-col items-start gap-1"
            aria-label={firmantes.map((f) => f.nombre).join(` ${join ?? ''} `)}
          >
            {firmantes.map((f, i) => (
              <div key={f.usuarioId} className="flex flex-col items-start gap-1">
                {i > 0 && join && (
                  <span className="px-1.5 text-[10px] font-semibold lowercase tracking-wide text-[var(--color-muted)]">
                    {join}
                  </span>
                )}
                <span
                  className={cn(
                    'inline-flex items-center rounded-md border px-2 py-0.5 text-sm font-medium',
                    chipClass,
                    selected
                      ? 'border-transparent'
                      : nodo.logica === 'AND'
                        ? 'border-amber-500/45'
                        : 'border-emerald-500/45',
                    highlighted && 'ring-2 ring-sky-400/60',
                  )}
                >
                  {f.nombre}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className={cn('text-sm font-medium leading-tight', styles.text)}>
            {firmantes[0]?.nombre ?? nodo.usuarioNombre ?? nodo.usuarioId}
          </p>
        )}
        <p className="mt-0.5 text-[10px] text-[var(--color-muted)]">
          {fmtMonto(nodo.montoMax)}
          {isFinal ? ' · final' : ''}
        </p>
      </button>

      {menuOpen && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[9rem] overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
          {onEdit && (
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)]"
              onClick={() => { setMenuOpen(false); onEdit(nodo); }}
            >
              Editar
            </button>
          )}
          {onDelete && !isFinal && (
            <button
              type="button"
              className="flex w-full px-3 py-1.5 text-sm text-red-600 hover:bg-red-500/10"
              onClick={() => { setMenuOpen(false); onDelete(nodo); }}
            >
              Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── GutterAdd ──────────────────────────────────────────────────────────────

/** Conector entre niveles: una sola línea vertical; el + aparece al hover. */
function GutterAdd({
  onClick,
  label,
  alwaysVisible,
}: {
  onClick: () => void;
  label: string;
  alwaysVisible?: boolean;
}) {
  return (
    <div className="group relative flex h-full w-full items-center justify-center">
      <div className="h-full w-px bg-[var(--color-border)] transition-colors group-hover:bg-violet-400/60" />
      <button
        type="button"
        title={label}
        onClick={onClick}
        className={cn(
          'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
          'flex h-6 w-6 items-center justify-center rounded-full',
          'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] shadow-sm',
          'transition-opacity hover:border-violet-500/50 hover:text-violet-600',
          alwaysVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        <Plus size={12} aria-hidden />
      </button>
    </div>
  );
}

function GutterLine() {
  return (
    <div className="relative flex h-full w-full items-center justify-center" aria-hidden>
      <div className="h-full w-px bg-[var(--color-border)]" />
    </div>
  );
}

// ─── LevelView ──────────────────────────────────────────────────────────────

function grupoTieneUsuario(grupo: GrupoAprobacion, userId: string) {
  if (grupo.aprobadorInicialId === userId) return true;
  if ((grupo.miembroIds ?? []).includes(userId)) return true;
  if ((grupo.miembros ?? []).some((m) => m.id === userId)) return true;
  return false;
}

function nodoTieneUsuario(nodo: NodoEscalaAprobacion, userId: string) {
  if (nodo.usuarioId === userId) return true;
  return (nodo.aprobadores ?? []).some((a) => a.usuarioId === userId);
}

export type LevelViewProps = {
  grupos: GrupoAprobacion[];
  nodos: NodoEscalaAprobacion[];
  modulo: string;
  selectedNodoId?: string | null;
  selectedGrupoId?: string | null;
  /** Usuario a resaltar (filtro avanzado). */
  highlightUsuarioId?: string | null;
  onEditNodo?: (nodo: NodoEscalaAprobacion) => void;
  onEditGrupo?: (grupo: GrupoAprobacion) => void;
  onAddEscalaFromGrupo?: (grupo: GrupoAprobacion) => void;
  onDeleteNodo?: (nodo: NodoEscalaAprobacion) => void;
  onAddBetweenNodos?: (grupo: GrupoAprobacion, afterUsuarioId: string, nextUsuarioId: string | null) => void;
};

export function LevelView({
  grupos,
  nodos,
  modulo,
  selectedNodoId,
  selectedGrupoId,
  highlightUsuarioId,
  onEditNodo,
  onEditGrupo,
  onAddEscalaFromGrupo,
  onDeleteNodo,
  onAddBetweenNodos,
}: LevelViewProps) {
  const filteredGrupos = useMemo(
    () => grupos.filter((g) => g.modulo === modulo && g.activo),
    [grupos, modulo],
  );

  const filteredNodos = useMemo(
    () => nodos.filter((n) => n.modulo === modulo && n.activo),
    [nodos, modulo],
  );

  const chains = useMemo(() => {
    return filteredGrupos.map((grupo) => {
      const byUser = new Map(
        filteredNodos.filter((n) => n.grupoId === grupo.id).map((n) => [n.usuarioId, n]),
      );
      return { grupo, levels: buildChain(grupo, byUser) };
    });
  }, [filteredGrupos, filteredNodos]);

  const maxLevels = useMemo(
    () => chains.reduce((acc, c) => Math.max(acc, c.levels.length), 0),
    [chains],
  );
  // Sin niveles no había columnas ni «+»: la grilla se quedaba solo en Integrantes.
  const colLevels = Math.max(maxLevels, 1);

  if (!filteredGrupos.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-[var(--color-border)]">
        <p className="text-sm text-[var(--color-muted)]">
          Sin grupos configurados para {modulo}. Cree grupos desde el panel de configuración.
        </p>
      </div>
    );
  }

  // Column widths: Integrantes=208px, gutter=20px, level=200px each
  const colTemplate = `208px ${Array.from({ length: colLevels }, () => '20px 200px').join(' ')}`;
  // Solo border-b (sin shadow): el shadow de 1px duplicaba la línea bajo el header sticky.
  const headerCellClass =
    'sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]';

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Un solo contenedor de scroll: sticky vertical + scroll horizontal juntos */}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div
          className="inline-grid min-w-full"
          style={{ gridTemplateColumns: colTemplate }}
          role="table"
          aria-label={`Niveles de aprobación · ${modulo}`}
        >
          {/* ── Header sticky (sin border-r: la separación vertical la dan los gutters) ── */}
          <div
            role="columnheader"
            className={cn(
              headerCellClass,
              'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]',
            )}
          >
            Integrantes
          </div>
          {Array.from({ length: colLevels }, (_, i) => (
            <React.Fragment key={`hdr-${i}`}>
              <div className={headerCellClass} aria-hidden />
              <div
                role="columnheader"
                className={cn(
                  headerCellClass,
                  'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]',
                )}
              >
                Nivel {i + 1}
              </div>
            </React.Fragment>
          ))}

          {/* ── Data rows ── */}
          {chains.map(({ grupo, levels }) => {
          const hitMiembro = !!highlightUsuarioId && grupoTieneUsuario(grupo, highlightUsuarioId);
          const hitNodo = !!highlightUsuarioId && levels.some((l) => nodoTieneUsuario(l.nodo, highlightUsuarioId));
          const rowHit = hitMiembro || hitNodo;
          const dimRow = !!highlightUsuarioId && !rowHit;

          return (
            <React.Fragment key={grupo.id}>
              <div
                role="cell"
                className={cn(
                  'border-b border-[var(--color-border)] p-2 transition-opacity',
                  selectedGrupoId === grupo.id && 'bg-[var(--color-surface-2)]',
                  dimRow && 'opacity-35',
                )}
              >
                <div className="mb-1.5 flex items-center gap-1">
                  {onEditGrupo ? (
                    <button
                      type="button"
                      title="Editar grupo"
                      onClick={() => onEditGrupo(grupo)}
                      className={cn(
                        'text-[10px] font-semibold uppercase tracking-wide transition-colors hover:text-violet-600',
                        selectedGrupoId === grupo.id
                          ? 'text-violet-700 dark:text-violet-300'
                          : 'text-[var(--color-muted)]',
                      )}
                    >
                      {grupo.nombre}
                    </button>
                  ) : (
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                      {grupo.nombre}
                    </p>
                  )}
                </div>
                <IntegrantesCell
                  grupo={grupo}
                  highlighted={hitMiembro}
                  highlightUsuarioId={highlightUsuarioId}
                />
              </div>

              {Array.from({ length: colLevels }, (_, lvlIdx) => {
                const chainLevel = levels[lvlIdx] ?? null;
                const prevLevel = lvlIdx > 0 ? (levels[lvlIdx - 1] ?? null) : null;
                const cellHit = !!highlightUsuarioId && !!chainLevel
                  && nodoTieneUsuario(chainLevel.nodo, highlightUsuarioId);
                const cadenaVacia = levels.length === 0 && lvlIdx === 0;

                // Gutter 0: crear primer nivel o insertar delante de la entrada existente.
                // Gutters siguientes: insertar entre niveles.
                const canAddAtStart = lvlIdx === 0 && !!onAddEscalaFromGrupo;
                const canAddBetween = lvlIdx > 0 && !!prevLevel && !!onAddBetweenNodos;

                return (
                  <React.Fragment key={`${grupo.id}-lv-${lvlIdx}`}>
                    <div
                      role="presentation"
                      className={cn(
                        'relative border-b border-[var(--color-border)] transition-opacity',
                        dimRow && 'opacity-35',
                      )}
                    >
                      {canAddAtStart ? (
                        <GutterAdd
                          onClick={() => onAddEscalaFromGrupo!(grupo)}
                          alwaysVisible={cadenaVacia}
                          label={
                            levels[0]
                              ? 'Insertar aprobador delante del primer nivel'
                              : 'Agregar primer nivel de aprobación'
                          }
                        />
                      ) : canAddBetween ? (
                        <GutterAdd
                          onClick={() => onAddBetweenNodos!(
                            grupo,
                            prevLevel!.nodo.usuarioId,
                            prevLevel!.nodo.escalaAUsuarioId ?? null,
                          )}
                          label="Insertar aprobador intermedio"
                        />
                      ) : (
                        <GutterLine />
                      )}
                    </div>

                    <div
                      role="cell"
                      className={cn(
                        'border-b border-[var(--color-border)] p-2 transition-opacity',
                        dimRow && 'opacity-35',
                      )}
                    >
                      {chainLevel ? (
                        <NodoCell
                          nodo={chainLevel.nodo}
                          selected={selectedNodoId === chainLevel.nodo.id}
                          highlighted={cellHit}
                          isFinal={lvlIdx === levels.length - 1}
                          onEdit={onEditNodo}
                          onDelete={onDeleteNodo}
                        />
                      ) : cadenaVacia && onAddEscalaFromGrupo ? (
                        <button
                          type="button"
                          onClick={() => onAddEscalaFromGrupo(grupo)}
                          className="flex min-h-[3.5rem] w-full items-center justify-center gap-1 rounded-md border border-dashed border-violet-500/40 px-2 text-xs text-violet-600 hover:bg-violet-500/10"
                        >
                          <Plus size={12} aria-hidden />
                          Agregar nivel
                        </button>
                      ) : (
                        <div className="flex min-h-[3.5rem] items-center justify-center rounded-md border border-dashed border-[var(--color-border)] text-xs text-[var(--color-muted)]">
                          —
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          );
          })}
        </div>
      </div>

      <p className="mt-3 flex shrink-0 items-center gap-1.5 text-[10px] text-[var(--color-muted)]">
        <GitBranch size={11} aria-hidden />
        Vista por niveles · {modulo} · {filteredGrupos.length} grupo{filteredGrupos.length !== 1 ? 's' : ''} · máx. {maxLevels} nivel{maxLevels !== 1 ? 'es' : ''}
      </p>
    </div>
  );
}
