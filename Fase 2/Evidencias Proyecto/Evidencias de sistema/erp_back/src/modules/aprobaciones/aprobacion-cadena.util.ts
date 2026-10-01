import type { AprobadorPaso } from './approval-engine';

export type LogicaPaso = 'SIMPLE' | 'AND' | 'OR';
export type EstadoAprobadorCadena = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'OMITIDA';

export type AprobadorCadenaEstado = {
  id: string;
  nombre: string;
  estado: EstadoAprobadorCadena;
};

/** Snapshot persistido en OrdenCompra.aprobacionCadena. */
export type PasoCadena = {
  logica: LogicaPaso;
  aprobadores: AprobadorCadenaEstado[];
};

const LOGICAS: ReadonlySet<string> = new Set(['SIMPLE', 'AND', 'OR']);
const ESTADOS: ReadonlySet<string> = new Set([
  'PENDIENTE',
  'APROBADA',
  'RECHAZADA',
  'OMITIDA',
]);

export function logicaPaso(raw: string | null | undefined): LogicaPaso {
  const v = (raw ?? 'SIMPLE').toUpperCase();
  return LOGICAS.has(v) ? (v as LogicaPaso) : 'SIMPLE';
}

export function pasosFromCadenaEngine(cadena: AprobadorPaso[]): PasoCadena[] {
  return cadena.map((paso) => {
    const logica = logicaPaso(paso.logica);
    const members =
      paso.aprobadores && paso.aprobadores.length > 0
        ? paso.aprobadores
        : [{ id: paso.id, nombre: paso.nombre }];
    return {
      logica,
      aprobadores: members.map((a) => ({
        id: a.id,
        nombre: a.nombre,
        estado: 'PENDIENTE' as const,
      })),
    };
  });
}

export function parseAprobacionCadena(raw: unknown): PasoCadena[] {
  if (!Array.isArray(raw)) return [];
  const out: PasoCadena[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { logica?: unknown; aprobadores?: unknown };
    const aprobadoresRaw = Array.isArray(row.aprobadores) ? row.aprobadores : [];
    const aprobadores: AprobadorCadenaEstado[] = [];
    for (const a of aprobadoresRaw) {
      if (!a || typeof a !== 'object') continue;
      const ar = a as { id?: unknown; nombre?: unknown; estado?: unknown };
      if (typeof ar.id !== 'string' || !ar.id) continue;
      const estado =
        typeof ar.estado === 'string' && ESTADOS.has(ar.estado)
          ? (ar.estado as EstadoAprobadorCadena)
          : 'PENDIENTE';
      aprobadores.push({
        id: ar.id,
        nombre: typeof ar.nombre === 'string' ? ar.nombre : ar.id,
        estado,
      });
    }
    if (!aprobadores.length) continue;
    out.push({ logica: logicaPaso(String(row.logica ?? 'SIMPLE')), aprobadores });
  }
  return out;
}

export function snapshotFromCadenaIds(ids: string[]): PasoCadena[] {
  return ids.filter(Boolean).map((id) => ({
    logica: 'SIMPLE' as const,
    aprobadores: [{ id, nombre: id, estado: 'PENDIENTE' as const }],
  }));
}

export function resolveSnapshot(
  existingJson: unknown,
  cadenaIds: string[],
): PasoCadena[] {
  const parsed = parseAprobacionCadena(existingJson);
  if (parsed.length) return parsed;
  return snapshotFromCadenaIds(cadenaIds);
}

export function marcarAprobadoresEnSnapshot(
  snapshot: PasoCadena[],
  pasoIndex: number,
  cambios: { id: string; estado: EstadoAprobadorCadena }[],
): PasoCadena[] {
  const byId = new Map(cambios.map((c) => [c.id, c.estado]));
  return snapshot.map((paso, i) => {
    if (i !== pasoIndex) return paso;
    return {
      ...paso,
      aprobadores: paso.aprobadores.map((a) =>
        byId.has(a.id) ? { ...a, estado: byId.get(a.id)! } : a,
      ),
    };
  });
}

export type ResolucionAccionPaso = {
  estadoActor: 'APROBADA' | 'RECHAZADA';
  omitirAprobadorIds: string[];
  /** El paso quedó resuelto (escalar / cerrar OC). */
  pasoCompleto: boolean;
  /** Si pasoCompleto y la acción es rechazo, la OC queda RECHAZADO. */
  ocRechazada: boolean;
};

/**
 * AND: todos deben aprobar; un rechazo cierra. OR: un OK omite al resto;
 * un rechazo no cierra si queda otro PENDIENTE.
 */
export function resolverAccionPaso(opts: {
  logica: LogicaPaso;
  pendientesAprobadorIds: string[];
  actorId: string;
  accion: 'APROBAR' | 'RECHAZAR';
}): ResolucionAccionPaso {
  const others = opts.pendientesAprobadorIds.filter((id) => id && id !== opts.actorId);
  if (opts.accion === 'APROBAR') {
    if (opts.logica === 'AND') {
      return {
        estadoActor: 'APROBADA',
        omitirAprobadorIds: [],
        pasoCompleto: others.length === 0,
        ocRechazada: false,
      };
    }
    return {
      estadoActor: 'APROBADA',
      omitirAprobadorIds: others,
      pasoCompleto: true,
      ocRechazada: false,
    };
  }
  if (opts.logica === 'OR' && others.length > 0) {
    return {
      estadoActor: 'RECHAZADA',
      omitirAprobadorIds: [],
      pasoCompleto: false,
      ocRechazada: false,
    };
  }
  return {
    estadoActor: 'RECHAZADA',
    omitirAprobadorIds: others,
    pasoCompleto: true,
    ocRechazada: true,
  };
}
