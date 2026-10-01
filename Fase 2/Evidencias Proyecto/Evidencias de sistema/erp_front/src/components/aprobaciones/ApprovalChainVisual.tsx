import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { ArrowRight, CheckCircle2, Circle, CircleDot, ChevronDown, ChevronRight, GitBranch, MinusCircle, Plus, Table2, User, Users, XCircle } from 'lucide-react';
import type {
  CadenaPasoPreview,
  DelegacionAprobacion,
  GrupoAprobacion,
  LogicaAprobacionPaso,
  NodoEscalaAprobacion,
  PasoAprobacionCadena,
  Usuario,
} from '@/types/domain';
import {
  delegacionesToRows,
  gruposFromDomain,
  nodosFromDomain,
  poolFromNodosEscalas,
  resolveCadenaCompleta,
  usuariosToOrganigrama,
} from '@/lib/approvalEngine';
import { cn } from '@/lib/utils';
import {
  countAprobadores,
  isGrupoMultiFirma,
  listAprobadores,
  logicaBadgeLabel,
  logicaChipClasses,
  logicaJoinLabel,
  logicaStyles,
} from './logicaStyles';

export type ApprovalChainStep = CadenaPasoPreview;

type ApprovalChainFlowProps = {
  solicitante?: { id?: string; nombre: string };
  cadena: ApprovalChainStep[];
  motivos?: string[];
  monto?: number;
  compact?: boolean;
  /** Reparte el ancho entre nodos (wizard OC). Default false = layout del simulador Admin. */
  stretch?: boolean;
  status?: string;
  grupoNombre?: string;
};

function fmtMonto(monto: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(monto);
}

function etiquetaTope(montoMax: number | null | undefined): string | undefined {
  if (montoMax === undefined) return undefined;
  if (montoMax == null) return 'Sin tope';
  return `Hasta ${fmtMonto(montoMax)}`;
}

function StepNode({
  label,
  sub,
  variant,
  stepNum,
  stretch,
}: {
  label: string;
  sub?: string;
  variant: 'solicitante' | 'aprobador' | 'fin';
  stepNum?: number;
  stretch?: boolean;
}) {
  const styles = {
    solicitante: 'border-sky-500/50 bg-sky-500/10 text-sky-900 dark:text-sky-100',
    aprobador: 'border-violet-500/50 bg-violet-500/10 text-violet-900 dark:text-violet-100',
    fin: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100',
  }[variant];

  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-lg border px-3 py-2 text-center',
        stretch ? 'min-w-0 flex-1' : 'min-w-[7.5rem] max-w-[11rem]',
        styles,
      )}
    >
      {stepNum != null && (
        <span className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
          Paso {stepNum}
        </span>
      )}
      {variant === 'solicitante' && <User size={14} className="mb-1 opacity-70" aria-hidden />}
      {variant === 'fin' && <CheckCircle2 size={14} className="mb-1 opacity-70" aria-hidden />}
      <span className="text-sm font-semibold leading-tight">{label}</span>
      {sub ? (
        <span className="mt-1 text-[10px] leading-snug text-[var(--color-muted)]">{sub}</span>
      ) : null}
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex shrink-0 items-center px-1 text-[var(--color-muted)]" aria-hidden>
      <ArrowRight size={18} />
    </div>
  );
}

/** Nodo AND/OR en el preview del wizard / simulador: todos los integrantes, no un solo nombre. */
function GroupStepNode({
  logica,
  members,
  stepNum,
  compact,
  stretch,
  sub,
}: {
  logica: 'AND' | 'OR';
  members: Array<{ id: string; nombre: string }>;
  stepNum?: number;
  compact?: boolean;
  stretch?: boolean;
  sub?: string;
}) {
  const join = logicaJoinLabel(logica) ?? '';
  const styles = logica === 'AND'
    ? 'border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100'
    : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100';
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-lg border px-3 py-2 text-center',
        stretch ? 'min-w-0 flex-1' : 'min-w-[7.5rem] max-w-[12rem]',
        styles,
      )}
    >
      {stepNum != null && (
        <span className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
          Paso {stepNum}
        </span>
      )}
      <span className={cn('mb-1 rounded px-1 text-[9px] font-bold uppercase', logicaStyles(logica).badge)}>
        {logica}
      </span>
      <Users size={14} className="mb-1 opacity-70" aria-hidden />
      <ul className="space-y-0.5" aria-label={members.map((m) => m.nombre).join(` ${join} `)}>
        {members.map((m, i) => (
          <li key={m.id} className="text-sm font-semibold leading-tight">
            {i > 0 && (
              <span className="block text-[10px] font-semibold lowercase tracking-wide text-[var(--color-muted)]">
                {join}
              </span>
            )}
            {m.nombre}
          </li>
        ))}
      </ul>
      {!compact && sub ? (
        <span className="mt-1 text-[10px] leading-snug text-[var(--color-muted)]">{sub}</span>
      ) : null}
    </div>
  );
}

