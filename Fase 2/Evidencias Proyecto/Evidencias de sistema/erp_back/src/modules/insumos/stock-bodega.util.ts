import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export const RESERVA_STOCK_DIAS = 7;

/** Solo FK `Bodega.id` del tenant. No resolver por nombre ni código. */
export async function resolveBodegaId(
  tx: Tx,
  empresaId: string,
  bodegaId: string,
): Promise<string> {
  const id = bodegaId.trim();
  if (!id) throw new BadRequestException('bodegaId es obligatorio');
  const found = await tx.bodega.findFirst({
    where: { empresaId, id },
  });
  if (!found) throw new BadRequestException(`Bodega no encontrada: ${id}`);
  return found.id;
}

export async function requireBodega(
  tx: Tx,
  empresaId: string,
  bodegaId: string,
) {
  const id = bodegaId.trim();
  if (!id) throw new BadRequestException('bodegaId es obligatorio');
  const found = await tx.bodega.findFirst({ where: { empresaId, id } });
  if (!found) throw new BadRequestException(`Bodega no encontrada: ${id}`);
  return found;
}

export async function requireInsumo(
  tx: Tx,
  empresaId: string,
  insumoId: string,
) {
  const id = insumoId.trim();
  if (!id) throw new BadRequestException('insumoId es obligatorio');
  const found = await tx.insumo.findFirst({ where: { empresaId, id } });
  if (!found) throw new BadRequestException('Insumo no encontrado');
  return found;
}

export async function applyStockDelta(
  tx: Tx,
  params: { empresaId: string; insumoId: string; bodegaId: string; delta: number },
) {
  const { empresaId, insumoId, bodegaId, delta } = params;
  const row = await tx.stockInsumoBodega.findUnique({
    where: { empresaId_insumoId_bodegaId: { empresaId, insumoId, bodegaId } },
  });
  const current = row ? Number(row.cantidad) : 0;
  const next = current + delta;
  if (next < -1e-9) {
    throw new BadRequestException('Stock insuficiente en la bodega');
  }
  await tx.stockInsumoBodega.upsert({
    where: { empresaId_insumoId_bodegaId: { empresaId, insumoId, bodegaId } },
    create: { empresaId, insumoId, bodegaId, cantidad: Math.max(0, next) },
    update: { cantidad: Math.max(0, next) },
  });
  const sum = await tx.stockInsumoBodega.aggregate({
    where: { empresaId, insumoId },
    _sum: { cantidad: true },
  });
  await tx.insumo.update({
    where: { id: insumoId },
    data: { stock: Number(sum._sum.cantidad ?? 0) },
  });
}

/** Suma reservas ACTIVA no vencidas (disponible = físico − esto). */
export async function sumReservadoActivo(
  tx: Tx,
  params: { empresaId: string; insumoId: string; bodegaId: string; now?: Date },
): Promise<number> {
  const now = params.now ?? new Date();
  const agg = await tx.reservaStock.aggregate({
    where: {
      empresaId: params.empresaId,
      insumoId: params.insumoId,
      bodegaId: params.bodegaId,
      estado: 'ACTIVA',
      venceAt: { gt: now },
    },
    _sum: { cantidad: true },
  });
  return Number(agg._sum.cantidad ?? 0);
}

export async function mapReservadoByKey(
  tx: Tx,
  empresaId: string,
  keys: { insumoId: string; bodegaId: string }[],
  now = new Date(),
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!keys.length) return out;
  const insumoIds = [...new Set(keys.map((k) => k.insumoId))];
  const bodegaIds = [...new Set(keys.map((k) => k.bodegaId))];
  const rows = await tx.reservaStock.findMany({
    where: {
      empresaId,
      estado: 'ACTIVA',
      venceAt: { gt: now },
      insumoId: { in: insumoIds },
      bodegaId: { in: bodegaIds },
    },
    select: { insumoId: true, bodegaId: true, cantidad: true },
  });
  for (const r of rows) {
    const k = `${r.insumoId}|${r.bodegaId}`;
    out.set(k, (out.get(k) ?? 0) + Number(r.cantidad));
  }
  return out;
}

export function disponibleFrom(cantidad: number, reservado: number) {
  return Math.max(0, cantidad - reservado);
}

