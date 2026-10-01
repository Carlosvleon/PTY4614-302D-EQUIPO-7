import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LinkLaborActividadDto,
  UpsertActividadDto,
  UpsertContratistaDto,
  UpsertLaborDto,
  UpsertProformaDto,
  AsociarFacturaProformaDto,
  ReversarProformaDto,
  ReemitirProformaDto,
  UpsertTarifaDto,
  PatchTarifaInlineDto,
  UpsertIngresoLaborDiarioDto,
  AsociarIngresosProformaDto,
  TraspasoCierreDto,
  ReabrirCierreContratistaDto,
  UpsertTipoContratoContratistaDto,
  SolicitarAprobacionProformaDto,
  AprobarIngresoLaborDto,
} from './dto/contratistas.dto';
import type { JwtPayload } from '../../auth/jwt.strategy';
import {
  assertTenantAccess,
  resolveOperationalEmpresa,
  resolveTenant,
  tenantEmpresaId,
} from '../../auth/tenant.util';
import { assertClaveReversa } from '../../auth/clave-reversa';
import { userHasPermission } from '../../auth/permission.util';
import {
  ContabilizarService,
  type LineaAsientoInput,
} from '../contabilidad/contabilizar.service';
import { dimensionesDeConfigSii } from '../contabilidad/config-sii-dimensiones.util';
import { NotificacionesService } from '../dashboard/notificaciones.service';
import { CuentaCorrienteService } from '../tesoreria/cuenta-corriente.service';
import { upsertAgingDesdeCompra } from '../tesoreria/aging-sync.util';
import { ComprasService } from '../compras/compras.service';
import {
  assertPeriodoContratista,
  limitesPeriodo,
  periodoDesdeFecha,
} from './contratistas-periodo.util';

function parseDate(value?: string | null): Date | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const d = iso
    ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`Fecha inválida: ${value}`);
  }
  return d;
}

function auditJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value == null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizeRut(value: string): string {
  return value.replace(/[.\s-]/g, '').toUpperCase();
}

function mapTarifa(row: {
  id: string;
  contratistaId: string;
  laborId: string;
  actividadId: string;
  tipoContratoId: string | null;
  tarifa: Prisma.Decimal;
  unidad: string;
  centroCostoId: string;
  empresaId: string;
  vigenciaDesde: Date;
  vigenciaHasta: Date | null;
  contratista: { razonSocial: string };
  centroCosto: { nombre: string; codigo: string };
  laborRef: { nombre: string; codigo: string };
  actividadRef: { nombre: string; codigo: string };
  tipoContrato?: { nombre: string; codigo: string } | null;
}) {
  return {
    id: row.id,
    contratistaId: row.contratistaId,
    contratista: row.contratista.razonSocial,
    laborId: row.laborId,
    labor: row.laborRef.nombre,
    actividadId: row.actividadId,
    actividad: row.actividadRef.nombre,
    tipoContratoId: row.tipoContratoId,
    tipoContrato: row.tipoContrato?.nombre,
    tipoContratoCodigo: row.tipoContrato?.codigo,
    tarifa: Number(row.tarifa),
    unidad: row.unidad,
    centroCostoId: row.centroCostoId,
    centroCosto: row.centroCosto.nombre,
    centroCostoCodigo: row.centroCosto.codigo,
    empresaId: row.empresaId,
    vigenciaDesde: row.vigenciaDesde.toISOString().slice(0, 10),
    vigenciaHasta: row.vigenciaHasta
      ? row.vigenciaHasta.toISOString().slice(0, 10)
      : undefined,
  };
}

const tarifaInclude = {
  contratista: { select: { razonSocial: true } },
  centroCosto: { select: { nombre: true, codigo: true } },
  laborRef: { select: { nombre: true, codigo: true } },
  actividadRef: { select: { nombre: true, codigo: true } },
  tipoContrato: { select: { nombre: true, codigo: true } },
} as const;

const proformaInclude = {
  contratista: { select: { razonSocial: true } },
  factura: { select: { numero: true, fecha: true, montoNeto: true, proformasGrupoIds: true } },
  registroCompra: {
    select: {
      id: true,
      factura: true,
      fechaDocumento: true,
      monto: true,
      moneda: true,
      proformasContratista: { select: { id: true } },
    },
  },
  ordenCompra: {
    select: {
      id: true,
      numero: true,
      estado: true,
      proformasContratista: { select: { id: true } },
    },
  },
  tipoContrato: { select: { nombre: true, codigo: true } },
} as const;

function mapProforma(row: {
  id: string;
  numero: string;
  contratistaId: string;
  empresaId: string;
  periodo: string;
  montoNeto: Prisma.Decimal;
  moneda: string;
  estado: 'BORRADOR' | 'PENDIENTE_APROBACION' | 'DEFINITIVA' | 'FACTURADA' | 'RECHAZADA';
  aprobadorId?: string | null;
  aprobadorNombre?: string | null;
  aprobacionCadenaIds?: string[];
  aprobacionPasoActual?: number;
  aprobacionPasosTotal?: number;
  aprobadoPorId?: string | null;
  aprobadoPorNombre?: string | null;
  aprobadaAt?: Date | null;
  creadoPorId?: string | null;
  creadoPorNombre?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  facturaNumeroRef?: string | null;
  registroCompraId?: string | null;
  ordenCompraId?: string | null;
  tipoContratoId?: string | null;
  tipoContrato?: { nombre: string; codigo: string } | null;
  contratista: { razonSocial: string };
  factura: {
    numero: string;
    fecha: Date;
    montoNeto: Prisma.Decimal;
    proformasGrupoIds?: string[];
  } | null;
  registroCompra?: {
    id: string;
    factura: string;
    fechaDocumento: Date | null;
    monto: Prisma.Decimal;
    moneda: string;
    proformasContratista?: { id: string }[];
  } | null;
  ordenCompra?: {
    id: string;
    numero: string;
    estado: string;
    proformasContratista?: { id: string }[];
  } | null;
}) {
  const facturaNumero =
    row.registroCompra?.factura
    ?? row.factura?.numero
    ?? row.facturaNumeroRef
    ?? undefined;
  const ordenCompraNumero = row.ordenCompra?.numero;
  return {
    id: row.id,
    numero: row.numero,
    contratistaId: row.contratistaId,
    contratista: row.contratista.razonSocial,
    tipoContratoId: row.tipoContratoId ?? undefined,
    tipoContrato: row.tipoContrato?.nombre,
    tipoContratoCodigo: row.tipoContrato?.codigo,
    empresaId: row.empresaId,
    periodo: row.periodo,
    monto: Number(row.montoNeto),
    montoNeto: Number(row.montoNeto),
    moneda: row.moneda,
    estado: row.estado,
    /** A quien se solicitó (permanece). */
    aprobadorId: row.aprobadorId ?? undefined,
    aprobadorNombre: row.aprobadorNombre ?? undefined,
    aprobacionCadenaIds: row.aprobacionCadenaIds?.length
      ? row.aprobacionCadenaIds
      : undefined,
    aprobacionPasoActual: row.aprobacionPasoActual ?? undefined,
    aprobacionPasosTotal: row.aprobacionPasosTotal ?? undefined,
    /** Quien resolvió de hecho. */
    aprobadoPorId: row.aprobadoPorId ?? undefined,
    aprobadoPorNombre: row.aprobadoPorNombre ?? undefined,
    aprobadaAt: row.aprobadaAt?.toISOString() ?? undefined,
    creadoPorId: row.creadoPorId ?? undefined,
    creadoPorNombre: row.creadoPorNombre ?? undefined,
    /** Alias UI: quien pidió / creó la proforma. */
    solicitante: row.creadoPorNombre ?? undefined,
    createdAt: row.createdAt?.toISOString() ?? undefined,
    updatedAt: row.updatedAt?.toISOString() ?? undefined,
    facturaAsociada: facturaNumero ?? ordenCompraNumero,
    registroCompraId: row.registroCompraId ?? undefined,
    ordenCompraId: row.ordenCompraId ?? undefined,
    ordenCompraNumero,
    facturaFecha:
      row.registroCompra?.fechaDocumento?.toISOString().slice(0, 10)
      ?? row.factura?.fecha.toISOString().slice(0, 10),
    proformasGrupoIds: row.factura?.proformasGrupoIds?.length
      ? row.factura.proformasGrupoIds
      : row.registroCompra?.proformasContratista?.map((p) => p.id)
        ?? row.ordenCompra?.proformasContratista?.map((p) => p.id),
  };
}

const ingresoInclude = {
  contratista: { select: { razonSocial: true } },
  centroCosto: { select: { nombre: true } },
  labor: { select: { nombre: true } },
  actividad: { select: { nombre: true } },
  proforma: { select: { numero: true, estado: true, facturaNumeroRef: true, factura: { select: { numero: true } } } },
} as const;

function mapIngreso(row: {
  id: string;
  fecha: Date;
  contratistaId: string;
  centroCostoId: string;
  laborId: string;
  actividadId: string;
  tipoJornada: 'JORNADA' | 'TRATO';
  cantidad: Prisma.Decimal;
  precioUnitario: Prisma.Decimal;
  monto: Prisma.Decimal;
  estado: 'PENDIENTE' | 'PENDIENTE_APROBACION' | 'ASOCIADO' | 'FACTURADO';
  proformaId: string | null;
  facturaNumero: string | null;
  tarifaId?: string | null;
  tarifaAplicada?: Prisma.Decimal | null;
  unidad?: string | null;
  precioOverride?: boolean;
  motivoOverride?: string | null;
  tipoContratoId?: string | null;
  contratista: { razonSocial: string };
  centroCosto: { nombre: string };
  labor: { nombre: string };
  actividad: { nombre: string };
  proforma: {
    numero: string;
    estado: string;
    facturaNumeroRef: string | null;
    factura: { numero: string } | null;
  } | null;
}) {
  const facturaNumero =
    row.facturaNumero ??
    row.proforma?.factura?.numero ??
    row.proforma?.facturaNumeroRef ??
    undefined;
  return {
    id: row.id,
    fecha: row.fecha.toISOString().slice(0, 10),
    contratistaId: row.contratistaId,
    contratista: row.contratista.razonSocial,
    centroCostoId: row.centroCostoId,
    centroCosto: row.centroCosto.nombre,
    laborId: row.laborId,
    labor: row.labor.nombre,
    actividadId: row.actividadId,
    actividad: row.actividad.nombre,
    tipoJornada: row.tipoJornada,
    cantidad: Number(row.cantidad),
    precioUnitario: Number(row.precioUnitario),
    tarifaId: row.tarifaId ?? undefined,
    tarifaAplicada: Number(row.tarifaAplicada ?? row.precioUnitario),
    unidad: row.unidad || undefined,
    precioOverride: row.precioOverride ?? false,
    motivoOverride: row.motivoOverride ?? undefined,
    tipoContratoId: row.tipoContratoId ?? undefined,
    monto: Number(row.monto),
    estado: row.estado,
    proformaId: row.proformaId ?? undefined,
    facturaNumero,
  };
}

@Injectable()
export class ContratistasService {
  constructor(
    private prisma: PrismaService,
    @Optional() private contabilizar?: ContabilizarService,
    @Optional() private notificaciones?: NotificacionesService,
    @Optional() private cuentaCorriente?: CuentaCorrienteService,
    @Optional() private compras?: ComprasService,
  ) {}

  private activeEmpresa(
    user: JwtPayload,
    header?: string,
    query?: string,
  ): string {
    return resolveOperationalEmpresa(user, header || query);
  }

  private async assertPeriodoOperable(empresaId: string, periodoRaw: string) {
    const periodo = assertPeriodoContratista(periodoRaw);
    const cierre = await this.prisma.periodoCierreContratista.findUnique({
      where: { empresaId_periodo: { empresaId, periodo } },
    });
    if (cierre?.cerrado) {
      throw new ConflictException(`El período de Contratistas ${periodo} está cerrado`);
    }
    const contable = await this.prisma.periodoContable.findUnique({
      where: { empresaId_codigo: { empresaId, codigo: periodo } },
    });
    if (contable?.estado === 'CERRADO') {
      throw new ConflictException(
        `El período contable ${periodo} está cerrado; Contratistas no puede operar ni traspasar`,
      );
    }
    return periodo;
  }

