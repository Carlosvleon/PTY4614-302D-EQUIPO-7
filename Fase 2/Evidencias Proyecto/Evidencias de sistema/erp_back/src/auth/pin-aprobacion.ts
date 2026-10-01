import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { PrismaService } from '../prisma/prisma.service';
import { ADMIN_ROL_ID, isAdminRolId } from './tenant.util';

const PIN_RE = /^\d{4}$/;

export function isPinAprobacionFormat(pin: string): boolean {
  return PIN_RE.test(pin.trim());
}

/**
 * Quién puede configurar / debe usar PIN al aprobar:
 * - rol master Administrador (acceso total), o
 * - usuario listado en alguna regla activa de Workflow (`aprobadorIds`), o
 * - usuario en un nodo de escala activo (`NodoEscalaAprobacion`).
 */
export async function usuarioPuedeUsarPinAprobacion(
  prisma: PrismaService,
  userId: string,
): Promise<boolean> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: userId },
    select: {
      rolId: true,
      rol: { select: { permisos: true } },
    },
  });
  if (!usuario) return false;
  if (
    isAdminRolId(usuario.rolId)
    || (usuario.rol.permisos?.includes('*') ?? false)
    || usuario.rolId === ADMIN_ROL_ID
  ) {
    return true;
  }
  const enPool = await prisma.workflowConfig.findFirst({
    where: {
      activo: true,
      aprobadorIds: { has: userId },
    },
    select: { id: true },
  });
  if (enPool) return true;
  const enEscala = await prisma.nodoEscalaAprobacion.findFirst({
    where: {
      activo: true,
      OR: [
        { usuarioId: userId },
        { escalaAUsuarioId: userId },
        { aprobadores: { some: { usuarioId: userId } } },
      ],
    },
    select: { id: true },
  });
  return Boolean(enEscala);
}

/**
 * Exige PIN de 4 dígitos válido cuando el usuario es aprobador (pool / Admin),
 * o siempre si `force: true` (p. ej. reversa de proforma).
 */
export async function assertPinAprobacion(
  prisma: PrismaService,
  userId: string,
  pin: string | undefined,
  opts?: { force?: boolean },
): Promise<void> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: userId },
    select: {
      activo: true,
      pinAprobacionHash: true,
    },
  });
  if (!usuario?.activo) {
    throw new UnauthorizedException('Sesión inválida');
  }

  const requiere = opts?.force
    ? true
    : await usuarioPuedeUsarPinAprobacion(prisma, userId);
  if (!requiere) return;

  const raw = (pin ?? '').trim();
  if (!raw) {
    throw new BadRequestException(
      'Debes ingresar tu PIN de aprobación (4 dígitos). Configúralo en Mi Perfil si aún no lo tienes.',
    );
  }
  if (!isPinAprobacionFormat(raw)) {
    throw new BadRequestException('El PIN debe ser exactamente 4 dígitos numéricos');
  }
  if (!usuario.pinAprobacionHash) {
    throw new BadRequestException(
      'Debes registrar tu PIN de aprobación en Mi Perfil antes de continuar',
    );
  }
  const ok = await bcrypt.compare(raw, usuario.pinAprobacionHash);
  if (!ok) {
    throw new UnauthorizedException('PIN incorrecto');
  }
}
