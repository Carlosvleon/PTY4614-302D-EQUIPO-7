import type { CatalogoImportacionTipo, Prisma } from '@prisma/client';
import type { JwtPayload } from '../../auth/jwt.strategy';

export const CATALOGO_IMPORTACION_RESUMEN_MAX = 200;

export type CatalogoImportacionResumenItem = {
  codigo: string;
  cambios: string[];
};

export async function registrarCatalogoImportacion(
  prisma: Prisma.TransactionClient | { catalogoImportacion: { create: (args: unknown) => Promise<unknown> } },
  params: {
    empresaId: string;
    user: JwtPayload;
    tipo: CatalogoImportacionTipo;
    archivoNombre?: string;
    created: number;
    updated: number;
    unchanged?: number;
    politicas?: Record<string, unknown>;
    resumen?: CatalogoImportacionResumenItem[];
  },
) {
  const resumen = (params.resumen ?? []).slice(0, CATALOGO_IMPORTACION_RESUMEN_MAX);
  let usuarioNombre: string | null = null;
  const withUsuario = prisma as {
    usuario?: { findUnique: (args: unknown) => Promise<{ nombre: string } | null> };
    catalogoImportacion: { create: (args: { data: unknown }) => Promise<unknown> };
  };
  if (params.user.sub && withUsuario.usuario?.findUnique) {
    try {
      const u = await withUsuario.usuario.findUnique({
        where: { id: params.user.sub },
        select: { nombre: true },
      });
      usuarioNombre = u?.nombre ?? null;
    } catch {
      usuarioNombre = null;
    }
  }
  await withUsuario.catalogoImportacion.create({
    data: {
      tipo: params.tipo,
      archivoNombre: params.archivoNombre?.slice(0, 255) || null,
      created: params.created,
      updated: params.updated,
      unchanged: params.unchanged ?? 0,
      politicas: params.politicas ?? undefined,
      resumen,
      usuarioId: params.user.sub || null,
      usuarioEmail: params.user.email || null,
      usuarioNombre,
      empresaId: params.empresaId,
    },
  });
}
