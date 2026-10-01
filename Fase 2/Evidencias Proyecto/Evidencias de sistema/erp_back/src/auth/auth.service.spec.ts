import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { superAdminUser, tenantUser } from '../test-utils/prisma-mock';

const MENSAJE_RECOVER =
  'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.';

function prismaAuth() {
  const usuario = {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  };
  const refreshToken = {
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const passwordResetToken = {
    findUnique: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
  };
  const prisma = {
    usuario,
    refreshToken,
    passwordResetToken,
    $transaction: jest.fn(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      throw new Error('$transaction inesperado');
    }),
  };
  return prisma;
}

describe('AuthService contraseñas', () => {
  const prisma = prismaAuth();
  const config = { get: jest.fn() } as unknown as ConfigService;
  const service = new AuthService(prisma as never, {} as JwtService, config);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.usuario.update.mockResolvedValue({});
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetToken.update.mockResolvedValue({});
    prisma.passwordResetToken.create.mockResolvedValue({});
  });

  describe('changePassword', () => {
    it('rechaza a un usuario que no es administrador y no toca el hash', async () => {
      await expect(service.changePassword(tenantUser(), 'NuevaClave1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.changePassword(tenantUser(), 'NuevaClave1')).rejects.toThrow(
        'Solo el administrador puede cambiar contraseñas',
      );

      expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
      expect(prisma.usuario.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('permite al super admin cambiar su propia contraseña', async () => {
      const hashPrevio = 'hash-intacto';
      prisma.usuario.findUnique.mockResolvedValue({
        id: 'U-1',
        activo: true,
        passwordHash: hashPrevio,
      });

      const result = await service.changePassword(superAdminUser(), 'NuevaClave1');

      expect(result.message).toBe('Contraseña actualizada correctamente');
      expect(prisma.usuario.update).toHaveBeenCalledTimes(1);
      const data = prisma.usuario.update.mock.calls[0][0].data as { passwordHash: string };
      expect(data.passwordHash).not.toBe(hashPrevio);
      expect(data.passwordHash.startsWith('$2')).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('recoverPassword', () => {
    it('no crea token si la cuenta existe y no es administrador, con el mensaje genérico', async () => {
      prisma.usuario.findUnique.mockResolvedValue({
        id: 'U-2',
        email: 'user@almahue.local',
        activo: true,
        rolId: 'ROL-2',
        rol: { permisos: ['comercial:read'] },
      });

      const result = await service.recoverPassword('User@almahue.local');

      expect(result).toEqual({ message: MENSAJE_RECOVER });
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('crea token cuando el solicitante es administrador', async () => {
      prisma.usuario.findUnique.mockResolvedValue({
        id: 'U-1',
        email: 'admin@almahue.local',
        activo: true,
        rolId: 'ROL-1',
        rol: { permisos: ['*'] },
      });

      const result = await service.recoverPassword('admin@almahue.local');

      expect(result).toEqual({ message: MENSAJE_RECOVER });
      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetPassword', () => {
    it('rechaza el canje si el usuario del token no es administrador y no cambia la clave', async () => {
      const hashPrevio = 'hash-intacto';
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        userId: 'U-2',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        usuario: {
          id: 'U-2',
          activo: true,
          rolId: 'ROL-2',
          passwordHash: hashPrevio,
          rol: { permisos: ['comercial:write'] },
        },
      });

      await expect(service.resetPassword('token-plano', 'NuevaClave1')).rejects.toThrow(
        'Solo el administrador puede cambiar contraseñas',
      );

      expect(prisma.usuario.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.update).not.toHaveBeenCalled();
    });

    it('cambia la clave si el token pertenece a un administrador', async () => {
      const hashPrevio = 'hash-intacto';
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'tok-admin',
        userId: 'U-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        usuario: {
          id: 'U-1',
          activo: true,
          rolId: 'ROL-1',
          passwordHash: hashPrevio,
          rol: { permisos: ['*'] },
        },
      });

      const result = await service.resetPassword('token-admin', 'NuevaClave1');

      expect(result.message).toBe('Contraseña actualizada correctamente');
      const data = prisma.usuario.update.mock.calls[0][0].data as { passwordHash: string };
      expect(data.passwordHash).not.toBe(hashPrevio);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
