import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { isAdminRolId } from './tenant.util';

export const APROBADOR_SIN_BANDEJA = 'APROBADOR_SIN_BANDEJA';

export type PermisoPantallaRow = {
  pantalla: string;
  lectura?: boolean;
  escritura?: boolean;
};

export type AprobadorSinBandejaItem = {
  usuarioId: string;
  nombre: string;
  email: string;
  rolId: string;
  rolNombre: string;
  modulo: string;
  pantallaRequerida: string;
  mensaje: string;
};

const MODULO_BANDEJA: Record<
  string,
  { labelModulo: string; pantalla: string; permisoMod: string }
> = {
  compras: {
    labelModulo: 'Compras',
    pantalla: 'Compras · Aprobaciones',
    permisoMod: 'compras',
  },
};

function normModulo(modulo: string): string {
  return modulo.trim().toLowerCase();
}

export function bandejaConfigForModulo(modulo: string) {
  const cfg = MODULO_BANDEJA[normModulo(modulo)];
  if (!cfg) return null;
  return cfg;
}

function pantallaLectura(
  permisosPantalla: PermisoPantallaRow[] | null | undefined,
  pantalla: string,
): boolean {
  const row = (permisosPantalla ?? []).find((p) => p.pantalla === pantalla);
  return Boolean(row?.lectura);
}

function pantallaEscritura(
  permisosPantalla: PermisoPantallaRow[] | null | undefined,
  pantalla: string,
): boolean {
  const row = (permisosPantalla ?? []).find((p) => p.pantalla === pantalla);
  return Boolean(row?.lectura && row?.escritura);
}

/** True si el rol puede ver la bandeja: pantalla «Compras · Aprobaciones» o `*` / ROL-1. */
export function usuarioTieneBandejaLectura(
  rolId: string,
  permisos: string[],
  permisosPantalla: PermisoPantallaRow[] | null | undefined,
  modulo: string,
): boolean {
  if (isAdminRolId(rolId) || permisos.includes('*')) return true;
  const cfg = bandejaConfigForModulo(modulo);
  if (!cfg) return true;
  return pantallaLectura(permisosPantalla, cfg.pantalla);
}

/** True si puede aprobar/rechazar: escritura en «Compras · Aprobaciones» o `*` / ROL-1. */
export function usuarioTieneBandejaEscritura(
  rolId: string,
  permisos: string[],
  permisosPantalla: PermisoPantallaRow[] | null | undefined,
  modulo: string,
): boolean {
  if (isAdminRolId(rolId) || permisos.includes('*')) return true;
  const cfg = bandejaConfigForModulo(modulo);
  if (!cfg) return true;
  return pantallaEscritura(permisosPantalla, cfg.pantalla);
}

export function mensajeBandejaFaltante(modulo: string): string {
  const cfg = bandejaConfigForModulo(modulo);
  if (!cfg) return 'Sin acceso a la bandeja de aprobaciones';
  return `El rol debe incluir «${cfg.labelModulo} → Aprobaciones» con permiso de lectura (y escritura para aprobar/rechazar).`;
}

export function buildAprobadorSinBandejaItem(
  usuario: { id: string; nombre: string; email: string; rolId: string },
  rol: { nombre: string },
  modulo: string,
): AprobadorSinBandejaItem {
  const cfg = bandejaConfigForModulo(modulo)!;
  return {
    usuarioId: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rolId: usuario.rolId,
    rolNombre: rol.nombre,
    modulo: cfg.labelModulo,
    pantallaRequerida: `${cfg.labelModulo} → Aprobaciones`,
    mensaje: mensajeBandejaFaltante(modulo),
  };
}

export function throwAprobadorSinBandeja(invalidos: AprobadorSinBandejaItem[]): never {
  throw new BadRequestException({
    code: APROBADOR_SIN_BANDEJA,
    message:
      invalidos.length === 1
        ? `${invalidos[0].nombre} no puede usar la bandeja de ${invalidos[0].modulo}. ${invalidos[0].mensaje}`
        : `${invalidos.length} usuarios no pueden usar la bandeja de aprobaciones. Revise roles y permisos.`,
    invalidos,
  });
}

type RolBandeja = {
  id: string;
  nombre: string;
  permisos: string[];
  permisosPantalla: unknown;
};

type UsuarioBandeja = {
  id: string;
  nombre: string;
  email: string;
  rolId: string;
  rol: RolBandeja;
};

