import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminService } from './admin.service';
import {
  createPrismaMock,
  superAdminUser,
  tenantUser,
} from '../../test-utils/prisma-mock';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof createPrismaMock>['prisma'];

  beforeEach(() => {
    const harness = createPrismaMock();
    prisma = harness.prisma;
    service = new AdminService(harness.mock);
  });

  describe('createEmpresa', () => {
    it('crea empresa (happy path) como Super Admin', async () => {
      prisma.empresa.count.mockResolvedValue(2);
      prisma.empresa.create.mockResolvedValue({
        id: 'EMP-3',
        rut: '76.999.888-1',
        razonSocial: 'Nueva SpA',
        giro: null,
        activa: true,
      });

      const result = await service.createEmpresa(superAdminUser(), {
        razonSocial: 'Nueva SpA',
        rut: '76.999.888-1',
        activa: true,
      });

      expect(result.id).toBe('EMP-3');
      const data = prisma.empresa.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(data).toEqual(expect.objectContaining({ id: 'EMP-3', rut: '76.999.888-1' }));
      expect(data).not.toHaveProperty('representanteLegalNombre');
      expect(data).not.toHaveProperty('representanteLegalRut');
      expect(data).not.toHaveProperty('representanteLegalEmail');
      expect(data).not.toHaveProperty('representanteLegalTelefono');
      expect(data).not.toHaveProperty('emailContacto');
      expect(data).not.toHaveProperty('direccion');
    });

    it('persiste representante, mail en minúsculas y dirección', async () => {
      prisma.empresa.count.mockResolvedValue(2);
      prisma.empresa.create.mockResolvedValue({ id: 'EMP-3' });

      await service.createEmpresa(superAdminUser(), {
        razonSocial: 'Nueva SpA',
        rut: '76.999.888-1',
        representanteLegalNombre: ' Ana Torres ',
        representanteLegalRut: '12.345.678-5',
        representanteLegalEmail: 'Ana@Empresa.CL',
        representanteLegalTelefono: ' +56 9 1111 2222 ',
        direccion: '  Camino 1  ',
      });

      expect(prisma.empresa.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            representanteLegalNombre: 'Ana Torres',
            representanteLegalRut: '12.345.678-5',
            representanteLegalEmail: 'ana@empresa.cl',
            representanteLegalTelefono: '+56 9 1111 2222',
            direccion: 'Camino 1',
          }),
        }),
      );
      const data = prisma.empresa.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(data).not.toHaveProperty('emailContacto');
    });

    it('rechaza RUT de representante inválido', async () => {
      prisma.empresa.count.mockResolvedValue(2);
      await expect(
        service.createEmpresa(superAdminUser(), {
          razonSocial: 'Nueva SpA',
          rut: '76.999.888-1',
          representanteLegalRut: '12.345.678-9',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.empresa.create).not.toHaveBeenCalled();
    });

    it('rechaza creación si no es Super Admin', async () => {
      await expect(
        service.createEmpresa(tenantUser(), {
          razonSocial: 'Hack SpA',
          rut: '1-9',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.empresa.create).not.toHaveBeenCalled();
    });

    it('lanza ConflictException ante RUT duplicado', async () => {
      prisma.empresa.count.mockResolvedValue(1);
      const err = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.empresa.create.mockRejectedValue(err);

      await expect(
        service.createEmpresa(superAdminUser(), {
          razonSocial: 'Dup',
          rut: '76.123.456-7',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updateEmpresa', () => {
    it('persiste Billing ID GoSocket cuando el admin lo envía', async () => {
      prisma.empresa.update.mockResolvedValue({
        id: 'EMP-1',
        gosocketBillerId: 'd23bdecb-0776-433b-aaf2-ab4e11e76501',
      });

      await service.updateEmpresa(superAdminUser(), 'EMP-1', {
        razonSocial: 'ALM SERVICES SPA',
        rut: '77.032.639-7',
        gosocketBillerId: 'd23bdecb-0776-433b-aaf2-ab4e11e76501',
      });

      expect(prisma.empresa.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gosocketBillerId: 'd23bdecb-0776-433b-aaf2-ab4e11e76501',
          }),
        }),
      );
    });

    it('no borra el Billing ID si el PUT no trae el campo (plantilla/otras pantallas)', async () => {
      prisma.empresa.update.mockResolvedValue({ id: 'EMP-1' });

      await service.updateEmpresa(superAdminUser(), 'EMP-1', {
        razonSocial: 'ALM SERVICES SPA',
        rut: '77.032.639-7',
      });

      const data = prisma.empresa.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data).not.toHaveProperty('gosocketBillerId');
      expect(data).not.toHaveProperty('gosocketNroResolucion');
      expect(data).not.toHaveProperty('gosocketFechaResolucion');
      expect(data).not.toHaveProperty('gosocketActeco');
      expect(data).not.toHaveProperty('gosocketApiUser');
      expect(data).not.toHaveProperty('gosocketApiPassword');
    });

    it('no borra el representante si el PUT no trae el campo', async () => {
      prisma.empresa.update.mockResolvedValue({ id: 'EMP-1' });

      await service.updateEmpresa(superAdminUser(), 'EMP-1', {
        razonSocial: 'ALM SERVICES SPA',
        rut: '77.032.639-7',
      });

      const data = prisma.empresa.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data).not.toHaveProperty('representanteLegalNombre');
      expect(data).not.toHaveProperty('representanteLegalRut');
      expect(data).not.toHaveProperty('representanteLegalEmail');
      expect(data).not.toHaveProperty('representanteLegalTelefono');
    });

    it('guarda emailContacto en minúsculas', async () => {
      prisma.empresa.update.mockResolvedValue({ id: 'EMP-1' });

      await service.updateEmpresa(superAdminUser(), 'EMP-1', {
        razonSocial: 'ALM SERVICES SPA',
        rut: '77.032.639-7',
        emailContacto: 'Contacto@ALM.CL',
      });

      const data = prisma.empresa.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.emailContacto).toBe('contacto@alm.cl');
      expect(data).not.toHaveProperty('representanteLegalNombre');
    });

    it('limpia representante, mail y dirección cuando vienen vacíos', async () => {
      prisma.empresa.update.mockResolvedValue({ id: 'EMP-1' });

      await service.updateEmpresa(superAdminUser(), 'EMP-1', {
        razonSocial: 'ALM SERVICES SPA',
        rut: '77.032.639-7',
        representanteLegalNombre: '   ',
        representanteLegalRut: '  ',
        representanteLegalEmail: '  ',
        representanteLegalTelefono: '  ',
        direccion: '   ',
      });

      const data = prisma.empresa.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.representanteLegalNombre).toBeNull();
      expect(data.representanteLegalRut).toBeNull();
      expect(data.representanteLegalEmail).toBeNull();
      expect(data.representanteLegalTelefono).toBeNull();
      expect(data).not.toHaveProperty('emailContacto');
      expect(data.direccion).toBeNull();
    });
  });

  describe('updateRol master', () => {
    it('rechaza cualquier edición del rol Administrador', async () => {
      await expect(
        service.updateRol(superAdminUser(), 'ROL-1', {
          nombre: 'Administrador',
          permisos: ['*'],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.rol.update).not.toHaveBeenCalled();
    });
  });

  describe('createUsuario', () => {
    it('crea usuario en tenant propio', async () => {
      prisma.usuario.count.mockResolvedValue(5);
      prisma.usuario.create.mockResolvedValue({
        id: 'U-6',
        nombre: 'Nuevo',
        email: 'nuevo@almahue.cl',
        rolId: 'ROL-2',
        empresaId: 'EMP-1',
        activo: true,
        rol: { nombre: 'Analista' },
        empresasAcceso: [{ empresaId: 'EMP-1' }],
      });

      const result = await service.createUsuario(superAdminUser(), {
        nombre: 'Nuevo',
        email: 'nuevo@almahue.cl',
        rolId: 'ROL-2',
        empresaId: 'EMP-1',
        password: 'demo123',
      });

      expect(result.email).toBe('nuevo@almahue.cl');
      expect(prisma.usuario.create).toHaveBeenCalled();
    });

    it('exige contraseña al crear', async () => {
      await expect(
        service.createUsuario(superAdminUser(), {
          nombre: 'Nuevo',
          email: 'nuevo@almahue.cl',
          rolId: 'ROL-2',
          empresaId: 'EMP-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.usuario.create).not.toHaveBeenCalled();
    });

    it('rechaza creación si no es administrador, aunque traiga contraseña', async () => {
      await expect(
        service.createUsuario(
          tenantUser({ permisos: ['admin:read', 'admin:write'] }),
          {
            nombre: 'Nuevo',
            email: 'nuevo@almahue.cl',
            rolId: 'ROL-2',
            empresaId: 'EMP-1',
            password: 'demo123',
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.usuario.create).not.toHaveBeenCalled();
    });

    it('normaliza nombre y email al crear', async () => {
      prisma.usuario.count.mockResolvedValue(5);
      prisma.usuario.create.mockResolvedValue({
        id: 'U-6',
        nombre: 'Juan Pérez',
        email: 'juan@almahue.cl',
        username: 'JPEREZ',
        rolId: 'ROL-2',
        empresaId: 'EMP-1',
        activo: true,
        rol: { nombre: 'Analista' },
        empresasAcceso: [{ empresaId: 'EMP-1' }],
      });

      await service.createUsuario(superAdminUser(), {
        nombre: 'juan pérez',
        email: 'Juan@Almahue.CL',
        rolId: 'ROL-2',
        empresaId: 'EMP-1',
        password: 'demo123',
      });

      expect(prisma.usuario.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nombre: 'Juan Pérez',
            email: 'juan@almahue.cl',
          }),
        }),
      );
    });

    it('rechaza edición si no es administrador, aunque traiga contraseña', async () => {
      await expect(
        service.updateUsuario(
          tenantUser({ permisos: ['admin:read', 'admin:write'] }),
          'U-6',
          {
            nombre: 'Nuevo',
            email: 'nuevo@almahue.cl',
            rolId: 'ROL-2',
            empresaId: 'EMP-1',
            password: 'demo123',
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.usuario.update).not.toHaveBeenCalled();
      expect(prisma.usuario.create).not.toHaveBeenCalled();
    });

    it('normaliza nombre y email al editar y conserva el username', async () => {
      prisma.usuario.findUnique.mockResolvedValue({
        id: 'U-6',
        nombre: 'Viejo',
        email: 'viejo@almahue.cl',
        username: 'VVIEJO',
        rolId: 'ROL-2',
        empresaId: 'EMP-1',
        activo: true,
        empresasAcceso: [{ empresaId: 'EMP-1' }],
      });
      prisma.usuario.update.mockResolvedValue({
        id: 'U-6',
        nombre: 'Juan Pérez',
        email: 'juan@almahue.cl',
        username: 'VVIEJO',
        rolId: 'ROL-2',
        empresaId: 'EMP-1',
        activo: true,
        rol: { nombre: 'Analista' },
        empresasAcceso: [{ empresaId: 'EMP-1' }],
      });

      await service.updateUsuario(superAdminUser(), 'U-6', {
        nombre: 'juan pérez',
        email: 'Juan@Almahue.CL',
        rolId: 'ROL-2',
        empresaId: 'EMP-1',
      });

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nombre: 'Juan Pérez',
            email: 'juan@almahue.cl',
            username: 'VVIEJO',
          }),
        }),
      );
      expect(prisma.usuario.findFirst).not.toHaveBeenCalled();
    });

    it('normaliza el nombre también después de un guión', async () => {
      prisma.usuario.count.mockResolvedValue(5);
      prisma.usuario.create.mockResolvedValue({
        id: 'U-6',
        nombre: 'Ana-María López',
        email: 'ana@almahue.cl',
        username: 'ALOPEZ',
        rolId: 'ROL-2',
        empresaId: 'EMP-1',
        activo: true,
        rol: { nombre: 'Analista' },
        empresasAcceso: [{ empresaId: 'EMP-1' }],
      });

      await service.createUsuario(superAdminUser(), {
        nombre: 'ana-maría lópez',
        email: ' Ana@Almahue.CL ',
        rolId: 'ROL-2',
        empresaId: 'EMP-1',
        password: 'demo123',
      });

      expect(prisma.usuario.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nombre: 'Ana-María López',
            email: 'ana@almahue.cl',
          }),
        }),
      );
    });

    it('pasa el resto de cada palabra a minúscula', async () => {
      prisma.usuario.count.mockResolvedValue(5);
      prisma.usuario.create.mockResolvedValue({
        id: 'U-6',
        nombre: 'María José',
        email: 'maria@almahue.cl',
        username: 'MJOSE',
        rolId: 'ROL-2',
        empresaId: 'EMP-1',
        activo: true,
        rol: { nombre: 'Analista' },
        empresasAcceso: [{ empresaId: 'EMP-1' }],
      });

      await service.createUsuario(superAdminUser(), {
        nombre: 'MARÍA JOSÉ',
        email: 'maria@almahue.cl',
        rolId: 'ROL-2',
        empresaId: 'EMP-1',
        password: 'demo123',
      });

      expect(prisma.usuario.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nombre: 'María José',
          }),
        }),
      );
    });

    it('bloquea update de usuario de otra empresa (tenant)', async () => {
      prisma.usuario.findUnique.mockResolvedValue({
        id: 'U-9',
        empresaId: 'EMP-2',
      });

      await expect(
        service.updateUsuario(tenantUser({ empresaId: 'EMP-1' }), 'U-9', {
          nombre: 'X',
          email: 'x@x.cl',
          rolId: 'ROL-2',
          empresaId: 'EMP-2',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.usuario.update).not.toHaveBeenCalled();
    });
  });

  describe('updateGrupoAprobacion', () => {
    it('permite agregar un miembro sin revalidar el inicial ya designado', async () => {
      prisma.grupoAprobacion.findUnique.mockResolvedValue({
        id: 'G-5',
        empresaId: 'EMP-1',
        modulo: 'Compras',
        aprobadorInicialId: 'U-ANA',
        activo: true,
      });
      prisma.usuario.count.mockResolvedValue(2);
      prisma.usuario.findMany.mockImplementation(() => {
        throw new Error('no debe validar bandeja del inicial al solo agregar miembros');
      });
      prisma.grupoAprobacion.findMany.mockResolvedValue([]);
      prisma.usuarioGrupoAprobacion.deleteMany.mockResolvedValue({ count: 0 });
      prisma.usuarioGrupoAprobacion.createMany.mockResolvedValue({ count: 2 });
      prisma.grupoAprobacion.update.mockResolvedValue({});
      prisma.grupoAprobacion.findUniqueOrThrow.mockResolvedValue({
        id: 'G-5',
        nombre: 'Grupo 5',
        modulo: 'Compras',
        aprobadorInicialId: 'U-ANA',
        activo: true,
        empresaId: 'EMP-1',
        aprobadorInicial: { nombre: 'Ana Torres' },
        miembros: [
          { usuarioId: 'U-ANA', usuario: { id: 'U-ANA', nombre: 'Ana Torres' } },
          { usuarioId: 'U-PIA', usuario: { id: 'U-PIA', nombre: 'Pia Maulen' } },
        ],
      });

      const result = await service.updateGrupoAprobacion(superAdminUser(), 'G-5', {
        nombre: 'Grupo 5',
        modulo: 'Compras',
        aprobadorInicialId: 'U-ANA',
        miembroIds: ['U-ANA', 'U-PIA'],
        activo: true,
      });

      expect(result.miembroIds).toEqual(['U-ANA', 'U-PIA']);
      expect(prisma.usuario.findMany).not.toHaveBeenCalled();
    });
  });
});
