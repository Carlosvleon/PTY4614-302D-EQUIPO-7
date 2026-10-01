import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  assertPinAprobacion,
  isPinAprobacionFormat,
  usuarioPuedeUsarPinAprobacion,
} from './pin-aprobacion';
import type { PrismaService } from '../prisma/prisma.service';

describe('pin-aprobacion', () => {
  describe('isPinAprobacionFormat', () => {
    it('acepta exactamente 4 dígitos', () => {
      expect(isPinAprobacionFormat('4821')).toBe(true);
      expect(isPinAprobacionFormat(' 0000 ')).toBe(true);
    });
    it('rechaza otros formatos', () => {
      expect(isPinAprobacionFormat('482')).toBe(false);
      expect(isPinAprobacionFormat('48213')).toBe(false);
      expect(isPinAprobacionFormat('48a1')).toBe(false);
      expect(isPinAprobacionFormat('')).toBe(false);
    });
  });

  describe('usuarioPuedeUsarPinAprobacion', () => {
    const prisma = {
      usuario: { findUnique: jest.fn() },
      workflowConfig: { findFirst: jest.fn() },
      nodoEscalaAprobacion: { findFirst: jest.fn() },
    } as unknown as PrismaService;

    beforeEach(() => {
      jest.clearAllMocks();
      (prisma.nodoEscalaAprobacion.findFirst as jest.Mock).mockResolvedValue(null);
    });

    it('true para Administrador (ROL-1)', async () => {
      (prisma.usuario.findUnique as jest.Mock).mockResolvedValue({
        rolId: 'ROL-1',
        rol: { permisos: ['*'] },
      });
      await expect(usuarioPuedeUsarPinAprobacion(prisma, 'U-1')).resolves.toBe(true);
      expect(prisma.workflowConfig.findFirst).not.toHaveBeenCalled();
    });

    it('true si está en pool activo de workflow', async () => {
      (prisma.usuario.findUnique as jest.Mock).mockResolvedValue({
        rolId: 'ROL-2',
        rol: { permisos: ['compras:read'] },
      });
      (prisma.workflowConfig.findFirst as jest.Mock).mockResolvedValue({ id: 'WF-1' });
      await expect(usuarioPuedeUsarPinAprobacion(prisma, 'U-JEFE')).resolves.toBe(true);
    });

    it('true si está como extra AND/OR en NodoAprobador', async () => {
      (prisma.usuario.findUnique as jest.Mock).mockResolvedValue({
        rolId: 'ROL-2',
        rol: { permisos: ['compras:read'] },
      });
      (prisma.workflowConfig.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.nodoEscalaAprobacion.findFirst as jest.Mock).mockResolvedValue({ id: 'N-AND' });
      await expect(usuarioPuedeUsarPinAprobacion(prisma, 'U-EXTRA')).resolves.toBe(true);
      expect(prisma.nodoEscalaAprobacion.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ aprobadores: { some: { usuarioId: 'U-EXTRA' } } }),
            ]),
          }),
        }),
      );
    });

    it('false si no es admin ni está en pool', async () => {
      (prisma.usuario.findUnique as jest.Mock).mockResolvedValue({
        rolId: 'ROL-2',
        rol: { permisos: ['compras:read'] },
      });
      (prisma.workflowConfig.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(usuarioPuedeUsarPinAprobacion(prisma, 'U-X')).resolves.toBe(false);
    });
  });

  describe('assertPinAprobacion', () => {
    const prisma = {
      usuario: { findUnique: jest.fn() },
      workflowConfig: { findFirst: jest.fn() },
      nodoEscalaAprobacion: { findFirst: jest.fn() },
    } as unknown as PrismaService;

    beforeEach(() => {
      jest.clearAllMocks();
      (prisma.nodoEscalaAprobacion.findFirst as jest.Mock).mockResolvedValue(null);
    });

    it('no-op si el usuario no es aprobador (fuera del pool)', async () => {
      (prisma.usuario.findUnique as jest.Mock)
        .mockResolvedValueOnce({
          activo: true,
          pinAprobacionHash: null,
        })
        .mockResolvedValueOnce({
          rolId: 'ROL-2',
          rol: { permisos: [] },
        });
      (prisma.workflowConfig.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(assertPinAprobacion(prisma, 'U-1', undefined)).resolves.toBeUndefined();
    });

    it('exige PIN si está en el pool y no viene', async () => {
      (prisma.usuario.findUnique as jest.Mock)
        .mockResolvedValueOnce({
          activo: true,
          pinAprobacionHash: 'hash',
        })
        .mockResolvedValueOnce({
          rolId: 'ROL-2',
          rol: { permisos: [] },
        });
      (prisma.workflowConfig.findFirst as jest.Mock).mockResolvedValue({ id: 'WF-1' });
      await expect(assertPinAprobacion(prisma, 'U-1', undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza formato inválido', async () => {
      (prisma.usuario.findUnique as jest.Mock)
        .mockResolvedValueOnce({
          activo: true,
          pinAprobacionHash: 'hash',
        })
        .mockResolvedValueOnce({
          rolId: 'ROL-2',
          rol: { permisos: [] },
        });
      (prisma.workflowConfig.findFirst as jest.Mock).mockResolvedValue({ id: 'WF-1' });
      await expect(assertPinAprobacion(prisma, 'U-1', '12')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('exige PIN registrado en perfil', async () => {
      (prisma.usuario.findUnique as jest.Mock)
        .mockResolvedValueOnce({
          activo: true,
          pinAprobacionHash: null,
        })
        .mockResolvedValueOnce({
          rolId: 'ROL-2',
          rol: { permisos: [] },
        });
      (prisma.workflowConfig.findFirst as jest.Mock).mockResolvedValue({ id: 'WF-1' });
      await expect(assertPinAprobacion(prisma, 'U-1', '4821')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza PIN incorrecto', async () => {
      const hash = await bcrypt.hash('4821', 4);
      (prisma.usuario.findUnique as jest.Mock)
        .mockResolvedValueOnce({
          activo: true,
          pinAprobacionHash: hash,
        })
        .mockResolvedValueOnce({
          rolId: 'ROL-2',
          rol: { permisos: [] },
        });
      (prisma.workflowConfig.findFirst as jest.Mock).mockResolvedValue({ id: 'WF-1' });
      await expect(assertPinAprobacion(prisma, 'U-1', '0000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('acepta PIN correcto', async () => {
      const hash = await bcrypt.hash('4821', 4);
      (prisma.usuario.findUnique as jest.Mock)
        .mockResolvedValueOnce({
          activo: true,
          pinAprobacionHash: hash,
        })
        .mockResolvedValueOnce({
          rolId: 'ROL-2',
          rol: { permisos: [] },
        });
      (prisma.workflowConfig.findFirst as jest.Mock).mockResolvedValue({ id: 'WF-1' });
      await expect(assertPinAprobacion(prisma, 'U-1', '4821')).resolves.toBeUndefined();
    });

    it('sesión inválida si usuario inactivo', async () => {
      (prisma.usuario.findUnique as jest.Mock).mockResolvedValue({
        activo: false,
        pinAprobacionHash: null,
      });
      await expect(assertPinAprobacion(prisma, 'U-1', '4821')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('con force exige PIN aunque no esté en el pool', async () => {
      const hash = await bcrypt.hash('4821', 4);
      (prisma.usuario.findUnique as jest.Mock).mockResolvedValue({
        activo: true,
        pinAprobacionHash: hash,
      });
      await expect(
        assertPinAprobacion(prisma, 'U-1', undefined, { force: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        assertPinAprobacion(prisma, 'U-1', '4821', { force: true }),
      ).resolves.toBeUndefined();
    });
  });
});
