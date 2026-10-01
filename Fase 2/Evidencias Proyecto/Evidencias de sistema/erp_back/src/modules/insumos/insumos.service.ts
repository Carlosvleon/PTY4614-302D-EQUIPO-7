import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../auth/jwt.strategy';
import {
  assertTenantAccess,
  resolveOperationalEmpresa,
  resolveTenant,
} from '../../auth/tenant.util';
import {
  UpsertBodegaDto,
  UpsertInsumoDto,
  UpsertMovimientoBodegaDto,
} from './dto/insumos.dto';
import { assertCuentaImputable } from '../contabilidad/cuenta-imputable.util';
import { applyStockDelta, disponibleFrom, listStockBodegas, mapReservadoByKey, requireBodega, requireInsumo } from './stock-bodega.util';

const TIPOS_MOV = new Set([
  'ENTRADA_PROVEEDOR',
  'TRASLADO',
  'DEVOLUCION_NC',
  'SALIDA_PROVEEDOR',
  'DEVOLUCION',
  'SALIDA_VENTA',
  'ENTRADA_VENTA_ANULACION',
]);

function mapInsumo(row: {
  id: string;
  codigo: string;
  familia: string;
  subfamilia: string;
  nombre: string;
  detalle?: string | null;
  unidad: string;
  stock: Prisma.Decimal;
  costoPromedio: Prisma.Decimal;
  precioCompra?: Prisma.Decimal | null;
  cuentaContableId: string | null;
  inventariable?: boolean;
}) {
  const detalle = row.detalle?.trim() || undefined;
  return {
    id: row.id,
    codigo: row.codigo,
    familia: row.familia,
    subfamilia: row.subfamilia,
    nombre: row.nombre,
    ...(detalle ? { detalle } : {}),
    unidad: row.unidad,
    stock: Number(row.stock),
    costoPromedio: Number(row.costoPromedio),
    precioCompra: Number(row.precioCompra ?? 0),
    cuentaContableId: row.cuentaContableId ?? undefined,
    inventariable: row.inventariable !== false,
  };
}

function mapMov(row: {
  id: string;
  fecha: Date;
  tipo: string;
  estado: string;
  bodega: string;
  bodegaId?: string | null;
  bodegaDestino: string | null;
  bodegaDestinoId?: string | null;
  articulo: string;
  cantidad: Prisma.Decimal;
  precioUnitario: Prisma.Decimal;
  facturaRef: string | null;
  nota: string;
  parId: string | null;
  insumoId?: string | null;
}) {
  return {
    id: row.id,
    fecha: row.fecha.toISOString().slice(0, 10),
    tipo: row.tipo,
    estado: row.estado,
    bodega: row.bodega,
    bodegaId: row.bodegaId ?? undefined,
    bodegaDestino: row.bodegaDestino ?? undefined,
    bodegaDestinoId: row.bodegaDestinoId ?? undefined,
    articulo: row.articulo,
    insumoId: row.insumoId ?? undefined,
    cantidad: Number(row.cantidad),
    precioUnitario: Number(row.precioUnitario),
    facturaRef: row.facturaRef ?? undefined,
    nota: row.nota,
    parId: row.parId ?? undefined,
  };
}

async function applyTipoToStock(
  tx: Prisma.TransactionClient,
  params: {
    empresaId: string;
    insumoId: string;
    tipo: string;
    cantidad: number;
    bodegaId: string;
    bodegaDestinoId?: string | null;
    reverse?: boolean;
  },
) {
  const { empresaId, insumoId, tipo, cantidad, bodegaId, bodegaDestinoId, reverse } = params;
  const sign = reverse ? -1 : 1;
  const origenId = await requireBodega(tx, empresaId, bodegaId).then((b) => b.id);
  if (tipo === 'ENTRADA_PROVEEDOR' || tipo === 'DEVOLUCION' || tipo === 'ENTRADA_VENTA_ANULACION' || tipo === 'DEVOLUCION_NC') {
    await applyStockDelta(tx, { empresaId, insumoId, bodegaId: origenId, delta: sign * cantidad });
    return;
  }
  if (tipo === 'SALIDA_PROVEEDOR' || tipo === 'SALIDA_VENTA') {
    await applyStockDelta(tx, { empresaId, insumoId, bodegaId: origenId, delta: sign * -cantidad });
    return;
  }
  if (tipo === 'TRASLADO') {
    if (!bodegaDestinoId) throw new BadRequestException('Traslado requiere bodegaDestinoId');
    const destId = (await requireBodega(tx, empresaId, bodegaDestinoId)).id;
    await applyStockDelta(tx, { empresaId, insumoId, bodegaId: origenId, delta: sign * -cantidad });
    await applyStockDelta(tx, { empresaId, insumoId, bodegaId: destId, delta: sign * cantidad });
  }
}

