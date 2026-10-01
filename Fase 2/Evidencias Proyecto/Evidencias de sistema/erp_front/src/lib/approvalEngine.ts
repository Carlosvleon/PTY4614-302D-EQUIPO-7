import type { Usuario } from '@/types/domain';



export interface UsuarioOrganigrama {

  id: string;

  nombre: string;

  jefeId?: string | null;

  montoMaxAprobacion?: number | null;

  activo?: boolean;

}



export interface AprobadorPaso {

  id: string;

  nombre: string;

}



export interface DelegacionAprobacionRow {

  titularId: string;

  suplenteId: string;

  modulo: string | null;

  vigenciaDesde: string;

  vigenciaHasta: string | null;

  activo: boolean;

}



export interface CadenaAprobacionOpts {

  delegaciones?: DelegacionAprobacionRow[];

  modulo?: string;

  at?: Date;

}



export function resolveAprobadorEfectivo(

  titularId: string,

  delegaciones: DelegacionAprobacionRow[],

  modulo: string,

  at: Date = new Date(),

): string {

  const mod = modulo.trim().toLowerCase();

  for (const d of delegaciones) {

    if (!d.activo || d.titularId !== titularId) continue;

    if (d.modulo && d.modulo.trim().toLowerCase() !== mod) continue;

    const desde = new Date(d.vigenciaDesde);

    const hasta = d.vigenciaHasta ? new Date(d.vigenciaHasta) : null;

    if (desde > at) continue;

    if (hasta && hasta < at) continue;

    return d.suplenteId;

  }

  return titularId;

}



/** Arma cadena secuencial subiendo la línea de mando (espejo del backend). */

export function buildCadenaAprobacion(

  solicitanteId: string,

  monto: number,

  usuarios: UsuarioOrganigrama[],

  allowedIds: string[],

  opts?: CadenaAprobacionOpts,

): AprobadorPaso[] {

  const byId = new Map(usuarios.map((u) => [u.id, u]));

  const poolSet = new Set(allowedIds.filter(Boolean));

  const requirePool = poolSet.size > 0;

  const delegaciones = opts?.delegaciones ?? [];

  const modulo = opts?.modulo ?? 'Compras';

  const at = opts?.at ?? new Date();



  const chain: AprobadorPaso[] = [];

  const visited = new Set<string>();



  let currentId = byId.get(solicitanteId)?.jefeId ?? null;



  while (currentId && chain.length < 20) {

    if (visited.has(currentId)) break;

    visited.add(currentId);



    const u = byId.get(currentId);

    if (!u || u.activo === false) break;



    if (requirePool && !poolSet.has(u.id)) {

      currentId = u.jefeId ?? null;

      continue;

    }



    const effectiveId = resolveAprobadorEfectivo(u.id, delegaciones, modulo, at);

    const effectiveUser = byId.get(effectiveId) ?? u;



    if (chain.length && chain[chain.length - 1].id === effectiveId) {

      currentId = u.jefeId ?? null;

      continue;

    }



    chain.push({ id: effectiveId, nombre: effectiveUser.nombre });



    const max = u.montoMaxAprobacion;

    if (max == null || max >= monto) break;



    currentId = u.jefeId ?? null;

  }



  return chain;

}



export function resolverPrimeraAprobacion(

  solicitanteId: string,

  monto: number,

  usuarios: UsuarioOrganigrama[],

  allowedIds: string[],

  opts?: CadenaAprobacionOpts,

): { aprobadorId: string; aprobadorNombre: string; cadena: AprobadorPaso[] } | null {

  const ids = allowedIds.filter(Boolean);

  if (!ids.length) return null;

  const cadena = buildCadenaAprobacion(solicitanteId, monto, usuarios, ids, opts);

  if (!cadena.length) return null;

  return {

    aprobadorId: cadena[0].id,

    aprobadorNombre: cadena[0].nombre,

    cadena,

  };

}



export function usuariosToOrganigrama(list: Usuario[] | undefined): UsuarioOrganigrama[] {

  return (list ?? []).map((u) => ({

    id: u.id,

    nombre: u.nombre,

    jefeId: u.jefeId,

    montoMaxAprobacion: u.montoMaxAprobacion,

    activo: u.activo,

  }));

}