  private async assertFechaOperable(empresaId: string, fecha: Date) {
    return this.assertPeriodoOperable(empresaId, periodoDesdeFecha(fecha));
  }

  private async registrarAuditoria(
    user: JwtPayload,
    input: {
      empresaId: string;
      entidad: string;
      entidadId: string;
      accion: string;
      antes?: unknown;
      despues?: unknown;
      metadata?: unknown;
    },
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const actor = await db.usuario.findUnique({
      where: { id: user.sub },
      select: { nombre: true },
    });
    await db.auditoriaContratista.create({
      data: {
        empresaId: input.empresaId,
        entidad: input.entidad,
        entidadId: input.entidadId,
        accion: input.accion,
        usuarioId: user.sub,
        usuarioNombre: actor?.nombre ?? user.email,
        antes: auditJson(input.antes),
        despues: auditJson(input.despues),
        metadata: auditJson(input.metadata),
      },
    });
  }

  private async resolveCuentasTraspaso(
    empresaId: string,
    tipoContratoId: string,
  ) {
    const tipo = await this.prisma.tipoContratoContratista.findFirst({
      where: { id: tipoContratoId, empresaId, activa: true },
      include: {
        cuentaDebe: true,
        cuentaHaber: true,
        cuentaAdministracion: true,
      },
    });
    if (!tipo) {
      throw new BadRequestException('Tipo de contrato no configurado o inactivo');
    }
    const cuentas = [
      tipo.cuentaDebe,
      tipo.cuentaHaber,
      tipo.cuentaAdministracion,
    ];
    if (cuentas.some((c) => !c.activa || c.noImputable)) {
      throw new BadRequestException(
        `El tipo ${tipo.nombre} tiene cuentas inactivas o no imputables`,
      );
    }
    return tipo;
  }

  getLabores(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
    incluirInactivas = false,
  ) {
    const empresaId = this.activeEmpresa(user, empresaHeader, empresaQuery);
    return this.prisma.labor.findMany({
      where: {
        empresaId,
        ...(incluirInactivas ? {} : { activa: true }),
      },
      orderBy: [{ activa: 'desc' }, { nombre: 'asc' }],
    });
  }

