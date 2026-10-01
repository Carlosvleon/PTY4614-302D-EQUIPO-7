import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../auth/jwt.strategy';
import {
  assertTenantAccess,
  isSuperAdmin,
  resolveOperationalEmpresa,
  resolveTenant,
} from '../../auth/tenant.util';
import { assertPinAprobacion } from '../../auth/pin-aprobacion';
import { userHasPermission } from '../../auth/permission.util';
import { ContabilizarService } from '../contabilidad/contabilizar.service';
import {
  combinarDimensiones,
  dimensionesDeConfigSii,
  type DimensionesAsiento,
} from '../contabilidad/config-sii-dimensiones.util';
import { assertCuentaImputable } from '../contabilidad/cuenta-imputable.util';
import { CuentaCorrienteService } from '../tesoreria/cuenta-corriente.service';
import { upsertAgingDesdeCompra, normalizarCondicionPagoDias } from '../tesoreria/aging-sync.util';
import { normalizeRut } from '../tesoreria/cuenta-corriente.util';
import { NotificacionesService } from '../dashboard/notificaciones.service';
import {
  BillingGatewayClient,
  type BillingArtifact,
  type DteArtifactKind,
  type PurchaseChangeStatusResult,
  type PurchaseReceivedDocument,
} from '../billing/billing-gateway.client';
import { extractOcReferenciasFromDteXml, parseStoredOcReferencias } from './dte-oc-referencias.util';
import {
  extractEmisorFromDteXml,
  GOSOCKET_PROVEEDOR_PLACEHOLDER,
  isProveedorFacturaPlaceholder,
} from './dte-xml-emisor.util';
import {
  extractTotalesFromDteXml,
  resolveMontoNetoRegistroCompra,
} from './dte-xml-totales.util';
import { allocateOcNumero } from './oc-numero.util';
import {
  ocNoAprobada,
  ocPermiteAsociarFactura,
  ocPermiteContabilizarOPagar,
} from './oc-estado.util';
import {
  loadDelegacionesAprobacion,
  loadGruposAprobacion,
  loadNodosEscala,
  loadUsuariosOrganigrama,
  resolveCadenaCompleta,
  resolveGrupoSolicitante,
  hasGruposActivos,
  type AprobadorPaso,
} from '../aprobaciones/approval-engine';
import {
  logicaPaso,
  marcarAprobadoresEnSnapshot,
  pasosFromCadenaEngine,
  resolveSnapshot,
  resolverAccionPaso,
  type PasoCadena,
} from '../aprobaciones/aprobacion-cadena.util';
import {
  UpsertOrdenCompraDto,
  UpsertRecepcionOcDto,
  UpdateRecepcionOcDto,
  UpsertRegistroCompraDto,
  CargaMasivaRegistrosCompraDto,
  LineaCompraDto,
  SincronizarRegistrosCompraDto,
  AceptarRegistroCompraDto,
  RechazarRegistroCompraDto,
} from './dto/compras.dto';
import {
  isMonedaTc,
  normalizeMonedaTc,
  tcDeFecha,
  type IndicadorTcRow,
} from '../catalogos/tipo-cambio.util';

/**
 * Códigos de evento GoSocket (Chile). Deben coincidir con GOSOCKET_EVENT_* en
 * billing-gateway/src/adapters/gosocket/document-status.ts (repos distintos, sin import compartido).
 */
const GOSOCKET_EVENT_ACUSE_RECIBO = 30;
const GOSOCKET_EVENT_RECLAMO = 31;
const GOSOCKET_EVENT_RECIBO_MERCADERIA = 32;
const GOSOCKET_EVENT_ACEPTACION = 33;

const ESTADOS_DOC = new Set([
  'BORRADOR',
  'PENDIENTE_APROBACION',
  'EMITIDO',
  'APROBADO',
  'FACTURADO',
  'ANULADO',
  'VENCIDO',
  'RECHAZADO',
  'CONTABILIZADA',
  'RECEPCIONADA',
]);

/** Cliente legacy puede mandar EMITIDO; al entrar a cadena el estado operativo es PENDIENTE_APROBACION. */
function ocEnviaAprobacion(estado: string): boolean {
  return estado === 'EMITIDO' || estado === 'PENDIENTE_APROBACION';
}

export const MOTIVO_RECHAZO_MIN = 5;
export const MOTIVO_RECHAZO_REQUIRED_MSG =
  'El motivo del rechazo es obligatorio (mínimo 5 caracteres).';

function requireMotivoRechazo(raw?: string | null): string {
  const motivo = (raw ?? '').trim();
  if (motivo.length < MOTIVO_RECHAZO_MIN) {
    throw new BadRequestException(MOTIVO_RECHAZO_REQUIRED_MSG);
  }
  return motivo;
}
const AFACTOS = new Set(['AFECTO', 'EXENTO', 'MIXTO']);

type LineaCompraNorm = {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
  centroCostoId?: string;
  centroCosto?: string;
  cuentaContableId?: string;
  cuentaContable?: string;
};