export function findUsuariosSinBandeja(
  modulo: string,
  usuarios: UsuarioBandeja[],
  mode: 'read' | 'write' = 'read',
): AprobadorSinBandejaItem[] {
  const cfg = bandejaConfigForModulo(modulo);
  if (!cfg) return [];
  const check =
    mode === 'write' ? usuarioTieneBandejaEscritura : usuarioTieneBandejaLectura;
  const invalidos: AprobadorSinBandejaItem[] = [];
  for (const u of usuarios) {
    const pp = (u.rol.permisosPantalla ?? null) as PermisoPantallaRow[] | null;
    if (!check(u.rolId, u.rol.permisos ?? [], pp, modulo)) {
      invalidos.push(buildAprobadorSinBandejaItem(u, u.rol, modulo));
    }
  }
  return invalidos;
}

/** Usuarios que ya firman en reglas: tienen bandeja runtime vía `bandejaModulos`. */
export async function loadUsuarioIdsDesignadosBandeja(
  prisma: PrismaService,
  empresaId: string,
  modulo: string,
  usuarioIds: string[],
): Promise<Set<string>> {
  const unique = [...new Set(usuarioIds.filter(Boolean))];
  if (!unique.length) return new Set();
  const moduloFilter = { equals: modulo, mode: 'insensitive' as const };
  const [grupos, nodos, delegs] = await Promise.all([
    prisma.grupoAprobacion.findMany({
      where: {
        empresaId,
        activo: true,
        modulo: moduloFilter,
        aprobadorInicialId: { in: unique },
      },
      select: { aprobadorInicialId: true },
    }),
    prisma.nodoEscalaAprobacion.findMany({
      where: {
        empresaId,
        activo: true,
        modulo: moduloFilter,
        OR: [
          { usuarioId: { in: unique } },
          { aprobadores: { some: { usuarioId: { in: unique } } } },
        ],
      },
      select: {
        usuarioId: true,
        aprobadores: { select: { usuarioId: true } },
      },
    }),
    prisma.delegacionAprobacion.findMany({
      where: {
        empresaId,
        activo: true,
        OR: [
          { modulo: null },
          { modulo: { equals: modulo, mode: 'insensitive' } },
        ],
        AND: [
          { OR: [{ titularId: { in: unique } }, { suplenteId: { in: unique } }] },
        ],
      },
      select: { titularId: true, suplenteId: true },
    }),
  ]);
  const out = new Set<string>();
  for (const g of grupos) out.add(g.aprobadorInicialId);
  for (const n of nodos) {
    out.add(n.usuarioId);
    for (const a of n.aprobadores ?? []) out.add(a.usuarioId);
  }
  for (const d of delegs) {
    out.add(d.titularId);
    out.add(d.suplenteId);
  }
  return out;
}

export async function loadUsuariosParaBandeja(
  prisma: PrismaService,
  usuarioIds: string[],
): Promise<UsuarioBandeja[]> {
  const unique = [...new Set(usuarioIds.filter(Boolean))];
  if (!unique.length) return [];
  return prisma.usuario.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      nombre: true,
      email: true,
      rolId: true,
      rol: {
        select: {
          id: true,
          nombre: true,
          permisos: true,
          permisosPantalla: true,
        },
      },
    },
  });
}

/** Módulos con bandeja visible para el usuario (permiso o designación en reglas). */
export async function computeBandejaModulos(
  prisma: PrismaService,
  usuarioId: string,
  rolId: string,
  permisos: string[],
  permisosPantalla: PermisoPantallaRow[] | null | undefined,
  empresaIds: string[],
): Promise<string[]> {
  const out = new Set<string>();
  for (const mod of ['Compras']) {
    if (usuarioTieneBandejaLectura(rolId, permisos, permisosPantalla, mod)) {
      out.add(mod);
    }
  }
  if (!empresaIds.length) return [...out];

  const [enEscala, enGrupo, suplente] = await Promise.all([
    prisma.nodoEscalaAprobacion.findFirst({
      where: {
        empresaId: { in: empresaIds },
        activo: true,
        OR: [
          { usuarioId },
          { aprobadores: { some: { usuarioId } } },
        ],
      },
      select: { modulo: true },
    }),
    prisma.grupoAprobacion.findFirst({
      where: {
        empresaId: { in: empresaIds },
        activo: true,
        aprobadorInicialId: usuarioId,
      },
      select: { modulo: true },
    }),
    prisma.delegacionAprobacion.findFirst({
      where: {
        empresaId: { in: empresaIds },
        activo: true,
        suplenteId: usuarioId,
        OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: new Date() } }],
      },
      select: { modulo: true },
    }),
  ]);

  for (const row of [enEscala, enGrupo, suplente]) {
    if (row?.modulo?.trim().toLowerCase() === 'compras') out.add(row.modulo);
  }

  return [...out];
}
