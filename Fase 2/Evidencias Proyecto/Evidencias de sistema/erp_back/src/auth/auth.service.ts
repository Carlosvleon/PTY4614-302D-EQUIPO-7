import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './jwt.strategy';
import { usuarioPuedeUsarPinAprobacion } from './pin-aprobacion';
import {
  computeBandejaModulos,
  type PermisoPantallaRow,
} from './bandeja-aprobacion.util';
import { effectiveRolPermisos } from './permisos-from-pantallas.util';
import { isAdminRolId, isSuperAdmin, sessionEmpresaIds } from './tenant.util';

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hora
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

type UsuarioConRol = {
  id: string;
  nombre: string;
  email: string;
  rolId: string;
  empresaId: string;
  rolVigenciaDesde?: Date | null;
  rolVigenciaHasta?: Date | null;
  pinAprobacionHash?: string | null;
  claveReversaHash?: string | null;
  rol: { nombre: string; permisos: string[]; permisosPantalla?: unknown; aprobarConPin?: boolean };
  empresa: { razonSocial: string };
  empresasAcceso?: { empresaId: string }[];
};

/** Quién puede fijar su clave de login: ROL-1 o permiso `*`. El PIN no entra aquí. */
function cuentaPuedeCambiarClave(usuario: {
  rolId: string;
  rol?: { permisos?: string[] | null } | null;
}): boolean {
  return isSuperAdmin({
    rolId: usuario.rolId,
    permisos: usuario.rol?.permisos ?? [],
  });
}

