/** Parseo y resolución de respaldos de aprobaciones (por empresa). */

export type BackupUsuario = {
  id: string;
  email: string | null;
  nombre: string;
  username?: string | null;
};

export type BackupGrupo = {
  id: string;
  modulo: string;
  nombre: string;
  aprobadorInicialId: string;
  activo: boolean;
  miembroIds: string[];
};

export type BackupNodo = {
  id: string;
  grupoId: string;
  modulo: string;
  usuarioId: string;
  logica: string;
  montoMax: number | null;
  escalaAUsuarioId: string | null;
  escalaAId: string | null;
  activo: boolean;
  aprobadores: Array<{ usuarioId: string; orden: number }>;
};

export type BackupDelegacion = {
  titularId: string;
  suplenteId: string;
  modulo: string | null;
  vigenciaDesde: string;
  vigenciaHasta: string | null;
  motivo: string | null;
  activo: boolean;
};

export type BackupAdmin = {
  usuarioId: string;
  modulo: string;
  activo: boolean;
};

export type AprobacionesBackup = {
  version: number;
  empresaId: string | null;
  empresaNombre: string | null;
  exportadoEn: string;
  usuarios: BackupUsuario[];
  grupos: BackupGrupo[];
  nodos: BackupNodo[];
  delegaciones: BackupDelegacion[];
  adminConcepto: BackupAdmin[];
};

export type ResolucionUsuario = {
  accion: 'reemplazar' | 'eliminar';
  nuevoUsuarioId?: string | null;
};