  async createLabor(
    user: JwtPayload,
    dto: UpsertLaborDto,
    empresaHeader?: string,
  ) {
    const scope = resolveTenant(user);
    const empresaId = tenantEmpresaId(
      scope,
      dto.empresaId ?? empresaHeader ?? user.empresaId,
    );
    const count = await this.prisma.labor.count({ where: { empresaId } });
    try {
      return await this.prisma.labor.create({
        data: {
          id: `LAB-${empresaId}-${count + 1}`,
          codigo: dto.codigo.trim().toUpperCase(),
          nombre: dto.nombre.trim(),
          activa: dto.activa ?? true,
          empresaId,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una labor con ese código');
      }
      throw e;
    }
  }

  async updateLabor(user: JwtPayload, id: string, dto: UpsertLaborDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.labor.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Labor no encontrada');
    assertTenantAccess(scope, existing.empresaId);
    try {
      return await this.prisma.labor.update({
        where: { id },
        data: {
          codigo: dto.codigo.trim().toUpperCase(),
          nombre: dto.nombre.trim(),
          activa: dto.activa ?? existing.activa,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una labor con ese código');
      }
      throw e;
    }
  }

  getActividades(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
    laborId?: string,
    incluirInactivas = false,
  ) {
    const empresaId = this.activeEmpresa(user, empresaHeader, empresaQuery);
    if (laborId) {
      return this.prisma.actividad.findMany({
        where: {
          empresaId,
          labores: { some: { laborId } },
          ...(incluirInactivas ? {} : { activa: true }),
        },
        orderBy: [{ activa: 'desc' }, { nombre: 'asc' }],
      });
    }
    return this.prisma.actividad.findMany({
      where: { empresaId },
      orderBy: [{ activa: 'desc' }, { nombre: 'asc' }],
    });
  }

  async createActividad(
    user: JwtPayload,
    dto: UpsertActividadDto,
    empresaHeader?: string,
  ) {
    const scope = resolveTenant(user);
    const empresaId = tenantEmpresaId(
      scope,
      dto.empresaId ?? empresaHeader ?? user.empresaId,
    );
    const count = await this.prisma.actividad.count({ where: { empresaId } });
    try {
      return await this.prisma.actividad.create({
        data: {
          id: `ACT-${empresaId}-${count + 1}`,
          codigo: dto.codigo.trim().toUpperCase(),
          nombre: dto.nombre.trim(),
          activa: dto.activa ?? true,
          empresaId,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una actividad con ese código');
      }
      throw e;
    }
  }

  async updateActividad(user: JwtPayload, id: string, dto: UpsertActividadDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.actividad.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Actividad no encontrada');
    assertTenantAccess(scope, existing.empresaId);
    try {
      return await this.prisma.actividad.update({
        where: { id },
        data: {
          codigo: dto.codigo.trim().toUpperCase(),
          nombre: dto.nombre.trim(),
          activa: dto.activa ?? existing.activa,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una actividad con ese código');
      }
      throw e;
    }
  }

  async linkLaborActividad(user: JwtPayload, dto: LinkLaborActividadDto) {
    const scope = resolveTenant(user);
    const labor = await this.prisma.labor.findUnique({ where: { id: dto.laborId } });
    const actividad = await this.prisma.actividad.findUnique({
      where: { id: dto.actividadId },
    });
    if (!labor || !actividad) {
      throw new NotFoundException('Labor o actividad no encontrada');
    }
    assertTenantAccess(scope, labor.empresaId);
    if (labor.empresaId !== actividad.empresaId) {
      throw new BadRequestException('Labor y actividad deben ser de la misma empresa');
    }
    return this.prisma.laborActividad.upsert({
      where: {
        laborId_actividadId: { laborId: labor.id, actividadId: actividad.id },
      },
      update: {},
      create: { laborId: labor.id, actividadId: actividad.id },
    });
  }

  async unlinkLaborActividad(user: JwtPayload, dto: LinkLaborActividadDto) {
    const scope = resolveTenant(user);
    const labor = await this.prisma.labor.findUnique({ where: { id: dto.laborId } });
    const actividad = await this.prisma.actividad.findUnique({
      where: { id: dto.actividadId },
    });
    if (!labor || !actividad) {
      throw new NotFoundException('Labor o actividad no encontrada');
    }
    assertTenantAccess(scope, labor.empresaId);
    if (labor.empresaId !== actividad.empresaId) {
      throw new BadRequestException('Labor y actividad deben ser de la misma empresa');
    }
    const usada = await this.prisma.tarifaContratista.count({
      where: { laborId: labor.id, actividadId: actividad.id },
    });
    if (usada > 0) {
      throw new ConflictException('La asociación está usada por tarifas y no puede eliminarse');
    }
    await this.prisma.laborActividad.deleteMany({
      where: { laborId: labor.id, actividadId: actividad.id },
    });
    return { ok: true };
  }

  async getContratistas(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    const empresaId = this.activeEmpresa(user, empresaHeader, empresaQuery);
    const [rows, proveedores] = await Promise.all([
      this.prisma.contratista.findMany({
        where: { empresaId },
        orderBy: { razonSocial: 'asc' },
      }),
      this.prisma.proveedor.findMany({
        where: { empresaId },
        select: { id: true, rut: true },
      }),
    ]);
    const proveedorPorRut = new Set(proveedores.map((row) => normalizeRut(row.rut)));
    const proveedorPorId = new Set(proveedores.map((row) => row.id));
    return rows.map((row) => ({
      ...row,
      esProveedor: proveedorPorId.has(row.proveedorId ?? '')
        || proveedorPorRut.has(normalizeRut(row.rut)),
    }));
  }

  async getContratistaVigenciaHistorial(
    user: JwtPayload,
    contratistaId: string,
    empresaHeader?: string,
  ) {
    const empresaId = this.activeEmpresa(user, empresaHeader);
    const ctr = await this.prisma.contratista.findUnique({ where: { id: contratistaId } });
    if (!ctr || ctr.empresaId !== empresaId) {
      throw new NotFoundException('Contratista no encontrado');
    }
    assertTenantAccess(resolveTenant(user), ctr.empresaId);
    const rows = await this.prisma.contratistaVigenciaHistorial.findMany({
      where: { contratistaId, empresaId },
      orderBy: { registradoAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      activo: r.activo,
      vigenciaHasta: r.vigenciaHasta?.toISOString().slice(0, 10) ?? null,
      registradoAt: r.registradoAt.toISOString(),
      usuarioNombre: r.usuarioNombre,
    }));
  }

  private async resolveProveedorContratista(
    empresaId: string,
    rut: string,
    proveedorId?: string,
  ) {
    if (proveedorId?.trim()) {
      const proveedor = await this.prisma.proveedor.findFirst({
        where: { id: proveedorId.trim(), empresaId, activo: true },
      });
      if (!proveedor) {
        throw new BadRequestException('Proveedor no encontrado o inactivo');
      }
      if (normalizeRut(proveedor.rut) !== normalizeRut(rut)) {
        throw new BadRequestException('El RUT del Proveedor no coincide con el Contratista');
      }
      return proveedor.id;
    }
    const proveedores = await this.prisma.proveedor.findMany({
      where: { empresaId, activo: true },
      select: { id: true, rut: true },
    });
    return (proveedores ?? []).find(
      (p) => normalizeRut(p.rut) === normalizeRut(rut),
    )?.id;
  }

  private async asegurarProveedorActivo(
    empresaId: string,
    contratista: {
      id: string;
      rut: string;
      proveedor: { id: string; activo: boolean; razonSocial: string } | null;
    },
  ) {
    if (contratista.proveedor?.activo) return contratista.proveedor;
    const proveedorId = await this.resolveProveedorContratista(empresaId, contratista.rut);
    if (!proveedorId) return null;
    await this.prisma.contratista.update({
      where: { id: contratista.id },
      data: { proveedorId },
    });
    return this.prisma.proveedor.findFirst({
      where: { id: proveedorId, empresaId, activo: true },
    });
  }

  async createContratista(
    user: JwtPayload,
    dto: UpsertContratistaDto,
    empresaHeader?: string,
  ) {
    const scope = resolveTenant(user);
    const empresaId = tenantEmpresaId(
      scope,
      dto.empresaId ?? empresaHeader ?? user.empresaId,
    );
    const count = await this.prisma.contratista.count({ where: { empresaId } });
    const activo = dto.activo ?? true;
    let vigenciaHasta = parseDate(dto.vigenciaHasta);
    if (!activo && !vigenciaHasta) vigenciaHasta = new Date();
    const proveedorId = await this.resolveProveedorContratista(
      empresaId,
      dto.rut,
      dto.proveedorId,
    );
    try {
      const row = await this.prisma.contratista.create({
        data: {
          id: `CTR-${empresaId}-${count + 1}`,
          rut: dto.rut.trim(),
          razonSocial: dto.razonSocial.trim(),
          especialidad: dto.especialidad?.trim() || 'General',
          direccion: dto.direccion?.trim() || null,
          ciudad: dto.ciudad?.trim() || null,
          comuna: dto.comuna?.trim() || null,
          email: dto.email?.trim().toLowerCase() || null,
          telefono1: dto.telefono1?.trim() || null,
          telefono2: dto.telefono2?.trim() || null,
          representanteLegal: dto.representanteLegal?.trim() || null,
          rutRepresentante: dto.rutRepresentante?.trim() || null,
          tipoPago: dto.tipoPago?.trim() || null,
          observaciones: dto.observaciones?.trim() || undefined,
          proveedorId,
          activo,
          vigenciaHasta,
          empresaId,
        },
      });
      await this.registrarAuditoria(user, {
        empresaId,
        entidad: 'CONTRATISTA',
        entidadId: row.id,
        accion: 'CREAR',
        despues: row,
      });
      return row;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un contratista con ese RUT en la empresa');
      }
      throw e;
    }
  }

  async updateContratista(user: JwtPayload, id: string, dto: UpsertContratistaDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.contratista.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Contratista no encontrado');
    assertTenantAccess(scope, existing.empresaId);

    const activo = dto.activo ?? existing.activo;
    let vigenciaHasta = parseDate(dto.vigenciaHasta);
    if (!activo && !vigenciaHasta) {
      vigenciaHasta = existing.vigenciaHasta ?? new Date();
    }
    if (activo) {
      if (dto.vigenciaHasta === undefined || dto.vigenciaHasta === '') {
        vigenciaHasta = null;
      }
    }
    const proveedorId = await this.resolveProveedorContratista(
      existing.empresaId,
      dto.rut,
      dto.proveedorId,
    );

    try {
      const row = await this.prisma.contratista.update({
        where: { id },
        data: {
          rut: dto.rut.trim(),
          razonSocial: dto.razonSocial.trim(),
          especialidad: dto.especialidad?.trim() || existing.especialidad,
          direccion: dto.direccion?.trim() || null,
          ciudad: dto.ciudad?.trim() || null,
          comuna: dto.comuna?.trim() || null,
          email: dto.email?.trim().toLowerCase() || null,
          telefono1: dto.telefono1?.trim() || null,
          telefono2: dto.telefono2?.trim() || null,
          representanteLegal: dto.representanteLegal?.trim() || null,
          rutRepresentante: dto.rutRepresentante?.trim() || null,
          tipoPago: dto.tipoPago?.trim() || null,
          observaciones: dto.observaciones?.trim() || undefined,
          proveedorId: proveedorId ?? null,
          activo,
          vigenciaHasta,
        },
      });
      await this.registrarAuditoria(user, {
        empresaId: existing.empresaId,
        entidad: 'CONTRATISTA',
        entidadId: existing.id,
        accion: 'ACTUALIZAR',
        antes: existing,
        despues: row,
      });
      const vigenciaCambio =
        existing.activo !== row.activo
        || (existing.vigenciaHasta?.toISOString().slice(0, 10)
          ?? null)
          !== (row.vigenciaHasta?.toISOString().slice(0, 10) ?? null);
      if (vigenciaCambio) {
        const actor = await this.prisma.usuario.findUnique({
          where: { id: user.sub },
          select: { nombre: true },
        });
        await this.prisma.contratistaVigenciaHistorial.create({
          data: {
            contratistaId: row.id,
            empresaId: row.empresaId,
            activo: row.activo,
            vigenciaHasta: row.vigenciaHasta,
            usuarioId: user.sub,
            usuarioNombre: actor?.nombre ?? user.email,
          },
        });
      }
      return row;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un contratista con ese RUT en la empresa');
      }
      throw e;
    }
  }

  getTiposContrato(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = this.activeEmpresa(user, empresaHeader, empresaQuery);
    return this.prisma.tipoContratoContratista.findMany({
      where: { empresaId },
      include: {
        cuentaDebe: { select: { codigo: true, nombre: true } },
        cuentaHaber: { select: { codigo: true, nombre: true } },
        cuentaAdministracion: { select: { codigo: true, nombre: true } },
      },
      orderBy: { nombre: 'asc' },
    });
  }

  private async assertCuentasTipoContrato(
    empresaId: string,
    dto: UpsertTipoContratoContratistaDto,
  ) {
    const ids = [
      dto.cuentaDebeId,
      dto.cuentaHaberId,
      dto.cuentaAdministracionId,
    ];
    const cuentas = await this.prisma.cuentaContable.findMany({
      where: {
        empresaId,
        id: { in: [...new Set(ids)] },
        activa: true,
        noImputable: false,
      },
      select: { id: true },
    });
    if (cuentas.length !== new Set(ids).size) {
      throw new BadRequestException(
        'Las cuentas Debe, Haber y Administración deben existir, estar activas y ser imputables',
      );
    }
  }

  async createTipoContrato(
    user: JwtPayload,
    dto: UpsertTipoContratoContratistaDto,
    empresaHeader?: string,
  ) {
    const empresaId = this.activeEmpresa(user, empresaHeader);
    await this.assertCuentasTipoContrato(empresaId, dto);
    try {
      const row = await this.prisma.tipoContratoContratista.create({
        data: {
          codigo: dto.codigo.trim().toUpperCase(),
          nombre: dto.nombre.trim(),
          cuentaDebeId: dto.cuentaDebeId,
          cuentaHaberId: dto.cuentaHaberId,
          cuentaAdministracionId: dto.cuentaAdministracionId,
          activa: dto.activa ?? true,
          empresaId,
        },
      });
      await this.registrarAuditoria(user, {
        empresaId,
        entidad: 'TIPO_CONTRATO',
        entidadId: row.id,
        accion: 'CREAR',
        despues: row,
      });
      return row;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un tipo de contrato con ese código');
      }
      throw e;
    }
  }

  async updateTipoContrato(
    user: JwtPayload,
    id: string,
    dto: UpsertTipoContratoContratistaDto,
  ) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.tipoContratoContratista.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Tipo de contrato no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    await this.assertCuentasTipoContrato(existing.empresaId, dto);
    const row = await this.prisma.tipoContratoContratista.update({
      where: { id },
      data: {
        codigo: dto.codigo.trim().toUpperCase(),
        nombre: dto.nombre.trim(),
        cuentaDebeId: dto.cuentaDebeId,
        cuentaHaberId: dto.cuentaHaberId,
        cuentaAdministracionId: dto.cuentaAdministracionId,
        activa: dto.activa ?? existing.activa,
      },
    });
    await this.registrarAuditoria(user, {
      empresaId: existing.empresaId,
      entidad: 'TIPO_CONTRATO',
      entidadId: id,
      accion: 'ACTUALIZAR',
      antes: existing,
      despues: row,
    });
    return row;
  }

  private async assertTipoContratoActivo(empresaId: string, id: string) {
    const tipo = await this.prisma.tipoContratoContratista.findFirst({
      where: { id, empresaId, activa: true },
    });
    if (!tipo) {
      throw new BadRequestException('Tipo de contrato inválido o inactivo');
    }
    return tipo;
  }

  async getTarifas(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
    contratistaId?: string,
  ) {
    const empresaId = this.activeEmpresa(user, empresaHeader, empresaQuery);
    const rows = await this.prisma.tarifaContratista.findMany({
      where: {
        empresaId,
        ...(contratistaId ? { contratistaId } : {}),
      },
      include: tarifaInclude,
      orderBy: [{ contratista: { razonSocial: 'asc' } }, { laborRef: { nombre: 'asc' } }],
    });
    return rows.map(mapTarifa);
  }

  private async assertLaborActividadEmpresa(
    laborId: string,
    actividadId: string,
    empresaId: string,
  ) {
    const labor = await this.prisma.labor.findUnique({ where: { id: laborId } });
    const actividad = await this.prisma.actividad.findUnique({
      where: { id: actividadId },
    });
    if (!labor?.activa || !actividad?.activa) {
      throw new BadRequestException('Labor o actividad inválida/inactiva');
    }
    if (labor.empresaId !== empresaId || actividad.empresaId !== empresaId) {
      throw new BadRequestException(
        'Labor y actividad deben pertenecer a la empresa activa (DEC-03)',
      );
    }
    const vinculada = await this.prisma.laborActividad.findUnique({
      where: {
        laborId_actividadId: { laborId, actividadId },
      },
    });
    if (!vinculada) {
      throw new BadRequestException('La Labor no está asociada a la Actividad seleccionada');
    }
    return { labor, actividad };
  }

  private async assertTarifaNoSolapada(
    dto: UpsertTarifaDto,
    empresaId: string,
    vigenciaDesde: Date,
    vigenciaHasta: Date | null,
    excludeId?: string,
  ) {
    if (vigenciaHasta && vigenciaHasta < vigenciaDesde) {
      throw new BadRequestException('vigenciaHasta no puede ser anterior a vigenciaDesde');
    }
    const unidadRaw = dto.unidad.trim().toUpperCase();
    const unidad =
      unidadRaw === 'JORNADA' || unidadRaw === 'TRATO' ? unidadRaw : unidadRaw;
    if (unidad !== 'JORNADA' && unidad !== 'TRATO') {
      const unidadRef = await this.prisma.unidadMedida.findUnique({
        where: { codigo: unidad },
      });
      if (!unidadRef?.activa) {
        throw new BadRequestException(
          'Unidad debe ser JORNADA, TRATO o un código del catálogo de unidades',
        );
      }
    }
    const tipoContrato = await this.prisma.tipoContratoContratista.findFirst({
      where: { id: dto.tipoContratoId, empresaId, activa: true },
    });
    const overlap = await this.prisma.tarifaContratista.findFirst({
      where: {
        empresaId,
        contratistaId: dto.contratistaId,
        laborId: dto.laborId,
        actividadId: dto.actividadId,
        centroCostoId: dto.centroCostoId,
        tipoContratoId: dto.tipoContratoId,
        unidad,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        vigenciaDesde: {
          lte: vigenciaHasta ?? new Date(9999, 11, 31, 12),
        },
        OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: vigenciaDesde } }],
      },
    });
    if (!tipoContrato) {
      throw new BadRequestException('Tipo de contrato inválido o inactivo');
    }
    if (overlap) {
      throw new ConflictException(
        'Existe una tarifa solapada para la misma combinación y vigencia',
      );
    }
    return { unidad, tipoContrato };
  }

  async createTarifa(user: JwtPayload, dto: UpsertTarifaDto) {
    const scope = resolveTenant(user);
    const contratista = await this.prisma.contratista.findUnique({
      where: { id: dto.contratistaId },
    });
    if (!contratista?.activo) {
      throw new NotFoundException('Contratista no encontrado o inactivo');
    }
    assertTenantAccess(scope, contratista.empresaId);

    const cc = await this.prisma.centroCosto.findUnique({
      where: { id: dto.centroCostoId },
    });
    if (!cc || !cc.activa) {
      throw new BadRequestException('Centro de costo inválido o inactivo');
    }
    if (cc.empresaId !== contratista.empresaId) {
      throw new BadRequestException(
        'El centro de costo debe pertenecer a la misma empresa del contratista (DEC-03)',
      );
    }

    await this.assertLaborActividadEmpresa(
      dto.laborId,
      dto.actividadId,
      contratista.empresaId,
    );

    const vigenciaDesde = parseDate(dto.vigenciaDesde);
    if (!vigenciaDesde) {
      throw new BadRequestException('vigenciaDesde es requerida');
    }
    const vigenciaHasta = parseDate(dto.vigenciaHasta);
    const { unidad } = await this.assertTarifaNoSolapada(
      dto,
      contratista.empresaId,
      vigenciaDesde,
      vigenciaHasta,
    );

    const row = await this.prisma.tarifaContratista.create({
      data: {
        contratistaId: contratista.id,
        laborId: dto.laborId,
        actividadId: dto.actividadId,
        tipoContratoId: dto.tipoContratoId,
        tarifa: dto.tarifa,
        unidad,
        centroCostoId: cc.id,
        empresaId: contratista.empresaId,
        vigenciaDesde,
        vigenciaHasta,
      },
      include: tarifaInclude,
    });
    await this.registrarAuditoria(user, {
      empresaId: contratista.empresaId,
      entidad: 'TARIFA',
      entidadId: row.id,
      accion: 'CREAR',
      despues: row,
    });
    return mapTarifa(row);
  }

  async updateTarifa(user: JwtPayload, id: string, dto: UpsertTarifaDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.tarifaContratista.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tarifa no encontrada');
    assertTenantAccess(scope, existing.empresaId);

    const contratista = await this.prisma.contratista.findUnique({
      where: { id: dto.contratistaId },
    });
    if (!contratista) throw new NotFoundException('Contratista no encontrado');
    assertTenantAccess(scope, contratista.empresaId);
    if (contratista.empresaId !== existing.empresaId) {
      throw new BadRequestException('No se puede mover la tarifa a otra empresa');
    }

    const cc = await this.prisma.centroCosto.findUnique({
      where: { id: dto.centroCostoId },
    });
    if (!cc || !cc.activa) {
      throw new BadRequestException('Centro de costo inválido o inactivo');
    }
    if (cc.empresaId !== existing.empresaId) {
      throw new BadRequestException(
        'El centro de costo debe pertenecer a la empresa activa (DEC-03)',
      );
    }

    await this.assertLaborActividadEmpresa(
      dto.laborId,
      dto.actividadId,
      existing.empresaId,
    );

    const vigenciaDesde = parseDate(dto.vigenciaDesde);
    if (!vigenciaDesde) {
      throw new BadRequestException('vigenciaDesde es requerida');
    }
    const vigenciaHasta = parseDate(dto.vigenciaHasta);
    const { unidad } = await this.assertTarifaNoSolapada(
      dto,
      existing.empresaId,
      vigenciaDesde,
      vigenciaHasta,
      id,
    );

    const cierreAnterior = new Date(vigenciaDesde);
    cierreAnterior.setUTCDate(cierreAnterior.getUTCDate() - 1);
    const finAnterior =
      existing.vigenciaHasta && existing.vigenciaHasta < cierreAnterior
        ? existing.vigenciaHasta
        : cierreAnterior;

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.tarifaContratista.update({
        where: { id },
        data: { vigenciaHasta: finAnterior },
      });
      const created = await tx.tarifaContratista.create({
        data: {
          contratistaId: contratista.id,
          laborId: dto.laborId,
          actividadId: dto.actividadId,
          tipoContratoId: dto.tipoContratoId,
          tarifa: dto.tarifa,
          unidad,
          centroCostoId: cc.id,
          empresaId: existing.empresaId,
          vigenciaDesde,
          vigenciaHasta,
        },
        include: tarifaInclude,
      });
      await this.registrarAuditoria(
        user,
        {
          empresaId: existing.empresaId,
          entidad: 'TARIFA',
          entidadId: created.id,
          accion: 'VERSIONAR',
          antes: existing,
          despues: created,
          metadata: { tarifaAnteriorId: id },
        },
        tx,
      );
      return created;
    });
    return mapTarifa(row);
  }

  async patchTarifaInline(user: JwtPayload, id: string, dto: PatchTarifaInlineDto) {
    const existing = await this.prisma.tarifaContratista.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tarifa no encontrada');
    const vigenciaDesde =
      parseDate(dto.vigenciaDesde)?.toISOString().slice(0, 10)
      ?? new Date().toISOString().slice(0, 10);
    return this.updateTarifa(user, id, {
      contratistaId: existing.contratistaId,
      laborId: existing.laborId,
      actividadId: existing.actividadId,
      tipoContratoId: existing.tipoContratoId ?? '',
      tarifa: dto.tarifa,
      unidad: existing.unidad,
      centroCostoId: existing.centroCostoId,
      vigenciaDesde,
      vigenciaHasta: existing.vigenciaHasta?.toISOString().slice(0, 10),
    });
  }

  async deleteTarifa(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.tarifaContratista.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tarifa no encontrada');
    assertTenantAccess(scope, existing.empresaId);
    const usada = await this.prisma.ingresoLaborDiario.count({
      where: { tarifaId: id },
    });
    if (usada > 0) {
      throw new ConflictException('La tarifa ya fue usada; cierre su vigencia en lugar de eliminarla');
    }
    await this.prisma.tarifaContratista.delete({ where: { id } });
    await this.registrarAuditoria(user, {
      empresaId: existing.empresaId,
      entidad: 'TARIFA',
      entidadId: id,
      accion: 'ELIMINAR',
      antes: existing,
    });
    return { ok: true };
  }

  async getProformas(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
    periodo?: string,
    contratistaId?: string,
    estado?: string,
  ) {
    const empresaId = this.activeEmpresa(user, empresaHeader, empresaQuery);
    const estadoFilter = estado?.trim().toUpperCase();
    const estadosValidos = [
      'BORRADOR',
      'PENDIENTE_APROBACION',
      'DEFINITIVA',
      'FACTURADA',
      'RECHAZADA',
    ] as const;
    let estadoWhere: Prisma.ProformaContratistaWhereInput['estado'] | undefined;
    if (estadoFilter === 'PENDIENTES') {
      estadoWhere = { in: ['BORRADOR', 'PENDIENTE_APROBACION', 'DEFINITIVA'] };
    } else if (estadoFilter === 'FACTURADAS') {
      estadoWhere = 'FACTURADA';
    } else if (estadoFilter && estadosValidos.includes(estadoFilter as (typeof estadosValidos)[number])) {
      estadoWhere = estadoFilter as (typeof estadosValidos)[number];
    }
    const rows = await this.prisma.proformaContratista.findMany({
      where: {
        empresaId,
        ...(periodo ? { periodo } : {}),
        ...(contratistaId ? { contratistaId } : {}),
        ...(estadoWhere ? { estado: estadoWhere } : {}),
      },
      include: proformaInclude,
      orderBy: [{ periodo: 'desc' }, { numero: 'desc' }],
    });
    return rows.map(mapProforma);
  }

  async getSiguienteNumeroProforma(user: JwtPayload, empresaHeader?: string) {
    const empresaId = this.activeEmpresa(user, empresaHeader);
    const numero = await this.allocateNextProformaNumero(empresaId);
    return { numero };
  }

  private async allocateNextProformaNumero(
    empresaId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<string> {
    const rows = await db.proformaContratista.findMany({
      where: { empresaId },
      select: { numero: true },
    });
    const re = /^PF-(\d+)$/i;
    let max = 0;
    for (const row of rows) {
      const match = re.exec(row.numero.trim());
      if (match) {
        max = Math.max(max, Number.parseInt(match[1], 10));
      }
    }
    return `PF-${String(max + 1).padStart(5, '0')}`;
  }

  async previewProforma(user: JwtPayload, dto: UpsertProformaDto) {
    const scope = resolveTenant(user);
    const contratista = await this.prisma.contratista.findUnique({
      where: { id: dto.contratistaId },
    });
    if (!contratista?.activo) {
      throw new NotFoundException('Contratista no encontrado o inactivo');
    }
    assertTenantAccess(scope, contratista.empresaId);
    const periodo = await this.assertPeriodoOperable(
      contratista.empresaId,
      dto.periodo,
    );
    await this.assertTipoContratoActivo(
      contratista.empresaId,
      dto.tipoContratoId,
    );
    const ingresoIds = [
      ...new Set((dto.ingresoIds ?? []).map((id) => id.trim()).filter(Boolean)),
    ];
    if (!ingresoIds.length) {
      throw new BadRequestException('Seleccione al menos un ingreso pendiente');
    }
    if (ingresoIds.length !== dto.ingresoIds?.length) {
      throw new BadRequestException('La selección contiene ingresos duplicados o vacíos');
    }
    const ingresos = await this.prisma.ingresoLaborDiario.findMany({
      where: {
        id: { in: ingresoIds },
        empresaId: contratista.empresaId,
      },
      orderBy: { fecha: 'asc' },
    });
    if (ingresos.length !== ingresoIds.length) {
      throw new BadRequestException('Uno o más ingresos no existen en la empresa');
    }
    for (const ingreso of ingresos) {
      if (ingreso.estado !== 'PENDIENTE') {
        throw new ConflictException(`El ingreso ${ingreso.id} ya no está Pendiente`);
      }
      if (ingreso.contratistaId !== contratista.id) {
        throw new BadRequestException('Los ingresos deben ser del Contratista seleccionado');
      }
      if (periodoDesdeFecha(ingreso.fecha) !== periodo) {
        throw new BadRequestException('Los ingresos deben ser del período seleccionado');
      }
      if (ingreso.tipoContratoId !== dto.tipoContratoId) {
        throw new BadRequestException('Los ingresos deben tener el tipo de contrato seleccionado');
      }
    }
    const montoNeto = ingresos.reduce((sum, ingreso) => sum + Number(ingreso.monto), 0);
    if (dto.montoNeto != null && Math.abs(dto.montoNeto - montoNeto) > 0.01) {
      throw new BadRequestException(
        `El monto informado no calza con los ingresos (${montoNeto})`,
      );
    }
    return {
      empresaId: contratista.empresaId,
      contratista,
      periodo,
      ingresoIds,
      ingresos,
      montoNeto,
    };
  }

  async createProforma(user: JwtPayload, dto: UpsertProformaDto) {
    const preview = await this.previewProforma(user, dto);

    const moneda = (dto.moneda ?? 'CLP').trim().toUpperCase();
    if (!['CLP', 'USD', 'CNY', 'EUR'].includes(moneda)) {
      throw new BadRequestException('Moneda debe ser CLP, USD, CNY o EUR');
    }

    try {
      const creator = await this.prisma.usuario.findUnique({
        where: { id: user.sub },
        select: { nombre: true },
      });
      const row = await this.prisma.$transaction(async (tx) => {
        const numero =
          dto.numero?.trim()
          || (await this.allocateNextProformaNumero(preview.empresaId, tx));
        const created = await tx.proformaContratista.create({
          data: {
            numero,
            contratistaId: preview.contratista.id,
            empresaId: preview.empresaId,
            tipoContratoId: dto.tipoContratoId,
            periodo: preview.periodo,
            montoNeto: preview.montoNeto,
            moneda,
            estado: 'BORRADOR',
            creadoPorId: user.sub,
            creadoPorNombre: creator?.nombre ?? user.email,
          },
          include: proformaInclude,
        });
        const updated = await tx.ingresoLaborDiario.updateMany({
          where: {
            id: { in: preview.ingresoIds },
            empresaId: preview.empresaId,
            estado: 'PENDIENTE',
          },
          data: {
            estado: 'ASOCIADO',
            proformaId: created.id,
          },
        });
        if (updated.count !== preview.ingresoIds.length) {
          throw new ConflictException('Uno o más ingresos cambiaron mientras se generaba la Proforma');
        }
        await this.registrarAuditoria(
          user,
          {
            empresaId: preview.empresaId,
            entidad: 'PROFORMA',
            entidadId: created.id,
            accion: 'CREAR_DESDE_INGRESOS',
            despues: created,
            metadata: {
              ingresoIds: preview.ingresoIds,
              montoNeto: preview.montoNeto,
            },
          },
          tx,
        );
        return created;
      });
      return mapProforma(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una proforma con ese número en la empresa');
      }
      throw e;
    }
  }

  async updateProforma(user: JwtPayload, id: string, dto: UpsertProformaDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.proformaContratista.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Proforma no encontrada');
    assertTenantAccess(scope, existing.empresaId);
    if (existing.estado !== 'BORRADOR') {
      throw new BadRequestException('Solo se puede editar una proforma en estado Borrador');
    }
    await this.assertPeriodoOperable(existing.empresaId, existing.periodo);

    const contratista = await this.prisma.contratista.findUnique({
      where: { id: dto.contratistaId },
    });
    if (!contratista) throw new NotFoundException('Contratista no encontrado');
    assertTenantAccess(scope, contratista.empresaId);
    if (contratista.empresaId !== existing.empresaId) {
      throw new BadRequestException('No se puede mover la proforma a otra empresa');
    }

    const moneda = (dto.moneda ?? existing.moneda).trim().toUpperCase();
    const periodo = await this.assertPeriodoOperable(existing.empresaId, dto.periodo);
    await this.assertTipoContratoActivo(existing.empresaId, dto.tipoContratoId);
    const ingresos = await this.prisma.ingresoLaborDiario.findMany({
      where: {
        empresaId: existing.empresaId,
        proformaId: existing.id,
        estado: 'ASOCIADO',
      },
    });
    if (!ingresos.length) {
      throw new BadRequestException('La Proforma no tiene ingresos asociados');
    }
    for (const ingreso of ingresos) {
      if (
        ingreso.contratistaId !== contratista.id
        || periodoDesdeFecha(ingreso.fecha) !== periodo
        || ingreso.tipoContratoId !== dto.tipoContratoId
      ) {
        throw new BadRequestException(
          'Los cambios no son compatibles con los ingresos asociados',
        );
      }
    }
    const montoNeto = ingresos.reduce(
      (sum, ingreso) => sum + Number(ingreso.monto),
      0,
    );
    if (dto.montoNeto != null && Math.abs(dto.montoNeto - montoNeto) > 0.01) {
      throw new BadRequestException('El monto se deriva de los ingresos y no puede modificarse');
    }

    try {
      const row = await this.prisma.proformaContratista.update({
        where: { id },
        data: {
          numero: dto.numero?.trim() ?? existing.numero,
          contratistaId: contratista.id,
          tipoContratoId: dto.tipoContratoId,
          periodo,
          montoNeto,
          moneda,
        },
        include: proformaInclude,
      });
      return mapProforma(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una proforma con ese número en la empresa');
      }
      throw e;
    }
  }

  async marcarProformaDefinitiva(
    user: JwtPayload,
    id: string,
    dto: SolicitarAprobacionProformaDto,
  ) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.proformaContratista.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Proforma no encontrada');
    assertTenantAccess(scope, existing.empresaId);
    if (existing.estado !== 'BORRADOR') {
      throw new BadRequestException(
        'Solo proformas en Borrador pueden solicitarse para aprobación',
      );
    }
    await this.assertPeriodoOperable(existing.empresaId, existing.periodo);
    const ingresos = await this.prisma.ingresoLaborDiario.findMany({
      where: {
        empresaId: existing.empresaId,
        proformaId: existing.id,
        estado: 'ASOCIADO',
      },
      select: { monto: true },
    });
    if (!ingresos.length) {
      throw new BadRequestException('La Proforma no tiene ingresos asociados');
    }
    const montoIngresos = ingresos.reduce((sum, ingreso) => sum + Number(ingreso.monto), 0);
    if (Math.abs(montoIngresos - Number(existing.montoNeto)) > 0.01) {
      throw new BadRequestException('El monto asociado no calza con la Proforma');
    }

    const aprobador = await this.prisma.usuario.findFirst({
      where: { id: dto.aprobadorId.trim(), activo: true },
      select: { id: true, nombre: true },
    });
    if (!aprobador) {
      throw new BadRequestException('Supervisor/aprobador inválido');
    }

    const row = await this.prisma.proformaContratista.update({
      where: { id },
      data: {
        estado: 'PENDIENTE_APROBACION',
        aprobadorId: aprobador.id,
        aprobadorNombre: aprobador.nombre,
        aprobacionCadenaIds: [aprobador.id],
        aprobacionPasoActual: 1,
        aprobacionPasosTotal: 1,
        aprobadoPorId: null,
        aprobadoPorNombre: null,
        aprobadaAt: null,
      },
      include: proformaInclude,
    });
    await this.registrarAuditoria(user, {
      empresaId: existing.empresaId,
      entidad: 'PROFORMA',
      entidadId: existing.id,
      accion: 'SOLICITAR_APROBACION',
      antes: { estado: existing.estado },
      despues: { estado: row.estado, aprobadorId: aprobador.id },
    });
    await this.notificaciones?.upsert({
      userId: aprobador.id,
      empresaId: existing.empresaId,
      tipo: 'PROFORMA_PENDIENTE',
      titulo: `Proforma ${row.numero} pendiente`,
      detalle: `Solicitud de aprobación · ${row.periodo}`,
      href: `/contratistas/proformas?open=${encodeURIComponent(row.id)}`,
      refKey: `prf-pend:${row.id}`,
      monto: Number(row.montoNeto),
    });
    return mapProforma(row);
  }

  async aprobarProformaDefinitiva(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.proformaContratista.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Proforma no encontrada');
    assertTenantAccess(scope, existing.empresaId);
    if (existing.estado !== 'PENDIENTE_APROBACION') {
      throw new BadRequestException('La proforma no está pendiente de aprobación');
    }
    const permisos = user.permisos ?? [];
    const puede =
      permisos.includes('*')
      || userHasPermission(permisos, 'contratistas:finalize')
      || existing.aprobadorId === user.sub;
    if (!puede) {
      throw new BadRequestException('No está autorizado para aprobar esta proforma');
    }
    await this.assertPeriodoOperable(existing.empresaId, existing.periodo);

    const profile = await this.prisma.usuario.findUnique({
      where: { id: user.sub },
      select: { nombre: true },
    });
    const resolverNombre = profile?.nombre ?? user.email;

    const row = await this.prisma.proformaContratista.update({
      where: { id },
      data: {
        estado: 'DEFINITIVA',
        aprobadoPorId: user.sub,
        aprobadoPorNombre: resolverNombre,
        aprobadaAt: new Date(),
      },
      include: proformaInclude,
    });
    await this.registrarAuditoria(user, {
      empresaId: existing.empresaId,
      entidad: 'PROFORMA',
      entidadId: existing.id,
      accion: 'DEFINITIVA',
      antes: { estado: existing.estado },
      despues: { estado: row.estado, aprobadoPorId: user.sub },
    });
    if (existing.creadoPorId && existing.creadoPorId !== user.sub) {
      await this.notificaciones?.upsert({
        userId: existing.creadoPorId,
        empresaId: existing.empresaId,
        tipo: 'PROFORMA_APROBADA',
        titulo: `Proforma ${row.numero} aprobada`,
        detalle: `Autorizada por ${resolverNombre}`,
        href: `/contratistas/proformas?open=${encodeURIComponent(row.id)}`,
        refKey: `prf-res:${row.id}`,
        monto: Number(row.montoNeto),
      });
    }
    return mapProforma(row);
  }

  async asociarFacturaProforma(
    user: JwtPayload,
    id: string,
    dto: AsociarFacturaProformaDto,
  ) {
    const scope = resolveTenant(user);
    const primary = await this.prisma.proformaContratista.findUnique({
      where: { id },
      include: { factura: true, registroCompra: true, ordenCompra: true },
    });
    if (!primary) throw new NotFoundException('Proforma no encontrada');
    assertTenantAccess(scope, primary.empresaId);
    await this.assertPeriodoOperable(primary.empresaId, primary.periodo);

    const grupoIds = Array.from(new Set([id, ...(dto.proformaIds ?? [])]));
    const grupo = await this.prisma.proformaContratista.findMany({
      where: { id: { in: grupoIds }, empresaId: primary.empresaId },
      include: { factura: true, registroCompra: true, ordenCompra: true },
    });
    if (grupo.length !== grupoIds.length) {
      throw new BadRequestException('Una o más proformas no existen en la empresa');
    }
    for (const p of grupo) {
      if (p.estado !== 'DEFINITIVA') {
        throw new BadRequestException(`La proforma ${p.numero} debe estar en Definitiva`);
      }
      if (p.contratistaId !== primary.contratistaId) {
        throw new BadRequestException('Todas las proformas deben ser del mismo Contratista');
      }
      if (p.moneda !== primary.moneda) {
        throw new BadRequestException('Todas las proformas deben usar la misma moneda');
      }
      if (p.tipoContratoId !== primary.tipoContratoId) {
        throw new BadRequestException('Todas las proformas deben tener el mismo tipo de contrato');
      }
      if (p.factura || p.facturaNumeroRef || p.registroCompraId || p.ordenCompraId) {
        throw new ConflictException(`La proforma ${p.numero} ya fue enviada a Compras`);
      }
    }

    const montoCalculado = grupo.reduce((acc, p) => acc + Number(p.montoNeto), 0);
    if (dto.montoNeto != null && Math.abs(dto.montoNeto - montoCalculado) > 0.01) {
      throw new BadRequestException(
        `El monto no calza con las proformas (${montoCalculado})`,
      );
    }
    const montoNeto = montoCalculado;

    if (dto.registroCompraId?.trim()) {
      const registro = await this.prisma.registroCompra.findFirst({
        where: { id: dto.registroCompraId.trim(), empresaId: primary.empresaId },
      });
      if (!registro || registro.estado === 'ANULADO') {
        throw new BadRequestException('Registro de compra inválido');
      }
      const facturaRef = dto.numero?.trim() || registro.factura;
      await this.prisma.$transaction(async (tx) => {
        await tx.proformaContratista.updateMany({
          where: { id: { in: grupoIds }, empresaId: primary.empresaId },
          data: {
            estado: 'FACTURADA',
            registroCompraId: registro.id,
            facturaNumeroRef: facturaRef,
          },
        });
        await tx.ingresoLaborDiario.updateMany({
          where: {
            empresaId: primary.empresaId,
            proformaId: { in: grupoIds },
            estado: 'ASOCIADO',
          },
          data: {
            estado: 'FACTURADO',
            facturaNumero: facturaRef,
          },
        });
      });
      const row = await this.prisma.proformaContratista.findUniqueOrThrow({
        where: { id: primary.id },
        include: proformaInclude,
      });
      return mapProforma(row);
    }

    const fecha = parseDate(dto.fecha);
    if (!fecha) throw new BadRequestException('fecha es requerida');
    if (!primary.tipoContratoId) {
      throw new BadRequestException('La Proforma no tiene tipo de contrato configurado');
    }
    if (!this.compras) {
      throw new BadRequestException('Módulo Compras no disponible para generar la orden');
    }
    const [contratista, tipoContrato, creator] = await Promise.all([
      this.prisma.contratista.findUnique({
        where: { id: primary.contratistaId },
        include: { proveedor: true },
      }),
      this.resolveCuentasTraspaso(primary.empresaId, primary.tipoContratoId),
      this.prisma.usuario.findUnique({
        where: { id: user.sub },
        select: { nombre: true },
      }),
    ]);
    const proveedor = contratista
      ? await this.asegurarProveedorActivo(primary.empresaId, contratista)
      : null;
    if (!proveedor) {
      throw new BadRequestException(
        'El Contratista debe estar vinculado a un Proveedor activo antes de facturar',
      );
    }
    const refFolio = dto.numero?.trim()
      || grupo.map((p) => p.numero).join(', ');
    const oc = await this.compras.createOrden(
      user,
      {
        fecha: dto.fecha,
        proveedor: proveedor.razonSocial,
        proveedorId: proveedor.id,
        solicitante: creator?.nombre?.trim() || user.email || 'Contratistas',
        moneda: primary.moneda,
        neto: montoNeto,
        afacto: 'AFECTO',
        estado: 'EMITIDO',
        departamento: 'Contratistas',
        cuentaContableId: tipoContrato.cuentaDebeId,
        lineas: grupo.map((p) => ({
          descripcion: `Proforma ${p.numero} · ${p.periodo}`,
          cantidad: 1,
          precioUnitario: Number(p.montoNeto),
          total: Number(p.montoNeto),
          proformaId: p.id,
        })),
        referenciaTipo: 'PROFORMA_CONTRATISTA',
        referenciaFolio: refFolio,
        referenciaFecha: dto.fecha,
      },
      primary.empresaId,
    );
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.proformaContratista.updateMany({
          where: { id: { in: grupoIds }, empresaId: primary.empresaId },
          data: {
            estado: 'FACTURADA',
            facturaNumeroRef: null,
            ordenCompraId: oc.id,
          },
        });
        await tx.ingresoLaborDiario.updateMany({
          where: {
            empresaId: primary.empresaId,
            proformaId: { in: grupoIds },
            estado: 'ASOCIADO',
          },
          data: {
            estado: 'FACTURADO',
            facturaNumero: oc.numero,
          },
        });
        await this.registrarAuditoria(
          user,
          {
            empresaId: primary.empresaId,
            entidad: 'PROFORMA',
            entidadId: primary.id,
            accion: 'OC_GENERADA',
            antes: { grupoIds, estado: 'DEFINITIVA' },
            despues: {
              grupoIds,
              ordenCompraId: oc.id,
              ordenCompraNumero: oc.numero,
              referenciaProveedor: dto.numero?.trim() || undefined,
              montoNeto,
            },
          },
          tx,
        );
      });
      const row = await this.prisma.proformaContratista.findUniqueOrThrow({
        where: { id: primary.id },
        include: proformaInclude,
      });
      return mapProforma(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Conflicto al enlazar la orden de compra');
      }
      throw e;
    }
  }

  async deleteProforma(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.proformaContratista.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Proforma no encontrada');
    assertTenantAccess(scope, existing.empresaId);
    if (existing.estado !== 'BORRADOR') {
      throw new BadRequestException('Solo se puede eliminar una proforma en Borrador');
    }
    await this.assertPeriodoOperable(existing.empresaId, existing.periodo);
    await this.prisma.$transaction(async (tx) => {
      await tx.ingresoLaborDiario.updateMany({
        where: {
          empresaId: existing.empresaId,
          proformaId: id,
          estado: 'ASOCIADO',
        },
        data: {
          estado: 'PENDIENTE',
          proformaId: null,
        },
      });
      await tx.proformaContratista.delete({ where: { id } });
    });
    return { ok: true };
  }

  /** Reversa de proforma definitiva: clave de reversa del usuario (Mi Perfil). */
  async reversarProforma(user: JwtPayload, id: string, dto: ReversarProformaDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.proformaContratista.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Proforma no encontrada');
    assertTenantAccess(scope, existing.empresaId);
    if (existing.estado !== 'DEFINITIVA') {
      throw new BadRequestException('Solo se puede reversar una proforma en estado Definitiva');
    }
    await this.assertPeriodoOperable(existing.empresaId, existing.periodo);
    await assertClaveReversa(this.prisma, user.sub, dto.claveReversa);

    const row = await this.prisma.proformaContratista.update({
      where: { id },
      data: {
        estado: 'BORRADOR',
        aprobadoPorId: null,
        aprobadoPorNombre: null,
        aprobadaAt: null,
      },
      include: proformaInclude,
    });
    await this.registrarAuditoria(user, {
      empresaId: existing.empresaId,
      entidad: 'PROFORMA',
      entidadId: existing.id,
      accion: 'REVERSA',
      antes: { estado: existing.estado },
      despues: { estado: row.estado },
    });
    return mapProforma(row);
  }

  async reemitirProforma(
    user: JwtPayload,
    id: string,
    dto: ReemitirProformaDto,
  ) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.proformaContratista.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Proforma no encontrada');
    assertTenantAccess(scope, existing.empresaId);
    if (existing.estado !== 'DEFINITIVA') {
      throw new BadRequestException('Solo una Proforma Definitiva sin factura puede reemitirse');
    }
    await this.assertPeriodoOperable(existing.empresaId, existing.periodo);
    const actor = await this.prisma.usuario.findUnique({
      where: { id: user.sub },
      select: { nombre: true },
    });
    const nueva = await this.prisma.$transaction(async (tx) => {
      const created = await tx.proformaContratista.create({
        data: {
          numero: dto.numeroNuevo.trim(),
          contratistaId: existing.contratistaId,
          empresaId: existing.empresaId,
          tipoContratoId: existing.tipoContratoId,
          periodo: existing.periodo,
          montoNeto: existing.montoNeto,
          moneda: existing.moneda,
          estado: 'BORRADOR',
          creadoPorId: user.sub,
          creadoPorNombre: actor?.nombre ?? user.email,
        },
      });
      await tx.proformaContratista.update({
        where: { id: existing.id },
        data: { estado: 'RECHAZADA' },
      });
      await tx.ingresoLaborDiario.updateMany({
        where: {
          empresaId: existing.empresaId,
          proformaId: existing.id,
          estado: 'ASOCIADO',
        },
        data: { proformaId: created.id },
      });
      await this.registrarAuditoria(
        user,
        {
          empresaId: existing.empresaId,
          entidad: 'PROFORMA',
          entidadId: existing.id,
          accion: 'REEMITIR',
          antes: existing,
          despues: created,
          metadata: { motivo: dto.motivo.trim(), nuevaId: created.id },
        },
        tx,
      );
      return created;
    });
    const row = await this.prisma.proformaContratista.findUniqueOrThrow({
      where: { id: nueva.id },
      include: proformaInclude,
    });
    return mapProforma(row);
  }

  async getIngresosLaborDiario(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = this.activeEmpresa(user, empresaHeader, empresaQuery);
    const rows = await this.prisma.ingresoLaborDiario.findMany({
      where: { empresaId },
      include: ingresoInclude,
      orderBy: { fecha: 'desc' },
    });
    return rows.map(mapIngreso);
  }

  private async assertIngresoRefs(
    user: JwtPayload,
    empresaId: string,
    dto: UpsertIngresoLaborDiarioDto,
    fecha: Date,
  ) {
    const [ctr, cc, lab, act] = await Promise.all([
      this.prisma.contratista.findUnique({ where: { id: dto.contratistaId } }),
      this.prisma.centroCosto.findUnique({ where: { id: dto.centroCostoId } }),
      this.prisma.labor.findUnique({ where: { id: dto.laborId } }),
      this.prisma.actividad.findUnique({ where: { id: dto.actividadId } }),
    ]);
    if (!ctr || ctr.empresaId !== empresaId || !ctr.activo) {
      throw new BadRequestException('Contratista inválido para la empresa');
    }
    if (!cc || cc.empresaId !== empresaId || !cc.activa) {
      throw new BadRequestException('Centro de costo inválido para la empresa');
    }
    if (!lab || lab.empresaId !== empresaId || !lab.activa) {
      throw new BadRequestException('Labor inválida para la empresa');
    }
    if (!act || act.empresaId !== empresaId || !act.activa) {
      throw new BadRequestException('Actividad inválida para la empresa');
    }
    await this.assertLaborActividadEmpresa(dto.laborId, dto.actividadId, empresaId);
    const tipo = dto.tipoJornada.toUpperCase();
    if (tipo !== 'JORNADA' && tipo !== 'TRATO') {
      throw new BadRequestException('tipoJornada inválido');
    }
    const tarifas = await this.prisma.tarifaContratista.findMany({
      where: {
        empresaId,
        contratistaId: dto.contratistaId,
        centroCostoId: dto.centroCostoId,
        laborId: dto.laborId,
        actividadId: dto.actividadId,
        vigenciaDesde: { lte: fecha },
        OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: fecha } }],
      },
      orderBy: { vigenciaDesde: 'desc' },
      take: 2,
    });
    if (!tarifas.length) {
      const precio =
        dto.precioUnitario != null && dto.precioUnitario >= 0
          ? dto.precioUnitario
          : undefined;
      if (precio == null) {
        throw new BadRequestException(
          'Sin tarifario vigente: indique precio unitario (puede ser 0 para asistencia/avance pendiente de valorizar)',
        );
      }
      if (!dto.tipoContratoId?.trim()) {
        throw new BadRequestException(
          'Sin tarifario vigente: indique el tipo de contrato',
        );
      }
      await this.assertTipoContratoActivo(empresaId, dto.tipoContratoId.trim());
      const precioOverride =
        precio > 0
        && !(
          userHasPermission(user.permisos ?? [], 'contratistas:rate-override')
          || (user.permisos ?? []).includes('*')
        );
      if (precioOverride && precio > 0) {
        throw new BadRequestException(
          'No tiene permiso para fijar precio sin tarifario (requiere contratistas:rate-override)',
        );
      }
      return {
        tipoJornada: tipo as 'JORNADA' | 'TRATO',
        tarifa: null as null,
        tarifaAplicada: precio,
        precioUnitario: precio,
        precioOverride: false,
        tipoContratoId: dto.tipoContratoId.trim(),
        unidad: tipo,
      };
    }
    if (tarifas.length > 1) {
      throw new ConflictException('Hay más de una tarifa vigente; corrija las vigencias solapadas');
    }
    const tarifa = tarifas[0];
    if (!tarifa.tipoContratoId) {
      throw new BadRequestException('La tarifa no tiene tipo de contrato configurado');
    }
    const tarifaAplicada = Number(tarifa.tarifa);
    const precioUnitario = dto.precioUnitario ?? tarifaAplicada;
    const precioOverride = Math.abs(precioUnitario - tarifaAplicada) > 0.01;
    if (precioOverride) {
      const permisos = user.permisos ?? [];
      const puedeOverride =
        permisos.includes('*')
        || userHasPermission(permisos, 'contratistas:rate-override');
      if (!puedeOverride) {
        throw new BadRequestException('No tiene permiso para modificar la tarifa vigente');
      }
      if (!dto.motivoOverride?.trim() || dto.motivoOverride.trim().length < 5) {
        throw new BadRequestException('Indique el motivo del override de tarifa');
      }
    }
    return {
      tipoJornada: tipo as 'JORNADA' | 'TRATO',
      tarifa,
      tarifaAplicada,
      precioUnitario,
      precioOverride,
      tipoContratoId: tarifa.tipoContratoId!,
      unidad: tarifa.unidad,
    };
  }

  private async resolveEstadoIngresoNuevo(
    user: JwtPayload,
    dto: UpsertIngresoLaborDiarioDto,
  ): Promise<'PENDIENTE' | 'PENDIENTE_APROBACION'> {
    const permisos = user.permisos ?? [];
    const puedeAuto =
      permisos.includes('*')
      || userHasPermission(permisos, 'contratistas:finalize');
    if (!dto.aprobadorId?.trim()) {
      if (puedeAuto) return 'PENDIENTE';
      throw new BadRequestException('Indique el supervisor que debe autorizar el ingreso');
    }
    const aprobador = await this.prisma.usuario.findFirst({
      where: { id: dto.aprobadorId.trim(), activo: true },
      select: { id: true, nombre: true },
    });
    if (!aprobador) {
      throw new BadRequestException('Supervisor/aprobador inválido');
    }
    if (puedeAuto && dto.aprobadorId.trim() === user.sub) {
      return 'PENDIENTE';
    }
    return 'PENDIENTE_APROBACION';
  }

  private async resolveAprobadorIngreso(dto: UpsertIngresoLaborDiarioDto) {
    if (!dto.aprobadorId?.trim()) return { aprobadorId: null, aprobadorNombre: null };
    const aprobador = await this.prisma.usuario.findFirst({
      where: { id: dto.aprobadorId.trim(), activo: true },
      select: { id: true, nombre: true },
    });
    if (!aprobador) throw new BadRequestException('Supervisor/aprobador inválido');
    return { aprobadorId: aprobador.id, aprobadorNombre: aprobador.nombre };
  }

  async createIngresoLaborDiario(
    user: JwtPayload,
    dto: UpsertIngresoLaborDiarioDto,
    empresaHeader?: string,
  ) {
    const empresaId = this.activeEmpresa(user, empresaHeader);
    const fecha = parseDate(dto.fecha);
    if (!fecha) throw new BadRequestException('fecha es requerida');
    await this.assertFechaOperable(empresaId, fecha);
    const resolved = await this.assertIngresoRefs(user, empresaId, dto, fecha);
    const estadoNuevo = await this.resolveEstadoIngresoNuevo(user, dto);
    const aprobador = await this.resolveAprobadorIngreso(dto);
    const monto = Math.round(dto.cantidad * resolved.precioUnitario * 100) / 100;
    const row = await this.prisma.ingresoLaborDiario.create({
      data: {
        fecha,
        contratistaId: dto.contratistaId,
        centroCostoId: dto.centroCostoId,
        laborId: dto.laborId,
        actividadId: dto.actividadId,
        tipoJornada: resolved.tipoJornada,
        tipoContratoId: resolved.tipoContratoId,
        tarifaId: resolved.tarifa?.id ?? null,
        tarifaAplicada: resolved.tarifaAplicada,
        unidad: resolved.unidad,
        precioOverride: resolved.precioOverride,
        motivoOverride: resolved.precioOverride
          ? dto.motivoOverride!.trim()
          : null,
        cantidad: dto.cantidad,
        precioUnitario: resolved.precioUnitario,
        monto,
        estado: estadoNuevo,
        aprobadorId: aprobador.aprobadorId,
        aprobadorNombre: aprobador.aprobadorNombre,
        empresaId,
      },
      include: ingresoInclude,
    });
    return mapIngreso(row);
  }

  async updateIngresoLaborDiario(
    user: JwtPayload,
    id: string,
    dto: UpsertIngresoLaborDiarioDto,
  ) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.ingresoLaborDiario.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ingreso no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    if (existing.estado !== 'PENDIENTE' && existing.estado !== 'PENDIENTE_APROBACION') {
      throw new BadRequestException('Solo se puede editar un ingreso pendiente');
    }
    await this.assertFechaOperable(existing.empresaId, existing.fecha);
    const fecha = parseDate(dto.fecha);
    if (!fecha) throw new BadRequestException('fecha es requerida');
    await this.assertFechaOperable(existing.empresaId, fecha);
    const resolved = await this.assertIngresoRefs(
      user,
      existing.empresaId,
      dto,
      fecha,
    );
    const estadoNuevo = await this.resolveEstadoIngresoNuevo(user, dto);
    const aprobador = await this.resolveAprobadorIngreso(dto);
    const monto = Math.round(dto.cantidad * resolved.precioUnitario * 100) / 100;
    const row = await this.prisma.ingresoLaborDiario.update({
      where: { id },
      data: {
        fecha,
        contratistaId: dto.contratistaId,
        centroCostoId: dto.centroCostoId,
        laborId: dto.laborId,
        actividadId: dto.actividadId,
        tipoJornada: resolved.tipoJornada,
        tipoContratoId: resolved.tipoContratoId,
        tarifaId: resolved.tarifa?.id ?? null,
        tarifaAplicada: resolved.tarifaAplicada,
        unidad: resolved.unidad,
        precioOverride: resolved.precioOverride,
        motivoOverride: resolved.precioOverride
          ? dto.motivoOverride!.trim()
          : null,
        cantidad: dto.cantidad,
        precioUnitario: resolved.precioUnitario,
        monto,
        estado: estadoNuevo,
        aprobadorId: aprobador.aprobadorId,
        aprobadorNombre: aprobador.aprobadorNombre,
        aprobadoPorId: null,
        aprobadoPorNombre: null,
        aprobadaAt: null,
      },
      include: ingresoInclude,
    });
    return mapIngreso(row);
  }

  async aprobarIngresoLaborDiario(
    user: JwtPayload,
    id: string,
    _dto: AprobarIngresoLaborDto,
  ) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.ingresoLaborDiario.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ingreso no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    if (existing.estado !== 'PENDIENTE_APROBACION') {
      throw new BadRequestException('El ingreso no está pendiente de aprobación');
    }
    const permisos = user.permisos ?? [];
    const puede =
      permisos.includes('*')
      || userHasPermission(permisos, 'contratistas:finalize')
      || existing.aprobadorId === user.sub;
    if (!puede) {
      throw new BadRequestException('No está autorizado para aprobar este ingreso');
    }
    const actor = await this.prisma.usuario.findUnique({
      where: { id: user.sub },
      select: { nombre: true },
    });
    const row = await this.prisma.ingresoLaborDiario.update({
      where: { id },
      data: {
        estado: 'PENDIENTE',
        aprobadoPorId: user.sub,
        aprobadoPorNombre: actor?.nombre ?? user.email,
        aprobadaAt: new Date(),
      },
      include: ingresoInclude,
    });
    await this.registrarAuditoria(user, {
      empresaId: existing.empresaId,
      entidad: 'INGRESO',
      entidadId: id,
      accion: 'APROBAR',
      antes: { estado: existing.estado },
      despues: { estado: row.estado },
    });
    return mapIngreso(row);
  }

  async deleteIngresoLaborDiario(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.ingresoLaborDiario.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ingreso no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    if (existing.estado !== 'PENDIENTE' && existing.estado !== 'PENDIENTE_APROBACION') {
      throw new BadRequestException('Solo se puede eliminar un ingreso pendiente');
    }
    await this.assertFechaOperable(existing.empresaId, existing.fecha);
    await this.prisma.ingresoLaborDiario.delete({ where: { id } });
    return { ok: true };
  }

  async asociarIngresosAProforma(user: JwtPayload, dto: AsociarIngresosProformaDto) {
    const scope = resolveTenant(user);
    const proforma = await this.prisma.proformaContratista.findUnique({
      where: { id: dto.proformaId },
      include: { factura: true },
    });
    if (!proforma) throw new NotFoundException('Proforma no encontrada');
    assertTenantAccess(scope, proforma.empresaId);
    if (proforma.estado !== 'BORRADOR') {
      throw new BadRequestException('Solo se pueden asociar ingresos a una Proforma en Borrador');
    }
    await this.assertPeriodoOperable(proforma.empresaId, proforma.periodo);

    const ingresoIds = [...new Set(dto.ingresoIds.map((id) => id.trim()).filter(Boolean))];
    if (!ingresoIds.length) {
      throw new BadRequestException('Selecciona al menos un ingreso');
    }
    if (ingresoIds.length !== dto.ingresoIds.length) {
      throw new BadRequestException('La selección contiene ingresos duplicados o vacíos');
    }
    const ingresos = await this.prisma.ingresoLaborDiario.findMany({
      where: { id: { in: ingresoIds }, empresaId: proforma.empresaId },
    });
    if (ingresos.length !== ingresoIds.length) {
      throw new BadRequestException('Uno o más ingresos no existen en la empresa');
    }
    for (const ingreso of ingresos) {
      if (ingreso.estado !== 'PENDIENTE') {
        throw new ConflictException(`El ingreso ${ingreso.id} ya no está Pendiente`);
      }
      if (ingreso.contratistaId !== proforma.contratistaId) {
        throw new BadRequestException('Todos los ingresos deben pertenecer al Contratista de la Proforma');
      }
      if (periodoDesdeFecha(ingreso.fecha) !== proforma.periodo) {
        throw new BadRequestException('Todos los ingresos deben pertenecer al período de la Proforma');
      }
      if (ingreso.tipoContratoId !== proforma.tipoContratoId) {
        throw new BadRequestException('Todos los ingresos deben tener el tipo de contrato de la Proforma');
      }
    }
    const monto = ingresos.reduce((a, r) => a + Number(r.monto), 0);
    if (Math.abs(monto - Number(proforma.montoNeto)) > 0.01) {
      throw new BadRequestException(
        `El monto de los ingresos (${monto}) no calza con la Proforma (${Number(proforma.montoNeto)})`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.ingresoLaborDiario.updateMany({
        where: {
          id: { in: ingresoIds },
          empresaId: proforma.empresaId,
          estado: 'PENDIENTE',
        },
        data: {
          estado: 'ASOCIADO',
          proformaId: dto.proformaId,
          facturaNumero: null,
        },
      });
      if (result.count !== ingresoIds.length) {
        throw new ConflictException('Uno o más ingresos cambiaron mientras se asociaban');
      }
      await this.registrarAuditoria(
        user,
        {
          empresaId: proforma.empresaId,
          entidad: 'PROFORMA',
          entidadId: proforma.id,
          accion: 'INGRESOS_ASOCIADOS',
          metadata: { ingresoIds, monto },
        },
        tx,
      );
    });

    return { asociados: ingresoIds.length, monto, proformaId: dto.proformaId };
  }

  private mapCierreTraspaso(row: {
    id: string;
    periodo: string;
    cerrado: boolean;
    montoTotal: Prisma.Decimal;
    tipoCambio: Prisma.Decimal | null;
    monedaTc: string | null;
    tiposCambio?: Prisma.JsonValue | null;
    asientoId: string | null;
    asientoNumero: string | null;
    glosa: string | null;
    proformaIds?: string[] | null;
    cerradoAt?: Date | null;
    cerradoPorId?: string | null;
    cerradoPorNombre?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    return {
      id: row.id,
      periodo: row.periodo,
      cerrado: row.cerrado,
      montoTotal: Number(row.montoTotal),
      tipoCambio: row.tipoCambio != null ? Number(row.tipoCambio) : undefined,
      monedaTc: row.monedaTc ?? undefined,
      tiposCambio: row.tiposCambio ?? undefined,
      asientoId: row.asientoId ?? undefined,
      asientoNumero: row.asientoNumero ?? undefined,
      glosa: row.glosa ?? undefined,
      proformaIds: row.proformaIds ?? [],
      proformas: (row.proformaIds ?? []).length,
      cerradoAt: row.cerradoAt?.toISOString(),
      cerradoPorId: row.cerradoPorId ?? undefined,
      cerradoPorNombre: row.cerradoPorNombre ?? undefined,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    };
  }

  async getCierresTraspaso(
    user: JwtPayload,
    empresaHeader?: string,
    periodo?: string,
  ) {
    const empresaId = this.activeEmpresa(user, empresaHeader);
    const periodoFiltro = periodo?.trim();
    const rows = await this.prisma.periodoCierreContratista.findMany({
      where: {
        empresaId,
        ...(periodoFiltro
          ? { periodo: { equals: periodoFiltro } }
          : {}),
      },
      orderBy: { periodo: 'desc' },
    });
    return rows.map((r) => this.mapCierreTraspaso(r));
  }

  async getAuditoria(
    user: JwtPayload,
    empresaHeader?: string,
    entidad?: string,
    entidadId?: string,
  ) {
    const empresaId = this.activeEmpresa(user, empresaHeader);
    return this.prisma.auditoriaContratista.findMany({
      where: {
        empresaId,
        ...(entidad?.trim() ? { entidad: entidad.trim().toUpperCase() } : {}),
        ...(entidadId?.trim() ? { entidadId: entidadId.trim() } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getCierreTraspaso(
    user: JwtPayload,
    periodo: string,
    empresaHeader?: string,
  ) {
    const empresaId = this.activeEmpresa(user, empresaHeader);
    const p = assertPeriodoContratista(periodo);
    const row = await this.prisma.periodoCierreContratista.findUnique({
      where: { empresaId_periodo: { empresaId, periodo: p } },
    });
    if (!row) return null;

    const mapped = this.mapCierreTraspaso(row);
    const proformaIds = mapped.proformaIds;
    const detalle = proformaIds.length
      ? await this.prisma.proformaContratista.findMany({
          where: { empresaId, id: { in: proformaIds } },
          include: { contratista: { select: { razonSocial: true } } },
          orderBy: { numero: 'asc' },
        })
      : await this.prisma.proformaContratista.findMany({
          where: {
            empresaId,
            periodo: p,
            estado: { in: ['DEFINITIVA', 'FACTURADA'] },
          },
          include: { contratista: { select: { razonSocial: true } } },
          orderBy: { numero: 'asc' },
        });

    return {
      ...mapped,
      detalle: detalle.map((pr) => ({
        id: pr.id,
        numero: pr.numero,
        contratista: pr.contratista.razonSocial,
        periodo: pr.periodo,
        monto: Number(pr.montoNeto),
        moneda: pr.moneda,
        estado: pr.estado,
      })),
    };
  }

  private async resolveTiposCambioCierre(
    empresaId: string,
    periodo: string,
    monedas: string[],
    dto: TraspasoCierreDto,
  ) {
    const tiposCambio: Record<string, number> = { CLP: 1 };
    const requeridas = [...new Set(monedas.map((m) => m.toUpperCase()))]
      .filter((m) => m !== 'CLP');
    if (!requeridas.length) return tiposCambio;

    const { hasta } = limitesPeriodo(periodo);
    const indicador =
      await this.prisma.indicadorBc.findFirst({
        where: { empresaId, fecha: { lte: hasta } },
        orderBy: { fecha: 'desc' },
      })
      ?? await this.prisma.indicadorBc.findFirst({
        where: { empresaId: null, fecha: { lte: hasta } },
        orderBy: { fecha: 'desc' },
      });

    for (const moneda of requeridas) {
      const manual =
        dto.tipoCambio != null
        && dto.monedaTc?.trim().toUpperCase() === moneda
          ? dto.tipoCambio
          : undefined;
      const automatico =
        moneda === 'USD'
          ? indicador?.usd
          : moneda === 'EUR'
            ? indicador?.eur
            : moneda === 'CNY'
              ? indicador?.cny
              : undefined;
      const valor = manual ?? (automatico != null ? Number(automatico) : undefined);
      if (!(valor && valor > 0)) {
        throw new BadRequestException(
          `No existe tipo de cambio ${moneda}/CLP para ${periodo}`,
        );
      }
      tiposCambio[moneda] = valor;
    }
    return tiposCambio;
  }

  async traspasoCierre(
    user: JwtPayload,
    dto: TraspasoCierreDto,
    empresaHeader?: string,
  ) {
    const empresaId = this.activeEmpresa(user, empresaHeader);
    const periodo = await this.assertPeriodoOperable(empresaId, dto.periodo);

    // EX-05: no re-ejecutar traspaso ya cerrado (evita asientos duplicados).
    const cierrePrev = await this.prisma.periodoCierreContratista.findUnique({
      where: { empresaId_periodo: { empresaId, periodo } },
    });
    if (cierrePrev?.cerrado) {
      throw new BadRequestException(
        `El periodo ${periodo} ya fue traspasado/cerrado`
        + (cierrePrev.asientoNumero ? ` (asiento ${cierrePrev.asientoNumero})` : ''),
      );
    }

    const proformas = await this.prisma.proformaContratista.findMany({
      where: {
        empresaId,
        periodo,
        estado: { in: ['DEFINITIVA', 'FACTURADA'] },
      },
      include: {
        contratista: { select: { razonSocial: true } },
        tipoContrato: { select: { nombre: true } },
      },
      orderBy: { numero: 'asc' },
    });
    const proformaIds = proformas.map((p) => p.id);
    for (const proforma of proformas) {
      if (!proforma.tipoContratoId) {
        throw new BadRequestException(
          `La proforma ${proforma.numero} no tiene tipo de contrato`,
        );
      }
    }
    const tiposCambio = await this.resolveTiposCambioCierre(
      empresaId,
      periodo,
      proformas.map((p) => p.moneda),
      dto,
    );
    const montoTotal = Math.round(
      proformas.reduce(
        (a, p) => a + Number(p.montoNeto) * tiposCambio[p.moneda.toUpperCase()],
        0,
      ) * 100,
    ) / 100;

    const tipoCambio = dto.tipoCambio != null && Number.isFinite(dto.tipoCambio)
      ? dto.tipoCambio
      : undefined;
    const monedaTc = dto.monedaTc?.trim().toUpperCase() || 'USD';
    const tcResumen = Object.entries(tiposCambio)
      .filter(([moneda]) => moneda !== 'CLP')
      .map(([moneda, valor]) => `${moneda} ${valor}`)
      .join(', ');
    const tcSuffix = tcResumen ? ` · TC ${tcResumen}/CLP` : '';
    const glosa = (dto.glosa?.trim() || `Traspaso/cierre contratistas ${periodo}`) + tcSuffix;

    // EX-04: pasar periodo contable YYYY-MM cuando se pueda inferir.
    const periodoContable = periodo;

    let asientoId: string | undefined;
    let asientoNumero: string | undefined;
    let lineasAsiento: LineaAsientoInput[] | undefined;
    if (montoTotal > 0) {
      if (!this.contabilizar) {
        throw new BadRequestException(
          'Servicio de contabilización no disponible; no se puede traspasar/cerrar el periodo',
        );
      }
      const ingresos = await this.prisma.ingresoLaborDiario.findMany({
        where: {
          empresaId,
          proformaId: { in: proformaIds },
          estado: { in: ['ASOCIADO', 'FACTURADO'] },
        },
        select: {
          id: true,
          proformaId: true,
          tipoContratoId: true,
          centroCostoId: true,
          monto: true,
        },
      });
      const proformaById = new Map(proformas.map((p) => [p.id, p]));
      const grupos = new Map<
        string,
        {
          tipoContratoId: string;
          centroCostoId: string;
          monto: number;
        }
      >();
      for (const ingreso of ingresos) {
        const proforma = ingreso.proformaId
          ? proformaById.get(ingreso.proformaId)
          : undefined;
        const tipoContratoId =
          ingreso.tipoContratoId ?? proforma?.tipoContratoId;
        if (!proforma || !tipoContratoId) {
          throw new BadRequestException(
            `El ingreso ${ingreso.id} no tiene Proforma/tipo de contrato válido`,
          );
        }
        const key = `${tipoContratoId}:${ingreso.centroCostoId}`;
        const actual = grupos.get(key) ?? {
          tipoContratoId,
          centroCostoId: ingreso.centroCostoId,
          monto: 0,
        };
        actual.monto +=
          Number(ingreso.monto) * tiposCambio[proforma.moneda.toUpperCase()];
        grupos.set(key, actual);
      }
      const tipoIds = [...new Set([...grupos.values()].map((g) => g.tipoContratoId))];
      const configs = new Map(
        await Promise.all(
          tipoIds.map(async (id) => [
            id,
            await this.resolveCuentasTraspaso(empresaId, id),
          ] as const),
        ),
      );
      const lineasDebe = [...grupos.values()].map((grupo) => {
        const config = configs.get(grupo.tipoContratoId)!;
        return {
          debe: Math.round(grupo.monto * 100) / 100,
          haber: 0,
          cuentaId: config.cuentaDebeId,
          centroCostoId: grupo.centroCostoId,
          glosa: `Costo ${config.nombre}`,
        };
      });
      const totalPorTipo = new Map<string, number>();
      for (const grupo of grupos.values()) {
        totalPorTipo.set(
          grupo.tipoContratoId,
          (totalPorTipo.get(grupo.tipoContratoId) ?? 0) + grupo.monto,
        );
      }
      const lineasHaber = [...totalPorTipo].map(([tipoId, monto]) => {
        const config = configs.get(tipoId)!;
        return {
          debe: 0,
          haber: Math.round(monto * 100) / 100,
          cuentaId: config.cuentaHaberId,
          glosa: `Facturas por recibir ${config.nombre}`,
        };
      });
      const totalLineas = lineasDebe.reduce((sum, l) => sum + l.debe, 0);
      if (Math.abs(totalLineas - montoTotal) > 0.02) {
        throw new BadRequestException(
          'El detalle de ingresos no calza con las Proformas del período',
        );
      }
      lineasAsiento = [...lineasDebe, ...lineasHaber];
    }

    const actor = await this.prisma.usuario.findUnique({
      where: { id: user.sub },
      select: { nombre: true },
    });
    const cerradoAt = new Date();
    const cerradoPorNombre = actor?.nombre ?? user.email;
    const cierre = await this.prisma.$transaction(async (tx) => {
      if (lineasAsiento) {
        const asiento = await this.contabilizar!.createAsiento(
          {
            empresaId,
            glosa,
            origen: `TRASPASO-CTR:${periodo}`,
            periodo: periodoContable,
            lineas: lineasAsiento,
          },
          tx,
        );
        asientoId = asiento.id;
        asientoNumero = asiento.numero;
      }
      const row = await tx.periodoCierreContratista.upsert({
        where: { empresaId_periodo: { empresaId, periodo } },
        update: {
          cerrado: true,
          asientoId,
          asientoNumero,
          glosa,
          montoTotal,
          proformaIds,
          tiposCambio: tiposCambio as Prisma.InputJsonValue,
          cerradoAt,
          cerradoPorId: user.sub,
          cerradoPorNombre,
          ...(tipoCambio !== undefined ? { tipoCambio, monedaTc } : { monedaTc }),
        },
        create: {
          empresaId,
          periodo,
          cerrado: true,
          asientoId,
          asientoNumero,
          glosa,
          montoTotal,
          proformaIds,
          tiposCambio: tiposCambio as Prisma.InputJsonValue,
          tipoCambio: tipoCambio ?? null,
          monedaTc,
          cerradoAt,
          cerradoPorId: user.sub,
          cerradoPorNombre,
        },
      });
      await tx.periodoCierreContratistaEvento.create({
        data: {
          cierreId: row.id,
          empresaId,
          accion: 'CERRAR',
          motivo: dto.glosa?.trim() || null,
          usuarioId: user.sub,
          usuarioNombre: cerradoPorNombre,
        },
      });
      await this.registrarAuditoria(
        user,
        {
          empresaId,
          entidad: 'PERIODO',
          entidadId: row.id,
          accion: 'CERRAR',
          antes: cierrePrev,
          despues: row,
          metadata: { periodo, asientoNumero, proformaIds },
        },
        tx,
      );
      return row;
    });

    return {
      ...this.mapCierreTraspaso(cierre),
      proformas: proformas.length,
      detalle: proformas.map((pr) => ({
        id: pr.id,
        numero: pr.numero,
        contratista: pr.contratista.razonSocial,
        periodo: pr.periodo,
        monto: Number(pr.montoNeto),
        montoClp:
          Math.round(
            Number(pr.montoNeto) * tiposCambio[pr.moneda.toUpperCase()] * 100,
          ) / 100,
        tipoCambio: tiposCambio[pr.moneda.toUpperCase()],
        moneda: pr.moneda,
        estado: pr.estado,
      })),
    };
  }

  async reabrirCierre(
    user: JwtPayload,
    periodoRaw: string,
    dto: ReabrirCierreContratistaDto,
    empresaHeader?: string,
  ) {
    const empresaId = this.activeEmpresa(user, empresaHeader);
    const periodo = assertPeriodoContratista(periodoRaw);
    const cierre = await this.prisma.periodoCierreContratista.findUnique({
      where: { empresaId_periodo: { empresaId, periodo } },
    });
    if (!cierre?.cerrado) {
      throw new BadRequestException(`El período ${periodo} no está cerrado`);
    }
    const contable = await this.prisma.periodoContable.findUnique({
      where: { empresaId_codigo: { empresaId, codigo: periodo } },
    });
    if (contable?.estado === 'CERRADO') {
      throw new ConflictException(
        `Primero debe reabrirse el período contable ${periodo}`,
      );
    }
    if (!this.contabilizar && cierre.asientoId) {
      throw new BadRequestException('Servicio de contabilización no disponible');
    }

    let reversaNumero: string | undefined;
    const original = cierre.asientoId
      ? await this.prisma.asiento.findFirst({
          where: { id: cierre.asientoId, empresaId },
        })
      : null;

    const actor = await this.prisma.usuario.findUnique({
      where: { id: user.sub },
      select: { nombre: true },
    });
    const usuarioNombre = actor?.nombre ?? user.email;
    const reopened = await this.prisma.$transaction(async (tx) => {
      if (original && original.estado !== 'ANULADO') {
        const reversa = await this.contabilizar!.createAsientoReversa(
          empresaId,
          original.id,
          `Reapertura Contratistas ${periodo}: ${dto.motivo.trim()}`,
          tx,
        );
        reversaNumero = reversa.numero;
        await tx.asiento.update({
          where: { id: original.id },
          data: { estado: 'ANULADO' },
        });
      }
      const row = await tx.periodoCierreContratista.update({
        where: { id: cierre.id },
        data: {
          cerrado: false,
          asientoId: null,
          asientoNumero: null,
          proformaIds: [],
          cerradoAt: null,
          cerradoPorId: null,
          cerradoPorNombre: null,
        },
      });
      await tx.periodoCierreContratistaEvento.create({
        data: {
          cierreId: cierre.id,
          empresaId,
          accion: 'REABRIR',
          motivo: dto.motivo.trim(),
          usuarioId: user.sub,
          usuarioNombre,
        },
      });
      await this.registrarAuditoria(
        user,
        {
          empresaId,
          entidad: 'PERIODO',
          entidadId: cierre.id,
          accion: 'REABRIR',
          antes: cierre,
          despues: row,
          metadata: { periodo, reversaNumero },
        },
        tx,
      );
      return row;
    });
    return {
      ...this.mapCierreTraspaso(reopened),
      reversaNumero,
    };
  }
}
