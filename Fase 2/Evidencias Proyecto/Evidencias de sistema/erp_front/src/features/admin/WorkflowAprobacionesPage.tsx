import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { MontoInput } from '@/components/ui/monto-input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/modal';
import { SlidePanel } from '@/components/common/SlidePanel';
import { useQueryScope, useEmpresaScopeId, listQueryKey } from '@/hooks/useQueryScope';
import { useAuth } from '@/app/auth-context';
import { canEditAllAprobacionesModulos, esUsuarioMantenedor } from '@/lib/permissions';
import { toast } from 'sonner';
import { GitBranch, LayoutList, Plus, Settings } from 'lucide-react';
import { ApprovalChainFlow, EscalasTopologyPanel, DoaMatrixPanel } from '@/components/aprobaciones/ApprovalChainVisual';
import { LevelView } from '@/components/aprobaciones/LevelView';
import { logicaStyles } from '@/components/aprobaciones/logicaStyles';
import { AdminConceptoPanel } from '@/features/admin/AdminConceptoPanel';
import { AprobacionesBackupPanel } from '@/features/admin/AprobacionesBackupPanel';
import { PendientesImpactoModal, type PendienteImpactoItem } from '@/components/aprobaciones/PendientesImpactoModal';
import { AprobadorBandejaModal } from '@/components/aprobaciones/AprobadorBandejaModal';
import { parseAprobadorSinBandejaError, type AprobadorSinBandejaItem } from '@/lib/bandejaAprobacion';
import * as api from '@/services/api';
import { WORKFLOW_MODULOS_UI } from '@/lib/workflowAprobacion';
import type { DelegacionAprobacion, GrupoAprobacion, NodoEscalaAprobacion, SimulacionAprobacionResult } from '@/types/domain';

type SlidePanelTab = 'grupos' | 'escalas' | 'suplencias' | 'simulador' | 'administradores' | 'import-export';

type DelegFormState = {
  titularId: string;
  suplenteId: string;
  modulo: string;
  vigenciaDesde: string;
  vigenciaHasta: string;
  motivo: string;
  activo: boolean;
};

type GrupoFormState = {
  nombre: string;
  modulo: string;
  /** Cierre de cadena (se elige al crear el grupo). */
  aprobadorFinalId: string;
  miembroIds: string[];
  activo: boolean;
};

type EscalaFormState = {
  /** Obligatorio: toda escala pertenece a un grupo. */
  grupoId: string;
  modulo: string;
  usuarioId: string;
  /** Lógica de aprobación: SIMPLE (1 aprobador), AND (todos deben aprobar), OR (basta 1). */
  logica: 'SIMPLE' | 'AND' | 'OR';
  /** Aprobadores adicionales para lógica AND/OR (además de usuarioId). */
  aprobadoresExtra: string[];
  montoMax: string;
  escalaAUsuarioId: string;
  /** Si se indica, inserta en cadena después de este usuario (sin mover entrada del grupo). */
  insertAfterUsuarioId: string;
  activo: boolean;
};

const emptyGrupo: GrupoFormState = {
  nombre: '',
  modulo: 'Compras',
  aprobadorFinalId: '',
  miembroIds: [],
  activo: true,
};

const emptyEscala: EscalaFormState = {
  grupoId: '',
  modulo: 'Compras',
  usuarioId: '',
  logica: 'SIMPLE',
  aprobadoresExtra: [],
  montoMax: '',
  escalaAUsuarioId: '',
  insertAfterUsuarioId: '',
  activo: true,
};

const emptyDeleg: DelegFormState = {
  titularId: '',
  suplenteId: '',
  modulo: '',
  vigenciaDesde: new Date().toISOString().slice(0, 10),
  vigenciaHasta: '',
  motivo: '',
  activo: true,
};

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CL');
}

type EscalaModo = 'create' | 'edit' | 'insert' | 'insertAfter';

function resolveEscalaDestinoUsuarioId(
  form: Pick<EscalaFormState, 'escalaAUsuarioId' | 'grupoId' | 'modulo' | 'insertAfterUsuarioId'>,
  modo: EscalaModo,
  nodos: NodoEscalaAprobacion[],
): string | null {
  let dest = form.escalaAUsuarioId.trim() || null;
  if (modo === 'insertAfter' && form.insertAfterUsuarioId && !dest) {
    const pred = nodos.find(
      (n) =>
        n.grupoId === form.grupoId
        && n.modulo === form.modulo
        && n.usuarioId === form.insertAfterUsuarioId
        && n.activo,
    );
    dest = pred?.escalaAUsuarioId ?? null;
  }
  return dest;
}

function buildEscalaNodosCadena(
  form: EscalaFormState,
  modo: EscalaModo,
  editingEscala: NodoEscalaAprobacion | null,
  nodosDb: NodoEscalaAprobacion[],
): Array<{ usuarioId: string; montoMax: number | null; escalaAUsuarioId: string | null }> {
  const montoNuevo = form.montoMax.trim() ? Number(form.montoMax) : null;
  const escalaDestino = resolveEscalaDestinoUsuarioId(form, modo, nodosDb);
  let nodosCadena = nodosDb
    .filter((n) => n.grupoId === form.grupoId && n.modulo === form.modulo && n.activo)
    .filter((n) => !(modo === 'edit' && editingEscala && n.id === editingEscala.id))
    .map((n) => ({
      usuarioId: n.usuarioId,
      montoMax: n.montoMax,
      escalaAUsuarioId: n.escalaAUsuarioId ?? null,
    }));
  if (modo === 'insertAfter' && form.insertAfterUsuarioId) {
    nodosCadena = nodosCadena.map((n) =>
      n.usuarioId === form.insertAfterUsuarioId
        ? { ...n, escalaAUsuarioId: form.usuarioId }
        : n,
    );
  }
  nodosCadena.push({
    usuarioId: form.usuarioId,
    montoMax: montoNuevo,
    escalaAUsuarioId: escalaDestino,
  });
  return nodosCadena;
}

/** Valida que cada paso tenga tope estrictamente menor que su destino «escala a». */
function validateMontosEscalaCadena(
  nodos: Array<{ usuarioId: string; montoMax: number | null; escalaAUsuarioId: string | null }>,
  userMap: Map<string, string>,
): string | null {
  const byUser = new Map(nodos.map((n) => [n.usuarioId, n]));
  const fmt = (m: number) => m.toLocaleString('es-CL');
  for (const n of nodos) {
    if (!n.escalaAUsuarioId || n.montoMax == null) continue;
    const sig = byUser.get(n.escalaAUsuarioId);
    if (!sig) continue;
    if (sig.montoMax != null && n.montoMax >= sig.montoMax) {
      const desde = userMap.get(n.usuarioId) ?? n.usuarioId;
      const hacia = userMap.get(sig.usuarioId) ?? sig.usuarioId;
      return `El tope de «${desde}» ($${fmt(n.montoMax)}) debe ser menor que el del destino «${hacia}» ($${fmt(sig.montoMax)}).`;
    }
  }
  return null;
}

function getEscalaMontoMaxFieldError(
  form: EscalaFormState,
  modo: EscalaModo,
  editingEscala: NodoEscalaAprobacion | null,
  nodosDb: NodoEscalaAprobacion[],
  userMap: Map<string, string>,
): string | null {
  if (!form.montoMax.trim()) return null;
  const montoNuevo = Number(form.montoMax);
  if (!Number.isFinite(montoNuevo)) return 'Ingrese un monto válido';

  const fmt = (m: number) => m.toLocaleString('es-CL');
  const activos = nodosDb.filter(
    (n) => n.grupoId === form.grupoId && n.modulo === form.modulo && n.activo,
  );
  const sinEditado = activos.filter(
    (n) => !(modo === 'edit' && editingEscala && n.id === editingEscala.id),
  );

  const escalaDestino = resolveEscalaDestinoUsuarioId(form, modo, activos);
  if (escalaDestino) {
    const sig = sinEditado.find((n) => n.usuarioId === escalaDestino);
    if (sig?.montoMax != null && montoNuevo >= sig.montoMax) {
      const hacia = userMap.get(sig.usuarioId) ?? sig.usuarioId;
      return `Debe ser menor que el tope del destino «${hacia}» ($${fmt(sig.montoMax)}).`;
    }
  }

  if (form.usuarioId) {
    let preds = sinEditado.filter((n) => n.escalaAUsuarioId === form.usuarioId);
    if (modo === 'insertAfter' && form.insertAfterUsuarioId) {
      const pred = sinEditado.find((n) => n.usuarioId === form.insertAfterUsuarioId);
      if (pred) {
        preds = [
          ...preds.filter((n) => n.usuarioId !== pred.usuarioId),
          { ...pred, escalaAUsuarioId: form.usuarioId },
        ];
      }
    }
    for (const pred of preds) {
      if (pred.montoMax != null && montoNuevo <= pred.montoMax) {
        const desde = userMap.get(pred.usuarioId) ?? pred.usuarioId;
        return `Debe ser mayor que el tope de «${desde}» ($${fmt(pred.montoMax)}).`;
      }
    }
  }

  return null;
}

function nodosActivosDelGrupo(
  grupo: GrupoAprobacion,
  nodos: NodoEscalaAprobacion[],
): NodoEscalaAprobacion[] {
  return nodos.filter((n) => n.grupoId === grupo.id && n.modulo === grupo.modulo && n.activo);
}

/** Recorre la cadena del grupo y se detiene si el siguiente no tiene nodo en el grupo. */
function walkCadenaGrupo(
  grupo: GrupoAprobacion,
  nodosGrupo: NodoEscalaAprobacion[],
): NodoEscalaAprobacion[] {
  const byUser = new Map(nodosGrupo.map((n) => [n.usuarioId, n]));
  const levels: NodoEscalaAprobacion[] = [];
  const visited = new Set<string>();
  let current: string | null = grupo.aprobadorInicialId;
  while (current && !visited.has(current)) {
    visited.add(current);
    const nodo = byUser.get(current);
    if (!nodo) break;
    levels.push(nodo);
    const next = nodo.escalaAUsuarioId ?? null;
    if (!next || !byUser.has(next)) break;
    current = next;
  }
  return levels;
}

function getNodoFinalCadena(
  grupo: GrupoAprobacion,
  nodosGrupo: NodoEscalaAprobacion[],
): NodoEscalaAprobacion | null {
  const levels = walkCadenaGrupo(grupo, nodosGrupo);
  return levels[levels.length - 1] ?? null;
}

