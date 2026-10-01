import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../auth/jwt.strategy';
import {
  assertTenantAccess,
  resolveOperationalEmpresa,
  resolveTenant,
} from '../../auth/tenant.util';
import { ContabilizarService } from '../contabilidad/contabilizar.service';
import {
  dimensionesDeConfigSii,
  type DimensionesAsiento,
} from '../contabilidad/config-sii-dimensiones.util';
import { CuentaCorrienteService } from './cuenta-corriente.service';
import { ocPermiteContabilizarOPagar } from '../compras/oc-estado.util';
import {
  assertPeriodWeek,
  normalizeSemanaCompromiso,
  periodWeekFromDate,
  semanaCompromisoDesdeEmision,
} from './period-week.util';

const TIPOS_PAGO = new Set(['PAGO_TOTAL', 'ANTICIPO', 'ANTICIPO_PRODUCTOR']);
const DESTINOS_CARTOLA = new Set([
  'FACTURA',
  'ANTICIPO',
  'TRASPASO',
  'SUELDO',
  'RENDICION',
  'OTRO',
]);
const DESTINOS_CON_PAGO = new Set(['FACTURA', 'ANTICIPO']);
import {
  AplazarNominaLoteDto,
  UpdateAnticipoCalceDto,
  UpdateDocumentoAgingDto,
  UpsertAnticipoDto,
  UpsertCartolaDto,
  UpsertConciliacionDto,
  FlujoCajaQueryDto,
  CorregirAperturaDto,
  UpsertMovimientoCajaDto,
  UpsertPagoDto,
  CalzarProductorDto,
  ContabilizarMovimientoCartolaDto,
  AsociarNominaCartolaDto,
  CalcularDiferenciaTcDto,
} from './dto/tesoreria.dto';
import { calcularDiferenciaTc } from './tesoreria-tc.util';
import {
  esBancoApertura,
  inferMonedaBanco,
  matchesMonedaFiltro,
  MONEDAS_FLUJO,
  normalizeMonedaCodigo,
  periodoYmFromFecha,
  rollupFlujoExcel,
  saldosPorBancoMoneda,
  totalesMonedaFlujo,
} from './flujo-caja.util';
import {
  debeSugerirTcBc,
  monedaParaSugerirTc,
  normalizeMonedaTc,
  tcDeFecha,
} from '../catalogos/tipo-cambio.util';

const MONEDAS_CAJA = MONEDAS_FLUJO;

function assertDimensionesContracuenta(
  contra: {
    codigo: string;
    requiereCc: boolean;
    requiereArea: boolean;
    requiereElemento: boolean;
    centrosCosto?: { centroCostoId: string }[];
    areasNegocio?: { areaNegocioId: string }[];
    elementosCosto?: { elementoCostoId: string }[];
  },
  dim: {
    centroCostoId?: string | null;
    areaNegocioId?: string | null;
    elementoCostoId?: string | null;
  },
) {
  const checks: Array<{
    exige: boolean;
    ligados: string[];
    valor?: string | null;
    nombre: string;
    ligadosLabel: string;
  }> = [
    {
      exige: contra.requiereCc,
      ligados: (contra.centrosCosto ?? []).map((x) => x.centroCostoId),
      valor: dim.centroCostoId,
      nombre: 'centro de costo',
      ligadosLabel: 'centros',
    },
    {
      exige: contra.requiereArea,
      ligados: (contra.areasNegocio ?? []).map((x) => x.areaNegocioId),
      valor: dim.areaNegocioId,
      nombre: 'área de negocio',
      ligadosLabel: 'áreas',
    },
    {
      exige: contra.requiereElemento,
      ligados: (contra.elementosCosto ?? []).map((x) => x.elementoCostoId),
      valor: dim.elementoCostoId,
      nombre: 'elemento de costo',
      ligadosLabel: 'elementos',
    },
  ];
  for (const c of checks) {
    if (!c.exige) continue;
    if (!c.ligados.length) {
      throw new BadRequestException(
        `La cuenta ${contra.codigo} exige ${c.nombre}, pero el plan no tiene ${c.ligadosLabel} ligados. Configúralos en Contabilidad › Plan de cuentas.`,
      );
    }
    if (!c.valor) {
      throw new BadRequestException(`La cuenta ${contra.codigo} exige ${c.nombre}`);
    }
    if (!c.ligados.includes(c.valor)) {
      throw new BadRequestException(
        `${c.nombre.charAt(0).toUpperCase()}${c.nombre.slice(1)} no permitido para ${contra.codigo}`,
      );
    }
  }
}

function parseDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? '').trim());
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Fecha inválida: ${value}`);
  return d;
}

const ESTADOS_GENERICOS_VALIDOS = new Set<string>(['ACTIVO', 'INACTIVO', 'PENDIENTE', 'BORRADOR']);

function normalizeRut(rut: string): string {
  return rut.replace(/[.\s-]/g, '').toUpperCase();
}

function parseEstadoGenerico(value: string | undefined, fallback: string): string {
  const raw = (value?.trim() || fallback).toUpperCase();
  if (!ESTADOS_GENERICOS_VALIDOS.has(raw)) {
    throw new BadRequestException(
      `estado inválido: ${raw}. Valores permitidos: ${[...ESTADOS_GENERICOS_VALIDOS].join(', ')}`,
    );
  }
  return raw;
}

function mapCartola(row: {
  id: string;
  banco: string;
  bancoCodigo: string | null;
  fechaCarga: Date;
  periodo: string;
  mesContable: string | null;
  moneda?: string | null;
  archivoNombre: string;
  formato: string;
  movimientos: number;
  montoTotal: Prisma.Decimal;
  estado: string;
  pendientesContabilizar: number;
  usuarioCarga: string | null;
}) {
  return {
    id: row.id,
    banco: row.banco,
    bancoCodigo: row.bancoCodigo ?? undefined,
    fechaCarga: row.fechaCarga.toISOString().slice(0, 10),
    periodo: row.periodo,
    mesContable: row.mesContable ?? undefined,
    moneda: row.moneda ?? undefined,
    archivoNombre: row.archivoNombre,
    formato: row.formato as 'EXCEL' | 'PDF',
    movimientos: row.movimientos,
    montoTotal: Number(row.montoTotal),
    estado: row.estado,
    pendientesContabilizar: row.pendientesContabilizar,
    usuarioCarga: row.usuarioCarga ?? undefined,
  };
}

function optTrim(v?: string | null): string | null {
  const s = v?.trim();
  return s ? s : null;
}

/** Sin folio de factura: vacío o solo referencia de cartola (aún se puede calzar). */
function isCalceLibre(documentosCalce?: string | null): boolean {
  const s = optTrim(documentosCalce);
  if (!s) return true;
  return /^cartola\b/i.test(s);
}

function tcNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapPago(r: {
  id: string;
  fecha: Date;
  beneficiario: string;
  monto: Prisma.Decimal | number;
  medio: string;
  estado: string;
  tcManual?: Prisma.Decimal | number | null;
  monedaPago?: string | null;
  monedaFactura?: string | null;
  diferenciaTc?: Prisma.Decimal | number | null;
  documentosCalce?: string | null;
  movimientoCartolaId?: string | null;
  proveedorId?: string | null;
  clienteId?: string | null;
  tipo?: string | null;
}) {
  return {
    id: r.id,
    fecha: r.fecha.toISOString().slice(0, 10),
    beneficiario: r.beneficiario,
    monto: Number(r.monto),
    medio: r.medio,
    estado: r.estado,
    tcManual: r.tcManual != null ? Number(r.tcManual) : undefined,
    monedaPago: r.monedaPago ?? undefined,
    monedaFactura: r.monedaFactura ?? undefined,
    diferenciaTc: r.diferenciaTc != null ? Number(r.diferenciaTc) : undefined,
    documentosCalce: r.documentosCalce ?? undefined,
    movimientoCartolaId: r.movimientoCartolaId ?? undefined,
    proveedorId: r.proveedorId ?? undefined,
    clienteId: r.clienteId ?? undefined,
    tipo: r.tipo ?? 'PAGO_TOTAL',
  };
}

function mapMovimientoCartola(r: {
  id: string;
  cartolaId: string;
  fecha: Date;
  referencia: string;
  glosa: string;
  monto: Prisma.Decimal;
  tipo: string;
  estadoContable: string;
  asientoNumero: string | null;
  pagoId: string | null;
  cuentaContraId?: string | null;
  destinoTipo?: string | null;
  codigoFinancieroId?: string | null;
  tipoDocumento?: string | null;
  folioDocumento?: string | null;
  proveedorId?: string | null;
  clienteId?: string | null;
  codigoFinanciero?: { codigo: string; nombre: string } | null;
  nominaSemana?: string | null;
}) {
  return {
    id: r.id,
    cartolaId: r.cartolaId,
    fecha: r.fecha.toISOString().slice(0, 10),
    referencia: r.referencia,
    glosa: r.glosa,
    monto: Number(r.monto),
    tipo: r.tipo,
    estadoContable: r.estadoContable,
    asientoNumero: r.asientoNumero ?? undefined,
    pagoId: r.pagoId ?? undefined,
    cuentaContraId: r.cuentaContraId ?? undefined,
    destinoTipo: r.destinoTipo ?? undefined,
    codigoFinancieroId: r.codigoFinancieroId ?? undefined,
    codigoFinanciero: r.codigoFinanciero
      ? `${r.codigoFinanciero.codigo} · ${r.codigoFinanciero.nombre}`
      : undefined,
    tipoDocumento: r.tipoDocumento ?? undefined,
    folioDocumento: r.folioDocumento ?? undefined,
    proveedorId: r.proveedorId ?? undefined,
    clienteId: r.clienteId ?? undefined,
    nominaSemana: r.nominaSemana ?? undefined,
  };
}

@Injectable()
export class TesoreriaService {
  constructor(
    private prisma: PrismaService,
    @Optional() private contabilizar?: ContabilizarService,
    @Optional() private cuentaCorriente?: CuentaCorrienteService,
  ) {}

  /**
   * Cuenta banco/caja + contrapartida para contabilizar un movimiento de
   * cartola. Usa Config SII (BANCO / PROVEEDORES / CLIENTES) si existe, y si
   * no cae al primer par de cuentas imputables activas (P0-1: nunca líneas
   * de asiento sin cuentaId).
   */
  private async resolveCuentasCartola(empresaId: string): Promise<{
    bancoId: string;
    contraId: string;
    dimBanco: DimensionesAsiento;
    dimContra: DimensionesAsiento;
  }> {
    const cfgBanco = await this.prisma.configContableSii.findFirst({
      where: { empresaId, activa: true, tipoDocumentoSii: { in: ['BANCO', 'CAJA_BANCO'] } },
    });
    let bancoId = cfgBanco?.cuentaContableId;
    if (!bancoId) {
      const cta = await this.prisma.cuentaContable.findFirst({
        where: { empresaId, activa: true, noImputable: false },
        orderBy: { codigo: 'asc' },
      });
      bancoId = cta?.id;
    }
    if (!bancoId) {
      throw new BadRequestException('No hay cuenta banco/caja configurada (Config SII → BANCO)');
    }

    const cfgContra = await this.prisma.configContableSii.findFirst({
      where: {
        empresaId,
        activa: true,
        tipoDocumentoSii: { in: ['PROVEEDORES', 'CLIENTES', 'CLIENTES_POR_COBRAR'] },
      },
    });
    let contraId = cfgContra?.cuentaContableId;
    if (!contraId) {
      const contra = await this.prisma.cuentaContable.findFirst({
        where: { empresaId, activa: true, noImputable: false, id: { not: bancoId } },
        orderBy: { codigo: 'asc' },
      });
      contraId = contra?.id || bancoId;
    }
    return {
      bancoId,
      contraId,
      dimBanco: dimensionesDeConfigSii(cfgBanco),
      dimContra: dimensionesDeConfigSii(cfgContra),
    };
  }

  /**
   * Cuenta contable para registrar la Ganancia o Pérdida por Diferencia de Cambio.
   * Prioridad:
   * 1. Config SII (DIFERENCIA_CAMBIO / DIFERENCIA_TIPO_CAMBIO)
   * 2. Cuenta estándar '6-3-01-01-003' (DIFERENCIA TIPO CAMBIO)
   * 3. Búsqueda por nombre en el plan de cuentas
   * 4. Fallback a la cuenta contraparte
   */
  private async resolveCuentaDiferenciaCambio(empresaId: string, fallbackId: string): Promise<{
    cuentaId: string;
    dim: DimensionesAsiento;
  }> {
    const cfg = await this.prisma.configContableSii.findFirst({
      where: {
        empresaId,
        activa: true,
        tipoDocumentoSii: { in: ['DIFERENCIA_CAMBIO', 'DIFERENCIA_TIPO_CAMBIO', 'DIF_CAMBIO'] },
      },
    });
    if (cfg?.cuentaContableId) {
      return {
        cuentaId: cfg.cuentaContableId,
        dim: dimensionesDeConfigSii(cfg),
      };
    }
    const cta = await this.prisma.cuentaContable.findFirst({
      where: {
        empresaId,
        activa: true,
        noImputable: false,
        OR: [
          { codigo: '6-3-01-01-003' },
          { nombre: { contains: 'DIFERENCIA TIPO CAMBIO', mode: 'insensitive' } },
          { nombre: { contains: 'DIFERENCIA DE CAMBIO', mode: 'insensitive' } },
        ],
      },
    });
    if (cta) {
      return { cuentaId: cta.id, dim: {} };
    }
    return { cuentaId: fallbackId, dim: {} };
  }

  async getMovimientosCaja(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.movimientoCaja.findMany({
      where: { empresaId },
      orderBy: { fecha: 'asc' },
    });
    return rows.map((r) => this.mapMovimientoCaja(r));
  }

  /**
   * Read-model T3: aperturas inmutables + cartola CONTABILIZADO.
   * Rollup por concepto + código financiero + moneda + mes (Excel Mario).
   */
  async getFlujoCaja(
    user: JwtPayload,
    query: FlujoCajaQueryDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || query.empresaId);
    const monedaFiltro = query.moneda?.trim();
    const periodoFiltro = query.periodo?.trim();
    if (periodoFiltro && !/^\d{4}-\d{2}$/.test(periodoFiltro)) {
      throw new BadRequestException('periodo inválido (YYYY-MM)');
    }
    const [aperturas, cartolaRows] = await Promise.all([
      this.prisma.movimientoCaja.findMany({
        where: { empresaId, esApertura: true },
        orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.movimientoCartola.findMany({
        where: { empresaId, estadoContable: 'CONTABILIZADO' },
        include: {
          cartola: { select: { banco: true, bancoCodigo: true, moneda: true } },
          codigoFinanciero: {
            select: {
              id: true,
              codigo: true,
              nombre: true,
              conceptoId: true,
              concepto: { select: { id: true, codigo: true, nombre: true, orden: true } },
            },
          },
        },
        orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const raw: Array<{
      periodo: string;
      moneda: string;
      ingreso: number;
      egreso: number;
      esApertura?: boolean;
      conceptoId?: string;
      conceptoCodigo?: string;
      conceptoNombre?: string;
      conceptoOrden?: number;
      codigoFinancieroId?: string;
      codigoFinancieroCodigo?: string;
      codigoFinancieroNombre?: string;
      banco?: string;
      movimientoCajaId?: string;
      fecha?: string;
    }> = [];

    for (const a of aperturas) {
      const moneda = normalizeMonedaCodigo(a.moneda);
      if (!matchesMonedaFiltro(moneda, monedaFiltro)) continue;
      const fecha = a.fecha.toISOString().slice(0, 10);
      const periodo = periodoYmFromFecha(fecha);
      if (periodoFiltro && periodo !== periodoFiltro) continue;
      raw.push({
        periodo,
        moneda,
        ingreso: Number(a.ingreso),
        egreso: Number(a.egreso),
        esApertura: true,
        banco: a.banco ?? undefined,
        movimientoCajaId: a.id,
        fecha,
      });
    }

    for (const m of cartolaRows) {
      const banco = m.cartola?.banco;
      const stored = m.cartola?.moneda?.trim();
      const moneda = stored
        ? normalizeMonedaCodigo(stored)
        : inferMonedaBanco(banco, m.cartola?.bancoCodigo);
      if (!matchesMonedaFiltro(moneda, monedaFiltro)) continue;
      const fecha = m.fecha.toISOString().slice(0, 10);
      const periodo = periodoYmFromFecha(fecha);
      if (periodoFiltro && periodo !== periodoFiltro) continue;
      const monto = Math.abs(Number(m.monto));
      const tipo = String(m.tipo).toUpperCase();
      const cf = m.codigoFinanciero;
      raw.push({
        periodo,
        moneda,
        ingreso: tipo === 'INGRESO' ? monto : 0,
        egreso: tipo === 'EGRESO' ? monto : 0,
        conceptoId: cf?.concepto?.id || cf?.conceptoId || undefined,
        conceptoCodigo: cf?.concepto?.codigo,
        conceptoNombre: cf?.concepto?.nombre,
        conceptoOrden: cf?.concepto?.orden,
        codigoFinancieroId: cf?.id,
        codigoFinancieroCodigo: cf?.codigo,
        codigoFinancieroNombre: cf?.nombre,
        banco,
      });
    }

    const filas = rollupFlujoExcel(raw);
    return {
      filas,
      totalesMoneda: totalesMonedaFlujo(filas),
    };
  }

  async getSaldosBancos(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const [aperturas, cartolaRows] = await Promise.all([
      this.prisma.movimientoCaja.findMany({
        where: { empresaId, esApertura: true },
      }),
      this.prisma.movimientoCartola.findMany({
        where: { empresaId, estadoContable: 'CONTABILIZADO' },
        include: { cartola: { select: { banco: true, bancoCodigo: true, moneda: true } } },
      }),
    ]);
    const raw: Array<{ banco?: string; moneda: string; ingreso: number; egreso: number }> = [];
    for (const a of aperturas) {
      raw.push({
        banco: a.banco ?? undefined,
        moneda: normalizeMonedaCodigo(a.moneda),
        ingreso: Number(a.ingreso),
        egreso: Number(a.egreso),
      });
    }
    for (const m of cartolaRows) {
      const banco = m.cartola?.banco;
      const stored = m.cartola?.moneda?.trim();
      const moneda = stored
        ? normalizeMonedaCodigo(stored)
        : inferMonedaBanco(banco, m.cartola?.bancoCodigo);
      const monto = Math.abs(Number(m.monto));
      const tipo = String(m.tipo).toUpperCase();
      raw.push({
        banco,
        moneda,
        ingreso: tipo === 'INGRESO' ? monto : 0,
        egreso: tipo === 'EGRESO' ? monto : 0,
      });
    }
    return { saldos: saldosPorBancoMoneda(raw) };
  }

  private parseNominaSemana(raw?: string | null): string | null {
    const s = raw?.trim();
    if (!s) return null;
    try {
      return assertPeriodWeek(s);
    } catch {
      throw new BadRequestException('Nómina inválida (YYYY-MM-Sn, n=1–5 del mes)');
    }
  }

  async asociarNominaCartola(user: JwtPayload, dto: AsociarNominaCartolaDto) {
    const scope = resolveTenant(user);
    const semana = this.parseNominaSemana(dto.nominaSemana);
    if (!semana) throw new BadRequestException('Indica la semana de nómina');
    const ids = [...new Set(dto.ids.map((id) => String(id).trim()).filter(Boolean))];
    if (!ids.length) throw new BadRequestException('Selecciona al menos un movimiento');

    const rows = await this.prisma.movimientoCartola.findMany({
      where: { id: { in: ids } },
    });
    if (rows.length !== ids.length) {
      throw new NotFoundException('Uno o más movimientos no existen');
    }
    for (const r of rows) {
      assertTenantAccess(scope, r.empresaId);
      if (String(r.tipo).toUpperCase() !== 'EGRESO') {
        throw new BadRequestException('La nómina solo se asocia a egresos');
      }
    }
    const empresaId = rows[0].empresaId;
    if (rows.some((r) => r.empresaId !== empresaId)) {
      throw new BadRequestException('Los movimientos deben ser de la misma empresa');
    }

    await this.prisma.movimientoCartola.updateMany({
      where: { id: { in: ids }, empresaId },
      data: { nominaSemana: semana },
    });

    const sumaMovs = rows.reduce((a, r) => a + Math.abs(Number(r.monto)), 0);
    const aging = await this.prisma.documentoAging.findMany({
      where: { empresaId, tipo: 'POR_PAGAR', semanaCompromiso: semana },
    });
    const sumaNomina = aging.reduce((a, r) => a + Number(r.saldo ?? r.monto), 0);
    const warning =
      sumaNomina > 0 && Math.abs(sumaMovs - sumaNomina) > 0.5
        ? `La suma de egresos (${sumaMovs}) no coincide con el total de la nómina ${semana} (${sumaNomina}). Se asoció igual.`
        : undefined;

    const updated = await this.prisma.movimientoCartola.findMany({
      where: { id: { in: ids } },
      include: { codigoFinanciero: { select: { codigo: true, nombre: true } } },
      orderBy: { fecha: 'asc' },
    });
    return {
      ok: true,
      nominaSemana: semana,
      asociados: updated.length,
      sumaMovimientos: sumaMovs,
      sumaNomina: sumaNomina || undefined,
      warning,
      movimientos: updated.map((r) => mapMovimientoCartola(r)),
    };
  }

  private mapMovimientoCaja(r: {
    id: string;
    fecha: Date;
    concepto: string;
    ingreso: Prisma.Decimal;
    egreso: Prisma.Decimal;
    saldo: Prisma.Decimal;
    banco?: string | null;
    moneda?: string | null;
    esApertura?: boolean;
  }) {
    return {
      id: r.id,
      fecha: r.fecha.toISOString().slice(0, 10),
      concepto: r.concepto,
      ingreso: Number(r.ingreso),
      egreso: Number(r.egreso),
      saldo: Number(r.saldo),
      banco: r.banco ?? undefined,
      moneda: r.moneda ?? 'CLP',
      esApertura: Boolean(r.esApertura),
    };
  }

  async createMovimientoCaja(
    user: JwtPayload,
    dto: UpsertMovimientoCajaDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const ingreso = Number(dto.ingreso ?? 0);
    const egreso = Number(dto.egreso ?? 0);
    if (ingreso <= 0 && egreso <= 0) {
      throw new BadRequestException('Indica ingreso o egreso mayor a cero');
    }
    const banco = dto.banco?.trim() || null;
    const moneda = normalizeMonedaCodigo(dto.moneda);
    if (!MONEDAS_CAJA.has(moneda)) {
      throw new BadRequestException('moneda inválida (CLP, USD o CNY)');
    }
    const esApertura = Boolean(dto.esApertura);
    if (esApertura) {
      if (!esBancoApertura(banco)) {
        throw new BadRequestException('El banco de la apertura debe ser el de la cartola');
      }
      const dup = await this.prisma.movimientoCaja.findFirst({
        where: { empresaId, esApertura: true, banco, moneda },
      });
      if (dup) {
        throw new BadRequestException('Ya existe saldo de apertura para este banco y moneda');
      }
      if (egreso > 0) throw new BadRequestException('La apertura no lleva egreso');
    }
    const last = await this.prisma.movimientoCaja.findFirst({
      where: { empresaId, banco, moneda, esApertura: false },
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
    });
    const apertura = await this.prisma.movimientoCaja.findFirst({
      where: { empresaId, banco, moneda, esApertura: true },
    });
    const saldoPrev = last
      ? Number(last.saldo)
      : apertura
        ? Number(apertura.saldo)
        : 0;
    const row = await this.prisma.movimientoCaja.create({
      data: {
        fecha: parseDate(dto.fecha),
        concepto: dto.concepto.trim(),
        ingreso,
        egreso,
        saldo: esApertura ? ingreso : saldoPrev + ingreso - egreso,
        banco,
        moneda,
        esApertura,
        empresaId,
      },
    });
    if (!esApertura) await this.recalcularSaldosCaja(empresaId, banco, moneda);
    return this.mapMovimientoCaja(row);
  }

  private async recalcularSaldosCaja(empresaId: string, banco?: string | null, moneda?: string) {
    const buckets = await this.prisma.movimientoCaja.findMany({
      where: {
        empresaId,
        ...(banco !== undefined ? { banco } : {}),
        ...(moneda ? { moneda } : {}),
      },
      orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
    });
    const groups = new Map<string, typeof buckets>();
    for (const r of buckets) {
      const key = `${r.banco ?? ''}::${r.moneda ?? 'CLP'}`;
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
    for (const rows of groups.values()) {
      const apertura = rows.find((r) => r.esApertura);
      let saldo = apertura ? Number(apertura.ingreso) : 0;
      if (apertura && Number(apertura.saldo) !== saldo) {
        await this.prisma.movimientoCaja.update({
          where: { id: apertura.id },
          data: { saldo },
        });
      }
      for (const r of rows) {
        if (r.esApertura) continue;
        saldo += Number(r.ingreso) - Number(r.egreso);
        if (Number(r.saldo) !== saldo) {
          await this.prisma.movimientoCaja.update({
            where: { id: r.id },
            data: { saldo },
          });
        }
      }
    }
  }

  async corregirApertura(user: JwtPayload, id: string, dto: CorregirAperturaDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.movimientoCaja.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Movimiento de caja no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    if (!existing.esApertura) {
      throw new BadRequestException('Solo se corrige un saldo de apertura');
    }
    const banco = dto.banco.trim();
    if (!esBancoApertura(banco)) {
      throw new BadRequestException('El banco de la apertura debe ser el de la cartola');
    }
    const moneda = normalizeMonedaCodigo(dto.moneda);
    if (!MONEDAS_CAJA.has(moneda)) {
      throw new BadRequestException('moneda inválida (CLP, USD o CNY)');
    }
    const ingreso = Number(dto.ingreso);
    if (!(ingreso > 0)) throw new BadRequestException('Indica un saldo de apertura mayor a cero');
    const motivo = dto.motivo.trim();
    if (motivo.length < 3) throw new BadRequestException('Indica el motivo de la corrección');
    const cambiaCuenta = banco !== (existing.banco ?? '') || moneda !== normalizeMonedaCodigo(existing.moneda);
    if (cambiaCuenta) {
      const dup = await this.prisma.movimientoCaja.findFirst({
        where: { empresaId: existing.empresaId, esApertura: true, banco, moneda, NOT: { id } },
      });
      if (dup) {
        throw new BadRequestException('Ya existe saldo de apertura para este banco y moneda');
      }
    }
    const fecha = parseDate(dto.fecha);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.aperturaCorreccion.create({
        data: {
          movimientoCajaId: id,
          empresaId: existing.empresaId,
          bancoAnterior: existing.banco,
          bancoNuevo: banco,
          monedaAnterior: normalizeMonedaCodigo(existing.moneda),
          monedaNueva: moneda,
          montoAnterior: existing.ingreso,
          montoNuevo: ingreso,
          fechaAnterior: existing.fecha,
          fechaNueva: fecha,
          motivo,
          usuarioId: user.sub,
          usuarioEmail: user.email,
        },
      });
      return tx.movimientoCaja.update({
        where: { id },
        data: {
          fecha,
          banco,
          moneda,
          ingreso,
          egreso: 0,
          saldo: ingreso,
          concepto: `Saldo de apertura ${moneda}`,
        },
      });
    });
    return this.mapMovimientoCaja(row);
  }

  async updateMovimientoCaja(user: JwtPayload, id: string, dto: UpsertMovimientoCajaDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.movimientoCaja.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Movimiento de caja no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    const ingreso = Number(dto.ingreso ?? 0);
    const egreso = Number(dto.egreso ?? 0);
    if (existing.esApertura) {
      throw new BadRequestException('El saldo de apertura se corrige con motivo, no se edita como un movimiento');
    }
    if (ingreso <= 0 && egreso <= 0) {
      throw new BadRequestException('Indica ingreso o egreso mayor a cero');
    }
    const row = await this.prisma.movimientoCaja.update({
      where: { id },
      data: {
        fecha: parseDate(dto.fecha),
        concepto: dto.concepto.trim(),
        ingreso,
        egreso,
        banco: dto.banco?.trim() ?? existing.banco,
        moneda: normalizeMonedaCodigo(dto.moneda || existing.moneda || 'CLP'),
      },
    });
    await this.recalcularSaldosCaja(existing.empresaId, row.banco, row.moneda);
    const updated = await this.prisma.movimientoCaja.findUniqueOrThrow({ where: { id: row.id } });
    return this.mapMovimientoCaja(updated);
  }

  async deleteMovimientoCaja(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.movimientoCaja.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Movimiento de caja no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    if (existing.esApertura) {
      throw new BadRequestException('El saldo de apertura no se elimina');
    }
    await this.prisma.movimientoCaja.delete({ where: { id } });
    await this.recalcularSaldosCaja(existing.empresaId, existing.banco, existing.moneda);
    return { ok: true };
  }

  /** TC BC persistido de la fecha (o último hábil anterior). No llama al partner. */
  private async lookupTcBc(fecha: Date, monedaPago?: string | null): Promise<number | null> {
    const moneda = normalizeMonedaTc(monedaPago);
    if (moneda !== 'USD' && moneda !== 'CNY' && moneda !== 'EUR') return null;
    const dayIso = fecha.toISOString().slice(0, 10);
    const day = new Date(`${dayIso}T00:00:00.000Z`);
    const rows = (await this.prisma.indicadorBc.findMany({
      where: { empresaId: null, fecha: { lte: day } },
      orderBy: { fecha: 'desc' },
      take: 21,
      select: { fecha: true, usd: true, eur: true, cny: true },
    })) ?? [];
    return tcDeFecha(
      rows.map((r) => ({
        fecha: r.fecha.toISOString().slice(0, 10),
        usd: Number(r.usd),
        eur: Number(r.eur),
        cny: Number(r.cny),
      })),
      dayIso,
      moneda,
    );
  }

  async getPagos(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.pago.findMany({
      where: { empresaId },
      orderBy: { fecha: 'desc' },
    });
    return rows.map((r) => mapPago(r));
  }

  async createPago(user: JwtPayload, dto: UpsertPagoDto, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const movId = dto.movimientoCartolaId?.trim() || null;
    let movCartola: {
      id: string;
      cartolaId: string;
      empresaId: string;
      pagoId: string | null;
      referencia: string;
      glosa: string;
      monto: Prisma.Decimal;
      tipo: string;
    } | null = null;

    if (movId) {
      movCartola = await this.prisma.movimientoCartola.findUnique({ where: { id: movId } });
      if (!movCartola) throw new NotFoundException('Movimiento de cartola no encontrado');
      assertTenantAccess(resolveTenant(user), movCartola.empresaId);
      if (movCartola.empresaId !== empresaId) {
        throw new BadRequestException('El movimiento no pertenece a la empresa activa');
      }
      // EX-29: no permitir calce duplicado del mismo TRX.
      if (movCartola.pagoId) {
        throw new BadRequestException('Este movimiento de cartola ya está calzado con un pago');
      }
      const dup = await this.prisma.pago.findUnique({
        where: { movimientoCartolaId: movId },
      });
      if (dup) {
        throw new BadRequestException('Este movimiento de cartola ya está calzado con un pago');
      }
    }

    const estadoPago = parseEstadoGenerico(dto.estado, movId ? 'ACTIVO' : 'PENDIENTE');

    const proveedorId = dto.proveedorId?.trim() || '';
    const clienteId = dto.clienteId?.trim() || '';
    if (proveedorId && clienteId) {
      throw new BadRequestException('Indica proveedor o cliente, no ambos');
    }
    let beneficiario = dto.beneficiario?.trim() || '';
    let terceroTipo: 'PROVEEDOR' | 'CLIENTE' = 'PROVEEDOR';
    let terceroId = proveedorId;

    if (proveedorId) {
      const p = await this.prisma.proveedor.findFirst({
        where: { id: proveedorId, empresaId, activo: true },
      });
      if (!p) throw new BadRequestException('Proveedor no encontrado en la empresa');
      beneficiario = p.razonSocial;
      terceroTipo = 'PROVEEDOR';
      terceroId = proveedorId;
    } else if (clienteId) {
      const c = await this.prisma.cliente.findFirst({
        where: { id: clienteId, empresaId, activo: true },
      });
      if (!c) throw new BadRequestException('Cliente no encontrado en la empresa');
      beneficiario = c.razonSocial;
      terceroTipo = 'CLIENTE';
      terceroId = clienteId;
    } else {
      throw new BadRequestException('Debes seleccionar un proveedor o un cliente del maestro');
    }

    const tipoPago = (dto.tipo?.trim() || 'PAGO_TOTAL').toUpperCase();
    if (!TIPOS_PAGO.has(tipoPago)) {
      throw new BadRequestException('tipo de pago inválido');
    }
    if (tipoPago === 'ANTICIPO_PRODUCTOR') {
      if (dto.tcManual == null) {
        throw new BadRequestException('Anticipo productor requiere tipo de cambio (tcManual)');
      }
      const prod = proveedorId
        ? await this.prisma.proveedor.findFirst({
            where: { id: proveedorId, empresaId },
            select: { esProductor: true },
          })
        : await this.prisma.cliente.findFirst({
            where: { id: clienteId, empresaId },
            select: { esProductor: true },
          });
      if (!prod?.esProductor) {
        throw new BadRequestException(
          'Este anticipo de productor requiere una ficha con la casilla Productor. Actívala en Parametrización › Proveedores (o Clientes), o elige otra contraparte.',
        );
      }
    }

    if (dto.documentosCalce?.trim()) {
      await this.assertDocumentosCalceOperable(empresaId, dto.documentosCalce, { clienteId });
    }

    const skipMissingAging = Boolean(movId);
    if (tipoPago === 'PAGO_TOTAL' && dto.documentosCalce?.trim() && !skipMissingAging) {
      await this.assertDeudaDisponibleParaPago(
        empresaId,
        dto.documentosCalce,
        {
          tipo: terceroTipo === 'CLIENTE' ? 'POR_COBRAR' : 'POR_PAGAR',
          contraparte: beneficiario,
        },
      );
    }

    let tcManual = dto.tcManual ?? null;
    if (debeSugerirTcBc({
      tipoPago,
      monedaPago: dto.monedaPago,
      monedaFactura: dto.monedaFactura,
      tcManual,
    })) {
      const suggested = await this.lookupTcBc(
        parseDate(dto.fecha),
        monedaParaSugerirTc(dto.monedaPago, dto.monedaFactura),
      );
      if (suggested != null) tcManual = suggested;
    }

    let diferenciaTc = dto.diferenciaTc ?? null;
    if (diferenciaTc == null && dto.documentosCalce?.trim() && tcManual != null) {
      try {
        const doc = await this.lookupDocumentoCartola(
          user,
          {
            folio: dto.documentosCalce.trim(),
            sentido: terceroTipo === 'CLIENTE' ? 'INGRESO' : 'EGRESO',
            empresaId,
          },
        );
        if (doc.found && doc.moneda && doc.moneda !== 'CLP') {
          const docTc = doc.tipoCambio || (doc.fecha ? await this.lookupTcBc(parseDate(doc.fecha), doc.moneda as never) : null) || tcManual;
          const resDif = calcularDiferenciaTc({
            monto: doc.montoOtraMoneda ?? (doc.monto / (docTc || 1)),
            monedaDocumento: doc.moneda,
            monedaPago: dto.monedaPago || 'CLP',
            tcDocumento: docTc || 1,
            tcPago: tcManual,
            sentido: terceroTipo === 'CLIENTE' ? 'COBRO' : 'PAGO',
          });
          if (resDif.aplica) {
            diferenciaTc = resDif.diferenciaTc;
          }
        }
      } catch {
        // No bloquear pago manual si lookup no encuentra
      }
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const pago = await tx.pago.create({
        data: {
          fecha: parseDate(dto.fecha),
          beneficiario,
          monto: dto.monto,
          medio: dto.medio.trim(),
          estado: estadoPago as never,
          tcManual,
          monedaPago: dto.monedaPago ?? null,
          monedaFactura: dto.monedaFactura ?? null,
          diferenciaTc,
          documentosCalce: optTrim(dto.documentosCalce)
            ?? (movCartola ? `Cartola ${movCartola.referencia}` : null),
          movimientoCartolaId: movId,
          proveedorId: proveedorId || null,
          clienteId: clienteId || null,
          tipo: tipoPago,
          empresaId,
        },
      });
      if (tipoPago === 'ANTICIPO_PRODUCTOR') {
        const actor = await this.resolveTcActor(user);
        await tx.pagoTcEvento.create({
          data: {
            pagoId: pago.id,
            empresaId,
            tcAnterior: null,
            tcNuevo: Number(dto.tcManual),
            motivo: optTrim(dto.motivo),
            usuarioId: actor.usuarioId,
            usuarioNombre: actor.usuarioNombre,
            usuarioEmail: actor.usuarioEmail,
          },
        });
      }
      if (movId) {
        await tx.movimientoCartola.update({
          where: { id: movId },
          data: { pagoId: pago.id },
        });
      }

      if (this.cuentaCorriente) {
        await this.cuentaCorriente.registrarMovimiento({
          empresaId,
          terceroTipo,
          terceroId: terceroId || pago.beneficiario,
          terceroNombre: pago.beneficiario,
          fecha: pago.fecha,
          documentoRef: pago.documentosCalce || pago.id,
          documentoTipo: 'PAGO',
          debe: terceroTipo === 'PROVEEDOR' ? Number(pago.monto) : 0,
          haber: terceroTipo === 'CLIENTE' ? Number(pago.monto) : 0,
          glosa: terceroTipo === 'CLIENTE'
            ? `Cobro factura ${pago.documentosCalce ?? ''}`.trim()
            : `Pago ${pago.medio}`,
          origen: 'PAGO',
          pagoId: pago.id,
          movimientoCartolaId: movId,
        }, tx);
      }

      if (tipoPago === 'PAGO_TOTAL') {
        await this.applyPagoToAging(empresaId, pago.documentosCalce, Number(pago.monto), {
          tipo: terceroTipo === 'CLIENTE' ? 'POR_COBRAR' : 'POR_PAGAR',
          contraparte: pago.beneficiario,
          skipMissing: skipMissingAging,
          tx,
        });
      }

      return pago;
    });

    return mapPago(row);
  }

  private async resolveTcActor(user: JwtPayload) {
    const u = await this.prisma.usuario.findUnique({
      where: { id: user.sub },
      select: { nombre: true, email: true },
    });
    return {
      usuarioId: user.sub,
      usuarioEmail: user.email,
      usuarioNombre: u?.nombre || user.email,
    };
  }

  /** OC operable / factura de venta CONTABILIZADA (misma regla que createPago). */
  private async assertDocumentosCalceOperable(
    empresaId: string,
    documentosCalce: string,
    opts?: { clienteId?: string },
  ) {
    const refs = documentosCalce
      .split(/[,;|/]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!refs.length) return;
    const registros = await this.prisma.registroCompra.findMany({
      where: {
        empresaId,
        estado: { not: 'ANULADO' },
        OR: refs.map((factura) => ({
          factura: { equals: factura, mode: 'insensitive' as const },
        })),
      },
      select: {
        ocId: true,
        ocNumero: true,
        factura: true,
        ordenCompra: { select: { estado: true, numero: true } },
      },
    });
    for (const r of registros) {
      if (r.ocId && !ocPermiteContabilizarOPagar(r.ordenCompra?.estado)) {
        throw new BadRequestException(
          `No se puede pagar: la OC ${r.ordenCompra?.numero ?? r.ocNumero} no está aprobada (estado: ${r.ordenCompra?.estado ?? 'desconocido'}).`,
        );
      }
    }

    const ocs = await this.prisma.ordenCompra.findMany({
      where: {
        empresaId,
        OR: refs.map((numero) => ({
          numero: { equals: numero, mode: 'insensitive' as const },
        })),
      },
      select: { numero: true, estado: true },
    });
    for (const oc of ocs) {
      if (!ocPermiteContabilizarOPagar(oc.estado)) {
        throw new BadRequestException(
          `No se puede pagar: la OC ${oc.numero} no está aprobada (estado: ${oc.estado}).`,
        );
      }
    }

    if (opts?.clienteId) {
      const docsVenta = await this.prisma.documentoComercial.findMany({
        where: {
          empresaId,
          tipo: { in: ['FACTURA', 'ND', 'NC'] },
          OR: refs.map((folio) => ({ folio: { equals: folio, mode: 'insensitive' as const } })),
        },
        select: { folio: true, estado: true },
      });
      for (const d of docsVenta) {
        if (d.estado !== 'CONTABILIZADA') {
          throw new BadRequestException(
            `No se puede cobrar: la factura ${d.folio} no está contabilizada (estado: ${d.estado}).`,
          );
        }
      }
    }
  }

  /**
   * Gate previo a persistir: cada ref de calce debe tener aging con saldo
   * o un documento CONTABILIZADO del que se pueda crear. Evita 400 post-commit.
   */
  private async assertDeudaDisponibleParaPago(
    empresaId: string,
    documentosCalce: string,
    _opts?: { tipo?: 'POR_COBRAR' | 'POR_PAGAR'; contraparte?: string },
  ) {
    const refs = documentosCalce
      .split(/[,;|/]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const ref of refs) {
      if (/^cartola\b/i.test(ref)) continue;
      const aging = await this.prisma.documentoAging.findFirst({
        where: {
          empresaId,
          documento: { equals: ref, mode: 'insensitive' },
          saldo: { gt: 0 },
        },
      });
      if (aging) continue;
      const doc = await this.prisma.documentoComercial.findFirst({
        where: { empresaId, folio: { equals: ref, mode: 'insensitive' } },
      });
      if (
        doc
        && ['FACTURA', 'ND', 'NC'].includes(doc.tipo)
        && doc.estado === 'CONTABILIZADA'
        && Number(doc.neto) + Number(doc.iva ?? 0) > 0
      ) {
        continue;
      }
      throw new BadRequestException(
        `No hay deuda contabilizada para ${ref}. Contabiliza el documento antes de pagar/cobrar.`,
      );
    }
  }

  /** Reduce saldo aging cuando el pago referencia folio/factura. */
  private async applyPagoToAging(
    empresaId: string,
    documentosCalce: string | null,
    montoPago: number,
    opts?: {
      tipo?: 'POR_COBRAR' | 'POR_PAGAR';
      contraparte?: string;
      skipMissing?: boolean;
      tx?: Prisma.TransactionClient | PrismaService;
    },
  ) {
    if (!documentosCalce?.trim() || !(montoPago > 0)) return;
    const db = opts?.tx ?? this.prisma;
    const refs = documentosCalce
      .split(/[,;|/]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!refs.length) return;

    let restante = montoPago;
    for (const ref of refs) {
      if (restante <= 0) break;
      let aging = await db.documentoAging.findFirst({
        where: {
          empresaId,
          documento: { equals: ref, mode: 'insensitive' },
          saldo: { gt: 0 },
        },
        orderBy: { fechaVencimiento: 'asc' },
      });
      if (!aging) {
        aging = await this.ensureAgingFromDocumento(empresaId, ref, opts);
      }
      if (!aging) {
        if (opts?.skipMissing || /^cartola\b/i.test(ref)) continue;
        throw new BadRequestException(
          `No hay deuda contabilizada para ${ref}. Contabiliza el documento antes de pagar/cobrar.`,
        );
      }
      const aplicar = Math.min(restante, Number(aging.saldo));
      const nuevoPagado = Number(aging.montoPagado) + aplicar;
      const nuevoSaldo = Math.max(0, Number(aging.monto) - nuevoPagado);
      await db.documentoAging.update({
        where: { id: aging.id },
        data: { montoPagado: nuevoPagado, saldo: nuevoSaldo },
      });
      restante -= aplicar;
    }
  }

  private async ensureAgingFromDocumento(
    empresaId: string,
    folio: string,
    opts?: {
      tipo?: 'POR_COBRAR' | 'POR_PAGAR';
      contraparte?: string;
      tx?: Prisma.TransactionClient | PrismaService;
    },
  ) {
    const db = opts?.tx ?? this.prisma;
    const doc = await db.documentoComercial.findFirst({
      where: { empresaId, folio },
    });
    if (!doc) return null;
    if (!['FACTURA', 'ND', 'NC'].includes(doc.tipo)) return null;
    if (doc.estado !== 'CONTABILIZADA') return null;
    const monto = Number(doc.neto) + Number(doc.iva ?? 0);
    if (!(monto > 0)) return null;
    const venc = doc.fechaVencimiento ?? doc.fecha;
    return db.documentoAging.create({
      data: {
        empresaId,
        tipo: (opts?.tipo ?? 'POR_COBRAR') as never,
        documento: doc.folio,
        contraparte: opts?.contraparte || doc.cliente,
        fechaEmision: doc.fecha,
        fechaVencimiento: venc,
        monto,
        saldo: monto,
        montoPagado: 0,
        documentoComercialId: doc.id,
      },
    });
  }

  async updatePago(user: JwtPayload, id: string, dto: UpsertPagoDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.pago.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pago no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    const calceCambia =
      optTrim(dto.documentosCalce) !== optTrim(existing.documentosCalce)
      || Number(dto.monto) !== Number(existing.monto)
      || (dto.proveedorId?.trim() || existing.proveedorId || '') !== (existing.proveedorId ?? '')
      || (dto.clienteId?.trim() || existing.clienteId || '') !== (existing.clienteId ?? '');
    if (calceCambia) {
      throw new BadRequestException(
        'No se puede editar el calce, el monto ni la contraparte. Anula y crea otro pago.',
      );
    }
    const estadoPago = parseEstadoGenerico(dto.estado, 'PENDIENTE');
    const proveedorId = dto.proveedorId?.trim() || '';
    const clienteIdDto = dto.clienteId?.trim() || '';
    if (proveedorId && clienteIdDto) {
      throw new BadRequestException('Indica proveedor o cliente, no ambos');
    }
    let beneficiario = existing.beneficiario;
    let nextProveedorId: string | null = existing.proveedorId;
    let nextClienteId: string | null = existing.clienteId;

    if (dto.clienteId?.trim() || (!dto.proveedorId?.trim() && existing.clienteId)) {
      const cid = dto.clienteId?.trim() || existing.clienteId || '';
      const c = await this.prisma.cliente.findFirst({
        where: { id: cid, empresaId: existing.empresaId, activo: true },
      });
      if (!c) throw new BadRequestException('Cliente no encontrado en la empresa');
      beneficiario = c.razonSocial;
      nextClienteId = c.id;
      nextProveedorId = null;
    } else {
      const pid = dto.proveedorId?.trim() || existing.proveedorId || '';
      if (!pid) {
        throw new BadRequestException('Debes seleccionar un proveedor o un cliente del maestro');
      }
      const p = await this.prisma.proveedor.findFirst({
        where: { id: pid, empresaId: existing.empresaId, activo: true },
      });
      if (!p) throw new BadRequestException('Proveedor no encontrado en la empresa');
      beneficiario = p.razonSocial;
      nextProveedorId = p.id;
      nextClienteId = null;
    }

    const nextTc = tcNumber(dto.tcManual);
    const prevTc = tcNumber(existing.tcManual);
    const tcCambia = nextTc !== prevTc;

    const row = await this.prisma.$transaction(async (tx) => {
      const pago = await tx.pago.update({
        where: { id },
        data: {
          fecha: parseDate(dto.fecha),
          beneficiario,
          proveedorId: nextProveedorId,
          clienteId: nextClienteId,
          monto: dto.monto,
          medio: dto.medio.trim(),
          estado: estadoPago as never,
          tcManual: nextTc,
          monedaPago: dto.monedaPago ?? null,
          monedaFactura: dto.monedaFactura ?? null,
          diferenciaTc: dto.diferenciaTc ?? null,
          documentosCalce: existing.documentosCalce,
        },
      });
      if (tcCambia && nextTc != null) {
        const actor = await this.resolveTcActor(user);
        await tx.pagoTcEvento.create({
          data: {
            pagoId: id,
            empresaId: existing.empresaId,
            tcAnterior: prevTc,
            tcNuevo: nextTc,
            motivo: optTrim(dto.motivo),
            usuarioId: actor.usuarioId,
            usuarioNombre: actor.usuarioNombre,
            usuarioEmail: actor.usuarioEmail,
          },
        });
      }
      return pago;
    });
    return mapPago(row);
  }

  async calzarProductor(user: JwtPayload, id: string, dto: CalzarProductorDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.pago.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pago no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    if (existing.tipo !== 'ANTICIPO_PRODUCTOR') {
      throw new BadRequestException('Solo se puede calzar un anticipo productor');
    }
    const folio = optTrim(dto.documentosCalce);
    if (!folio) {
      throw new BadRequestException('documentosCalce (folio factura) es requerido');
    }
    const tcNuevo = tcNumber(dto.tcManual);
    if (tcNuevo == null || !(tcNuevo > 0)) {
      throw new BadRequestException('tcManual es obligatorio');
    }
    if (!isCalceLibre(existing.documentosCalce)) {
      throw new BadRequestException(
        'Este anticipo ya tiene calce. Anula y crea otro pago.',
      );
    }

    await this.assertDocumentosCalceOperable(existing.empresaId, folio, {
      clienteId: existing.clienteId ?? '',
    });

    const prevTc = tcNumber(existing.tcManual);
    const tcCambia = prevTc !== tcNuevo;
    const terceroTipo = existing.clienteId ? 'CLIENTE' : 'PROVEEDOR';

    const row = await this.prisma.$transaction(async (tx) => {
      const pago = await tx.pago.update({
        where: { id },
        data: {
          documentosCalce: folio,
          tcManual: tcNuevo,
        },
      });
      if (tcCambia) {
        const actor = await this.resolveTcActor(user);
        await tx.pagoTcEvento.create({
          data: {
            pagoId: id,
            empresaId: existing.empresaId,
            tcAnterior: prevTc,
            tcNuevo,
            motivo: optTrim(dto.motivo),
            usuarioId: actor.usuarioId,
            usuarioNombre: actor.usuarioNombre,
            usuarioEmail: actor.usuarioEmail,
          },
        });
      }
      await this.applyPagoToAging(existing.empresaId, folio, Number(existing.monto), {
        tipo: terceroTipo === 'CLIENTE' ? 'POR_COBRAR' : 'POR_PAGAR',
        contraparte: existing.beneficiario,
        skipMissing: true,
        tx,
      });
      return pago;
    });
    return mapPago(row);
  }

  async getPagoTcEventos(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.pago.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pago no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    const rows = await this.prisma.pagoTcEvento.findMany({
      where: { pagoId: id, empresaId: existing.empresaId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      pagoId: r.pagoId,
      empresaId: r.empresaId,
      tcAnterior: r.tcAnterior != null ? Number(r.tcAnterior) : null,
      tcNuevo: Number(r.tcNuevo),
      motivo: r.motivo ?? undefined,
      usuarioId: r.usuarioId,
      usuarioNombre: r.usuarioNombre ?? undefined,
      usuarioEmail: r.usuarioEmail ?? undefined,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async getConciliaciones(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const cartolas = await this.prisma.cartolaBancaria.findMany({
      where: { empresaId },
      include: { movimientosCartola: { select: { pagoId: true, estadoContable: true } } },
      orderBy: { fechaCarga: 'desc' },
    });
    return cartolas.map((c) => {
      const total = c.movimientosCartola.length;
      const calzados = c.movimientosCartola.filter((m) => m.pagoId).length;
      const contabilizados = c.movimientosCartola.filter((m) => m.estadoContable === 'CONTABILIZADO').length;
      return {
        id: c.id,
        banco: c.banco,
        periodo: c.periodo,
        movimientos: total,
        conciliados: calzados,
        diferencia: total - calzados,
        estado: c.estado === 'CERRADA' ? 'ACTIVO' : 'PENDIENTE',
        cartolaId: c.id,
        pendientesContabilizar: total - contabilizados,
        pendientesCalce: total - calzados,
      };
    });
  }

  async createConciliacion(
    user: JwtPayload,
    _dto: UpsertConciliacionDto,
    _empresaHeader?: string,
  ) {
    throw new BadRequestException(
      'La conciliación se genera desde las cartolas. No se crean cabeceras vacías.',
    );
  }

  async getMovimientosConciliacion(user: JwtPayload, conciliacionId: string) {
    const scope = resolveTenant(user);
    const cartola = await this.prisma.cartolaBancaria.findUnique({
      where: { id: conciliacionId },
    });
    if (cartola) {
      assertTenantAccess(scope, cartola.empresaId);
      const rows = await this.prisma.movimientoCartola.findMany({
        where: { cartolaId: cartola.id },
        orderBy: { fecha: 'asc' },
      });
      return rows.map((r) => ({
        id: r.id,
        conciliacionId: cartola.id,
        fecha: r.fecha.toISOString().slice(0, 10),
        referencia: r.referencia,
        glosa: r.glosa,
        monto: Number(r.monto),
        tipo: r.tipo,
        origen: 'CARTOLA',
        estado: r.pagoId ? 'CONCILIADO' : 'PENDIENTE',
        pagoId: r.pagoId ?? undefined,
      }));
    }
    const conc = await this.prisma.conciliacion.findUnique({ where: { id: conciliacionId } });
    if (!conc) throw new NotFoundException('Conciliación no encontrada');
    assertTenantAccess(scope, conc.empresaId);
    const rows = await this.prisma.movimientoConciliacion.findMany({
      where: { conciliacionId },
      orderBy: { fecha: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      conciliacionId: r.conciliacionId,
      fecha: r.fecha.toISOString().slice(0, 10),
      referencia: r.referencia,
      glosa: r.glosa,
      monto: Number(r.monto),
      tipo: r.tipo,
      origen: r.origen,
      estado: r.estado,
    }));
  }

  async desconciliarMovimiento(user: JwtPayload, movimientoId: string) {
    const scope = resolveTenant(user);
    const mov = await this.prisma.movimientoConciliacion.findUnique({
      where: { id: movimientoId },
    });
    if (!mov) throw new NotFoundException('Movimiento no encontrado');
    assertTenantAccess(scope, mov.empresaId);
    if (mov.estado !== 'CONCILIADO') {
      throw new BadRequestException('El movimiento ya está pendiente');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const m = await tx.movimientoConciliacion.update({
        where: { id: movimientoId },
        data: { estado: 'PENDIENTE' },
      });
      const conc = await tx.conciliacion.findUnique({ where: { id: mov.conciliacionId } });
      if (conc) {
        await tx.conciliacion.update({
          where: { id: conc.id },
          data: {
            conciliados: Math.max(0, conc.conciliados - 1),
            diferencia: Number(conc.diferencia) + Number(mov.monto),
            estado: 'PENDIENTE',
          },
        });
      }
      return m;
    });

    return {
      id: updated.id,
      conciliacionId: updated.conciliacionId,
      fecha: updated.fecha.toISOString().slice(0, 10),
      referencia: updated.referencia,
      glosa: updated.glosa,
      monto: Number(updated.monto),
      tipo: updated.tipo,
      origen: updated.origen,
      estado: updated.estado,
    };
  }

  async getCartolas(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.cartolaBancaria.findMany({
      where: { empresaId },
      orderBy: { fechaCarga: 'desc' },
    });
    return rows.map(mapCartola);
  }

  async previewCartolaArchivo(
    user: JwtPayload,
    file: { buffer: Buffer; originalname: string; mimetype?: string },
    empresaHeader?: string,
  ) {
    resolveOperationalEmpresa(user, empresaHeader);
    const name = (file.originalname || '').toLowerCase();
    const mime = file.mimetype || '';
    const isPdf = name.endsWith('.pdf') || mime.includes('pdf');
    const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls')
      || mime.includes('spreadsheet')
      || mime.includes('excel');
    let parsed;
    if (isPdf) {
      const { parseCartolaPdf } = await import('./cartola-parser.util');
      parsed = await parseCartolaPdf(file.buffer, file.originalname);
    } else if (isExcel) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx') as typeof import('xlsx');
      const { parseCartolaWorkbook } = await import('./cartola-parser.util');
      const { tryParseBankSpecific } = await import('./parsers/detect-bank');
      const bankTry = await tryParseBankSpecific({
        buffer: file.buffer,
        filename: file.originalname,
      });
      parsed = bankTry?.result.lineas.length
        ? bankTry.result
        : parseCartolaWorkbook(XLSX, file.buffer);
    } else {
      const { parseCartolaCsv } = await import('./cartola-parser.util');
      parsed = parseCartolaCsv(file.buffer.toString('utf8'));
    }
    if (!parsed.lineas.length) {
      const { avisoFormatoNoReconocido } = await import('./parsers/detect-bank');
      parsed.avisos = avisoFormatoNoReconocido(parsed.avisos);
    }
    const { inferPeriodoDesdeFechas, resumenHojas } = await import('./cartola-periodo.util');
    const inferred = inferPeriodoDesdeFechas(parsed.lineas.map((l) => l.fecha));
    const hojas = parsed.hojas?.length ? parsed.hojas : resumenHojas(parsed.lineas);
    const montoTotal = parsed.lineas.reduce((a, l) => a + l.monto, 0);
    return {
      archivoNombre: file.originalname,
      formatoDetectado: parsed.formatoDetectado,
      bancoDetectado: parsed.bancoDetectado,
      movimientos: parsed.lineas.length,
      montoTotal,
      lineas: parsed.lineas,
      avisos: parsed.avisos,
      hojas,
      suggestedPeriodo: inferred?.periodo,
      suggestedMesContable: inferred?.mesContable,
      formatoEsperado:
        'CSV/Excel: columnas fecha, glosa (o descripcion), monto — o cargo/abono. '
        + 'Sin headers: fecha;glosa;monto[;referencia]. Monto negativo = egreso. '
        + 'PDF: texto seleccionable. Parsers banco (Chile/Estado/Santander) se activan con muestras.',
    };
  }

  async importCartolaArchivo(
    user: JwtPayload,
    file: { buffer: Buffer; originalname: string; mimetype?: string },
    meta: {
      banco: string;
      periodo: string;
      mesContable?: string;
      bancoCodigo?: string;
      hojas?: string[];
      moneda?: string;
    },
    empresaHeader?: string,
  ) {
    const preview = await this.previewCartolaArchivo(user, file, empresaHeader);
    let lineas = preview.lineas;
    if (meta.hojas?.length) {
      const allow = new Set(meta.hojas.map((h) => h.trim().toLowerCase()).filter(Boolean));
      lineas = lineas.filter((l) => !l.hoja || allow.has(l.hoja.trim().toLowerCase()));
    }
    if (!lineas.length) {
      throw new BadRequestException(
        preview.avisos.join(' ') || 'No hay movimientos para importar',
      );
    }
    const { inferPeriodoDesdeFechas, monedaSugeridaPorHoja, normalizeCartolaMoneda } = await import(
      './cartola-periodo.util'
    );
    const inferred = inferPeriodoDesdeFechas(lineas.map((l) => l.fecha));
    const moneda = normalizeCartolaMoneda(
      meta.moneda || monedaSugeridaPorHoja(lineas[0]?.hoja ?? ''),
    );
    return this.createCartola(
      user,
      {
        banco: meta.banco,
        bancoCodigo: meta.bancoCodigo,
        periodo: meta.periodo?.trim() || inferred?.periodo || '',
        mesContable: meta.mesContable?.trim() || inferred?.mesContable,
        moneda,
        archivoNombre: file.originalname,
        formato: file.originalname.toLowerCase().endsWith('.pdf') ? 'PDF' : 'EXCEL',
        movimientos: lineas.length,
        montoTotal: lineas.reduce((a, l) => a + l.monto, 0),
        lineas,
      },
      empresaHeader,
    );
  }

  async createCartola(user: JwtPayload, dto: UpsertCartolaDto, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const formato = (dto.formato ?? 'EXCEL').toUpperCase();
    if (formato !== 'EXCEL' && formato !== 'PDF') {
      throw new BadRequestException('formato inválido');
    }
    const lineas = dto.lineas ?? [];
    if (!lineas.length) {
      throw new BadRequestException(
        'La cartola debe importarse con movimientos. No se aceptan cabeceras vacías.',
      );
    }
    const montoTotal =
      dto.montoTotal ??
      lineas.reduce((a, l) => a + Math.abs(Number(l.monto)), 0);
    const moneda = (await import('./cartola-periodo.util')).normalizeCartolaMoneda(dto.moneda);

    const prepared = lineas.map((l, i) => {
      const tipo = String(l.tipo ?? '').toUpperCase();
      if (tipo !== 'INGRESO' && tipo !== 'EGRESO') {
        throw new BadRequestException(`tipo de movimiento cartola inválido (fila ${i + 1})`);
      }
      const fecha = parseDate(l.fecha);
      const monto = Math.abs(Number(l.monto) || 0);
      if (!(monto > 0)) {
        throw new BadRequestException(`Hay movimientos con monto 0 (fila ${i + 1})`);
      }
      return {
        fecha,
        referencia: String(l.referencia ?? '').trim().slice(0, 120) || `MOV-${i + 1}`,
        glosa: String(l.glosa ?? '').trim().slice(0, 500) || `Movimiento ${i + 1}`,
        monto,
        tipo: tipo as never,
        empresaId,
      };
    });

    let row;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const cartola = await tx.cartolaBancaria.create({
          data: {
            banco: dto.banco.trim(),
            bancoCodigo: dto.bancoCodigo?.trim() || null,
            periodo: dto.periodo.trim(),
            mesContable: dto.mesContable?.trim() || null,
            moneda,
            archivoNombre: dto.archivoNombre.trim(),
            formato,
            movimientos: dto.movimientos ?? lineas.length,
            montoTotal,
            estado: (dto.estado ?? 'CARGADA') as never,
            pendientesContabilizar: dto.pendientesContabilizar ?? lineas.length,
            usuarioCarga: user.email || user.sub,
            empresaId,
          },
        });
        await tx.movimientoCartola.createMany({
          data: prepared.map((r) => ({ ...r, cartolaId: cartola.id })),
        });
        return cartola;
      }, { timeout: 60_000, maxWait: 15_000 });
    } catch (e) {
      if (e instanceof HttpException) throw e;
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2028') {
        throw new BadRequestException(
          'La importación superó el tiempo de espera. Importe menos hojas o reintente.',
        );
      }
      throw e;
    }

    return mapCartola(row);
  }

  async deleteCartola(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.cartolaBancaria.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cartola no encontrada');
    assertTenantAccess(scope, existing.empresaId);
    await this.prisma.cartolaBancaria.delete({ where: { id } });
    return { ok: true };
  }

  async getMovimientosCartola(user: JwtPayload, cartolaId: string) {
    const scope = resolveTenant(user);
    const cartola = await this.prisma.cartolaBancaria.findUnique({ where: { id: cartolaId } });
    if (!cartola) throw new NotFoundException('Cartola no encontrada');
    assertTenantAccess(scope, cartola.empresaId);
    const rows = await this.prisma.movimientoCartola.findMany({
      where: { cartolaId },
      include: { codigoFinanciero: { select: { codigo: true, nombre: true } } },
      orderBy: { fecha: 'asc' },
    });
    return rows.map((r) => mapMovimientoCartola(r));
  }

  /**
   * Busca factura de compra o documento de venta por número.
   * Si no hay match, la UI debe ofrecer Anticipo (no se cambia el destino en silencio).
   */
  async lookupDocumentoCartola(
    user: JwtPayload,
    opts: { folio?: string; tipoDocumento?: string; sentido?: string; empresaId?: string },
    empresaHeader?: string,
  ) {
    const empresaId = opts.empresaId?.trim() || resolveOperationalEmpresa(user, empresaHeader);
    const folio = opts.folio?.trim();
    if (!folio) {
      throw new BadRequestException('Indica el número de documento');
    }
    const tipo = opts.tipoDocumento?.trim().toUpperCase() || '';
    const sentido = (opts.sentido ?? '').toUpperCase();
    const miss = {
      found: false as const,
      mensaje: 'No se encontró el documento. Si no existe, elige Anticipo.',
    };

    const tryCompra = async () => {
      const row = await this.prisma.registroCompra.findFirst({
        where: {
          empresaId,
          estado: { not: 'ANULADO' },
          factura: { equals: folio, mode: 'insensitive' },
        },
        include: {
          proveedorRef: { select: { id: true, razonSocial: true } },
          ordenCompra: { select: { estado: true, numero: true, moneda: true, neto: true } },
        },
      });
      if (!row) return null;
      const moneda = row.ordenCompra?.moneda || 'CLP';
      return {
        found: true as const,
        origen: 'COMPRA' as const,
        id: row.id,
        folio: row.factura,
        monto: Number(row.monto),
        contraparte: row.proveedorRef?.razonSocial ?? row.proveedorFactura,
        proveedorId: row.proveedorId ?? undefined,
        estado: row.estado,
        ocNumero: row.ordenCompra?.numero ?? row.ocNumero,
        ocEstado: row.ordenCompra?.estado,
        moneda,
        tipoCambio: null,
        montoOtraMoneda: moneda !== 'CLP' && row.ordenCompra?.neto ? Number(row.ordenCompra.neto) : null,
        fecha: row.createdAt.toISOString().slice(0, 10),
        mensaje: `Factura de compra ${row.factura} · ${row.proveedorRef?.razonSocial ?? row.proveedorFactura}${moneda !== 'CLP' ? ` (${moneda})` : ''}`,
      };
    };

    const tryVenta = async () => {
      const tipos = tipo && ['FACTURA', 'ND', 'NC', 'GUIA'].includes(tipo)
        ? [tipo]
        : ['FACTURA', 'ND', 'NC'];
      const row = await this.prisma.documentoComercial.findFirst({
        where: {
          empresaId,
          folio: { equals: folio, mode: 'insensitive' },
          tipo: { in: tipos as never },
        },
        select: {
          id: true,
          folio: true,
          tipo: true,
          estado: true,
          cliente: true,
          clienteId: true,
          neto: true,
          iva: true,
          monedaCodigo: true,
          tipoCambio: true,
          montoOtraMoneda: true,
          fecha: true,
        },
      });
      if (!row) return null;
      const monto = Number(row.neto) + Number(row.iva ?? 0);
      const moneda = row.monedaCodigo || 'CLP';
      const tc = row.tipoCambio != null ? Number(row.tipoCambio) : null;
      const montoOtra = row.montoOtraMoneda != null ? Number(row.montoOtraMoneda) : null;
      return {
        found: true as const,
        origen: 'VENTA' as const,
        id: row.id,
        folio: row.folio,
        monto,
        contraparte: row.cliente,
        clienteId: row.clienteId ?? undefined,
        estado: row.estado,
        tipoDocumento: row.tipo,
        moneda,
        tipoCambio: tc,
        montoOtraMoneda: montoOtra,
        fecha: row.fecha.toISOString().slice(0, 10),
        mensaje: `${row.tipo} ${row.folio} · ${row.cliente}${moneda !== 'CLP' ? ` (${moneda}${montoOtra ? ` ${montoOtra.toLocaleString('es-CL')}` : ''})` : ''}`,
      };
    };

    if (sentido === 'INGRESO') {
      return (await tryVenta()) ?? (await tryCompra()) ?? miss;
    }
    if (sentido === 'EGRESO') {
      return (await tryCompra()) ?? (await tryVenta()) ?? miss;
    }
    return (await tryCompra()) ?? (await tryVenta()) ?? miss;
  }

  /**
   * Preview y cálculo en tiempo real de Diferencia de Cambio para pagos o calces.
   */
  async previewDiferenciaTc(
    user: JwtPayload,
    dto: CalcularDiferenciaTcDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const scope = resolveTenant(user);
    assertTenantAccess(scope, empresaId);

    let tcDocumento = dto.tcDocumento;
    let tcPago = dto.tcPago;
    let monedaDoc = dto.monedaFactura || dto.monedaDocumento;
    let monedaPago = dto.monedaPago || 'CLP';
    let montoMe = dto.montoMonedaExtranjera || dto.monto;
    let sentido = dto.sentido || 'COBRO';

    if (dto.documentosCalce?.trim()) {
      const found = await this.lookupDocumentoCartola(
        user,
        {
          folio: dto.documentosCalce.trim(),
          sentido: dto.sentido?.toUpperCase() === 'PAGO' ? 'EGRESO' : 'INGRESO',
          empresaId,
        },
      );
      if (found.found) {
        if (found.moneda && found.moneda !== 'CLP') monedaDoc = found.moneda;
        if (found.tipoCambio && !tcDocumento) tcDocumento = found.tipoCambio;
        if (found.montoOtraMoneda) montoMe = found.montoOtraMoneda;
        if (found.origen === 'VENTA') sentido = 'COBRO';
        if (found.origen === 'COMPRA') sentido = 'PAGO';
      }
    }

    if (!tcDocumento && monedaDoc && monedaDoc !== 'CLP' && dto.fecha) {
      tcDocumento = (await this.lookupTcBc(parseDate(dto.fecha), monedaDoc as never)) ?? undefined;
    }

    if (!tcPago && monedaDoc && monedaDoc !== 'CLP') {
      const fechaPago = dto.fecha ? parseDate(dto.fecha) : new Date();
      tcPago = (await this.lookupTcBc(fechaPago, monedaDoc as never)) ?? undefined;
    }

    return calcularDiferenciaTc({
      monto: montoMe,
      monedaDocumento: monedaDoc,
      monedaPago,
      tcDocumento: tcDocumento || 1,
      tcPago: tcPago || 1,
      sentido: sentido as never,
      montoMonedaExtranjera: dto.montoMonedaExtranjera,
    });
  }

  /** Cerrar cartola: todas las líneas contabilizadas; pago solo si destino factura o anticipo. */
  async cerrarCartola(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const cartola = await this.prisma.cartolaBancaria.findUnique({ where: { id } });
    if (!cartola) throw new NotFoundException('Cartola no encontrada');
    assertTenantAccess(scope, cartola.empresaId);
    if (cartola.estado === 'CERRADA') {
      throw new BadRequestException('La cartola ya está cerrada');
    }
    const pend = await this.prisma.movimientoCartola.count({
      where: { cartolaId: id, estadoContable: 'PENDIENTE' },
    });
    if (pend > 0) {
      throw new BadRequestException(
        `No se puede cerrar: quedan ${pend} movimiento(s) por contabilizar`,
      );
    }
    const sinCalce = await this.prisma.movimientoCartola.count({
      where: {
        cartolaId: id,
        pagoId: null,
        OR: [
          { destinoTipo: null },
          { destinoTipo: { in: [...DESTINOS_CON_PAGO] } },
        ],
      },
    });
    if (sinCalce > 0) {
      throw new BadRequestException(
        `No se puede cerrar: quedan ${sinCalce} movimiento(s) de factura o anticipo sin calzar`,
      );
    }
    const row = await this.prisma.cartolaBancaria.update({
      where: { id },
      data: { estado: 'CERRADA', pendientesContabilizar: 0 },
    });
    return mapCartola(row);
  }

  async contabilizarMovimientoCartola(
    user: JwtPayload,
    movimientoId: string,
    dto: ContabilizarMovimientoCartolaDto,
  ) {
    const scope = resolveTenant(user);
    const mov = await this.prisma.movimientoCartola.findUnique({
      where: { id: movimientoId },
    });
    if (!mov) throw new NotFoundException('Movimiento de cartola no encontrado');
    assertTenantAccess(scope, mov.empresaId);
    if (mov.estadoContable === 'CONTABILIZADO') {
      throw new BadRequestException('Ya está contabilizado');
    }

    const cartola = await this.prisma.cartolaBancaria.findUnique({
      where: { id: mov.cartolaId },
    });
    if (!cartola) throw new NotFoundException('Cartola no encontrada');
    if (cartola.estado === 'CERRADA') {
      throw new BadRequestException('La cartola está cerrada');
    }

    const destinoTipo = (dto.destinoTipo ?? '').trim().toUpperCase();
    if (!DESTINOS_CARTOLA.has(destinoTipo)) {
      throw new BadRequestException('Destino inválido');
    }
    const cuentaContraId = dto.cuentaContraId?.trim();
    if (!cuentaContraId) {
      throw new BadRequestException('Indica la cuenta de contrapartida');
    }
    const codigoFinancieroId = dto.codigoFinancieroId?.trim();
    if (!codigoFinancieroId) {
      throw new BadRequestException('Indica el código financiero');
    }
    if (dto.nominaSemana?.trim() && String(mov.tipo).toUpperCase() !== 'EGRESO') {
      throw new BadRequestException('La nómina solo se asocia a egresos');
    }

    const codigo = await this.prisma.codigoFinanciero.findFirst({
      where: { id: codigoFinancieroId, empresaId: mov.empresaId, activa: true },
    });
    if (!codigo) {
      throw new BadRequestException('Código financiero no encontrado o inactivo');
    }

    const contra = await this.prisma.cuentaContable.findFirst({
      where: { id: cuentaContraId, empresaId: mov.empresaId, activa: true, noImputable: false },
      include: {
        centrosCosto: { select: { centroCostoId: true } },
        elementosCosto: { select: { elementoCostoId: true } },
        areasNegocio: { select: { areaNegocioId: true } },
      },
    });
    if (!contra) {
      throw new BadRequestException('La cuenta de contrapartida no es imputable o no pertenece a la empresa');
    }

    const folioDocumento = optTrim(dto.folioDocumento);
    const tipoDocumento = optTrim(dto.tipoDocumento);
    let proveedorId = optTrim(dto.proveedorId);
    let clienteId = optTrim(dto.clienteId);
    if (proveedorId && clienteId) {
      throw new BadRequestException('Indica proveedor o cliente, no ambos');
    }

    let foundDoc: Awaited<ReturnType<typeof this.lookupDocumentoCartola>> | null = null;
    if (destinoTipo === 'FACTURA') {
      if (!folioDocumento) {
        throw new BadRequestException('La factura requiere número de documento');
      }
      foundDoc = await this.lookupDocumentoCartola(
        user,
        {
          folio: folioDocumento,
          tipoDocumento: tipoDocumento ?? undefined,
          sentido: mov.tipo,
          empresaId: mov.empresaId,
        },
      );
      if (!foundDoc.found) {
        throw new BadRequestException(foundDoc.mensaje);
      }
      if (foundDoc.origen === 'COMPRA') {
        proveedorId = foundDoc.proveedorId ?? proveedorId;
        if (foundDoc.ocEstado && !ocPermiteContabilizarOPagar(foundDoc.ocEstado)) {
          throw new BadRequestException(
            `No se puede pagar: la OC ${foundDoc.ocNumero ?? ''} no está aprobada (estado: ${foundDoc.ocEstado}).`,
          );
        }
      }
      if (foundDoc.origen === 'VENTA') {
        clienteId = foundDoc.clienteId ?? clienteId;
        if (foundDoc.estado && foundDoc.estado !== 'CONTABILIZADA') {
          throw new BadRequestException(
            `No se puede cobrar: la factura ${foundDoc.folio} no está contabilizada (estado: ${foundDoc.estado}).`,
          );
        }
      }
    }

    if (DESTINOS_CON_PAGO.has(destinoTipo) && !proveedorId && !clienteId) {
      throw new BadRequestException(
        destinoTipo === 'FACTURA'
          ? 'La factura no tiene contraparte en el maestro; elige proveedor o cliente'
          : 'El anticipo requiere un proveedor o un cliente',
      );
    }

    const centroCostoId = optTrim(dto.centroCostoId);
    const areaNegocioId = optTrim(dto.areaNegocioId);
    const elementoCostoId = optTrim(dto.elementoCostoId);
    assertDimensionesContracuenta(contra, { centroCostoId, areaNegocioId, elementoCostoId });
    if (centroCostoId) {
      const cc = await this.prisma.centroCosto.findFirst({
        where: { id: centroCostoId, empresaId: mov.empresaId },
      });
      if (!cc) throw new BadRequestException('Centro de costo no encontrado en la empresa');
    }
    if (areaNegocioId) {
      const area = await this.prisma.areaNegocio.findFirst({
        where: { id: areaNegocioId, empresaId: mov.empresaId },
      });
      if (!area) throw new BadRequestException('Área de negocio no encontrada en la empresa');
    }
    if (elementoCostoId) {
      const el = await this.prisma.elementoCosto.findFirst({
        where: { id: elementoCostoId, empresaId: mov.empresaId },
      });
      if (!el) throw new BadRequestException('Elemento de costo no encontrado en la empresa');
    }
    const origen = `CARTOLA:${mov.id}`;
    const existente = await this.prisma.asiento.findFirst({
      where: { empresaId: mov.empresaId, origen },
      select: { id: true, numero: true },
    });

    let docDiferenciaTc: number | null = null;
    let docTcManual: number | null = dto.tcManual ?? null;

    let asientoId = existente?.id;
    let asientoNumero = existente?.numero;
    if (!asientoId) {
      if (!this.contabilizar) {
        throw new BadRequestException(
          'Servicio de contabilización no disponible; no se puede contabilizar el movimiento',
        );
      }
      const monto = Number(mov.monto);
      const { bancoId, dimBanco } = await this.resolveCuentasCartola(mov.empresaId);
      // La contrapartida la dimensiona el operador; el banco, su mapeo.
      const dim = {
        centroCostoId: centroCostoId ?? undefined,
        areaNegocioId: areaNegocioId ?? undefined,
        elementoCostoId: elementoCostoId ?? undefined,
      };

      let lineasAsiento = mov.tipo === 'INGRESO'
        ? [
            { debe: monto, haber: 0, cuentaId: bancoId, glosa: 'Banco', ...dimBanco },
            { debe: 0, haber: monto, cuentaId: contra.id, glosa: 'Contrapartida', ...dim },
          ]
        : [
            { debe: 0, haber: monto, cuentaId: bancoId, glosa: 'Banco', ...dimBanco },
            { debe: monto, haber: 0, cuentaId: contra.id, glosa: 'Contrapartida', ...dim },
          ];

      if (destinoTipo === 'FACTURA' && foundDoc?.found) {
        const docMoneda = foundDoc.moneda || 'CLP';
        if (docMoneda !== 'CLP' || (cartola.moneda && cartola.moneda !== 'CLP')) {
          let docTc: number | null = foundDoc.tipoCambio;
          if (!docTc && foundDoc.fecha) {
            docTc = (await this.lookupTcBc(parseDate(foundDoc.fecha), docMoneda as never)) ?? null;
          }
          if (!docTc) docTc = 1;

          if (!docTcManual) {
            docTcManual = (await this.lookupTcBc(parseDate(mov.fecha.toISOString().slice(0, 10)), docMoneda as never)) ?? docTc;
          }

          const baseMe = foundDoc.montoOtraMoneda ?? (foundDoc.monto / docTc);
          const difResult = calcularDiferenciaTc({
            monto: baseMe,
            monedaDocumento: docMoneda,
            monedaPago: cartola.moneda || 'CLP',
            tcDocumento: docTc,
            tcPago: docTcManual,
            sentido: mov.tipo,
          });

          if (difResult.aplica && difResult.diferenciaTc !== 0) {
            docDiferenciaTc = difResult.diferenciaTc;
            const ctaDif = await this.resolveCuentaDiferenciaCambio(mov.empresaId, contra.id);

            if (mov.tipo === 'INGRESO') {
              if (difResult.tipoResultado === 'GANANCIA') {
                lineasAsiento = [
                  { debe: monto, haber: 0, cuentaId: bancoId, glosa: 'Banco', ...dimBanco },
                  { debe: 0, haber: difResult.montoOrigenClp, cuentaId: contra.id, glosa: 'Contrapartida', ...dim },
                  { debe: 0, haber: difResult.diferenciaTc, cuentaId: ctaDif.cuentaId, glosa: difResult.glosa, ...ctaDif.dim },
                ];
              } else {
                const perdida = Math.abs(difResult.diferenciaTc);
                lineasAsiento = [
                  { debe: monto, haber: 0, cuentaId: bancoId, glosa: 'Banco', ...dimBanco },
                  { debe: perdida, haber: 0, cuentaId: ctaDif.cuentaId, glosa: difResult.glosa, ...ctaDif.dim },
                  { debe: 0, haber: difResult.montoOrigenClp, cuentaId: contra.id, glosa: 'Contrapartida', ...dim },
                ];
              }
            } else {
              if (difResult.tipoResultado === 'PERDIDA') {
                const perdida = Math.abs(difResult.diferenciaTc);
                lineasAsiento = [
                  { debe: difResult.montoOrigenClp, haber: 0, cuentaId: contra.id, glosa: 'Contrapartida', ...dim },
                  { debe: perdida, haber: 0, cuentaId: ctaDif.cuentaId, glosa: difResult.glosa, ...ctaDif.dim },
                  { debe: 0, haber: monto, cuentaId: bancoId, glosa: 'Banco', ...dimBanco },
                ];
              } else {
                lineasAsiento = [
                  { debe: difResult.montoOrigenClp, haber: 0, cuentaId: contra.id, glosa: 'Contrapartida', ...dim },
                  { debe: 0, haber: difResult.diferenciaTc, cuentaId: ctaDif.cuentaId, glosa: difResult.glosa, ...ctaDif.dim },
                  { debe: 0, haber: monto, cuentaId: bancoId, glosa: 'Banco', ...dimBanco },
                ];
              }
            }
          }
        }
      }

      const asiento = await this.contabilizar.createAsiento({
        empresaId: mov.empresaId,
        glosa: `Cartola ${mov.referencia}: ${mov.glosa}`,
        origen,
        fecha: mov.fecha,
        lineas: lineasAsiento,
      });
      asientoId = asiento.id;
      asientoNumero = asiento.numero;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let pagoId = mov.pagoId;
      if (DESTINOS_CON_PAGO.has(destinoTipo) && !pagoId) {
        const dup = await tx.pago.findUnique({
          where: { movimientoCartolaId: movimientoId },
        });
        if (dup) {
          pagoId = dup.id;
        } else {
          const tercero = proveedorId
            ? await tx.proveedor.findFirst({
                where: { id: proveedorId, empresaId: mov.empresaId, activo: true },
              })
            : await tx.cliente.findFirst({
                where: { id: clienteId!, empresaId: mov.empresaId, activo: true },
              });
          if (!tercero) {
            throw new BadRequestException('Proveedor o cliente no encontrado en la empresa');
          }
          const terceroTipo: 'PROVEEDOR' | 'CLIENTE' = proveedorId ? 'PROVEEDOR' : 'CLIENTE';
          const tipoPago = destinoTipo === 'ANTICIPO' ? 'ANTICIPO' : 'PAGO_TOTAL';
          const pago = await tx.pago.create({
            data: {
              fecha: mov.fecha,
              beneficiario: tercero.razonSocial,
              monto: mov.monto,
              medio: cartola.banco || 'CARTOLA',
              estado: 'ACTIVO' as never,
              tcManual: docTcManual ?? dto.tcManual ?? null,
              monedaPago: cartola.moneda || 'CLP',
              monedaFactura: foundDoc?.moneda || 'CLP',
              diferenciaTc: docDiferenciaTc ?? null,
              documentosCalce: folioDocumento ?? `Cartola ${mov.referencia}`,
              movimientoCartolaId: movimientoId,
              proveedorId: proveedorId,
              clienteId: clienteId,
              tipo: tipoPago,
              empresaId: mov.empresaId,
            },
          });
          pagoId = pago.id;
          if (this.cuentaCorriente) {
            await this.cuentaCorriente.registrarMovimiento({
              empresaId: mov.empresaId,
              terceroTipo,
              terceroId: tercero.id,
              terceroNombre: tercero.razonSocial,
              fecha: mov.fecha,
              documentoRef: folioDocumento || pago.id,
              documentoTipo: 'PAGO',
              debe: terceroTipo === 'PROVEEDOR' ? Number(foundDoc?.monto ?? mov.monto) : 0,
              haber: terceroTipo === 'CLIENTE' ? Number(foundDoc?.monto ?? mov.monto) : 0,
              glosa: terceroTipo === 'CLIENTE'
                ? `Cobro factura ${folioDocumento ?? ''}`.trim()
                : `Pago cartola ${mov.referencia}`,
              origen: 'PAGO',
              pagoId: pago.id,
              movimientoCartolaId: movimientoId,
            }, tx);
          }
          if (tipoPago === 'PAGO_TOTAL') {
            await this.applyPagoToAging(
              mov.empresaId,
              folioDocumento ?? pago.documentosCalce,
              Number(mov.monto),
              {
                tipo: terceroTipo === 'CLIENTE' ? 'POR_COBRAR' : 'POR_PAGAR',
                contraparte: tercero.razonSocial,
                skipMissing: true,
                tx,
              },
            );
          }
        }
      }

      const m = await tx.movimientoCartola.update({
        where: { id: movimientoId },
        data: {
          estadoContable: 'CONTABILIZADO',
          asientoId,
          asientoNumero,
          pagoId,
          cuentaContraId: contra.id,
          destinoTipo,
          codigoFinancieroId: codigo.id,
          tipoDocumento,
          folioDocumento,
          proveedorId,
          clienteId,
          centroCostoId,
          areaNegocioId,
          elementoCostoId,
          nominaSemana:
            String(mov.tipo).toUpperCase() === 'EGRESO'
              ? this.parseNominaSemana(dto.nominaSemana)
              : null,
        },
        include: { codigoFinanciero: { select: { codigo: true, nombre: true } } },
      });
      const pend = await tx.movimientoCartola.count({
        where: { cartolaId: mov.cartolaId, estadoContable: 'PENDIENTE' },
      });
      await tx.cartolaBancaria.update({
        where: { id: mov.cartolaId },
        data: {
          pendientesContabilizar: pend,
          estado: 'EN_CONCILIACION',
        },
      });
      return m;
    });

    return mapMovimientoCartola(updated);
  }

  async getDocumentosAging(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.documentoAging.findMany({
      where: { empresaId },
      orderBy: { fechaVencimiento: 'asc' },
    });
    const compraIds = [...new Set(rows.map((r) => r.registroCompraId).filter((id): id is string => Boolean(id)))];
    const compras = compraIds.length
      ? await this.prisma.registroCompra.findMany({
          where: { empresaId, id: { in: compraIds } },
          select: {
            id: true,
            ocId: true,
            ocNumero: true,
            ordenCompra: { select: { estado: true, numero: true } },
            proveedorRef: { select: { rut: true } },
          },
        })
      : [];
    const compraById = new Map(compras.map((c) => [c.id, c]));
    return rows.map((r) => {
      const compra = r.registroCompraId ? compraById.get(r.registroCompraId) : undefined;
      const ocEstado = compra?.ordenCompra?.estado;
      return this.mapDocumentoAging(r, {
        rut: compra?.proveedorRef?.rut,
        ocNumero: compra?.ordenCompra?.numero ?? compra?.ocNumero,
        ocEstado,
        ocNoOperable: Boolean(compra?.ocId) && !ocPermiteContabilizarOPagar(ocEstado),
      });
    });
  }

  /** R4-17: edita fechaVencimiento y recalcula días/estado (+ bitácora quién/cuándo). */
  async updateDocumentoAging(
    user: JwtPayload,
    id: string,
    dto: UpdateDocumentoAgingDto,
  ) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.documentoAging.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Documento aging no encontrado');
    assertTenantAccess(scope, existing.empresaId);

    if (dto.semanaCompromiso?.trim() && !dto.fechaVencimiento) {
      return this.aplicarSemanaCompromiso(existing, dto.semanaCompromiso);
    }
    if (!dto.fechaVencimiento) {
      throw new BadRequestException('Indica fechaVencimiento o semanaCompromiso');
    }
    const fechaVencimiento = parseDate(dto.fechaVencimiento);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const vencDay = new Date(fechaVencimiento);
    vencDay.setHours(0, 0, 0, 0);
    const diasAtraso = Math.max(
      0,
      Math.floor((hoy.getTime() - vencDay.getTime()) / 86_400_000),
    );
    const estado =
      diasAtraso > 90 ? 'CRITICO' : diasAtraso > 0 ? 'ATRASADO' : 'AL_DIA';

    const actor = await this.prisma.usuario.findUnique({
      where: { id: user.sub },
      select: { id: true, nombre: true, email: true },
    });
    const prevHist = Array.isArray(existing.vencimientoHistorial)
      ? (existing.vencimientoHistorial as unknown[])
      : [];
    const entry = {
      at: new Date().toISOString(),
      userId: actor?.id ?? user.sub,
      userNombre: actor?.nombre ?? user.email,
      desde: existing.fechaVencimiento.toISOString().slice(0, 10),
      hasta: fechaVencimiento.toISOString().slice(0, 10),
    };

    const row = await this.prisma.documentoAging.update({
      where: { id },
      data: {
        fechaVencimiento,
        diasAtraso,
        estado,
        vencimientoHistorial: [...prevHist, entry] as unknown as Prisma.InputJsonValue,
      },
    });
    return this.mapDocumentoAging(row);
  }

  /** Aplaza o revierte semana de compromiso. No muta vencimiento/DTE. Solo saldo > 0. */
  async aplazarNominaLote(user: JwtPayload, dto: AplazarNominaLoteDto) {
    const scope = resolveTenant(user);
    const ids = [...new Set(dto.ids.map((id) => id.trim()).filter(Boolean))];
    if (!ids.length) throw new BadRequestException('Indica al menos un documento');
    const rows = await this.prisma.documentoAging.findMany({ where: { id: { in: ids } } });
    if (rows.length !== ids.length) throw new NotFoundException('Uno o más documentos no existen');
    for (const row of rows) {
      assertTenantAccess(scope, row.empresaId);
      if (row.tipo !== 'POR_PAGAR') {
        throw new BadRequestException(`Solo se aplazan documentos por pagar (${row.documento})`);
      }
      if (Number(row.saldo) <= 0) {
        throw new BadRequestException(`No se puede aplazar un documento pagado (${row.documento})`);
      }
    }
    const revertir = Boolean(dto.revertir);
    let destino: string | null = null;
    if (!revertir) {
      if (!dto.semanaCompromiso?.trim()) {
        throw new BadRequestException('Indica semanaCompromiso o revertir');
      }
      try {
        destino = assertPeriodWeek(dto.semanaCompromiso);
      } catch (e) {
        throw new BadRequestException(e instanceof Error ? e.message : 'semanaCompromiso inválida');
      }
    }
    const updated = [];
    for (const row of rows) {
      const semana = revertir
        ? periodWeekFromDate(row.fechaEmision)
        : destino!;
      const next = await this.prisma.documentoAging.update({
        where: { id: row.id },
        data: { semanaCompromiso: semana },
      });
      updated.push(this.mapDocumentoAging(next));
    }
    return updated;
  }

  private async aplicarSemanaCompromiso(
    existing: { id: string; tipo: string; documento: string; saldo: Prisma.Decimal; fechaVencimiento: Date },
    raw: string,
  ) {
    if (existing.tipo !== 'POR_PAGAR') {
      throw new BadRequestException('Solo se aplazan documentos por pagar');
    }
    if (Number(existing.saldo) <= 0) {
      throw new BadRequestException(`No se puede aplazar un documento pagado (${existing.documento})`);
    }
    let semana: string;
    try {
      semana = assertPeriodWeek(raw);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'semanaCompromiso inválida');
    }
    const row = await this.prisma.documentoAging.update({
      where: { id: existing.id },
      data: { semanaCompromiso: semana },
    });
    return this.mapDocumentoAging(row);
  }

  private mapDocumentoAging(r: {
    id: string;
    tipo: string;
    documento: string;
    contraparte: string;
    fechaEmision: Date;
    fechaVencimiento: Date;
    monto: Prisma.Decimal;
    saldo: Prisma.Decimal;
    montoPagado: Prisma.Decimal;
    diasAtraso: number;
    estado: string;
    documentoComercialId: string | null;
    registroCompraId: string | null;
    semanaCompromiso?: string | null;
    vencimientoHistorial?: unknown;
  }, extra?: {
    rut?: string | null;
    ocNumero?: string | null;
    ocEstado?: string | null;
    ocNoOperable?: boolean;
  }) {
    const hist = Array.isArray(r.vencimientoHistorial)
      ? (r.vencimientoHistorial as Array<{
        at?: string;
        userNombre?: string;
        desde?: string;
        hasta?: string;
      }>)
      : [];
    const last = hist.length ? hist[hist.length - 1] : undefined;
    const anclaCompromiso = r.tipo === 'POR_PAGAR' ? r.fechaEmision : r.fechaVencimiento;
    const semanaNatural = periodWeekFromDate(anclaCompromiso);
    const semanaCompromiso = normalizeSemanaCompromiso(r.semanaCompromiso, anclaCompromiso);
    const saldo = Number(r.saldo);
    const aplazada = semanaCompromiso !== semanaNatural;
    return {
      id: r.id,
      tipo: r.tipo,
      documento: r.documento,
      contraparte: r.contraparte,
      rut: extra?.rut ?? undefined,
      fechaEmision: r.fechaEmision.toISOString().slice(0, 10),
      fechaVencimiento: r.fechaVencimiento.toISOString().slice(0, 10),
      monto: Number(r.monto),
      saldo,
      montoPagado: Number(r.montoPagado),
      diasAtraso: r.diasAtraso,
      estado: r.estado,
      documentoComercialId: r.documentoComercialId ?? undefined,
      registroCompraId: r.registroCompraId ?? undefined,
      semanaNatural,
      semanaCompromiso,
      aplazada,
      nominaEstado: saldo <= 0 ? 'PAGADA' : 'PENDIENTE',
      ocNumero: extra?.ocNumero ?? undefined,
      ocEstado: extra?.ocEstado ?? undefined,
      ocNoOperable: extra?.ocNoOperable ?? false,
      vencimientoHistorial: hist,
      ultimaEdicionVencimiento: last
        ? `${last.userNombre ?? '—'} · ${last.at ? last.at.slice(0, 16).replace('T', ' ') : ''}`
        : undefined,
    };
  }

  /** GAP-06: regenera aging desde facturas comerciales y registros de compra. */
  async syncDocumentosAging(
    user: JwtPayload,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const agingEstado = (dias: number): 'AL_DIA' | 'ATRASADO' | 'CRITICO' => {
      if (dias > 90) return 'CRITICO';
      if (dias > 0) return 'ATRASADO';
      return 'AL_DIA';
    };

    const docs = await this.prisma.documentoComercial.findMany({
      where: {
        empresaId,
        tipo: { in: ['FACTURA', 'ND', 'NC'] },
        estado: 'CONTABILIZADA',
      },
    });
    const compras = await this.prisma.registroCompra.findMany({
      where: {
        empresaId,
        estado: 'CONTABILIZADA',
      },
    });

    const items: Array<{
      tipo: 'POR_COBRAR' | 'POR_PAGAR';
      documento: string;
      contraparte: string;
      fechaEmision: Date;
      fechaVencimiento: Date;
      monto: number;
      saldo: number;
      montoPagado: number;
      diasAtraso: number;
      estado: 'AL_DIA' | 'ATRASADO' | 'CRITICO';
      documentoComercialId?: string;
        registroCompraId?: string;
      semanaCompromiso?: string;
      vencimientoHistorial?: Prisma.InputJsonValue;
      empresaId: string;
    }> = [];

    // Preservar pagos parciales, vencimientos editados (R4-17) e historial por documento+tipo
    const prevAging = await this.prisma.documentoAging.findMany({
      where: { empresaId },
      select: {
        documento: true,
        tipo: true,
        montoPagado: true,
        fechaVencimiento: true,
        vencimientoHistorial: true,
        semanaCompromiso: true,
      },
    });
    const paidMap = new Map(
      prevAging.map((p) => [`${p.tipo}:${p.documento}`, Number(p.montoPagado)]),
    );
    const vencMap = new Map(
      prevAging.map((p) => [`${p.tipo}:${p.documento}`, p.fechaVencimiento]),
    );
    const histMap = new Map(
      prevAging.map((p) => [`${p.tipo}:${p.documento}`, p.vencimientoHistorial]),
    );
    const semanaMap = new Map(
      prevAging.map((p) => [`${p.tipo}:${p.documento}`, p.semanaCompromiso]),
    );

    for (const d of docs) {
      const emision = d.fecha;
      const key = `POR_COBRAR:${d.folio}`;
      const vencDefault = new Date(emision);
      vencDefault.setDate(vencDefault.getDate() + 30);
      const venc = vencMap.get(key) ?? vencDefault;
      const dias = Math.max(0, Math.floor((hoy.getTime() - venc.getTime()) / 86_400_000));
      const montoDoc = Number(d.neto) + Number(d.iva ?? 0);
      const pagado = Math.min(paidMap.get(key) ?? 0, montoDoc);
      const saldo = Math.max(0, montoDoc - pagado);
      const hist = histMap.get(key);
      items.push({
        tipo: 'POR_COBRAR',
        documento: d.folio,
        contraparte: d.cliente,
        fechaEmision: emision,
        fechaVencimiento: venc,
        monto: montoDoc,
        saldo,
        montoPagado: pagado,
        diasAtraso: dias,
        estado: agingEstado(dias),
        documentoComercialId: d.id,
        semanaCompromiso: normalizeSemanaCompromiso(semanaMap.get(key), venc),
        ...(hist != null ? { vencimientoHistorial: hist as Prisma.InputJsonValue } : {}),
        empresaId,
      });
    }
    for (const c of compras) {
      const emision = c.createdAt;
      const key = `POR_PAGAR:${c.factura}`;
      const vencDefault = new Date(emision);
      vencDefault.setDate(vencDefault.getDate() + 30);
      const venc = vencMap.get(key) ?? vencDefault;
      const dias = Math.max(0, Math.floor((hoy.getTime() - venc.getTime()) / 86_400_000));
      const montoCompra = (c.afactoFactura === 'EXENTO' ? Number(c.monto) : Number(c.monto) * 1.19);
      const pagado = Math.min(paidMap.get(key) ?? 0, montoCompra);
      const saldo = Math.max(0, montoCompra - pagado);
      const hist = histMap.get(key);
      items.push({
        tipo: 'POR_PAGAR',
        documento: c.factura,
        contraparte: c.proveedorFactura,
        fechaEmision: emision,
        fechaVencimiento: venc,
        monto: montoCompra,
        saldo,
        montoPagado: pagado,
        diasAtraso: dias,
        estado: agingEstado(dias),
        registroCompraId: c.id,
        semanaCompromiso: semanaCompromisoDesdeEmision(semanaMap.get(key), emision, venc),
        ...(hist != null ? { vencimientoHistorial: hist as Prisma.InputJsonValue } : {}),
        empresaId,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.documentoAging.deleteMany({ where: { empresaId } });
      if (items.length) {
        await tx.documentoAging.createMany({ data: items });
      }
    });

    return this.getDocumentosAging(user, empresaHeader);
  }

  async getAnticipos(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.anticipoProductor.findMany({
      where: { empresaId },
      orderBy: { fecha: 'desc' },
    });
    return rows.map((r) => this.mapAnticipo(r));
  }

  private mapAnticipo(r: {
    id: string;
    fecha: Date;
    productor: string;
    rut: string | null;
    banco: string | null;
    formaPago: string | null;
    codigoFinanciero: string | null;
    tipoDocto: string | null;
    nroDocto: string | null;
    nroComprobante: string | null;
    fechaVencimiento: Date | null;
    monto: Prisma.Decimal;
    moneda: string;
    montoUsd: Prisma.Decimal | null;
    montoCalzado: Prisma.Decimal;
    saldo: Prisma.Decimal;
    saldoUsd: Prisma.Decimal | null;
    tc: Prisma.Decimal | null;
    glosa: string | null;
    estado: string;
    documentosCalce: string | null;
    clienteId?: string | null;
    proveedorId?: string | null;
  }) {
    return {
      id: r.id,
      fecha: r.fecha.toISOString().slice(0, 10),
      productor: r.productor,
      rut: r.rut ?? undefined,
      clienteId: r.clienteId ?? undefined,
      proveedorId: r.proveedorId ?? undefined,
      banco: r.banco ?? undefined,
      formaPago: r.formaPago ?? undefined,
      codigoFinanciero: r.codigoFinanciero ?? undefined,
      tipoDocto: r.tipoDocto ?? undefined,
      nroDocto: r.nroDocto ?? undefined,
      nroComprobante: r.nroComprobante ?? undefined,
      fechaVencimiento: r.fechaVencimiento
        ? r.fechaVencimiento.toISOString().slice(0, 10)
        : undefined,
      monto: Number(r.monto),
      moneda: r.moneda,
      montoUsd: r.montoUsd != null ? Number(r.montoUsd) : undefined,
      montoCalzado: Number(r.montoCalzado),
      saldo: Number(r.saldo),
      saldoUsd: r.saldoUsd != null ? Number(r.saldoUsd) : undefined,
      tc: r.tc != null ? Number(r.tc) : undefined,
      glosa: r.glosa ?? undefined,
      estado: r.estado,
      documentosCalce: r.documentosCalce ?? undefined,
    };
  }

  private async resolveContraparteAnticipo(
    empresaId: string,
    dto: { rut?: string; clienteId?: string; proveedorId?: string },
  ): Promise<{
    productor: string;
    rut: string;
    clienteId: string | null;
    proveedorId: string | null;
  }> {
    const rutNorm = dto.rut ? normalizeRut(dto.rut) : '';
    if (dto.clienteId?.trim()) {
      const c = await this.prisma.cliente.findFirst({
        where: { id: dto.clienteId.trim(), empresaId, activo: true },
      });
      if (!c) throw new BadRequestException('Cliente no encontrado en la empresa');
      return {
        productor: c.razonSocial,
        rut: c.rut,
        clienteId: c.id,
        proveedorId: null,
      };
    }
    if (dto.proveedorId?.trim()) {
      const p = await this.prisma.proveedor.findFirst({
        where: { id: dto.proveedorId.trim(), empresaId, activo: true },
      });
      if (!p) throw new BadRequestException('Proveedor no encontrado en la empresa');
      return {
        productor: p.razonSocial,
        rut: p.rut,
        clienteId: null,
        proveedorId: p.id,
      };
    }
    if (rutNorm.length < 3) {
      throw new BadRequestException(
        'El RUT es obligatorio y debe coincidir con un cliente o proveedor existente',
      );
    }
    const [clientes, proveedores] = await Promise.all([
      this.prisma.cliente.findMany({ where: { empresaId, activo: true }, take: 400 }),
      this.prisma.proveedor.findMany({ where: { empresaId, activo: true }, take: 400 }),
    ]);
    const cliHits = clientes.filter((c) => normalizeRut(c.rut) === rutNorm);
    const prvHits = proveedores.filter((p) => normalizeRut(p.rut) === rutNorm);
    const cliPref = cliHits.find((c) => c.esProductor) ?? cliHits[0];
    const prvPref = prvHits.find((p) => p.esProductor) ?? prvHits[0];
    if (!cliPref && !prvPref) {
      throw new BadRequestException(
        'El RUT no pertenece a un cliente ni a un proveedor de la empresa. Cárgalo en la ficha de contraparte.',
      );
    }
    if (prvPref && (prvPref.esProductor || !cliPref || !cliPref.esProductor)) {
      return {
        productor: prvPref.razonSocial,
        rut: prvPref.rut,
        clienteId: null,
        proveedorId: prvPref.id,
      };
    }
    return {
      productor: cliPref!.razonSocial,
      rut: cliPref!.rut,
      clienteId: cliPref!.id,
      proveedorId: null,
    };
  }

  async createAnticipo(
    _user: JwtPayload,
    _dto: UpsertAnticipoDto,
    _empresaHeader?: string,
  ) {
    throw new BadRequestException(
      'Los anticipos se registran en Pagos (tipo ANTICIPO o ANTICIPO_PRODUCTOR).',
    );
  }

  async updateAnticipo(_user: JwtPayload, _id: string, _dto: UpdateAnticipoCalceDto) {
    throw new BadRequestException(
      'Los anticipos se editan en Pagos. No hay libro paralelo de anticipos.',
    );
  }
}