export type EslabonFaltante = {
  usuarioId: string;
  email: string | null;
  nombre: string | null;
  usos: Array<{
    tipo: 'cadena' | 'miembro' | 'delegacion' | 'admin';
    modulo: string;
    grupoNombre?: string;
    detalle: string;
  }>;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v != null ? String(v).trim() : '';
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function parseAprobacionesBackup(raw: Record<string, unknown>): AprobacionesBackup {
  const version = Number(raw.version ?? 0);
  if (version !== 1 && version !== 2) {
    throw new Error('Formato inválido: se esperaba version 1 o 2');
  }
  const usuariosCatalog = new Map<string, BackupUsuario>();
  for (const u of asArr(raw.usuarios)) {
    const r = asRecord(u);
    if (!r) continue;
    const id = asStr(r.id);
    if (!id) continue;
    usuariosCatalog.set(id, {
      id,
      email: asStr(r.email) || null,
      nombre: asStr(r.nombre) || id,
      username: asStr(r.username) || null,
    });
  }

  const grupos: BackupGrupo[] = [];
  for (const g of asArr(raw.grupos)) {
    const r = asRecord(g);
    if (!r) continue;
    const id = asStr(r.id);
    const nombre = asStr(r.nombre);
    const modulo = asStr(r.modulo);
    const aprobadorInicialId = asStr(r.aprobadorInicialId);
    if (!nombre || !modulo || !aprobadorInicialId) continue;
    let miembroIds: string[] = [];
    if (Array.isArray(r.miembroIds)) miembroIds = (r.miembroIds as unknown[]).map(asStr).filter(Boolean);
    else if (Array.isArray(r.miembros)) {
      miembroIds = (r.miembros as unknown[])
        .map((m) => {
          const mr = asRecord(m);
          return asStr(mr?.usuarioId ?? mr?.id);
        })
        .filter(Boolean);
    }
    grupos.push({
      id: id || `tmp-${grupos.length}`,
      modulo,
      nombre,
      aprobadorInicialId,
      activo: r.activo !== false,
      miembroIds: [...new Set(miembroIds)],
    });
  }

  const nodos: BackupNodo[] = [];
  for (const n of asArr(raw.nodos)) {
    const r = asRecord(n);
    if (!r) continue;
    const usuarioId = asStr(r.usuarioId);
    const grupoId = asStr(r.grupoId);
    const modulo = asStr(r.modulo);
    if (!usuarioId || !grupoId || !modulo) continue;
    const aprobadores: Array<{ usuarioId: string; orden: number }> = [];
    if (Array.isArray(r.aprobadores)) {
      (r.aprobadores as unknown[]).forEach((a, i) => {
        const ar = asRecord(a);
        const uid = asStr(ar?.usuarioId);
        if (uid) aprobadores.push({ usuarioId: uid, orden: Number(ar?.orden ?? i) });
      });
    }
    nodos.push({
      id: asStr(r.id) || `nodo-${nodos.length}`,
      grupoId,
      modulo,
      usuarioId,
      logica: asStr(r.logica) || 'SIMPLE',
      montoMax: r.montoMax != null && r.montoMax !== '' ? Number(r.montoMax) : null,
      escalaAUsuarioId: asStr(r.escalaAUsuarioId) || null,
      escalaAId: asStr(r.escalaAId) || null,
      activo: r.activo !== false,
      aprobadores,
    });
  }

  const delegaciones: BackupDelegacion[] = [];
  for (const d of asArr(raw.delegaciones)) {
    const r = asRecord(d);
    if (!r) continue;
    const titularId = asStr(r.titularId);
    const suplenteId = asStr(r.suplenteId);
    if (!titularId || !suplenteId) continue;
    delegaciones.push({
      titularId,
      suplenteId,
      modulo: asStr(r.modulo) || null,
      vigenciaDesde: asStr(r.vigenciaDesde) || new Date().toISOString(),
      vigenciaHasta: asStr(r.vigenciaHasta) || null,
      motivo: asStr(r.motivo) || null,
      activo: r.activo !== false,
    });
  }

  const adminConcepto: BackupAdmin[] = [];
  for (const a of asArr(raw.adminConcepto)) {
    const r = asRecord(a);
    if (!r) continue;
    const usuarioId = asStr(r.usuarioId);
    const modulo = asStr(r.modulo);
    if (!usuarioId || !modulo) continue;
    adminConcepto.push({ usuarioId, modulo, activo: r.activo !== false });
  }

  return {
    version,
    empresaId: asStr(raw.empresaId) || null,
    empresaNombre: asStr(raw.empresaNombre) || null,
    exportadoEn: asStr(raw.exportadoEn) || new Date().toISOString(),
    usuarios: [...usuariosCatalog.values()],
    grupos,
    nodos,
    delegaciones,
    adminConcepto,
  };
}

export function collectUsos(backup: AprobacionesBackup): Map<string, EslabonFaltante['usos']> {
  const usos = new Map<string, EslabonFaltante['usos']>();
  const push = (usuarioId: string, uso: EslabonFaltante['usos'][number]) => {
    if (!usuarioId) return;
    const list = usos.get(usuarioId) ?? [];
    list.push(uso);
    usos.set(usuarioId, list);
  };
  const grupoNombre = (id: string) => backup.grupos.find((g) => g.id === id)?.nombre ?? id;

  for (const g of backup.grupos) {
    push(g.aprobadorInicialId, {
      tipo: 'cadena',
      modulo: g.modulo,
      grupoNombre: g.nombre,
      detalle: `Aprobador inicial/final de «${g.nombre}»`,
    });
    for (const mid of g.miembroIds) {
      push(mid, {
        tipo: 'miembro',
        modulo: g.modulo,
        grupoNombre: g.nombre,
        detalle: `Integrante de «${g.nombre}»`,
      });
    }
  }
  for (const n of backup.nodos) {
    const gn = grupoNombre(n.grupoId);
    push(n.usuarioId, {
      tipo: 'cadena',
      modulo: n.modulo,
      grupoNombre: gn,
      detalle: `Nodo de escala en «${gn}»`,
    });
    if (n.escalaAUsuarioId) {
      push(n.escalaAUsuarioId, {
        tipo: 'cadena',
        modulo: n.modulo,
        grupoNombre: gn,
        detalle: `Destino «escala a» en «${gn}»`,
      });
    }
    for (const a of n.aprobadores) {
      if (a.usuarioId === n.usuarioId) continue;
      push(a.usuarioId, {
        tipo: 'cadena',
        modulo: n.modulo,
        grupoNombre: gn,
        detalle: `Co-aprobador ${n.logica} en «${gn}»`,
      });
    }
  }
  for (const d of backup.delegaciones) {
    const mod = d.modulo || '(todos)';
    push(d.titularId, { tipo: 'delegacion', modulo: mod, detalle: 'Titular de suplencia' });
    push(d.suplenteId, { tipo: 'delegacion', modulo: mod, detalle: 'Suplente' });
  }
  for (const a of backup.adminConcepto) {
    push(a.usuarioId, { tipo: 'admin', modulo: a.modulo, detalle: `AdminConcepto · ${a.modulo}` });
  }
  return usos;
}

export function catalogUsuario(backup: AprobacionesBackup, id: string): BackupUsuario | undefined {
  return backup.usuarios.find((u) => u.id === id);
}

/** Mapa oldId → newId (string) o null si se elimina. Ids presentes en destino no van en el mapa. */
export function buildUserMap(
  backup: AprobacionesBackup,
  destById: Map<string, { id: string; email: string; nombre: string }>,
  destByEmail: Map<string, { id: string; email: string; nombre: string }>,
  resoluciones: Record<string, ResolucionUsuario>,
): { map: Map<string, string | null>; faltantes: string[] } {
  const allIds = [...collectUsos(backup).keys()];
  const map = new Map<string, string | null>();
  const faltantes: string[] = [];

  for (const oldId of allIds) {
    if (destById.has(oldId)) continue;
    const cat = catalogUsuario(backup, oldId);
    const email = cat?.email?.trim().toLowerCase();
    if (email && destByEmail.has(email)) {
      map.set(oldId, destByEmail.get(email)!.id);
      continue;
    }
    const res = resoluciones[oldId];
    if (res?.accion === 'eliminar') {
      map.set(oldId, null);
      continue;
    }
    if (res?.accion === 'reemplazar' && res.nuevoUsuarioId && destById.has(res.nuevoUsuarioId)) {
      map.set(oldId, res.nuevoUsuarioId);
      continue;
    }
    faltantes.push(oldId);
  }
  return { map, faltantes };
}

function mapId(userMap: Map<string, string | null>, id: string | null | undefined): string | null {
  if (!id) return null;
  if (userMap.has(id)) return userMap.get(id) ?? null;
  return id;
}

function nextKeptUser(
  nodos: BackupNodo[],
  userMap: Map<string, string | null>,
  fromUsuarioId: string | null,
): string | null {
  const byUser = new Map(nodos.map((n) => [n.usuarioId, n]));
  let cur = fromUsuarioId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const mapped = mapId(userMap, cur);
    if (mapped) return mapped;
    cur = byUser.get(cur)?.escalaAUsuarioId ?? null;
  }
  return null;
}