function pickBodegaId(dto: { bodegaId?: string; bodega?: string }, fallback?: string | null) {
  const id = (dto.bodegaId || dto.bodega || fallback || '').trim();
  if (!id) throw new BadRequestException('bodegaId es obligatorio');
  return id;
}

@Injectable()
export class InsumosService {
  constructor(private prisma: PrismaService) {}

  async getInsumos(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.insumo.findMany({
      where: { empresaId },
      orderBy: { codigo: 'asc' },
    });
    return rows.map(mapInsumo);
  }

  async createInsumo(user: JwtPayload, dto: UpsertInsumoDto, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    await assertCuentaImputable(this.prisma, empresaId, dto.cuentaContableId);
    try {
      const row = await this.prisma.insumo.create({
        data: {
          codigo: dto.codigo.trim().toUpperCase(),
          familia: dto.familia.trim(),
          subfamilia: dto.subfamilia.trim(),
          nombre: dto.nombre.trim(),
          detalle: dto.detalle?.trim() || null,
          unidad: dto.unidad.trim(),
          stock: dto.stock ?? 0,
          costoPromedio: dto.costoPromedio ?? 0,
          precioCompra: dto.precioCompra ?? 0,
          cuentaContableId: dto.cuentaContableId?.trim() || null,
          inventariable: dto.inventariable ?? true,
          empresaId,
        },
      });
      return mapInsumo(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un insumo con ese código');
      }
      throw e;
    }
  }

  async getStockBodegas(
    user: JwtPayload,
    insumoId: string,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    return this.prisma.$transaction((tx) => listStockBodegas(tx, empresaId, insumoId));
  }

  /** Mantenedor: productos con saldo en una bodega (actual / reservado / disponible). */
  async getStockPorBodega(
    user: JwtPayload,
    bodegaId: string,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    return this.prisma.$transaction(async (tx) => {
      const bodega = await requireBodega(tx, empresaId, bodegaId);
      const stocks = await tx.stockInsumoBodega.findMany({
        where: { empresaId, bodegaId: bodega.id },
        include: {
          insumo: {
            select: {
              id: true,
              codigo: true,
              nombre: true,
              unidad: true,
              inventariable: true,
            },
          },
        },
        orderBy: { insumo: { codigo: 'asc' } },
      });
      const reservadoMap = await mapReservadoByKey(
        tx,
        empresaId,
        stocks.map((s) => ({ insumoId: s.insumoId, bodegaId: bodega.id })),
      );
      return {
        bodegaId: bodega.id,
        codigo: bodega.codigo,
        nombre: bodega.nombre,
        productos: stocks.map((s) => {
          const cantidad = Number(s.cantidad);
          const reservado = reservadoMap.get(`${s.insumoId}|${bodega.id}`) ?? 0;
          return {
            insumoId: s.insumo.id,
            codigo: s.insumo.codigo,
            nombre: s.insumo.nombre,
            unidad: s.insumo.unidad,
            inventariable: s.insumo.inventariable !== false,
            cantidad,
            reservado,
            disponible: disponibleFrom(cantidad, reservado),
          };
        }),
      };
    });
  }

  async liberarReserva(
    user: JwtPayload,
    reservaId: string,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const row = await this.prisma.reservaStock.findFirst({
      where: { id: reservaId, empresaId },
    });
    if (!row) throw new NotFoundException('Reserva no encontrada');
    if (row.estado !== 'ACTIVA') {
      throw new BadRequestException(`La reserva no está ACTIVA (estado: ${row.estado})`);
    }
    const updated = await this.prisma.reservaStock.update({
      where: { id: reservaId },
      data: { estado: 'LIBERADA' },
    });
    return {
      id: updated.id,
      documentoId: updated.documentoId,
      insumoId: updated.insumoId,
      bodegaId: updated.bodegaId,
      cantidad: Number(updated.cantidad),
      estado: updated.estado,
      venceAt: updated.venceAt.toISOString(),
    };
  }

