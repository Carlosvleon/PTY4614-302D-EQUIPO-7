import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { isEmail } from 'class-validator';
import { isValidRutChileno } from './rut-chileno.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UpsertEmpresaDto,
  UpsertUsuarioDto,
  UpsertRolDto,
  DeleteRolDto,
  UpsertWorkflowDto,
  UpsertDelegacionAprobacionDto,
  UpsertGrupoAprobacionDto,
  UpsertNodoEscalaAprobacionDto,
  UpsertAdminConceptoDto,
  SimularAprobacionDto,
} from './dto/admin.dto';
import {
  applyBackupResolutions,
  buildUserMap,
  catalogUsuario,
  collectUsos,
  modulosEnBackup,
  parseAprobacionesBackup,
  type ResolucionUsuario,
} from './aprobaciones-config-io';
import type { JwtPayload } from '../../auth/jwt.strategy';
import {
  assertModuloAprobacionesAccess,
  assertModuloAprobacionesWriteLive,
  canReadAprobacionesConfig,
  prismaDelegacionModuloFilterForUser,
  prismaModuloFilterForUser,
} from '../../auth/aprobaciones-access.util';
import {
  findUsuariosSinBandeja,
  loadUsuarioIdsDesignadosBandeja,
  loadUsuariosParaBandeja,
  throwAprobadorSinBandeja,
} from '../../auth/bandeja-aprobacion.util';
import {
  assertTenantAccess,
  empresaWhere,
  isAdminRolId,
  isSuperAdmin,
  resolveOperationalEmpresa,
  resolveTenant,
  tenantEmpresaId,
  usuarioWhere,
} from '../../auth/tenant.util';
import {
  buildCadenaDesdeGrupo,
  findGrupoForUsuario,
  loadDelegacionesAprobacion,
  loadGruposAprobacion,
  loadNodosEscala,
  loadUsuariosOrganigrama,
  poolFromNodosEscalas,
  resolveCadenaCompleta,
  resolveGrupoSolicitante,
} from '../aprobaciones/approval-engine';

/** Nombre de usuario: cada palabra (y cada tramo tras un guión) en título es-CL. */
function normalizarNombreUsuario(nombre: string): string {
  return nombre
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((palabra) =>
      palabra
        .split('-')
        .map((parte) => {
          if (!parte) return parte;
          const lower = parte.toLocaleLowerCase('es-CL');
          return lower.charAt(0).toLocaleUpperCase('es-CL') + lower.slice(1);
        })
        .join('-'),
    )
    .join(' ');
}

function normalizarEmailUsuario(email: string): string {
  return email.trim().toLowerCase();
}

function deriveUsername(nombre: string): string {
  const clean = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!clean.length) return 'USUARIO';
  const [first, ...rest] = clean;
  const last = rest.length ? rest[rest.length - 1] : '';
  const raw = `${first[0]}${last}`.toUpperCase() || first.toUpperCase();
  return raw.replace(/[^A-Z0-9]/g, '').slice(0, 40) || 'USUARIO';
}

function rolCodigoFromNombre(nombre: string, fallback: string): string {
  const slug = nombre
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return slug || fallback;
}

function optStr(v?: string | null) {
  if (v == null) return undefined;
  const t = v.trim();
  return t.length ? t : null;
}

/** Trim; null o solo espacios se guardan como null (permite limpiar el campo). */
function trimOrNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

function emailContactoOrNull(v: string | null | undefined, message = 'Mail contacto inválido'): string | null {
  const t = trimOrNull(v)?.toLowerCase() ?? null;
  if (t == null) return null;
  if (!isEmail(t)) throw new BadRequestException(message);
  return t;
}

function rutRepresentanteOrNull(v: string | null | undefined): string | null {
  const t = trimOrNull(v);
  if (t == null) return null;
  if (!isValidRutChileno(t)) throw new BadRequestException('RUT inválido');
  return t;
}

function empresaPlantillaData(dto: UpsertEmpresaDto) {
  const data: Record<string, unknown> = {};
  if (dto.direccion !== undefined) data.direccion = trimOrNull(dto.direccion);
  if (dto.comuna !== undefined) data.comuna = optStr(dto.comuna);
  if (dto.ciudad !== undefined) data.ciudad = optStr(dto.ciudad);
  if (dto.telefono !== undefined) data.telefono = optStr(dto.telefono);
  if (dto.emailContacto !== undefined) data.emailContacto = emailContactoOrNull(dto.emailContacto);
  if (dto.logoUrl !== undefined) data.logoUrl = optStr(dto.logoUrl);
  if (dto.selloUrl !== undefined) data.selloUrl = optStr(dto.selloUrl);
  if (dto.plantillaDoc !== undefined) {
    data.plantillaDoc = dto.plantillaDoc as Prisma.InputJsonValue;
  }
  return data;
}