export function applyBackupResolutions(
  backup: AprobacionesBackup,
  userMap: Map<string, string | null>,
): {
  grupos: BackupGrupo[];
  nodos: BackupNodo[];
  delegaciones: BackupDelegacion[];
  adminConcepto: BackupAdmin[];
} {
  const nodosOut: BackupNodo[] = [];
  for (const n of backup.nodos) {
    const usuarioId = mapId(userMap, n.usuarioId);
    if (!usuarioId) continue;
    const extras = n.aprobadores
      .map((a) => ({ usuarioId: mapId(userMap, a.usuarioId), orden: a.orden }))
      .filter((a): a is { usuarioId: string; orden: number } => Boolean(a.usuarioId));
    const uniqueExtras = extras.filter((a, i, arr) => arr.findIndex((x) => x.usuarioId === a.usuarioId) === i);
    nodosOut.push({
      ...n,
      usuarioId,
      escalaAUsuarioId: nextKeptUser(backup.nodos, userMap, n.escalaAUsuarioId),
      aprobadores: uniqueExtras.length ? uniqueExtras : [{ usuarioId, orden: 0 }],
      logica: uniqueExtras.filter((a) => a.usuarioId !== usuarioId).length < 1 ? 'SIMPLE' : n.logica,
    });
  }

  const gruposOut: BackupGrupo[] = [];
  for (const g of backup.grupos) {
    const miembros = [...new Set(g.miembroIds.map((id) => mapId(userMap, id)).filter((id): id is string => Boolean(id)))];
    let inicial = mapId(userMap, g.aprobadorInicialId);
    if (!inicial) {
      const first = nodosOut.find((n) => n.grupoId === g.id);
      inicial = first?.usuarioId ?? null;
    }
    if (!inicial) continue;
    gruposOut.push({
      ...g,
      aprobadorInicialId: inicial,
      miembroIds: miembros,
    });
  }
  const grupoIds = new Set(gruposOut.map((g) => g.id));
  const nodosFiltrados = nodosOut.filter((n) => grupoIds.has(n.grupoId));

  const delegaciones = backup.delegaciones
    .map((d) => ({
      ...d,
      titularId: mapId(userMap, d.titularId) ?? '',
      suplenteId: mapId(userMap, d.suplenteId) ?? '',
    }))
    .filter((d) => d.titularId && d.suplenteId && d.titularId !== d.suplenteId);

  const adminConcepto = backup.adminConcepto
    .map((a) => ({ ...a, usuarioId: mapId(userMap, a.usuarioId) ?? '' }))
    .filter((a) => a.usuarioId);

  return { grupos: gruposOut, nodos: nodosFiltrados, delegaciones, adminConcepto };
}

export function modulosEnBackup(backup: AprobacionesBackup): string[] {
  const set = new Set<string>();
  for (const g of backup.grupos) if (g.modulo) set.add(g.modulo);
  for (const n of backup.nodos) if (n.modulo) set.add(n.modulo);
  for (const a of backup.adminConcepto) if (a.modulo) set.add(a.modulo);
  for (const d of backup.delegaciones) if (d.modulo) set.add(d.modulo);
  return [...set];
}
