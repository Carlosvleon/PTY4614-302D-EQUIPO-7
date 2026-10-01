import type { PrismaService } from '../../prisma/prisma.service';



export interface UsuarioOrganigrama {

  id: string;

  nombre: string;

  jefeId: string | null;

  montoMaxAprobacion: number | null;

  activo: boolean;

  /** ROL-1 / `*`: no figura en la cadena; override en runtime. */
  esMantenedor?: boolean;

}



export interface AprobadorPaso {

  id: string;

  nombre: string;

  /** Solo presente en nodos AND/OR multi-aprobador; SIMPLE se omite o se setea explícito. */
  logica?: 'SIMPLE' | 'AND' | 'OR';

  /** Lista completa de aprobadores (AND/OR). */
  aprobadores?: { id: string; nombre: string }[];

  /** Tope del nodo o del usuario. null = sin tope. No se persiste en el snapshot de la OC. */
  montoMax?: number | null;

}



export interface DelegacionAprobacionRow {

  titularId: string;

  suplenteId: string;

  modulo: string | null;

  vigenciaDesde: Date;

  vigenciaHasta: Date | null;

  activo: boolean;

}



export interface CadenaAprobacionOpts {

  delegaciones?: DelegacionAprobacionRow[];

  modulo?: string;

  at?: Date;

}



/** Carga usuarios de la empresa con datos de organigrama. */

export async function loadUsuariosOrganigrama(

  prisma: PrismaService,

  empresaId: string,

): Promise<UsuarioOrganigrama[]> {

  const rows = await prisma.usuario.findMany({

    where: {

      OR: [

        { empresaId },

        { empresasAcceso: { some: { empresaId } } },

      ],

    },

    select: {

      id: true,

      nombre: true,

      jefeId: true,

      montoMaxAprobacion: true,

      activo: true,

      rolId: true,

      rol: { select: { permisos: true } },

    },

  });

  return rows.map((r) => ({

    id: r.id,

    nombre: r.nombre,

    jefeId: r.jefeId,

    montoMaxAprobacion:

      r.montoMaxAprobacion != null ? Number(r.montoMaxAprobacion) : null,

    activo: r.activo,

    esMantenedor:

      r.rolId === 'ROL-1' || (r.rol?.permisos ?? []).includes('*'),

  }));

}



/** Carga delegaciones activas de la empresa (suplencia / vacaciones). */

export async function loadDelegacionesAprobacion(

  prisma: PrismaService,

  empresaId: string,

): Promise<DelegacionAprobacionRow[]> {

  const rows = await prisma.delegacionAprobacion.findMany({

    where: { empresaId, activo: true },

    select: {

      titularId: true,

      suplenteId: true,

      modulo: true,

      vigenciaDesde: true,

      vigenciaHasta: true,

      activo: true,

    },

  });

  return rows;

}



/** Resuelve suplente vigente o el titular si no hay delegación. */

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

    if (d.vigenciaDesde > at) continue;

    if (d.vigenciaHasta && d.vigenciaHasta < at) continue;

    return d.suplenteId;

  }

  return titularId;

}



/**

 * Arma la cadena secuencial de aprobadores subiendo la línea de mando.

 * Solo incluye usuarios del pool (`allowedIds`) si el pool no está vacío.

 * Se detiene al encontrar quien puede cubrir el monto (montoMax >= monto o sin tope).

 * Aplica suplencia vigente por paso.

 */

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

    if (!u?.activo) break;

    if (u.esMantenedor) {
      currentId = u.jefeId;
      continue;
    }



    if (requirePool && !poolSet.has(u.id)) {

      currentId = u.jefeId;

      continue;

    }



    const effectiveId = resolveAprobadorEfectivo(u.id, delegaciones, modulo, at);

    const effectiveUser = byId.get(effectiveId) ?? u;



    if (chain.length && chain[chain.length - 1].id === effectiveId) {

      currentId = u.jefeId;

      continue;

    }



    const max = u.montoMaxAprobacion;

    chain.push({
      id: effectiveId,
      nombre: effectiveUser.nombre,
      logica: 'SIMPLE',
      aprobadores: [{ id: effectiveId, nombre: effectiveUser.nombre }],
      montoMax: max,
    });

    if (max == null || max >= monto) break;



    currentId = u.jefeId;

  }



  return chain;

}



export interface CadenaAprobacionResuelta {

  aprobadorId: string;

  aprobadorNombre: string;

  cadenaIds: string[];

  pasoTotal: number;

}



/** Primer paso de la cadena o null si no hay regla / cadena vacía. */

export function resolverPrimeraAprobacion(

  solicitanteId: string,

  monto: number,

  usuarios: UsuarioOrganigrama[],

  allowedIds: string[],

  opts?: CadenaAprobacionOpts,

): CadenaAprobacionResuelta | null {

  const ids = allowedIds.filter(Boolean);

  if (!ids.length) return null;



  const cadena = buildCadenaAprobacion(solicitanteId, monto, usuarios, ids, opts);

  if (!cadena.length) return null;



  const first = cadena[0];

  return {

    aprobadorId: first.id,

    aprobadorNombre: first.nombre,

    cadenaIds: cadena.map((c) => c.id),

    pasoTotal: cadena.length,

  };

}



