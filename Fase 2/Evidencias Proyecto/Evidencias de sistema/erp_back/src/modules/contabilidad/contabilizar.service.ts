import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type LineaAsientoInput = {
  debe: number;
  haber: number;
  cuentaId?: string;
  glosa?: string;
  centroCostoId?: string;
  areaNegocioId?: string;
  elementoCostoId?: string;
};

export type CreateAsientoInput = {
  empresaId: string;
  glosa: string;
  origen?: string;
  fecha?: Date | string;
  periodo?: string;
  tipo?: string;
  estado?: 'BORRADOR' | 'CONTABILIZADO' | 'ANULADO';
  numero?: string;
  lineas: LineaAsientoInput[];
};

function mapAsiento(row: {
  id: string;
  numero: string;
  periodo: string | null;
  fecha: Date;
  tipo: string;
  glosa: string;
  debe: Prisma.Decimal;
  haber: Prisma.Decimal;
  estado: string;
  origen: string | null;
  lineas: Prisma.JsonValue;
}) {
  return {
    id: row.id,
    numero: row.numero,
    periodo: row.periodo ?? undefined,
    fecha: row.fecha.toISOString().slice(0, 10),
    tipo: row.tipo || 'MANUAL',
    glosa: row.glosa,
    debe: Number(row.debe),
    haber: Number(row.haber),
    estado: row.estado,
    origen: row.origen ?? undefined,
    lineas: Array.isArray(row.lineas) ? row.lineas : [],
  };
}

const ESTADOS = new Set(['BORRADOR', 'CONTABILIZADO', 'ANULADO']);

@Injectable()
export class ContabilizarService {
  constructor(private prisma: PrismaService) {}

  /** Bloquea contabilización si el periodo no existe o está CERRADO (PC-04). */
  async assertPeriodoAbierto(
    empresaId: string,
    periodoCodigo: string,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const codigo = periodoCodigo.trim();
    if (!/^\d{4}-\d{2}$/.test(codigo)) {
      throw new BadRequestException(
        `Periodo contable inválido «${codigo}». Use formato aaaa-mm (ej. 2026-07).`,
      );
    }
    const row = await db.periodoContable.findUnique({
      where: { empresaId_codigo: { empresaId, codigo } },
    });
    if (!row) {
      throw new BadRequestException(
        `No existe el periodo contable ${codigo}. Créalo y déjalo ABIERTO antes de contabilizar.`,
      );
    }
    if (row.estado === 'CERRADO') {
      throw new BadRequestException(
        `El periodo ${codigo} está cerrado. Ábrelo o cambia al periodo activo antes de contabilizar.`,
      );
    }
  }

