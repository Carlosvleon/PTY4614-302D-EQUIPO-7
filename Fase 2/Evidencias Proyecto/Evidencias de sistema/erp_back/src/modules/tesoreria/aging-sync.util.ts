import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeSemanaCompromiso, periodWeekFromDate, semanaCompromisoDesdeEmision } from './period-week.util';

export function isoWeekFromDate(d: Date): string {
  return periodWeekFromDate(d);
}

function agingEstado(dias: number): 'AL_DIA' | 'ATRASADO' | 'CRITICO' {
  if (dias > 90) return 'CRITICO';
  if (dias > 0) return 'ATRASADO';
  return 'AL_DIA';
}

export function normalizarCondicionPagoDias(value: number | null | undefined): 30 | 60 | 90 | null {
  if (value === 30 || value === 60 || value === 90) return value;
  return null;
}

/** Vencimiento de la factura de compra: fecha del documento + condición de la OC (si no hay, 30). */
export function fechaVencimientoDesdeCondicion(fecha: Date, dias: number | null | undefined): Date {
  const d = new Date(fecha);
  d.setDate(d.getDate() + (normalizarCondicionPagoDias(dias) ?? 30));
  return d;
}

function diasAtraso(venc: Date, hoy = new Date()): number {
  const a = new Date(hoy);
  a.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((a.getTime() - venc.getTime()) / 86_400_000));
}

/** Aging ventas: neto + IVA (mismo criterio que CC / asiento). */
export async function upsertAgingDesdeVenta(
  prisma: PrismaService,
  doc: {
    id: string;
    empresaId: string;
    folio: string;
    cliente: string;
    fecha: Date;
    fechaVencimiento?: Date | null;
    neto: Prisma.Decimal | number;
    iva?: Prisma.Decimal | number | null;
    tipo: string;
  },
) {
  if (!['FACTURA', 'ND', 'NC'].includes(doc.tipo)) return null;
  const monto = Number(doc.neto) + Number(doc.iva ?? 0);
  if (!(monto > 0)) return null;
  const venc = doc.fechaVencimiento ?? (() => {
    const d = new Date(doc.fecha);
    d.setDate(d.getDate() + 30);
    return d;
  })();
  const existing = await prisma.documentoAging.findFirst({
    where: { empresaId: doc.empresaId, documentoComercialId: doc.id },
  });
  const dias = diasAtraso(venc);
  const data = {
    tipo: 'POR_COBRAR' as const,
    documento: doc.folio,
    contraparte: doc.cliente,
    fechaEmision: doc.fecha,
    fechaVencimiento: venc,
    monto,
    saldo: existing ? Math.max(0, monto - Number(existing.montoPagado)) : monto,
    montoPagado: existing ? Number(existing.montoPagado) : 0,
    diasAtraso: dias,
    estado: agingEstado(dias),
    documentoComercialId: doc.id,
    semanaCompromiso: normalizeSemanaCompromiso(existing?.semanaCompromiso, venc),
  };
  if (existing) {
    return prisma.documentoAging.update({ where: { id: existing.id }, data });
  }
  return prisma.documentoAging.create({ data: { ...data, empresaId: doc.empresaId } });
}

export async function upsertAgingDesdeCompra(
  prisma: PrismaService | Prisma.TransactionClient,
  row: {
    id: string;
    empresaId: string;
    factura: string;
    proveedorFactura: string;
    monto: Prisma.Decimal | number;
    createdAt: Date;
    fechaDocumento?: Date | null;
    condicionPagoDias?: number | null;
  },
) {
  const monto = Number(row.monto);
  if (!(monto > 0)) return null;
  const existing = await prisma.documentoAging.findFirst({
    where: { empresaId: row.empresaId, registroCompraId: row.id },
  });
  const venc = existing?.fechaVencimiento
    ?? fechaVencimientoDesdeCondicion(row.fechaDocumento ?? row.createdAt, row.condicionPagoDias);
  const dias = diasAtraso(venc);
  const data = {
    tipo: 'POR_PAGAR' as const,
    documento: row.factura,
    contraparte: row.proveedorFactura,
    fechaEmision: row.createdAt,
    fechaVencimiento: venc,
    monto,
    saldo: existing ? Math.max(0, monto - Number(existing.montoPagado)) : monto,
    montoPagado: existing ? Number(existing.montoPagado) : 0,
    diasAtraso: dias,
    estado: agingEstado(dias),
    registroCompraId: row.id,
    semanaCompromiso: semanaCompromisoDesdeEmision(existing?.semanaCompromiso, row.createdAt, venc),
  };
  if (existing) {
    return prisma.documentoAging.update({ where: { id: existing.id }, data });
  }
  return prisma.documentoAging.create({ data: { ...data, empresaId: row.empresaId } });
}