  async getBodegas(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.bodega.findMany({
      where: { empresaId },
      orderBy: { codigo: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      empresaId: r.empresaId,
      activa: r.activa,
    }));
  }

  async createBodega(user: JwtPayload, dto: UpsertBodegaDto, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    try {
      return await this.prisma.bodega.create({
        data: {
          codigo: dto.codigo.trim().toUpperCase(),
          nombre: dto.nombre.trim(),
          activa: dto.activa ?? true,
          empresaId,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una bodega con ese código');
      }
      throw e;
    }
  }

  async updateBodega(user: JwtPayload, id: string, dto: UpsertBodegaDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.bodega.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Bodega no encontrada');
    assertTenantAccess(scope, existing.empresaId);
    return this.prisma.bodega.update({
      where: { id },
      data: {
        codigo: dto.codigo.trim().toUpperCase(),
        nombre: dto.nombre.trim(),
        activa: dto.activa ?? existing.activa,
      },
    });
  }

  async getMovimientos(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.movimientoBodega.findMany({
      where: { empresaId },
      orderBy: { fecha: 'desc' },
    });
    return rows.map(mapMov);
  }

  async createMovimiento(
    user: JwtPayload,
    dto: UpsertMovimientoBodegaDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const tipo = dto.tipo.toUpperCase();
    if (!TIPOS_MOV.has(tipo)) throw new BadRequestException('tipo de movimiento inválido');
    const fecha = new Date(dto.fecha);
    if (Number.isNaN(fecha.getTime())) throw new BadRequestException('fecha inválida');

    const estadoRaw = (dto.estado ?? 'CONFIRMADO').toUpperCase();
    if (!['BORRADOR', 'CONFIRMADO', 'ANULADO'].includes(estadoRaw)) {
      throw new BadRequestException('estado de movimiento inválido');
    }
    const estado = estadoRaw as 'BORRADOR' | 'CONFIRMADO' | 'ANULADO';
    const bodegaId = pickBodegaId(dto);
    const destRaw = (dto.bodegaDestinoId || dto.bodegaDestino || '').trim() || null;
    const insumoId = (dto.insumoId || '').trim();
    if (!insumoId) throw new BadRequestException('insumoId es obligatorio');

    if (tipo === 'TRASLADO' && !destRaw) {
      throw new BadRequestException('Traslado requiere bodegaDestinoId');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const origen = await requireBodega(tx, empresaId, bodegaId);
      const dest = destRaw ? await requireBodega(tx, empresaId, destRaw) : null;
      const insumo = await requireInsumo(tx, empresaId, insumoId);
      assertTenantAccess(resolveTenant(user), insumo.empresaId);

      const mov = await tx.movimientoBodega.create({
        data: {
          fecha,
          tipo: tipo as never,
          estado,
          bodega: origen.codigo,
          bodegaId: origen.id,
          bodegaDestino: dest?.codigo ?? null,
          bodegaDestinoId: dest?.id ?? null,
          articulo: insumo.nombre,
          cantidad: dto.cantidad,
          precioUnitario: dto.precioUnitario,
          facturaRef: dto.facturaRef?.trim() || null,
          nota: dto.nota?.trim() || '',
          insumoId: insumo.id,
          empresaId,
        },
      });

      let par = null as typeof mov | null;
      if (tipo === 'SALIDA_PROVEEDOR' && dto.generarPar !== false) {
        if (!dest) throw new BadRequestException('Salida proveedor con par requiere bodegaDestinoId');
        par = await tx.movimientoBodega.create({
          data: {
            fecha,
            tipo: 'DEVOLUCION' as never,
            estado,
            bodega: dest.codigo,
            bodegaId: dest.id,
            bodegaDestino: origen.codigo,
            bodegaDestinoId: origen.id,
            articulo: insumo.nombre,
            cantidad: dto.cantidad,
            precioUnitario: dto.precioUnitario,
            facturaRef: dto.facturaRef?.trim() || null,
            nota: dto.nota?.trim()
              ? `Par de ${mov.id}: ${dto.nota.trim()}`
              : `Par automático de salida proveedor ${mov.id}`,
            insumoId: insumo.id,
            parId: mov.id,
            empresaId,
          },
        });
        await tx.movimientoBodega.update({
          where: { id: mov.id },
          data: { parId: par.id },
        });
      }

      if (estado === 'CONFIRMADO') {
        const costo = Number(insumo.costoPromedio);
        let newCosto = costo;
        if (tipo === 'ENTRADA_PROVEEDOR' || tipo === 'DEVOLUCION') {
          const stock = Number(insumo.stock);
          const newStock = stock + dto.cantidad;
          newCosto =
            newStock > 0
              ? (stock * costo + dto.cantidad * dto.precioUnitario) / newStock
              : dto.precioUnitario;
        }
        await applyTipoToStock(tx, {
          empresaId,
          insumoId: insumo.id,
          tipo,
          cantidad: dto.cantidad,
          bodegaId: origen.id,
          bodegaDestinoId: dest?.id ?? null,
        });
        if (newCosto !== costo) {
          await tx.insumo.update({
            where: { id: insumo.id },
            data: { costoPromedio: newCosto },
          });
        }
      }

      const updated = par
        ? await tx.movimientoBodega.findUniqueOrThrow({ where: { id: mov.id } })
        : mov;
      return { mov: updated, par };
    });

    return {
      ...mapMov(row.mov),
      par: row.par ? mapMov(row.par) : undefined,
    };
  }

  async updateMovimiento(user: JwtPayload, id: string, dto: UpsertMovimientoBodegaDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.movimientoBodega.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Movimiento no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    if (existing.estado === 'ANULADO') {
      throw new BadRequestException('Movimiento ya anulado');
    }
    if (existing.estado === 'CONFIRMADO' && (dto.estado ?? '').toUpperCase() !== 'ANULADO') {
      throw new BadRequestException('Movimiento confirmado: solo se puede anular');
    }
    const tipo = (dto.tipo || existing.tipo).toUpperCase();
    if (!TIPOS_MOV.has(tipo)) throw new BadRequestException('tipo de movimiento inválido');
    const estadoRaw = (dto.estado ?? existing.estado).toUpperCase();
    if (!['BORRADOR', 'CONFIRMADO', 'ANULADO'].includes(estadoRaw)) {
      throw new BadRequestException('estado de movimiento inválido');
    }
    const fecha = dto.fecha ? new Date(dto.fecha) : existing.fecha;
    if (Number.isNaN(fecha.getTime())) throw new BadRequestException('fecha inválida');

    const anularConfirmado = existing.estado === 'CONFIRMADO' && estadoRaw === 'ANULADO';
    // P0-4: confirmar un borrador debe impactar stock/CPP igual que un
    // movimiento creado directo en CONFIRMADO (antes solo lo hacía el create).
    const confirmarBorrador = existing.estado === 'BORRADOR' && estadoRaw === 'CONFIRMADO';

    const insumoIdResuelto = (dto.insumoId !== undefined ? dto.insumoId : existing.insumoId) || '';
    const cantidadResuelta = dto.cantidad ?? Number(existing.cantidad);
    const precioResuelto = dto.precioUnitario ?? Number(existing.precioUnitario);
    const bodegaIdResuelto = pickBodegaId(
      dto,
      existing.bodegaId || existing.bodega,
    );
    const destIdResuelto =
      (dto.bodegaDestinoId || dto.bodegaDestino || existing.bodegaDestinoId || existing.bodegaDestino || '').trim() ||
      null;

    let stockActual: number | undefined;
    const row = await this.prisma.$transaction(async (tx) => {
      const origen = await requireBodega(tx, existing.empresaId, bodegaIdResuelto);
      const dest = destIdResuelto ? await requireBodega(tx, existing.empresaId, destIdResuelto) : null;

      if (confirmarBorrador) {
        const insumo = await requireInsumo(tx, existing.empresaId, insumoIdResuelto);
        assertTenantAccess(scope, insumo.empresaId);
        const costo = Number(insumo.costoPromedio);
        let newCosto = costo;
        if (tipo === 'ENTRADA_PROVEEDOR' || tipo === 'DEVOLUCION') {
          const stock = Number(insumo.stock);
          const newStock = stock + cantidadResuelta;
          newCosto =
            newStock > 0
              ? (stock * costo + cantidadResuelta * precioResuelto) / newStock
              : precioResuelto;
        }
        await applyTipoToStock(tx, {
          empresaId: existing.empresaId,
          insumoId: insumo.id,
          tipo,
          cantidad: cantidadResuelta,
          bodegaId: origen.id,
          bodegaDestinoId: dest?.id ?? null,
        });
        if (newCosto !== costo) {
          await tx.insumo.update({
            where: { id: insumo.id },
            data: { costoPromedio: newCosto },
          });
        }
        const after = await tx.insumo.findUnique({ where: { id: insumo.id } });
        stockActual = after ? Number(after.stock) : undefined;
      }

      // EX-25: al anular CONFIRMADO, revertir stock y anular movimiento par.
      if (anularConfirmado) {
        const cantidad = Number(existing.cantidad);
        const precio = Number(existing.precioUnitario);
        const tip = existing.tipo;
        const insumo = await requireInsumo(
          tx,
          existing.empresaId,
          existing.insumoId || insumoIdResuelto,
        );
        await applyTipoToStock(tx, {
          empresaId: existing.empresaId,
          insumoId: insumo.id,
          tipo: tip,
          cantidad,
          bodegaId: existing.bodegaId || origen.id,
          bodegaDestinoId: existing.bodegaDestinoId || dest?.id || null,
          reverse: true,
        });
        if (tip === 'ENTRADA_PROVEEDOR' || tip === 'DEVOLUCION') {
          const stock = Number(insumo.stock);
          const costo = Number(insumo.costoPromedio);
          const newStock = stock - cantidad;
          const newCosto = newStock > 0
            ? Math.max(0, (stock * costo - cantidad * precio) / newStock)
            : 0;
          await tx.insumo.update({
            where: { id: insumo.id },
            data: { costoPromedio: newCosto },
          });
        }
        const after = await tx.insumo.findUnique({ where: { id: insumo.id } });
        stockActual = after ? Number(after.stock) : undefined;
        if (existing.parId) {
          await tx.movimientoBodega.update({
            where: { id: existing.parId },
            data: { estado: 'ANULADO' },
          });
        }
      }

      return tx.movimientoBodega.update({
        where: { id },
        data: {
          fecha,
          tipo: tipo as never,
          estado: estadoRaw as never,
          bodega: origen.codigo,
          bodegaId: origen.id,
          bodegaDestino: dest?.codigo ?? null,
          bodegaDestinoId: dest?.id ?? null,
          articulo: dto.articulo?.trim() || existing.articulo,
          cantidad: dto.cantidad ?? existing.cantidad,
          precioUnitario: dto.precioUnitario ?? existing.precioUnitario,
          facturaRef: dto.facturaRef !== undefined ? dto.facturaRef?.trim() || null : existing.facturaRef,
          nota: dto.nota !== undefined ? dto.nota.trim() : existing.nota,
          insumoId: insumoIdResuelto || existing.insumoId,
        },
      });
    });
    return {
      ...mapMov(row),
      ...(stockActual !== undefined ? { stockActual } : {}),
    };
  }

  async updateInsumo(user: JwtPayload, id: string, dto: UpsertInsumoDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.insumo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Insumo no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    const nextCuenta =
      dto.cuentaContableId !== undefined
        ? dto.cuentaContableId.trim() || null
        : existing.cuentaContableId;
    if (nextCuenta && nextCuenta !== existing.cuentaContableId) {
      await assertCuentaImputable(this.prisma, existing.empresaId, nextCuenta);
    }
    const row = await this.prisma.insumo.update({
      where: { id },
      data: {
        codigo: dto.codigo.trim().toUpperCase(),
        familia: dto.familia.trim(),
        subfamilia: dto.subfamilia.trim(),
        nombre: dto.nombre.trim(),
        detalle: dto.detalle !== undefined ? (dto.detalle.trim() || null) : existing.detalle,
        unidad: dto.unidad.trim(),
        // Stock/CPP no se editan desde maestro (D11); se conservan.
        stock: existing.stock,
        costoPromedio: existing.costoPromedio,
        // D16: el precio de compra sí se administra desde el maestro.
        ...(dto.precioCompra !== undefined ? { precioCompra: dto.precioCompra } : {}),
        cuentaContableId: nextCuenta,
        ...(dto.inventariable !== undefined ? { inventariable: dto.inventariable } : {}),
      },
    });
    return mapInsumo(row);
  }
}