/** Siguiente aprobador en cadena (1-based pasoActual). */

export function siguienteAprobadorEnCadena(

  cadenaIds: string[],

  pasoActual: number,

): { id: string; paso: number } | null {

  if (!cadenaIds.length || pasoActual >= cadenaIds.length) return null;

  return { id: cadenaIds[pasoActual], paso: pasoActual + 1 };

}



export interface GrupoAprobacionRow {

  id: string;

  nombre: string;

  modulo: string;

  aprobadorInicialId: string;

  miembros: string[];

  activo: boolean;

}



export interface NodoEscalaRow {

  id: string;

  /** Grupo dueño del nodo (obligatorio: no hay escalas huérfanas). */

  grupoId: string;

  /** Lógica de aprobación: SIMPLE (1 aprobador), AND (todos), OR (cualquiera). */
  logica: 'SIMPLE' | 'AND' | 'OR';

  /** Lista de usuarioIds (para AND/OR; SIMPLE tiene 1 elemento). */
  aprobadores: string[];

  /** Mantener para retrocompatibilidad. */
  usuarioId: string;

  montoMax: number | null;

  /** Nuevo: FK al siguiente NodoEscalaAprobacion (nueva forma). */
  escalaAId: string | null;

  /** Mantener para retrocompatibilidad. */
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

  /** Rol master (ROL-1 / `*`). No AdminConcepto. Cadena sin ser miembro del grupo. */
  solicitanteEsMantenedor?: boolean;

}



export type ResolveCadenaCompletaResult =

  | ({ status: 'ok' } & CadenaAprobacionResuelta & { cadena: AprobadorPaso[] })

  | { status: 'no_pool' }

  | { status: 'sin_grupo' }

  | { status: 'sin_cadena' };



/** Carga grupos de aprobación con miembros. */

export async function loadGruposAprobacion(

  prisma: PrismaService,

  empresaId: string,

): Promise<GrupoAprobacionRow[]> {

  const rows = await prisma.grupoAprobacion.findMany({

    where: { empresaId },

    include: { miembros: { select: { usuarioId: true } } },

  });

  return rows.map((r) => ({

    id: r.id,

    nombre: r.nombre,

    modulo: r.modulo,

    aprobadorInicialId: r.aprobadorInicialId,

    miembros: r.miembros.map((m) => m.usuarioId),

    activo: r.activo,

  }));

}



/** Carga nodos de escala (opcionalmente filtrados por módulo). */

export async function loadNodosEscala(

  prisma: PrismaService,

  empresaId: string,

  modulo?: string,

): Promise<NodoEscalaRow[]> {

  const rows = await prisma.nodoEscalaAprobacion.findMany({

    where: {

      empresaId,

      ...(modulo

        ? { modulo: { equals: modulo, mode: 'insensitive' as const } }

        : {}),

    },

    include: {

      aprobadores: {

        select: { usuarioId: true, orden: true },

        orderBy: { orden: 'asc' },

      },

    },

  });

  return rows.map((r) => ({

    id: r.id,

    grupoId: r.grupoId,

    logica: (r.logica as 'SIMPLE' | 'AND' | 'OR') || 'SIMPLE',

    usuarioId: r.usuarioId,

    aprobadores:

      r.aprobadores.length > 0

        ? r.aprobadores.map((a) => a.usuarioId)

        : [r.usuarioId],

    montoMax: r.montoMax != null ? Number(r.montoMax) : null,

    escalaAId: r.escalaAId ?? null,

    escalaAUsuarioId: r.escalaAUsuarioId,

    activo: r.activo,

  }));

}