/** Solo si el DTO trae la clave, igual que gosocket y empresaPlantillaData. */
function representanteLegalData(dto: UpsertEmpresaDto) {
  const data: {
    representanteLegalNombre?: string | null;
    representanteLegalRut?: string | null;
    representanteLegalEmail?: string | null;
    representanteLegalTelefono?: string | null;
  } = {};
  if (dto.representanteLegalNombre !== undefined) {
    data.representanteLegalNombre = trimOrNull(dto.representanteLegalNombre);
  }
  if (dto.representanteLegalRut !== undefined) {
    data.representanteLegalRut = rutRepresentanteOrNull(dto.representanteLegalRut);
  }
  if (dto.representanteLegalEmail !== undefined) {
    data.representanteLegalEmail = emailContactoOrNull(
      dto.representanteLegalEmail,
      'Mail del representante legal inválido',
    );
  }
  if (dto.representanteLegalTelefono !== undefined) {
    data.representanteLegalTelefono = trimOrNull(dto.representanteLegalTelefono);
  }
  return data;
}

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  /** Username interno único (no se muestra en UI). Base + 2, 3… si hay colisión. */
  private async allocateUniqueUsername(base: string, excludeId?: string): Promise<string> {
    const root = deriveUsername(base);
    for (let n = 0; n < 500; n++) {
      const candidate = n === 0 ? root : `${root}${n}`;
      const found = await this.prisma.usuario.findFirst({
        where: {
          username: candidate,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: { id: true },
      });
      if (!found) return candidate;
    }
    return `${root}${Date.now().toString().slice(-5)}`;
  }

  getEmpresas(user: JwtPayload) {
    const scope = resolveTenant(user);
    return this.prisma.empresa.findMany({
      where: empresaWhere(scope),
      orderBy: { razonSocial: 'asc' },
    });
  }

  async createEmpresa(user: JwtPayload, dto: UpsertEmpresaDto) {
    if (!isSuperAdmin(user)) {
      throw new ForbiddenException('Solo Administrador puede crear empresas');
    }
    const count = await this.prisma.empresa.count();
    try {
      return await this.prisma.empresa.create({
        data: {
          id: `EMP-${count + 1}`,
          razonSocial: dto.razonSocial.trim(),
          rut: dto.rut.trim(),
          giro: dto.giro?.trim() ?? null,
          activa: dto.activa ?? true,
          aceptacionCompraPlazoDias: dto.aceptacionCompraPlazoDias ?? 8,
          ...(dto.gosocketBillerId !== undefined
            ? { gosocketBillerId: dto.gosocketBillerId }
            : {}),
          ...(dto.gosocketNroResolucion !== undefined
            ? { gosocketNroResolucion: dto.gosocketNroResolucion }
            : {}),
          ...(dto.gosocketFechaResolucion !== undefined
            ? { gosocketFechaResolucion: dto.gosocketFechaResolucion }
            : {}),
          ...(dto.gosocketActeco !== undefined
            ? { gosocketActeco: dto.gosocketActeco }
            : {}),
          ...empresaPlantillaData(dto),
          ...representanteLegalData(dto),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una empresa con ese RUT');
      }
      throw e;
    }
  }

  async updateEmpresa(user: JwtPayload, id: string, dto: UpsertEmpresaDto) {
    const scope = resolveTenant(user);
    assertTenantAccess(scope, id);
    if (!isSuperAdmin(user)) {
      throw new ForbiddenException('Solo Super Admin puede editar empresas');
    }
    try {
      return await this.prisma.empresa.update({
        where: { id },
        data: {
          razonSocial: dto.razonSocial.trim(),
          rut: dto.rut.trim(),
          giro: dto.giro?.trim() ?? null,
          activa: dto.activa ?? true,
          aceptacionCompraPlazoDias: dto.aceptacionCompraPlazoDias ?? 8,
          ...(dto.gosocketBillerId !== undefined
            ? { gosocketBillerId: dto.gosocketBillerId }
            : {}),
          ...(dto.gosocketNroResolucion !== undefined
            ? { gosocketNroResolucion: dto.gosocketNroResolucion }
            : {}),
          ...(dto.gosocketFechaResolucion !== undefined
            ? { gosocketFechaResolucion: dto.gosocketFechaResolucion }
            : {}),
          ...(dto.gosocketActeco !== undefined
            ? { gosocketActeco: dto.gosocketActeco }
            : {}),
          ...empresaPlantillaData(dto),
          ...representanteLegalData(dto),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una empresa con ese RUT');
      }
      throw e;
    }
  }

  async deleteEmpresa(user: JwtPayload, id: string) {
    if (!isSuperAdmin(user)) {
      throw new ForbiddenException('Solo Super Admin puede eliminar empresas');
    }
    const usuarios = await this.prisma.usuario.count({ where: { empresaId: id } });
    if (usuarios > 0) {
      throw new BadRequestException('No se puede eliminar: tiene usuarios asociados');
    }
    return this.prisma.empresa.delete({ where: { id } });
  }

  private resolveEmpresaIds(dto: UpsertUsuarioDto, primary: string): string[] {
    const raw = dto.empresaIds?.length ? dto.empresaIds : [primary];
    const ids = [...new Set([primary, ...raw].map((x) => x.trim()).filter(Boolean))];
    if (!ids.length) {
      throw new BadRequestException('Debes asignar al menos una empresa');
    }
    return ids;
  }

  private parseVigenciaDate(raw?: string): Date | null {
    if (!raw?.trim()) return null;
    const d = new Date(raw.trim());
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Fecha de vigencia de rol inválida');
    }
    return d;
  }

  private mapUsuario(row: {
    id: string;
    nombre: string;
    email: string;
    rolId: string;
    empresaId: string;
    activo: boolean;
    rolVigenciaDesde?: Date | null;
    rolVigenciaHasta?: Date | null;
    jefeId?: string | null;
    jefe?: { nombre: string } | null;
    montoMaxAprobacion?: Prisma.Decimal | null;
    rol?: { nombre: string };
    empresasAcceso?: { empresaId: string }[];
  }) {
    const empresaIds = [
      ...new Set([
        row.empresaId,
        ...(row.empresasAcceso ?? []).map((e) => e.empresaId),
      ]),
    ];
    return {
      id: row.id,
      nombre: row.nombre,
      email: row.email,
      rolId: row.rolId,
      rolNombre: row.rol?.nombre ?? '',
      empresaId: row.empresaId,
      empresaIds,
      activo: row.activo,
      rolVigenciaDesde: row.rolVigenciaDesde
        ? row.rolVigenciaDesde.toISOString().slice(0, 10)
        : undefined,
      rolVigenciaHasta: row.rolVigenciaHasta
        ? row.rolVigenciaHasta.toISOString().slice(0, 10)
        : undefined,
      jefeId: row.jefeId ?? undefined,
      jefeNombre: row.jefe?.nombre ?? undefined,
      montoMaxAprobacion:
        row.montoMaxAprobacion != null ? Number(row.montoMaxAprobacion) : undefined,
    };
  }

  async getUsuarios(user: JwtPayload) {
    const scope = resolveTenant(user);
    const rows = await this.prisma.usuario.findMany({
      where: usuarioWhere(scope),
      select: {
        id: true,
        nombre: true,
        email: true,
        rolId: true,
        rol: { select: { nombre: true } },
        empresaId: true,
        activo: true,
        rolVigenciaDesde: true,
        rolVigenciaHasta: true,
        jefeId: true,
        jefe: { select: { nombre: true } },
        montoMaxAprobacion: true,
        empresasAcceso: { select: { empresaId: true } },
      },
      orderBy: { nombre: 'asc' },
    });
    return rows.map((row) => this.mapUsuario(row));
  }

  async createUsuario(user: JwtPayload, dto: UpsertUsuarioDto) {
    if (!isSuperAdmin(user)) {
      throw new ForbiddenException('Solo el administrador puede crear y editar usuarios');
    }
    const nombre = normalizarNombreUsuario(dto.nombre);
    const email = normalizarEmailUsuario(dto.email);
    const scope = resolveTenant(user);
    const empresaId = tenantEmpresaId(scope, dto.empresaId);
    assertTenantAccess(scope, empresaId);
    const empresaIds = this.resolveEmpresaIds(dto, empresaId);
    for (const eid of empresaIds) assertTenantAccess(scope, eid);

    if (!isSuperAdmin(user) && isAdminRolId(dto.rolId)) {
      throw new ForbiddenException('No puedes asignar el rol Administrador');
    }

    const plainPassword = dto.password?.trim();
    if (!plainPassword || plainPassword.length < 6) {
      throw new BadRequestException(
        'La contraseña es obligatoria al crear (mínimo 6 caracteres)',
      );
    }

    const count = await this.prisma.usuario.count();
    const passwordHash = await bcrypt.hash(plainPassword, 10);
    const id = `U-${count + 1}`;
    const username = await this.allocateUniqueUsername(nombre);
    const rolVigenciaDesde = this.parseVigenciaDate(dto.rolVigenciaDesde);
    const rolVigenciaHasta = this.parseVigenciaDate(dto.rolVigenciaHasta);
    const jefeId = dto.jefeId?.trim() || null;
    if (jefeId === id) {
      throw new BadRequestException('Un usuario no puede ser su propio jefe');
    }
    try {
      const row = await this.prisma.usuario.create({
        data: {
          id,
          nombre,
          email,
          username,
          passwordHash,
          rolId: dto.rolId,
          empresaId,
          activo: dto.activo ?? true,
          rolVigenciaDesde,
          rolVigenciaHasta,
          jefeId,
          montoMaxAprobacion:
            dto.montoMaxAprobacion != null ? dto.montoMaxAprobacion : null,
          empresasAcceso: {
            create: empresaIds.map((eid) => ({ empresaId: eid })),
          },
        },
        select: {
          id: true,
          nombre: true,
          email: true,
          rolId: true,
          empresaId: true,
          activo: true,
          rolVigenciaDesde: true,
          rolVigenciaHasta: true,
          jefeId: true,
          jefe: { select: { nombre: true } },
          montoMaxAprobacion: true,
          rol: { select: { nombre: true } },
          empresasAcceso: { select: { empresaId: true } },
        },
      });
      return this.mapUsuario(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese email');
      }
      throw e;
    }
  }

  async updateUsuario(user: JwtPayload, id: string, dto: UpsertUsuarioDto) {
    if (!isSuperAdmin(user)) {
      throw new ForbiddenException('Solo el administrador puede crear y editar usuarios');
    }
    const nombre = normalizarNombreUsuario(dto.nombre);
    const email = normalizarEmailUsuario(dto.email);
    const scope = resolveTenant(user);
    const existing = await this.prisma.usuario.findUnique({
      where: { id },
      include: { empresasAcceso: { select: { empresaId: true } } },
    });
    if (!existing) throw new NotFoundException('Usuario no encontrado');
    assertTenantAccess(scope, existing.empresaId);

    const empresaId = tenantEmpresaId(scope, dto.empresaId);
    assertTenantAccess(scope, empresaId);
    const empresaIds = this.resolveEmpresaIds(dto, empresaId);
    for (const eid of empresaIds) assertTenantAccess(scope, eid);

    if (!isSuperAdmin(user) && isAdminRolId(dto.rolId)) {
      throw new ForbiddenException('No puedes asignar el rol Administrador');
    }
    // Usuario master: no degradar rol ni desactivar (sigue con acceso total).
    if (isAdminRolId(existing.rolId)) {
      if (!isAdminRolId(dto.rolId)) {
        throw new ForbiddenException(
          'No se puede quitar el rol Administrador a un usuario master',
        );
      }
      if (dto.activo === false) {
        throw new ForbiddenException(
          'No se puede desactivar un usuario con rol Administrador',
        );
      }
    }

    const plainPassword = dto.password?.trim();
    const rolVigenciaDesde = this.parseVigenciaDate(dto.rolVigenciaDesde);
    const rolVigenciaHasta = this.parseVigenciaDate(dto.rolVigenciaHasta);
    const jefeId = dto.jefeId?.trim() || null;
    if (jefeId === id) {
      throw new BadRequestException('Un usuario no puede ser su propio jefe');
    }
    // Username interno: se conserva; solo se asigna si faltaba (colisión → sufijo numérico).
    const username =
      existing.username?.trim()
      || (await this.allocateUniqueUsername(nombre, id));
    const data: Prisma.UsuarioUpdateInput = {
      nombre,
      email,
      username,
      rol: { connect: { id: dto.rolId } },
      empresa: { connect: { id: empresaId } },
      activo: dto.activo,
      rolVigenciaDesde,
      rolVigenciaHasta,
      jefe: jefeId ? { connect: { id: jefeId } } : { disconnect: true },
      montoMaxAprobacion:
        dto.montoMaxAprobacion != null ? dto.montoMaxAprobacion : null,
      empresasAcceso: {
        deleteMany: {},
        create: empresaIds.map((eid) => ({ empresaId: eid })),
      },
    };
    if (plainPassword) {
      if (plainPassword.length < 6) {
        throw new BadRequestException('La contraseña debe tener mínimo 6 caracteres');
      }
      data.passwordHash = await bcrypt.hash(plainPassword, 10);
    }

    let updated;
    try {
      updated = await this.prisma.usuario.update({
        where: { id },
        data,
        select: {
          id: true,
          nombre: true,
          email: true,
          rolId: true,
          empresaId: true,
          activo: true,
          rolVigenciaDesde: true,
          rolVigenciaHasta: true,
          jefeId: true,
          jefe: { select: { nombre: true } },
          montoMaxAprobacion: true,
          rol: { select: { nombre: true } },
          empresasAcceso: { select: { empresaId: true } },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese email');
      }
      throw e;
    }

    if (plainPassword) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return this.mapUsuario(updated);
  }

  async getRoles() {
    const rows = await this.prisma.rol.findMany({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { usuarios: true } } },
    });
    return rows.map(({ _count, ...rol }) => ({
      ...rol,
      usuarios: _count.usuarios,
      /** Rol master: visible en UI, permisología no editable. */
      esMaster: isAdminRolId(rol.id),
    }));
  }

  async createRol(user: JwtPayload, dto: UpsertRolDto) {
    if (!isSuperAdmin(user)) {
      throw new ForbiddenException('Solo Administrador puede crear roles');
    }
    const count = await this.prisma.rol.count();
    const id = `ROL-${count + 1}`;
    const codigo = rolCodigoFromNombre(dto.nombre, id);
    try {
      return await this.prisma.rol.create({
        data: {
          id,
          codigo,
          nombre: dto.nombre.trim(),
          permisos: dto.permisos,
          aprobarConPin: dto.aprobarConPin ?? false,
          ...(dto.permisosPantalla !== undefined
            ? { permisosPantalla: dto.permisosPantalla as object }
            : {}),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un rol con ese código');
      }
      throw e;
    }
  }

  async updateRol(user: JwtPayload, id: string, dto: UpsertRolDto) {
    if (!isSuperAdmin(user)) {
      throw new ForbiddenException('Solo Administrador puede editar roles');
    }
    if (isAdminRolId(id)) {
      throw new ForbiddenException(
        'El rol Administrador es master: se puede ver pero no editar permisos ni nombre',
      );
    }
    return this.prisma.rol.update({
      where: { id },
      data: {
        nombre: dto.nombre.trim(),
        permisos: dto.permisos,
        ...(dto.aprobarConPin !== undefined ? { aprobarConPin: dto.aprobarConPin } : {}),
        ...(dto.permisosPantalla !== undefined
          ? { permisosPantalla: dto.permisosPantalla as object }
          : {}),
      },
    });
  }

  async deleteRol(user: JwtPayload, id: string, dto: DeleteRolDto) {
    if (!isSuperAdmin(user)) {
      throw new ForbiddenException('Solo Administrador puede eliminar roles');
    }
    if (isAdminRolId(id)) {
      throw new ForbiddenException('No se puede eliminar el rol Administrador');
    }

    const rol = await this.prisma.rol.findUnique({ where: { id } });
    if (!rol) throw new NotFoundException('Rol no encontrado');

    const usuariosDelRol = await this.prisma.usuario.findMany({
      where: { rolId: id },
      select: { id: true },
    });
    const idsAsignados = new Set(usuariosDelRol.map((u) => u.id));
    const reasignaciones = dto.reasignaciones ?? [];

    if (usuariosDelRol.length > 0) {
      if (reasignaciones.length !== usuariosDelRol.length) {
        throw new BadRequestException(
          'Debes indicar un rol de destino para cada usuario que tiene este rol',
        );
      }
      const vistos = new Set<string>();
      for (const r of reasignaciones) {
        if (!idsAsignados.has(r.usuarioId)) {
          throw new BadRequestException(`Usuario ${r.usuarioId} no pertenece a este rol`);
        }
        if (vistos.has(r.usuarioId)) {
          throw new BadRequestException(`Usuario ${r.usuarioId} duplicado en reasignaciones`);
        }
        vistos.add(r.usuarioId);
        if (!r.nuevoRolId || r.nuevoRolId === id) {
          throw new BadRequestException('El rol de destino debe ser distinto al que se elimina');
        }
        const destino = await this.prisma.rol.findUnique({ where: { id: r.nuevoRolId } });
        if (!destino) {
          throw new NotFoundException(`Rol de destino no encontrado: ${r.nuevoRolId}`);
        }
      }
      if (vistos.size !== idsAsignados.size) {
        throw new BadRequestException('Faltan usuarios por reasignar');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const r of reasignaciones) {
        await tx.usuario.update({
          where: { id: r.usuarioId },
          data: { rolId: r.nuevoRolId },
        });
      }
      await tx.rol.delete({ where: { id } });
    });

    return { ok: true, id, reasignados: reasignaciones.length };
  }

  // -------- WORKFLOW / APROBADORES (solo Admin) --------
  private mapWorkflow(row: {
    id: string;
    nombre: string;
    modulo: string;
    montoMin: Prisma.Decimal;
    montoMax: Prisma.Decimal;
    aprobadores: number;
    aprobadorIds: string[];
    activo: boolean;
    empresaId: string;
  }) {
    return {
      id: row.id,
      nombre: row.nombre,
      modulo: row.modulo,
      montoMin: Number(row.montoMin),
      montoMax: Number(row.montoMax),
      aprobadores: row.aprobadores,
      aprobadorIds: row.aprobadorIds ?? [],
      activo: row.activo,
      empresaId: row.empresaId,
    };
  }

  async getWorkflows(user: JwtPayload, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const rows = await this.prisma.workflowConfig.findMany({
      where: { empresaId },
      orderBy: [{ modulo: 'asc' }, { montoMin: 'asc' }],
    });
    return rows.map((r) => this.mapWorkflow(r));
  }

  async createWorkflow(user: JwtPayload, dto: UpsertWorkflowDto, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    assertModuloAprobacionesAccess(user, dto.modulo, 'write');
    if (dto.montoMax < dto.montoMin) {
      throw new BadRequestException('montoMax debe ser ≥ montoMin');
    }
    const ids = [...new Set((dto.aprobadorIds ?? []).filter(Boolean))];
    if (ids.length) {
      const count = await this.prisma.usuario.count({
        where: { id: { in: ids }, ...usuarioWhere(resolveTenant(user)) },
      });
      if (count !== ids.length) {
        throw new BadRequestException('Uno o más aprobadores no existen o no son accesibles');
      }
    }
    if (!ids.length) {
      throw new BadRequestException('Debe indicar al menos un jefe elegible (aprobadorIds)');
    }
    const row = await this.prisma.workflowConfig.create({
      data: {
        nombre: dto.nombre.trim(),
        modulo: dto.modulo.trim(),
        montoMin: dto.montoMin,
        montoMax: dto.montoMax,
        /** Legado Reu4; cadena secuencial Reu6 no usa este contador. */
        aprobadores: 1,
        aprobadorIds: ids,
        activo: dto.activo ?? true,
        empresaId,
      },
    });
    return this.mapWorkflow(row);
  }

  async updateWorkflow(user: JwtPayload, id: string, dto: UpsertWorkflowDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.workflowConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Regla de aprobación no encontrada');
    assertTenantAccess(scope, existing.empresaId);
    assertModuloAprobacionesAccess(user, existing.modulo, 'write');
    assertModuloAprobacionesAccess(user, dto.modulo, 'write');
    if (dto.montoMax < dto.montoMin) {
      throw new BadRequestException('montoMax debe ser ≥ montoMin');
    }
    const ids = [...new Set((dto.aprobadorIds ?? []).filter(Boolean))];
    if (!ids.length) {
      throw new BadRequestException('Debe indicar al menos un jefe elegible (aprobadorIds)');
    }
    const row = await this.prisma.workflowConfig.update({
      where: { id },
      data: {
        nombre: dto.nombre.trim(),
        modulo: dto.modulo.trim(),
        montoMin: dto.montoMin,
        montoMax: dto.montoMax,
        aprobadores: 1,
        aprobadorIds: ids,
        activo: dto.activo ?? existing.activo,
      },
    });
    return this.mapWorkflow(row);
  }

  async deleteWorkflow(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.workflowConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Regla de aprobación no encontrada');
    assertTenantAccess(scope, existing.empresaId);
    await this.prisma.workflowConfig.delete({ where: { id } });
    return { ok: true, id };
  }

  /** Resuelve aprobador sugerido para una OC según reglas activas del módulo Compras. */
  async resolveAprobadorForMonto(
    empresaId: string,
    monto: number,
    modulo = 'Compras',
  ): Promise<{ aprobadorId?: string; aprobadorNombre?: string } | null> {
    const rules = await this.prisma.workflowConfig.findMany({
      where: {
        empresaId,
        modulo: { equals: modulo, mode: 'insensitive' },
        activo: true,
      },
      orderBy: { montoMin: 'asc' },
    });
    const match = rules.find(
      (r) => monto >= Number(r.montoMin) && monto <= Number(r.montoMax),
    );
    const id = match?.aprobadorIds?.[0];
    if (!id) return null;
    const u = await this.prisma.usuario.findUnique({
      where: { id },
      select: { id: true, nombre: true },
    });
    if (!u) return null;
    return { aprobadorId: u.id, aprobadorNombre: u.nombre };
  }

  // -------- DELEGACIONES / SUPLENCIA (solo Admin) --------
  private mapDelegacion(row: {
    id: string;
    titularId: string;
    suplenteId: string;
    modulo: string | null;
    vigenciaDesde: Date;
    vigenciaHasta: Date | null;
    motivo: string | null;
    activo: boolean;
    empresaId: string;
    titular: { nombre: string };
    suplente: { nombre: string };
  }) {
    return {
      id: row.id,
      titularId: row.titularId,
      titularNombre: row.titular.nombre,
      suplenteId: row.suplenteId,
      suplenteNombre: row.suplente.nombre,
      modulo: row.modulo,
      vigenciaDesde: row.vigenciaDesde.toISOString(),
      vigenciaHasta: row.vigenciaHasta?.toISOString() ?? null,
      motivo: row.motivo,
      activo: row.activo,
      empresaId: row.empresaId,
    };
  }

  async getDelegacionesAprobacion(user: JwtPayload, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const rows = await this.prisma.delegacionAprobacion.findMany({
      where: { empresaId, ...prismaDelegacionModuloFilterForUser(user) },
      include: {
        titular: { select: { nombre: true } },
        suplente: { select: { nombre: true } },
      },
      orderBy: [{ vigenciaDesde: 'desc' }, { titular: { nombre: 'asc' } }],
    });
    return rows.map((r) => this.mapDelegacion(r));
  }

  async createDelegacionAprobacion(
    user: JwtPayload,
    dto: UpsertDelegacionAprobacionDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    if (dto.titularId === dto.suplenteId) {
      throw new BadRequestException('El titular y el suplente deben ser distintos');
    }
    const scope = resolveTenant(user);
    const count = await this.prisma.usuario.count({
      where: {
        id: { in: [dto.titularId, dto.suplenteId] },
        ...usuarioWhere(scope),
      },
    });
    if (count !== 2) {
      throw new BadRequestException('Titular o suplente no existen o no son accesibles');
    }
    const desde = new Date(dto.vigenciaDesde);
    const hasta = dto.vigenciaHasta ? new Date(dto.vigenciaHasta) : null;
    if (Number.isNaN(desde.getTime())) {
      throw new BadRequestException('vigenciaDesde inválida');
    }
    if (hasta && Number.isNaN(hasta.getTime())) {
      throw new BadRequestException('vigenciaHasta inválida');
    }
    if (hasta && hasta < desde) {
      throw new BadRequestException('vigenciaHasta debe ser ≥ vigenciaDesde');
    }
    const modulo = optStr(dto.modulo ?? undefined);
    if (!modulo) {
      throw new BadRequestException('Indique el módulo de la suplencia');
    }
    await assertModuloAprobacionesWriteLive(this.prisma, user, modulo, empresaId);
    await this.assertAprobadoresBandeja(modulo, [dto.suplenteId, dto.titularId], 'write', empresaId);
    const row = await this.prisma.delegacionAprobacion.create({
      data: {
        titularId: dto.titularId,
        suplenteId: dto.suplenteId,
        modulo,
        vigenciaDesde: desde,
        vigenciaHasta: hasta,
        motivo: optStr(dto.motivo ?? undefined),
        activo: dto.activo ?? true,
        empresaId,
      },
      include: {
        titular: { select: { nombre: true } },
        suplente: { select: { nombre: true } },
      },
    });
    return this.mapDelegacion(row);
  }

  async updateDelegacionAprobacion(
    user: JwtPayload,
    id: string,
    dto: UpsertDelegacionAprobacionDto,
  ) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.delegacionAprobacion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Delegación no encontrada');
    assertTenantAccess(scope, existing.empresaId);
    if (dto.titularId === dto.suplenteId) {
      throw new BadRequestException('El titular y el suplente deben ser distintos');
    }
    const count = await this.prisma.usuario.count({
      where: {
        id: { in: [dto.titularId, dto.suplenteId] },
        ...usuarioWhere(scope),
      },
    });
    if (count !== 2) {
      throw new BadRequestException('Titular o suplente no existen o no son accesibles');
    }
    const desde = new Date(dto.vigenciaDesde);
    const hasta = dto.vigenciaHasta ? new Date(dto.vigenciaHasta) : null;
    if (hasta && hasta < desde) {
      throw new BadRequestException('vigenciaHasta debe ser ≥ vigenciaDesde');
    }
    const modulo = optStr(dto.modulo ?? undefined);
    if (!modulo) {
      throw new BadRequestException('Indique el módulo de la suplencia');
    }
    if (existing.modulo) {
      await assertModuloAprobacionesWriteLive(this.prisma, user, existing.modulo, existing.empresaId);
    }
    await assertModuloAprobacionesWriteLive(this.prisma, user, modulo, existing.empresaId);
    await this.assertAprobadoresBandeja(modulo, [dto.suplenteId, dto.titularId], 'write', existing.empresaId);
    const row = await this.prisma.delegacionAprobacion.update({
      where: { id },
      data: {
        titularId: dto.titularId,
        suplenteId: dto.suplenteId,
        modulo,
        vigenciaDesde: desde,
        vigenciaHasta: hasta,
        motivo: optStr(dto.motivo ?? undefined),
        activo: dto.activo ?? existing.activo,
      },
      include: {
        titular: { select: { nombre: true } },
        suplente: { select: { nombre: true } },
      },
    });
    return this.mapDelegacion(row);
  }

  async deleteDelegacionAprobacion(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.delegacionAprobacion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Delegación no encontrada');
    assertTenantAccess(scope, existing.empresaId);
    if (existing.modulo) {
      await assertModuloAprobacionesWriteLive(this.prisma, user, existing.modulo, existing.empresaId);
    }
    await this.prisma.delegacionAprobacion.delete({ where: { id } });
    return { ok: true, id };
  }

  // -------- GRUPOS Y ESCALAS APROBACIÓN (fase 2) --------

  private mapGrupo(row: {
    id: string;
    nombre: string;
    modulo: string;
    aprobadorInicialId: string;
    activo: boolean;
    empresaId: string;
    aprobadorInicial: { nombre: string };
    miembros: Array<{ usuarioId: string; usuario: { id: string; nombre: string } }>;
  }) {
    return {
      id: row.id,
      nombre: row.nombre,
      modulo: row.modulo,
      aprobadorInicialId: row.aprobadorInicialId,
      aprobadorInicialNombre: row.aprobadorInicial.nombre,
      miembroIds: row.miembros.map((m) => m.usuarioId),
      miembros: row.miembros.map((m) => ({ id: m.usuario.id, nombre: m.usuario.nombre })),
      activo: row.activo,
      empresaId: row.empresaId,
    };
  }

  private mapNodoEscala(row: {
    id: string;
    modulo: string;
    grupoId: string;
    usuarioId: string;
    logica?: string;
    montoMax: Prisma.Decimal | null;
    escalaAUsuarioId: string | null;
    escalaAId?: string | null;
    activo: boolean;
    empresaId: string;
    usuario: { nombre: string };
    escalaA: { nombre: string } | null;
    grupo?: { nombre: string } | null;
    aprobadores?: Array<{ usuarioId: string; orden: number; usuario: { nombre: string } }>;
  }) {
    return {
      id: row.id,
      modulo: row.modulo,
      grupoId: row.grupoId,
      grupoNombre: row.grupo?.nombre ?? null,
      usuarioId: row.usuarioId,
      usuarioNombre: row.usuario.nombre,
      logica: (row.logica as 'SIMPLE' | 'AND' | 'OR') ?? 'SIMPLE',
      aprobadores: (row.aprobadores ?? []).map((a) => ({
        usuarioId: a.usuarioId,
        usuarioNombre: a.usuario.nombre,
        orden: a.orden,
      })),
      montoMax: row.montoMax != null ? Number(row.montoMax) : null,
      escalaAUsuarioId: row.escalaAUsuarioId,
      escalaAId: row.escalaAId ?? null,
      escalaANombre: row.escalaA?.nombre ?? null,
      activo: row.activo,
      empresaId: row.empresaId,
    };
  }

  private nodoInclude = {
    usuario: { select: { nombre: true } },
    escalaA: { select: { nombre: true } },
    grupo: { select: { nombre: true } },
    aprobadores: {
      orderBy: { orden: 'asc' as const },
      include: { usuario: { select: { nombre: true } } },
    },
  };

  /** Sincroniza NodoAprobador según logica y aprobadoresExtra. */
  private async syncNodoAprobadores(
    tx: Prisma.TransactionClient,
    nodoId: string,
    usuarioId: string,
    logica: string,
    aprobadoresExtra: string[] = [],
  ) {
    await tx.nodoAprobador.deleteMany({ where: { nodoId } });
    const ids = logica === 'SIMPLE'
      ? [usuarioId]
      : [usuarioId, ...aprobadoresExtra.filter((id) => id && id !== usuarioId)];
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i++) {
      await tx.nodoAprobador.create({
        data: { nodoId, usuarioId: unique[i]!, orden: i },
      });
    }
  }

  /**
   * Un usuario no puede firmar en dos niveles del mismo grupo
   * (ni como principal ni como co-aprobador AND/OR).
   */
  private async assertAprobadoresUnicosEnGrupo(params: {
    empresaId: string;
    grupoId: string;
    modulo: string;
    usuarioIds: string[];
    excludeNodoId?: string;
  }) {
    const ids = [...new Set(params.usuarioIds.filter(Boolean))];
    if (!ids.length) return;

    const nodos = await this.prisma.nodoEscalaAprobacion.findMany({
      where: {
        empresaId: params.empresaId,
        grupoId: params.grupoId,
        modulo: { equals: params.modulo, mode: 'insensitive' },
        ...(params.excludeNodoId ? { id: { not: params.excludeNodoId } } : {}),
      },
      select: {
        usuarioId: true,
        usuario: { select: { nombre: true } },
        aprobadores: {
          select: {
            usuarioId: true,
            usuario: { select: { nombre: true } },
          },
        },
      },
    });

    const used = new Map<string, string>();
    for (const n of nodos) {
      used.set(n.usuarioId, n.usuario.nombre);
      for (const a of n.aprobadores) {
        used.set(a.usuarioId, a.usuario.nombre);
      }
    }

    for (const id of ids) {
      const nombre = used.get(id);
      if (nombre) {
        throw new ConflictException(
          `${nombre} ya participa en otro nivel de este grupo y no puede repetirse`,
        );
      }
    }
  }

  /** Enlaza escalaAId buscando el nodo destino por usuarioId dentro del mismo grupo. */
  private async linkEscalaAId(
    tx: Prisma.TransactionClient,
    nodoId: string,
    escalaAUsuarioId: string | null,
    grupoId: string,
    empresaId: string,
    modulo: string,
  ) {
    if (!escalaAUsuarioId) {
      await tx.nodoEscalaAprobacion.update({
        where: { id: nodoId },
        data: { escalaAId: null },
      });
      return;
    }
    const sig = await tx.nodoEscalaAprobacion.findFirst({
      where: {
        empresaId,
        grupoId,
        modulo: { equals: modulo, mode: 'insensitive' },
        usuarioId: escalaAUsuarioId,
        activo: true,
      },
      select: { id: true },
    });
    await tx.nodoEscalaAprobacion.update({
      where: { id: nodoId },
      data: { escalaAId: sig?.id ?? null },
    });
  }

  private async assertGrupoEscala(
    empresaId: string,
    grupoId: string,
    modulo: string,
  ) {
    const grupo = await this.prisma.grupoAprobacion.findFirst({
      where: { id: grupoId, empresaId },
    });
    if (!grupo) throw new BadRequestException('Grupo de aprobación no encontrado');
    if (grupo.modulo.toLowerCase() !== modulo.trim().toLowerCase()) {
      throw new BadRequestException('El grupo no pertenece al módulo indicado');
    }
    return grupo;
  }

  private async assertUsuariosAccesibles(user: JwtPayload, ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return;
    const count = await this.prisma.usuario.count({
      where: { id: { in: unique }, ...usuarioWhere(resolveTenant(user)) },
    });
    if (count !== unique.length) {
      throw new BadRequestException('Uno o más usuarios no existen o no son accesibles');
    }
  }

  private async nombresUsuarios(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const rows = await this.prisma.usuario.findMany({
      where: { id: { in: unique } },
      select: { id: true, nombre: true },
    });
    return new Map(rows.map((r) => [r.id, r.nombre]));
  }

  /** Valida que los aprobadores *nuevos* puedan abrir la bandeja del módulo. */
  private async assertAprobadoresBandeja(
    modulo: string,
    usuarioIds: string[],
    mode: 'read' | 'write' = 'read',
    empresaId?: string,
  ) {
    const unique = [...new Set(usuarioIds.filter(Boolean))];
    if (!unique.length) return;
    const usuarios = await loadUsuariosParaBandeja(this.prisma, unique);
    let invalidos = findUsuariosSinBandeja(modulo, usuarios, mode);
    if (invalidos.length && empresaId) {
      const designados = await loadUsuarioIdsDesignadosBandeja(
        this.prisma,
        empresaId,
        modulo,
        invalidos.map((i) => i.usuarioId),
      );
      invalidos = invalidos.filter((i) => !designados.has(i.usuarioId));
    }
    if (invalidos.length) throwAprobadorSinBandeja(invalidos);
  }

  async validarAprobadoresBandeja(
    user: JwtPayload,
    modulo: string,
    usuarioIds: string[],
    mode: 'read' | 'write' = 'read',
  ) {
    assertModuloAprobacionesAccess(user, modulo, 'read');
    await this.assertUsuariosAccesibles(user, usuarioIds);
    const usuarios = await loadUsuariosParaBandeja(this.prisma, usuarioIds);
    const invalidos = findUsuariosSinBandeja(modulo, usuarios, mode);
    return { ok: invalidos.length === 0, invalidos };
  }

  private async syncMiembrosGrupo(
    tx: Prisma.TransactionClient,
    empresaId: string,
    modulo: string,
    grupoId: string,
    miembroIds: string[],
  ) {
    const unique = [...new Set(miembroIds.filter(Boolean))];
    const otrosGrupos = await tx.grupoAprobacion.findMany({
      where: {
        empresaId,
        modulo: { equals: modulo, mode: 'insensitive' },
        id: { not: grupoId },
      },
      select: { id: true },
    });
    if (otrosGrupos.length && unique.length) {
      await tx.usuarioGrupoAprobacion.deleteMany({
        where: {
          usuarioId: { in: unique },
          grupoId: { in: otrosGrupos.map((g) => g.id) },
        },
      });
    }
    await tx.usuarioGrupoAprobacion.deleteMany({ where: { grupoId } });
    if (unique.length) {
      await tx.usuarioGrupoAprobacion.createMany({
        data: unique.map((usuarioId) => ({ usuarioId, grupoId })),
      });
    }
  }

  private assertEscalaSinCiclo(
    nodos: Array<{ usuarioId: string; escalaAUsuarioId: string | null }>,
    usuarioId: string,
    escalaAUsuarioId: string | null | undefined,
  ) {
    if (!escalaAUsuarioId) return;
    if (escalaAUsuarioId === usuarioId) {
      throw new BadRequestException('Un nodo no puede escalar a sí mismo');
    }
    const map = new Map(nodos.map((n) => [n.usuarioId, n.escalaAUsuarioId]));
    map.set(usuarioId, escalaAUsuarioId);
    let cur: string | null = escalaAUsuarioId;
    const visited = new Set<string>([usuarioId]);
    while (cur) {
      if (visited.has(cur)) {
        throw new BadRequestException('La escala generaría un ciclo');
      }
      visited.add(cur);
      cur = map.get(cur) ?? null;
    }
  }

  /** Cada paso debe tener tope estrictamente menor que su destino «escala a». */
  private assertMontosEscalaCoherentes(
    nodos: Array<{
      usuarioId: string;
      montoMax: number | null;
      escalaAUsuarioId: string | null;
    }>,
    nombres?: Map<string, string>,
  ) {
    const byUser = new Map(nodos.map((n) => [n.usuarioId, n]));
    const fmt = (m: number) => m.toLocaleString('es-CL');
    const label = (id: string) => nombres?.get(id) ?? id;
    for (const n of nodos) {
      if (!n.escalaAUsuarioId || n.montoMax == null) continue;
      const sig = byUser.get(n.escalaAUsuarioId);
      if (!sig) continue;
      if (sig.montoMax != null && n.montoMax >= sig.montoMax) {
        throw new BadRequestException(
          `El tope de «${label(n.usuarioId)}» ($${fmt(n.montoMax)}) debe ser menor que el del destino «${label(sig.usuarioId)}» ($${fmt(sig.montoMax)}). Aumente el tope del siguiente nivel o reduzca el intermedio.`,
        );
      }
    }
  }

  private mapNodosMontos(
    rows: Array<{
      usuarioId: string;
      escalaAUsuarioId: string | null;
      montoMax: Prisma.Decimal | null;
    }>,
  ) {
    return rows.map((n) => ({
      usuarioId: n.usuarioId,
      escalaAUsuarioId: n.escalaAUsuarioId,
      montoMax: n.montoMax != null ? Number(n.montoMax) : null,
    }));
  }

  async getGruposAprobacion(user: JwtPayload, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const rows = await this.prisma.grupoAprobacion.findMany({
      where: { empresaId, ...prismaModuloFilterForUser(user) },
      include: {
        aprobadorInicial: { select: { nombre: true } },
        miembros: { include: { usuario: { select: { id: true, nombre: true } } } },
      },
      orderBy: [{ modulo: 'asc' }, { nombre: 'asc' }],
    });
    return rows.map((r) => this.mapGrupo(r));
  }

  async createGrupoAprobacion(
    user: JwtPayload,
    dto: UpsertGrupoAprobacionDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    await assertModuloAprobacionesWriteLive(this.prisma, user, dto.modulo, empresaId);
    const miembroIds = [...new Set((dto.miembroIds ?? []).filter(Boolean))];
    await this.assertUsuariosAccesibles(user, [dto.aprobadorInicialId, ...miembroIds]);
    await this.assertAprobadoresBandeja(dto.modulo, [dto.aprobadorInicialId], 'write', empresaId);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.grupoAprobacion.create({
        data: {
          nombre: dto.nombre.trim(),
          modulo: dto.modulo.trim(),
          aprobadorInicialId: dto.aprobadorInicialId,
          activo: dto.activo ?? true,
          empresaId,
        },
      });
      await this.syncMiembrosGrupo(tx, empresaId, dto.modulo, created.id, miembroIds);
      await tx.nodoEscalaAprobacion.create({
        data: {
          empresaId,
          grupoId: created.id,
          modulo: dto.modulo.trim(),
          usuarioId: dto.aprobadorInicialId,
          logica: 'SIMPLE',
          montoMax: null,
          escalaAUsuarioId: null,
          activo: true,
        },
      });
      return tx.grupoAprobacion.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          aprobadorInicial: { select: { nombre: true } },
          miembros: { include: { usuario: { select: { id: true, nombre: true } } } },
        },
      });
    });
    return this.mapGrupo(row);
  }

  async updateGrupoAprobacion(
    user: JwtPayload,
    id: string,
    dto: UpsertGrupoAprobacionDto,
  ) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.grupoAprobacion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Grupo no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    await assertModuloAprobacionesWriteLive(this.prisma, user, existing.modulo, existing.empresaId);
    await assertModuloAprobacionesWriteLive(this.prisma, user, dto.modulo, existing.empresaId);
    const miembroIds = [...new Set((dto.miembroIds ?? []).filter(Boolean))];
    await this.assertUsuariosAccesibles(user, [dto.aprobadorInicialId, ...miembroIds]);
    // Solo si cambia el inicial: los miembros (solicitantes) no usan la bandeja.
    // Si el inicial ya está designado, revalidar su rol bloqueaba asignar gente al grupo
    // (p. ej. Ana Torres sin pantalla Aprobaciones al guardar a Pía Maulen).
    if (dto.aprobadorInicialId !== existing.aprobadorInicialId) {
      await this.assertAprobadoresBandeja(
        dto.modulo,
        [dto.aprobadorInicialId],
        'write',
        existing.empresaId,
      );
    }
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.grupoAprobacion.update({
        where: { id },
        data: {
          nombre: dto.nombre.trim(),
          modulo: dto.modulo.trim(),
          aprobadorInicialId: dto.aprobadorInicialId,
          activo: dto.activo ?? existing.activo,
        },
      });
      await this.syncMiembrosGrupo(tx, existing.empresaId, dto.modulo, id, miembroIds);
      return tx.grupoAprobacion.findUniqueOrThrow({
        where: { id },
        include: {
          aprobadorInicial: { select: { nombre: true } },
          miembros: { include: { usuario: { select: { id: true, nombre: true } } } },
        },
      });
    });
    return this.mapGrupo(row);
  }

  async deleteGrupoAprobacion(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.grupoAprobacion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Grupo no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    await assertModuloAprobacionesWriteLive(this.prisma, user, existing.modulo, existing.empresaId);
    await this.prisma.grupoAprobacion.delete({ where: { id } });
    return { ok: true, id };
  }

  async getEscalasAprobacion(user: JwtPayload, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const rows = await this.prisma.nodoEscalaAprobacion.findMany({
      where: { empresaId, ...prismaModuloFilterForUser(user) },
      include: this.nodoInclude,
      orderBy: [{ modulo: 'asc' }, { grupo: { nombre: 'asc' } }, { usuario: { nombre: 'asc' } }],
    });
    return rows.map((r) => this.mapNodoEscala(r));
  }

  async createNodoEscalaAprobacion(
    user: JwtPayload,
    dto: UpsertNodoEscalaAprobacionDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    await assertModuloAprobacionesWriteLive(this.prisma, user, dto.modulo, empresaId);
    if (!dto.grupoId?.trim()) {
      throw new BadRequestException('El nodo de escala debe pertenecer a un grupo');
    }
    const logica = dto.logica ?? 'SIMPLE';
    const aprobadoresExtra = dto.aprobadoresExtra ?? [];
    if (logica !== 'SIMPLE' && aprobadoresExtra.length < 1) {
      throw new BadRequestException(`Lógica ${logica} requiere al menos 2 aprobadores`);
    }
    const insertAfter = dto.insertAfterUsuarioId?.trim() || null;

    let escalaId = dto.escalaAUsuarioId ?? null;

    // Inserción en medio/final de cadena: enlazar después del predecesor indicado.
    if (insertAfter) {
      const predecesor = await this.prisma.nodoEscalaAprobacion.findFirst({
        where: {
          empresaId,
          grupoId: dto.grupoId,
          modulo: { equals: dto.modulo, mode: 'insensitive' },
          usuarioId: insertAfter,
          activo: true,
        },
      });
      if (!predecesor) {
        throw new BadRequestException('No se encontró el nodo predecesor en la cadena');
      }
      escalaId = escalaId ?? predecesor.escalaAUsuarioId;
    }

    await this.assertUsuariosAccesibles(
      user,
      [dto.usuarioId, ...(escalaId ? [escalaId] : []), ...aprobadoresExtra],
    );
    await this.assertAprobadoresBandeja(
      dto.modulo,
      [dto.usuarioId, ...(escalaId ? [escalaId] : []), ...aprobadoresExtra],
      'write',
      empresaId,
    );
    await this.assertGrupoEscala(empresaId, dto.grupoId, dto.modulo);

    const existentes = await this.prisma.nodoEscalaAprobacion.findMany({
      where: {
        empresaId,
        grupoId: dto.grupoId,
        modulo: { equals: dto.modulo, mode: 'insensitive' },
      },
      select: { id: true, usuarioId: true, escalaAUsuarioId: true, montoMax: true },
    });

    if (insertAfter) {
      const grupoRow = await this.prisma.grupoAprobacion.findFirst({
        where: { id: dto.grupoId, empresaId },
        select: { aprobadorInicialId: true },
      });
      if (grupoRow) {
        const lastId = this.lastUsuarioIdInCadena(grupoRow, existentes);
        if (lastId && insertAfter === lastId) {
          throw new BadRequestException(
            'No se puede agregar un nivel después del aprobador final. Inserte intermedios con «+» entre niveles o cambie el aprobador final.',
          );
        }
      }
    }

    const montoNuevo = dto.montoMax ?? null;
    let nodosMontos = this.mapNodosMontos(existentes);

    if (insertAfter) {
      // Simular el empalme para validar ciclos y topes.
      const patched = existentes.map((n) =>
        n.usuarioId === insertAfter
          ? { usuarioId: n.usuarioId, escalaAUsuarioId: dto.usuarioId }
          : { usuarioId: n.usuarioId, escalaAUsuarioId: n.escalaAUsuarioId },
      );
      this.assertEscalaSinCiclo(patched, dto.usuarioId, escalaId);
      nodosMontos = nodosMontos.map((n) =>
        n.usuarioId === insertAfter ? { ...n, escalaAUsuarioId: dto.usuarioId } : n,
      );
    } else {
      this.assertEscalaSinCiclo(existentes, dto.usuarioId, escalaId);
    }

    nodosMontos.push({
      usuarioId: dto.usuarioId,
      montoMax: montoNuevo,
      escalaAUsuarioId: escalaId,
    });
    const nombres = await this.nombresUsuarios(
      nodosMontos.flatMap((n) => [n.usuarioId, n.escalaAUsuarioId].filter(Boolean) as string[]),
    );
    this.assertMontosEscalaCoherentes(nodosMontos, nombres);

    const dup = existentes.some((n) => n.usuarioId === dto.usuarioId);
    if (dup) {
      throw new ConflictException('Ya existe un nodo para este aprobador en el grupo');
    }

    await this.assertAprobadoresUnicosEnGrupo({
      empresaId,
      grupoId: dto.grupoId,
      modulo: dto.modulo,
      usuarioIds: [dto.usuarioId, ...aprobadoresExtra],
    });

    const row = await this.prisma.$transaction(async (tx) => {
      if (insertAfter) {
        const pred = existentes.find((n) => n.usuarioId === insertAfter);
        if (pred) {
          await tx.nodoEscalaAprobacion.update({
            where: { id: pred.id },
            data: { escalaAUsuarioId: dto.usuarioId },
          });
          await this.linkEscalaAId(
            tx, pred.id, dto.usuarioId, dto.grupoId, empresaId, dto.modulo,
          );
        }
      }

      const created = await tx.nodoEscalaAprobacion.create({
        data: {
          empresaId,
          grupoId: dto.grupoId,
          modulo: dto.modulo.trim(),
          usuarioId: dto.usuarioId,
          logica,
          montoMax: dto.montoMax ?? null,
          escalaAUsuarioId: escalaId,
          activo: dto.activo ?? true,
        },
        include: this.nodoInclude,
      });

      await this.syncNodoAprobadores(tx, created.id, dto.usuarioId, logica, aprobadoresExtra);
      await this.linkEscalaAId(
        tx, created.id, escalaId, dto.grupoId, empresaId, dto.modulo,
      );

      // Si no hay entrada visible, o se insertó delante de ella, el grupo debe apuntar al nuevo nodo.
      if (!insertAfter) {
        const grupoRow = await tx.grupoAprobacion.findFirst({
          where: { id: dto.grupoId, empresaId },
          select: { id: true, aprobadorInicialId: true },
        });
        if (grupoRow) {
          const tieneEntrada = existentes.some((n) => n.usuarioId === grupoRow.aprobadorInicialId);
          const insertaDelante =
            !!escalaId
            && escalaId === grupoRow.aprobadorInicialId
            && dto.usuarioId !== grupoRow.aprobadorInicialId;
          if (!tieneEntrada || insertaDelante) {
            await tx.grupoAprobacion.update({
              where: { id: grupoRow.id },
              data: { aprobadorInicialId: dto.usuarioId },
            });
          }
        }
      }

      return tx.nodoEscalaAprobacion.findUniqueOrThrow({
        where: { id: created.id },
        include: this.nodoInclude,
      });
    });

    return this.mapNodoEscala(row);
  }

  /** Pendientes OC asignados al aprobador (solo estado en vuelo). */
  async previewPendientesAprobador(
    user: JwtPayload,
    usuarioId: string,
    empresaHeader?: string,
    sugeridoAprobadorId?: string | null,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const items = await this.listPendientesAprobador(empresaId, usuarioId);
    return {
      usuarioId,
      count: items.length,
      items,
      sugeridoAprobadorId: sugeridoAprobadorId ?? null,
    };
  }

  async previewPendientesNodo(
    user: JwtPayload,
    nodoId: string,
    empresaHeader?: string,
  ) {
    const scope = resolveTenant(user);
    const nodo = await this.prisma.nodoEscalaAprobacion.findUnique({ where: { id: nodoId } });
    if (!nodo) throw new NotFoundException('Nodo de escala no encontrado');
    assertTenantAccess(scope, nodo.empresaId);
    assertModuloAprobacionesAccess(user, nodo.modulo, 'read');
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    if (empresaId !== nodo.empresaId) {
      throw new ForbiddenException('Empresa no coincide con el nodo');
    }
    const items = await this.listPendientesAprobador(nodo.empresaId, nodo.usuarioId);
    return {
      nodoId: nodo.id,
      usuarioId: nodo.usuarioId,
      count: items.length,
      items,
      sugeridoAprobadorId: nodo.escalaAUsuarioId ?? null,
    };
  }

  private async listPendientesAprobador(empresaId: string, usuarioId: string) {
    const aps = await this.prisma.aprobacionOc.findMany({
      where: { empresaId, aprobadorId: usuarioId, estado: 'PENDIENTE' },
      select: {
        id: true,
        ocId: true,
        ocNumero: true,
        solicitante: true,
        monto: true,
        proveedor: true,
      },
    });
    return [
      ...aps.map((a) => ({
        id: a.id,
        tipo: 'OC' as const,
        documentoId: a.ocId,
        identificador: a.ocNumero,
        solicitante: a.solicitante,
        monto: Number(a.monto),
        detalle: a.proveedor,
      })),
    ];
  }

  private async countPendientesModulo(empresaId: string, modulo: string) {
    const nodos = await this.prisma.nodoEscalaAprobacion.findMany({
      where: { empresaId, modulo: { equals: modulo, mode: 'insensitive' } },
      select: { usuarioId: true },
    });
    const grupos = await this.prisma.grupoAprobacion.findMany({
      where: { empresaId, modulo: { equals: modulo, mode: 'insensitive' } },
      select: { aprobadorInicialId: true },
    });
    const ids = [
      ...new Set([
        ...nodos.map((n) => n.usuarioId),
        ...grupos.map((g) => g.aprobadorInicialId),
      ]),
    ];
    if (!ids.length) return 0;

    const m = modulo.trim().toLowerCase();
    if (m === 'compras') {
      return this.prisma.aprobacionOc.count({
        where: { empresaId, estado: 'PENDIENTE', aprobadorId: { in: ids } },
      });
    }
    return 0;
  }

  /**
   * Reasigna solo pendientes en vuelo al nuevo aprobador.
   * No toca APROBADA/RECHAZADA ni resueltoPor*.
   */
  private async transferPendientesAprobador(
    empresaId: string,
    fromUsuarioId: string,
    toUsuarioId: string,
  ) {
    if (!toUsuarioId?.trim()) {
      throw new BadRequestException('nuevoAprobadorId es obligatorio cuando hay pendientes');
    }
    if (fromUsuarioId === toUsuarioId) return { transferidos: 0 };

    const dest = await this.prisma.usuario.findFirst({
      where: { id: toUsuarioId, OR: [{ empresaId }, { empresasAcceso: { some: { empresaId } } }] },
      select: { id: true, nombre: true },
    });
    if (!dest) throw new BadRequestException('Usuario destino no accesible en la empresa');

    const aps = await this.prisma.aprobacionOc.findMany({
      where: { empresaId, aprobadorId: fromUsuarioId, estado: 'PENDIENTE' },
      select: { id: true, ocId: true, ocNumero: true, monto: true, solicitante: true, proveedor: true },
    });

    await this.prisma.$transaction(async (tx) => {
      for (const ap of aps) {
        await tx.aprobacionOc.update({
          where: { id: ap.id },
          data: { aprobadorId: dest.id, aprobadorNombre: dest.nombre },
        });
        const oc = await tx.ordenCompra.findUnique({
          where: { id: ap.ocId },
          select: {
            id: true,
            aprobacionCadenaIds: true,
            aprobacionPasoActual: true,
            aprobadorId: true,
          },
        });
        if (oc) {
          const cadena = this.rewriteCadenaDesdePaso(
            oc.aprobacionCadenaIds,
            oc.aprobacionPasoActual,
            fromUsuarioId,
            dest.id,
          );
          await tx.ordenCompra.update({
            where: { id: oc.id },
            data: {
              aprobadorId: dest.id,
              aprobadorNombre: dest.nombre,
              aprobacionCadenaIds: cadena,
            },
          });
        }
        await tx.notificacion.updateMany({
          where: { refKey: `oc-pend:${ap.id}`, userId: fromUsuarioId },
          data: { leida: true },
        });
        await tx.notificacion.upsert({
          where: { userId_refKey: { userId: dest.id, refKey: `oc-pend:${ap.id}` } },
          create: {
            userId: dest.id,
            empresaId,
            tipo: 'OC_PENDIENTE',
            titulo: `OC ${ap.ocNumero} pendiente`,
            detalle: `${ap.proveedor} · ${ap.solicitante}`,
            href: `/compras/aprobaciones?open=${encodeURIComponent(ap.id)}`,
            refKey: `oc-pend:${ap.id}`,
            monto: ap.monto,
            leida: false,
          },
          update: {
            empresaId,
            tipo: 'OC_PENDIENTE',
            titulo: `OC ${ap.ocNumero} pendiente`,
            detalle: `${ap.proveedor} · ${ap.solicitante}`,
            href: `/compras/aprobaciones?open=${encodeURIComponent(ap.id)}`,
            monto: ap.monto,
            leida: false,
          },
        });
      }

    });

    return { transferidos: aps.length };
  }

  /** Reemplaza from→to en la cadena desde el paso actual (1-based) inclusive. */
  private rewriteCadenaDesdePaso(
    cadena: string[],
    pasoActual: number,
    fromUsuarioId: string,
    toUsuarioId: string,
  ): string[] {
    const start = Math.max(0, (pasoActual || 1) - 1);
    return cadena.map((id, i) => {
      if (i < start) return id;
      return id === fromUsuarioId ? toUsuarioId : id;
    });
  }

  private computeSiguienteEnCadena(
    grupo: { aprobadorInicialId: string },
    nodos: Array<{ usuarioId: string; escalaAUsuarioId: string | null }>,
    usuarioId: string,
  ): string | null {
    const byUser = new Map(nodos.map((n) => [n.usuarioId, n]));
    const visited = new Set<string>();
    let current: string | null = grupo.aprobadorInicialId;
    while (current && !visited.has(current)) {
      visited.add(current);
      const nodo = byUser.get(current);
      if (!nodo) break;
      if (current === usuarioId) {
        const next = nodo.escalaAUsuarioId ?? null;
        return next && byUser.has(next) ? next : null;
      }
      const next = nodo.escalaAUsuarioId ?? null;
      if (!next || !byUser.has(next)) break;
      current = next;
    }
    return null;
  }

  private lastUsuarioIdInCadena(
    grupo: { aprobadorInicialId: string },
    nodos: Array<{ usuarioId: string; escalaAUsuarioId: string | null }>,
  ): string | null {
    const byUser = new Map(nodos.map((n) => [n.usuarioId, n]));
    const visited = new Set<string>();
    let current: string | null = grupo.aprobadorInicialId;
    let last: string | null = null;
    while (current && !visited.has(current)) {
      visited.add(current);
      const nodo = byUser.get(current);
      if (!nodo) break;
      last = current;
      const next = nodo.escalaAUsuarioId ?? null;
      if (!next || !byUser.has(next)) break;
      current = next;
    }
    return last;
  }

  /** En edición, escalaA solo puede ser el siguiente en cadena o fin (null). */
  private assertEscalaDestinoSoloSiguienteOFin(
    escalaId: string | null,
    siguiente: string | null,
    escalaAnterior: string | null,
  ) {
    const permitidos = new Set<string | null>([null, siguiente, escalaAnterior]);
    if (!permitidos.has(escalaId)) {
      throw new BadRequestException(
        '«Escala a» solo puede ser el siguiente en la cadena o fin de cadena. Use la inserción entre niveles para agregar aprobadores intermedios.',
      );
    }
  }

  private async assertReasignacionSiPendientes(
    empresaId: string,
    fromUsuarioId: string,
    opts: {
      confirmarReasignacion?: boolean;
      nuevoAprobadorId?: string | null;
      sugeridoAprobadorId?: string | null;
    },
  ) {
    const items = await this.listPendientesAprobador(empresaId, fromUsuarioId);
    if (!items.length) return;

    const destino =
      opts.nuevoAprobadorId?.trim() ||
      opts.sugeridoAprobadorId?.trim() ||
      null;

    if (!opts.confirmarReasignacion || !destino) {
      throw new ConflictException({
        code: 'PENDIENTES_REQUIEREN_REASIGNACION',
        message: `Hay ${items.length} pendiente(s) que requieren reasignación`,
        pendientes: items,
        sugeridoAprobadorId: opts.sugeridoAprobadorId ?? null,
      });
    }

    await this.transferPendientesAprobador(empresaId, fromUsuarioId, destino);
  }

  async updateNodoEscalaAprobacion(
    user: JwtPayload,
    id: string,
    dto: UpsertNodoEscalaAprobacionDto,
  ) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.nodoEscalaAprobacion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Nodo de escala no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    await assertModuloAprobacionesWriteLive(this.prisma, user, existing.modulo, existing.empresaId);
    await assertModuloAprobacionesWriteLive(this.prisma, user, dto.modulo, existing.empresaId);
    if (!dto.grupoId?.trim()) {
      throw new BadRequestException('El nodo de escala debe pertenecer a un grupo');
    }
    const logica = dto.logica ?? existing.logica ?? 'SIMPLE';
    const aprobadoresExtra = dto.aprobadoresExtra ?? [];
    if (logica !== 'SIMPLE' && aprobadoresExtra.length < 1) {
      throw new BadRequestException(`Lógica ${logica} requiere al menos 2 aprobadores`);
    }
    const grupo = await this.prisma.grupoAprobacion.findFirst({
      where: { id: dto.grupoId, empresaId: existing.empresaId },
      select: { aprobadorInicialId: true },
    });
    if (!grupo) {
      throw new BadRequestException('Grupo de aprobación no encontrado');
    }
    const nodosCadena = await this.prisma.nodoEscalaAprobacion.findMany({
      where: {
        empresaId: existing.empresaId,
        grupoId: dto.grupoId,
        modulo: { equals: dto.modulo, mode: 'insensitive' },
        activo: true,
      },
      select: { usuarioId: true, escalaAUsuarioId: true },
    });
    const siguiente = this.computeSiguienteEnCadena(grupo, nodosCadena, existing.usuarioId);
    const esFinal = this.lastUsuarioIdInCadena(grupo, nodosCadena) === existing.usuarioId;
    const escalaId = esFinal ? null : (dto.escalaAUsuarioId ?? null);
    if (!esFinal) {
      this.assertEscalaDestinoSoloSiguienteOFin(
        escalaId,
        siguiente,
        existing.escalaAUsuarioId,
      );
    }
    await this.assertUsuariosAccesibles(
      user,
      [dto.usuarioId, ...(escalaId ? [escalaId] : []), ...aprobadoresExtra],
    );
    await this.assertAprobadoresBandeja(
      dto.modulo,
      [dto.usuarioId, ...(escalaId ? [escalaId] : []), ...aprobadoresExtra],
      'write',
      existing.empresaId,
    );
    await this.assertGrupoEscala(existing.empresaId, dto.grupoId, dto.modulo);
    const existentes = await this.prisma.nodoEscalaAprobacion.findMany({
      where: {
        empresaId: existing.empresaId,
        grupoId: dto.grupoId,
        modulo: { equals: dto.modulo, mode: 'insensitive' },
        id: { not: id },
      },
      select: { usuarioId: true, escalaAUsuarioId: true, montoMax: true },
    });
    this.assertEscalaSinCiclo(existentes, dto.usuarioId, escalaId);
    const nodosMontos = [
      ...this.mapNodosMontos(existentes),
      {
        usuarioId: dto.usuarioId,
        montoMax: dto.montoMax ?? null,
        escalaAUsuarioId: escalaId,
      },
    ];
    const nombres = await this.nombresUsuarios(
      nodosMontos.flatMap((n) => [n.usuarioId, n.escalaAUsuarioId].filter(Boolean) as string[]),
    );
    this.assertMontosEscalaCoherentes(nodosMontos, nombres);
    const dup = existentes.some((n) => n.usuarioId === dto.usuarioId);
    if (dup) {
      throw new ConflictException('Ya existe un nodo para este aprobador en el grupo');
    }

    await this.assertAprobadoresUnicosEnGrupo({
      empresaId: existing.empresaId,
      grupoId: dto.grupoId,
      modulo: dto.modulo,
      usuarioIds: [dto.usuarioId, ...aprobadoresExtra],
      excludeNodoId: id,
    });

    if (existing.usuarioId !== dto.usuarioId) {
      await this.assertReasignacionSiPendientes(existing.empresaId, existing.usuarioId, {
        confirmarReasignacion: dto.confirmarReasignacion,
        nuevoAprobadorId: dto.nuevoAprobadorId ?? dto.usuarioId,
        sugeridoAprobadorId: dto.usuarioId,
      });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.nodoEscalaAprobacion.update({
        where: { id },
        data: {
          grupoId: dto.grupoId,
          modulo: dto.modulo.trim(),
          usuarioId: dto.usuarioId,
          logica,
          montoMax: dto.montoMax ?? null,
          escalaAUsuarioId: escalaId,
          activo: dto.activo ?? existing.activo,
        },
        include: this.nodoInclude,
      });
      await this.syncNodoAprobadores(tx, id, dto.usuarioId, logica, aprobadoresExtra);
      await this.linkEscalaAId(
        tx, id, escalaId, dto.grupoId, existing.empresaId, dto.modulo,
      );
      if (existing.usuarioId !== dto.usuarioId && grupo.aprobadorInicialId === existing.usuarioId) {
        await tx.grupoAprobacion.update({
          where: { id: dto.grupoId },
          data: { aprobadorInicialId: dto.usuarioId },
        });
      }
      return tx.nodoEscalaAprobacion.findUniqueOrThrow({
        where: { id },
        include: this.nodoInclude,
      });
    });

    return this.mapNodoEscala(row);
  }

  async deleteNodoEscalaAprobacion(
    user: JwtPayload,
    id: string,
    opts?: { confirmarReasignacion?: boolean; nuevoAprobadorId?: string | null },
  ) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.nodoEscalaAprobacion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Nodo de escala no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    await assertModuloAprobacionesWriteLive(this.prisma, user, existing.modulo, existing.empresaId);

    await this.assertReasignacionSiPendientes(existing.empresaId, existing.usuarioId, {
      confirmarReasignacion: opts?.confirmarReasignacion,
      nuevoAprobadorId: opts?.nuevoAprobadorId,
      sugeridoAprobadorId: existing.escalaAUsuarioId,
    });

    const grupo = await this.prisma.grupoAprobacion.findFirst({
      where: { id: existing.grupoId, empresaId: existing.empresaId },
      select: { id: true, aprobadorInicialId: true },
    });
    if (!grupo) {
      throw new BadRequestException('Grupo de aprobación no encontrado');
    }

    const nodos = await this.prisma.nodoEscalaAprobacion.findMany({
      where: {
        empresaId: existing.empresaId,
        grupoId: existing.grupoId,
        modulo: { equals: existing.modulo, mode: 'insensitive' },
        activo: true,
      },
      select: { id: true, usuarioId: true, escalaAUsuarioId: true },
    });
    if (this.lastUsuarioIdInCadena(grupo, nodos) === existing.usuarioId) {
      throw new BadRequestException(
        'No se puede eliminar el aprobador final. Cámbielo al editar el nodo o el grupo.',
      );
    }

    // Reencadenar: A → B → C al borrar B queda A → C (y entrada del grupo si B era inicial).
    const siguienteUsuarioId = existing.escalaAUsuarioId;
    const predecesores = nodos.filter(
      (n) => n.id !== existing.id && n.escalaAUsuarioId === existing.usuarioId,
    );

    await this.prisma.$transaction(async (tx) => {
      for (const pred of predecesores) {
        await tx.nodoEscalaAprobacion.update({
          where: { id: pred.id },
          data: { escalaAUsuarioId: siguienteUsuarioId },
        });
        await this.linkEscalaAId(
          tx,
          pred.id,
          siguienteUsuarioId,
          existing.grupoId,
          existing.empresaId,
          existing.modulo,
        );
      }

      if (grupo.aprobadorInicialId === existing.usuarioId) {
        if (!siguienteUsuarioId) {
          throw new BadRequestException(
            'No se puede eliminar la entrada de la cadena sin un siguiente aprobador. Defina «escala a» o cambie el aprobador inicial del grupo.',
          );
        }
        const nextExists = nodos.some(
          (n) => n.id !== existing.id && n.usuarioId === siguienteUsuarioId,
        );
        if (!nextExists) {
          throw new BadRequestException(
            'El siguiente de la cadena no tiene nodo en el grupo; no se puede reencadenar la entrada.',
          );
        }
        await tx.grupoAprobacion.update({
          where: { id: grupo.id },
          data: { aprobadorInicialId: siguienteUsuarioId },
        });
      }

      await tx.nodoEscalaAprobacion.delete({ where: { id } });
    });

    return { ok: true, id, reencadenadoA: siguienteUsuarioId ?? null };
  }

  async simularAprobacion(
    user: JwtPayload,
    dto: SimularAprobacionDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const modulo = dto.modulo.trim();
    assertModuloAprobacionesAccess(user, modulo, 'read');
    const [usuarios, delegaciones, grupos, nodos] = await Promise.all([
      loadUsuariosOrganigrama(this.prisma, empresaId),
      loadDelegacionesAprobacion(this.prisma, empresaId),
      loadGruposAprobacion(this.prisma, empresaId),
      loadNodosEscala(this.prisma, empresaId, modulo),
    ]);
    const poolFromWorkflow = poolFromNodosEscalas(nodos);
    let solicitanteId = dto.usuarioId ?? '';
    let grupoUsado: { id: string; nombre: string } | null = null;

    if (dto.grupoId) {
      const g = await this.prisma.grupoAprobacion.findFirst({
        where: { id: dto.grupoId, empresaId },
        include: { miembros: { select: { usuarioId: true } } },
      });
      if (!g) throw new NotFoundException('Grupo no encontrado');
      grupoUsado = { id: g.id, nombre: g.nombre };
      solicitanteId = dto.usuarioId ?? g.miembros[0]?.usuarioId ?? solicitanteId;
      if (!solicitanteId) {
        throw new BadRequestException('El grupo no tiene miembros para simular');
      }
      const grupoRow = grupos.find((x) => x.id === g.id)!;
      const cadena = buildCadenaDesdeGrupo(
        solicitanteId,
        dto.monto,
        grupoRow,
        nodos,
        usuarios,
        poolFromWorkflow.length ? poolFromWorkflow : poolFromNodosEscalas(nodos),
        { delegaciones, modulo },
      );
      return {
        status: cadena.length ? 'ok' : 'sin_cadena',
        modulo,
        monto: dto.monto,
        grupo: grupoUsado,
        solicitanteId,
        cadena,
        motivos: cadena.map((paso, i) => {
          const nodo = nodos.find((n) => n.usuarioId === paso.id);
          if (i === 0) {
            if (solicitanteId === grupoRow.aprobadorInicialId) {
              return 'Jefa de área solicitando — escala sin auto-aprobación';
            }
            return `Entrada del grupo (${grupoUsado?.nombre})`;
          }
          const prev = nodos.find((n) => n.escalaAUsuarioId === paso.id);
          if (prev?.montoMax != null) {
            return `Monto supera tope de paso anterior ($${prev.montoMax.toLocaleString('es-CL')})`;
          }
          return 'Escalamiento';
        }),
      };
    }

    if (!dto.usuarioId) {
      throw new BadRequestException('Indique usuarioId o grupoId');
    }

    const rules = await this.prisma.workflowConfig.findMany({
      where: {
        empresaId,
        activo: true,
        modulo: { equals: modulo, mode: 'insensitive' },
      },
    });
    const match = rules.find(
      (r) => dto.monto >= Number(r.montoMin) && dto.monto <= Number(r.montoMax),
    );
    const allowedIds = match?.aprobadorIds?.filter(Boolean) ?? poolFromWorkflow;

    const solicitante = dto.usuarioId
      ? await this.prisma.usuario.findUnique({
          where: { id: dto.usuarioId },
          select: { rolId: true, rol: { select: { permisos: true } } },
        })
      : null;
    const solicitanteEsMantenedor = Boolean(
      solicitante
      && (isAdminRolId(solicitante.rolId) || (solicitante.rol?.permisos?.includes('*') ?? false)),
    );

    const result = resolveCadenaCompleta({
      solicitanteId: dto.usuarioId,
      monto: dto.monto,
      modulo,
      usuarios,
      allowedIds,
      grupos,
      nodos,
      delegaciones,
      solicitanteEsMantenedor,
    });

    const grupoRow = resolveGrupoSolicitante(
      dto.usuarioId,
      modulo,
      grupos,
      solicitanteEsMantenedor,
    );
    const grupoMeta = grupoRow
      ? await this.prisma.grupoAprobacion.findUnique({
          where: { id: grupoRow.id },
          select: { id: true, nombre: true },
        })
      : null;

    return {
      status: result.status,
      modulo,
      monto: dto.monto,
      grupo: grupoMeta,
      solicitanteId: dto.usuarioId,
      cadena: result.status === 'ok' ? result.cadena : [],
      motivos:
        result.status === 'ok'
          ? result.cadena.map((paso, i) => {
              if (i === 0) return 'Aprobador inicial del grupo';
              const prevNodo = nodos.find((n) => n.escalaAUsuarioId === paso.id);
              if (prevNodo?.montoMax != null) {
                return `Monto supera tope ($${prevNodo.montoMax.toLocaleString('es-CL')})`;
              }
              return 'Escalamiento';
            })
          : [],
    };
  }

  // -------- ADMIN CONCEPTO (administradores delegados por módulo) --------

  async isAdminDeConcepto(empresaId: string, userId: string, modulo: string): Promise<boolean> {
    const user = await this.prisma.usuario.findUnique({
      where: { id: userId },
      include: { rol: { select: { nombre: true } } },
    });
    if (user?.rol?.nombre === 'SUPERADMIN') return true;

    const admin = await this.prisma.adminConcepto.findFirst({
      where: { empresaId, usuarioId: userId, modulo, activo: true },
    });
    return admin !== null;
  }

  async getAdministradoresConcepto(user: JwtPayload, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const rows = await this.prisma.adminConcepto.findMany({
      where: { empresaId },
      include: { usuario: { select: { id: true, nombre: true, email: true } } },
      orderBy: [{ modulo: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      empresaId: r.empresaId,
      usuarioId: r.usuarioId,
      usuarioNombre: r.usuario.nombre,
      usuarioEmail: r.usuario.email,
      modulo: r.modulo,
      activo: r.activo,
    }));
  }

  async createAdminConcepto(user: JwtPayload, dto: UpsertAdminConceptoDto, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    await this.assertUsuariosAccesibles(user, [dto.usuarioId]);
    return this.prisma.adminConcepto.create({
      data: { empresaId, usuarioId: dto.usuarioId, modulo: dto.modulo, activo: dto.activo ?? true },
    });
  }

  async updateAdminConcepto(user: JwtPayload, id: string, dto: UpsertAdminConceptoDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.adminConcepto.findUniqueOrThrow({ where: { id } });
    assertTenantAccess(scope, existing.empresaId);
    return this.prisma.adminConcepto.update({
      where: { id },
      data: { modulo: dto.modulo, activo: dto.activo ?? existing.activo },
    });
  }

  async deleteAdminConcepto(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.adminConcepto.findUniqueOrThrow({ where: { id } });
    assertTenantAccess(scope, existing.empresaId);
    await this.prisma.adminConcepto.delete({ where: { id } });
    return { ok: true, id };
  }

  // -------- EXPORT / IMPORT CONFIG APROBACIONES --------

  async exportAprobacionesConfig(user: JwtPayload, modulo: string, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const moduloTrim = modulo?.trim();
    const moduloFilter = prismaModuloFilterForUser(user);
    const whereBase = { empresaId, ...moduloFilter };
    const whereModulo = moduloTrim && moduloTrim !== 'todos' && moduloTrim !== 'empresa'
      ? { ...whereBase, modulo: { equals: moduloTrim, mode: 'insensitive' as const } }
      : whereBase;
    if (moduloTrim && moduloTrim !== 'todos' && moduloTrim !== 'empresa') {
      assertModuloAprobacionesAccess(user, moduloTrim, 'read');
    } else if (!canReadAprobacionesConfig(user)) {
      throw new ForbiddenException('Sin acceso a configuración de aprobaciones');
    }

    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true, razonSocial: true, rut: true },
    });
    const [grupos, nodos, delegaciones, admins] = await Promise.all([
      this.prisma.grupoAprobacion.findMany({
        where: whereModulo,
        include: { miembros: { select: { usuarioId: true } } },
      }),
      this.prisma.nodoEscalaAprobacion.findMany({
        where: whereModulo,
        include: {
          aprobadores: { select: { usuarioId: true, orden: true }, orderBy: { orden: 'asc' } },
        },
      }),
      this.prisma.delegacionAprobacion.findMany({ where: { empresaId, ...prismaDelegacionModuloFilterForUser(user) } }),
      this.prisma.adminConcepto.findMany({ where: whereModulo }),
    ]);

    const userIds = new Set<string>();
    for (const g of grupos) {
      userIds.add(g.aprobadorInicialId);
      for (const m of g.miembros) userIds.add(m.usuarioId);
    }
    for (const n of nodos) {
      userIds.add(n.usuarioId);
      if (n.escalaAUsuarioId) userIds.add(n.escalaAUsuarioId);
      for (const a of n.aprobadores) userIds.add(a.usuarioId);
    }
    for (const d of delegaciones) {
      userIds.add(d.titularId);
      userIds.add(d.suplenteId);
    }
    for (const a of admins) userIds.add(a.usuarioId);

    const usuarios = userIds.size
      ? await this.prisma.usuario.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, email: true, nombre: true },
        })
      : [];

    return {
      version: 2,
      empresaId,
      empresaNombre: empresa?.razonSocial ?? null,
      empresaRut: empresa?.rut ?? null,
      modulo: moduloTrim && moduloTrim !== 'todos' && moduloTrim !== 'empresa' ? moduloTrim : 'empresa',
      exportadoEn: new Date().toISOString(),
      usuarios,
      grupos: grupos.map((g) => ({
        id: g.id,
        modulo: g.modulo,
        nombre: g.nombre,
        aprobadorInicialId: g.aprobadorInicialId,
        activo: g.activo,
        miembroIds: g.miembros.map((m) => m.usuarioId),
        miembros: g.miembros,
      })),
      nodos: nodos.map((n) => ({
        id: n.id,
        grupoId: n.grupoId,
        modulo: n.modulo,
        usuarioId: n.usuarioId,
        logica: n.logica,
        montoMax: n.montoMax != null ? Number(n.montoMax) : null,
        escalaAUsuarioId: n.escalaAUsuarioId,
        escalaAId: n.escalaAId,
        activo: n.activo,
        aprobadores: n.aprobadores,
      })),
      delegaciones: delegaciones.map((d) => ({
        titularId: d.titularId,
        suplenteId: d.suplenteId,
        modulo: d.modulo,
        vigenciaDesde: d.vigenciaDesde.toISOString(),
        vigenciaHasta: d.vigenciaHasta?.toISOString() ?? null,
        motivo: d.motivo,
        activo: d.activo,
      })),
      adminConcepto: admins.map((a) => ({
        usuarioId: a.usuarioId,
        modulo: a.modulo,
        activo: a.activo,
      })),
    };
  }

  private async loadDestinoUsuarios(user: JwtPayload, empresaId: string) {
    const rows = await this.prisma.usuario.findMany({
      where: {
        activo: true,
        OR: [
          { empresaId },
          { empresasAcceso: { some: { empresaId } } },
        ],
      },
      select: { id: true, email: true, nombre: true },
    });
    const destById = new Map(rows.map((u) => [u.id, u]));
    const destByEmail = new Map(
      rows.filter((u) => u.email).map((u) => [u.email.trim().toLowerCase(), u]),
    );
    return { destById, destByEmail, usuarios: rows };
  }

  async previewAprobacionesConfig(
    user: JwtPayload,
    config: Record<string, unknown>,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    let backup;
    try {
      backup = parseAprobacionesBackup(config);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'JSON inválido');
    }
    const { destById, destByEmail, usuarios } = await this.loadDestinoUsuarios(user, empresaId);
    const { map, faltantes } = buildUserMap(backup, destById, destByEmail, {});
    const usos = collectUsos(backup);
    const eslabones = faltantes.map((id) => {
      const cat = catalogUsuario(backup, id);
      return {
        usuarioId: id,
        email: cat?.email ?? null,
        nombre: cat?.nombre ?? id,
        usos: usos.get(id) ?? [],
      };
    });
    const autoMatched = [...map.entries()]
      .filter(([oldId, newId]) => Boolean(newId) && newId !== oldId)
      .map(([oldId, newId]) => {
        const dest = destById.get(newId!);
        const cat = catalogUsuario(backup, oldId);
        return {
          origenId: oldId,
          origenEmail: cat?.email ?? null,
          origenNombre: cat?.nombre ?? oldId,
          destinoId: newId,
          destinoNombre: dest?.nombre ?? newId,
          matchedBy: destById.has(oldId) ? 'id' : 'email',
        };
      });

    const modulos = modulosEnBackup(backup);
    const pendientes: Record<string, number> = {};
    for (const m of modulos) {
      pendientes[m] = await this.countPendientesModulo(empresaId, m);
    }
    const empresaDestino = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true, razonSocial: true },
    });

    return {
      ok: eslabones.length === 0 && Object.values(pendientes).every((n) => n === 0),
      version: backup.version,
      empresaOrigenId: backup.empresaId,
      empresaOrigenNombre: backup.empresaNombre,
      empresaDestinoId: empresaId,
      empresaDestinoNombre: empresaDestino?.razonSocial ?? null,
      resumen: {
        grupos: backup.grupos.length,
        nodos: backup.nodos.length,
        delegaciones: backup.delegaciones.length,
        adminConcepto: backup.adminConcepto.length,
        usuariosCatalogo: backup.usuarios.length,
      },
      pendientes,
      autoMatched,
      eslabonesFaltantes: eslabones,
      usuariosDestino: usuarios.map((u) => ({ id: u.id, nombre: u.nombre, email: u.email })),
    };
  }

  async importAprobacionesConfig(
    user: JwtPayload,
    config: Record<string, unknown>,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    let backup;
    try {
      backup = parseAprobacionesBackup(config);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'JSON inválido');
    }

    const resolucionesRaw = asRecord(config.resoluciones) ?? {};
    const resoluciones: Record<string, ResolucionUsuario> = {};
    for (const [oldId, val] of Object.entries(resolucionesRaw)) {
      const r = asRecord(val);
      const accion = r?.accion === 'eliminar' ? 'eliminar' : r?.accion === 'reemplazar' ? 'reemplazar' : null;
      if (!accion) continue;
      resoluciones[oldId] = {
        accion,
        nuevoUsuarioId: typeof r?.nuevoUsuarioId === 'string' ? r.nuevoUsuarioId : null,
      };
    }

    const { destById, destByEmail } = await this.loadDestinoUsuarios(user, empresaId);
    const { map, faltantes } = buildUserMap(backup, destById, destByEmail, resoluciones);
    if (faltantes.length) {
      throw new BadRequestException({
        code: 'USUARIOS_FALTANTES',
        message: `Faltan ${faltantes.length} usuario(s) del respaldo. Indique reemplazo o eliminación de cada eslabón.`,
        faltantes,
      });
    }

    const applied = applyBackupResolutions(backup, map);
    const modulos = [...new Set([
      ...applied.grupos.map((g) => g.modulo),
      ...applied.nodos.map((n) => n.modulo),
      ...applied.adminConcepto.map((a) => a.modulo),
    ])];
    if (!modulos.length) {
      throw new BadRequestException('El respaldo no tiene grupos ni escalas aplicables tras las resoluciones');
    }
    for (const m of modulos) {
      await assertModuloAprobacionesWriteLive(this.prisma, user, m, empresaId);
    }

    const pendientes: string[] = [];
    for (const m of modulos) {
      const n = await this.countPendientesModulo(empresaId, m);
      if (n > 0) pendientes.push(`${m} (${n})`);
    }
    if (pendientes.length) {
      throw new ConflictException({
        code: 'MODULO_CON_PENDIENTES',
        message: `Hay pendientes en: ${pendientes.join(', ')}. Reasigne antes de importar.`,
      });
    }

    const aprobadores = [
      ...applied.grupos.map((g) => g.aprobadorInicialId),
      ...applied.nodos.flatMap((n) => [n.usuarioId, n.escalaAUsuarioId, ...n.aprobadores.map((a) => a.usuarioId)]),
    ].filter((id): id is string => Boolean(id));
    for (const m of modulos) {
      await this.assertAprobadoresBandeja(m, aprobadores, 'write', empresaId);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      for (const m of modulos) {
        await tx.nodoEscalaAprobacion.updateMany({
          where: { empresaId, modulo: { equals: m, mode: 'insensitive' } },
          data: { escalaAId: null },
        });
        await tx.nodoEscalaAprobacion.deleteMany({
          where: { empresaId, modulo: { equals: m, mode: 'insensitive' } },
        });
        await tx.grupoAprobacion.deleteMany({
          where: { empresaId, modulo: { equals: m, mode: 'insensitive' } },
        });
        await tx.adminConcepto.deleteMany({
          where: { empresaId, modulo: { equals: m, mode: 'insensitive' } },
        });
        await tx.delegacionAprobacion.deleteMany({
          where: {
            empresaId,
            OR: [
              { modulo: { equals: m, mode: 'insensitive' } },
              ...(m === modulos[0] ? [{ modulo: null }] : []),
            ],
          },
        });
      }

      const grupoIdMap = new Map<string, string>();
      for (const g of applied.grupos) {
        const created = await tx.grupoAprobacion.create({
          data: {
            empresaId,
            modulo: g.modulo,
            nombre: g.nombre,
            aprobadorInicialId: g.aprobadorInicialId,
            activo: g.activo,
            miembros: g.miembroIds.length
              ? { create: g.miembroIds.map((usuarioId) => ({ usuarioId })) }
              : undefined,
          },
        });
        grupoIdMap.set(g.id, created.id);
      }

      const nodoIdMap = new Map<string, string>();
      const nodoUserSeen = new Set<string>();
      for (const n of applied.nodos) {
        const grupoId = grupoIdMap.get(n.grupoId);
        if (!grupoId) continue;
        const key = `${grupoId}:${n.usuarioId}`;
        if (nodoUserSeen.has(key)) continue;
        nodoUserSeen.add(key);
        const extras = n.aprobadores.map((a) => a.usuarioId).filter((id) => id !== n.usuarioId);
        const created = await tx.nodoEscalaAprobacion.create({
          data: {
            empresaId,
            grupoId,
            modulo: n.modulo,
            usuarioId: n.usuarioId,
            logica: n.logica || 'SIMPLE',
            montoMax: n.montoMax,
            escalaAUsuarioId: n.escalaAUsuarioId,
            activo: n.activo,
          },
        });
        await this.syncNodoAprobadores(tx, created.id, n.usuarioId, n.logica || 'SIMPLE', extras);
        nodoIdMap.set(n.id, created.id);
      }

      for (const n of applied.nodos) {
        const newId = nodoIdMap.get(n.id);
        if (!newId || !n.escalaAUsuarioId) continue;
        await this.linkEscalaAId(tx, newId, n.escalaAUsuarioId, grupoIdMap.get(n.grupoId) ?? '', empresaId, n.modulo);
      }

      let delegaciones = 0;
      for (const d of applied.delegaciones) {
        await tx.delegacionAprobacion.create({
          data: {
            empresaId,
            titularId: d.titularId,
            suplenteId: d.suplenteId,
            modulo: d.modulo,
            vigenciaDesde: new Date(d.vigenciaDesde),
            vigenciaHasta: d.vigenciaHasta ? new Date(d.vigenciaHasta) : null,
            motivo: d.motivo,
            activo: d.activo,
          },
        });
        delegaciones += 1;
      }

      let admins = 0;
      for (const a of applied.adminConcepto) {
        await tx.adminConcepto.create({
          data: {
            empresaId,
            usuarioId: a.usuarioId,
            modulo: a.modulo,
            activo: a.activo,
          },
        });
        admins += 1;
      }

      return {
        grupos: grupoIdMap.size,
        nodos: nodoIdMap.size,
        delegaciones,
        adminConcepto: admins,
      };
    });

    return {
      ok: true,
      mensaje: `Respaldo aplicado a la empresa: ${result.grupos} grupos, ${result.nodos} nodos, ${result.delegaciones} suplencias, ${result.adminConcepto} admin(s).`,
      ...result,
    };
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