function isoDate(value: Date | string | null | undefined): string | undefined {
  if (value == null || value === '') return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

function fechaDocumentoFromEmision(fechaEmision: string | null | undefined): Date | undefined {
  const raw = fechaEmision?.trim().slice(0, 10);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  return parseDate(raw);
}

function parseDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Fecha inválida: ${value}`);
  return d;
}

function normalizeLineasCompra(raw?: LineaCompraDto[] | null): LineaCompraNorm[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) throw new BadRequestException('lineas debe ser un arreglo');
  const out: LineaCompraNorm[] = [];
  for (const [i, l] of raw.entries()) {
    const descripcion = String(l?.descripcion ?? '').trim();
    const cantidad = Number(l?.cantidad);
    const precioUnitario = Number(l?.precioUnitario);
    if (!descripcion) throw new BadRequestException(`Línea ${i + 1}: descripción requerida`);
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      throw new BadRequestException(`Línea ${i + 1}: cantidad inválida`);
    }
    if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
      throw new BadRequestException(`Línea ${i + 1}: precio inválido`);
    }
    const total = Math.round(cantidad * precioUnitario * 100) / 100;
    const centroCostoId = String(l?.centroCostoId ?? '').trim() || undefined;
    const centroCosto = String(l?.centroCosto ?? '').trim() || undefined;
    const cuentaContableId = String(l?.cuentaContableId ?? '').trim() || undefined;
    const cuentaContable = String(l?.cuentaContable ?? '').trim() || undefined;
    out.push({
      descripcion,
      cantidad,
      precioUnitario,
      total,
      ...(centroCostoId ? { centroCostoId } : {}),
      ...(centroCosto ? { centroCosto } : {}),
      ...(cuentaContableId ? { cuentaContableId } : {}),
      ...(cuentaContable ? { cuentaContable } : {}),
    });
  }
  return out;
}

function totalCompraParaTesoreria(neto: number, afacto?: string | null): number {
  const a = (afacto ?? 'AFECTO').toUpperCase();
  if (a === 'EXENTO') return Math.round(neto * 100) / 100;
  return Math.round(neto * 1.19 * 100) / 100;
}

function netoFromLineasCompra(lineas: LineaCompraNorm[]): number {
  return Math.round(lineas.reduce((a, l) => a + l.total, 0) * 100) / 100;
}

function parseStoredLineasCompra(value: unknown): LineaCompraNorm[] | undefined {
  if (!Array.isArray(value) || !value.length) return undefined;
  return value.map((l) => {
    const row = l as Partial<LineaCompraNorm>;
    const cantidad = Number(row.cantidad) || 0;
    const precioUnitario = Number(row.precioUnitario) || 0;
    const total = row.total != null
      ? Number(row.total)
      : Math.round(cantidad * precioUnitario * 100) / 100;
    const centroCostoId = String(row.centroCostoId ?? '').trim() || undefined;
    const centroCosto = String(row.centroCosto ?? '').trim() || undefined;
    return {
      descripcion: String(row.descripcion ?? ''),
      cantidad,
      precioUnitario,
      total,
      ...(centroCostoId ? { centroCostoId } : {}),
      ...(centroCosto ? { centroCosto } : {}),
    };
  });
}

function mapRegistro(row: {
  id: string;
  ocNumero: string;
  factura: string;
  proveedorOc: string;
  proveedorFactura: string;
  proveedorId?: string | null;
  monto: Prisma.Decimal | number;
  afactoOc?: string | null;
  afactoFactura?: string | null;
  afactoOk: boolean;
  matchOk?: boolean | null;
  matchDiff?: Prisma.Decimal | number | null;
  estado: string;
  lineas?: Prisma.JsonValue | null;
  ordenCompra?: { estado: string } | null;
  ocEstado?: string | null;
  aceptacionEstado?: string | null;
  aceptadaAt?: Date | string | null;
  aceptacionOrigen?: string | null;
  aceptadaPorId?: string | null;
  aceptadaPorNombre?: string | null;
  gosocketGlobalDocumentId?: string | null;
  gosocketCountryDocumentId?: string | null;
  gosocketEstado?: string | null;
  gosocketAuthorityStatus?: string | null;
  gosocketRechazoOrigen?: string | null;
  gosocketRechazoMotivo?: string | null;
  gosocketPdfDisponible?: boolean | null;
  gosocketSincronizadoAt?: Date | string | null;
  gosocketOcReferencias?: Prisma.JsonValue | null;
  gosocketRutEmisor?: string | null;
  fechaDocumento?: Date | string | null;
  createdAt?: Date | string | null;
}) {
  const ocReferencias = parseStoredOcReferencias(row.gosocketOcReferencias);
  const ocEstado = row.ordenCompra?.estado ?? row.ocEstado ?? undefined;
  const aceptadaAt = row.aceptadaAt
    ? (row.aceptadaAt instanceof Date ? row.aceptadaAt.toISOString() : String(row.aceptadaAt))
    : undefined;
  const gosocketSincronizadoAt = row.gosocketSincronizadoAt
    ? (row.gosocketSincronizadoAt instanceof Date
      ? row.gosocketSincronizadoAt.toISOString()
      : String(row.gosocketSincronizadoAt))
    : undefined;
  const fecha = isoDate(row.fechaDocumento ?? row.createdAt);
  return {
    id: row.id,
    fecha,
    ocNumero: row.ocNumero,
    ocReferencias: ocReferencias.length ? ocReferencias : undefined,
    factura: row.factura,
    proveedorOc: row.proveedorOc,
    proveedorFactura: row.proveedorFactura,
    proveedorId: row.proveedorId ?? undefined,
    monto: Number(row.monto),
    afactoOc: row.afactoOc ?? undefined,
    afactoFactura: row.afactoFactura ?? undefined,
    afactoOk: row.afactoOk,
    // P1-10: matching de 3 vías OC-recepción-factura.
    matchOk: row.matchOk ?? true,
    matchDiff: row.matchDiff != null ? Number(row.matchDiff) : undefined,
    estado: row.estado,
    ocEstado,
    ocNoAprobada: ocNoAprobada(ocEstado),
    aceptacionEstado: row.aceptacionEstado ?? 'PENDIENTE',
    aceptadaAt,
    aceptacionOrigen: row.aceptacionOrigen ?? undefined,
    aceptadaPorNombre: row.aceptadaPorNombre ?? undefined,
    lineas: parseStoredLineasCompra(row.lineas),
    ...(row.gosocketGlobalDocumentId
      ? {
        gosocket: {
          globalDocumentId: row.gosocketGlobalDocumentId,
          countryDocumentId: row.gosocketCountryDocumentId ?? undefined,
          estado: (row.gosocketEstado ?? 'PENDIENTE') as 'ACEPTADO' | 'PENDIENTE' | 'RECHAZADO',
          authorityStatus: row.gosocketAuthorityStatus ?? undefined,
          rechazoOrigen: (row.gosocketRechazoOrigen ?? undefined) as
            | 'SII'
            | 'COMERCIAL'
            | undefined,
          rechazoMotivo: row.gosocketRechazoMotivo ?? undefined,
          pdfDisponible: row.gosocketPdfDisponible ?? false,
          sincronizadoAt: gosocketSincronizadoAt,
          rutEmisor: row.gosocketRutEmisor ?? undefined,
        },
      }
      : {}),
  };
}

function mapOc(row: {
  id: string;
  numero: string;
  fecha: Date;
  proveedor: string;
  proveedorId?: string | null;
  solicitante: string;
  creadoPorId?: string | null;
  creadoPorNombre?: string | null;
  aprobadorId?: string | null;
  aprobadorNombre?: string | null;
  aprobacionCadenaIds?: string[];
  aprobacionCadena?: Prisma.JsonValue | null;
  aprobacionPasoActual?: number;
  aprobacionPasosTotal?: number;
  moneda: string;
  neto: Prisma.Decimal;
  afacto: string;
  estado: string;
  departamento: string;
  cuentaContableId?: string | null;
  centroCostoId?: string | null;
  elementoCostoId?: string | null;
  distribucionCc: Prisma.JsonValue | null;
  lineas?: Prisma.JsonValue | null;
  referenciaTipo?: string | null;
  referenciaFolio?: string | null;
  referenciaFecha?: Date | null;
  motivoRechazo?: string | null;
  condicionPagoDias?: number | null;
  updatedAt?: Date;
}) {
  return {
    id: row.id,
    numero: row.numero,
    fecha: row.fecha.toISOString().slice(0, 10),
    proveedor: row.proveedor,
    proveedorId: row.proveedorId ?? undefined,
    solicitante: row.solicitante,
    creadoPorId: row.creadoPorId ?? undefined,
    creadoPorNombre: row.creadoPorNombre ?? undefined,
    aprobadorId: row.aprobadorId ?? undefined,
    aprobadorNombre: row.aprobadorNombre ?? undefined,
    aprobacionCadenaIds: row.aprobacionCadenaIds?.length
      ? row.aprobacionCadenaIds
      : undefined,
    aprobacionCadena: row.aprobacionCadena ?? undefined,
    aprobacionPasoActual: row.aprobacionPasoActual ?? undefined,
    aprobacionPasosTotal: row.aprobacionPasosTotal ?? undefined,
    moneda: row.moneda,
    neto: Number(row.neto),
    afacto: row.afacto,
    estado: row.estado,
    departamento: row.departamento,
    cuentaContableId: row.cuentaContableId ?? undefined,
    centroCostoId: row.centroCostoId ?? undefined,
    elementoCostoId: row.elementoCostoId ?? undefined,
    distribucionCc: (row.distribucionCc as unknown[]) ?? undefined,
    lineas: parseStoredLineasCompra(row.lineas),
    referenciaTipo: row.referenciaTipo ?? undefined,
    referenciaFolio: row.referenciaFolio ?? undefined,
    referenciaFecha: row.referenciaFecha
      ? row.referenciaFecha.toISOString().slice(0, 10)
      : undefined,
    motivoRechazo: row.motivoRechazo ?? undefined,
    condicionPagoDias: normalizarCondicionPagoDias(row.condicionPagoDias) ?? undefined,
    updatedAt: row.updatedAt?.toISOString(),
  };
}

async function persistirFilasPaso(
  tx: Prisma.TransactionClient,
  oc: {
    id: string;
    numero: string;
    proveedor: string;
    neto: Prisma.Decimal | number;
    solicitante: string;
    fecha: Date;
  },
  paso: PasoCadena,
  pasoOrden: number,
  pasoTotal: number,
  empresaId: string,
) {
  for (const a of paso.aprobadores) {
    await tx.aprobacionOc.create({
      data: {
        ocId: oc.id,
        ocNumero: oc.numero,
        proveedor: oc.proveedor,
        monto: oc.neto,
        solicitante: oc.solicitante,
        aprobadorId: a.id,
        aprobadorNombre: a.nombre,
        logica: paso.logica,
        pasoOrden,
        pasoTotal,
        estado: 'PENDIENTE',
        fecha: oc.fecha,
        empresaId,
      },
    });
  }
}

type OcParaRegistro = { numero: string; estado: string } | null | undefined;

@Injectable()
export class ComprasService {
  constructor(
    private prisma: PrismaService,
    @Optional() private contabilizar?: ContabilizarService,
    @Optional() private cuentaCorriente?: CuentaCorrienteService,
    @Optional() private notificaciones?: NotificacionesService,
    @Optional() private billing?: BillingGatewayClient,
  ) {}

  /** Solo acepta cuenta activa e imputable. SII padre (no imputable) → undefined. */
  private async cuentaSiImputable(
    empresaId: string,
    cuentaId?: string | null,
  ): Promise<string | undefined> {
    const id = cuentaId?.trim();
    if (!id) return undefined;
    const row = await this.prisma.cuentaContable.findFirst({
      where: { id, empresaId, activa: true, noImputable: false },
      select: { id: true },
    });
    return row?.id;
  }

  private async primeraImputable(
    empresaId: string,
    exclude: string[] = [],
  ): Promise<string | undefined> {
    const row = await this.prisma.cuentaContable.findFirst({
      where: {
        empresaId,
        activa: true,
        noImputable: false,
        ...(exclude.length ? { id: { notIn: exclude } } : {}),
      },
      orderBy: { codigo: 'asc' },
      select: { id: true },
    });
    return row?.id;
  }

  /**
   * P0-1: el asiento COMPRA nunca sale sin cuentaId. Gasto = OC (si imputable)
   * o Config SII COMPRAS/GASTO_COMPRA; haber = PROVEEDORES si imputable.
   * Un mapeo SII a cuenta padre se ignora y se cae al plan imputable.
   */
  private async resolveCuentasAsientoCompra(
    empresaId: string,
    preferGastoId?: string | null,
  ): Promise<{
    gastoId: string;
    proveedoresId: string;
    dimGasto: DimensionesAsiento;
    dimProveedores: DimensionesAsiento;
  }> {
    if (preferGastoId?.trim()) {
      await assertCuentaImputable(this.prisma, empresaId, preferGastoId);
    }
    let gastoId = preferGastoId?.trim() || undefined;
    let dimGasto: DimensionesAsiento = {};
    if (!gastoId) {
      const cfgs = await this.prisma.configContableSii.findMany({
        where: {
          empresaId,
          activa: true,
          tipoDocumentoSii: { in: ['COMPRAS', 'GASTO_COMPRA', 'COMPRA'] },
        },
      });
      for (const c of cfgs) {
        gastoId = await this.cuentaSiImputable(empresaId, c.cuentaContableId);
        if (gastoId) {
          dimGasto = dimensionesDeConfigSii(c);
          break;
        }
      }
    }
    if (!gastoId) gastoId = await this.primeraImputable(empresaId);
    if (!gastoId) {
      throw new BadRequestException(
        'No hay cuenta imputable para el asiento de compra (Config SII → COMPRAS o plan de cuentas).',
      );
    }

    const cfgProv = await this.prisma.configContableSii.findFirst({
      where: { empresaId, activa: true, tipoDocumentoSii: 'PROVEEDORES' },
    });
    let proveedoresId = await this.cuentaSiImputable(empresaId, cfgProv?.cuentaContableId);
    let dimProveedores = proveedoresId ? dimensionesDeConfigSii(cfgProv) : {};
    if (!proveedoresId) {
      proveedoresId = await this.primeraImputable(empresaId, [gastoId]);
      dimProveedores = {};
    }
    if (!proveedoresId) {
      throw new BadRequestException(
        'No hay cuenta imputable de proveedores para el asiento de compra (Config SII → PROVEEDORES).',
      );
    }
    return { gastoId, proveedoresId, dimGasto, dimProveedores };
  }

  /** OC no pide área; el plan sí. Completa CC/área/elemento con el primero ligado a la cuenta. */
  private completarDimensionesDesdePlan(
    cuenta: {
      codigo: string;
      requiereCc: boolean;
      requiereArea: boolean;
      requiereElemento: boolean;
      centrosCosto?: { centroCostoId: string }[];
      areasNegocio?: { areaNegocioId: string }[];
      elementosCosto?: { elementoCostoId: string }[];
    } | null,
    dim: DimensionesAsiento,
  ): DimensionesAsiento {
    if (!cuenta) return dim;
    const out = { ...dim };
    if (cuenta.requiereCc && !out.centroCostoId) {
      const id = cuenta.centrosCosto?.[0]?.centroCostoId;
      if (id) out.centroCostoId = id;
    }
    if (cuenta.requiereArea && !out.areaNegocioId) {
      const id = cuenta.areasNegocio?.[0]?.areaNegocioId;
      if (id) out.areaNegocioId = id;
    }
    if (cuenta.requiereElemento && !out.elementoCostoId) {
      const id = cuenta.elementosCosto?.[0]?.elementoCostoId;
      if (id) out.elementoCostoId = id;
    }
    return out;
  }

  private async dimsDeCuenta(
    empresaId: string,
    cuentaId: string,
    dim: DimensionesAsiento,
  ): Promise<DimensionesAsiento> {
    const cuenta = await this.prisma.cuentaContable.findFirst({
      where: { id: cuentaId, empresaId },
      include: {
        centrosCosto: { select: { centroCostoId: true } },
        areasNegocio: { select: { areaNegocioId: true } },
        elementosCosto: { select: { elementoCostoId: true } },
      },
    });
    return this.completarDimensionesDesdePlan(cuenta, dim);
  }

  private async crearAsientoRegistroCompra(opts: {
    empresaId: string;
    factura: string;
    monto: number;
    cuentaContableId?: string | null;
    centroCostoId?: string | null;
    areaNegocioId?: string | null;
    elementoCostoId?: string | null;
    ocId?: string | null;
  }) {
    const oc =
      opts.ocId != null
        ? await this.prisma.ordenCompra.findFirst({
            where: { id: opts.ocId, empresaId: opts.empresaId },
            select: {
              referenciaTipo: true,
              proformasContratista: {
                take: 1,
                select: { tipoContratoId: true },
              },
            },
          })
        : null;

    const esProformaContratista = oc?.referenciaTipo === 'PROFORMA_CONTRATISTA';
    const tipoContratoId = oc?.proformasContratista[0]?.tipoContratoId;

    if (esProformaContratista && tipoContratoId) {
      const tipo = await this.prisma.tipoContratoContratista.findFirst({
        where: { id: tipoContratoId, empresaId: opts.empresaId, activa: true },
        include: { cuentaHaber: true },
      });
      if (!tipo?.cuentaHaber?.activa || tipo.cuentaHaber.noImputable) {
        throw new BadRequestException(
          'Tipo de contrato sin cuenta Facturas por recibir imputable',
        );
      }
      const { proveedoresId, dimProveedores } = await this.resolveCuentasAsientoCompra(
        opts.empresaId,
        null,
      );
      const dim = opts.centroCostoId ? { centroCostoId: opts.centroCostoId } : {};
      return this.contabilizar!.createAsiento({
        empresaId: opts.empresaId,
        glosa: `Registro compra ${opts.factura} · contratistas`,
        origen: `COMPRA:${opts.factura}`,
        lineas: [
          {
            debe: opts.monto,
            haber: 0,
            cuentaId: tipo.cuentaHaberId,
            glosa: 'Facturas por recibir contratistas',
            ...dim,
          },
          {
            debe: 0,
            haber: opts.monto,
            cuentaId: proveedoresId,
            glosa: 'Proveedores',
            ...dimProveedores,
          },
        ],
      });
    }

    const { gastoId, proveedoresId, dimGasto, dimProveedores } =
      await this.resolveCuentasAsientoCompra(opts.empresaId, opts.cuentaContableId);
    const dimOc = combinarDimensiones(
      {
        ...(opts.centroCostoId ? { centroCostoId: opts.centroCostoId } : {}),
        ...(opts.areaNegocioId ? { areaNegocioId: opts.areaNegocioId } : {}),
        ...(opts.elementoCostoId ? { elementoCostoId: opts.elementoCostoId } : {}),
      },
      dimGasto,
    );
    const [dim, dimProv] = await Promise.all([
      this.dimsDeCuenta(opts.empresaId, gastoId, dimOc),
      this.dimsDeCuenta(opts.empresaId, proveedoresId, dimProveedores),
    ]);
    return this.contabilizar!.createAsiento({
      empresaId: opts.empresaId,
      glosa: `Registro compra ${opts.factura}`,
      origen: `COMPRA:${opts.factura}`,
      lineas: [
        { debe: opts.monto, haber: 0, cuentaId: gastoId, glosa: 'Gasto/compra', ...dim },
        {
          debe: 0,
          haber: opts.monto,
          cuentaId: proveedoresId,
          glosa: 'Proveedores',
          ...dimProv,
        },
      ],
    });
  }

  private async notificarPasoPendiente(
    empresaId: string,
    oc: {
      id: string;
      numero: string;
      proveedor: string;
      solicitante: string;
      neto: Prisma.Decimal | number;
      creadoPorId?: string | null;
    },
    opts?: { notificarSolicitante?: boolean; detallePendiente?: string },
  ) {
    const apRows = await this.prisma.aprobacionOc.findMany({
      where: { ocId: oc.id, estado: 'PENDIENTE' },
      select: { id: true, aprobadorId: true },
    });
    for (const apRow of apRows ?? []) {
      if (!apRow.aprobadorId) continue;
      await this.notificaciones?.upsert({
        userId: apRow.aprobadorId,
        empresaId,
        tipo: 'OC_PENDIENTE',
        titulo: `OC ${oc.numero} pendiente`,
        detalle:
          opts?.detallePendiente
          ?? `${oc.proveedor} · ${oc.solicitante}`,
        href: `/compras/aprobaciones?open=${encodeURIComponent(apRow.id)}`,
        refKey: `oc-pend:${apRow.id}`,
        monto: Number(oc.neto),
      });
    }
    if (opts?.notificarSolicitante && oc.creadoPorId) {
      await this.notificaciones?.upsert({
        userId: oc.creadoPorId,
        empresaId,
        tipo: 'OC_ENVIADA',
        titulo: `OC ${oc.numero} enviada a aprobación`,
        detalle: `Tu solicitud ${oc.numero} fue enviada a aprobación`,
        href: `/compras/ordenes?open=${encodeURIComponent(oc.id)}`,
        refKey: `oc-env:${oc.id}`,
        monto: Number(oc.neto),
      });
    }
  }

  /** Asociar factura: ASOCIAR. Contabilizar/pagar: OPERAR (APROBADO o posterior). */
  private assertOcParaRegistroCompra(oc: OcParaRegistro, opts: { contabilizar: boolean }) {
    if (!oc) return;
    if (opts.contabilizar) {
      if (!ocPermiteContabilizarOPagar(oc.estado)) {
        throw new BadRequestException(
          `No se puede contabilizar ni pagar: la OC ${oc.numero} no está aprobada (estado actual: ${oc.estado}).`,
        );
      }
      return;
    }
    if (!ocPermiteAsociarFactura(oc.estado)) {
      throw new BadRequestException(
        `La OC ${oc.numero} no admite asociar factura (estado actual: ${oc.estado}).`,
      );
    }
  }

  async getOrdenes(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.ordenCompra.findMany({
      where: { empresaId },
      orderBy: { fecha: 'desc' },
    });
    return rows.map(mapOc);
  }

  private async resolveProveedorForOc(
    empresaId: string,
    dto: { proveedorId?: string; proveedor: string },
  ) {
    let proveedorId = dto.proveedorId?.trim() || null;
    let proveedorNombre = dto.proveedor.trim();
    if (proveedorId) {
      const p = await this.prisma.proveedor.findFirst({
        where: { id: proveedorId, empresaId, activo: true },
      });
      if (!p) throw new BadRequestException('Proveedor no encontrado o inactivo');
      proveedorNombre = p.razonSocial;
      return { proveedorId: p.id, proveedorNombre };
    }
    if (!proveedorNombre) throw new BadRequestException('Selecciona un proveedor');
    const byName = await this.prisma.proveedor.findFirst({
      where: { empresaId, razonSocial: { equals: proveedorNombre, mode: 'insensitive' } },
    });
    if (byName) {
      return { proveedorId: byName.id, proveedorNombre: byName.razonSocial };
    }
    throw new BadRequestException(
      'Proveedor no está en el maestro. Créalo en Catálogos → Proveedores.',
    );
  }

  /**
   * Resuelve el monto neto en CLP para evaluar la escala de aprobación.
   * Si la OC es en USD, EUR o CNY, busca el TC del Banco Central más reciente para esa fecha.
   */
  async resolveNetoClpParaCadena(
    empresaId: string,
    neto: number,
    monedaRaw?: string,
    fechaIso?: string,
  ): Promise<number> {
    if (!Number.isFinite(neto) || neto <= 0) return neto;
    const moneda = normalizeMonedaTc(monedaRaw);
    if (moneda === 'CLP' || !isMonedaTc(moneda)) return neto;
    try {
      if (!this.prisma?.indicadorBc?.findMany) return neto;
      const rows = await this.prisma.indicadorBc.findMany({
        where: { OR: [{ empresaId }, { empresaId: null }] },
        orderBy: { fecha: 'desc' },
        take: 30,
      });
      if (!rows.length) return neto;
      const mapped: IndicadorTcRow[] = rows.map((r) => ({
        fecha: r.fecha.toISOString().slice(0, 10),
        usd: Number(r.usd),
        eur: Number(r.eur),
        cny: Number(r.cny),
      }));
      const fecha = fechaIso ? fechaIso.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const tc = tcDeFecha(mapped, fecha, moneda);
      if (tc && tc > 0) {
        return Math.round(neto * tc);
      }
    } catch {
      // Fallback fail-soft
    }
    return neto;
  }

  async previewCadena(user: JwtPayload, monto: number, empresaHeader?: string, moneda?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const montoClp = await this.resolveNetoClpParaCadena(empresaId, monto, moneda);
    const computed = await this.computeCadenaAprobacion(empresaId, user, montoClp);
    let grupo = computed.grupo;
    if (grupo) {
      const g = await this.prisma.grupoAprobacion.findFirst({
        where: { id: grupo.id, empresaId },
        select: { id: true, nombre: true },
      });
      if (g) grupo = g;
    }
    return {
      status: computed.status,
      modulo: 'Compras' as const,
      monto,
      grupo,
      solicitanteId: user.sub,
      cadena: computed.cadena,
      motivos: [] as string[],
      workflowNombre: computed.workflowNombre,
    };
  }

  private async computeCadenaAprobacion(
    empresaId: string,
    user: JwtPayload,
    neto: number,
    solicitanteUserId = user.sub,
  ): Promise<{
    status: 'ok' | 'no_pool' | 'sin_grupo' | 'sin_cadena';
    aprobadorId: string | null;
    aprobadorNombre: string | null;
    cadenaIds: string[];
    pasoTotal: number;
    cadena: AprobadorPaso[];
    grupo: { id: string; nombre: string } | null;
    workflowNombre: string | null;
  }> {
    const empty = {
      aprobadorId: null as string | null,
      aprobadorNombre: null as string | null,
      cadenaIds: [] as string[],
      pasoTotal: 0,
      cadena: [] as AprobadorPaso[],
      grupo: null as { id: string; nombre: string } | null,
      workflowNombre: null as string | null,
    };
    if (!Number.isFinite(neto) || neto <= 0) {
      const grupos = await loadGruposAprobacion(this.prisma, empresaId);
      const solicitanteEsMantenedor = isSuperAdmin(user) && solicitanteUserId === user.sub;
      const grupoRow = resolveGrupoSolicitante(
        solicitanteUserId,
        'Compras',
        grupos,
        solicitanteEsMantenedor,
      );
      const grupo = grupoRow ? { id: grupoRow.id, nombre: grupoRow.nombre } : null;
      return { status: 'no_pool', ...empty, grupo };
    }
    const [rules, usuarios, delegaciones, grupos, nodos] = await Promise.all([
      this.prisma.workflowConfig.findMany({
        where: {
          empresaId,
          activo: true,
          modulo: { equals: 'Compras', mode: 'insensitive' },
        },
        orderBy: { montoMin: 'asc' },
      }),
      loadUsuariosOrganigrama(this.prisma, empresaId),
      loadDelegacionesAprobacion(this.prisma, empresaId),
      loadGruposAprobacion(this.prisma, empresaId),
      loadNodosEscala(this.prisma, empresaId, 'Compras'),
    ]);
    const match = rules.find(
      (r) => neto >= Number(r.montoMin) && neto <= Number(r.montoMax),
    );
    const workflowNombre = match?.nombre ?? null;
    const allowedIds = match?.aprobadorIds?.filter(Boolean) ?? [];
    const useGrupos = hasGruposActivos('Compras', grupos);
    const solicitanteEsMantenedor = isSuperAdmin(user) && solicitanteUserId === user.sub;
    if (!allowedIds.length && !useGrupos) {
      return { status: 'no_pool', ...empty, workflowNombre };
    }
    const resolved = resolveCadenaCompleta({
      solicitanteId: solicitanteUserId,
      monto: neto,
      modulo: 'Compras',
      usuarios,
      allowedIds,
      grupos,
      nodos,
      delegaciones,
      solicitanteEsMantenedor,
    });
    const grupoRow = resolveGrupoSolicitante(
      solicitanteUserId,
      'Compras',
      grupos,
      solicitanteEsMantenedor,
    );
    const grupo = grupoRow ? { id: grupoRow.id, nombre: grupoRow.id } : null;
    if (resolved.status !== 'ok') {
      return { status: resolved.status, ...empty, grupo, workflowNombre };
    }
    return {
      status: 'ok',
      aprobadorId: resolved.aprobadorId,
      aprobadorNombre: resolved.aprobadorNombre,
      cadenaIds: resolved.cadenaIds,
      pasoTotal: resolved.pasoTotal,
      cadena: resolved.cadena,
      grupo,
      workflowNombre,
    };
  }

  private async resolveCadenaAprobacion(
    empresaId: string,
    user: JwtPayload,
    neto: number,
    solicitanteUserId = user.sub,
  ): Promise<{
    aprobadorId: string | null;
    aprobadorNombre: string | null;
    cadenaIds: string[];
    pasoTotal: number;
    cadena: AprobadorPaso[];
    pasos: PasoCadena[];
  }> {
    const resolved = await this.computeCadenaAprobacion(
      empresaId,
      user,
      neto,
      solicitanteUserId,
    );
    if (resolved.status === 'sin_grupo') {
      throw new BadRequestException(
        'El usuario no pertenece a un grupo de aprobación Compras. Asígnelo en Admin › Reglas de aprobación › Grupos Compras.',
      );
    }
    if (resolved.status === 'sin_cadena') {
      throw new BadRequestException(
        'No se pudo armar la cadena de aprobación Compras. Configure la escala o el aprobador inicial del grupo en Admin › Reglas de aprobación › Grupos Compras.',
      );
    }
    const pasos = pasosFromCadenaEngine(resolved.cadena);
    return {
      aprobadorId: resolved.aprobadorId,
      aprobadorNombre: resolved.aprobadorNombre,
      cadenaIds: resolved.cadenaIds,
      pasoTotal: resolved.pasoTotal,
      cadena: resolved.cadena,
      pasos,
    };
  }

  /** Bloquea emitir/crear OC cuya fecha cae en periodo contable CERRADO. */
  private async assertPeriodoAbiertoParaFecha(empresaId: string, fechaIso: string) {
    const m = /^(\d{4}-\d{2})/.exec(fechaIso.trim());
    const periodo = m?.[1];
    if (!periodo) throw new BadRequestException(`Fecha inválida: ${fechaIso}`);
    if (this.contabilizar) {
      await this.contabilizar.assertPeriodoAbierto(empresaId, periodo);
      return;
    }
    const row = await this.prisma.periodoContable.findUnique({
      where: { empresaId_codigo: { empresaId, codigo: periodo } },
    });
    if (row?.estado === 'CERRADO') {
      throw new BadRequestException(
        `El periodo ${periodo} está cerrado. No se pueden emitir órdenes en periodos cerrados.`,
      );
    }
  }

  private async allocateOcNumero(empresaId: string, requested?: string): Promise<string> {
    return allocateOcNumero(this.prisma, empresaId, requested);
  }

  private referenciaFromDto(dto: UpsertOrdenCompraDto) {
    const folio = dto.referenciaFolio?.trim() || null;
    const tipo = dto.referenciaTipo?.trim() || (folio ? 'COTIZACION' : null);
    const fecha = dto.referenciaFecha?.trim()
      ? parseDate(dto.referenciaFecha)
      : null;
    return {
      referenciaTipo: tipo,
      referenciaFolio: folio,
      referenciaFecha: fecha,
    };
  }

  /** 30 si el wizard no trae plazo. Solo 30, 60 o 90. */
  private condicionPagoFromDto(value: number | null | undefined): number {
    return normalizarCondicionPagoDias(value) ?? 30;
  }

  async createOrden(user: JwtPayload, dto: UpsertOrdenCompraDto, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const afacto = dto.afacto.toUpperCase();
    const estado = dto.estado.toUpperCase();
    if (!AFACTOS.has(afacto)) throw new BadRequestException('afacto inválido');
    if (!ESTADOS_DOC.has(estado)) throw new BadRequestException('estado inválido');
    await this.assertPeriodoAbiertoParaFecha(empresaId, dto.fecha);
    await assertCuentaImputable(this.prisma, empresaId, dto.cuentaContableId);
    const lineas = normalizeLineasCompra(dto.lineas);
    const neto = lineas && lineas.length > 0 ? netoFromLineasCompra(lineas) : dto.neto;
    const prov = await this.resolveProveedorForOc(empresaId, dto);
    const creator = await this.prisma.usuario.findUnique({
      where: { id: user.sub },
      select: { nombre: true },
    });
    const numero = await this.allocateOcNumero(empresaId, dto.numero);
    const enviaAprobacion = ocEnviaAprobacion(estado);
    const netoClp = await this.resolveNetoClpParaCadena(empresaId, neto, dto.moneda, dto.fecha);
    const ap = enviaAprobacion
      ? await this.resolveCadenaAprobacion(empresaId, user, netoClp)
      : {
          aprobadorId: null as string | null,
          aprobadorNombre: null as string | null,
          cadenaIds: [] as string[],
          pasoTotal: 0,
          cadena: [] as AprobadorPaso[],
          pasos: [] as PasoCadena[],
        };
    const estadoPersistido = enviaAprobacion ? 'PENDIENTE_APROBACION' : estado;
    const pasosJson = ap.pasos.length
      ? (ap.pasos as unknown as Prisma.InputJsonValue)
      : undefined;

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const oc = await tx.ordenCompra.create({
          data: {
            numero,
            fecha: parseDate(dto.fecha),
            proveedor: prov.proveedorNombre,
            proveedorId: prov.proveedorId,
            solicitante: dto.solicitante.trim(),
            creadoPorId: user.sub,
            creadoPorNombre: creator?.nombre ?? user.email,
            aprobadorId: ap.aprobadorId,
            aprobadorNombre: ap.aprobadorNombre,
            aprobacionCadenaIds: ap.cadenaIds,
            aprobacionCadena: pasosJson,
            aprobacionPasoActual: ap.pasoTotal > 0 ? 1 : 1,
            aprobacionPasosTotal: ap.pasoTotal > 0 ? ap.pasoTotal : 1,
            moneda: dto.moneda.trim().toUpperCase() || 'CLP',
            neto,
            afacto: afacto as 'AFECTO' | 'EXENTO' | 'MIXTO',
            estado: estadoPersistido as never,
            departamento: dto.departamento.trim(),
            cuentaContableId: dto.cuentaContableId?.trim() || null,
            centroCostoId: dto.centroCostoId?.trim() || null,
            elementoCostoId: dto.elementoCostoId?.trim() || null,
            distribucionCc: (dto.distribucionCc ?? null) as unknown as Prisma.InputJsonValue,
            lineas: lineas
              ? (lineas as unknown as Prisma.InputJsonValue)
              : undefined,
            ...this.referenciaFromDto(dto),
            condicionPagoDias: this.condicionPagoFromDto(dto.condicionPagoDias),
            empresaId,
          },
        });
        if (enviaAprobacion && ap.pasos[0]) {
          await persistirFilasPaso(
            tx,
            oc,
            ap.pasos[0],
            1,
            ap.pasoTotal > 0 ? ap.pasoTotal : 1,
            empresaId,
          );
        }
        return oc;
      });
      if (enviaAprobacion) {
        await this.notificarPasoPendiente(empresaId, row, { notificarSolicitante: true });
      }
      return mapOc(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una OC con ese número');
      }
      throw e;
    }
  }

  /** Borrador, rechazada, o pendiente sin ninguna firma (APROBADA/OMITIDA) ni paso > 1. */
  private async assertOcEditable(existing: {
    id: string;
    estado: string;
    aprobacionPasoActual: number;
  }) {
    if (existing.estado === 'BORRADOR' || existing.estado === 'RECHAZADO') return;
    if (existing.estado !== 'PENDIENTE_APROBACION' && existing.estado !== 'EMITIDO') {
      throw new BadRequestException('Esta OC ya no se puede editar.');
    }
    if (existing.aprobacionPasoActual > 1) {
      throw new BadRequestException('La OC ya tiene una firma en la cadena. No se puede editar.');
    }
    const firmas = await this.prisma.aprobacionOc.count({
      where: { ocId: existing.id, estado: { in: ['APROBADA', 'OMITIDA'] } },
    });
    if (firmas > 0) {
      throw new BadRequestException('La OC ya tiene una firma en la cadena. No se puede editar.');
    }
  }

  async updateOrden(user: JwtPayload, id: string, dto: UpsertOrdenCompraDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.ordenCompra.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('OC no encontrada');
    assertTenantAccess(scope, existing.empresaId);

    const afacto = dto.afacto.toUpperCase();
    const estado = dto.estado.toUpperCase();
    if (!AFACTOS.has(afacto)) throw new BadRequestException('afacto inválido');
    if (!ESTADOS_DOC.has(estado)) throw new BadRequestException('estado inválido');

    if (existing.estado === 'ANULADO') {
      throw new BadRequestException('OC ya anulada');
    }

    const esFirma = estado === 'APROBADO' || estado === 'RECHAZADO';
    if (esFirma && dto.updatedAtVisto?.trim()) {
      const visto = new Date(dto.updatedAtVisto).getTime();
      const actual = existing.updatedAt.getTime();
      if (!Number.isNaN(visto) && visto !== actual) {
        throw new ConflictException(
          'La orden fue modificada después de abrir la aprobación. Recarga el detalle antes de firmar.',
        );
      }
    }
    if (!esFirma && estado !== 'ANULADO') {
      await this.assertOcEditable(existing);
    }

    const isResolucion = estado === 'APROBADO' || estado === 'RECHAZADO';
    const motivoRechazo =
      estado === 'RECHAZADO' ? requireMotivoRechazo(dto.motivoRechazo) : null;
    if (
      !isResolucion
      && !isSuperAdmin(user)
      && !userHasPermission(user.permisos ?? [], 'compras:write')
    ) {
      throw new ForbiddenException('Permisos insuficientes');
    }

    if (
      estado === 'ANULADO'
      && ['RECEPCIONADA', 'CONTABILIZADA', 'FACTURADO'].includes(existing.estado)
    ) {
      throw new BadRequestException(
        'No se puede anular una OC ya recepcionada, facturada o contabilizada',
      );
    }

    const fechaCheck = isResolucion
      ? (existing.fecha instanceof Date
        ? existing.fecha.toISOString().slice(0, 10)
        : String(existing.fecha).slice(0, 10))
      : dto.fecha;
    if (estado !== 'ANULADO') {
      await this.assertPeriodoAbiertoParaFecha(existing.empresaId, fechaCheck);
    }
    if (!isResolucion && dto.cuentaContableId?.trim() && dto.cuentaContableId !== existing.cuentaContableId) {
      await assertCuentaImputable(this.prisma, existing.empresaId, dto.cuentaContableId);
    }

    const prov = isResolucion
      ? { proveedorId: existing.proveedorId, proveedorNombre: existing.proveedor }
      : await this.resolveProveedorForOc(existing.empresaId, dto);
    const lineas = isResolucion
      ? null
      : normalizeLineasCompra(dto.lineas);
    const neto = isResolucion
      ? Number(existing.neto)
      : lineas && lineas.length > 0
        ? netoFromLineasCompra(lineas)
        : dto.neto;
    const solicitanteId = existing.creadoPorId ?? user.sub;
    let ap = {
      aprobadorId: existing.aprobadorId,
      aprobadorNombre: existing.aprobadorNombre,
      cadenaIds: existing.aprobacionCadenaIds ?? [],
      pasoTotal: existing.aprobacionPasosTotal ?? 1,
      cadena: [] as AprobadorPaso[],
      pasos: [] as PasoCadena[],
    };
    if (ocEnviaAprobacion(estado)) {
      const monedaDoc = dto.moneda?.trim().toUpperCase() || existing.moneda;
      const netoClp = await this.resolveNetoClpParaCadena(
        existing.empresaId,
        neto,
        monedaDoc,
        dto.fecha || existing.fecha.toISOString(),
      );
      ap = await this.resolveCadenaAprobacion(
        existing.empresaId,
        user,
        netoClp,
        solicitanteId,
      );
    }

    let estadoFinal = ocEnviaAprobacion(estado) ? 'PENDIENTE_APROBACION' : estado;
    type ResolucionRuntime = {
      actorRowId: string;
      actorAprobadorId: string;
      omitirIds: string[];
      estadoActor: 'APROBADA' | 'RECHAZADA';
      snapshot: PasoCadena[];
      pasoOrden: number;
      escalarA: PasoCadena | null;
    };
    let resolucion: ResolucionRuntime | null = null;

    if (estado === 'APROBADO' || estado === 'RECHAZADO') {
      const pendingRows = await this.prisma.aprobacionOc.findMany({
        where: { ocId: id, estado: 'PENDIENTE' },
      });
      if (!pendingRows.length) {
        throw new BadRequestException('No hay aprobación pendiente para esta OC');
      }
      const own = pendingRows.find((r) => r.aprobadorId === user.sub);
      const override =
        isSuperAdmin(user) || (user.permisos ?? []).includes('compras:aprobar-all');
      if (!own && !override) {
        throw new ForbiddenException(
          'Solo el jefe aprobador asignado puede aprobar o rechazar esta OC',
        );
      }
      await assertPinAprobacion(this.prisma, user.sub, dto.pinAprobacion);

      const actorRow = own ?? pendingRows[0];
      const pasoOrden = actorRow.pasoOrden ?? existing.aprobacionPasoActual ?? 1;
      const filasPaso = pendingRows.filter((r) => r.pasoOrden === pasoOrden);
      const snapshot = resolveSnapshot(
        existing.aprobacionCadena,
        existing.aprobacionCadenaIds?.length
          ? existing.aprobacionCadenaIds
          : existing.aprobadorId
            ? [existing.aprobadorId]
            : [],
      );
      const pasoSnap = snapshot[pasoOrden - 1];
      const logica = logicaPaso(actorRow.logica ?? pasoSnap?.logica);
      const actorId = actorRow.aprobadorId || user.sub;
      const decision = resolverAccionPaso({
        logica,
        pendientesAprobadorIds: filasPaso
          .map((r) => r.aprobadorId)
          .filter((uid): uid is string => Boolean(uid)),
        actorId,
        accion: estado === 'APROBADO' ? 'APROBAR' : 'RECHAZAR',
      });
      const snapshotNext = marcarAprobadoresEnSnapshot(snapshot, pasoOrden - 1, [
        { id: actorId, estado: decision.estadoActor },
        ...decision.omitirAprobadorIds.map((oid) => ({
          id: oid,
          estado: 'OMITIDA' as const,
        })),
      ]);
      let escalarA: PasoCadena | null = null;
      if (decision.ocRechazada) {
        estadoFinal = 'RECHAZADO';
      } else if (decision.pasoCompleto && estado === 'APROBADO') {
        const nextPaso = snapshotNext[pasoOrden];
        if (nextPaso) {
          estadoFinal = 'PENDIENTE_APROBACION';
          escalarA = nextPaso;
        } else {
          estadoFinal = 'APROBADO';
        }
      } else {
        estadoFinal = 'PENDIENTE_APROBACION';
      }
      resolucion = {
        actorRowId: actorRow.id,
        actorAprobadorId: actorId,
        omitirIds: decision.omitirAprobadorIds,
        estadoActor: decision.estadoActor,
        snapshot: snapshotNext,
        pasoOrden,
        escalarA,
      };
    }

    const nextMember = resolucion?.escalarA?.aprobadores[0];
    const row = await this.prisma.$transaction(async (tx) => {
      const oc = await tx.ordenCompra.update({
        where: { id },
        data: {
          ...(isResolucion
            ? {
                numero: existing.numero,
                fecha: existing.fecha,
                proveedor: existing.proveedor,
                proveedorId: existing.proveedorId,
                solicitante: existing.solicitante,
                moneda: existing.moneda,
                neto: Number(existing.neto),
                afacto: existing.afacto,
                departamento: existing.departamento,
                cuentaContableId: existing.cuentaContableId,
                centroCostoId: existing.centroCostoId,
                elementoCostoId: existing.elementoCostoId,
                distribucionCc: existing.distribucionCc as Prisma.InputJsonValue,
              }
            : {
                numero: existing.numero,
                fecha: parseDate(dto.fecha),
                proveedor: prov.proveedorNombre,
                proveedorId: prov.proveedorId,
                solicitante: dto.solicitante.trim(),
                moneda: dto.moneda.trim().toUpperCase() || 'CLP',
                neto,
                afacto: afacto as 'AFECTO' | 'EXENTO' | 'MIXTO',
                departamento: dto.departamento.trim(),
                cuentaContableId: dto.cuentaContableId?.trim() || null,
                centroCostoId: dto.centroCostoId?.trim() || null,
                elementoCostoId: dto.elementoCostoId?.trim() || null,
                distribucionCc: (dto.distribucionCc ?? null) as unknown as Prisma.InputJsonValue,
                ...(lineas !== null
                  ? { lineas: lineas as unknown as Prisma.InputJsonValue }
                  : {}),
                ...this.referenciaFromDto(dto),
                condicionPagoDias: this.condicionPagoFromDto(dto.condicionPagoDias),
              }),
          aprobadorId: nextMember?.id ?? ap.aprobadorId,
          aprobadorNombre: nextMember?.nombre ?? ap.aprobadorNombre,
          aprobacionCadenaIds: ap.cadenaIds.length
            ? ap.cadenaIds
            : existing.aprobacionCadenaIds,
          aprobacionCadena: resolucion
            ? (resolucion.snapshot as unknown as Prisma.InputJsonValue)
            : ocEnviaAprobacion(estado)
              ? (ap.pasos as unknown as Prisma.InputJsonValue)
              : undefined,
          aprobacionPasoActual: resolucion?.escalarA
            ? resolucion.pasoOrden + 1
            : ocEnviaAprobacion(estado)
              ? 1
              : (resolucion?.pasoOrden ?? existing.aprobacionPasoActual),
          aprobacionPasosTotal: ap.pasoTotal > 0 ? ap.pasoTotal : existing.aprobacionPasosTotal,
          estado: estadoFinal as never,
          ...(estadoFinal === 'RECHAZADO' && motivoRechazo
            ? { motivoRechazo }
            : ocEnviaAprobacion(estado)
              ? { motivoRechazo: null }
              : {}),
        },
      });

      if (resolucion) {
        const resolver = await tx.usuario.findUnique({
          where: { id: user.sub },
          select: { id: true, nombre: true },
        });
        await tx.aprobacionOc.update({
          where: { id: resolucion.actorRowId },
          data: {
            estado: resolucion.estadoActor,
            resueltoPorId: resolver?.id ?? user.sub,
            resueltoPorNombre: resolver?.nombre ?? user.email,
            ...(resolucion.estadoActor === 'RECHAZADA' && motivoRechazo
              ? { motivoRechazo }
              : {}),
          },
        });
        if (resolucion.omitirIds.length) {
          await tx.aprobacionOc.updateMany({
            where: {
              ocId: id,
              estado: 'PENDIENTE',
              aprobadorId: { in: resolucion.omitirIds },
            },
            data: { estado: 'OMITIDA' },
          });
        }
        if (resolucion.escalarA) {
          await persistirFilasPaso(
            tx,
            oc,
            resolucion.escalarA,
            resolucion.pasoOrden + 1,
            oc.aprobacionPasosTotal,
            oc.empresaId,
          );
        }
      } else if (estado === 'BORRADOR' && existing.estado !== 'BORRADOR') {
        await tx.aprobacionOc.updateMany({
          where: { ocId: id, estado: 'PENDIENTE' },
          data: { estado: 'ANULADA' },
        });
      } else if (estado === 'ANULADO') {
        const resolver = await tx.usuario.findUnique({
          where: { id: user.sub },
          select: { id: true, nombre: true },
        });
        await tx.aprobacionOc.updateMany({
          where: { ocId: id, estado: 'PENDIENTE' },
          data: {
            estado: 'ANULADA',
            resueltoPorId: resolver?.id ?? user.sub,
            resueltoPorNombre: `${resolver?.nombre ?? user.email} (OC anulada)`,
          },
        });
      }

      if (ocEnviaAprobacion(estado)) {
        await tx.aprobacionOc.deleteMany({
          where: { ocId: id, estado: 'PENDIENTE' },
        });
        if (ap.pasos[0]) {
          await persistirFilasPaso(
            tx,
            oc,
            ap.pasos[0],
            1,
            ap.pasoTotal > 0 ? ap.pasoTotal : 1,
            oc.empresaId,
          );
        }
      }

      if (estado === 'RECEPCIONADA') {
        const prev = await tx.recepcionOc.findFirst({ where: { ocId: id } });
        if (!prev) {
          await tx.recepcionOc.create({
            data: {
              ocId: id,
              ocNumero: oc.numero,
              fecha: new Date(),
              tcAplicado: 1,
              moneda: oc.moneda,
              monto: oc.neto,
              estado: 'CONFIRMADA',
              empresaId: oc.empresaId,
            },
          });
        } else {
          await tx.recepcionOc.update({
            where: { id: prev.id },
            data: { estado: 'CONFIRMADA', monto: oc.neto },
          });
        }
      }

      return oc;
    });

    if (resolucion?.escalarA) {
      await this.notificarPasoPendiente(existing.empresaId, row, {
        detallePendiente: `Escalada · paso ${resolucion.pasoOrden + 1} de ${row.aprobacionPasosTotal}`,
      });
    } else if (estadoFinal === 'APROBADO' || estadoFinal === 'RECHAZADO') {
      const filas = await this.prisma.aprobacionOc.findMany({
        where: { ocId: id },
        select: { id: true },
      });
      if (existing.creadoPorId) {
        const ok = estadoFinal === 'APROBADO';
        await this.notificaciones?.upsert({
          userId: existing.creadoPorId,
          empresaId: existing.empresaId,
          tipo: 'OC_RESULTADO',
          titulo: ok
            ? `OC ${existing.numero} aprobada`
            : `OC ${existing.numero} rechazada`,
          detalle: ok
            ? `Tu solicitud fue aprobada por ${user.email}`
            : `Tu solicitud fue rechazada. Motivo: ${motivoRechazo}`,
          href: `/compras/ordenes?open=${encodeURIComponent(id)}`,
          refKey: `oc-res:${id}:${estadoFinal}`,
          monto: Number(existing.neto),
        });
      }
      for (const fila of filas ?? []) {
        await this.notificaciones?.setLeidaByRef(`oc-pend:${fila.id}`, true);
      }
    }

    if (
      ocEnviaAprobacion(estado)
      && (existing.estado === 'RECHAZADO' || existing.estado === 'BORRADOR')
    ) {
      await this.notificarPasoPendiente(existing.empresaId, row, {
        notificarSolicitante: true,
      });
    }

    return mapOc(row);
  }

  async getAprobaciones(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const seeAll =
      isSuperAdmin(user)
      || (user.permisos ?? []).includes('compras:aprobar-all')
      || (user.permisos ?? []).includes('*');
    const rows = await this.prisma.aprobacionOc.findMany({
      where: {
        empresaId,
        ...(seeAll
          ? {}
          : {
              OR: [
                { aprobadorId: user.sub },
                { aprobadorId: null }, // legado sin jefe asignado
              ],
            }),
      },
      include: {
        ordenCompra: {
          select: {
            aprobacionCadena: true,
            estado: true,
            aprobacionPasoActual: true,
            motivoRechazo: true,
          },
        },
      },
      orderBy: { fecha: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      ocId: r.ocId,
      ocNumero: r.ocNumero,
      proveedor: r.proveedor,
      monto: Number(r.monto),
      solicitante: r.solicitante,
      aprobadorId: r.aprobadorId ?? undefined,
      aprobadorNombre: r.aprobadorNombre ?? undefined,
      resueltoPorNombre: r.resueltoPorNombre ?? undefined,
      logica: r.logica ?? 'SIMPLE',
      pasoOrden: r.pasoOrden,
      pasoTotal: r.pasoTotal,
      estado: r.estado,
      fecha: r.fecha.toISOString().slice(0, 10),
      motivoRechazo: r.motivoRechazo ?? r.ordenCompra?.motivoRechazo ?? undefined,
      aprobacionCadena: r.ordenCompra?.aprobacionCadena ?? undefined,
      ocEstado: r.ordenCompra?.estado,
      aprobacionPasoActual: r.ordenCompra?.aprobacionPasoActual,
    }));
  }

  async getRecepciones(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.recepcionOc.findMany({
      where: { empresaId },
      orderBy: { fecha: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      ocNumero: r.ocNumero,
      fecha: r.fecha.toISOString().slice(0, 10),
      tcAplicado: Number(r.tcAplicado),
      moneda: r.moneda,
      monto: Number(r.monto),
      estado: r.estado,
      // Bug conocido corregido junto con P1-10: el listado no devolvía
      // líneas, por lo que el modal de detalle mostraba "Sin líneas".
      lineas: parseStoredLineasCompra(r.lineas),
    }));
  }

  async createRecepcion(
    user: JwtPayload,
    dto: UpsertRecepcionOcDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const ocNumero = dto.ocNumero.trim();
    const oc = await this.prisma.ordenCompra.findFirst({
      where: { empresaId, numero: ocNumero },
    });
    if (!oc) throw new NotFoundException(`OC ${ocNumero} no encontrada`);
    // P0-3: no se puede recepcionar una OC que no esté aprobada (borrador,
    // rechazada, anulada, etc.). RECEPCIONADA se admite para recepciones
    // parciales adicionales sobre una OC ya recibida antes.
    if (!['APROBADO', 'RECEPCIONADA'].includes(oc.estado)) {
      throw new BadRequestException(
        `La OC ${ocNumero} debe estar APROBADA para recepcionar (estado actual: ${oc.estado})`,
      );
    }

    const estado = (dto.estado ?? 'BORRADOR').toUpperCase();
    if (estado !== 'BORRADOR' && estado !== 'CONFIRMADA') {
      throw new BadRequestException('estado de recepción inválido');
    }

    const ocLineas = parseStoredLineasCompra(oc.lineas);
    let lineas = normalizeLineasCompra(dto.lineas);
    // P1-10: recepción parcial real. Ya no se exige copiar 1:1 todas las
    // líneas de la OC; cada línea recibida se calza contra la línea de la OC
    // por descripción, y se valida que lo ya CONFIRMADO más lo nuevo no
    // exceda la cantidad de esa línea en la OC (permite varias recepciones
    // parciales acumulativas).
    if (ocLineas && ocLineas.length > 0) {
      const confirmadas = await this.prisma.recepcionOc.findMany({
        where: { ocId: oc.id, estado: 'CONFIRMADA' },
        select: { lineas: true },
      });
      const recibidoPorDesc = new Map<string, number>();
      for (const r of confirmadas) {
        for (const l of parseStoredLineasCompra(r.lineas) ?? []) {
          const key = l.descripcion.trim().toLowerCase();
          recibidoPorDesc.set(key, (recibidoPorDesc.get(key) ?? 0) + l.cantidad);
        }
      }

      if (!lineas || lineas.length === 0) {
        // Por defecto, recepciona el saldo pendiente de cada línea (no
        // siempre el total original de la OC).
        lineas = ocLineas
          .map((l) => {
            const key = l.descripcion.trim().toLowerCase();
            const pendiente = Math.max(l.cantidad - (recibidoPorDesc.get(key) ?? 0), 0);
            return pendiente > 0
              ? { ...l, cantidad: pendiente, total: Math.round(pendiente * l.precioUnitario * 100) / 100 }
              : null;
          })
          .filter((l): l is LineaCompraNorm => l !== null);
        if (lineas.length === 0) {
          throw new BadRequestException('La OC ya fue recepcionada por completo');
        }
      } else {
        for (const [i, b] of lineas.entries()) {
          const key = b.descripcion.trim().toLowerCase();
          const ocLinea = ocLineas.find((a) => a.descripcion.trim().toLowerCase() === key);
          if (!ocLinea) {
            throw new BadRequestException(
              `Línea ${i + 1} ("${b.descripcion}") no corresponde a ninguna línea de la OC`,
            );
          }
          if (Math.abs(ocLinea.precioUnitario - b.precioUnitario) > 0.01) {
            throw new BadRequestException(
              `Línea ${i + 1} ("${b.descripcion}"): el precio unitario no coincide con el de la OC`,
            );
          }
          const yaRecibido = recibidoPorDesc.get(key) ?? 0;
          if (yaRecibido + b.cantidad - ocLinea.cantidad > 0.001) {
            throw new BadRequestException(
              `Línea ${i + 1} ("${b.descripcion}"): recibido ${yaRecibido} + ${b.cantidad} excede `
              + `la cantidad de la OC (${ocLinea.cantidad})`,
            );
          }
        }
      }
    }

    const monto = lineas && lineas.length > 0 ? netoFromLineasCompra(lineas) : dto.monto;
    // P0-3: el tope solo debe considerar recepciones CONFIRMADA; los
    // borradores no "consumen" cupo de la OC hasta confirmarse.
    const prev = await this.prisma.recepcionOc.aggregate({
      where: { ocId: oc.id, estado: 'CONFIRMADA' },
      _sum: { monto: true },
    });
    const prevSum = Number(prev._sum.monto ?? 0);
    if (prevSum + monto - Number(oc.neto) > 0.01) {
      throw new BadRequestException(
        `Monto de recepción excede el neto de la OC (recibido ${prevSum}, OC ${Number(oc.neto)})`,
      );
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.recepcionOc.create({
        data: {
          ocId: oc.id,
          ocNumero,
          fecha: parseDate(dto.fecha),
          tcAplicado: dto.tcAplicado,
          moneda: dto.moneda.trim().toUpperCase(),
          monto,
          estado: estado as 'BORRADOR' | 'CONFIRMADA',
          lineas: lineas
            ? (lineas as unknown as Prisma.InputJsonValue)
            : undefined,
          empresaId,
        },
      });
      // Solo una recepción CONFIRMADA (no borrador) mueve la OC a RECEPCIONADA.
      if (estado === 'CONFIRMADA' && oc.estado !== 'RECEPCIONADA') {
        await tx.ordenCompra.update({
          where: { id: oc.id },
          data: { estado: 'RECEPCIONADA' },
        });
      }
      return created;
    });

    return {
      id: row.id,
      ocNumero: row.ocNumero,
      fecha: row.fecha.toISOString().slice(0, 10),
      tcAplicado: Number(row.tcAplicado),
      moneda: row.moneda,
      monto: Number(row.monto),
      estado: row.estado,
      lineas: parseStoredLineasCompra(row.lineas),
    };
  }

  async updateRecepcion(user: JwtPayload, id: string, dto: UpdateRecepcionOcDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.recepcionOc.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Recepción no encontrada');
    assertTenantAccess(scope, existing.empresaId);

    let estado = existing.estado;
    if (dto.estado) {
      const next = dto.estado.toUpperCase();
      if (next !== 'BORRADOR' && next !== 'CONFIRMADA') {
        throw new BadRequestException('estado de recepción inválido');
      }
      estado = next as 'BORRADOR' | 'CONFIRMADA';
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.recepcionOc.update({
        where: { id },
        data: {
          ...(dto.fecha ? { fecha: parseDate(dto.fecha) } : {}),
          ...(dto.tcAplicado !== undefined ? { tcAplicado: dto.tcAplicado } : {}),
          ...(dto.moneda ? { moneda: dto.moneda.trim().toUpperCase() } : {}),
          ...(dto.monto !== undefined ? { monto: dto.monto } : {}),
          estado,
        },
      });
      // P0-3/P0-4: confirmar un borrador debe reflejarse en la OC igual que
      // una recepción creada directa como CONFIRMADA.
      if (existing.estado === 'BORRADOR' && estado === 'CONFIRMADA') {
        const oc = await tx.ordenCompra.findUnique({ where: { id: existing.ocId } });
        if (oc && oc.estado !== 'RECEPCIONADA') {
          await tx.ordenCompra.update({
            where: { id: existing.ocId },
            data: { estado: 'RECEPCIONADA' },
          });
        }
      }
      return updated;
    });

    return {
      id: row.id,
      ocNumero: row.ocNumero,
      fecha: row.fecha.toISOString().slice(0, 10),
      tcAplicado: Number(row.tcAplicado),
      moneda: row.moneda,
      monto: Number(row.monto),
      estado: row.estado,
    };
  }

  async getRegistros(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.registroCompra.findMany({
      where: { empresaId },
      include: { ordenCompra: { select: { estado: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapRegistro);
  }

  /**
   * Facturas PENDIENTE sin reclamo tras N días → ACEPTADA_PLAZO (bitácora ERP).
   * No aprueba la OC ni llama SII/GoSocket.
   */
  async runAceptacionCompraAutoIfDue() {
    const empresas = await this.prisma.empresa.findMany({
      where: { activa: true },
      select: { id: true, aceptacionCompraPlazoDias: true },
    });
    const now = new Date();
    let updated = 0;
    for (const emp of empresas) {
      const plazoDays = emp.aceptacionCompraPlazoDias ?? 8;
      const cutoff = new Date(now.getTime() - plazoDays * 86_400_000);
      const res = await this.prisma.registroCompra.updateMany({
        where: {
          empresaId: emp.id,
          aceptacionEstado: 'PENDIENTE',
          estado: { not: 'ANULADO' },
          createdAt: { lte: cutoff },
          // Documentos GoSocket se aceptan/reclaman explícitamente contra el partner real
          // (endpoints aceptar/rechazar); el cron de "aceptación tácita" no debe tocarlos.
          gosocketGlobalDocumentId: null,
        },
        data: {
          aceptacionEstado: 'ACEPTADA_PLAZO',
          aceptacionOrigen: 'PLAZO_AUTO',
          aceptadaAt: now,
        },
      });
      updated += res.count;
    }
    return { updated };
  }

  /**
   * P1-10: matching de 3 vías (OC-recepción-factura). Compara el monto de la
   * factura contra lo efectivamente recepcionado CONFIRMADO de la OC.
   * Es informativo (no bloquea el registro), igual que `afactoOk`.
   */
  private async calcularMatchOc(
    ocId: string | undefined | null,
    monto: number,
  ): Promise<{ matchOk: boolean; matchDiff: number | null }> {
    if (!ocId) return { matchOk: true, matchDiff: null };
    const recibido = await this.prisma.recepcionOc.aggregate({
      where: { ocId, estado: 'CONFIRMADA' },
      _sum: { monto: true },
    });
    const recibidoTotal = Number(recibido?._sum?.monto ?? 0);
    const matchDiff = Math.round((monto - recibidoTotal) * 100) / 100;
    return { matchOk: Math.abs(matchDiff) <= 1, matchDiff };
  }

  async createRegistro(
    user: JwtPayload,
    dto: UpsertRegistroCompraDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const oc = await this.prisma.ordenCompra.findFirst({
      where: { empresaId, numero: dto.ocNumero.trim() },
    });
    if (!oc && dto.ocNumero.trim()) {
      throw new BadRequestException(`No se encontró la OC ${dto.ocNumero.trim()}`);
    }
    const afactoOc = (dto.afactoOc ?? oc?.afacto ?? 'AFECTO').toUpperCase();
    const afactoFactura = (dto.afactoFactura ?? afactoOc).toUpperCase();
    const afactoOk = dto.afactoOk ?? afactoOc === afactoFactura;
    let estado = (dto.estado ?? 'BORRADOR').toUpperCase();
    if (!ESTADOS_DOC.has(estado)) throw new BadRequestException('estado inválido');
    this.assertOcParaRegistroCompra(oc, { contabilizar: estado === 'CONTABILIZADA' });

    const lineas = normalizeLineasCompra(dto.lineas)
      ?? parseStoredLineasCompra(oc?.lineas)
      ?? null;
    const monto = lineas && lineas.length > 0 ? netoFromLineasCompra(lineas) : dto.monto;
    if (oc) {
      const prevRegs = await this.prisma.registroCompra.aggregate({
        where: {
          empresaId,
          ocNumero: oc.numero,
          estado: { not: 'ANULADO' },
        },
        _sum: { monto: true },
      });
      const prevSum = Number(prevRegs._sum.monto ?? 0);
      const ocNeto = Number(oc.neto);
      if (prevSum + monto - ocNeto > 0.01) {
        throw new BadRequestException(
          `La OC ${oc.numero} ya tiene factura(s) asociada(s) por ${prevSum} (neto OC ${ocNeto}). `
          + `No se puede asociar otra por ${monto}. Anule la factura previa o use otra OC.`,
        );
      }
    }
    const { matchOk, matchDiff } = await this.calcularMatchOc(oc?.id, monto);

    let asientoId: string | undefined;
    let asientoNumero: string | undefined;

    // El gate de OC (OPERAR) ya se evaluó arriba; el asiento es opcional.
    if (estado === 'CONTABILIZADA' && this.contabilizar) {
      const asiento = await this.crearAsientoRegistroCompra({
        empresaId,
        factura: dto.factura,
        monto,
        cuentaContableId: oc?.cuentaContableId,
        centroCostoId: oc?.centroCostoId,
        elementoCostoId: oc?.elementoCostoId,
        ocId: oc?.id,
      });
      asientoId = asiento.id;
      asientoNumero = asiento.numero;
    }

    let proveedorId = dto.proveedorId?.trim() || oc?.proveedorId || null;
    if (proveedorId) {
      const p = await this.prisma.proveedor.findFirst({
        where: { id: proveedorId, empresaId },
      });
      if (!p) proveedorId = null;
    }
    if (!proveedorId && dto.proveedorFactura.trim()) {
      const p = await this.prisma.proveedor.findFirst({
        where: {
          empresaId,
          razonSocial: { equals: dto.proveedorFactura.trim(), mode: 'insensitive' },
        },
      });
      proveedorId = p?.id ?? null;
    }

    const row = await this.prisma.registroCompra.create({
      data: {
        ocId: oc?.id,
        ocNumero: dto.ocNumero.trim(),
        factura: dto.factura.trim(),
        proveedorOc: dto.proveedorOc.trim(),
        proveedorFactura: dto.proveedorFactura.trim(),
        proveedorId,
        monto,
        afactoOc: AFACTOS.has(afactoOc) ? (afactoOc as never) : null,
        afactoFactura: AFACTOS.has(afactoFactura) ? (afactoFactura as never) : null,
        afactoOk,
        matchOk,
        matchDiff,
        estado: estado as never,
        asientoId,
        asientoNumero,
        lineas: lineas
          ? (lineas as unknown as Prisma.InputJsonValue)
          : undefined,
        empresaId,
      },
    });

    if (estado === 'CONTABILIZADA' && this.cuentaCorriente) {
      try {
        await this.cuentaCorriente.registrarMovimiento({
          empresaId,
          terceroTipo: 'PROVEEDOR',
          terceroId: proveedorId || row.proveedorFactura,
          terceroNombre: row.proveedorFactura,
          fecha: row.createdAt,
          documentoRef: row.factura,
          documentoTipo: 'COMPRA',
          debe: 0,
          haber: totalCompraParaTesoreria(Number(row.monto), row.afactoFactura),
          glosa: `Compra ${row.factura}`,
          origen: 'COMPRA',
          registroCompraId: row.id,
        });
      } catch {
        /* no bloquear registro */
      }
      try {
        await upsertAgingDesdeCompra(this.prisma, {
          ...row,
          monto: totalCompraParaTesoreria(Number(row.monto), row.afactoFactura),
          condicionPagoDias: oc?.condicionPagoDias,
        });
      } catch {
        /* no bloquear registro */
      }
    }

    return mapRegistro({
      ...row,
      ordenCompra: oc ? { estado: oc.estado } : null,
    });
  }

  async updateRegistro(user: JwtPayload, id: string, dto: UpsertRegistroCompraDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.registroCompra.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Registro de compra no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    if (existing.estado === 'ANULADO') {
      throw new BadRequestException('Registro ya anulado');
    }
    if (existing.estado === 'CONTABILIZADA') {
      throw new BadRequestException('Registro contabilizado: no editable');
    }

    const lineas = normalizeLineasCompra(dto.lineas);
    const monto = lineas && lineas.length > 0 ? netoFromLineasCompra(lineas) : dto.monto;
    const afactoOc = (dto.afactoOc ?? existing.afactoOc ?? 'AFECTO').toUpperCase();
    const afactoFactura = (dto.afactoFactura ?? afactoOc).toUpperCase();
    const afactoOk = dto.afactoOk ?? afactoOc === afactoFactura;
    let estado = (dto.estado ?? existing.estado).toUpperCase();
    if (!ESTADOS_DOC.has(estado)) throw new BadRequestException('estado inválido');
    // P1-10: recalcular el matching de 3 vías si cambia el monto de la factura.
    const { matchOk, matchDiff } = await this.calcularMatchOc(existing.ocId, monto);

    let asientoId = existing.asientoId ?? undefined;
    let asientoNumero = existing.asientoNumero ?? undefined;
    // Ya rechazamos arriba si existing era CONTABILIZADA; aquí solo detectamos transición.
    const pasaAContabilizada = estado === 'CONTABILIZADA';

    const ocVinculada = existing.ocId
      ? await this.prisma.ordenCompra.findFirst({
        where: { id: existing.ocId, empresaId: existing.empresaId },
      })
      : null;
    if (pasaAContabilizada) {
      this.assertOcParaRegistroCompra(
        ocVinculada ?? (existing.ocId ? { numero: existing.ocNumero, estado: '' } : null),
        { contabilizar: true },
      );
    }

    if (pasaAContabilizada && this.contabilizar) {
      const factura = dto.factura.trim() || existing.factura;
      const asiento = await this.crearAsientoRegistroCompra({
        empresaId: existing.empresaId,
        factura,
        monto,
        cuentaContableId: ocVinculada?.cuentaContableId,
        centroCostoId: ocVinculada?.centroCostoId,
        elementoCostoId: ocVinculada?.elementoCostoId,
        ocId: ocVinculada?.id ?? existing.ocId,
      });
      asientoId = asiento.id;
      asientoNumero = asiento.numero;
    }

    const row = await this.prisma.registroCompra.update({
      where: { id },
      data: {
        ocNumero: dto.ocNumero.trim(),
        factura: dto.factura.trim(),
        proveedorOc: dto.proveedorOc.trim(),
        proveedorFactura: dto.proveedorFactura.trim(),
        proveedorId: dto.proveedorId?.trim() || existing.proveedorId,
        monto,
        afactoOc: AFACTOS.has(afactoOc) ? (afactoOc as never) : null,
        afactoFactura: AFACTOS.has(afactoFactura) ? (afactoFactura as never) : null,
        afactoOk,
        matchOk,
        matchDiff,
        estado: estado as never,
        ...(asientoId ? { asientoId, asientoNumero } : {}),
        ...(lineas !== null
          ? { lineas: lineas as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });

    if (pasaAContabilizada && this.cuentaCorriente) {
      try {
        await this.cuentaCorriente.registrarMovimiento({
          empresaId: existing.empresaId,
          terceroTipo: 'PROVEEDOR',
          terceroId: row.proveedorId || row.proveedorFactura,
          terceroNombre: row.proveedorFactura,
          fecha: row.updatedAt,
          documentoRef: row.factura,
          documentoTipo: 'COMPRA',
          debe: 0,
          haber: totalCompraParaTesoreria(Number(row.monto), row.afactoFactura),
          glosa: `Compra ${row.factura}`,
          origen: 'COMPRA',
          registroCompraId: row.id,
        });
      } catch {
        /* no bloquear registro */
      }
      try {
        await upsertAgingDesdeCompra(this.prisma, {
          ...row,
          monto: totalCompraParaTesoreria(Number(row.monto), row.afactoFactura),
          condicionPagoDias: ocVinculada?.condicionPagoDias,
        });
      } catch {
        /* no bloquear registro */
      }
    }

    return mapRegistro({
      ...row,
      ordenCompra: ocVinculada ? { estado: ocVinculada.estado } : null,
    });
  }

  async anularRegistro(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.registroCompra.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Registro de compra no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    if (existing.estado === 'ANULADO') {
      throw new BadRequestException('Registro ya anulado');
    }
    if (existing.estado === 'CONTABILIZADA') {
      throw new BadRequestException('Registro contabilizado: no se puede anular desde aquí');
    }
    const row = await this.prisma.registroCompra.update({
      where: { id },
      data: { estado: 'ANULADO' },
    });
    return mapRegistro(row);
  }

  async cargaMasivaRegistros(
    user: JwtPayload,
    dto: CargaMasivaRegistrosCompraDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const existing = await this.prisma.registroCompra.findMany({
      where: { empresaId },
      select: { factura: true, proveedorFactura: true },
    });
    const keys = new Set(existing.map((r) => `${r.factura}|${r.proveedorFactura}`));
    const created: unknown[] = [];
    const skipped: { factura: string; reason: string }[] = [];

    for (const item of dto.items) {
      if (item.exclude) {
        skipped.push({ factura: item.factura, reason: 'excluido' });
        continue;
      }
      const key = `${item.factura.trim()}|${item.proveedorFactura.trim()}`;
      if (keys.has(key)) {
        skipped.push({ factura: item.factura, reason: 'duplicado' });
        continue;
      }
      const row = await this.createRegistro(user, {
        ocNumero: item.ocNumero,
        factura: item.factura,
        proveedorOc: item.proveedorOc,
        proveedorFactura: item.proveedorFactura,
        monto: item.monto,
        afactoOc: item.afactoOc,
        afactoFactura: item.afactoFactura,
        afactoOk: true,
        estado: 'EMITIDO',
      }, empresaHeader);
      keys.add(key);
      created.push(row);
    }

    return { created: created.length, skipped, rows: created };
  }

  // ---------------------------------------------------------------------
  // GoSocket (Fase 2): inbox de documentos recibidos — Libro de Compras
  // ---------------------------------------------------------------------

  private assertGoSocketRow(row: { gosocketGlobalDocumentId?: string | null }): string {
    const gid = row.gosocketGlobalDocumentId?.trim();
    if (!gid) {
      throw new NotFoundException('El registro no proviene de GoSocket (sin GlobalDocumentId)');
    }
    return gid;
  }

  private assertGoSocketChangeOk(result: PurchaseChangeStatusResult, paso: string): void {
    if (result.success) return;
    throw new BadGatewayException(
      result.description
      || result.messages[0]
      || `GoSocket rechazó ${paso}`,
    );
  }

  private async fetchGoSocketDteFromXml(
    globalDocumentId: string,
    empresaRut: string,
    empresaId: string,
  ): Promise<{
    ocReferencias: string[];
    emisorRut: string | null;
    emisorRazonSocial: string | null;
    totales: ReturnType<typeof extractTotalesFromDteXml>;
  }> {
    const emptyTotales = extractTotalesFromDteXml('');
    if (!this.billing) {
      return { ocReferencias: [], emisorRut: null, emisorRazonSocial: null, totales: emptyTotales };
    }
    try {
      const art = await this.billing.getPurchaseArtifact(
        globalDocumentId,
        'xml',
        empresaRut,
        empresaId,
      );
      const xml = art.body.toString('utf-8');
      const emisor = extractEmisorFromDteXml(xml);
      return {
        ocReferencias: extractOcReferenciasFromDteXml(xml),
        emisorRut: emisor.rut,
        emisorRazonSocial: emisor.razonSocial,
        totales: extractTotalesFromDteXml(xml),
      };
    } catch {
      return { ocReferencias: [], emisorRut: null, emisorRazonSocial: null, totales: emptyTotales };
    }
  }

  private resolveProveedorFromGoSocketDoc(
    doc: PurchaseReceivedDocument,
    xmlEmisor: { emisorRut: string | null; emisorRazonSocial: string | null },
    proveedores: Array<{ id: string; rut: string; razonSocial?: string }> | undefined,
  ): { proveedorFactura: string; proveedorId: string | null; emisorRut: string | null } {
    const list = proveedores ?? [];
    const emisorRut = doc.emisorRut ?? xmlEmisor.emisorRut;
    const emisorRutNorm = emisorRut ? normalizeRut(emisorRut) : null;
    const catalog = emisorRutNorm
      ? list.find((p) => normalizeRut(p.rut) === emisorRutNorm)
      : undefined;
    const razon =
      doc.emisorRazonSocial?.trim()
      || xmlEmisor.emisorRazonSocial?.trim()
      || catalog?.razonSocial?.trim()
      || emisorRut?.trim()
      || GOSOCKET_PROVEEDOR_PLACEHOLDER;
    return {
      proveedorFactura: razon,
      proveedorId: catalog?.id ?? null,
      emisorRut: emisorRut ?? null,
    };
  }

  private async linkOrdenCompraFromReferencias(
    empresaId: string,
    ocReferencias: string[],
    ocNumeroActual: string,
  ): Promise<{ ocNumero: string; ocId: string | null; proveedorOc?: string }> {
    const primary = (ocNumeroActual ?? '').trim() || ocReferencias[0]?.trim() || '';
    if (!primary) {
      return { ocNumero: '', ocId: null };
    }
    const oc = await this.prisma.ordenCompra.findFirst({
      where: { empresaId, numero: primary },
      select: { id: true, numero: true, proveedor: true },
    });
    return {
      ocNumero: oc?.numero ?? primary,
      ocId: oc?.id ?? null,
      proveedorOc: oc?.proveedor,
    };
  }

  private gosocketRegistroEstadoInicial(estadoActual: string): 'EMITIDO' | 'CONTABILIZADA' | 'ANULADO' {
    if (estadoActual === 'CONTABILIZADA' || estadoActual === 'ANULADO') return estadoActual;
    return 'EMITIDO';
  }

  private gosocketPatchFromDocumento(doc: PurchaseReceivedDocument) {
    return {
      gosocketGlobalDocumentId: doc.globalDocumentId,
      gosocketCountryDocumentId: doc.countryDocumentId ?? null,
      gosocketEstado: doc.estado as never,
      gosocketAuthorityStatus: doc.authorityStatus ?? null,
      gosocketRechazoOrigen: (doc.rechazoOrigen ?? null) as never,
      gosocketRechazoMotivo: doc.rechazoMotivo ?? null,
      // El artefacto solo se confirma al intentar descargarlo; asumimos disponible con GID.
      gosocketPdfDisponible: true,
      gosocketSincronizadoAt: new Date(),
      gosocketRutEmisor: doc.emisorRut ?? null,
    };
  }

  async downloadRegistroCompraArtifact(
    user: JwtPayload,
    id: string,
    kind: DteArtifactKind,
    empresaHeader?: string,
  ): Promise<BillingArtifact> {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const row = await this.prisma.registroCompra.findFirst({
      where: { id, empresaId },
      include: { empresa: { select: { rut: true } } },
    });
    if (!row) throw new NotFoundException('Registro de compra no encontrado');
    const gid = this.assertGoSocketRow(row);
    if (!this.billing) {
      throw new ServiceUnavailableException('Cliente billing-gateway no disponible');
    }
    return this.billing.getPurchaseArtifact(gid, kind, row.empresa.rut, empresaId);
  }

  /** Igual que `downloadRegistroCompraArtifact('xml')`, pero devuelve texto para el modal del front. */
  async getRegistroCompraXml(
    user: JwtPayload,
    id: string,
    empresaHeader?: string,
  ): Promise<string> {
    const artifact = await this.downloadRegistroCompraArtifact(user, id, 'xml', empresaHeader);
    return artifact.body.toString('utf-8');
  }

  /**
   * Sincroniza el inbox de GoSocket (GetDocument por ReceiverCode) para un rango de fechas.
   * Decisión de producto: los documentos sin match previo se auto-crean como `RegistroCompra`
   * en BORRADOR (sin OC asociada) en lugar de quedar solo en una cola aparte.
   */
  async syncRegistrosCompraGoSocket(
    user: JwtPayload,
    dto: SincronizarRegistrosCompraDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true, rut: true },
    });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    if (!this.billing) {
      throw new ServiceUnavailableException('Cliente billing-gateway no disponible');
    }

    const documentos = await this.billing.getReceivedPurchaseDocuments(
      empresa.rut,
      empresaId,
      dto.desde,
      dto.hasta,
    );

    // RUTs de proveedor no están indexados/normalizados en BD; se compara en memoria
    // sobre el universo (acotado) de proveedores de la empresa.
    const proveedores = await this.prisma.proveedor.findMany({
      where: { empresaId },
      select: { id: true, rut: true, razonSocial: true },
    });

    let creados = 0;
    let actualizados = 0;
    let sinCambios = 0;
    const rows: unknown[] = [];

    for (const doc of documentos) {
      const dteXml = await this.fetchGoSocketDteFromXml(
        doc.globalDocumentId,
        empresa.rut,
        empresaId,
      );
      const ocRefsFromXml = dteXml.ocReferencias;
      const proveedor = this.resolveProveedorFromGoSocketDoc(doc, dteXml, proveedores);
      const montoRegistro = resolveMontoNetoRegistroCompra(
        doc.montoNeto,
        doc.montoTotal,
        dteXml.totales,
      );
      const fechaDocumento = fechaDocumentoFromEmision(doc.fechaEmision);
      const gosocketPatch = {
        ...this.gosocketPatchFromDocumento(doc),
        gosocketRutEmisor: proveedor.emisorRut ?? doc.emisorRut ?? null,
        ...(fechaDocumento ? { fechaDocumento } : {}),
      };
      const ocRefsJson = ocRefsFromXml.length ? (ocRefsFromXml as Prisma.InputJsonValue) : undefined;

      let existing = await this.prisma.registroCompra.findFirst({
        where: { empresaId, gosocketGlobalDocumentId: doc.globalDocumentId },
      });
      if (!existing && doc.folioOficial) {
        existing = await this.prisma.registroCompra.findFirst({
          where: {
            empresaId,
            factura: doc.folioOficial,
            gosocketGlobalDocumentId: null,
          },
        });
      }

      if (existing) {
        const yaEnlazado = Boolean(existing.gosocketGlobalDocumentId);
        const link = await this.linkOrdenCompraFromReferencias(
          empresaId,
          ocRefsFromXml,
          existing.ocNumero,
        );
        const changed =
          existing.gosocketEstado !== gosocketPatch.gosocketEstado
          || existing.gosocketAuthorityStatus !== gosocketPatch.gosocketAuthorityStatus
          || existing.gosocketRechazoOrigen !== gosocketPatch.gosocketRechazoOrigen
          || (ocRefsFromXml.length > 0
            && JSON.stringify(parseStoredOcReferencias(existing.gosocketOcReferencias))
            !== JSON.stringify(ocRefsFromXml));
        const updated = await this.prisma.registroCompra.update({
          where: { id: existing.id },
          data: {
            ...gosocketPatch,
            ...(ocRefsJson ? { gosocketOcReferencias: ocRefsJson } : {}),
            ...(link.ocNumero && !(existing.ocNumero ?? '').trim()
              ? { ocNumero: link.ocNumero, ocId: link.ocId, proveedorOc: link.proveedorOc ?? existing.proveedorOc }
              : link.ocId && !existing.ocId
                ? { ocId: link.ocId, proveedorOc: link.proveedorOc ?? existing.proveedorOc }
                : {}),
            ...(isProveedorFacturaPlaceholder(existing.proveedorFactura)
              ? {
                proveedorFactura: proveedor.proveedorFactura,
                proveedorId: proveedor.proveedorId ?? existing.proveedorId,
              }
              : {}),
            ...(montoRegistro > 0 && Number(existing.monto) === 0
              ? { monto: montoRegistro }
              : {}),
            estado: this.gosocketRegistroEstadoInicial(existing.estado),
          },
          include: { ordenCompra: { select: { estado: true } } },
        });
        rows.push(mapRegistro(updated));
        if (!yaEnlazado || changed) actualizados += 1;
        else sinCambios += 1;
        continue;
      }

      const link = await this.linkOrdenCompraFromReferencias(empresaId, ocRefsFromXml, '');

      const created = await this.prisma.registroCompra.create({
        data: {
          ocNumero: link.ocNumero,
          ocId: link.ocId,
          factura: doc.folioOficial || doc.globalDocumentId.slice(0, 32),
          proveedorOc: link.proveedorOc ?? '',
          proveedorFactura: proveedor.proveedorFactura,
          proveedorId: proveedor.proveedorId,
          monto: montoRegistro,
          afactoOc: 'AFECTO',
          afactoFactura: 'AFECTO',
          afactoOk: true,
          matchOk: true,
          estado: 'EMITIDO',
          empresaId,
          ...gosocketPatch,
          ...(ocRefsJson ? { gosocketOcReferencias: ocRefsJson } : {}),
        },
        include: { ordenCompra: { select: { estado: true } } },
      });
      rows.push(mapRegistro(created));
      creados += 1;
    }

    return { creados, actualizados, sinCambios, rows };
  }

  async aceptarRegistroCompraGoSocket(
    user: JwtPayload,
    id: string,
    dto: AceptarRegistroCompraDto,
    empresaHeader?: string,
  ) {
    return this.cambiarEstadoGoSocket(user, id, 'ACEPTAR', dto.comentario, empresaHeader);
  }

  async rechazarRegistroCompraGoSocket(
    user: JwtPayload,
    id: string,
    dto: RechazarRegistroCompraDto,
    empresaHeader?: string,
  ) {
    return this.cambiarEstadoGoSocket(user, id, 'RECHAZAR', dto.comentario, empresaHeader);
  }

  /**
   * Aceptación/rechazo comercial GoSocket: Acuse (30) → Recibo mercadería (32) →
   * Aceptación (33), o Acuse (30) → Reclamo (31). Llamada síncrona y bloqueante a propósito
   * (decisión de producto): el evento 30 puede tardar varios minutos contra el SII real.
   * Si el acuse (30) tiene éxito pero el segundo paso falla, el acuse queda persistido
   * (gosocketSincronizadoAt) para no perder ese avance; el reintento solo repite el paso 2.
   */
  private async cambiarEstadoGoSocket(
    user: JwtPayload,
    id: string,
    accion: 'ACEPTAR' | 'RECHAZAR',
    comentario: string | undefined,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const row = await this.prisma.registroCompra.findFirst({
      where: { id, empresaId },
      include: { empresa: { select: { rut: true } } },
    });
    if (!row) throw new NotFoundException('Registro de compra no encontrado');
    const gid = this.assertGoSocketRow(row);
    if (row.gosocketEstado && row.gosocketEstado !== 'PENDIENTE') {
      throw new ConflictException('El documento ya fue aceptado o rechazado en GoSocket');
    }
    if (accion === 'RECHAZAR' && !comentario?.trim()) {
      throw new BadRequestException('El comentario es obligatorio para rechazar/reclamar');
    }
    if (!this.billing) {
      throw new ServiceUnavailableException('Cliente billing-gateway no disponible');
    }

    const acuseYaEnviado = Boolean(row.gosocketSincronizadoAt);
    if (!acuseYaEnviado) {
      const acuse = await this.billing.changePurchaseDocumentStatus(
        gid,
        GOSOCKET_EVENT_ACUSE_RECIBO,
        row.empresa.rut,
        empresaId,
      );
      this.assertGoSocketChangeOk(acuse, 'Acuse de recibo (30)');
      // Persistimos el acuse de inmediato: si el paso 2 falla, no queremos perder este avance.
      await this.prisma.registroCompra.update({
        where: { id: row.id },
        data: { gosocketSincronizadoAt: new Date() },
      });
    }

    let result;
    if (accion === 'ACEPTAR') {
      const recibo = await this.billing.changePurchaseDocumentStatus(
        gid,
        GOSOCKET_EVENT_RECIBO_MERCADERIA,
        row.empresa.rut,
        empresaId,
        comentario,
      );
      this.assertGoSocketChangeOk(recibo, 'Recibo de mercadería (32)');
      result = await this.billing.changePurchaseDocumentStatus(
        gid,
        GOSOCKET_EVENT_ACEPTACION,
        row.empresa.rut,
        empresaId,
        comentario,
      );
    } else {
      result = await this.billing.changePurchaseDocumentStatus(
        gid,
        GOSOCKET_EVENT_RECLAMO,
        row.empresa.rut,
        empresaId,
        comentario,
      );
    }
    this.assertGoSocketChangeOk(
      result,
      accion === 'ACEPTAR' ? 'Aceptación (33)' : 'Reclamo (31)',
    );

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: user.sub },
      select: { nombre: true, email: true },
    });
    const nombre = usuario?.nombre?.trim() || usuario?.email || user.email;

    const updated = await this.prisma.registroCompra.update({
      where: { id: row.id },
      data:
        accion === 'ACEPTAR'
          ? {
            aceptacionEstado: 'ACEPTADA_PLAZO',
            aceptacionOrigen: 'GOSOCKET',
            aceptadaAt: new Date(),
            aceptadaPorId: user.sub,
            aceptadaPorNombre: nombre,
            gosocketEstado: 'ACEPTADO',
          }
          : {
            aceptacionEstado: 'RECLAMADA',
            aceptacionOrigen: 'GOSOCKET',
            aceptadaAt: new Date(),
            aceptadaPorId: user.sub,
            aceptadaPorNombre: nombre,
            gosocketEstado: 'RECHAZADO',
            gosocketRechazoOrigen: 'COMERCIAL',
            gosocketRechazoMotivo: comentario?.trim(),
          },
    });
    return mapRegistro(updated);
  }
}