export function delegacionesToRows(

  list: Array<{

    titularId: string;

    suplenteId: string;

    modulo?: string | null;

    vigenciaDesde: string;

    vigenciaHasta?: string | null;

    activo: boolean;

  }> | undefined,

): DelegacionAprobacionRow[] {

  return (list ?? []).map((d) => ({

    titularId: d.titularId,

    suplenteId: d.suplenteId,

    modulo: d.modulo ?? null,

    vigenciaDesde: d.vigenciaDesde,

    vigenciaHasta: d.vigenciaHasta ?? null,

    activo: d.activo,

  }));

}



export interface GrupoAprobacionRow {

  id: string;

  modulo: string;

  aprobadorInicialId: string;

  miembros: string[];

  activo: boolean;

}



export interface NodoEscalaRow {

  grupoId: string;

  usuarioId: string;

  montoMax: number | null;

  escalaAUsuarioId: string | null;

  activo: boolean;

}



export interface ResolveCadenaCompletaInput {

  solicitanteId: string;

  monto: number;

  modulo: string;

  usuarios: UsuarioOrganigrama[];

  allowedIds: string[];

  grupos: GrupoAprobacionRow[];

  nodos: NodoEscalaRow[];

  delegaciones?: DelegacionAprobacionRow[];

  at?: Date;

}



export type ResolveCadenaCompletaResult =

  | ({ status: 'ok' } & { aprobadorId: string; aprobadorNombre: string; cadena: AprobadorPaso[] })

  | { status: 'no_pool' }

  | { status: 'sin_grupo' }

  | { status: 'sin_cadena' };



export function gruposFromDomain(

  list: Array<{

    id: string;

    modulo: string;

    aprobadorInicialId: string;

    miembroIds: string[];

    activo: boolean;

  }> | undefined,

): GrupoAprobacionRow[] {

  return (list ?? []).map((g) => ({

    id: g.id,

    modulo: g.modulo,

    aprobadorInicialId: g.aprobadorInicialId,

    miembros: g.miembroIds ?? [],

    activo: g.activo,

  }));

}



export function nodosFromDomain(

  list: Array<{

    grupoId: string;

    usuarioId: string;

    montoMax: number | null;

    escalaAUsuarioId?: string | null;

    activo: boolean;

  }> | undefined,

): NodoEscalaRow[] {

  return (list ?? []).map((n) => ({

    grupoId: n.grupoId,

    usuarioId: n.usuarioId,

    montoMax: n.montoMax,

    escalaAUsuarioId: n.escalaAUsuarioId ?? null,

    activo: n.activo,

  }));

}



export function poolFromNodosEscalas(nodos: NodoEscalaRow[]): string[] {

  const ids = new Set<string>();

  for (const n of nodos) {

    if (!n.activo) continue;

    ids.add(n.usuarioId);

    if (n.escalaAUsuarioId) ids.add(n.escalaAUsuarioId);

  }

  return [...ids];

}



export function effectivePoolIds(

  allowedIds: string[],

  nodos: NodoEscalaRow[],

  useEscalas: boolean,

): string[] {

  const workflowIds = allowedIds.filter(Boolean);

  if (!useEscalas) return workflowIds;

  const fromNodos = poolFromNodosEscalas(nodos);

  if (!workflowIds.length) return fromNodos;

  return fromNodos.filter((id) => workflowIds.includes(id));

}



export function hasGruposActivos(modulo: string, grupos: GrupoAprobacionRow[]): boolean {

  const mod = modulo.trim().toLowerCase();

  return grupos.some((g) => g.activo && g.modulo.trim().toLowerCase() === mod);

}



export function findGrupoForUsuario(

  solicitanteId: string,

  modulo: string,

  grupos: GrupoAprobacionRow[],

): GrupoAprobacionRow | null {

  const mod = modulo.trim().toLowerCase();

  for (const g of grupos) {

    if (!g.activo) continue;

    if (g.modulo.trim().toLowerCase() !== mod) continue;

    if (g.miembros.includes(solicitanteId)) return g;

  }

  return null;

}