/** Siguiente nodo real en la cadena (solo si existe nodo en el grupo). */
function getSiguienteEnCadenaGrupo(
  grupo: GrupoAprobacion,
  nodosGrupo: NodoEscalaAprobacion[],
  usuarioId: string,
): string | null {
  const byUser = new Map(nodosGrupo.map((n) => [n.usuarioId, n]));
  for (const n of walkCadenaGrupo(grupo, nodosGrupo)) {
    if (n.usuarioId !== usuarioId) continue;
    const next = n.escalaAUsuarioId ?? null;
    return next && byUser.has(next) ? next : null;
  }
  return null;
}

export default function WorkflowAprobacionesPage() {
  const { user } = useAuth();
  const scope = useQueryScope();
  const empresaId = useEmpresaScopeId();
  const qc = useQueryClient();
  const canEditAllModulos = canEditAllAprobacionesModulos(user);
  const modulosDisponibles = useMemo(() => {
    if (canEditAllModulos) return WORKFLOW_MODULOS_UI;
    const allowed = new Set(user?.adminConceptoModulos ?? []);
    const filtered = WORKFLOW_MODULOS_UI.filter((m) => allowed.has(m.value));
    return filtered.length ? filtered : WORKFLOW_MODULOS_UI.filter((m) => m.value === 'Compras');
  }, [canEditAllModulos, user?.adminConceptoModulos]);
  const defaultModulo = modulosDisponibles[0]?.value ?? 'Compras';
  const [viewMode, setViewMode] = useState<'tree' | 'levels'>('levels');
  const [slidePanelOpen, setSlidePanelOpen] = useState(false);
  const [slidePanelTab, setSlidePanelTab] = useState<SlidePanelTab>('grupos');
  const [grupoSearch, setGrupoSearch] = useState('');
  /** Filtro avanzado del mapa: resalta usuario sin ocultar grupos. */
  const [mapaUserSearch, setMapaUserSearch] = useState('');
  const delegQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'delegaciones-aprobacion'),
    queryFn: api.getDelegacionesAprobacion,
  });
  const usuariosQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'usuarios'),
    queryFn: api.getUsuarios,
  });
  const gruposQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'grupos-aprobacion'),
    queryFn: api.getGruposAprobacion,
  });
  const escalasQ = useQuery({
    queryKey: listQueryKey(scope, empresaId, 'escalas-aprobacion'),
    queryFn: api.getEscalasAprobacion,
  });
  const [delegOpen, setDelegOpen] = useState(false);
  const [editingDeleg, setEditingDeleg] = useState<DelegacionAprobacion | null>(null);
  const [delegForm, setDelegForm] = useState<DelegFormState>(emptyDeleg);
  const [delegSaving, setDelegSaving] = useState(false);
  const [confirmDeleteDeleg, setConfirmDeleteDeleg] = useState<DelegacionAprobacion | null>(null);

  const [grupoOpen, setGrupoOpen] = useState(false);
  const [editingGrupo, setEditingGrupo] = useState<GrupoAprobacion | null>(null);
  const [grupoForm, setGrupoForm] = useState<GrupoFormState>(emptyGrupo);
  const [grupoSaving, setGrupoSaving] = useState(false);
  const [confirmDeleteGrupo, setConfirmDeleteGrupo] = useState<GrupoAprobacion | null>(null);
  const [grupoUserSearch, setGrupoUserSearch] = useState('');

  const [escalaOpen, setEscalaOpen] = useState(false);
  const [editingEscala, setEditingEscala] = useState<NodoEscalaAprobacion | null>(null);
  /** create = nuevo nodo; edit = editar nodo; insert = intermedio al inicio; insertAfter = intermedio en cadena */
  const [escalaModo, setEscalaModo] = useState<'create' | 'edit' | 'insert' | 'insertAfter'>('create');
  const [escalaForm, setEscalaForm] = useState<EscalaFormState>(emptyEscala);
  const [escalaSaving, setEscalaSaving] = useState(false);
  const [confirmDeleteEscala, setConfirmDeleteEscala] = useState<NodoEscalaAprobacion | null>(null);
  const [escalaUserSearch, setEscalaUserSearch] = useState('');
  const [impactoPendientes, setImpactoPendientes] = useState<{
    mode: 'update' | 'delete';
    nodo: NodoEscalaAprobacion;
    items: PendienteImpactoItem[];
    sugeridoAprobadorId: string | null;
    /** Payload pendiente de update (si mode=update). */
    payload?: Record<string, unknown>;
  } | null>(null);
  const [impactoBusy, setImpactoBusy] = useState(false);
  const [bandejaInvalidos, setBandejaInvalidos] = useState<AprobadorSinBandejaItem[] | null>(null);

  const [simModulo, setSimModulo] = useState(defaultModulo);
  const [simGrupoId, setSimGrupoId] = useState('');
  const [simUsuarioId, setSimUsuarioId] = useState('');
  const [simMonto, setSimMonto] = useState('1500000');
  const [simResult, setSimResult] = useState<SimulacionAprobacionResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [mapaModulo, setMapaModulo] = useState(defaultModulo);
  const [gruposMapaModulo, setGruposMapaModulo] = useState(defaultModulo);
  const [selectedEscalaId, setSelectedEscalaId] = useState<string | null>(null);
  const [selectedGrupoId, setSelectedGrupoId] = useState<string | null>(null);

  useEffect(() => {
    const ok = modulosDisponibles.some((m) => m.value === mapaModulo);
    if (!ok && defaultModulo) {
      setMapaModulo(defaultModulo);
      setGruposMapaModulo(defaultModulo);
      setSimModulo(defaultModulo);
    }
  }, [modulosDisponibles, mapaModulo, defaultModulo]);

  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of usuariosQ.data ?? []) m.set(u.id, u.nombre);
    return m;
  }, [usuariosQ.data]);

  const handleConfigError = (e: unknown): boolean => {
    const parsed = parseAprobadorSinBandejaError(e);
    if (parsed?.invalidos?.length) {
      setBandejaInvalidos(parsed.invalidos);
      return true;
    }
    toast.error(e instanceof Error ? e.message : 'Error');
    return false;
  };

  const grupoUsuariosFiltrados = useMemo(() => {
    const q = grupoUserSearch.trim().toLowerCase();
    const list = (usuariosQ.data ?? []).filter(
      (u) => u.activo !== false && !esUsuarioMantenedor(u),
    );
    if (!q) return list;
    return list.filter((u) => `${u.nombre} ${u.email ?? ''}`.toLowerCase().includes(q));
  }, [usuariosQ.data, grupoUserSearch]);

  const usuariosActivos = useMemo(
    () =>
      (usuariosQ.data ?? []).filter(
        (u) => u.activo !== false && !esUsuarioMantenedor(u),
      ),
    [usuariosQ.data],
  );

  /**
   * Candidatos del modal de aprobador(es):
   * - Con grupo: solo miembros del grupo
   * - Excluye quien ya firma en CUALQUIER nivel del grupo (principal o co-aprobador)
   * - En edición: solo reinyecta IDs de ESTE nodo que no estén en otro nivel
   */
  const escalaUsuariosOpciones = useMemo(() => {
    const grupo = escalaForm.grupoId
      ? ((gruposQ.data ?? []) as GrupoAprobacion[]).find((g) => g.id === escalaForm.grupoId)
      : undefined;

    const usadosEnOtrosNiveles = new Set<string>();
    if (escalaForm.grupoId) {
      for (const n of (escalasQ.data ?? []) as NodoEscalaAprobacion[]) {
        if (n.grupoId !== escalaForm.grupoId || !n.activo) continue;
        if (escalaModo === 'edit' && editingEscala && n.id === editingEscala.id) continue;
        usadosEnOtrosNiveles.add(n.usuarioId);
        for (const a of n.aprobadores ?? []) usadosEnOtrosNiveles.add(a.usuarioId);
      }
    }
    if (escalaForm.insertAfterUsuarioId) usadosEnOtrosNiveles.add(escalaForm.insertAfterUsuarioId);
    // Destino de escala = otro nivel: no puede ser co-aprobador del nivel actual
    if (escalaForm.escalaAUsuarioId) usadosEnOtrosNiveles.add(escalaForm.escalaAUsuarioId);

    const keepOnEdit = new Set<string>();
    if (escalaModo === 'edit' && editingEscala) {
      // El principal del nodo siempre se mantiene (identidad del nodo)
      keepOnEdit.add(editingEscala.usuarioId);
      for (const id of escalaForm.aprobadoresExtra) {
        if (!usadosEnOtrosNiveles.has(id)) keepOnEdit.add(id);
      }
    }

    const miembroIds = grupo
      ? new Set<string>([
        ...(grupo.miembroIds ?? []),
        ...(grupo.miembros ?? []).map((m) => m.id),
        grupo.aprobadorInicialId,
      ])
      : null;

    let list = usuariosActivos.filter((u) => {
      if (miembroIds && !miembroIds.has(u.id)) return false;
      if (usadosEnOtrosNiveles.has(u.id) && !keepOnEdit.has(u.id)) return false;
      return true;
    });

    for (const id of keepOnEdit) {
      if (list.some((u) => u.id === id)) continue;
      const u = usuariosActivos.find((x) => x.id === id);
      if (u) list = [...list, u];
    }

    return list;
  }, [
    escalaForm.grupoId,
    escalaForm.usuarioId,
    escalaForm.escalaAUsuarioId,
    escalaForm.insertAfterUsuarioId,
    escalaForm.aprobadoresExtra,
    escalaModo,
    editingEscala,
    gruposQ.data,
    escalasQ.data,
    usuariosActivos,
  ]);

  /** Lista AND/OR: buscador + marcados arriba (principal primero). */
  const escalaUsuariosAndOrLista = useMemo(() => {
    const q = escalaUserSearch.trim().toLowerCase();
    const checkedIds = new Set<string>([
      ...(escalaForm.usuarioId ? [escalaForm.usuarioId] : []),
      ...escalaForm.aprobadoresExtra,
    ]);
    let list = escalaUsuariosOpciones;
    if (q) {
      list = list.filter((u) => `${u.nombre} ${u.email ?? ''}`.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const aChk = checkedIds.has(a.id);
      const bChk = checkedIds.has(b.id);
      if (aChk !== bChk) return aChk ? -1 : 1;
      if (a.id === escalaForm.usuarioId) return -1;
      if (b.id === escalaForm.usuarioId) return 1;
      return a.nombre.localeCompare(b.nombre, 'es');
    });
  }, [
    escalaUsuariosOpciones,
    escalaUserSearch,
    escalaForm.usuarioId,
    escalaForm.aprobadoresExtra,
  ]);

  /** Destinos de «Escala a»: en edición solo el siguiente en cadena; en creación cualquier usuario activo. */
  const escalaSiguienteEnCadena = useMemo(() => {
    if (escalaModo !== 'edit' || !escalaForm.grupoId || !escalaForm.usuarioId) return null;
    const grupo = ((gruposQ.data ?? []) as GrupoAprobacion[]).find((g) => g.id === escalaForm.grupoId);
    if (!grupo) return null;
    const nodosGrupo = ((escalasQ.data ?? []) as NodoEscalaAprobacion[]).filter(
      (n) => n.grupoId === escalaForm.grupoId && n.modulo === escalaForm.modulo && n.activo,
    );
    return getSiguienteEnCadenaGrupo(grupo, nodosGrupo, escalaForm.usuarioId);
  }, [escalaModo, escalaForm.grupoId, escalaForm.modulo, escalaForm.usuarioId, gruposQ.data, escalasQ.data]);

  const escalaEsNodoFinal = useMemo(() => {
    if (escalaModo !== 'edit' || !escalaForm.grupoId || !editingEscala) return false;
    const grupo = ((gruposQ.data ?? []) as GrupoAprobacion[]).find((g) => g.id === escalaForm.grupoId);
    if (!grupo) return false;
    const nodosGrupo = nodosActivosDelGrupo(grupo, (escalasQ.data ?? []) as NodoEscalaAprobacion[]);
    const final = getNodoFinalCadena(grupo, nodosGrupo);
    return final?.id === editingEscala.id;
  }, [escalaModo, escalaForm.grupoId, editingEscala, gruposQ.data, escalasQ.data]);

  const escalaDestinoOpciones = useMemo(() => {
    if (escalaModo === 'edit') {
      const ids = new Set<string>();
      if (escalaSiguienteEnCadena) ids.add(escalaSiguienteEnCadena);
      if (editingEscala?.escalaAUsuarioId) ids.add(editingEscala.escalaAUsuarioId);
      return usuariosActivos.filter((u) => ids.has(u.id));
    }
    const exclude = new Set([
      escalaForm.usuarioId,
      ...escalaForm.aprobadoresExtra,
    ].filter(Boolean));
    let list = usuariosActivos.filter((u) => !exclude.has(u.id));
    // Mantener el destino actual visible aunque esté en exclude por error
    if (escalaForm.escalaAUsuarioId && !list.some((u) => u.id === escalaForm.escalaAUsuarioId)) {
      const u = usuariosActivos.find((x) => x.id === escalaForm.escalaAUsuarioId);
      if (u) list = [...list, u];
    }
    return list;
  }, [
    escalaModo,
    escalaSiguienteEnCadena,
    editingEscala?.escalaAUsuarioId,
    usuariosActivos,
    escalaForm.usuarioId,
    escalaForm.aprobadoresExtra,
    escalaForm.escalaAUsuarioId,
  ]);

  useEffect(() => {
    if (escalaModo !== 'edit' || !escalaOpen) return;
    if (escalaEsNodoFinal && escalaForm.escalaAUsuarioId) {
      setEscalaForm((s) => ({ ...s, escalaAUsuarioId: '' }));
      return;
    }
    const allowed = new Set(escalaDestinoOpciones.map((u) => u.id));
    const current = escalaForm.escalaAUsuarioId;
    if (current && !allowed.has(current)) {
      setEscalaForm((s) => ({
        ...s,
        escalaAUsuarioId: escalaSiguienteEnCadena ?? '',
      }));
    }
  }, [
    escalaModo,
    escalaOpen,
    escalaEsNodoFinal,
    escalaDestinoOpciones,
    escalaSiguienteEnCadena,
    escalaForm.escalaAUsuarioId,
  ]);

  const escalaMontoMaxError = useMemo(
    () => getEscalaMontoMaxFieldError(
      escalaForm,
      escalaModo,
      editingEscala,
      (escalasQ.data ?? []) as NodoEscalaAprobacion[],
      userMap,
    ),
    [escalaForm, escalaModo, editingEscala, escalasQ.data, userMap],
  );

  const escalaCadenaMontoError = useMemo(
    () => validateMontosEscalaCadena(
      buildEscalaNodosCadena(
        escalaForm,
        escalaModo,
        editingEscala,
        (escalasQ.data ?? []) as NodoEscalaAprobacion[],
      ),
      userMap,
    ),
    [escalaForm, escalaModo, editingEscala, escalasQ.data, userMap],
  );

  const escalaDestinoError = useMemo(() => {
    if (escalaModo !== 'edit') return null;
    if (escalaEsNodoFinal) {
      return escalaForm.escalaAUsuarioId.trim()
        ? 'El aprobador final cierra la cadena: no se puede agregar un nivel a la derecha.'
        : null;
    }
    const dest = escalaForm.escalaAUsuarioId.trim() || null;
    const permitidos = new Set<string | null>([
      null,
      escalaSiguienteEnCadena,
      editingEscala?.escalaAUsuarioId ?? null,
    ]);
    if (!permitidos.has(dest)) {
      return 'Solo puede escalar al siguiente en la cadena o cerrar la cadena.';
    }
    return null;
  }, [escalaModo, escalaEsNodoFinal, escalaForm.escalaAUsuarioId, escalaSiguienteEnCadena, editingEscala?.escalaAUsuarioId]);

  const escalaMontoInvalid = escalaMontoMaxError ?? escalaCadenaMontoError;
  const escalaFormInvalid = escalaMontoInvalid || !!escalaDestinoError;

  const openCreateDeleg = () => {
    setEditingDeleg(null);
    setDelegForm(emptyDeleg);
    setDelegOpen(true);
  };

  const openEditDeleg = (row: DelegacionAprobacion) => {
    setEditingDeleg(row);
    setDelegForm({
      titularId: row.titularId,
      suplenteId: row.suplenteId,
      modulo: row.modulo ?? '',
      vigenciaDesde: row.vigenciaDesde.slice(0, 10),
      vigenciaHasta: row.vigenciaHasta?.slice(0, 10) ?? '',
      motivo: row.motivo ?? '',
      activo: row.activo,
    });
    setDelegOpen(true);
  };

  const saveDeleg = async () => {
    if (!delegForm.titularId || !delegForm.suplenteId) {
      toast.error('Titular y suplente requeridos');
      return;
    }
    if (delegForm.titularId === delegForm.suplenteId) {
      toast.error('Titular y suplente deben ser distintos');
      return;
    }
    setDelegSaving(true);
    try {
      const payload = {
        titularId: delegForm.titularId,
        suplenteId: delegForm.suplenteId,
        modulo: delegForm.modulo.trim() || null,
        vigenciaDesde: delegForm.vigenciaDesde,
        vigenciaHasta: delegForm.vigenciaHasta.trim() || null,
        motivo: delegForm.motivo.trim() || null,
        activo: delegForm.activo,
      };
      if (editingDeleg) await api.updateDelegacionAprobacion(editingDeleg.id, payload);
      else await api.createDelegacionAprobacion(payload);
      toast.success(editingDeleg ? 'Suplencia actualizada' : 'Suplencia creada');
      setDelegOpen(false);
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'delegaciones-aprobacion') });
    } catch (e) {
      handleConfigError(e);
    } finally {
      setDelegSaving(false);
    }
  };

  const doRemoveDeleg = async () => {
    if (!confirmDeleteDeleg) return;
    try {
      await api.deleteDelegacionAprobacion(confirmDeleteDeleg.id);
      toast.success('Suplencia eliminada');
      setConfirmDeleteDeleg(null);
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'delegaciones-aprobacion') });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  };

  const usuariosSinGrupo = useMemo(() => {
    const grupos = (gruposQ.data ?? []) as GrupoAprobacion[];
    const activos = usuariosActivos;
    const asignados = new Set<string>();
    for (const g of grupos.filter((x) => x.activo && x.modulo === gruposMapaModulo)) {
      for (const id of g.miembroIds ?? []) asignados.add(id);
    }
    return activos.filter((u) => !asignados.has(u.id));
  }, [gruposQ.data, usuariosActivos, gruposMapaModulo]);

  const openCreateGrupo = () => {
    setEditingGrupo(null);
    setGrupoForm(emptyGrupo);
    setGrupoUserSearch('');
    setGrupoOpen(true);
  };

  const openEditGrupo = (row: GrupoAprobacion) => {
    setSelectedGrupoId(row.id);
    setEditingGrupo(row);
    const nodosGrupo = nodosActivosDelGrupo(row, (escalasQ.data ?? []) as NodoEscalaAprobacion[]);
    const finalNodo = getNodoFinalCadena(row, nodosGrupo);
    setGrupoForm({
      nombre: row.nombre,
      modulo: row.modulo,
      aprobadorFinalId: finalNodo?.usuarioId ?? row.aprobadorInicialId,
      miembroIds: row.miembroIds ?? [],
      activo: row.activo,
    });
    setGrupoUserSearch('');
    setGrupoOpen(true);
  };

  const saveGrupo = async () => {
    if (!grupoForm.nombre.trim() || !grupoForm.aprobadorFinalId) {
      toast.error('Nombre y aprobador final requeridos');
      return;
    }
    setGrupoSaving(true);
    try {
      if (editingGrupo) {
        const nodosGrupo = nodosActivosDelGrupo(editingGrupo, (escalasQ.data ?? []) as NodoEscalaAprobacion[]);
        const cadena = walkCadenaGrupo(editingGrupo, nodosGrupo);
        const finalNodo = cadena[cadena.length - 1] ?? null;
        const unicoNivel = cadena.length <= 1;
        await api.updateGrupoAprobacion(editingGrupo.id, {
          nombre: grupoForm.nombre.trim(),
          modulo: grupoForm.modulo.trim(),
          aprobadorInicialId: unicoNivel ? grupoForm.aprobadorFinalId : editingGrupo.aprobadorInicialId,
          miembroIds: grupoForm.miembroIds,
          activo: grupoForm.activo,
        });
        if (finalNodo && finalNodo.usuarioId !== grupoForm.aprobadorFinalId) {
          await api.updateNodoEscalaAprobacion(finalNodo.id, {
            grupoId: editingGrupo.id,
            modulo: grupoForm.modulo.trim(),
            usuarioId: grupoForm.aprobadorFinalId,
            logica: finalNodo.logica ?? 'SIMPLE',
            aprobadoresExtra: (finalNodo.aprobadores ?? [])
              .map((a) => a.usuarioId)
              .filter((id) => id !== finalNodo.usuarioId),
            montoMax: finalNodo.montoMax,
            escalaAUsuarioId: null,
            activo: finalNodo.activo,
          });
        }
      } else {
        await api.createGrupoAprobacion({
          nombre: grupoForm.nombre.trim(),
          modulo: grupoForm.modulo.trim(),
          aprobadorInicialId: grupoForm.aprobadorFinalId,
          miembroIds: grupoForm.miembroIds,
          activo: grupoForm.activo,
        });
      }
      toast.success(editingGrupo ? 'Grupo actualizado' : 'Grupo creado');
      setGrupoOpen(false);
      await invalidateAprobacionesConfig();
    } catch (e) {
      handleConfigError(e);
    } finally {
      setGrupoSaving(false);
    }
  };

  const doRemoveGrupo = async () => {
    if (!confirmDeleteGrupo) return;
    try {
      await api.deleteGrupoAprobacion(confirmDeleteGrupo.id);
      toast.success('Grupo eliminado');
      setConfirmDeleteGrupo(null);
      await qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'grupos-aprobacion') });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  };

  const openCreateEscala = (opts?: { grupo?: GrupoAprobacion; modulo?: string; usuarioId?: string }) => {
    setEditingEscala(null);
    setEscalaModo('create');
    setEscalaUserSearch('');
    const grupo = opts?.grupo
      ?? ((gruposQ.data ?? []) as GrupoAprobacion[]).find(
        (g) => g.id === (selectedGrupoId ?? '') && g.activo,
      );
    const modulo = grupo?.modulo ?? opts?.modulo ?? mapaModulo ?? emptyEscala.modulo;
    setEscalaForm({
      ...emptyEscala,
      grupoId: grupo?.id ?? '',
      modulo,
      usuarioId: grupo?.aprobadorInicialId ?? opts?.usuarioId ?? '',
    });
    if (grupo) setSelectedGrupoId(grupo.id);
    setEscalaOpen(true);
  };

  const openEditEscala = (row: NodoEscalaAprobacion) => {
    setSelectedEscalaId(row.id);
    setEditingEscala(row);
    setEscalaModo('edit');
    setEscalaUserSearch('');
    // Quitar del form co-aprobadores que ya firman en otro nivel del grupo
    const usadosEnOtros = new Set<string>();
    for (const n of (escalasQ.data ?? []) as NodoEscalaAprobacion[]) {
      if (n.grupoId !== row.grupoId || !n.activo || n.id === row.id) continue;
      usadosEnOtros.add(n.usuarioId);
      for (const a of n.aprobadores ?? []) usadosEnOtros.add(a.usuarioId);
    }
    const extrasLimpios = (row.aprobadores ?? [])
      .map((a) => a.usuarioId)
      .filter((id) => id !== row.usuarioId && !usadosEnOtros.has(id));
    const logica = row.logica ?? 'SIMPLE';
    setEscalaForm({
      grupoId: row.grupoId,
      modulo: row.modulo,
      usuarioId: row.usuarioId,
      logica: logica !== 'SIMPLE' && extrasLimpios.length < 1 ? 'SIMPLE' : logica,
      aprobadoresExtra: extrasLimpios,
      montoMax: row.montoMax != null ? String(row.montoMax) : '',
      escalaAUsuarioId: row.escalaAUsuarioId ?? '',
      insertAfterUsuarioId: '',
      activo: row.activo,
    });
    if (row.grupoId) setSelectedGrupoId(row.grupoId);
    setEscalaOpen(true);
  };

  const applyGrupoToEscalaForm = (grupoId: string) => {
    if (escalaModo === 'insert' || escalaModo === 'insertAfter' || escalaModo === 'edit') return;
    const grupo = ((gruposQ.data ?? []) as GrupoAprobacion[]).find((g) => g.id === grupoId);
    if (!grupo) {
      setEscalaForm((s) => ({ ...s, grupoId: '' }));
      return;
    }
    const miembroIds = new Set<string>([
      ...(grupo.miembroIds ?? []),
      ...(grupo.miembros ?? []).map((m) => m.id),
      grupo.aprobadorInicialId,
    ]);
    setSelectedGrupoId(grupo.id);
    setEscalaForm((s) => ({
      ...s,
      grupoId: grupo.id,
      modulo: grupo.modulo,
      usuarioId: grupo.aprobadorInicialId,
      escalaAUsuarioId: s.escalaAUsuarioId && miembroIds.has(s.escalaAUsuarioId)
        ? s.escalaAUsuarioId
        : '',
    }));
  };

  /**
   * Desde el mapa:
   * - sin nodo de entrada → crear nodo de la entrada
   * - con nodo de entrada → insertar intermedio (NO editar/cambiar el aprobador del nodo existente)
   */
  const openEscalaFromGrupo = (grupo: GrupoAprobacion) => {
    setSelectedGrupoId(grupo.id);
    const existente = ((escalasQ.data ?? []) as NodoEscalaAprobacion[]).find(
      (n) =>
        n.grupoId === grupo.id
        && n.modulo === grupo.modulo
        && n.usuarioId === grupo.aprobadorInicialId
        && n.activo,
    );
    if (!existente) {
      openCreateEscala({ grupo });
      return;
    }
    // Insertar delante: nuevo nodo → escala a la entrada actual; el grupo cambia de entrada.
    setEditingEscala(null);
    setEscalaModo('insert');
    setEscalaUserSearch('');
    setEscalaForm({
      ...emptyEscala,
      grupoId: grupo.id,
      modulo: grupo.modulo,
      usuarioId: '',
      escalaAUsuarioId: grupo.aprobadorInicialId,
      activo: true,
    });
    setEscalaOpen(true);
  };

  const invalidateAprobacionesConfig = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'escalas-aprobacion') }),
      qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'grupos-aprobacion') }),
      qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'admin-concepto') }),
      qc.invalidateQueries({ queryKey: listQueryKey(scope, empresaId, 'delegaciones-aprobacion') }),
    ]);
  };

  const saveEscala = async (reasignacion?: {
    confirmarReasignacion: boolean;
    nuevoAprobadorId: string;
  }) => {
    if (!escalaForm.grupoId) {
      toast.error('Debe elegir el grupo de la escala');
      return;
    }
    if (!escalaForm.usuarioId) {
      toast.error(escalaForm.logica === 'SIMPLE'
        ? 'Aprobador requerido'
        : 'Seleccione al menos un aprobador');
      return;
    }
    if (escalaForm.logica !== 'SIMPLE' && escalaForm.aprobadoresExtra.length < 1) {
      toast.error(`Lógica ${escalaForm.logica} requiere al menos 2 aprobadores`);
      return;
    }

    // Un usuario no puede firmar en dos niveles del mismo grupo
    {
      const usadosEnOtros = new Set<string>();
      for (const n of (escalasQ.data ?? []) as NodoEscalaAprobacion[]) {
        if (n.grupoId !== escalaForm.grupoId || !n.activo) continue;
        if (escalaModo === 'edit' && editingEscala && n.id === editingEscala.id) continue;
        usadosEnOtros.add(n.usuarioId);
        for (const a of n.aprobadores ?? []) usadosEnOtros.add(a.usuarioId);
      }
      const candidatos = [
        escalaForm.usuarioId,
        ...(escalaForm.logica !== 'SIMPLE' ? escalaForm.aprobadoresExtra : []),
      ];
      const conflicto = candidatos.find((id) => usadosEnOtros.has(id));
      if (conflicto) {
        const nombre = userMap.get(conflicto) ?? conflicto;
        toast.error(`${nombre} ya participa en otro nivel de este grupo`);
        return;
      }
      if (
        escalaForm.logica !== 'SIMPLE'
        && escalaForm.escalaAUsuarioId
        && escalaForm.aprobadoresExtra.includes(escalaForm.escalaAUsuarioId)
      ) {
        toast.error('Un co-aprobador no puede ser también el destino «Escala a»');
        return;
      }
    }

    if (escalaModo === 'insert') {
      if (!escalaForm.escalaAUsuarioId) {
        toast.error('Para insertar un intermedio debe indicar a quién escala');
        return;
      }
      if (escalaForm.usuarioId === escalaForm.escalaAUsuarioId) {
        toast.error('El intermedio no puede ser la misma persona que la entrada actual');
        return;
      }
    }
    if (escalaModo === 'insertAfter') {
      if (!escalaForm.insertAfterUsuarioId) {
        toast.error('Falta el nodo predecesor en la cadena');
        return;
      }
      if (escalaForm.usuarioId === escalaForm.insertAfterUsuarioId) {
        toast.error('El intermedio no puede ser la misma persona que el predecesor');
        return;
      }
    }

    const montoNuevo = escalaForm.montoMax.trim() ? Number(escalaForm.montoMax) : null;
    const escalaDestino = escalaEsNodoFinal
      ? null
      : resolveEscalaDestinoUsuarioId(
        escalaForm,
        escalaModo,
        (escalasQ.data ?? []) as NodoEscalaAprobacion[],
      );
    if (escalaFormInvalid) return;

    setEscalaSaving(true);
    try {
      const payload: Record<string, unknown> = {
        grupoId: escalaForm.grupoId,
        modulo: escalaForm.modulo.trim(),
        usuarioId: escalaForm.usuarioId,
        logica: escalaForm.logica,
        aprobadoresExtra: escalaForm.logica !== 'SIMPLE' ? escalaForm.aprobadoresExtra : [],
        montoMax: montoNuevo,
        escalaAUsuarioId: escalaDestino,
        activo: escalaForm.activo,
      };
      if (escalaModo === 'insertAfter' && escalaForm.insertAfterUsuarioId) {
        payload.insertAfterUsuarioId = escalaForm.insertAfterUsuarioId;
      }
      if (reasignacion) {
        payload.confirmarReasignacion = reasignacion.confirmarReasignacion;
        payload.nuevoAprobadorId = reasignacion.nuevoAprobadorId;
      }

      if (escalaModo === 'edit' && editingEscala) {
        const usuarioCambio = editingEscala.usuarioId !== escalaForm.usuarioId;
        if (usuarioCambio && !reasignacion) {
          const preview = await api.previewPendientesNodoEscala(editingEscala.id);
          if (preview.count > 0) {
            setImpactoPendientes({
              mode: 'update',
              nodo: editingEscala,
              items: preview.items,
              sugeridoAprobadorId: escalaForm.usuarioId || preview.sugeridoAprobadorId,
              payload,
            });
            return;
          }
        }
        await api.updateNodoEscalaAprobacion(editingEscala.id, payload);
        toast.success('Nodo actualizado');
      } else if (escalaModo === 'insertAfter') {
        await api.createNodoEscalaAprobacion(payload);
        toast.success('Aprobador intermedio insertado en la cadena');
      } else if (escalaModo === 'insert') {
        const grupo = ((gruposQ.data ?? []) as GrupoAprobacion[]).find((g) => g.id === escalaForm.grupoId);
        if (!grupo) throw new Error('Grupo no encontrado');
        await api.createNodoEscalaAprobacion(payload);
        await api.updateGrupoAprobacion(grupo.id, {
          nombre: grupo.nombre,
          modulo: grupo.modulo,
          aprobadorInicialId: escalaForm.usuarioId,
          miembroIds: grupo.miembroIds?.length
            ? grupo.miembroIds
            : (grupo.miembros ?? []).map((m) => m.id),
          activo: grupo.activo,
        });
        toast.success('Aprobador intermedio insertado · entrada del grupo actualizada');
      } else {
        await api.createNodoEscalaAprobacion(payload);
        toast.success('Nodo creado');
      }
      setEscalaOpen(false);
      setImpactoPendientes(null);
      await invalidateAprobacionesConfig();
    } catch (e) {
      handleConfigError(e);
    } finally {
      setEscalaSaving(false);
    }
  };

  const requestDeleteEscala = async (nodo: NodoEscalaAprobacion) => {
    const grupo = ((gruposQ.data ?? []) as GrupoAprobacion[]).find((g) => g.id === nodo.grupoId);
    if (grupo) {
      const finalNodo = getNodoFinalCadena(grupo, nodosActivosDelGrupo(grupo, (escalasQ.data ?? []) as NodoEscalaAprobacion[]));
      if (finalNodo?.id === nodo.id) {
        toast.error('No se puede eliminar el aprobador final. Cámbielo al editar el nodo o el grupo.');
        return;
      }
    }
    try {
      const preview = await api.previewPendientesNodoEscala(nodo.id);
      if (preview.count > 0) {
        setImpactoPendientes({
          mode: 'delete',
          nodo,
          items: preview.items,
          sugeridoAprobadorId: preview.sugeridoAprobadorId,
        });
        return;
      }
      setConfirmDeleteEscala(nodo);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al consultar pendientes');
    }
  };

  const doRemoveEscala = async (reasignacion?: {
    confirmarReasignacion: boolean;
    nuevoAprobadorId: string;
  }) => {
    const nodo = reasignacion ? impactoPendientes?.nodo : confirmDeleteEscala;
    if (!nodo) return;
    try {
      if (reasignacion) setImpactoBusy(true);
      await api.deleteNodoEscalaAprobacion(nodo.id, reasignacion);
      toast.success('Nodo eliminado · cadena reencadenada');
      setConfirmDeleteEscala(null);
      setImpactoPendientes(null);
      await invalidateAprobacionesConfig();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setImpactoBusy(false);
    }
  };

  const confirmImpactoPendientes = async (nuevoAprobadorId: string) => {
    if (!impactoPendientes) return;
    setImpactoBusy(true);
    try {
      if (impactoPendientes.mode === 'delete') {
        await doRemoveEscala({ confirmarReasignacion: true, nuevoAprobadorId });
        return;
      }
      const payload = {
        ...(impactoPendientes.payload ?? {}),
        confirmarReasignacion: true,
        nuevoAprobadorId,
      };
      await api.updateNodoEscalaAprobacion(impactoPendientes.nodo.id, payload);
      toast.success('Nodo actualizado · pendientes reasignados');
      setEscalaOpen(false);
      setImpactoPendientes(null);
      await invalidateAprobacionesConfig();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setImpactoBusy(false);
    }
  };

  const runSimulacion = async () => {
    setSimLoading(true);
    try {
      const payload: Record<string, unknown> = {
        modulo: simModulo,
        monto: Number(simMonto) || 0,
      };
      if (simGrupoId) payload.grupoId = simGrupoId;
      else if (simUsuarioId) payload.usuarioId = simUsuarioId;
      else {
        toast.error('Seleccione grupo o usuario');
        setSimLoading(false);
        return;
      }
      const res = await api.simularAprobacion(payload);
      setSimResult(res as SimulacionAprobacionResult);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al simular');
    } finally {
      setSimLoading(false);
    }
  };

  const toggleGrupoMiembro = (id: string) => {
    setGrupoForm((s) => ({
      ...s,
      miembroIds: s.miembroIds.includes(id)
        ? s.miembroIds.filter((x) => x !== id)
        : [...s.miembroIds, id],
    }));
  };

  const gruposDelModuloEscala = useMemo(
    () => ((gruposQ.data ?? []) as GrupoAprobacion[]).filter((g) => g.modulo === mapaModulo && g.activo),
    [gruposQ.data, mapaModulo],
  );

  const escalasRows = useMemo(
    () => ((escalasQ.data ?? []) as NodoEscalaAprobacion[]).filter((n) => n.modulo === mapaModulo),
    [escalasQ.data, mapaModulo],
  );

  const gruposRowsVisuales = useMemo(
    () => ((gruposQ.data ?? []) as GrupoAprobacion[]).filter((g) => g.modulo === gruposMapaModulo),
    [gruposQ.data, gruposMapaModulo],
  );

  const gruposFiltradasPorBusqueda = useMemo(() => {
    const q = grupoSearch.trim().toLowerCase();
    if (!q) return gruposDelModuloEscala;
    return gruposDelModuloEscala.filter((g) => g.nombre.toLowerCase().includes(q));
  }, [gruposDelModuloEscala, grupoSearch]);

  const escalasFiltradasPorBusqueda = useMemo(() => {
    const q = grupoSearch.trim().toLowerCase();
    if (!q) return escalasRows;
    const grupoIds = new Set(gruposFiltradasPorBusqueda.map((g) => g.id));
    return escalasRows.filter((n) => grupoIds.has(n.grupoId));
  }, [escalasRows, gruposFiltradasPorBusqueda, grupoSearch]);

  /** Usuario resuelto por nombre/email para highlight en mapa (primer match). */
  const highlightUsuarioId = useMemo(() => {
    const q = mapaUserSearch.trim().toLowerCase();
    if (!q) return null;
    const list = (usuariosQ.data ?? []).filter((u) => u.activo !== false);
    const hit = list.find((u) => {
      const hay = `${u.nombre} ${u.email ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
    return hit?.id ?? null;
  }, [mapaUserSearch, usuariosQ.data]);

  const coincidenciasUsuario = useMemo(() => {
    if (!highlightUsuarioId) return 0;
    const uid = highlightUsuarioId;
    let n = 0;
    for (const g of gruposFiltradasPorBusqueda) {
      const miembro =
        (g.miembroIds ?? []).includes(uid)
        || (g.miembros ?? []).some((m) => m.id === uid);
      if (miembro) n += 1;
      // Entrada cuenta aparte solo si no está ya en integrantes
      else if (g.aprobadorInicialId === uid) n += 1;
    }
    for (const nodo of escalasFiltradasPorBusqueda) {
      if (nodo.usuarioId === uid || (nodo.aprobadores ?? []).some((a) => a.usuarioId === uid)) {
        n += 1;
      }
    }
    return n;
  }, [highlightUsuarioId, gruposFiltradasPorBusqueda, escalasFiltradasPorBusqueda]);

  const delegCols: Column<DelegacionAprobacion>[] = [
    {
      key: 'titular',
      header: 'Titular',
      cell: (r) => r.titularNombre || userMap.get(r.titularId) || r.titularId,
    },
    {
      key: 'suplente',
      header: 'Suplente',
      cell: (r) => r.suplenteNombre || userMap.get(r.suplenteId) || r.suplenteId,
    },
    { key: 'modulo', header: 'Módulo', cell: (r) => r.modulo || 'Todos' },
    {
      key: 'vigencia',
      header: 'Vigencia',
      cell: (r) => `${fmtDate(r.vigenciaDesde)} – ${r.vigenciaHasta ? fmtDate(r.vigenciaHasta) : '∞'}`,
    },
    { key: 'motivo', header: 'Motivo', cell: (r) => r.motivo || '—' },
    { key: 'activo', header: 'Activo', cell: (r) => (r.activo ? 'Sí' : 'No') },
    {
      key: 'acc',
      header: '',
      cell: (r) => (
        <span className="inline-flex gap-1">
          <Button size="sm" variant="outline" onClick={() => openEditDeleg(r)}>Editar</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteDeleg(r)}>Eliminar</Button>
        </span>
      ),
    },
  ];

  const grupoCols: Column<GrupoAprobacion>[] = [
    { key: 'nombre', header: 'Grupo', cell: (r) => r.nombre },
    { key: 'modulo', header: 'Módulo', cell: (r) => r.modulo },
    {
      key: 'entrada',
      header: 'Aprobador inicial',
      cell: (r) => r.aprobadorInicialNombre || userMap.get(r.aprobadorInicialId) || r.aprobadorInicialId,
    },
    {
      key: 'miembros',
      header: 'Miembros',
      cell: (r) =>
        (r.miembroIds ?? []).map((id) => userMap.get(id) ?? id).join(', ') || '—',
    },
    { key: 'activo', header: 'Activo', cell: (r) => (r.activo ? 'Sí' : 'No') },
    {
      key: 'acc',
      header: '',
      cell: (r) => (
        <span className="inline-flex gap-1">
          <Button size="sm" variant="outline" onClick={() => openEditGrupo(r)}>Editar</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteGrupo(r)}>Eliminar</Button>
        </span>
      ),
    },
  ];

  const escalaCols: Column<NodoEscalaAprobacion>[] = [
    { key: 'modulo', header: 'Módulo', cell: (r) => r.modulo },
    {
      key: 'grupo',
      header: 'Grupo',
      filterType: 'select',
      filterOptions: gruposDelModuloEscala.map((g) => ({ value: g.nombre, label: g.nombre })),
      filterValue: (r) => r.grupoNombre || '',
      sortValue: (r) => r.grupoNombre || '',
      cell: (r) => r.grupoNombre || '—',
    },
    {
      key: 'usuario',
      header: 'Aprobador',
      cell: (r) => r.usuarioNombre || userMap.get(r.usuarioId) || r.usuarioId,
    },
    {
      key: 'tope',
      header: 'Tope CLP',
      cell: (r) => (r.montoMax != null ? r.montoMax.toLocaleString('es-CL') : '(sin tope)'),
    },
    {
      key: 'escala',
      header: 'Escala a',
      cell: (r) =>
        r.escalaANombre || (r.escalaAUsuarioId ? userMap.get(r.escalaAUsuarioId) : '—') || '—',
    },
    { key: 'activo', header: 'Activo', cell: (r) => (r.activo ? 'Sí' : 'No') },
    {
      key: 'acc',
      header: '',
      cell: (r) => (
        <span className="inline-flex gap-1">
          <Button size="sm" variant="outline" onClick={() => openEditEscala(r)}>Editar</Button>
          <Button size="sm" variant="ghost" onClick={() => void requestDeleteEscala(r)}>Eliminar</Button>
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-[calc(100dvh-var(--header-h,4rem))]">
      <PageHeader
        title="Reglas de aprobación"
        subtitle="Grupos de solicitud, escalas A→B→C→D, suplencias y simulador. La cadena se calcula automáticamente al emitir."
        breadcrumbs={['Administración']}
      />

      {/* FilterBar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
        <Select
          value={mapaModulo}
          onChange={(e) => { setMapaModulo(e.target.value); setGruposMapaModulo(e.target.value); }}
          aria-label="Módulo"
        >
          {modulosDisponibles.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </Select>
        <Input
          placeholder="Buscar grupo…"
          value={grupoSearch}
          onChange={(e) => setGrupoSearch(e.target.value)}
          className="w-44"
          aria-label="Buscar grupo"
        />
        <Input
          placeholder="Buscar usuario…"
          value={mapaUserSearch}
          onChange={(e) => setMapaUserSearch(e.target.value)}
          className="w-44"
          aria-label="Buscar usuario"
        />
        {mapaUserSearch.trim() ? (
          <span className="text-xs text-[var(--color-muted)]" aria-live="polite">
            {coincidenciasUsuario} coincidencia{coincidenciasUsuario === 1 ? '' : 's'}
          </span>
        ) : null}
        <div className="flex overflow-hidden rounded-lg border border-[var(--color-border)]">
          <button
            type="button"
            onClick={() => setViewMode('levels')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
              viewMode === 'levels'
                ? 'bg-[var(--color-accent)] text-white'
                : 'text-[var(--color-text)] hover:bg-[var(--color-surface-2)]'
            }`}
          >
            <LayoutList size={14} aria-hidden /> Niveles
          </button>
          <button
            type="button"
            onClick={() => setViewMode('tree')}
            className={`inline-flex items-center gap-1.5 border-l border-[var(--color-border)] px-3 py-1.5 text-sm transition-colors ${
              viewMode === 'tree'
                ? 'bg-[var(--color-accent)] text-white'
                : 'text-[var(--color-text)] hover:bg-[var(--color-surface-2)]'
            }`}
          >
            <GitBranch size={14} aria-hidden /> Árbol
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                const config = await api.exportAprobacionesConfig(mapaModulo);
                const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `aprobaciones-${mapaModulo}-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success('Configuración exportada');
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Error al exportar');
              }
            }}
            title="Exportar configuración como JSON"
          >
            ⬇ Exportar
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Settings size={14} />}
            onClick={() => setSlidePanelOpen(true)}
          >
            Configurar
          </Button>
        </div>
      </div>

      {/* Área visual principal (min-h-0 para que Niveles gestione su propio scroll sticky) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        {viewMode === 'tree' ? (
          <EscalasTopologyPanel
            nodos={escalasFiltradasPorBusqueda}
            grupos={gruposFiltradasPorBusqueda}
            modulo={mapaModulo}
            selectedNodoId={selectedEscalaId}
            selectedGrupoId={selectedGrupoId}
            highlightUsuarioId={highlightUsuarioId}
            onEditNodo={openEditEscala}
            onEditGrupo={openEditGrupo}
            onAddEscalaFromGrupo={openEscalaFromGrupo}
            onDeleteNodo={(n) => void requestDeleteEscala(n)}
            onAddBetweenNodos={(grupo, afterUserId, nextUserId) => {
              setEscalaUserSearch('');
              if (afterUserId === grupo.aprobadorInicialId && nextUserId === grupo.aprobadorInicialId) {
                setEscalaModo('insert');
                setEscalaForm({ ...emptyEscala, grupoId: grupo.id, modulo: grupo.modulo, escalaAUsuarioId: afterUserId });
              } else {
                setEscalaModo('insertAfter');
                setEscalaForm({
                  ...emptyEscala,
                  grupoId: grupo.id,
                  modulo: grupo.modulo,
                  insertAfterUsuarioId: afterUserId,
                  escalaAUsuarioId: nextUserId ?? '',
                });
              }
              setEscalaOpen(true);
            }}
          />
        ) : (
          <LevelView
            nodos={escalasFiltradasPorBusqueda}
            grupos={gruposFiltradasPorBusqueda}
            modulo={mapaModulo}
            selectedNodoId={selectedEscalaId}
            selectedGrupoId={selectedGrupoId}
            highlightUsuarioId={highlightUsuarioId}
            onEditNodo={openEditEscala}
            onEditGrupo={openEditGrupo}
            onAddEscalaFromGrupo={openEscalaFromGrupo}
            onDeleteNodo={(n) => void requestDeleteEscala(n)}
            onAddBetweenNodos={(grupo, afterUserId, nextUserId) => {
              setEscalaUserSearch('');
              setEscalaModo('insertAfter');
              setEscalaForm({
                ...emptyEscala,
                grupoId: grupo.id,
                modulo: grupo.modulo,
                insertAfterUsuarioId: afterUserId,
                escalaAUsuarioId: nextUserId ?? '',
              });
              setEscalaOpen(true);
            }}
          />
        )}
      </div>

      {/* SlidePanel de configuración */}
      <SlidePanel
        open={slidePanelOpen}
        onClose={() => setSlidePanelOpen(false)}
        title="Configuración"
        width={640}
        resizable
        minWidth={420}
        maxWidthRatio={0.92}
      >
        {/* Tabs */}
        <div className="flex shrink-0 overflow-x-auto border-b border-[var(--color-border)] px-2">
          {(['grupos', 'escalas', 'suplencias', 'simulador', 'administradores', 'import-export'] as const).map((id) => {
            const labels: Record<SlidePanelTab, string> = {
              grupos: 'Grupos',
              escalas: 'Escalas',
              suplencias: 'Suplencias',
              simulador: 'Simulador',
              administradores: 'Administradores',
              'import-export': 'Importar / Exportar',
            };
            const active = slidePanelTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSlidePanelTab(id)}
                className={
                  active
                    ? '-mb-px whitespace-nowrap border-b-2 border-[var(--color-accent)] px-3 py-2.5 text-sm font-semibold text-[var(--color-text)]'
                    : '-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]'
                }
              >
                {labels[id]}
              </button>
            );
          })}
        </div>

        {/* Contenido del tab */}
        <div className="p-4">
          {slidePanelTab === 'grupos' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <Field label="Módulo" className="mb-0 min-w-[10rem]">
                  <Select value={gruposMapaModulo} onChange={(e) => setGruposMapaModulo(e.target.value)}>
                    {modulosDisponibles.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </Select>
                </Field>
                <Button leftIcon={<Plus size={16} />} onClick={openCreateGrupo}>Nuevo grupo</Button>
              </div>
              {usuariosSinGrupo.length > 0 && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                  Usuarios sin grupo ({gruposMapaModulo}):{' '}
                  {usuariosSinGrupo.map((u) => u.nombre).join(', ')}.{' '}
                  <Link
                    to={`/admin/usuarios?sinGrupo=${encodeURIComponent(gruposMapaModulo)}`}
                    className="font-semibold underline underline-offset-2 hover:opacity-90"
                  >
                    Ver en Usuarios y asignar grupo
                  </Link>
                </p>
              )}
              {gruposQ.isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
      ) : (
        <DataTable
                  columns={grupoCols}
                  rows={gruposRowsVisuales}
                  empty="Sin grupos para este módulo. Cree equipos con aprobador inicial."
                  tableKey="admin.grupos-aprobacion"
                  onRowClick={(r) => setSelectedGrupoId(r.id)}
                />
              )}
            </div>
          )}

          {slidePanelTab === 'escalas' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button leftIcon={<Plus size={16} />} onClick={() => openCreateEscala({ modulo: mapaModulo })}>
                  Nuevo nodo
                </Button>
              </div>
              {escalasQ.isLoading ? (
                <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
              ) : (
                <DataTable
                  columns={escalaCols}
                  rows={escalasRows}
                  empty="Sin nodos de escala para este módulo."
                  tableKey="admin.escalas-aprobacion"
                  onRowClick={(r) => {
                    setSelectedEscalaId(r.id);
                    setSelectedGrupoId(r.grupoId || null);
                  }}
                />
              )}
              <DoaMatrixPanel
                grupos={(gruposQ.data ?? []) as GrupoAprobacion[]}
                nodos={(escalasQ.data ?? []) as NodoEscalaAprobacion[]}
                usuarios={usuariosActivos}
                delegaciones={delegQ.data ?? []}
                modulo={mapaModulo}
              />
            </div>
          )}

          {slidePanelTab === 'suplencias' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button leftIcon={<Plus size={16} />} onClick={openCreateDeleg}>Nueva suplencia</Button>
              </div>
              {delegQ.isLoading ? (
                <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
              ) : (
                <DataTable
                  columns={delegCols}
                  rows={delegQ.data ?? []}
                  empty="Sin suplencias configuradas."
                  tableKey="admin.delegaciones"
                />
              )}
            </div>
          )}

          {slidePanelTab === 'simulador' && (
            <div className="space-y-4">
              <Field label="Módulo">
                <Select value={simModulo} onChange={(e) => setSimModulo(e.target.value)}>
                  {modulosDisponibles.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Grupo (opcional si elige usuario)">
                <Select value={simGrupoId} onChange={(e) => { setSimGrupoId(e.target.value); setSimUsuarioId(''); }}>
                  <option value="">— Por usuario —</option>
                  {((gruposQ.data ?? []) as GrupoAprobacion[])
                    .filter((g) => g.modulo === simModulo && g.activo)
                    .map((g) => (
                      <option key={g.id} value={g.id}>{g.nombre}</option>
                    ))}
                </Select>
              </Field>
              {!simGrupoId && (
                <Field label="Usuario solicitante">
                  <Select value={simUsuarioId} onChange={(e) => setSimUsuarioId(e.target.value)}>
                    <option value="">— Seleccionar —</option>
                    {usuariosActivos.map((u) => (
                      <option key={u.id} value={u.id}>{u.nombre}</option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Monto OC (CLP)">
                <MontoInput
                  kind="monto"
                  value={simMonto === '' ? null : Number(simMonto)}
                  onChange={(v) => setSimMonto(v == null ? '' : String(v))}
                />
              </Field>
              <Button onClick={() => void runSimulacion()} disabled={simLoading}>
                {simLoading ? 'Simulando…' : 'Simular'}
              </Button>
              {simResult && (
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
                  <p className="mb-3 text-sm font-medium">
                    Estado: {simResult.status}
                    {simResult.grupo?.nombre ? ` · ${simResult.grupo.nombre}` : ''}
                  </p>
                  <ApprovalChainFlow
                    solicitante={
                      simResult.solicitanteId
                        ? {
                          id: simResult.solicitanteId,
                          nombre: userMap.get(simResult.solicitanteId) ?? simResult.solicitanteId,
                        }
                        : simUsuarioId
                          ? { id: simUsuarioId, nombre: userMap.get(simUsuarioId) ?? simUsuarioId }
                          : undefined
                    }
                    cadena={simResult.cadena ?? []}
                    motivos={simResult.motivos}
                    monto={simResult.monto}
                    status={simResult.status}
                    grupoNombre={simResult.grupo?.nombre}
                  />
                </div>
              )}
            </div>
          )}

          {slidePanelTab === 'administradores' && (
            <AdminConceptoPanel usuarios={usuariosQ.data ?? []} />
          )}

          {slidePanelTab === 'import-export' && (
            <AprobacionesBackupPanel
              empresaNombre={user?.empresa}
              onImported={invalidateAprobacionesConfig}
            />
          )}
        </div>
      </SlidePanel>

      <Modal
        open={delegOpen}
        onClose={() => setDelegOpen(false)}
        title={editingDeleg ? 'Editar suplencia' : 'Nueva suplencia'}
        size="lg"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setDelegOpen(false)}>Cancelar</Button>
            <Button onClick={() => void saveDeleg()} disabled={delegSaving}>
              {delegSaving ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Titular">
            <Select
              value={delegForm.titularId}
              onChange={(e) => setDelegForm((s) => ({ ...s, titularId: e.target.value }))}
            >
              <option value="">— Seleccionar —</option>
              {usuariosActivos.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </Select>
          </Field>
          <Field label="Suplente">
            <Select
              value={delegForm.suplenteId}
              onChange={(e) => setDelegForm((s) => ({ ...s, suplenteId: e.target.value }))}
            >
              <option value="">— Seleccionar —</option>
              {usuariosActivos.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </Select>
          </Field>
          <Field label="Módulo">
            <Select
              value={delegForm.modulo}
              onChange={(e) => setDelegForm((s) => ({ ...s, modulo: e.target.value }))}
            >
              <option value="">Todos</option>
              {modulosDisponibles.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Activo">
            <Select
              value={delegForm.activo ? '1' : '0'}
              onChange={(e) => setDelegForm((s) => ({ ...s, activo: e.target.value === '1' }))}
            >
              <option value="1">Sí</option>
              <option value="0">No</option>
            </Select>
          </Field>
          <Field label="Desde">
            <Input
              type="date"
              value={delegForm.vigenciaDesde}
              onChange={(e) => setDelegForm((s) => ({ ...s, vigenciaDesde: e.target.value }))}
            />
          </Field>
          <Field label="Hasta (opcional)">
            <Input
              type="date"
              value={delegForm.vigenciaHasta}
              onChange={(e) => setDelegForm((s) => ({ ...s, vigenciaHasta: e.target.value }))}
            />
          </Field>
          <Field label="Motivo" className="sm:col-span-2">
            <Input
              value={delegForm.motivo}
              placeholder="Ej. Vacaciones agosto"
              onChange={(e) => setDelegForm((s) => ({ ...s, motivo: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={grupoOpen}
        onClose={() => setGrupoOpen(false)}
        title={editingGrupo ? 'Editar grupo' : 'Nuevo grupo'}
        size="lg"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setGrupoOpen(false)}>Cancelar</Button>
            <Button onClick={() => void saveGrupo()} disabled={grupoSaving}>
              {grupoSaving ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" className="sm:col-span-2">
            <Input value={grupoForm.nombre} onChange={(e) => setGrupoForm((s) => ({ ...s, nombre: e.target.value }))} />
          </Field>
          <Field label="Módulo">
            <Select value={grupoForm.modulo} onChange={(e) => setGrupoForm((s) => ({ ...s, modulo: e.target.value }))}>
              {modulosDisponibles.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Aprobador final">
            <Select
              value={grupoForm.aprobadorFinalId}
              onChange={(e) => setGrupoForm((s) => ({ ...s, aprobadorFinalId: e.target.value }))}
            >
              <option value="">— Seleccionar —</option>
              {usuariosActivos.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </Select>
            <p className="mt-1 text-[10px] text-[var(--color-muted)]">
              Cierra la cadena. Se puede cambiar la persona, pero no agregar un nivel a su derecha.
              Los niveles intermedios se insertan con «+» entre columnas.
            </p>
          </Field>
          <Field label="Miembros" className="sm:col-span-2">
            <Input
              className="mb-2"
              placeholder="Buscar usuario…"
              value={grupoUserSearch}
              onChange={(e) => setGrupoUserSearch(e.target.value)}
            />
            <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-[var(--color-border)] p-2">
              {grupoUsuariosFiltrados.map((u) => (
                <Checkbox
                  key={u.id}
                  label={u.nombre}
                  checked={grupoForm.miembroIds.includes(u.id)}
                  onChange={() => toggleGrupoMiembro(u.id)}
                />
              ))}
            </div>
          </Field>
          <Field label="Activo">
            <Select
              value={grupoForm.activo ? '1' : '0'}
              onChange={(e) => setGrupoForm((s) => ({ ...s, activo: e.target.value === '1' }))}
            >
              <option value="1">Sí</option>
              <option value="0">No</option>
            </Select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={escalaOpen}
        onClose={() => setEscalaOpen(false)}
        title={
          escalaModo === 'insertAfter'
            ? 'Insertar aprobador en la cadena'
            : escalaModo === 'insert'
              ? 'Insertar aprobador intermedio'
              : escalaModo === 'edit'
                ? 'Editar nodo de escala'
                : 'Nuevo nodo de escala'
        }
        size="lg"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setEscalaOpen(false)}>Cancelar</Button>
            <Button onClick={() => void saveEscala()} disabled={escalaSaving || !!escalaFormInvalid}>
              {escalaSaving
                ? 'Guardando…'
                : escalaModo === 'insert' || escalaModo === 'insertAfter'
                  ? 'Insertar'
                  : 'Guardar'}
            </Button>
          </>
        )}
      >
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          {escalaModo === 'insertAfter' ? (
            <>
              Se inserta <strong>después de</strong>{' '}
              {userMap.get(escalaForm.insertAfterUsuarioId) ?? escalaForm.insertAfterUsuarioId}
              {escalaForm.escalaAUsuarioId
                ? <> y <strong>antes de</strong> {userMap.get(escalaForm.escalaAUsuarioId) ?? escalaForm.escalaAUsuarioId}</>
                : <> al <strong>final</strong> de la cadena</>}
              . La entrada del grupo no cambia.
            </>
          ) : escalaModo === 'insert' ? (
            <>
              Se crea un nodo <strong>delante</strong> de la entrada actual
              ({userMap.get(escalaForm.escalaAUsuarioId) ?? 'entrada'}) y el grupo pasa a usar
              ese intermedio como nueva entrada. El nodo de la entrada previa se conserva.
            </>
          ) : escalaModo === 'edit' ? (
            escalaEsNodoFinal ? (
              <>
                Este es el <strong>aprobador final</strong> del grupo: puede cambiar la persona y el tope,
                pero no agregar un nivel a la derecha. Para alargar la cadena use «+» entre niveles.
              </>
            ) : (
              <>
                Elija el <strong>tipo</strong> (Simple / AND / OR) y el tope.
                En Simple el aprobador identifica el nodo y no se cambia; en AND/OR puede agregar o quitar co-aprobadores.
                {' '}Para agregar niveles use el botón <strong>+</strong> entre columnas.
              </>
            )
          ) : (
            <>
              Elija primero el <strong>tipo de aprobación</strong>, luego los aprobadores, tope y a quién escala.
            </>
          )}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Grupo">
            <Select
              value={escalaForm.grupoId}
              onChange={(e) => applyGrupoToEscalaForm(e.target.value)}
              disabled={escalaModo === 'insert' || escalaModo === 'insertAfter' || escalaModo === 'edit'}
            >
              <option value="">— Seleccionar grupo —</option>
              {((gruposQ.data ?? []) as GrupoAprobacion[])
                .filter((g) => g.activo && (!escalaForm.modulo || g.modulo === escalaForm.modulo))
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre} · entrada {g.aprobadorInicialNombre || userMap.get(g.aprobadorInicialId) || g.aprobadorInicialId}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Módulo">
            <Select
              value={escalaForm.modulo}
              disabled={escalaModo === 'insert' || escalaModo === 'insertAfter' || escalaModo === 'edit'}
              onChange={(e) => setEscalaForm((s) => ({
                ...s,
                modulo: e.target.value,
                grupoId: ((gruposQ.data ?? []) as GrupoAprobacion[]).some(
                  (g) => g.id === s.grupoId && g.modulo === e.target.value,
                )
                  ? s.grupoId
                  : '',
              }))}
            >
              {modulosDisponibles.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </Field>
          {/* 1) Tipo de lógica primero */}
          <Field label="Tipo de aprobación" className="sm:col-span-2">
            <div className="flex gap-2">
              {([
                { val: 'SIMPLE' as const, label: 'Simple', hint: '1 aprobador' },
                { val: 'AND' as const, label: 'AND', hint: 'todos aprueban' },
                { val: 'OR' as const, label: 'OR', hint: 'basta 1' },
              ]).map(({ val, label, hint }) => {
                const selected = escalaForm.logica === val;
                const ls = logicaStyles(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      setEscalaForm((s) => {
                        if (val === 'SIMPLE') {
                          return { ...s, logica: val, aprobadoresExtra: [] };
                        }
                        // Al pasar a múltiple: el aprobador actual queda como primer seleccionado
                        const seed = s.usuarioId
                          ? [s.usuarioId, ...s.aprobadoresExtra.filter((id) => id !== s.usuarioId)]
                          : s.aprobadoresExtra;
                        return { ...s, logica: val, aprobadoresExtra: seed.filter((id) => id !== s.usuarioId) };
                      });
                    }}
                    className={`flex-1 rounded-lg border px-2 py-2 text-left transition-colors ${
                      selected ? ls.tipoBtnSelected : ls.tipoBtn
                    }`}
                  >
                    <span className="block text-xs font-semibold">{label}</span>
                    <span className="block text-[10px] opacity-70">{hint}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          {/* 2) Selector según tipo */}
          {escalaForm.logica === 'SIMPLE' ? (
            <Field
              label={
                escalaEsNodoFinal
                  ? 'Aprobador final'
                  : escalaModo === 'insert' || escalaModo === 'insertAfter'
                  ? 'Aprobador intermedio'
                  : escalaForm.grupoId
                    ? 'Aprobador (miembro del grupo)'
                    : 'Aprobador (nodo)'
              }
              className="sm:col-span-2"
            >
              <Select
                value={escalaForm.usuarioId}
                disabled={escalaModo === 'edit' && !escalaEsNodoFinal}
                onChange={(e) => setEscalaForm((s) => ({
                  ...s,
                  usuarioId: e.target.value,
                  escalaAUsuarioId: s.escalaAUsuarioId === e.target.value ? '' : s.escalaAUsuarioId,
                  aprobadoresExtra: [],
                }))}
              >
                <option value="">— Seleccionar —</option>
                {escalaUsuariosOpciones.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </Select>
              {escalaModo === 'edit' && !escalaEsNodoFinal && (
                <p className="mt-1 text-[10px] text-[var(--color-muted)]">
                  El aprobador identifica el nodo y no se puede cambiar. Elimine el nivel o inserte uno nuevo con «+».
                </p>
              )}
              {escalaModo === 'edit' && escalaEsNodoFinal && (
                <p className="mt-1 text-[10px] text-[var(--color-muted)]">
                  Puede cambiar quién cierra la cadena. No se agrega un nivel a la derecha.
                </p>
              )}
            </Field>
          ) : (
            <Field
              label={`Aprobadores (${escalaForm.logica === 'AND' ? 'todos deben aprobar' : 'basta con uno'})`}
              className="sm:col-span-2"
            >
              <Input
                className="mb-2"
                placeholder="Buscar usuario…"
                value={escalaUserSearch}
                onChange={(e) => setEscalaUserSearch(e.target.value)}
                aria-label="Buscar aprobadores"
              />
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
                {escalaUsuariosAndOrLista.map((u) => {
                  const isPrimary = escalaForm.usuarioId === u.id;
                  const checked = isPrimary || escalaForm.aprobadoresExtra.includes(u.id);
                  return (
                    <Checkbox
                      key={u.id}
                      label={(
                        <>
                          <span>{u.nombre}</span>
                          {isPrimary && (
                            <span className="rounded bg-violet-500/20 px-1 text-[10px] font-medium text-violet-700 dark:text-violet-300">
                              principal
                            </span>
                          )}
                        </>
                      )}
                      checked={checked}
                      onChange={() => {
                        setEscalaForm((s) => {
                          const current = [
                            ...(s.usuarioId ? [s.usuarioId] : []),
                            ...s.aprobadoresExtra.filter((id) => id !== s.usuarioId),
                          ];
                          const next = checked
                            ? current.filter((id) => id !== u.id)
                            : [...current, u.id];
                          const primary = next[0] ?? '';
                          const extras = next.filter((id) => id !== primary);
                          return {
                            ...s,
                            usuarioId: primary,
                            aprobadoresExtra: extras,
                            escalaAUsuarioId: s.escalaAUsuarioId === primary ? '' : s.escalaAUsuarioId,
                          };
                        });
                      }}
                    />
                  );
                })}
                {escalaUsuariosOpciones.length === 0 && (
                  <p className="text-xs text-[var(--color-muted)]">Sin usuarios disponibles.</p>
                )}
                {escalaUsuariosOpciones.length > 0 && escalaUsuariosAndOrLista.length === 0 && (
                  <p className="text-xs text-[var(--color-muted)]">Ningún usuario coincide con la búsqueda.</p>
                )}
              </div>
              <p className="mt-1 text-[10px] text-[var(--color-muted)]">
                Seleccione al menos 2 aprobadores. Los marcados aparecen arriba.
                {escalaForm.logica === 'AND'
                  ? ' Todos deben aprobar para avanzar al siguiente nivel.'
                  : ' Con que uno apruebe, avanza al siguiente nivel.'}
              </p>
            </Field>
          )}

          <Field label="Tope CLP (vacío = sin tope)">
            <MontoInput
              kind="monto"
              value={escalaForm.montoMax === '' ? null : Number(escalaForm.montoMax)}
              onChange={(v) => setEscalaForm((s) => ({ ...s, montoMax: v == null ? '' : String(v) }))}
              className={cn(
                escalaMontoInvalid
                  && 'border-red-500/80 bg-red-500/5 focus:border-red-500 focus:ring-red-500/20',
              )}
              aria-invalid={!!escalaMontoInvalid}
            />
            {escalaMontoInvalid && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
                {escalaMontoMaxError ?? escalaCadenaMontoError}
              </p>
            )}
          </Field>
          {!escalaEsNodoFinal && (
          <Field
            label={
              escalaModo === 'insertAfter'
                ? 'Escala a (siguiente en cadena)'
                : escalaModo === 'insert'
                  ? 'Escala a (entrada actual)'
                  : escalaModo === 'edit'
                    ? 'Escala a (siguiente en cadena)'
                    : escalaForm.grupoId
                      ? 'Escala a (miembro del grupo)'
                      : 'Escala a'
            }
          >
            <Select
              value={escalaForm.escalaAUsuarioId}
              disabled={escalaModo === 'insert' || escalaModo === 'insertAfter' || escalaModo === 'edit'}
              onChange={(e) => setEscalaForm((s) => ({ ...s, escalaAUsuarioId: e.target.value }))}
            >
              {escalaModo !== 'edit' && <option value="">— Fin de cadena —</option>}
              {(escalaModo === 'insert' || escalaModo === 'insertAfter' || escalaModo === 'edit'
                ? usuariosActivos.filter((u) => u.id === escalaForm.escalaAUsuarioId)
                : escalaDestinoOpciones
              ).map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </Select>
            {escalaModo === 'edit' && (
              <p className="mt-1 text-[10px] text-[var(--color-muted)]">
                El destino queda fijo. Use «+» para insertar un intermedio o elimine este nivel.
              </p>
            )}
          </Field>
          )}
          <Field label="Activo">
            <Select
              value={escalaForm.activo ? '1' : '0'}
              onChange={(e) => setEscalaForm((s) => ({ ...s, activo: e.target.value === '1' }))}
            >
              <option value="1">Sí</option>
              <option value="0">No</option>
            </Select>
          </Field>
        </div>
        {escalaForm.grupoId && escalaForm.usuarioId && (
          <p className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-muted)]">
            {(() => {
              const nombres = [
                escalaForm.usuarioId,
                ...escalaForm.aprobadoresExtra,
              ].map((id) => userMap.get(id) ?? id);
              const nodoLabel = escalaForm.logica === 'SIMPLE'
                ? nombres[0]
                : `[${escalaForm.logica}: ${nombres.join(' + ')}]`;
              return (
                <>
                  {escalaModo === 'insertAfter' ? 'Quedará: ' : escalaModo === 'insert' ? 'Quedará: ' : 'Mapa: '}
                  {escalaModo === 'insertAfter' ? (
                    <>
                      {userMap.get(escalaForm.insertAfterUsuarioId) ?? escalaForm.insertAfterUsuarioId}
                      {' → '}
                      <strong className="text-[var(--color-text)]">{nodoLabel}</strong>
                    </>
                  ) : (
                    <>
                      miembros →{' '}
                      <strong className="text-[var(--color-text)]">{nodoLabel}</strong>
                    </>
                  )}
                  {escalaForm.escalaAUsuarioId
                    ? <> → {userMap.get(escalaForm.escalaAUsuarioId) ?? escalaForm.escalaAUsuarioId}</>
                    : ' → cierre de cadena'}
                  {escalaForm.montoMax.trim()
                    ? ` (tope $${Number(escalaForm.montoMax).toLocaleString('es-CL')})`
                    : ' (sin tope)'}
                  {escalaModo === 'insert' ? ' · la entrada del grupo se actualiza al intermedio' : null}
                </>
              );
            })()}
          </p>
        )}
      </Modal>

      <Modal
        open={!!confirmDeleteDeleg}
        onClose={() => setConfirmDeleteDeleg(null)}
        title="Eliminar suplencia"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setConfirmDeleteDeleg(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => void doRemoveDeleg()}>Eliminar</Button>
          </>
        )}
      >
        <p className="text-sm text-[var(--color-muted)]">
          ¿Eliminar suplencia de {confirmDeleteDeleg?.titularNombre} → {confirmDeleteDeleg?.suplenteNombre}?
        </p>
      </Modal>

      <Modal
        open={!!confirmDeleteGrupo}
        onClose={() => setConfirmDeleteGrupo(null)}
        title="Eliminar grupo"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setConfirmDeleteGrupo(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => void doRemoveGrupo()}>Eliminar</Button>
          </>
        )}
      >
        <p className="text-sm text-[var(--color-muted)]">
          ¿Eliminar el grupo «{confirmDeleteGrupo?.nombre}»?
        </p>
      </Modal>

      <Modal
        open={!!confirmDeleteEscala}
        onClose={() => setConfirmDeleteEscala(null)}
        title="Eliminar nodo"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setConfirmDeleteEscala(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => void doRemoveEscala()}>Eliminar</Button>
          </>
        )}
      >
        <p className="text-sm text-[var(--color-muted)]">
          ¿Eliminar nodo de {confirmDeleteEscala?.usuarioNombre}?
          {' '}La cadena se reencadena sola (el anterior apunta al siguiente).
        </p>
      </Modal>

      <PendientesImpactoModal
        open={!!impactoPendientes}
        onClose={() => setImpactoPendientes(null)}
        onConfirm={confirmImpactoPendientes}
        items={impactoPendientes?.items ?? []}
        usuarios={(usuariosQ.data ?? [])
          .filter((u) => u.activo !== false)
          .map((u) => ({ id: u.id, nombre: u.nombre }))}
        sugeridoAprobadorId={impactoPendientes?.sugeridoAprobadorId}
        titulo={impactoPendientes?.mode === 'delete'
          ? 'Eliminar nodo · reasignar pendientes'
          : 'Cambiar aprobador · reasignar pendientes'}
        confirmLabel={impactoPendientes?.mode === 'delete' ? 'Eliminar y reasignar' : 'Guardar y reasignar'}
        busy={impactoBusy || escalaSaving}
      />

      <AprobadorBandejaModal
        open={!!bandejaInvalidos?.length}
        onClose={() => setBandejaInvalidos(null)}
        invalidos={bandejaInvalidos ?? []}
        user={user}
      />
    </div>
  );
}