  /**
   * Valida cuadratura, periodo abierto y cuentas imputables/dimensiones
   * sin persistir. Comercial lo llama ANTES de emitir DTE a GoSocket.
   */
  async assertAsientoValido(
    input: CreateAsientoInput,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<{
    fecha: Date;
    periodo: string;
    estadoRaw: string;
    debe: number;
    haber: number;
  }> {
    if (!input.lineas?.length) {
      throw new BadRequestException('El asiento requiere al menos una línea');
    }
    const sinCuenta = input.lineas.some((l) => !l.cuentaId?.trim());
    if (sinCuenta) {
      throw new BadRequestException(
        'Todas las líneas del asiento deben tener cuenta contable (P0-1: sin cuenta rompe el mayor)',
      );
    }
    const debe = input.lineas.reduce((a, l) => a + Number(l.debe || 0), 0);
    const haber = input.lineas.reduce((a, l) => a + Number(l.haber || 0), 0);
    if (Math.round(debe * 100) !== Math.round(haber * 100)) {
      throw new BadRequestException(
        `Asiento descuadrado: debe=${debe} haber=${haber}`,
      );
    }
    const fecha =
      typeof input.fecha === 'string'
        ? new Date(input.fecha)
        : input.fecha ?? new Date();
    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException('Fecha de asiento inválida');
    }

    const year = fecha.getUTCFullYear();
    const periodo =
      input.periodo?.trim() ||
      `${year}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;

    const estadoRaw = (input.estado ?? 'CONTABILIZADO').toUpperCase();
    if (!ESTADOS.has(estadoRaw)) {
      throw new BadRequestException('estado inválido (BORRADOR|CONTABILIZADO|ANULADO)');
    }

    // PC-04: no contabilizar en periodo inexistente o cerrado
    if (estadoRaw === 'CONTABILIZADO') {
      await this.assertPeriodoAbierto(input.empresaId, periodo, db);
    }

    const cuentaIds = [...new Set(input.lineas.map((l) => l.cuentaId!))];
    const cuentas = await db.cuentaContable.findMany({
      where: { empresaId: input.empresaId, id: { in: cuentaIds } },
      include: {
        centrosCosto: { select: { centroCostoId: true } },
        elementosCosto: { select: { elementoCostoId: true } },
        areasNegocio: { select: { areaNegocioId: true } },
      },
    });
    if (cuentas.length !== cuentaIds.length) {
      throw new BadRequestException('Una o más cuentas no existen en la empresa');
    }
    const noOk = cuentas.find((c) => c.noImputable || !c.activa);
    if (noOk) {
      throw new BadRequestException(
        `Cuenta ${noOk.codigo} no es imputable o está inactiva`,
      );
    }
    const byId = new Map(cuentas.map((c) => [c.id, c]));
    for (const l of input.lineas) {
      const c = byId.get(l.cuentaId!);
      if (!c) continue;
      if (c.requiereCc) {
        const allowed = c.centrosCosto.map((x) => x.centroCostoId);
        if (!l.centroCostoId?.trim()) {
          throw new BadRequestException(`La cuenta ${c.codigo} exige centro de costo`);
        }
        if (allowed.length && !allowed.includes(l.centroCostoId)) {
          throw new BadRequestException(`Centro de costo no permitido para ${c.codigo}`);
        }
      }
      if (c.requiereElemento) {
        const allowed = c.elementosCosto.map((x) => x.elementoCostoId);
        if (!l.elementoCostoId?.trim()) {
          throw new BadRequestException(`La cuenta ${c.codigo} exige elemento de costo`);
        }
        if (allowed.length && !allowed.includes(l.elementoCostoId)) {
          throw new BadRequestException(`Elemento de costo no permitido para ${c.codigo}`);
        }
      }
      if (c.requiereArea) {
        const allowed = c.areasNegocio.map((x) => x.areaNegocioId);
        if (!l.areaNegocioId?.trim()) {
          throw new BadRequestException(`La cuenta ${c.codigo} exige área de negocio`);
        }
        if (allowed.length && !allowed.includes(l.areaNegocioId)) {
          throw new BadRequestException(`Área de negocio no permitida para ${c.codigo}`);
        }
      }
    }

    return { fecha, periodo, estadoRaw, debe, haber };
  }

  async createAsiento(
    input: CreateAsientoInput,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const { fecha, periodo, estadoRaw, debe, haber } = await this.assertAsientoValido(
      input,
      db,
    );

    const year = fecha.getUTCFullYear();
    let numero = input.numero?.trim();
    if (!numero) {
      // Prefijo aaaa + correlativo; usar MAX y no count (tras deletes el count colisiona).
      const prefix = String(year);
      const last = await db.asiento.findFirst({
        where: { empresaId: input.empresaId, numero: { startsWith: prefix } },
        orderBy: { numero: 'desc' },
        select: { numero: true },
      });
      const lastSeq = last?.numero?.startsWith(prefix)
        ? Number(last.numero.slice(prefix.length))
        : 0;
      const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
      numero = `${prefix}${String(next).padStart(4, '0')}`;
    }

    try {
      const row = await db.asiento.create({
        data: {
          numero,
          periodo,
          fecha,
          tipo: (input.tipo?.trim() || 'MANUAL').toUpperCase(),
          glosa: input.glosa,
          debe,
          haber,
          estado: estadoRaw as 'BORRADOR' | 'CONTABILIZADO' | 'ANULADO',
          origen: input.origen ?? null,
          lineas: input.lineas as unknown as Prisma.InputJsonValue,
          empresaId: input.empresaId,
        },
      });
      return mapAsiento(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException(`Ya existe el asiento número ${numero}`);
      }
      throw e;
    }
  }

  async createAsientoReversa(
    empresaId: string,
    asientoOriginalId: string,
    glosa: string,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const orig = await db.asiento.findUnique({
      where: { id: asientoOriginalId },
    });
    if (!orig || orig.empresaId !== empresaId) {
      throw new BadRequestException('Asiento original no encontrado');
    }
    const lineas = (orig.lineas as LineaAsientoInput[]).map((l) => ({
      debe: Number(l.haber || 0),
      haber: Number(l.debe || 0),
      cuentaId: l.cuentaId,
      glosa: l.glosa,
      centroCostoId: l.centroCostoId,
      areaNegocioId: l.areaNegocioId,
      elementoCostoId: l.elementoCostoId,
    }));
    return this.createAsiento(
      {
        empresaId,
        glosa,
        origen: `REVERSA:${orig.numero}`,
        periodo: orig.periodo ?? undefined,
        tipo: orig.tipo || 'MANUAL',
        lineas,
      },
      db,
    );
  }
}