/** Flujo horizontal de una cadena concreta (simulador, emitir OC, solicitar proforma). */
export function ApprovalChainFlow({
  solicitante,
  cadena,
  motivos,
  monto,
  compact = false,
  stretch = false,
  status,
  grupoNombre,
}: ApprovalChainFlowProps) {
  if (!cadena.length) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        {status === 'sin_grupo'
          ? 'Sin grupo asignado — no puede solicitar aprobación.'
          : 'Sin cadena calculada para este monto.'}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {!compact && (monto != null || grupoNombre) && (
        <p className="text-xs text-[var(--color-muted)]">
          {monto != null ? `Monto ${fmtMonto(monto)}` : null}
          {monto != null && grupoNombre ? ' · ' : null}
          {grupoNombre ? `Grupo ${grupoNombre}` : null}
        </p>
      )}
      <div className={cn('pb-1', stretch ? 'w-full' : 'overflow-x-auto')}>
        <div className={cn('flex items-center gap-0', stretch ? 'w-full' : 'min-w-min')}>
          {solicitante && (
            <>
              <StepNode
                label={solicitante.nombre}
                sub="Solicitante"
                variant="solicitante"
                stretch={stretch}
              />
              <FlowArrow />
            </>
          )}
          {cadena.map((paso, i) => {
            const members = paso.aprobadores?.length
              ? paso.aprobadores
              : [{ id: paso.id, nombre: paso.nombre }];
            const logica = paso.logica === 'AND' || paso.logica === 'OR' ? paso.logica : null;
            const multi = logica != null && members.length > 1;
            const tope = etiquetaTope(paso.montoMax) ?? (compact ? undefined : motivos?.[i]);
            return (
              <div
                key={`${paso.id}-${i}`}
                className={cn('flex items-center', stretch && 'min-w-0 flex-1')}
              >
                {multi && logica ? (
                  <GroupStepNode
                    logica={logica}
                    members={members}
                    stepNum={i + 1}
                    compact={compact}
                    stretch={stretch}
                    sub={tope}
                  />
                ) : (
                  <StepNode
                    label={paso.nombre}
                    sub={tope}
                    variant="aprobador"
                    stepNum={i + 1}
                    stretch={stretch}
                  />
                )}
                <FlowArrow />
              </div>
            );
          })}
          <StepNode
            label="Aprobada"
            sub={compact ? undefined : 'OC / documento liberado'}
            variant="fin"
            stretch={stretch}
          />
        </div>
      </div>
      {!compact && motivos?.length ? (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-[var(--color-muted)]">
          {motivos.map((m, i) => (
            <li key={`${i}-${m}`}>
              Paso {i + 1}: {m}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

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

function collapseKey(grupoId: string, usuarioId: string) {
  return `${grupoId}:${usuarioId}`;
}

type EscalasTopologyPanelProps = {
  nodos: NodoEscalaAprobacion[];
  grupos: GrupoAprobacion[];
  modulo: string;
  selectedNodoId?: string | null;
  selectedGrupoId?: string | null;
  /** Usuario a resaltar (filtro avanzado). */
  highlightUsuarioId?: string | null;
  onEditNodo?: (nodo: NodoEscalaAprobacion) => void;
  onEditGrupo?: (grupo: GrupoAprobacion) => void;
  /** Abre alta de nodo prellenando el aprobador inicial del grupo. */
  onAddEscalaFromGrupo?: (grupo: GrupoAprobacion) => void;
  onAddBetweenNodos?: (grupo: GrupoAprobacion, afterUsuarioId: string, nextUsuarioId: string | null) => void;
  onDeleteNodo?: (nodo: NodoEscalaAprobacion) => void;
  viewMode?: 'tree' | 'levels';
};

function fmtTope(montoMax: number | null | undefined) {
  if (montoMax == null) return 'sin tope';
  return `≤ ${fmtMonto(montoMax)}`;
}

/** Tarjeta colapsable de integrantes del grupo — expande inline. */
function IntegrantesCard({
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
  const displayCount = count > 999 ? '999+' : String(count);

  return (
    <div
      className={cn(
        'inline-flex flex-col rounded-md border bg-[var(--color-surface)]',
        highlighted
          ? 'border-sky-400/70 bg-sky-500/15 ring-2 ring-sky-400/45'
          : 'border-[var(--color-border)]',
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        disabled={count === 0}
        onClick={(e) => { e.stopPropagation(); if (count > 0) setExpanded((v) => !v); }}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-sky-500/10 disabled:cursor-default disabled:opacity-50"
      >
        <Users size={12} aria-hidden />
        Integrantes {displayCount}
        {count > 0 && (
          <ChevronDown
            size={12}
            aria-hidden
            className={`text-[var(--color-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        )}
      </button>
      {expanded && count > 0 && (
        <div className="border-t border-[var(--color-border)] px-2 py-1">
          <ul className="space-y-0.5">
            {miembros.map((m) => {
              const isHit = !!highlightUsuarioId && m.id === highlightUsuarioId;
              return (
                <li
                  key={m.id}
                  className={cn(
                    'flex items-center gap-1.5 py-0.5 text-xs',
                    isHit
                      ? 'rounded bg-sky-400/25 px-1 font-semibold text-sky-950 dark:text-sky-50'
                      : 'text-[var(--color-text)]',
                  )}
                >
                  <User size={10} className="shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
                  {m.nombre}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Línea divisora hover-to-add entre nodos de la cadena. */
function HoverAddConnector({ onClick }: { onClick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      title="Insertar aprobador aquí"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="group relative my-0.5 flex h-5 cursor-pointer items-center"
    >
      <div className="h-px w-full bg-[var(--color-border)] transition-colors group-hover:bg-violet-400/50" />
      <div className="absolute left-1/2 top-1/2 hidden h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-violet-400/50 bg-[var(--color-surface)] text-violet-600 shadow-sm group-hover:flex">
        <Plus size={10} aria-hidden />
      </div>
    </div>
  );
}

/** Chips separados AND/OR: [Nombre] (and|or) [Nombre]. */
function MultiFirmaChips({
  nodo,
  isSelected,
  highlighted,
}: {
  nodo: NodoEscalaAprobacion;
  isSelected: boolean;
  highlighted?: boolean;
}) {
  const firmantes = listAprobadores(nodo);
  const join = logicaJoinLabel(nodo.logica) ?? '';
  const chipClass = logicaChipClasses(nodo.logica, isSelected);
  const borderClass = isSelected
    ? 'border-transparent'
    : nodo.logica === 'AND'
      ? 'border border-amber-500/45'
      : 'border border-emerald-500/45';
  return (
    <span className="inline-flex flex-col items-start gap-1" aria-label={firmantes.map((f) => f.nombre).join(` ${join} `)}>
      {firmantes.map((f, i) => (
        <span key={f.usuarioId} className="inline-flex flex-col items-start gap-1">
          {i > 0 && (
            <span className="px-1.5 text-[10px] font-semibold lowercase tracking-wide text-[var(--color-muted)]">
              {join}
            </span>
          )}
          <span
            className={cn(
              'inline-flex items-center rounded-md px-2 py-0.5 text-sm font-medium',
              chipClass,
              borderClass,
              highlighted && 'ring-2 ring-sky-400/60',
            )}
          >
            {f.nombre}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Menú contextual por nodo: Editar, Insertar antes, Eliminar. */
function NodoContextMenu({
  nodo,
  grupo,
  isSelected,
  highlighted,
  isFinal,
  onEdit,
  onDelete,
  onInsertBefore,
  insertBeforeUserId,
}: {
  nodo: NodoEscalaAprobacion;
  grupo: GrupoAprobacion;
  isSelected: boolean;
  highlighted?: boolean;
  isFinal?: boolean;
  onEdit?: (nodo: NodoEscalaAprobacion) => void;
  onDelete?: (nodo: NodoEscalaAprobacion) => void;
  onInsertBefore?: (grupo: GrupoAprobacion, afterUserId: string, nextUserId: string | null) => void;
  insertBeforeUserId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const styles = logicaStyles(nodo.logica);
  const count = countAprobadores(nodo);
  const badge = logicaBadgeLabel(nodo.logica, count);
  const chipClass = logicaChipClasses(nodo.logica, isSelected);
  const firmantes = listAprobadores(nodo);
  const multi = isGrupoMultiFirma(nodo);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const hasMenu = onEdit || onDelete || onInsertBefore;

  const simpleLabel = (
    <>
      {firmantes[0]?.nombre ?? nodo.usuarioNombre ?? nodo.usuarioId}
      {badge && (
        <span className={cn(
          'rounded px-1 text-[9px] font-bold uppercase',
          isSelected ? styles.badgeOnSelected : styles.badge,
        )}
        >
          {badge}
        </span>
      )}
    </>
  );

  const body = multi ? (
    <MultiFirmaChips nodo={nodo} isSelected={isSelected} highlighted={highlighted} />
  ) : (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-sm font-medium',
        chipClass,
        highlighted && 'ring-2 ring-sky-400/60',
      )}
    >
      {simpleLabel}
    </span>
  );

  if (!hasMenu) {
    return <span className="inline-flex">{body}</span>;
  }

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        title="Clic para opciones del nodo"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex rounded-md transition-opacity hover:opacity-90"
      >
        {body}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[9rem] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
          {onEdit && (
            <button
              type="button"
              onClick={() => { onEdit(nodo); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
            >
              Editar
            </button>
          )}
          {onInsertBefore && insertBeforeUserId && (
            <button
              type="button"
              onClick={() => {
                onInsertBefore(grupo, insertBeforeUserId, nodo.usuarioId);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
            >
              Insertar antes
            </button>
          )}
          {onDelete && !isFinal && (
            <button
              type="button"
              onClick={() => { onDelete(nodo); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-[var(--color-surface-2)]"
            >
              Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Árbol de configuración: entradas por grupo + ramas de escalamiento. */
export function EscalasTopologyPanel({
  nodos,
  grupos,
  modulo,
  selectedNodoId,
  selectedGrupoId,
  highlightUsuarioId,
  onEditNodo,
  onEditGrupo,
  onAddEscalaFromGrupo,
  onAddBetweenNodos,
  onDeleteNodo,
}: EscalasTopologyPanelProps) {
  const nodosMod = nodos.filter((n) => n.modulo === modulo && n.activo);
  const gruposMod = grupos.filter((g) => g.modulo === modulo && g.activo);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const firstLevelKeys = useMemo(() => {
    const keys: string[] = [];
    for (const g of gruposMod) {
      const has = nodosMod.some((n) => n.grupoId === g.id && n.usuarioId === g.aprobadorInicialId);
      if (has) keys.push(collapseKey(g.id, g.aprobadorInicialId));
    }
    return keys;
  }, [gruposMod, nodosMod]);

  const expandAll = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(() => setCollapsed(new Set(firstLevelKeys)), [firstLevelKeys]);

  const toggleCollapsed = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const renderBranch = (
    byUser: Map<string, NodoEscalaAprobacion>,
    usuarioId: string,
    grupo: GrupoAprobacion,
    depth = 0,
    visited = new Set<string>(),
  ): ReactElement | null => {
    if (visited.has(usuarioId)) {
      return (
        <p className="text-xs text-amber-600 dark:text-amber-400" style={{ marginLeft: depth * 16 }}>
          ↻ ciclo detectado
        </p>
      );
    }
    const nodo = byUser.get(usuarioId);
    if (!nodo) return null;
    const next = new Set(visited);
    next.add(usuarioId);
    const key = collapseKey(grupo.id, nodo.usuarioId);
    const nextId = nodo.escalaAUsuarioId && byUser.has(nodo.escalaAUsuarioId)
      ? nodo.escalaAUsuarioId
      : null;
    const hasChild = !!nextId;
    const isCollapsed = hasChild && collapsed.has(key);
    const nodeHit = !!highlightUsuarioId && nodoTieneUsuario(nodo, highlightUsuarioId);

    return (
      <div style={{ marginLeft: depth * 16 }} className="border-l border-[var(--color-border)] pl-3">
        <div
          className={cn(
            'flex flex-wrap gap-2 py-1',
            isGrupoMultiFirma(nodo) ? 'items-start' : 'items-center',
          )}
        >
          {hasChild ? (
            <button
              type="button"
              title={isCollapsed ? 'Expandir subárbol' : 'Colapsar subárbol'}
              aria-expanded={!isCollapsed}
              onClick={() => toggleCollapsed(key)}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
            >
              {isCollapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
            </button>
          ) : (
            <span className="inline-block h-5 w-5 shrink-0" aria-hidden />
          )}
          <NodoContextMenu
            nodo={nodo}
            grupo={grupo}
            isSelected={selectedNodoId === nodo.id}
            highlighted={nodeHit}
            isFinal={!nextId}
            onEdit={onEditNodo}
            onDelete={onDeleteNodo}
            onInsertBefore={onAddBetweenNodos}
            insertBeforeUserId={
              [...byUser.values()].find((x) => x.escalaAUsuarioId === nodo.usuarioId)?.usuarioId ?? null
            }
          />
          <span className={cn('text-xs text-[var(--color-muted)]', isGrupoMultiFirma(nodo) && 'pt-0.5')}>
            {fmtTope(nodo.montoMax)}
          </span>
          {nextId && (
            <>
              <ArrowRight size={14} className={cn('text-[var(--color-muted)]', isGrupoMultiFirma(nodo) && 'mt-0.5')} aria-hidden />
              <span className={cn('text-xs text-[var(--color-muted)]', isGrupoMultiFirma(nodo) && 'pt-0.5')}>
                si supera tope
              </span>
            </>
          )}
        </div>
        {!isCollapsed && nextId ? (
          <>
            {onAddBetweenNodos && (
              <HoverAddConnector
                onClick={() => onAddBetweenNodos(grupo, nodo.usuarioId, nextId)}
              />
            )}
            {renderBranch(byUser, nextId, grupo, depth + 1, next)}
          </>
        ) : !isCollapsed ? (
          <p className="pb-1 pl-1 text-xs text-emerald-600 dark:text-emerald-400">✓ cierre de cadena (aprobador final)</p>
        ) : (
          <p className="pb-1 pl-6 text-[10px] text-[var(--color-muted)]">… subárbol oculto</p>
        )}
      </div>
    );
  };

  if (!gruposMod.length && !nodosMod.length) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        Configure grupos y nodos de escala para ver el mapa.
      </p>
    );
  }

  return (
    <div className="flex max-h-[calc(100dvh-12rem)] flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 text-sm font-medium">
        <span className="inline-flex items-center gap-2">
          <GitBranch size={16} aria-hidden />
          Mapa de escalamiento · {modulo}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-muted)] transition-colors hover:border-violet-500/40 hover:text-violet-700 dark:hover:text-violet-300"
          >
            Expandir todo
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-muted)] transition-colors hover:border-violet-500/40 hover:text-violet-700 dark:hover:text-violet-300"
          >
            Colapsar todo
          </button>
          {(onEditNodo || onDeleteNodo) && (
            <span className="text-xs font-normal text-[var(--color-muted)]">Clic en nodo para opciones</span>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain pr-1">
        {gruposMod.map((g) => {
          const byUser = new Map(
            nodosMod.filter((n) => n.grupoId === g.id).map((n) => [n.usuarioId, n] as const),
          );
          const tieneEntrada = byUser.has(g.aprobadorInicialId);
          const hitMiembro = !!highlightUsuarioId && grupoTieneUsuario(g, highlightUsuarioId);
          const hitNodo = !!highlightUsuarioId && [...byUser.values()].some((n) => nodoTieneUsuario(n, highlightUsuarioId));
          const dimGroup = !!highlightUsuarioId && !hitMiembro && !hitNodo;

          return (
            <div
              key={g.id}
              className={cn('transition-opacity', dimGroup && 'opacity-35')}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                {onEditGrupo ? (
                  <button
                    type="button"
                    onClick={() => onEditGrupo(g)}
                    title="Clic para editar grupo"
                    className={`text-left text-xs font-semibold uppercase tracking-wide transition-colors hover:text-violet-600 ${
                      selectedGrupoId === g.id
                        ? 'text-violet-700 dark:text-violet-300'
                        : 'text-[var(--color-muted)]'
                    }`}
                  >
                    {g.nombre}
                  </button>
                ) : (
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    {g.nombre}
                  </p>
                )}
                {/* Solo si aún no hay nodo de entrada: crear escala. Insertar antes = hover en la línea. */}
                {onAddEscalaFromGrupo && !tieneEntrada && (
                  <button
                    type="button"
                    title="Crear primer nodo de escala"
                    onClick={() => onAddEscalaFromGrupo(g)}
                    className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-muted)] transition-colors hover:border-violet-500/50 hover:text-violet-600"
                  >
                    <Plus size={10} aria-hidden />
                    Escala
                  </button>
                )}
              </div>
              <div className="mb-1">
                <IntegrantesCard
                  grupo={g}
                  highlighted={hitMiembro}
                  highlightUsuarioId={highlightUsuarioId}
                />
              </div>
              {onAddEscalaFromGrupo && tieneEntrada && (
                <HoverAddConnector onClick={() => onAddEscalaFromGrupo(g)} />
              )}
              {renderBranch(byUser, g.aprobadorInicialId, g) ?? (
                <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
                  Sin nodo de escala. Use «Escala» para crear el primero.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type TimelineStepState = 'done' | 'current' | 'pending' | 'rejected' | 'cancelled' | 'omitted';

export type ApprovalTimelineMember = {
  id: string;
  label: string;
  state: TimelineStepState;
  sub?: string;
};

export type ApprovalTimelineStep = {
  key: string;
  label: string;
  sub?: string;
  state: TimelineStepState;
  logica?: LogicaAprobacionPaso;
  members?: ApprovalTimelineMember[];
};

type BandejaTimelineEstado = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'ANULADA';
type AprobadorCadenaSnapshotEstado = PasoAprobacionCadena['aprobadores'][number]['estado'];

function truncMotivoRechazo(raw: string, max = 90): string {
  const t = raw.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function rejectedSub(base: string | undefined, motivo?: string | null): string | undefined {
  const m = motivo?.trim();
  if (!m) return base;
  const trunc = truncMotivoRechazo(m);
  return base ? `${base} · ${trunc}` : trunc;
}

function inferPasoActual(
  cadena: PasoAprobacionCadena[],
  pasoActual: number,
  bandejaEstado: BandejaTimelineEstado,
): number {
  if (bandejaEstado === 'RECHAZADA') {
    const rejectedIdx = cadena.findIndex((p) => p.aprobadores.some((a) => a.estado === 'RECHAZADA'));
    if (rejectedIdx >= 0) return rejectedIdx + 1;
  }
  const pendingIdx = cadena.findIndex((p) => p.aprobadores.some((a) => a.estado === 'PENDIENTE'));
  if (pendingIdx >= 0) return pendingIdx + 1;
  const rejectedIdx = cadena.findIndex((p) => p.aprobadores.some((a) => a.estado === 'RECHAZADA'));
  if (rejectedIdx >= 0) return rejectedIdx + 1;
  return pasoActual || 1;
}

function personToState(
  estado: AprobadorCadenaSnapshotEstado,
  stepNum: number,
  effectivePaso: number,
  bandejaEstado: BandejaTimelineEstado,
): TimelineStepState {
  if (estado === 'APROBADA') return 'done';
  if (estado === 'RECHAZADA') return 'rejected';
  if (estado === 'OMITIDA') return 'omitted';
  if (bandejaEstado === 'ANULADA') return 'cancelled';
  if (bandejaEstado === 'APROBADA') return 'done';
  if (bandejaEstado === 'RECHAZADA' && stepNum === effectivePaso) return 'rejected';
  if (stepNum < effectivePaso) return 'done';
  if (stepNum === effectivePaso) return 'current';
  return 'pending';
}

function memberSubLabel(state: TimelineStepState, future: boolean): string | undefined {
  if (state === 'done') return 'aprobó';
  if (state === 'rejected') return 'rechazó';
  if (state === 'omitted') return 'no requirió firma';
  if (state === 'cancelled') return 'anulada';
  if (state === 'current') return 'espera';
  if (state === 'pending' && future) return undefined;
  if (state === 'pending') return 'espera';
  return undefined;
}

function reducePasoState(
  members: ApprovalTimelineMember[],
  logica: LogicaAprobacionPaso,
): TimelineStepState {
  if (!members.length) return 'pending';
  if (members.some((m) => m.state === 'cancelled') && members.every((m) => m.state === 'cancelled' || m.state === 'done' || m.state === 'omitted')) {
    return 'cancelled';
  }
  if (logica === 'AND' && members.some((m) => m.state === 'rejected')) return 'rejected';
  const open = members.some((m) => m.state === 'current' || m.state === 'pending');
  if (members.some((m) => m.state === 'rejected') && !open) return 'rejected';
  if (logica === 'OR' && members.some((m) => m.state === 'rejected') && !open && !members.some((m) => m.state === 'done')) {
    return 'rejected';
  }
  if (members.every((m) => m.state === 'done' || m.state === 'omitted') && members.some((m) => m.state === 'done')) {
    return 'done';
  }
  if (members.every((m) => m.state === 'done')) return 'done';
  if (members.some((m) => m.state === 'current')) return 'current';
  if (members.every((m) => m.state === 'pending' || m.state === 'omitted')) return 'pending';
  return 'current';
}

function isMultiFirma(logica: LogicaAprobacionPaso | undefined, count: number): logica is 'AND' | 'OR' {
  return (logica === 'AND' || logica === 'OR') && count > 1;
}

function buildStepsFromSnapshot(input: {
  solicitanteNombre: string;
  cadena: PasoAprobacionCadena[];
  nameForId: (id: string) => string;
  pasoActual: number;
  bandejaEstado: BandejaTimelineEstado;
  motivoRechazo?: string | null;
}): ApprovalTimelineStep[] {
  const { bandejaEstado } = input;
  const effectivePaso = inferPasoActual(input.cadena, input.pasoActual, bandejaEstado);
  const steps: ApprovalTimelineStep[] = [
    { key: 'solicitante', label: input.solicitanteNombre, sub: 'Solicitante', state: 'done' },
  ];

  input.cadena.forEach((paso, i) => {
    const stepNum = i + 1;
    const future = stepNum > effectivePaso && bandejaEstado === 'PENDIENTE';
    const logica: LogicaAprobacionPaso = paso.logica ?? 'SIMPLE';
    const members: ApprovalTimelineMember[] = (paso.aprobadores ?? []).map((a) => {
      const state = personToState(a.estado, stepNum, effectivePaso, bandejaEstado);
      const base = memberSubLabel(state, future);
      return {
        id: a.id,
        label: a.nombre?.trim() || input.nameForId(a.id),
        state,
        sub: state === 'rejected' ? rejectedSub(base, input.motivoRechazo) : base,
      };
    });
    const multi = isMultiFirma(logica, members.length);
    const state = reducePasoState(members, logica);
    const badge = multi ? ` · ${logica}` : '';
    const currentHint = !multi && state === 'current' ? ' · pendiente' : '';
    const pasoSub = `Paso ${stepNum}${badge}${currentHint}`;
    steps.push({
      key: `paso-${stepNum}-${members[0]?.id ?? i}`,
      label: multi
        ? `Paso ${stepNum}`
        : (members[0]?.label ?? `Paso ${stepNum}`),
      sub: state === 'rejected' ? rejectedSub(pasoSub, input.motivoRechazo) : pasoSub,
      state,
      logica,
      members: multi || members.length > 1 ? members : undefined,
    });
  });

  steps.push({
    key: 'fin',
    label: 'Aprobada',
    sub: bandejaEstado === 'APROBADA' ? 'Completada' : undefined,
    state: bandejaEstado === 'APROBADA'
      ? 'done'
      : bandejaEstado === 'RECHAZADA' || bandejaEstado === 'ANULADA'
        ? 'cancelled'
        : 'pending',
  });
  return steps;
}

export function buildApprovalTimelineSteps(input: {
  solicitanteNombre: string;
  cadenaIds: string[];
  nameForId: (id: string) => string;
  pasoActual: number;
  bandejaEstado: BandejaTimelineEstado;
  aprobadorFallback?: string;
  /** Snapshot runtime AND/OR. Si falta, se usa `cadenaIds` (SIMPLE legado). */
  cadena?: PasoAprobacionCadena[] | null;
  /** Motivo al rechazar: subtexto del paso `rejected` (truncado). */
  motivoRechazo?: string | null;
}): ApprovalTimelineStep[] {
  if (input.cadena && input.cadena.length > 0) {
    return buildStepsFromSnapshot(input as typeof input & { cadena: PasoAprobacionCadena[] });
  }

  const steps: ApprovalTimelineStep[] = [
    {
      key: 'solicitante',
      label: input.solicitanteNombre,
      sub: 'Solicitante',
      state: 'done',
    },
  ];

  const ids = input.cadenaIds.length
    ? input.cadenaIds
    : input.aprobadorFallback
      ? [input.aprobadorFallback]
      : [];

  const { pasoActual, bandejaEstado } = input;

  ids.forEach((id, i) => {
    const stepNum = i + 1;
    let state: TimelineStepState = 'pending';
    if (bandejaEstado === 'APROBADA') state = 'done';
    else if (bandejaEstado === 'RECHAZADA' && stepNum === pasoActual) state = 'rejected';
    else if (bandejaEstado === 'RECHAZADA' && stepNum < pasoActual) state = 'done';
    else if (bandejaEstado === 'ANULADA') state = 'cancelled';
    else if (bandejaEstado === 'PENDIENTE' && stepNum < pasoActual) state = 'done';
    else if (bandejaEstado === 'PENDIENTE' && stepNum === pasoActual) state = 'current';

    const pasoSub = `Paso ${stepNum}${state === 'current' ? ' · pendiente' : ''}`;
    steps.push({
      key: id,
      label: input.nameForId(id),
      sub: state === 'rejected' ? rejectedSub(pasoSub, input.motivoRechazo) : pasoSub,
      state,
      logica: 'SIMPLE',
    });
  });

  steps.push({
    key: 'fin',
    label: 'Aprobada',
    sub: bandejaEstado === 'APROBADA' ? 'Completada' : undefined,
    state: bandejaEstado === 'APROBADA'
      ? 'done'
      : bandejaEstado === 'RECHAZADA' || bandejaEstado === 'ANULADA'
        ? 'cancelled'
        : 'pending',
  });

  return steps;
}

function chainTooltip(steps: ApprovalTimelineStep[]): string {
  return steps
    .filter((s) => s.key !== 'solicitante' && s.key !== 'fin')
    .map((s) => (s.members?.length ? s.members.map((m) => m.label).join(' + ') : s.label))
    .join(' → ');
}

function TimelineIcon({ state }: { state: TimelineStepState }) {
  if (state === 'done') return <CheckCircle2 size={16} className="text-emerald-600" aria-hidden />;
  if (state === 'current') return <CircleDot size={16} className="text-violet-600" aria-hidden />;
  if (state === 'rejected') return <XCircle size={16} className="text-red-600" aria-hidden />;
  if (state === 'cancelled') return <XCircle size={16} className="text-[var(--color-muted)]" aria-hidden />;
  if (state === 'omitted') return <MinusCircle size={16} className="text-[var(--color-muted)]" aria-hidden />;
  return <Circle size={16} className="text-[var(--color-muted)]" aria-hidden />;
}

/** Compacto de tablas: `1/2 AND` o `OR · NombreQueAprobó`. SIMPLE legado: `n/m Nombre`. */
function memberCompactHint(m: ApprovalTimelineMember): string {
  if (m.state === 'rejected') return `${m.label} rechazó`;
  if (m.state === 'done') return `${m.label} aprobó`;
  if (m.state === 'omitted') return `${m.label} (sin firma)`;
  if (m.state === 'current') return `${m.label} espera`;
  return m.label;
}

function CompactCadenaLabel({ steps }: { steps: ApprovalTimelineStep[] }) {
  const approvers = steps.filter((s) => s.key !== 'solicitante' && s.key !== 'fin');
  const focus = approvers.find((s) => s.state === 'current')
    ?? approvers.find((s) => s.state === 'rejected')
    ?? [...approvers].reverse().find((s) => s.state === 'done')
    ?? approvers[0];
  const members = focus?.members ?? [];
  if ((focus?.logica === 'AND' || focus?.logica === 'OR') && members.length > 1) {
    const done = members.filter((m) => m.state === 'done').length;
    const rejectedN = members.filter((m) => m.state === 'rejected').length;
    return (
      <>
        <span className="font-mono text-[var(--color-muted)]">
          {rejectedN > 0 ? `${rejectedN}/${members.length}` : `${done}/${members.length}`}
        </span>
        <span className={cn(
          'font-semibold',
          focus.logica === 'AND' ? 'text-amber-800 dark:text-amber-200' : 'text-emerald-800 dark:text-emerald-200',
        )}
        >
          {focus.logica}
        </span>
        <span className="max-w-[12rem] truncate font-medium">
          {members.map(memberCompactHint).join(' · ')}
        </span>
      </>
    );
  }
  const done = approvers.filter((s) => s.state === 'done').length;
  const current = approvers.find((s) => s.state === 'current');
  const rejected = approvers.find((s) => s.state === 'rejected');
  return (
    <>
      <span className="font-mono text-[var(--color-muted)]">{done}/{approvers.length || 1}</span>
      <span className="max-w-[8rem] truncate font-medium">
        {rejected?.label ?? current?.label ?? approvers[0]?.label ?? '—'}
      </span>
    </>
  );
}

/** Stepper vertical para bandeja / detalle de OC (instancia en curso). */
export function ApprovalChainTimeline({
  steps,
  compact = false,
}: {
  steps: ApprovalTimelineStep[];
  compact?: boolean;
}) {
  if (!steps.length) {
    return <p className="text-sm text-[var(--color-muted)]">Sin cadena registrada.</p>;
  }

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs" title={chainTooltip(steps)}>
        <CompactCadenaLabel steps={steps} />
      </span>
    );
  }

  return (
    <ol className="space-y-0">
      {steps.map((step, i) => {
        const members = step.members?.length ? step.members : null;
        const logicaBadge = isMultiFirma(step.logica, members?.length ?? 0) ? step.logica : null;
        return (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <TimelineIcon state={step.state} />
              {i < steps.length - 1 && (
                <div className="my-0.5 w-px flex-1 min-h-[1.25rem] bg-[var(--color-border)]" aria-hidden />
              )}
            </div>
            <div className="pb-4">
              <p className={`flex flex-wrap items-center gap-1.5 text-sm font-medium ${
                step.state === 'current' ? 'text-violet-700 dark:text-violet-300' : ''
              } ${step.state === 'omitted' ? 'text-[var(--color-muted)]' : ''}`}
              >
                {step.label}
                {logicaBadge && (
                  <span className={cn('rounded px-1 text-[9px] font-bold uppercase', logicaStyles(logicaBadge).badge)}>
                    {logicaBadge}
                  </span>
                )}
              </p>
              {step.sub && !members && (
                <p className="line-clamp-2 break-words text-xs text-[var(--color-muted)]">{step.sub}</p>
              )}
              {members && (
                <ul className="mt-1.5 space-y-1">
                  {members.map((m) => (
                    <li
                      key={m.id}
                      className={cn(
                        'flex items-start gap-2 text-sm',
                        m.state === 'omitted' && 'text-[var(--color-muted)]',
                        m.state === 'current' && 'text-violet-700 dark:text-violet-300',
                      )}
                    >
                      <span className="mt-0.5 shrink-0">
                        <TimelineIcon state={m.state} />
                      </span>
                      <span>
                        <span className={cn('font-medium', m.state === 'pending' && step.state !== 'current' && 'font-normal')}>
                          {m.label}
                        </span>
                        {m.sub && (
                          <span className="mt-0.5 block line-clamp-2 break-words text-xs text-[var(--color-muted)]">{m.sub}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const DOA_TRAMOS_DEFAULT = [250_000, 800_000, 900_000, 1_500_000, 2_500_000, 3_500_000, 5_500_000];

type DoaMatrixPanelProps = {
  grupos: GrupoAprobacion[];
  nodos: NodoEscalaAprobacion[];
  usuarios: Usuario[];
  delegaciones: DelegacionAprobacion[];
  modulo: string;
  tramos?: number[];
};

function buildDoaRows(grupos: GrupoAprobacion[], modulo: string) {
  const rows: Array<{ label: string; solicitanteId: string }> = [];
  for (const g of grupos.filter((x) => x.modulo === modulo && x.activo)) {
    const miembros = g.miembroIds?.length
      ? g.miembroIds
      : (g.miembros ?? []).map((m) => m.id);
    const operativo = miembros.find((id) => id !== g.aprobadorInicialId) ?? miembros[0];
    if (operativo) {
      rows.push({ label: `${g.nombre} · equipo`, solicitanteId: operativo });
    }
    if (miembros.includes(g.aprobadorInicialId)) {
      rows.push({ label: `${g.nombre} · jefa solicita`, solicitanteId: g.aprobadorInicialId });
    }
  }
  return rows;
}

/** Matriz DOA read-only: escenario × tramo de monto → cadena calculada. */
export function DoaMatrixPanel({
  grupos,
  nodos,
  usuarios,
  delegaciones,
  modulo,
  tramos = DOA_TRAMOS_DEFAULT,
}: DoaMatrixPanelProps) {
  const nodosMod = nodos.filter((n) => n.modulo === modulo && n.activo);
  const gruposMod = grupos.filter((g) => g.modulo === modulo && g.activo);
  const rows = buildDoaRows(gruposMod, modulo);
  const pool = poolFromNodosEscalas(nodosFromDomain(nodosMod));
  const org = usuariosToOrganigrama(usuarios);
  const gruposRows = gruposFromDomain(gruposMod);
  const nodosRows = nodosFromDomain(nodosMod);
  const delegRows = delegacionesToRows(delegaciones);

  const cell = (solicitanteId: string, monto: number) => {
    const r = resolveCadenaCompleta({
      solicitanteId,
      monto,
      modulo,
      usuarios: org,
      allowedIds: pool,
      grupos: gruposRows,
      nodos: nodosRows,
      delegaciones: delegRows,
    });
    if (r.status !== 'ok') return '—';
    return r.cadena.map((p) => p.nombre).join(' → ');
  };

  if (!rows.length) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        Configure grupos activos para generar la matriz DOA.
      </p>
    );
  }

  return (
    <div className="flex max-h-[min(32rem,calc(100dvh-18rem))] flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
      <div className="mb-3 flex shrink-0 items-center gap-2 text-sm font-medium">
        <Table2 size={16} aria-hidden />
        Matriz DOA (solo lectura) · {modulo}
      </div>
      <p className="mb-3 shrink-0 text-xs text-[var(--color-muted)]">
        Cadena calculada por escenario y monto. Referencia para validar política de autoridad.
      </p>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <table className="w-full min-w-[32rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
              <th className="p-2 font-medium">Escenario</th>
              {tramos.map((m) => (
                <th key={m} className="p-2 font-medium whitespace-nowrap">{fmtMonto(m)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.solicitanteId}-${row.label}`} className="border-b border-[var(--color-border)]">
                <td className="p-2 align-top font-medium">{row.label}</td>
                {tramos.map((m) => (
                  <td key={m} className="p-2 align-top text-xs leading-snug text-[var(--color-text)]">
                    {cell(row.solicitanteId, m)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