export function buildCadenaDesdeGrupo(

  solicitanteId: string,

  monto: number,

  grupo: GrupoAprobacionRow,

  nodos: NodoEscalaRow[],

  usuarios: UsuarioOrganigrama[],

  allowedIds: string[],

  opts?: CadenaAprobacionOpts,

): AprobadorPaso[] {

  const byId = new Map(usuarios.map((u) => [u.id, u]));

  const nodosByUsuario = new Map<string, NodoEscalaRow>();

  for (const n of nodos) {

    if (!n.activo) continue;

    if (n.grupoId !== grupo.id) continue;

    nodosByUsuario.set(n.usuarioId, n);

  }

  const poolSet = new Set(allowedIds.filter(Boolean));

  const requirePool = poolSet.size > 0;

  const delegaciones = opts?.delegaciones ?? [];

  const modulo = opts?.modulo ?? grupo.modulo;

  const at = opts?.at ?? new Date();



  const chain: AprobadorPaso[] = [];

  const visited = new Set<string>();

  let currentId: string | null = grupo.aprobadorInicialId;



  while (currentId && chain.length < 20) {

    if (visited.has(currentId)) break;

    visited.add(currentId);



    const u = byId.get(currentId);

    if (!u || u.activo === false) break;



    if (requirePool && !poolSet.has(u.id)) break;



    const effectiveId = resolveAprobadorEfectivo(u.id, delegaciones, modulo, at);

    const effectiveUser = byId.get(effectiveId) ?? u;



    if (effectiveId === solicitanteId) {

      const nodo = nodosByUsuario.get(u.id);

      if (!nodo?.escalaAUsuarioId) break;

      currentId = nodo.escalaAUsuarioId;

      continue;

    }



    if (chain.length && chain[chain.length - 1].id === effectiveId) {

      const nodo = nodosByUsuario.get(u.id);

      currentId = nodo?.escalaAUsuarioId ?? null;

      continue;

    }



    chain.push({ id: effectiveId, nombre: effectiveUser.nombre });



    const nodo = nodosByUsuario.get(u.id);

    const max = nodo?.montoMax ?? null;

    if (max == null || max >= monto) break;



    currentId = nodo?.escalaAUsuarioId ?? null;

  }



  return chain;

}



export function resolveCadenaCompleta(

  input: ResolveCadenaCompletaInput,

): ResolveCadenaCompletaResult {

  const {

    solicitanteId,

    monto,

    modulo,

    usuarios,

    allowedIds,

    grupos,

    nodos,

    delegaciones,

    at,

  } = input;



  const useGrupos = hasGruposActivos(modulo, grupos);

  const nodosModulo = nodos.filter((n) => n.activo);

  const pool = effectivePoolIds(allowedIds, nodosModulo, useGrupos && nodosModulo.length > 0);

  if (!pool.length) return { status: 'no_pool' };



  const opts: CadenaAprobacionOpts = { delegaciones, modulo, at };



  let cadena: AprobadorPaso[];

  if (useGrupos) {

    const grupo = findGrupoForUsuario(solicitanteId, modulo, grupos);

    if (!grupo) return { status: 'sin_grupo' };

    cadena = buildCadenaDesdeGrupo(solicitanteId, monto, grupo, nodosModulo, usuarios, pool, opts);

  } else {

    cadena = buildCadenaAprobacion(solicitanteId, monto, usuarios, pool, opts);

  }



  if (!cadena.length) return { status: 'sin_cadena' };



  return {

    status: 'ok',

    aprobadorId: cadena[0].id,

    aprobadorNombre: cadena[0].nombre,

    cadena,

  };

}



export function resolverCadenaPreview(

  solicitanteId: string | undefined,

  monto: number,

  modulo: string,

  usuarios: UsuarioOrganigrama[],

  workflowAllowedIds: string[],

  grupos: GrupoAprobacionRow[],

  nodos: NodoEscalaRow[],

  delegaciones: DelegacionAprobacionRow[],

): ResolveCadenaCompletaResult | null {

  if (!solicitanteId || !Number.isFinite(monto) || monto <= 0) return null;

  if (!workflowAllowedIds.length && !hasGruposActivos(modulo, grupos)) return null;

  return resolveCadenaCompleta({

    solicitanteId,

    monto,

    modulo,

    usuarios,

    allowedIds: workflowAllowedIds,

    grupos,

    nodos,

    delegaciones,

  });

}