export async function listStockBodegas(tx: Tx, empresaId: string, insumoId: string) {
  const insumo = await tx.insumo.findFirst({ where: { id: insumoId, empresaId } });
  if (!insumo) throw new NotFoundException('Insumo no encontrado');
  const bodegas = await tx.bodega.findMany({
    where: { empresaId, activa: true },
    orderBy: { codigo: 'asc' },
  });
  const stocks = await tx.stockInsumoBodega.findMany({
    where: { empresaId, insumoId },
  });
  const byBodega = new Map(stocks.map((s) => [s.bodegaId, Number(s.cantidad)]));
  const reservadoMap = await mapReservadoByKey(
    tx,
    empresaId,
    bodegas.map((b) => ({ insumoId, bodegaId: b.id })),
  );
  const bodegasOut = bodegas.map((b) => {
    const cantidad = byBodega.get(b.id) ?? 0;
    const reservado = reservadoMap.get(`${insumoId}|${b.id}`) ?? 0;
    return {
      bodegaId: b.id,
      codigo: b.codigo,
      nombre: b.nombre,
      cantidad,
      reservado,
      disponible: disponibleFrom(cantidad, reservado),
    };
  });
  return {
    insumoId,
    codigo: insumo.codigo,
    nombre: insumo.nombre,
    costoPromedio: Number(insumo.costoPromedio),
    stockTotal: Number(insumo.stock),
    bodegas: bodegasOut,
  };
}

export type SplitReserva = { bodegaId: string; cantidad: number; insumoId: string; descripcion?: string };

/**
 * Crea reservas ACTIVA (7 días) validando disponible >= qty.
 * No modifica cantidad física.
 */
export async function crearReservasOv(
  tx: Tx,
  params: {
    empresaId: string;
    documentoId: string;
    lineas: Array<{
      tipoLinea?: string;
      insumoId?: string;
      cantidad: number;
      bodegaId?: string;
      splits?: { bodegaId: string; cantidad: number }[];
      descripcion?: string;
    }>;
    ahora?: Date;
  },
) {
  const ahora = params.ahora ?? new Date();
  const venceAt = new Date(ahora.getTime() + RESERVA_STOCK_DIAS * 24 * 60 * 60 * 1000);

  // Evita doble ACTIVA si se re-autoriza / carrera sobre el mismo documento.
  await liberarReservasOv(tx, {
    empresaId: params.empresaId,
    documentoId: params.documentoId,
  });

  for (const l of params.lineas) {
    if ((l.tipoLinea || '').toUpperCase() !== 'PRODUCTO' || !l.insumoId) continue;
    const ins = await tx.insumo.findFirst({
      where: { id: l.insumoId, empresaId: params.empresaId },
      select: { inventariable: true, codigo: true },
    });
    if (!ins || ins.inventariable === false) continue;

    const splits =
      l.splits?.length
        ? l.splits
        : l.bodegaId
          ? [{ bodegaId: l.bodegaId, cantidad: l.cantidad }]
          : [];
    if (!splits.length) {
      throw new BadRequestException(
        `Línea ${ins.codigo}: indique bodega para reservar stock`,
      );
    }

    for (const s of splits) {
      const qty = Number(s.cantidad);
      if (!(qty > 0)) continue;
      const bod = await requireBodega(tx, params.empresaId, s.bodegaId);
      const stockRow = await tx.stockInsumoBodega.findUnique({
        where: {
          empresaId_insumoId_bodegaId: {
            empresaId: params.empresaId,
            insumoId: l.insumoId,
            bodegaId: bod.id,
          },
        },
      });
      const fisico = stockRow ? Number(stockRow.cantidad) : 0;
      const reservado = await sumReservadoActivo(tx, {
        empresaId: params.empresaId,
        insumoId: l.insumoId,
        bodegaId: bod.id,
        now: ahora,
      });
      const disponible = disponibleFrom(fisico, reservado);
      if (qty > disponible + 1e-9) {
        throw new BadRequestException(
          `Stock insuficiente para reservar ${ins.codigo} en bodega ${bod.codigo}: `
          + `disponible ${disponible}, solicitado ${qty}`,
        );
      }
      await tx.reservaStock.create({
        data: {
          empresaId: params.empresaId,
          documentoId: params.documentoId,
          insumoId: l.insumoId,
          bodegaId: bod.id,
          cantidad: qty,
          estado: 'ACTIVA',
          venceAt,
        },
      });
    }
  }
}

/** Marca reservas ACTIVA del documento como CONSUMIDA (al confirmar OV). */
export async function consumirReservasOv(
  tx: Tx,
  params: { empresaId: string; documentoId: string },
) {
  await tx.reservaStock.updateMany({
    where: {
      empresaId: params.empresaId,
      documentoId: params.documentoId,
      estado: 'ACTIVA',
    },
    data: { estado: 'CONSUMIDA' },
  });
}

/** Libera reservas ACTIVA del documento (anulación OV AUTORIZADA). */
export async function liberarReservasOv(
  tx: Tx,
  params: { empresaId: string; documentoId: string },
) {
  await tx.reservaStock.updateMany({
    where: {
      empresaId: params.empresaId,
      documentoId: params.documentoId,
      estado: 'ACTIVA',
    },
    data: { estado: 'LIBERADA' },
  });
}