/** Rol temporal: fuera del rango [desde, hasta] no puede iniciar/mantener sesión. */
function assertRolVigente(usuario: {
  rolVigenciaDesde?: Date | null;
  rolVigenciaHasta?: Date | null;
}) {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (usuario.rolVigenciaDesde) {
    const desde = new Date(usuario.rolVigenciaDesde);
    desde.setHours(0, 0, 0, 0);
    if (day < desde) {
      throw new UnauthorizedException(
        'Tu rol aún no está vigente. Contacta al administrador.',
      );
    }
  }
  if (usuario.rolVigenciaHasta) {
    const hasta = new Date(usuario.rolVigenciaHasta);
    hasta.setHours(23, 59, 59, 999);
    if (now > hasta) {
      throw new UnauthorizedException(
        'Tu rol temporal expiró. Contacta al administrador.',
      );
    }
  }
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        rol: true,
        empresa: true,
        empresasAcceso: { select: { empresaId: true } },
      },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const valid = await bcrypt.compare(password, usuario.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    assertRolVigente(usuario);

    const tokens = await this.issueTokens(usuario);

    return {
      ...tokens,
      user: await this.toSessionUser(usuario),
    };
  }

  /** Config pública para el botón Microsoft (SPA MSAL). */
  getMicrosoftAuthConfig() {
    const enabled = this.isMicrosoftAuthEnabled();
    const tenantId = this.config.get<string>('MICROSOFT_TENANT_ID')?.trim() || '';
    const clientId = this.config.get<string>('MICROSOFT_CLIENT_ID')?.trim() || '';
    return {
      enabled: enabled && Boolean(tenantId && clientId),
      tenantId: enabled ? tenantId : '',
      clientId: enabled ? clientId : '',
      authority: tenantId
        ? `https://login.microsoftonline.com/${tenantId}`
        : '',
    };
  }

  /**
   * Login dual vía Microsoft Entra ID.
   * Valida id_token, vincula Usuario por oid/email y emite JWT ERP.
   */
  async loginWithMicrosoft(idToken: string) {
    if (!this.isMicrosoftAuthEnabled()) {
      throw new UnauthorizedException(
        'Inicio de sesión con Microsoft no está habilitado en este ambiente.',
      );
    }
    const tenantId = this.config.get<string>('MICROSOFT_TENANT_ID')?.trim();
    const clientId = this.config.get<string>('MICROSOFT_CLIENT_ID')?.trim();
    if (!tenantId || !clientId) {
      throw new UnauthorizedException(
        'Falta configuración MICROSOFT_TENANT_ID / MICROSOFT_CLIENT_ID.',
      );
    }

    const { verifyMicrosoftIdToken, emailFromMicrosoftClaims } = await import(
      './microsoft-token'
    );
    const claims = await verifyMicrosoftIdToken(idToken, {
      tenantId,
      clientId,
      issuer: this.config.get<string>('MICROSOFT_ISSUER')?.trim() || undefined,
    });
    const email = emailFromMicrosoftClaims(claims);
    const oid = typeof claims.oid === 'string' ? claims.oid : null;
    if (!email && !oid) {
      throw new UnauthorizedException(
        'La cuenta Microsoft no entregó email/UPN. Revisa permisos openid/profile/email.',
      );
    }

    let usuario = oid
      ? await this.prisma.usuario.findUnique({
          where: { microsoftOid: oid },
          include: {
            rol: true,
            empresa: true,
            empresasAcceso: { select: { empresaId: true } },
          },
        })
      : null;

    if (!usuario && email) {
      usuario = await this.prisma.usuario.findUnique({
        where: { email },
        include: {
          rol: true,
          empresa: true,
          empresasAcceso: { select: { empresaId: true } },
        },
      });
    }

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException(
        'No hay un usuario ERP activo vinculado a esta cuenta Microsoft. '
          + 'Pide al administrador que cree el usuario con el mismo email.',
      );
    }

    assertRolVigente(usuario);

    if (oid && usuario.microsoftOid !== oid) {
      await this.prisma.usuario.update({
        where: { id: usuario.id },
        data: { microsoftOid: oid, microsoftLinkedAt: new Date() },
      });
      usuario = { ...usuario, microsoftOid: oid, microsoftLinkedAt: new Date() };
    }

    const tokens = await this.issueTokens(usuario);
    return {
      ...tokens,
      user: await this.toSessionUser(usuario),
    };
  }

  private isMicrosoftAuthEnabled(): boolean {
    const raw = (this.config.get<string>('MICROSOFT_AUTH_ENABLED') ?? 'false')
      .trim()
      .toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken.trim());
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        usuario: {
          include: {
            rol: true,
            empresa: true,
            empresasAcceso: { select: { empresaId: true } },
          },
        },
      },
    });

    if (
      !record ||
      record.revokedAt ||
      record.expiresAt < new Date() ||
      !record.usuario.activo
    ) {
      throw new UnauthorizedException('Sesión expirada, inicia sesión nuevamente');
    }

    assertRolVigente(record.usuario);

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(record.usuario);
  }

  async getProfile(userId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: userId },
      include: {
        rol: true,
        empresa: true,
        empresasAcceso: { select: { empresaId: true } },
      },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Sesión inválida');
    }

    assertRolVigente(usuario);

    return await this.toSessionUser(usuario);
  }

  async updateProfile(userId: string, nombre: string) {
    const usuario = await this.prisma.usuario.update({
      where: { id: userId },
      data: { nombre: nombre.trim() },
      include: {
        rol: true,
        empresa: true,
        empresasAcceso: { select: { empresaId: true } },
      },
    });

    if (!usuario.activo) {
      throw new UnauthorizedException('Sesión inválida');
    }

    return await this.toSessionUser(usuario);
  }

  async changePassword(actor: JwtPayload, password: string) {
    if (!isSuperAdmin(actor)) {
      throw new ForbiddenException('Solo el administrador puede cambiar contraseñas');
    }

    const userId = actor.sub;
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: userId },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Sesión inválida');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    console.log(`[auth] password changed userId=${userId}`);
    return { message: 'Contraseña actualizada correctamente' };
  }

  async setClaveReversa(userId: string, clave: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Sesión inválida');
    }
    const claveReversaHash = await bcrypt.hash(clave.trim(), 10);
    await this.prisma.usuario.update({
      where: { id: userId },
      data: { claveReversaHash },
    });
    return { message: 'Clave de reversa actualizada', tieneClaveReversa: true };
  }

  async verifyClaveReversa(userId: string, clave: string): Promise<boolean> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: { activo: true, claveReversaHash: true },
    });
    if (!usuario?.activo || !usuario.claveReversaHash) {
      throw new BadRequestException(
        'Debes registrar tu clave de reversa en Mi Perfil antes de usar esta acción',
      );
    }
    return bcrypt.compare(clave.trim(), usuario.claveReversaHash);
  }

  async setPinAprobacion(userId: string, pin: string, password: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: userId },
    });
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Sesión inválida');
    }
    const puedePin = await usuarioPuedeUsarPinAprobacion(this.prisma, userId);
    if (!puedePin) {
      throw new BadRequestException(
        'Solo los usuarios designados como aprobadores (Admin › Aprobaciones) o el Administrador pueden configurar PIN.',
      );
    }
    const pwdOk = await bcrypt.compare(password ?? '', usuario.passwordHash);
    if (!pwdOk) {
      throw new UnauthorizedException('Contraseña de cuenta incorrecta');
    }
    const raw = pin.trim();
    if (!/^\d{4}$/.test(raw)) {
      throw new BadRequestException('El PIN debe ser exactamente 4 dígitos numéricos');
    }
    const pinAprobacionHash = await bcrypt.hash(raw, 10);
    await this.prisma.usuario.update({
      where: { id: userId },
      data: { pinAprobacionHash },
    });
    return {
      message: 'PIN de aprobación actualizado',
      tienePinAprobacion: true,
      /** Compat UI: habilitado para configurar/usar PIN (pool o Admin). */
      aprobarConPin: true,
    };
  }

  async logout(userId: string, email: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    console.log(`[auth] logout userId=${userId} email=${email}`);
    return { message: 'Sesión cerrada' };
  }

  async recoverPassword(email: string) {
    const normalized = email.toLowerCase().trim();
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: normalized },
      include: { rol: { select: { permisos: true } } },
    });

    const message =
      'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.';

    if (!usuario || !usuario.activo || !cuentaPuedeCambiarClave(usuario)) {
      return { message };
    }

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(plainToken);
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: usuario.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: { tokenHash, userId: usuario.id, expiresAt },
      }),
    ]);

    const resetUrl = this.buildResetUrl(plainToken);

    // P0-5: nunca loguear el link/token en texto plano. El modo dev-return-
    // link es opt-in explícito (env var) y solo debe usarse en QA/dev sin
    // envío de correo real todavía; en cualquier otro caso solo se registra
    // metadata no sensible (sin token).
    const devReturnLink =
      this.config.get<string>('PASSWORD_RESET_DEV_RETURN_LINK') === 'true';
    if (devReturnLink) {
      console.log(`[auth] (DEV) reset link generado para ${normalized} → ${resetUrl}`);
    } else {
      // TODO: integrar envío real de email (SMTP/proveedor transaccional).
      console.log(
        `[auth] password reset token generado userId=${usuario.id} expira=${expiresAt.toISOString()}`,
      );
    }

    return devReturnLink ? { message, resetUrl } : { message };
  }

  async resetPassword(token: string, password: string) {
    const tokenHash = this.hashToken(token.trim());
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { usuario: { include: { rol: { select: { permisos: true } } } } },
    });

    if (
      !record ||
      record.usedAt ||
      record.expiresAt < new Date() ||
      !record.usuario.activo
    ) {
      throw new BadRequestException('El enlace de recuperación es inválido o expiró');
    }

    if (!cuentaPuedeCambiarClave(record.usuario)) {
      throw new ForbiddenException('Solo el administrador puede cambiar contraseñas');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    console.log(`[auth] password reset completed userId=${record.userId}`);
    return { message: 'Contraseña actualizada correctamente' };
  }

  private async issueTokens(usuario: UsuarioConRol) {
    const empresaIds = await this.resolveEmpresaIds(usuario);
    const adminRows = await this.prisma.adminConcepto.findMany({
      where: { usuarioId: usuario.id, activo: true, empresaId: { in: empresaIds } },
      select: { modulo: true },
    });
    const adminConceptoModulos = [...new Set(adminRows.map((r) => r.modulo))];
    const permisos = effectiveRolPermisos(
      usuario.rol.permisos,
      (usuario.rol.permisosPantalla ?? null) as PermisoPantallaRow[] | null,
    );
    const payload: JwtPayload = {
      sub: usuario.id,
      email: usuario.email,
      rolId: usuario.rolId,
      empresaId: usuario.empresaId,
      empresaIds,
      permisos,
      adminConceptoModulos,
    };

    const token = this.jwt.sign(payload);
    const plainRefresh = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(plainRefresh);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

    await this.prisma.refreshToken.create({
      data: { tokenHash, userId: usuario.id, expiresAt },
    });

    return { token, refreshToken: plainRefresh };
  }

  private hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private buildResetUrl(token: string) {
    const base = (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173').replace(
      /\/$/,
      '',
    );
    return `${base}/restablecer-contrasena?token=${token}`;
  }

  private async resolveEmpresaIds(usuario: UsuarioConRol): Promise<string[]> {
    const isMaster =
      isAdminRolId(usuario.rolId) || (usuario.rol.permisos ?? []).includes('*');
    const catalogoIds = isMaster
      ? (await this.prisma.empresa.findMany({ select: { id: true }, orderBy: { id: 'asc' } })).map(
          (row) => row.id,
        )
      : [];
    const ids = sessionEmpresaIds({
      rolId: usuario.rolId,
      permisos: usuario.rol.permisos ?? [],
      empresaId: usuario.empresaId,
      accesoIds: (usuario.empresasAcceso ?? []).map((e) => e.empresaId),
      catalogoIds,
    });
    if (isMaster) {
      for (const empresaId of ids) {
        await this.prisma.usuarioEmpresa.upsert({
          where: { usuarioId_empresaId: { usuarioId: usuario.id, empresaId } },
          update: {},
          create: { usuarioId: usuario.id, empresaId },
        });
      }
    }
    return ids;
  }

  private async toSessionUser(usuario: UsuarioConRol) {
    const empresaIds = await this.resolveEmpresaIds(usuario);
    const aprobarConPin = await usuarioPuedeUsarPinAprobacion(this.prisma, usuario.id);
    const adminRows = await this.prisma.adminConcepto.findMany({
      where: { usuarioId: usuario.id, activo: true, empresaId: { in: empresaIds } },
      select: { modulo: true },
    });
    const adminConceptoModulos = [...new Set(adminRows.map((r) => r.modulo))];
    const permisosPantalla = (usuario.rol.permisosPantalla ?? null) as PermisoPantallaRow[] | null;
    const permisos = effectiveRolPermisos(usuario.rol.permisos, permisosPantalla);
    const bandejaModulos = await computeBandejaModulos(
      this.prisma,
      usuario.id,
      usuario.rolId,
      permisos,
      permisosPantalla,
      empresaIds,
    );
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol.nombre,
      rolId: usuario.rolId,
      empresa: usuario.empresa.razonSocial,
      empresaId: usuario.empresaId,
      empresaIds,
      permisos,
      permisosPantalla: permisosPantalla ?? undefined,
      adminConceptoModulos,
      bandejaModulos,
      tieneClaveReversa: Boolean(usuario.claveReversaHash),
      /** True si es Admin master o está en pool de Workflow (no el flag del rol). */
      aprobarConPin,
      tienePinAprobacion: Boolean(usuario.pinAprobacionHash),
    };
  }
}