export function poolFromNodosEscalas(nodos: NodoEscalaRow[]): string[] {

  const ids = new Set<string>();

  for (const n of nodos) {

    if (!n.activo) continue;

    for (const uid of n.aprobadores) {

      ids.add(uid);

    }

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



export function hasGruposActivos(

  modulo: string,

  grupos: GrupoAprobacionRow[],

): boolean {

  const mod = modulo.trim().toLowerCase();

  return grupos.some(

    (g) => g.activo && g.modulo.trim().toLowerCase() === mod,

  );

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

/** Primer grupo activo del módulo (orden estable por id). */
export function pickGrupoMantenedor(
  modulo: string,
  grupos: GrupoAprobacionRow[],
): GrupoAprobacionRow | null {
  const mod = modulo.trim().toLowerCase();
  const activos = grupos
    .filter((g) => g.activo && g.modulo.trim().toLowerCase() === mod)
    .sort((a, b) => a.id.localeCompare(b.id));
  return activos[0] ?? null;
}

export function resolveGrupoSolicitante(
  solicitanteId: string,
  modulo: string,
  grupos: GrupoAprobacionRow[],
  mantenedorSinGrupo?: boolean,
): GrupoAprobacionRow | null {
  const propio = findGrupoForUsuario(solicitanteId, modulo, grupos);
  if (propio) return propio;
  if (mantenedorSinGrupo) return pickGrupoMantenedor(modulo, grupos);
  return null;
}



/**

 * Arma cadena secuencial desde aprobador inicial del grupo + nodos de escala.

 * Aplica suplencia vigente por paso.

 */

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

  const nodosById = new Map<string, NodoEscalaRow>();

  for (const n of nodos) {

    if (!n.activo) continue;

    if (n.grupoId !== grupo.id) continue;

    nodosByUsuario.set(n.usuarioId, n);

    nodosById.set(n.id, n);

  }

  const poolSet = new Set(allowedIds.filter(Boolean));

  const requirePool = poolSet.size > 0;

  const delegaciones = opts?.delegaciones ?? [];

  const modulo = opts?.modulo ?? grupo.modulo;

  const at = opts?.at ?? new Date();



  const chain: AprobadorPaso[] = [];

  const visited = new Set<string>();

  let currentId: string | null = grupo.aprobadorInicialId;



  /** Resuelve el usuarioId del siguiente nodo usando escalaAId (nuevo) o escalaAUsuarioId (legado). */
  function nextCurrentId(nodo: NodoEscalaRow): string | null {

    if (nodo.escalaAId) {

      return nodosById.get(nodo.escalaAId)?.usuarioId ?? null;

    }

    return nodo.escalaAUsuarioId ?? null;

  }



  while (currentId && chain.length < 20) {

    if (visited.has(currentId)) break;

    visited.add(currentId);



    const u = byId.get(currentId);

    if (!u?.activo) break;

    const nodoSkip = nodosByUsuario.get(u.id);
    if (u.esMantenedor) {
      currentId = nodoSkip ? nextCurrentId(nodoSkip) : null;
      continue;
    }



    if (requirePool && !poolSet.has(u.id)) break;



    const effectiveId = resolveAprobadorEfectivo(u.id, delegaciones, modulo, at);

    const effectiveUser = byId.get(effectiveId) ?? u;

    const nodo = nodosByUsuario.get(u.id);



    // Jefa de área solicitando: no auto-aprobación; escalar al siguiente nodo.

    if (effectiveId === solicitanteId) {

      if (!nodo) break;

      currentId = nextCurrentId(nodo);

      continue;

    }



    if (chain.length && chain[chain.length - 1].id === effectiveId) {

      currentId = nodo ? nextCurrentId(nodo) : null;

      continue;

    }



    const logica = (nodo?.logica ?? 'SIMPLE') as 'SIMPLE' | 'AND' | 'OR';

    const max = nodo?.montoMax ?? null;

    if (logica !== 'SIMPLE' && nodo && nodo.aprobadores.length > 1) {

      const aprobadoresInfo = nodo.aprobadores.map((uid) => {

        const aprobUser = byId.get(uid);

        return { id: uid, nombre: aprobUser?.nombre ?? uid };

      });

      chain.push({
        id: effectiveId,
        nombre: effectiveUser.nombre,
        logica,
        aprobadores: aprobadoresInfo,
        montoMax: max,
      });

    } else {

      chain.push({
        id: effectiveId,
        nombre: effectiveUser.nombre,
        logica: 'SIMPLE',
        aprobadores: [{ id: effectiveId, nombre: effectiveUser.nombre }],
        montoMax: max,
      });

    }

    if (max == null || max >= monto) break;



    currentId = nodo ? nextCurrentId(nodo) : null;

  }



  return chain;

}



/** Orquestador: fase 2 (grupos+escalas) con fallback a organigrama fase 1. */

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

    solicitanteEsMantenedor,

  } = input;



  const useGrupos = hasGruposActivos(modulo, grupos);

  const nodosModulo = nodos.filter((n) => n.activo);

  const pool = effectivePoolIds(allowedIds, nodosModulo, useGrupos && nodosModulo.length > 0);

  if (!pool.length) return { status: 'no_pool' };



  const opts: CadenaAprobacionOpts = { delegaciones, modulo, at };



  let cadena: AprobadorPaso[];

  if (useGrupos) {

    const grupo = resolveGrupoSolicitante(
      solicitanteId,
      modulo,
      grupos,
      solicitanteEsMantenedor,
    );

    if (!grupo) return { status: 'sin_grupo' };

    cadena = buildCadenaDesdeGrupo(solicitanteId, monto, grupo, nodosModulo, usuarios, pool, opts);

  } else {

    cadena = buildCadenaAprobacion(solicitanteId, monto, usuarios, pool, opts);

  }



  if (!cadena.length) return { status: 'sin_cadena' };



  const first = cadena[0];

  return {

    status: 'ok',

    aprobadorId: first.id,

    aprobadorNombre: first.nombre,

    cadenaIds: cadena.map((c) => c.id),

    pasoTotal: cadena.length,

    cadena,

  };

}

