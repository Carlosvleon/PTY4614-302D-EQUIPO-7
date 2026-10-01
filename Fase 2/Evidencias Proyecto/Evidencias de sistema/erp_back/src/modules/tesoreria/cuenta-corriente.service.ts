import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../auth/jwt.strategy';
import {
  assertTenantAccess,
  resolveOperationalEmpresa,
  resolveTenant,
} from '../../auth/tenant.util';
import type { EstadoCuentaPorRutQueryDto } from './dto/cuenta-corriente.dto';
import {
  anticipoToCalceRef,
  fechaDentroOAntesDelPeriodo,
  fechaExclusivaTrasPeriodo,
  formatRutDisplay,
  isCalceLibreRef,
  linkTargetForMovimiento,
  looksLikeRut,
  normalizeRut,
  pagoToCalceRef,
  refsEqual,
  splitCalceRefs,
  type CalceRefDto,
  type EstadoLiquidacionCc,
  type FiltroEstadoCuenta,
} from './cuenta-corriente.util';

export type TerceroCc = 'CLIENTE' | 'PROVEEDOR' | 'PRODUCTOR';
export type OrigenCc = 'VENTA' | 'COMPRA' | 'PAGO' | 'ANTICIPO' | 'AJUSTE';

export type RegistrarMovimientoCcInput = {
  empresaId: string;
  terceroTipo: TerceroCc;
  terceroId: string;
  terceroNombre: string;
  fecha: Date | string;
  documentoRef?: string | null;
  documentoTipo?: string | null;
  debe?: number;
  haber?: number;
  glosa?: string | null;
  origen?: OrigenCc | null;
  pagoId?: string | null;
  documentoComercialId?: string | null;
  registroCompraId?: string | null;
  movimientoCartolaId?: string | null;
};

function parseDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Fecha inválida: ${value}`);
  return d;
}

@Injectable()
export class CuentaCorrienteService {
  constructor(private prisma: PrismaService) {}

  /** Append movimiento y recalcula saldo corrido del tercero. */
  async registrarMovimiento(
    input: RegistrarMovimientoCcInput,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const debe = Number(input.debe ?? 0);
    const haber = Number(input.haber ?? 0);
    if (debe < 0 || haber < 0) {
      throw new BadRequestException('debe/haber no pueden ser negativos');
    }
    if (debe === 0 && haber === 0) {
      throw new BadRequestException('Movimiento CC sin monto');
    }
    const fecha = parseDate(input.fecha);

    const last = await db.cuentaCorrienteMovimiento.findFirst({
      where: {
        empresaId: input.empresaId,
        terceroTipo: input.terceroTipo,
        terceroId: input.terceroId,
      },
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
    });
    const saldoPrev = last ? Number(last.saldo) : 0;
    const saldo = saldoPrev + debe - haber;

    return db.cuentaCorrienteMovimiento.create({
      data: {
        empresaId: input.empresaId,
        terceroTipo: input.terceroTipo,
        terceroId: input.terceroId,
        terceroNombre: input.terceroNombre.trim(),
        fecha,
        documentoRef: input.documentoRef?.trim() || null,
        documentoTipo: input.documentoTipo?.trim() || null,
        debe: new Prisma.Decimal(debe),
        haber: new Prisma.Decimal(haber),
        saldo: new Prisma.Decimal(saldo),
        glosa: input.glosa?.trim() || null,
        origen: input.origen ?? null,
        pagoId: input.pagoId ?? null,
        documentoComercialId: input.documentoComercialId ?? null,
        registroCompraId: input.registroCompraId ?? null,
        movimientoCartolaId: input.movimientoCartolaId ?? null,
      },
    });
  }

  async listSaldos(
    user: JwtPayload,
    opts: {
      terceroTipo?: string;
      q?: string;
      soloConSaldo?: boolean;
      periodo?: string;
    },
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const { identities, idToRut } = await this.loadIdentitiesByRut(empresaId);
    const corte = fechaExclusivaTrasPeriodo(opts.periodo);
    const rows = await this.prisma.cuentaCorrienteMovimiento.findMany({
      where: {
        empresaId,
        ...(corte ? { fecha: { lt: corte } } : {}),
      },
      orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
    });

    type Agg = {
      rut: string;
      rutDisplay: string;
      nombre: string;
      clienteId?: string;
      clienteNombre?: string;
      proveedorId?: string;
      proveedorNombre?: string;
      roles: TerceroCc[];
      terceroTipo: TerceroCc;
      terceroId: string;
      terceroNombre: string;
      debe: number;
      haber: number;
      saldo: number;
      saldoCliente: number;
      saldoProveedor: number;
      movimientos: number;
      ultimaFecha: string;
    };
    type AggKeyed = Agg & { _key: string };
    const map = new Map<string, AggKeyed>();
    const roleSet = new Map<string, Set<TerceroCc>>();
    const keysHitByDoc = new Set<string>();

    const ensure = (key: string, seed: Partial<Agg> & { terceroTipo: TerceroCc; terceroId: string; terceroNombre: string; fecha: string }) => {
      const existing = map.get(key);
      if (existing) return existing;
      const ident = key.startsWith('__orphan:') ? undefined : identities.get(key);
      const roles = new Set<TerceroCc>();
      if (ident?.clienteId) roles.add('CLIENTE');
      if (ident?.proveedorId) roles.add('PROVEEDOR');
      if (ident?.esProductor) roles.add('PRODUCTOR');
      roleSet.set(key, roles);
      const row: AggKeyed = {
        _key: key,
        rut: ident?.rutNorm ?? (looksLikeRut(seed.terceroId) ? normalizeRut(seed.terceroId) : ''),
        rutDisplay: ident ? formatRutDisplay(ident.rutNorm) : seed.terceroId,
        nombre: ident?.nombre ?? seed.terceroNombre,
        clienteId: ident?.clienteId,
        clienteNombre: ident?.clienteNombre,
        proveedorId: ident?.proveedorId,
        proveedorNombre: ident?.proveedorNombre,
        roles: [],
        terceroTipo: seed.terceroTipo,
        terceroId: ident?.clienteId || ident?.proveedorId || seed.terceroId,
        terceroNombre: ident?.nombre ?? seed.terceroNombre,
        debe: 0,
        haber: 0,
        saldo: 0,
        saldoCliente: 0,
        saldoProveedor: 0,
        movimientos: 0,
        ultimaFecha: seed.fecha,
      };
      map.set(key, row);
      return row;
    };

    for (const r of rows) {
      if (!fechaDentroOAntesDelPeriodo(r.fecha, opts.periodo)) continue;
      const tipo = r.terceroTipo as TerceroCc;
      const key = this.rutKeyForMovimiento(r.terceroTipo, r.terceroId, idToRut);
      const fecha = r.fecha.toISOString().slice(0, 10);
      const cur = ensure(key, {
        terceroTipo: tipo,
        terceroId: r.terceroId,
        terceroNombre: r.terceroNombre,
        fecha,
      });
      cur.debe += Number(r.debe);
      cur.haber += Number(r.haber);
      cur.movimientos += 1;
      cur.ultimaFecha = fecha;
      if (!key.startsWith('__orphan:')) {
        cur.nombre = identities.get(key)?.nombre ?? r.terceroNombre;
        cur.terceroNombre = cur.nombre;
      } else {
        cur.terceroNombre = r.terceroNombre;
        cur.nombre = r.terceroNombre;
      }
      const signed = Number(r.debe) - Number(r.haber);
      cur.saldo += signed;
      if (tipo === 'CLIENTE') cur.saldoCliente += signed;
      else cur.saldoProveedor += signed;
      roleSet.get(key)!.add(tipo);
      const qDoc = opts.q?.trim();
      if (qDoc && (r.documentoRef ?? '').toLowerCase().includes(qDoc.toLowerCase())) {
        keysHitByDoc.add(key);
      }
    }

    let keyed = [...map.values()];
    const tipoFiltro = opts.terceroTipo?.trim().toUpperCase();
    if (tipoFiltro && tipoFiltro !== 'TODOS') {
      keyed = keyed.filter((i) => (roleSet.get(i._key)?.has(tipoFiltro as TerceroCc) ?? i.terceroTipo === tipoFiltro));
    }
    const q = opts.q?.trim();
    if (q) {
      const qNorm = normalizeRut(q).toLowerCase();
      const qLow = q.toLowerCase();
      keyed = keyed.filter((i) => {
        const blob = [
          i.nombre,
          i.clienteNombre,
          i.proveedorNombre,
          i.rut,
          i.rutDisplay,
          i.terceroId,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(qLow)
          || (qNorm.length >= 3 && normalizeRut(i.rut).toLowerCase().includes(qNorm))
          || keysHitByDoc.has(i._key);
      });
    }
    if (opts.soloConSaldo) {
      keyed = keyed.filter(
        (i) =>
          Math.abs(i.saldo) > 0.0001
          || Math.abs(i.saldoCliente) > 0.0001
          || Math.abs(i.saldoProveedor) > 0.0001,
      );
    }
    const items = keyed.map((i) => {
      const roles = [...(roleSet.get(i._key) ?? new Set<TerceroCc>())];
      if (!roles.length) roles.push(i.terceroTipo);
      const { _key: _, ...rest } = i;
      return { ...rest, roles };
    });
    items.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return items;
  }

  async getEstadoCuentaPorRut(
    user: JwtPayload,
    dto: EstadoCuentaPorRutQueryDto,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rutNorm = normalizeRut(dto.rut);
    if (rutNorm.length < 3) throw new BadRequestException('RUT inválido');
    const filtro: FiltroEstadoCuenta = dto.filtro ?? 'TODOS';

    const { identities, idToRut } = await this.loadIdentitiesByRut(empresaId);
    const ident = identities.get(rutNorm);
    if (!ident) {
      throw new NotFoundException('RUT no encontrado en la empresa (ni cliente ni proveedor)');
    }

    const terceroIds = [ident.clienteId, ident.proveedorId].filter(Boolean) as string[];
    const corte = fechaExclusivaTrasPeriodo(dto.periodo);
    const rows = await this.prisma.cuentaCorrienteMovimiento.findMany({
      where: {
        empresaId,
        ...(corte ? { fecha: { lt: corte } } : {}),
        OR: [
          ...(terceroIds.length ? [{ terceroId: { in: terceroIds } }] : []),
          { terceroId: { equals: rutNorm, mode: 'insensitive' } },
          { terceroId: { equals: ident.rutRaw, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
    });
    const movimientosEmpresa = rows.filter((r) => {
      if (!fechaDentroOAntesDelPeriodo(r.fecha, dto.periodo)) return false;
      const key = this.rutKeyForMovimiento(r.terceroTipo, r.terceroId, idToRut);
      if (key === rutNorm) return true;
      if (terceroIds.includes(r.terceroId)) return true;
      return normalizeRut(r.terceroId) === rutNorm;
    });

    const pagoIds = movimientosEmpresa.map((m) => m.pagoId).filter(Boolean) as string[];
    const [pagosRel, anticiposRel, agingRel] = await Promise.all([
      this.prisma.pago.findMany({
        where: {
          empresaId,
          OR: [
            ...(pagoIds.length ? [{ id: { in: pagoIds } }] : []),
            ...(ident.clienteId ? [{ clienteId: ident.clienteId }] : []),
            ...(ident.proveedorId ? [{ proveedorId: ident.proveedorId }] : []),
          ],
        },
      }),
      this.prisma.anticipoProductor.findMany({
        where: {
          empresaId,
          OR: [
            ...(ident.clienteId ? [{ clienteId: ident.clienteId }] : []),
            ...(ident.proveedorId ? [{ proveedorId: ident.proveedorId }] : []),
          ],
        },
      }),
      this.prisma.documentoAging.findMany({
        where: { empresaId },
      }),
    ]);

    const pagosById = new Map(pagosRel.map((p) => [p.id, p]));
    let running = 0;
    const mapped = movimientosEmpresa.map((r) => {
      const debe = Number(r.debe);
      const haber = Number(r.haber);
      running += debe - haber;
      const folio = r.documentoRef?.trim() || '';
      const { estadoLiquidacion, calces } = this.resolveCalce({
        movimiento: r,
        folio,
        pagos: pagosRel,
        pagosById,
        anticipos: anticiposRel,
        aging: agingRel,
      });
      const linkTarget = linkTargetForMovimiento({
        documentoRef: r.documentoRef,
        documentoTipo: r.documentoTipo,
        origen: r.origen,
        pagoId: r.pagoId,
        documentoComercialId: r.documentoComercialId,
        registroCompraId: r.registroCompraId,
        movimientoCartolaId: r.movimientoCartolaId,
      });
      return {
        id: r.id,
        fecha: r.fecha.toISOString().slice(0, 10),
        terceroTipo: r.terceroTipo as TerceroCc,
        terceroId: r.terceroId,
        terceroNombre: r.terceroNombre,
        documentoRef: r.documentoRef ?? undefined,
        documentoTipo: r.documentoTipo ?? undefined,
        folio: folio || undefined,
        debe,
        haber,
        saldo: running,
        glosa: r.glosa ?? undefined,
        origen: r.origen ?? undefined,
        pagoId: r.pagoId ?? undefined,
        documentoComercialId: r.documentoComercialId ?? undefined,
        registroCompraId: r.registroCompraId ?? undefined,
        movimientoCartolaId: r.movimientoCartolaId ?? undefined,
        estadoLiquidacion,
        estadoCalce: estadoLiquidacion,
        calces,
        linkTarget,
      };
    });

    const movimientos =
      filtro === 'TODOS'
        ? mapped
        : mapped.filter((m) =>
            filtro === 'HISTORICO' ? m.estadoLiquidacion === 'CALZADO' : m.estadoLiquidacion === 'PENDIENTE',
          );

    const saldoCliente = mapped
      .filter((m) => m.terceroTipo === 'CLIENTE')
      .reduce((acc, m) => acc + m.debe - m.haber, 0);
    const saldoProveedor = mapped
      .filter((m) => m.terceroTipo !== 'CLIENTE')
      .reduce((acc, m) => acc + m.debe - m.haber, 0);

    const roles: TerceroCc[] = [];
    if (ident.clienteId) roles.push('CLIENTE');
    if (ident.proveedorId) roles.push('PROVEEDOR');
    if (ident.esProductor && !roles.includes('PRODUCTOR')) roles.push('PRODUCTOR');

    return {
      rut: rutNorm,
      rutDisplay: formatRutDisplay(rutNorm),
      nombre: ident.nombre,
      cliente: ident.clienteId
        ? { id: ident.clienteId, razonSocial: ident.clienteNombre ?? ident.nombre }
        : null,
      proveedor: ident.proveedorId
        ? { id: ident.proveedorId, razonSocial: ident.proveedorNombre ?? ident.nombre }
        : null,
      roles,
      dual: Boolean(ident.clienteId && ident.proveedorId),
      saldoCliente,
      saldoProveedor,
      saldoNeto: saldoCliente + saldoProveedor,
      movimientos,
    };
  }

  async listMovimientos(
    user: JwtPayload,
    terceroId: string,
    opts: { terceroTipo?: string },
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const where: Prisma.CuentaCorrienteMovimientoWhereInput = {
      empresaId,
      terceroId,
      ...(opts.terceroTipo
        ? { terceroTipo: opts.terceroTipo.toUpperCase() as never }
        : {}),
    };
    const rows = await this.prisma.cuentaCorrienteMovimiento.findMany({
      where,
      orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      terceroTipo: r.terceroTipo,
      terceroId: r.terceroId,
      terceroNombre: r.terceroNombre,
      fecha: r.fecha.toISOString().slice(0, 10),
      documentoRef: r.documentoRef ?? undefined,
      documentoTipo: r.documentoTipo ?? undefined,
      debe: Number(r.debe),
      haber: Number(r.haber),
      saldo: Number(r.saldo),
      glosa: r.glosa ?? undefined,
      origen: r.origen ?? undefined,
      pagoId: r.pagoId ?? undefined,
      documentoComercialId: r.documentoComercialId ?? undefined,
      registroCompraId: r.registroCompraId ?? undefined,
      movimientoCartolaId: r.movimientoCartolaId ?? undefined,
    }));
  }

  async registrarAjuste(
    user: JwtPayload,
    dto: {
      terceroTipo: string;
      terceroId: string;
      terceroNombre: string;
      fecha: string;
      debe?: number;
      haber?: number;
      glosa?: string;
      documentoRef?: string;
    },
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const tipo = dto.terceroTipo.toUpperCase() as TerceroCc;
    if (!['CLIENTE', 'PROVEEDOR', 'PRODUCTOR'].includes(tipo)) {
      throw new BadRequestException('terceroTipo inválido');
    }
    const row = await this.registrarMovimiento({
      empresaId,
      terceroTipo: tipo,
      terceroId: dto.terceroId.trim(),
      terceroNombre: dto.terceroNombre.trim(),
      fecha: dto.fecha,
      debe: dto.debe ?? 0,
      haber: dto.haber ?? 0,
      glosa: dto.glosa ?? 'Ajuste manual CC',
      documentoRef: dto.documentoRef ?? 'AJUSTE',
      documentoTipo: 'AJUSTE',
      origen: 'AJUSTE',
    });
    return {
      id: row.id,
      terceroTipo: row.terceroTipo,
      terceroId: row.terceroId,
      terceroNombre: row.terceroNombre,
      fecha: row.fecha.toISOString().slice(0, 10),
      debe: Number(row.debe),
      haber: Number(row.haber),
      saldo: Number(row.saldo),
      glosa: row.glosa ?? undefined,
      origen: row.origen ?? undefined,
    };
  }

  async getMovimiento(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const row = await this.prisma.cuentaCorrienteMovimiento.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Movimiento CC no encontrado');
    assertTenantAccess(scope, row.empresaId);
    return row;
  }

  private async loadIdentitiesByRut(empresaId: string) {
    const [clientes, proveedores] = await Promise.all([
      this.prisma.cliente.findMany({
        where: { empresaId },
        select: { id: true, rut: true, razonSocial: true, esProductor: true },
      }),
      this.prisma.proveedor.findMany({
        where: { empresaId },
        select: { id: true, rut: true, razonSocial: true, esProductor: true },
      }),
    ]);
    type Ident = {
      rutNorm: string;
      rutRaw: string;
      nombre: string;
      clienteId?: string;
      clienteNombre?: string;
      proveedorId?: string;
      proveedorNombre?: string;
      esProductor: boolean;
    };
    const identities = new Map<string, Ident>();
    const idToRut = new Map<string, string>();
    const upsert = (rutRaw: string): Ident => {
      const rutNorm = normalizeRut(rutRaw);
      const cur = identities.get(rutNorm) ?? {
        rutNorm,
        rutRaw,
        nombre: '',
        esProductor: false,
      };
      identities.set(rutNorm, cur);
      return cur;
    };
    for (const c of clientes) {
      const ident = upsert(c.rut);
      ident.clienteId = c.id;
      ident.clienteNombre = c.razonSocial;
      ident.nombre = ident.nombre || c.razonSocial;
      ident.esProductor = ident.esProductor || Boolean(c.esProductor);
      idToRut.set(`CLIENTE:${c.id}`, ident.rutNorm);
    }
    for (const p of proveedores) {
      const ident = upsert(p.rut);
      ident.proveedorId = p.id;
      ident.proveedorNombre = p.razonSocial;
      ident.nombre = ident.proveedorNombre && ident.clienteNombre && ident.clienteNombre !== ident.proveedorNombre
        ? `${ident.clienteNombre} / ${ident.proveedorNombre}`
        : ident.nombre || p.razonSocial;
      ident.esProductor = ident.esProductor || Boolean(p.esProductor);
      idToRut.set(`PROVEEDOR:${p.id}`, ident.rutNorm);
      idToRut.set(`PRODUCTOR:${p.id}`, ident.rutNorm);
    }
    return { identities, idToRut };
  }

  private rutKeyForMovimiento(
    terceroTipo: string,
    terceroId: string,
    idToRut: Map<string, string>,
  ): string {
    const typed = idToRut.get(`${terceroTipo}:${terceroId}`);
    if (typed) return typed;
    for (const tipo of ['CLIENTE', 'PROVEEDOR', 'PRODUCTOR'] as const) {
      const hit = idToRut.get(`${tipo}:${terceroId}`);
      if (hit) return hit;
    }
    if (looksLikeRut(terceroId)) return normalizeRut(terceroId);
    return `__orphan:${terceroTipo}:${terceroId}`;
  }

  private resolveCalce(input: {
    movimiento: {
      origen?: string | null;
      documentoTipo?: string | null;
      documentoRef?: string | null;
      pagoId?: string | null;
      documentoComercialId?: string | null;
      registroCompraId?: string | null;
    };
    folio: string;
    pagos: Array<{
      id: string;
      tipo?: string | null;
      documentosCalce?: string | null;
      medio?: string | null;
    }>;
    pagosById: Map<string, { id: string; tipo?: string | null; documentosCalce?: string | null; medio?: string | null }>;
    anticipos: Array<{
      id: string;
      nroDocto?: string | null;
      nroComprobante?: string | null;
      documentosCalce?: string | null;
      montoCalzado?: unknown;
      saldo?: unknown;
    }>;
    aging: Array<{
      documento: string;
      saldo: unknown;
      montoPagado?: unknown;
      documentoComercialId?: string | null;
      registroCompraId?: string | null;
    }>;
  }): { estadoLiquidacion: EstadoLiquidacionCc; calces: CalceRefDto[] } {
    const calces: CalceRefDto[] = [];
    const seen = new Set<string>();
    const push = (c: CalceRefDto) => {
      const k = `${c.tipo}:${c.id}:${c.ref}`;
      if (seen.has(k)) return;
      seen.add(k);
      calces.push(c);
    };

    const origen = (input.movimiento.origen ?? '').toUpperCase();
    const tipoDoc = (input.movimiento.documentoTipo ?? '').toUpperCase();
    const folio = input.folio;
    const esDeuda = origen === 'VENTA' || origen === 'COMPRA' || tipoDoc === 'FACTURA' || tipoDoc === 'NC' || tipoDoc === 'ND';
    const esPago = origen === 'PAGO' || origen === 'TESORERIA' || origen === 'ANTICIPO' || tipoDoc === 'PAGO' || tipoDoc === 'ANTICIPO';

    if (input.movimiento.pagoId) {
      const pago = input.pagosById.get(input.movimiento.pagoId);
      if (pago && !isCalceLibreRef(pago.documentosCalce)) {
        push(pagoToCalceRef(pago));
      }
    }

    if (folio) {
      for (const pago of input.pagos) {
        if (isCalceLibreRef(pago.documentosCalce)) continue;
        const refs = splitCalceRefs(pago.documentosCalce);
        if (refs.some((r) => refsEqual(r, folio))) push(pagoToCalceRef(pago));
      }
      for (const ant of input.anticipos) {
        const refs = [
          ...splitCalceRefs(ant.documentosCalce),
          ant.nroDocto ?? '',
        ].filter(Boolean);
        if (refs.some((r) => refsEqual(r, folio))) push(anticipoToCalceRef(ant));
      }
    }

    const aging = folio
      ? input.aging.find(
          (a) =>
            refsEqual(a.documento, folio)
            || (input.movimiento.documentoComercialId
              && a.documentoComercialId === input.movimiento.documentoComercialId)
            || (input.movimiento.registroCompraId
              && a.registroCompraId === input.movimiento.registroCompraId),
        )
      : undefined;
    const agingSaldo = aging != null ? Number(aging.saldo) : null;
    const agingPagado = aging != null ? Number(aging.montoPagado ?? 0) : 0;

    let estadoLiquidacion: EstadoLiquidacionCc = 'PENDIENTE';
    if (esDeuda) {
      if (agingSaldo != null && agingSaldo <= 0.0001 && agingPagado > 0) {
        estadoLiquidacion = 'CALZADO';
      } else if (agingSaldo != null && agingSaldo <= 0.0001 && calces.length > 0) {
        estadoLiquidacion = 'CALZADO';
      }
    } else if (esPago) {
      const pago = input.movimiento.pagoId ? input.pagosById.get(input.movimiento.pagoId) : undefined;
      if (pago && !isCalceLibreRef(pago.documentosCalce) && splitCalceRefs(pago.documentosCalce).length) {
        estadoLiquidacion = 'CALZADO';
      } else if (calces.length > 0) {
        estadoLiquidacion = 'CALZADO';
      }
    } else if (calces.length > 0 && agingSaldo != null && agingSaldo <= 0.0001) {
      estadoLiquidacion = 'CALZADO';
    }

    return { estadoLiquidacion, calces };
  }
}
