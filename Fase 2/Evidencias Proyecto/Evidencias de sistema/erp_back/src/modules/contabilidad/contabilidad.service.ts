import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../auth/jwt.strategy';
import {
  assertTenantAccess,
  resolveOperationalEmpresa,
  resolveTenant,
} from '../../auth/tenant.util';
import { ContabilizarService } from './contabilizar.service';
import { assertCuentaImputable } from './cuenta-imputable.util';
import {
  BulkCuentasDto,
  CentralizacionDto,
  CreateAsientoDto,
  CreateCategoriaDto,
  AbrirPeriodoContableDto,
  CreatePeriodoContableDto,
  UpdateCuentaDto,
  UpdatePeriodoContableDto,
  UpsertConfigContableSiiDto,
  ConfigContableSiiItemDto,
  UpsertCuentaDto,
  UpsertAreaNegocioDto,
  UpsertElementoCostoDto,
  ImportElementosCostoExcelDto,
  UpsertFactorHonorarioDto,
} from './dto/contabilidad.dto';
import { parseCodigoNombreWorkbook } from '../catalogos/catalog-excel.util';
import { clasificarFilaImport } from '../catalogos/catalog-excel-merge.util';
import { registrarCatalogoImportacion } from '../catalogos/catalogo-importacion.util';
import {
  assertCodigoCatalogoInmutable,
  assertCodigoCatalogoNuevo,
  normalizeNombreCatalogo,
} from '../catalogos/catalog-codigo.util';
import { avisoMaestrosFaltantes } from './plan-cuentas-import-aviso.util';
import { ContratistasService } from '../contratistas/contratistas.service';

const TIPOS = new Set(['ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO']);
const CODIGO_RE = /^\d-\d-\d{2}-\d{2}(-\d{3})?$/;

type CuentaRow = {
  id: string;
  codigo: string;
  codigoExcel: string | null;
  nombre: string;
  tipo: string;
  nivel: number;
  padreId: string | null;
  activa: boolean;
  requiereCc: boolean;
  requiereArea: boolean;
  requiereEspecie: boolean;
  requiereElemento: boolean;
  noImputable: boolean;
};

function mapCuenta(row: CuentaRow & {
  centrosCosto?: { centroCostoId: string }[];
  elementosCosto?: { elementoCostoId: string }[];
  areasNegocio?: { areaNegocioId: string }[];
}) {
  return {
    id: row.id,
    codigo: row.codigo,
    codigoExcel: row.codigoExcel ?? undefined,
    nombre: row.nombre,
    tipo: row.tipo,
    nivel: row.nivel,
    padreId: row.padreId ?? undefined,
    activa: row.activa,
    requiereCc: row.requiereCc,
    requiereArea: row.requiereArea,
    requiereEspecie: row.requiereEspecie,
    requiereElemento: row.requiereElemento,
    noImputable: row.noImputable,
    esImputable: !row.noImputable,
    centroCostoIds: (row.centrosCosto ?? []).map((x) => x.centroCostoId),
    elementoCostoIds: (row.elementosCosto ?? []).map((x) => x.elementoCostoId),
    areaNegocioIds: (row.areasNegocio ?? []).map((x) => x.areaNegocioId),
  };
}

function normalizeCodigo(raw: string) {
  return raw.trim().replace(/\s+/g, '');
}

function inferNivelFromCodigo(codigo: string): number {
  const parts = codigo.split('-');
  if (parts.length === 5) return 5;
  if (parts.length !== 4) return 1;
  const [, b, c, d] = parts;
  if (b === '0' && c === '00' && d === '00') return 1;
  if (c === '00' && d === '00') return 2;
  if (d === '00') return 3;
  return 4;
}

/** Padre inmediato por truncado UI X-X-XX-XX. */
export function inferPadreCodigoUi(codigo: string): string | null {
  const parts = codigo.split('-');
  if (parts.length >= 5) return parts.slice(0, 4).join('-');
  if (parts.length !== 4) return null;
  const [a, b, c, d] = parts;
  if (b === '0' && c === '00' && d === '00') return null;
  if (c === '00' && d === '00') return `${a}-0-00-00`;
  if (d === '00') return `${a}-${b}-00-00`;
  return `${a}-${b}-${c}-00`;
}

/** Candidatos de padre: el del Excel y, si falta ese código, el grupo de más arriba. */
export function climbPadreCodigos(codigo: string, padreExcel?: string | null): string[] {
  const out: string[] = [];
  const push = (c: string | null | undefined) => {
    const n = c?.trim();
    if (n && !out.includes(n)) out.push(n);
  };
  push(padreExcel);
  let cur = inferPadreCodigoUi(codigo);
  while (cur) {
    push(cur);
    const next = inferPadreCodigoUi(cur);
    if (!next || next === cur) break;
    cur = next;
  }
  return out;
}

function tipoFromDigito(digito: number): 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'GASTO' {
  if (digito === 1) return 'ACTIVO';
  if (digito === 2) return 'PASIVO';
  if (digito === 3 || digito === 4) return 'PATRIMONIO';
  if (digito === 5) return 'INGRESO';
  return 'GASTO';
}

/** La pantalla de mapeo necesita saber qué dimensión exige cada cuenta. */
const CONFIG_SII_CUENTA_SELECT = {
  codigo: true,
  nombre: true,
  requiereCc: true,
  requiereArea: true,
  requiereElemento: true,
} as const;

@Injectable()
export class ContabilidadService {
  constructor(
    private prisma: PrismaService,
    private contabilizar: ContabilizarService,
    @Optional()
    @Inject(forwardRef(() => ContratistasService))
    private contratistas?: ContratistasService,
  ) {}

  async getCuentas(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
    tree?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.cuentaContable.findMany({
      where: { empresaId },
      orderBy: [{ codigo: 'asc' }],
      include: {
        centrosCosto: { select: { centroCostoId: true } },
        elementosCosto: { select: { elementoCostoId: true } },
        areasNegocio: { select: { areaNegocioId: true } },
      },
    });
    const flat = rows.map(mapCuenta);
    if (tree === '1' || tree === 'true') {
      return this.buildTree(flat);
    }
    return flat;
  }

  private buildTree(
    flat: ReturnType<typeof mapCuenta>[],
  ): Array<ReturnType<typeof mapCuenta> & { children: unknown[] }> {
    type Node = ReturnType<typeof mapCuenta> & { children: Node[] };
    const byId = new Map<string, Node>();
    for (const r of flat) {
      byId.set(r.id, { ...r, children: [] });
    }
    const roots: Node[] = [];
    for (const node of byId.values()) {
      if (node.padreId && byId.has(node.padreId)) {
        byId.get(node.padreId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  private assertCodigo(codigo: string) {
    const c = normalizeCodigo(codigo);
    if (!CODIGO_RE.test(c)) {
      throw new BadRequestException(
        'código inválido: use formato X-X-XX-XX o X-X-XX-XX-XXX (ej. 1-1-01-01)',
      );
    }
    return c;
  }

  private assertTipo(tipoRaw: string) {
    const tipo = tipoRaw.toUpperCase();
    if (!TIPOS.has(tipo)) throw new BadRequestException('tipo de cuenta inválido');
    return tipo as 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'GASTO';
  }

  private async assertPadre(
    empresaId: string,
    padreId: string | null | undefined,
    selfId?: string,
  ) {
    if (!padreId) return null;
    const padre = await this.prisma.cuentaContable.findUnique({ where: { id: padreId } });
    if (!padre || padre.empresaId !== empresaId) {
      throw new BadRequestException('padreId no pertenece a la empresa');
    }
    if (selfId && padreId === selfId) {
      throw new BadRequestException('una cuenta no puede ser padre de sí misma');
    }
    return padre;
  }

  async createCuenta(user: JwtPayload, dto: UpsertCuentaDto, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const codigo = this.assertCodigo(dto.codigo);
    const tipo = this.assertTipo(dto.tipo);
    const padre = await this.assertPadre(empresaId, dto.padreId);
    const nivel = dto.nivel ?? (padre ? padre.nivel + 1 : inferNivelFromCodigo(codigo));
    if (nivel < 1 || nivel > 5) throw new BadRequestException('nivel debe ser 1–5');
    if (padre && nivel <= padre.nivel) {
      throw new BadRequestException('nivel del hijo debe ser mayor al del padre');
    }
    const noImputable = dto.noImputable ?? nivel < 5;
    try {
      const row = await this.prisma.cuentaContable.create({
        data: {
          codigo,
          codigoExcel: dto.codigoExcel?.trim() || null,
          nombre: dto.nombre.trim(),
          tipo,
          nivel,
          padreId: padre?.id ?? null,
          activa: dto.activa ?? true,
          requiereCc: dto.requiereCc ?? false,
          requiereArea: dto.requiereArea ?? false,
          requiereEspecie: dto.requiereEspecie ?? false,
          requiereElemento: dto.requiereElemento ?? false,
          noImputable,
          empresaId,
        },
      });
      await this.syncCuentaVinculos(empresaId, row.id, dto);
      return this.getCuentaMapped(row.id);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una cuenta con ese código');
      }
      throw e;
    }
  }

  async createCategoria(user: JwtPayload, dto: CreateCategoriaDto, empresaHeader?: string) {
    const digito = dto.digito;
    const codigo = `${digito}-0-00-00`;
    const tipo = this.assertTipo(dto.tipo ?? tipoFromDigito(digito));
    return this.createCuenta(
      user,
      {
        codigo,
        nombre: dto.nombre,
        tipo,
        nivel: 1,
        padreId: null,
        noImputable: true,
      },
      empresaHeader,
    );
  }

  async updateCuenta(
    user: JwtPayload,
    id: string,
    dto: UpdateCuentaDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const existing = await this.findCuentaOrFail(id);
    if (existing.empresaId !== empresaId) {
      throw new NotFoundException('Cuenta no encontrada');
    }

    const codigo = dto.codigo !== undefined ? this.assertCodigo(dto.codigo) : undefined;
    const tipo = dto.tipo !== undefined ? this.assertTipo(dto.tipo) : undefined;
    const padreId =
      dto.padreId === undefined ? undefined : dto.padreId === null || dto.padreId === ''
        ? null
        : dto.padreId;
    if (padreId !== undefined) {
      await this.assertPadre(empresaId, padreId, id);
    }

    try {
      const row = await this.prisma.cuentaContable.update({
        where: { id },
        data: {
          ...(codigo !== undefined ? { codigo } : {}),
          ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
          ...(tipo !== undefined ? { tipo } : {}),
          ...(dto.nivel !== undefined ? { nivel: dto.nivel } : {}),
          ...(padreId !== undefined ? { padreId } : {}),
          ...(dto.codigoExcel !== undefined
            ? { codigoExcel: dto.codigoExcel?.trim() || null }
            : {}),
          ...(dto.activa !== undefined ? { activa: dto.activa } : {}),
          ...(dto.requiereCc !== undefined ? { requiereCc: dto.requiereCc } : {}),
          ...(dto.requiereArea !== undefined ? { requiereArea: dto.requiereArea } : {}),
          ...(dto.requiereEspecie !== undefined ? { requiereEspecie: dto.requiereEspecie } : {}),
          ...(dto.requiereElemento !== undefined
            ? { requiereElemento: dto.requiereElemento }
            : {}),
          ...(dto.noImputable !== undefined ? { noImputable: dto.noImputable } : {}),
        },
      });
      await this.syncCuentaVinculos(empresaId, id, dto);
      return this.getCuentaMapped(id);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una cuenta con ese código');
      }
      throw e;
    }
  }

  async deleteCuenta(user: JwtPayload, id: string, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const existing = await this.findCuentaOrFail(id);
    if (existing.empresaId !== empresaId) {
      throw new NotFoundException('Cuenta no encontrada');
    }
    const impacto = await this.buildCuentaImpacto(empresaId, id);
    throw new ConflictException({
      message: 'Las cuentas no se eliminan. Deshabilítelas para conservar el histórico.',
      hint: 'PATCH activa=false',
      impacto,
    });
  }

  async deletePlanCuentas(user: JwtPayload, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    throw new ConflictException({
      message: 'No se elimina el plan completo. Deshabilite cuentas de forma individual.',
      empresaId,
    });
  }

  /** Solo import/carga masiva con replace=true. No exponer como acción de UI. */
  private async wipePlanCuentas(empresaId: string) {
    const [asientos, configsSii] = await Promise.all([
      this.prisma.asiento.count({ where: { empresaId } }),
      this.prisma.configContableSii.count({ where: { empresaId } }),
    ]);
    if (asientos > 0 || configsSii > 0) {
      throw new ConflictException({
        message:
          'No se puede borrar el plan de cero: hay asientos o cuentas ya usadas (por ejemplo mapeo SII). Para agrupar, importe sin borrar y elija “Armar el árbol”.',
        asientos,
        configsSii,
      });
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.cuentaCentroCosto.deleteMany({ where: { empresaId } });
        await tx.cuentaElementoCosto.deleteMany({ where: { empresaId } });
        await tx.cuentaAreaNegocio.deleteMany({ where: { empresaId } });
        const rows = await tx.cuentaContable.findMany({
          where: { empresaId },
          select: { id: true, nivel: true },
          orderBy: { nivel: 'desc' },
        });
        for (const r of rows) {
          await tx.cuentaContable.delete({ where: { id: r.id } });
        }
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new ConflictException({
          message:
            'No se puede borrar el plan de cero: hay cuentas en uso. Para agrupar, importe sin borrar y elija “Armar el árbol”.',
        });
      }
      throw e;
    }
  }

  async bulkCuentas(user: JwtPayload, dto: BulkCuentasDto, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    if (!dto.items?.length) throw new BadRequestException('items vacío');

    if (dto.replace) {
      await this.wipePlanCuentas(empresaId);
    }

    const actualizarAnidacion = dto.actualizarAnidacion === true;
    const aplicarFlags = dto.aplicarFlags === true;
    const vinculos = dto.vinculos ?? 'conservar';

    const items = [...dto.items].sort(
      (a, b) => (a.nivel ?? inferNivelFromCodigo(a.codigo)) - (b.nivel ?? inferNivelFromCodigo(b.codigo)),
    );

    const existing = await this.prisma.cuentaContable.findMany({
      where: { empresaId },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        nivel: true,
        padreId: true,
        requiereCc: true,
        requiereArea: true,
        requiereEspecie: true,
        requiereElemento: true,
        noImputable: true,
        centrosCosto: { select: { centroCostoId: true } },
        elementosCosto: { select: { elementoCostoId: true } },
        areasNegocio: { select: { areaNegocioId: true } },
      },
    });
    const byCodigo = new Map(existing.map((e) => [e.codigo, e.id]));
    const byId = new Map(existing.map((e) => [e.id, e]));
    const padreCodigoOf = (padreId: string | null) =>
      padreId ? (byId.get(padreId)?.codigo ?? null) : null;

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const resumen: Array<{ codigo: string; cambios: string[] }> = [];
    const batchIds: string[] = [];

    for (const item of items) {
      const codigo = this.assertCodigo(item.codigo);
      const tipo = this.assertTipo(item.tipo);
      const nivelIncoming = item.nivel ?? inferNivelFromCodigo(codigo);
      const padreCodigoRaw =
        item.padreCodigo?.trim()
        || (() => {
          const parts = codigo.split('-');
          if (parts.length >= 5) return parts.slice(0, 4).join('-');
          if (parts.length !== 4) return null;
          const [a, b, c, d] = parts;
          if (b === '0' && c === '00' && d === '00') return null;
          if (c === '00' && d === '00') return `${a}-0-00-00`;
          if (d === '00') return `${a}-${b}-00-00`;
          return `${a}-${b}-${c}-00`;
        })();
      const existingId = byCodigo.get(codigo);
      const padreIdResolved = (() => {
        for (const cand of climbPadreCodigos(codigo, padreCodigoRaw)) {
          const id = byCodigo.get(normalizeCodigo(cand));
          if (id && id !== existingId) return id;
        }
        return null;
      })();
      const prev = existingId ? byId.get(existingId) : undefined;
      const isNew = !existingId;
      const nivel = isNew || actualizarAnidacion ? nivelIncoming : (prev?.nivel ?? nivelIncoming);
      const padreId = isNew || actualizarAnidacion ? padreIdResolved : (prev?.padreId ?? null);
      const noImputable = item.noImputable ?? (isNew ? nivel < 5 : prev?.noImputable ?? nivel < 5);

      const data: {
        codigo: string;
        codigoExcel?: string | null;
        nombre: string;
        tipo: typeof tipo;
        nivel?: number;
        padreId?: string | null;
        activa?: boolean;
        requiereCc?: boolean;
        requiereArea?: boolean;
        requiereEspecie?: boolean;
        requiereElemento?: boolean;
        noImputable?: boolean;
        empresaId: string;
      } = {
        codigo,
        nombre: item.nombre.trim(),
        tipo,
        empresaId,
      };
      if (item.codigoExcel !== undefined) data.codigoExcel = item.codigoExcel?.trim() || null;
      if (isNew || actualizarAnidacion) {
        data.nivel = nivel;
        data.padreId = padreId;
      }
      if (item.activa !== undefined) data.activa = item.activa;
      if (isNew) {
        data.nivel = nivel;
        data.padreId = padreId;
        data.activa = item.activa ?? true;
        data.requiereCc = item.requiereCc ?? false;
        data.requiereArea = item.requiereArea ?? false;
        data.requiereEspecie = item.requiereEspecie ?? false;
        data.requiereElemento = item.requiereElemento ?? false;
        data.noImputable = noImputable;
      } else {
        if (aplicarFlags && item.requiereCc !== undefined) data.requiereCc = item.requiereCc;
        if (aplicarFlags && item.requiereArea !== undefined) data.requiereArea = item.requiereArea;
        if (aplicarFlags && item.requiereEspecie !== undefined) data.requiereEspecie = item.requiereEspecie;
        if (aplicarFlags && item.requiereElemento !== undefined) data.requiereElemento = item.requiereElemento;
        if (item.noImputable !== undefined) data.noImputable = item.noImputable;
      }

      const cambios: string[] = [];
      if (prev) {
        if (data.nombre !== prev.nombre) cambios.push(`Nombre: ${prev.nombre} → ${data.nombre}`);
        if (actualizarAnidacion && nivel !== prev.nivel) cambios.push(`Nivel: ${prev.nivel} → ${nivel}`);
        if (actualizarAnidacion && padreId !== prev.padreId) {
          cambios.push(
            `Padre: ${padreCodigoOf(prev.padreId) ?? '(vacío)'} → ${padreCodigoOf(padreId) ?? (padreCodigoRaw || '(vacío)')}`,
          );
        }
        if (data.requiereCc !== undefined && data.requiereCc !== prev.requiereCc) {
          cambios.push(`CC: ${prev.requiereCc} → ${data.requiereCc}`);
        }
        if (data.requiereElemento !== undefined && data.requiereElemento !== prev.requiereElemento) {
          cambios.push(`EC: ${prev.requiereElemento} → ${data.requiereElemento}`);
        }
        if (data.requiereArea !== undefined && data.requiereArea !== prev.requiereArea) {
          cambios.push(`Área: ${prev.requiereArea} → ${data.requiereArea}`);
        }
      }

      let cuentaId = existingId;
      if (isNew) {
        const row = await this.prisma.cuentaContable.create({ data });
        byCodigo.set(codigo, row.id);
        cuentaId = row.id;
        created += 1;
      } else if (!cambios.length) {
        unchanged += 1;
        cuentaId = existingId;
      } else {
        await this.prisma.cuentaContable.update({ where: { id: existingId }, data });
        updated += 1;
        if (cambios.length) resumen.push({ codigo, cambios });
      }
      if (cuentaId) {
        batchIds.push(cuentaId);
        byId.set(cuentaId, {
          id: cuentaId,
          codigo,
          nombre: data.nombre,
          nivel,
          padreId: padreId ?? null,
          requiereCc: data.requiereCc ?? prev?.requiereCc ?? false,
          requiereArea: data.requiereArea ?? prev?.requiereArea ?? false,
          requiereEspecie: data.requiereEspecie ?? prev?.requiereEspecie ?? false,
          requiereElemento: data.requiereElemento ?? prev?.requiereElemento ?? false,
          noImputable,
          centrosCosto: prev?.centrosCosto ?? [],
          elementosCosto: prev?.elementosCosto ?? [],
          areasNegocio: prev?.areasNegocio ?? [],
        });
        await this.applyVinculosImport(empresaId, cuentaId, item, vinculos, {
          requiereCc: data.requiereCc ?? prev?.requiereCc ?? false,
          requiereArea: data.requiereArea ?? prev?.requiereArea ?? false,
          requiereElemento: data.requiereElemento ?? prev?.requiereElemento ?? false,
        });
      }
    }

    if (vinculos === 'arrastrar_padre') {
      await this.arrastrarVinculosPadre(empresaId, batchIds, byId);
    }

    await registrarCatalogoImportacion(this.prisma, {
      empresaId,
      user,
      tipo: 'PLAN_CUENTAS',
      archivoNombre: dto.archivoNombre,
      created,
      updated,
      unchanged,
      politicas: { actualizarAnidacion, aplicarFlags, vinculos, replace: Boolean(dto.replace) },
      resumen,
    });

    return { ok: true, created, updated, unchanged, total: items.length };
  }

  private async resolveCodigosToIds(
    empresaId: string,
    kind: 'cc' | 'ec' | 'an',
    codigos: string[] | undefined,
  ): Promise<string[] | undefined> {
    if (!codigos?.length) return undefined;
    const uniq = [...new Set(codigos.map((c) => c.trim().toUpperCase()).filter(Boolean))];
    if (kind === 'cc') {
      const found = await this.prisma.centroCosto.findMany({
        where: { empresaId, codigo: { in: uniq } },
        select: { id: true, codigo: true },
      });
      if (found.length !== uniq.length) {
        const have = new Set(found.map((f) => f.codigo));
        const missing = uniq.filter((c) => !have.has(c));
        throw new BadRequestException(`Centro de costo no existe en el maestro: ${missing.join(', ')}`);
      }
      return found.map((f) => f.id);
    }
    if (kind === 'ec') {
      const found = await this.prisma.elementoCosto.findMany({
        where: { empresaId, codigo: { in: uniq } },
        select: { id: true, codigo: true },
      });
      if (found.length !== uniq.length) {
        const have = new Set(found.map((f) => f.codigo));
        const missing = uniq.filter((c) => !have.has(c));
        throw new BadRequestException(`Elemento de costo no existe en el maestro: ${missing.join(', ')}`);
      }
      return found.map((f) => f.id);
    }
    const found = await this.prisma.areaNegocio.findMany({
      where: { empresaId, codigo: { in: uniq } },
      select: { id: true, codigo: true },
    });
    if (found.length !== uniq.length) {
      const have = new Set(found.map((f) => f.codigo));
      const missing = uniq.filter((c) => !have.has(c));
      throw new BadRequestException(`Área de negocio no existe en el maestro: ${missing.join(', ')}`);
    }
    return found.map((f) => f.id);
  }

  private async applyVinculosImport(
    empresaId: string,
    cuentaId: string,
    item: BulkCuentasDto['items'][number],
    vinculos: NonNullable<BulkCuentasDto['vinculos']>,
    flags: { requiereCc: boolean; requiereArea: boolean; requiereElemento: boolean },
  ) {
    if (vinculos === 'conservar' || vinculos === 'arrastrar_padre') return;
    if (vinculos === 'quitar_si_flag_off') {
      await this.syncCuentaVinculos(empresaId, cuentaId, {
        centroCostoIds: flags.requiereCc ? undefined : [],
        elementoCostoIds: flags.requiereElemento ? undefined : [],
        areaNegocioIds: flags.requiereArea ? undefined : [],
      });
      return;
    }
    if (vinculos === 'desde_excel') {
      await this.syncCuentaVinculos(empresaId, cuentaId, {
        centroCostoIds: await this.resolveCodigosToIds(empresaId, 'cc', item.centroCostoCodigos),
        elementoCostoIds: await this.resolveCodigosToIds(empresaId, 'ec', item.elementoCostoCodigos),
        areaNegocioIds: await this.resolveCodigosToIds(empresaId, 'an', item.areaNegocioCodigos),
      });
    }
  }

  private async arrastrarVinculosPadre(
    empresaId: string,
    batchIds: string[],
    byId: Map<string, { padreId: string | null }>,
  ) {
    const [ccs, ecs, ans] = await Promise.all([
      this.prisma.cuentaCentroCosto.findMany({ where: { empresaId }, select: { cuentaId: true, centroCostoId: true } }),
      this.prisma.cuentaElementoCosto.findMany({ where: { empresaId }, select: { cuentaId: true, elementoCostoId: true } }),
      this.prisma.cuentaAreaNegocio.findMany({ where: { empresaId }, select: { cuentaId: true, areaNegocioId: true } }),
    ]);
    const ccBy = new Map<string, string[]>();
    const ecBy = new Map<string, string[]>();
    const anBy = new Map<string, string[]>();
    for (const r of ccs) {
      const arr = ccBy.get(r.cuentaId) ?? [];
      arr.push(r.centroCostoId);
      ccBy.set(r.cuentaId, arr);
    }
    for (const r of ecs) {
      const arr = ecBy.get(r.cuentaId) ?? [];
      arr.push(r.elementoCostoId);
      ecBy.set(r.cuentaId, arr);
    }
    for (const r of ans) {
      const arr = anBy.get(r.cuentaId) ?? [];
      arr.push(r.areaNegocioId);
      anBy.set(r.cuentaId, arr);
    }
    for (const id of batchIds) {
      const padreId = byId.get(id)?.padreId;
      if (!padreId) continue;
      const centroCostoIds = ccBy.get(padreId) ?? [];
      const elementoCostoIds = ecBy.get(padreId) ?? [];
      const areaNegocioIds = anBy.get(padreId) ?? [];
      await this.syncCuentaVinculos(empresaId, id, { centroCostoIds, elementoCostoIds, areaNegocioIds });
      ccBy.set(id, centroCostoIds);
      ecBy.set(id, elementoCostoIds);
      anBy.set(id, areaNegocioIds);
    }
  }


  async getAsientos(user: JwtPayload, empresaHeader?: string, empresaQuery?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.asiento.findMany({
      where: { empresaId },
      orderBy: { fecha: 'desc' },
    });
    const cuentaIds = new Set<string>();
    for (const r of rows) {
      const arr = Array.isArray(r.lineas) ? (r.lineas as Array<Record<string, unknown>>) : [];
      for (const l of arr) {
        if (typeof l.cuentaId === 'string') cuentaIds.add(l.cuentaId);
      }
    }
    const cuentas = cuentaIds.size
      ? await this.prisma.cuentaContable.findMany({
          where: { id: { in: [...cuentaIds] } },
          select: { id: true, codigo: true, nombre: true },
        })
      : [];
    const cmap = new Map(cuentas.map((c) => [c.id, c]));
    return rows.map((r) => {
      const arr = Array.isArray(r.lineas) ? (r.lineas as Array<Record<string, unknown>>) : [];
      const lineas = arr.map((l) => {
        const cid = typeof l.cuentaId === 'string' ? l.cuentaId : undefined;
        const c = cid ? cmap.get(cid) : undefined;
        return {
          ...l,
          cuentaId: cid,
          cuentaCodigo: c?.codigo,
          cuentaNombre: c?.nombre,
        };
      });
      return {
        id: r.id,
        numero: r.numero,
        periodo: r.periodo ?? undefined,
        fecha: r.fecha.toISOString().slice(0, 10),
        tipo: r.tipo || 'MANUAL',
        glosa: r.glosa,
        debe: Number(r.debe),
        haber: Number(r.haber),
        estado: r.estado,
        origen: r.origen ?? undefined,
        lineas,
      };
    });
  }

  async createAsientoManual(
    user: JwtPayload,
    dto: CreateAsientoDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const estado = dto.estado?.toUpperCase() as
      | 'BORRADOR'
      | 'CONTABILIZADO'
      | 'ANULADO'
      | undefined;
    return this.contabilizar.createAsiento({
      empresaId,
      glosa: dto.glosa,
      origen: dto.origen,
      fecha: dto.fecha,
      periodo: dto.periodo,
      tipo: dto.tipo,
      estado,
      numero: dto.numero,
      lineas: dto.lineas,
    });
  }

  async updateAsiento(
    user: JwtPayload,
    id: string,
    dto: CreateAsientoDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const existing = await this.prisma.asiento.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Asiento no encontrado');
    if (existing.empresaId !== empresaId) {
      throw new BadRequestException('Asiento no pertenece a la empresa operativa');
    }
    if (existing.estado === 'ANULADO') {
      throw new BadRequestException('No se puede editar un asiento anulado');
    }

    const estado = (dto.estado?.toUpperCase() || existing.estado) as
      | 'BORRADOR'
      | 'CONTABILIZADO'
      | 'ANULADO';

    // P0-2: un asiento ya CONTABILIZADO no se edita in-place (montos/cuentas/
    // glosa). La única transición válida es anular, y anular genera de forma
    // automática el asiento de reverso formal (contrapartida real, no un
    // simple cambio de estado).
    if (existing.estado === 'CONTABILIZADO') {
      if (estado !== 'ANULADO') {
        throw new BadRequestException(
          'El asiento ya está contabilizado: no se puede editar. Anúlalo (genera reverso formal) o crea un asiento de ajuste nuevo.',
        );
      }
      const reversa = await this.contabilizar.createAsientoReversa(
        empresaId,
        existing.id,
        dto.glosa?.trim() || `Reverso por anulación de ${existing.numero}`,
      );
      const anulado = await this.prisma.asiento.update({
        where: { id },
        data: { estado: 'ANULADO' },
      });
      return {
        id: anulado.id,
        numero: anulado.numero,
        periodo: anulado.periodo ?? undefined,
        fecha: anulado.fecha.toISOString().slice(0, 10),
        tipo: anulado.tipo || 'MANUAL',
        glosa: anulado.glosa,
        debe: Number(anulado.debe),
        haber: Number(anulado.haber),
        estado: anulado.estado,
        origen: anulado.origen ?? undefined,
        lineas: Array.isArray(anulado.lineas) ? anulado.lineas : [],
        reversaNumero: reversa.numero,
      };
    }

    const debe = dto.lineas.reduce((a, l) => a + (Number(l.debe) || 0), 0);
    const haber = dto.lineas.reduce((a, l) => a + (Number(l.haber) || 0), 0);
    if (Math.round(debe * 100) !== Math.round(haber * 100) || debe <= 0) {
      throw new BadRequestException(`Asiento descuadrado: debe=${debe} haber=${haber}`);
    }

    const periodo = dto.periodo?.trim() || existing.periodo || undefined;
    if (estado === 'CONTABILIZADO' && periodo) {
      await this.contabilizar.assertPeriodoAbierto(empresaId, periodo);
    }

    const row = await this.prisma.asiento.update({
      where: { id },
      data: {
        glosa: dto.glosa.trim(),
        origen: dto.origen?.trim() || existing.origen,
        fecha: dto.fecha ? new Date(dto.fecha) : existing.fecha,
        periodo: periodo ?? existing.periodo,
        tipo: dto.tipo?.trim() || existing.tipo,
        estado,
        ...(dto.numero?.trim() ? { numero: dto.numero.trim() } : {}),
        debe,
        haber,
        lineas: dto.lineas as object,
      },
    });

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

  async bulkAsientos(
    user: JwtPayload,
    dto: { items: CreateAsientoDto[] },
    empresaHeader?: string,
  ) {
    const created: Array<{ id: string; numero: string }> = [];
    const errors: Array<{ index: number; message: string }> = [];
    for (let i = 0; i < dto.items.length; i++) {
      try {
        const row = await this.createAsientoManual(user, dto.items[i], empresaHeader);
        created.push({ id: row.id, numero: row.numero });
      } catch (e) {
        errors.push({
          index: i,
          message: e instanceof Error ? e.message : 'Error',
        });
      }
    }
    return { created: created.length, errors, items: created };
  }

  async previewPlanExcel(
    user: JwtPayload,
    file: Express.Multer.File | undefined,
    empresaHeader?: string,
    aplicarArrastre = false,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Archivo .xlsx requerido (campo file)');
    }
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const XLSX = await import('xlsx');
    const { parsePlanDeCuentasWorkbook } = await import('./plan-cuentas-excel.util');
    let parsed;
    try {
      parsed = parsePlanDeCuentasWorkbook(XLSX, file.buffer, { aplicarArrastre });
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Excel inválido');
    }
    const itemsParsed = parsed.items;

    const [existing, centrosCount, elementosCount, areasCount] = await Promise.all([
      this.prisma.cuentaContable.findMany({
        where: { empresaId },
        select: {
          id: true,
          codigo: true,
          codigoExcel: true,
          nombre: true,
          nivel: true,
          padreId: true,
          requiereCc: true,
          requiereArea: true,
          requiereEspecie: true,
          requiereElemento: true,
          centrosCosto: { select: { centroCostoId: true } },
          elementosCosto: { select: { elementoCostoId: true } },
          areasNegocio: { select: { areaNegocioId: true } },
        },
      }),
      this.prisma.centroCosto.count({ where: { empresaId } }),
      this.prisma.elementoCosto.count({ where: { empresaId } }),
      this.prisma.areaNegocio.count({ where: { empresaId } }),
    ]);
    const byCodigo = new Map(existing.map((e) => [e.codigo, e]));
    const codigoById = new Map(existing.map((e) => [e.id, e.codigo]));
    const fields = [
      { key: 'nombre' as const, label: 'Nombre' },
      { key: 'nivel' as const, label: 'Nivel' },
      { key: 'padreCodigo' as const, label: 'Padre' },
      { key: 'requiereCc' as const, label: 'CC' },
      { key: 'requiereElemento' as const, label: 'EC' },
      { key: 'requiereArea' as const, label: 'Área' },
    ];

    const items = itemsParsed.map((it) => {
      const prev = byCodigo.get(it.codigo);
      const padreActual = prev?.padreId ? (codigoById.get(prev.padreId) ?? null) : null;
      const { accion, cambios } = clasificarFilaImport(
        {
          nombre: it.nombre,
          nivel: it.nivel,
          padreCodigo: it.padreCodigo,
          requiereCc: it.requiereCc,
          requiereElemento: it.requiereElemento,
          requiereArea: it.requiereArea,
        },
        prev
          ? {
              nombre: prev.nombre,
              nivel: prev.nivel,
              padreCodigo: padreActual,
              requiereCc: prev.requiereCc,
              requiereElemento: prev.requiereElemento,
              requiereArea: prev.requiereArea,
            }
          : undefined,
        fields,
      );
      return {
        ...it,
        padreActual,
        vinculosCount:
          (prev?.centrosCosto.length ?? 0)
          + (prev?.elementosCosto.length ?? 0)
          + (prev?.areasNegocio.length ?? 0),
        accion,
        cambios,
      };
    });
    const duplicados = items.filter((it) => it.accion !== 'NUEVO');

    return {
      ok: true,
      total: items.length,
      duplicados: duplicados.filter((it) => it.accion === 'ACTUALIZA').length,
      existingCount: existing.length,
      nuevos: items.filter((it) => it.accion === 'NUEVO').length,
      sinCambios: items.filter((it) => it.accion === 'SIN_CAMBIOS').length,
      items,
      duplicateCodigos: duplicados.map((d) => d.codigo),
      ignoredHeaders: parsed.ignoredHeaders,
      hasDimensionCodes: parsed.hasDimensionCodes,
      centrosCount,
      elementosCount,
      areasCount,
      avisoMaestros: avisoMaestrosFaltantes({ centrosCount, elementosCount, areasCount }),
    };
  }

  async importPlanExcel(
    user: JwtPayload,
    file: Express.Multer.File | undefined,
    replace: boolean,
    empresaHeader?: string,
  ) {
    const preview = await this.previewPlanExcel(user, file, empresaHeader);
    return this.bulkCuentas(
      user,
      {
        items: preview.items,
        replace,
        actualizarAnidacion: true,
        aplicarFlags: true,
        archivoNombre: file?.originalname,
      },
      empresaHeader,
    );
  }

  async getElementosCosto(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.elementoCosto.findMany({
      where: { empresaId },
      orderBy: { codigo: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      departamento: r.departamento,
      vigencia: r.vigencia,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async createElementoCosto(
    user: JwtPayload,
    dto: UpsertElementoCostoDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const codigo = assertCodigoCatalogoNuevo(dto.codigo);
    const nombre = normalizeNombreCatalogo(dto.nombre);
    try {
      const row = await this.prisma.elementoCosto.create({
        data: {
          codigo,
          nombre,
          departamento: dto.departamento.trim(),
          vigencia: 'VIGENTE',
          empresaId,
        },
      });
      return {
        id: row.id,
        codigo: row.codigo,
        nombre: row.nombre,
        departamento: row.departamento,
        vigencia: row.vigencia,
        createdAt: row.createdAt.toISOString(),
      };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un elemento con ese código');
      }
      throw e;
    }
  }

  async updateElementoCosto(
    user: JwtPayload,
    id: string,
    dto: UpsertElementoCostoDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const existing = await this.prisma.elementoCosto.findUnique({ where: { id } });
    if (!existing || existing.empresaId !== empresaId) {
      throw new NotFoundException('Elemento de costo no encontrado');
    }
    assertCodigoCatalogoInmutable(existing.codigo, dto.codigo);
    const vigencia = (dto.vigencia ?? existing.vigencia).toUpperCase();
    if (vigencia !== 'VIGENTE' && vigencia !== 'ANULADO') {
      throw new BadRequestException('vigencia inválida');
    }
    try {
      const row = await this.prisma.elementoCosto.update({
        where: { id },
        data: {
          nombre: normalizeNombreCatalogo(dto.nombre),
          departamento: dto.departamento.trim(),
          vigencia: vigencia as 'VIGENTE' | 'ANULADO',
        },
      });
      return {
        id: row.id,
        codigo: row.codigo,
        nombre: row.nombre,
        departamento: row.departamento,
        vigencia: row.vigencia,
        createdAt: row.createdAt.toISOString(),
      };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un elemento con ese código');
      }
      throw e;
    }
  }

  async previewElementosCostoExcel(
    user: JwtPayload,
    file: Express.Multer.File | undefined,
    empresaHeader?: string,
  ) {
    const parsed = await this.parseElementosExcel(file);
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const existing = await this.prisma.elementoCosto.findMany({ where: { empresaId } });
    const byCodigo = new Map(existing.map((e) => [e.codigo, e]));
    const fields = [
      { key: 'nombre' as const, label: 'Nombre' },
      { key: 'departamento' as const, label: 'Depto' },
    ];
    const items = parsed.items.map((it) => {
      const prev = byCodigo.get(it.codigo);
      const { accion, cambios } = clasificarFilaImport(
        {
          nombre: it.nombre,
          departamento: it.departamento,
        },
        prev
          ? { nombre: prev.nombre, departamento: prev.departamento }
          : undefined,
        fields,
      );
      return {
        codigo: it.codigo,
        nombre: it.nombre,
        departamento: it.departamento,
        accion,
        cambios,
      };
    });
    return {
      ok: true,
      total: items.length,
      duplicados: items.filter((it) => it.accion === 'ACTUALIZA').length,
      existingCount: existing.length,
      nuevos: items.filter((it) => it.accion === 'NUEVO').length,
      sinCambios: items.filter((it) => it.accion === 'SIN_CAMBIOS').length,
      items,
      duplicateCodigos: items.filter((it) => it.accion !== 'NUEVO').map((d) => d.codigo),
      ignoredHeaders: parsed.ignoredHeaders,
      skippedInFile: parsed.skippedInFile,
    };
  }

  async importElementosCostoExcel(
    user: JwtPayload,
    dto: ImportElementosCostoExcelDto,
    empresaHeader?: string,
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException('No hay filas para importar');
    }
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.elementoCosto.findMany({
        where: { empresaId },
        select: { id: true, codigo: true, nombre: true, departamento: true, vigencia: true },
      });
      const byCodigo = new Map(existing.map((e) => [e.codigo, e]));
      let created = 0;
      let updated = 0;
      let unchanged = 0;
      const resumen: { codigo: string; cambios: string[] }[] = [];
      for (const raw of dto.items) {
        const codigoRaw = raw.codigo.trim();
        const codigo = codigoRaw.toUpperCase();
        const nombre = normalizeNombreCatalogo(raw.nombre);
        if (!codigo || !nombre) continue;
        const departamento = raw.departamento?.trim() || undefined;
        const found = byCodigo.get(codigo);
        if (!found) {
          const codigoNuevo = assertCodigoCatalogoNuevo(codigoRaw);
          await tx.elementoCosto.create({
            data: {
              codigo: codigoNuevo,
              nombre,
              departamento: departamento || 'GENERAL',
              vigencia: 'VIGENTE',
              empresaId,
            },
          });
          created += 1;
          resumen.push({ codigo, cambios: ['Nuevo'] });
          continue;
        }
        const data: { nombre?: string; departamento?: string } = {};
        const cambios: string[] = [];
        if (nombre !== found.nombre) {
          data.nombre = nombre;
          cambios.push(`Nombre: ${found.nombre} → ${nombre}`);
        }
        if (departamento && departamento !== found.departamento) {
          data.departamento = departamento;
          cambios.push(`Departamento: ${found.departamento} → ${departamento}`);
        }
        if (!Object.keys(data).length) {
          unchanged += 1;
          continue;
        }
        await tx.elementoCosto.update({ where: { id: found.id }, data });
        updated += 1;
        resumen.push({ codigo, cambios });
      }
      return { ok: true, created, updated, unchanged, total: dto.items.length, resumen };
    });
    await registrarCatalogoImportacion(this.prisma, {
      empresaId,
      user,
      tipo: 'ELEMENTOS_COSTO',
      archivoNombre: dto.archivoNombre,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      resumen: result.resumen,
    });
    return result;
  }

  private async parseElementosExcel(file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Archivo .xlsx requerido (campo file)');
    }
    const XLSX = await import('xlsx');
    try {
      const parsed = parseCodigoNombreWorkbook(XLSX, file.buffer, /elementosdecosto/i, 'Elementos de costo');
      return {
        ignoredHeaders: parsed.ignoredHeaders,
        skippedInFile: parsed.skippedInFile,
        items: parsed.items.map((r) => ({
          codigo: r.codigo,
          nombre: r.nombre,
          departamento: r.extra.departamento || undefined,
        })),
      };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(e instanceof Error ? e.message : 'Excel inválido');
    }
  }

  private mapFactorHonorario(
    r: {
      id: string;
      factorAnterior: { toString(): string } | number;
      factorNuevo: { toString(): string } | number;
      vigenciaDesde: Date;
      vigenciaHasta: Date | null;
      usuario: string;
    },
    hoy = new Date(),
  ) {
    const day = new Date(hoy);
    day.setHours(0, 0, 0, 0);
    const desde = new Date(r.vigenciaDesde);
    desde.setHours(0, 0, 0, 0);
    const hasta = r.vigenciaHasta ? new Date(r.vigenciaHasta) : null;
    if (hasta) hasta.setHours(0, 0, 0, 0);
    const vigente = desde.getTime() <= day.getTime()
      && (hasta == null || hasta.getTime() >= day.getTime());
    return {
      id: r.id,
      factorAnterior: Number(r.factorAnterior),
      factorNuevo: Number(r.factorNuevo),
      vigenciaDesde: r.vigenciaDesde.toISOString().slice(0, 10),
      vigenciaHasta: r.vigenciaHasta
        ? r.vigenciaHasta.toISOString().slice(0, 10)
        : undefined,
      vigente,
      usuario: r.usuario,
    };
  }

  async getFactoresHonorario(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.factorHonorario.findMany({
      where: { empresaId },
      orderBy: { vigenciaDesde: 'desc' },
    });
    const mapped = rows.map((r) => this.mapFactorHonorario(r));
    // Si varios vigentes (sin hasta), solo el más reciente cuenta como vigente.
    const firstVigente = mapped.find((m) => m.vigente);
    return mapped.map((m) => ({
      ...m,
      vigente: firstVigente ? m.id === firstVigente.id : false,
    }));
  }

  async createFactorHonorario(
    user: JwtPayload,
    dto: UpsertFactorHonorarioDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const vigenciaDesde = new Date(dto.vigenciaDesde);
    if (Number.isNaN(vigenciaDesde.getTime())) {
      throw new BadRequestException('vigenciaDesde inválida');
    }
    let vigenciaHasta: Date | null = null;
    if (dto.vigenciaHasta?.trim()) {
      vigenciaHasta = new Date(dto.vigenciaHasta);
      if (Number.isNaN(vigenciaHasta.getTime())) {
        throw new BadRequestException('vigenciaHasta inválida');
      }
    }
    const row = await this.prisma.factorHonorario.create({
      data: {
        factorAnterior: dto.factorAnterior,
        factorNuevo: dto.factorNuevo,
        vigenciaDesde,
        vigenciaHasta,
        usuario: dto.usuario?.trim() || user.email,
        empresaId,
      },
    });
    return this.mapFactorHonorario(row);
  }

  async updateFactorHonorario(
    user: JwtPayload,
    id: string,
    dto: UpsertFactorHonorarioDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const existing = await this.prisma.factorHonorario.findUnique({ where: { id } });
    if (!existing || existing.empresaId !== empresaId) {
      throw new NotFoundException('Factor de honorario no encontrado');
    }
    const vigenciaDesde = new Date(dto.vigenciaDesde);
    if (Number.isNaN(vigenciaDesde.getTime())) {
      throw new BadRequestException('vigenciaDesde inválida');
    }
    let vigenciaHasta: Date | null = null;
    if (dto.vigenciaHasta?.trim()) {
      vigenciaHasta = new Date(dto.vigenciaHasta);
      if (Number.isNaN(vigenciaHasta.getTime())) {
        throw new BadRequestException('vigenciaHasta inválida');
      }
    }
    const row = await this.prisma.factorHonorario.update({
      where: { id },
      data: {
        factorAnterior: dto.factorAnterior,
        factorNuevo: dto.factorNuevo,
        vigenciaDesde,
        vigenciaHasta,
        usuario: dto.usuario?.trim() || existing.usuario,
      },
    });
    return this.mapFactorHonorario(row);
  }

  async getReportesContables(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const [asientos, cuentas] = await Promise.all([
      this.prisma.asiento.findMany({ where: { empresaId } }),
      this.prisma.cuentaContable.count({ where: { empresaId, activa: true } }),
    ]);
    const debe = asientos.reduce((a, r) => a + Number(r.debe), 0);
    const haber = asientos.reduce((a, r) => a + Number(r.haber), 0);
    const periodo = new Date().toISOString().slice(0, 7);
    return [
      {
        id: 'REP-BAL',
        nombre: 'Balance de comprobación',
        periodo,
        estado: 'DISPONIBLE' as const,
        asientos: asientos.length,
        cuentasActivas: cuentas,
        debe,
        haber,
        cuadrado: Math.round(debe * 100) === Math.round(haber * 100),
      },
      {
        id: 'REP-MAY',
        nombre: 'Mayor general',
        periodo,
        estado: 'DISPONIBLE' as const,
        asientos: asientos.length,
        cuentasActivas: cuentas,
        debe,
        haber,
        cuadrado: true,
      },
    ];
  }

  async getPresupuestos(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.presupuesto.findMany({
      where: { empresaId },
      orderBy: { anio: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      anio: r.anio,
      centroCosto: r.centroCosto,
      montoPresupuestado: Number(r.montoPresupuestado),
      montoEjecutado: Number(r.montoEjecutado),
      estado: r.estado,
    }));
  }

  async createPresupuesto(
    user: JwtPayload,
    dto: { anio: number; centroCosto: string; montoPresupuestado: number; montoEjecutado?: number; estado?: string },
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const row = await this.prisma.presupuesto.create({
      data: {
        anio: Number(dto.anio),
        centroCosto: dto.centroCosto.trim(),
        montoPresupuestado: Number(dto.montoPresupuestado),
        montoEjecutado: Number(dto.montoEjecutado ?? 0),
        estado: (dto.estado ?? 'ACTIVO').toUpperCase() as never,
        empresaId,
      },
    });
    return {
      id: row.id,
      anio: row.anio,
      centroCosto: row.centroCosto,
      montoPresupuestado: Number(row.montoPresupuestado),
      montoEjecutado: Number(row.montoEjecutado),
      estado: row.estado,
    };
  }

  async updatePresupuesto(
    user: JwtPayload,
    id: string,
    dto: { anio: number; centroCosto: string; montoPresupuestado: number; montoEjecutado?: number; estado?: string },
  ) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.presupuesto.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Presupuesto no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    const row = await this.prisma.presupuesto.update({
      where: { id },
      data: {
        anio: Number(dto.anio),
        centroCosto: dto.centroCosto.trim(),
        montoPresupuestado: Number(dto.montoPresupuestado),
        montoEjecutado: Number(dto.montoEjecutado ?? existing.montoEjecutado),
        estado: (dto.estado ?? existing.estado).toUpperCase() as never,
      },
    });
    return {
      id: row.id,
      anio: row.anio,
      centroCosto: row.centroCosto,
      montoPresupuestado: Number(row.montoPresupuestado),
      montoEjecutado: Number(row.montoEjecutado),
      estado: row.estado,
    };
  }

  async deletePresupuesto(user: JwtPayload, id: string) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.presupuesto.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Presupuesto no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    await this.prisma.presupuesto.delete({ where: { id } });
    return { ok: true };
  }

  async assertEmpresaAccess(user: JwtPayload, empresaId: string) {
    assertTenantAccess(resolveTenant(user), empresaId);
  }

  async findCuentaOrFail(id: string) {
    const row = await this.prisma.cuentaContable.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Cuenta no encontrada');
    return row;
  }

  private async getCuentaMapped(id: string) {
    const row = await this.prisma.cuentaContable.findUnique({
      where: { id },
      include: {
        centrosCosto: { select: { centroCostoId: true } },
        elementosCosto: { select: { elementoCostoId: true } },
        areasNegocio: { select: { areaNegocioId: true } },
      },
    });
    if (!row) throw new NotFoundException('Cuenta no encontrada');
    return mapCuenta(row);
  }

  async getCuentaImpacto(user: JwtPayload, id: string, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const existing = await this.findCuentaOrFail(id);
    if (existing.empresaId !== empresaId) throw new NotFoundException('Cuenta no encontrada');
    return this.buildCuentaImpacto(empresaId, id);
  }

  private async buildCuentaImpacto(empresaId: string, cuentaId: string) {
    const [hijos, configsSii, ordenesCompra, documentos, insumos, vinculosCc, vinculosEl, vinculosAn] =
      await Promise.all([
        this.prisma.cuentaContable.count({ where: { padreId: cuentaId } }),
        this.prisma.configContableSii.count({ where: { cuentaContableId: cuentaId } }),
        this.prisma.ordenCompra.count({ where: { empresaId, cuentaContableId: cuentaId } }),
        this.prisma.documentoComercial.count({ where: { empresaId, cuentaContableId: cuentaId } }),
        this.prisma.insumo.count({ where: { empresaId, cuentaContableId: cuentaId } }),
        this.prisma.cuentaCentroCosto.count({ where: { cuentaId } }),
        this.prisma.cuentaElementoCosto.count({ where: { cuentaId } }),
        this.prisma.cuentaAreaNegocio.count({ where: { cuentaId } }),
      ]);
    const asientosRows = await this.prisma.asiento.findMany({
      where: { empresaId },
      select: { id: true, numero: true, estado: true, lineas: true },
    });
    const matched = asientosRows.filter((a) => {
      const arr = Array.isArray(a.lineas) ? (a.lineas as Array<Record<string, unknown>>) : [];
      return arr.some((l) => l.cuentaId === cuentaId);
    });
    const asientosBorrador = matched.filter((a) => a.estado === 'BORRADOR').length;
    const asientosContabilizados = matched.filter((a) => a.estado === 'CONTABILIZADO').length;
    return {
      asientos: matched.length,
      asientosBorrador,
      asientosContabilizados,
      asientoEjemplos: matched.slice(0, 15).map((a) => ({
        numero: a.numero,
        estado: a.estado,
      })),
      hijos,
      configsSii,
      ordenesCompra,
      documentos,
      insumos,
      vinculos: vinculosCc + vinculosEl + vinculosAn,
    };
  }

  private async syncCuentaVinculos(
    empresaId: string,
    cuentaId: string,
    dto: { centroCostoIds?: string[]; elementoCostoIds?: string[]; areaNegocioIds?: string[] },
  ) {
    if (dto.centroCostoIds) {
      const ids = [...new Set(dto.centroCostoIds.filter(Boolean))];
      const found = await this.prisma.centroCosto.findMany({
        where: { empresaId, id: { in: ids } },
        select: { id: true },
      });
      if (found.length !== ids.length) throw new BadRequestException('Centro de costo inválido para la empresa');
      await this.prisma.cuentaCentroCosto.deleteMany({ where: { cuentaId } });
      if (ids.length) {
        await this.prisma.cuentaCentroCosto.createMany({
          data: ids.map((centroCostoId) => ({ cuentaId, centroCostoId, empresaId })),
        });
      }
    }
    if (dto.elementoCostoIds) {
      const ids = [...new Set(dto.elementoCostoIds.filter(Boolean))];
      const found = await this.prisma.elementoCosto.findMany({
        where: { empresaId, id: { in: ids } },
        select: { id: true },
      });
      if (found.length !== ids.length) throw new BadRequestException('Elemento de costo inválido para la empresa');
      await this.prisma.cuentaElementoCosto.deleteMany({ where: { cuentaId } });
      if (ids.length) {
        await this.prisma.cuentaElementoCosto.createMany({
          data: ids.map((elementoCostoId) => ({ cuentaId, elementoCostoId, empresaId })),
        });
      }
    }
    if (dto.areaNegocioIds) {
      const ids = [...new Set(dto.areaNegocioIds.filter(Boolean))];
      const found = await this.prisma.areaNegocio.findMany({
        where: { empresaId, id: { in: ids } },
        select: { id: true },
      });
      if (found.length !== ids.length) throw new BadRequestException('Área de negocio inválida para la empresa');
      await this.prisma.cuentaAreaNegocio.deleteMany({ where: { cuentaId } });
      if (ids.length) {
        await this.prisma.cuentaAreaNegocio.createMany({
          data: ids.map((areaNegocioId) => ({ cuentaId, areaNegocioId, empresaId })),
        });
      }
    }
  }

  async getAreasNegocio(user: JwtPayload, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    return this.prisma.areaNegocio.findMany({
      where: { empresaId },
      orderBy: { codigo: 'asc' },
    });
  }

  async createAreaNegocio(user: JwtPayload, dto: UpsertAreaNegocioDto, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    try {
      return await this.prisma.areaNegocio.create({
        data: {
          codigo: dto.codigo.trim().toUpperCase(),
          nombre: dto.nombre.trim(),
          activa: dto.activa ?? true,
          empresaId,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un área con ese código');
      }
      throw e;
    }
  }

  async updateAreaNegocio(
    user: JwtPayload,
    id: string,
    dto: UpsertAreaNegocioDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const row = await this.prisma.areaNegocio.findUnique({ where: { id } });
    if (!row || row.empresaId !== empresaId) throw new NotFoundException('Área no encontrada');
    try {
      return await this.prisma.areaNegocio.update({
        where: { id },
        data: {
          codigo: dto.codigo.trim().toUpperCase(),
          nombre: dto.nombre.trim(),
          activa: dto.activa ?? row.activa,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un área con ese código');
      }
      throw e;
    }
  }

  private mapPeriodo(row: {
    id: string;
    codigo: string;
    anio: number;
    mes: number;
    fechaDesde: Date;
    fechaHasta: Date;
    estado: string;
    activo: boolean;
    empresaId: string;
  }) {
    return {
      id: row.id,
      codigo: row.codigo,
      anio: row.anio,
      mes: row.mes,
      fechaDesde: row.fechaDesde.toISOString().slice(0, 10),
      fechaHasta: row.fechaHasta.toISOString().slice(0, 10),
      estado: row.estado as 'ABIERTO' | 'CERRADO',
      activo: row.activo,
      empresaId: row.empresaId,
    };
  }

  private parsePeriodoCodigo(codigoRaw: string) {
    const codigo = codigoRaw.trim();
    const m = /^(\d{4})-(\d{2})$/.exec(codigo);
    if (!m) throw new BadRequestException('codigo debe ser aaaa-mm (ej. 2026-07)');
    const anio = Number(m[1]);
    const mes = Number(m[2]);
    if (mes < 1 || mes > 12) throw new BadRequestException('mes inválido en codigo');
    const fechaDesde = new Date(Date.UTC(anio, mes - 1, 1));
    const fechaHasta = new Date(Date.UTC(anio, mes, 0));
    return { codigo, anio, mes, fechaDesde, fechaHasta };
  }

  async getPeriodosContables(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.periodoContable.findMany({
      where: { empresaId },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
    });
    return rows.map((r) => this.mapPeriodo(r));
  }

  private empresaActivaInexistente(empresaId: string) {
    return new BadRequestException(
      `La empresa activa (${empresaId}) no existe. Selecciónala de nuevo en el encabezado.`,
    );
  }

  async createPeriodoContable(
    user: JwtPayload,
    dto: CreatePeriodoContableDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true },
    });
    if (!empresa) throw this.empresaActivaInexistente(empresaId);
    const parsed = this.parsePeriodoCodigo(dto.codigo);
    const fechaDesde = dto.fechaDesde ? new Date(dto.fechaDesde) : parsed.fechaDesde;
    const fechaHasta = dto.fechaHasta ? new Date(dto.fechaHasta) : parsed.fechaHasta;
    if (Number.isNaN(fechaDesde.getTime()) || Number.isNaN(fechaHasta.getTime())) {
      throw new BadRequestException('Fechas de periodo inválidas');
    }
    if (dto.activo) {
      await this.prisma.periodoContable.updateMany({
        where: { empresaId, activo: true },
        data: { activo: false },
      });
    }
    try {
      const row = await this.prisma.periodoContable.create({
        data: {
          empresaId,
          codigo: parsed.codigo,
          anio: parsed.anio,
          mes: parsed.mes,
          fechaDesde,
          fechaHasta,
          estado: 'ABIERTO',
          activo: Boolean(dto.activo),
        },
      });
      await this.registrarEventoPeriodo(user, {
        periodoId: row.id,
        empresaId,
        accion: 'CREAR',
        estadoAntes: null,
        estadoDespues: 'ABIERTO',
        motivo: null,
      });
      return this.mapPeriodo(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Ya existe el periodo ${parsed.codigo}`);
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw this.empresaActivaInexistente(empresaId);
      }
      throw e;
    }
  }

  async updatePeriodoContable(
    user: JwtPayload,
    id: string,
    dto: UpdatePeriodoContableDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const existing = await this.prisma.periodoContable.findUnique({ where: { id } });
    if (!existing || existing.empresaId !== empresaId) {
      throw new NotFoundException('Periodo contable no encontrado');
    }
    if (dto.estado && !['ABIERTO', 'CERRADO'].includes(dto.estado.toUpperCase())) {
      throw new BadRequestException('estado inválido (ABIERTO|CERRADO)');
    }
    if (dto.activo) {
      await this.prisma.periodoContable.updateMany({
        where: { empresaId, activo: true, NOT: { id } },
        data: { activo: false },
      });
    }
    const row = await this.prisma.periodoContable.update({
      where: { id },
      data: {
        ...(dto.estado ? { estado: dto.estado.toUpperCase() as 'ABIERTO' | 'CERRADO' } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
        ...(dto.fechaDesde ? { fechaDesde: new Date(dto.fechaDesde) } : {}),
        ...(dto.fechaHasta ? { fechaHasta: new Date(dto.fechaHasta) } : {}),
      },
    });
    return this.mapPeriodo(row);
  }

  private async registrarEventoPeriodo(
    user: JwtPayload,
    input: {
      periodoId: string;
      empresaId: string;
      accion: string;
      estadoAntes: string | null;
      estadoDespues: string;
      motivo: string | null;
    },
  ) {
    const actor = await this.prisma.usuario.findUnique({
      where: { id: user.sub },
      select: { nombre: true },
    });
    await this.prisma.periodoContableEvento.create({
      data: {
        periodoId: input.periodoId,
        empresaId: input.empresaId,
        accion: input.accion,
        estadoAntes: input.estadoAntes,
        estadoDespues: input.estadoDespues,
        motivo: input.motivo,
        usuarioId: user.sub,
        usuarioNombre: actor?.nombre ?? user.email,
      },
    });
  }

  async getPeriodoContableEventos(
    user: JwtPayload,
    id: string,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const periodo = await this.prisma.periodoContable.findUnique({ where: { id } });
    if (!periodo || periodo.empresaId !== empresaId) {
      throw new NotFoundException('Periodo contable no encontrado');
    }
    const rows = await this.prisma.periodoContableEvento.findMany({
      where: { periodoId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      periodoId: r.periodoId,
      accion: r.accion,
      estadoAntes: r.estadoAntes ?? undefined,
      estadoDespues: r.estadoDespues,
      motivo: r.motivo ?? undefined,
      usuarioId: r.usuarioId ?? undefined,
      usuarioNombre: r.usuarioNombre ?? undefined,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async abrirPeriodoContable(
    user: JwtPayload,
    id: string,
    dto: AbrirPeriodoContableDto = {},
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const existing = await this.prisma.periodoContable.findUnique({ where: { id } });
    if (!existing || existing.empresaId !== empresaId) {
      throw new NotFoundException('Periodo contable no encontrado');
    }
    const reabrir = existing.estado === 'CERRADO';
    const motivo = dto.motivo?.trim() || '';
    if (reabrir && !motivo) {
      throw new BadRequestException('Indique el motivo de reapertura del periodo');
    }
    const mapped = await this.updatePeriodoContable(
      user,
      id,
      { estado: 'ABIERTO' },
      empresaHeader,
    );
    await this.registrarEventoPeriodo(user, {
      periodoId: id,
      empresaId,
      accion: reabrir ? 'REABRIR' : 'ABRIR',
      estadoAntes: existing.estado,
      estadoDespues: 'ABIERTO',
      motivo: motivo || null,
    });
    return mapped;
  }

  async cerrarPeriodoContable(user: JwtPayload, id: string, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const existing = await this.prisma.periodoContable.findUnique({ where: { id } });
    if (!existing || existing.empresaId !== empresaId) {
      throw new NotFoundException('Periodo contable no encontrado');
    }
    const mapped = await this.updatePeriodoContable(
      user,
      id,
      { estado: 'CERRADO', activo: false },
      empresaHeader,
    );
    await this.registrarEventoPeriodo(user, {
      periodoId: id,
      empresaId,
      accion: 'CERRAR',
      estadoAntes: existing.estado,
      estadoDespues: 'CERRADO',
      motivo: null,
    });
    return mapped;
  }

  private mapConfigSii(row: {
    id: string;
    tipoDocumentoSii: string;
    codigoSii: string | null;
    nombre: string;
    cuentaContableId: string;
    centroCostoId: string | null;
    areaNegocioId: string | null;
    elementoCostoId: string | null;
    lado: string;
    activa: boolean;
    empresaId: string;
    cuentaContable?: {
      codigo: string;
      nombre: string;
      requiereCc?: boolean;
      requiereArea?: boolean;
      requiereElemento?: boolean;
    } | null;
  }) {
    return {
      id: row.id,
      tipoDocumentoSii: row.tipoDocumentoSii,
      codigoSii: row.codigoSii ?? undefined,
      nombre: row.nombre,
      cuentaContableId: row.cuentaContableId,
      cuentaCodigo: row.cuentaContable?.codigo,
      cuentaNombre: row.cuentaContable?.nombre,
      // La pantalla necesita saber qué dimensión pedir para cada cuenta.
      cuentaRequiereCc: row.cuentaContable?.requiereCc ?? false,
      cuentaRequiereArea: row.cuentaContable?.requiereArea ?? false,
      cuentaRequiereElemento: row.cuentaContable?.requiereElemento ?? false,
      centroCostoId: row.centroCostoId ?? undefined,
      areaNegocioId: row.areaNegocioId ?? undefined,
      elementoCostoId: row.elementoCostoId ?? undefined,
      lado: row.lado,
      activa: row.activa,
      empresaId: row.empresaId,
    };
  }

  /** Las dimensiones referenciadas por un mapeo deben existir en la empresa. */
  private async assertDimensionesConfigSii(
    empresaId: string,
    items: ConfigContableSiiItemDto[],
  ) {
    const ids = (pick: (i: ConfigContableSiiItemDto) => string | null | undefined) =>
      [...new Set(items.map((i) => pick(i)?.trim()).filter((v): v is string => !!v))];

    const ccIds = ids((i) => i.centroCostoId);
    const areaIds = ids((i) => i.areaNegocioId);
    const elemIds = ids((i) => i.elementoCostoId);

    const [ccs, areas, elems] = await Promise.all([
      ccIds.length
        ? this.prisma.centroCosto.findMany({ where: { empresaId, id: { in: ccIds } }, select: { id: true } })
        : [],
      areaIds.length
        ? this.prisma.areaNegocio.findMany({ where: { empresaId, id: { in: areaIds } }, select: { id: true } })
        : [],
      elemIds.length
        ? this.prisma.elementoCosto.findMany({ where: { empresaId, id: { in: elemIds } }, select: { id: true } })
        : [],
    ]);

    if (ccs.length !== ccIds.length) {
      throw new BadRequestException('Uno o más centros de costo no existen en la empresa');
    }
    if (areas.length !== areaIds.length) {
      throw new BadRequestException('Una o más áreas de negocio no existen en la empresa');
    }
    if (elems.length !== elemIds.length) {
      throw new BadRequestException('Uno o más elementos de costo no existen en la empresa');
    }
  }

  async getConfigContableSii(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.configContableSii.findMany({
      where: { empresaId },
      include: { cuentaContable: { select: CONFIG_SII_CUENTA_SELECT } },
      orderBy: { tipoDocumentoSii: 'asc' },
    });
    return rows.map((r) => this.mapConfigSii(r));
  }

  async putConfigContableSii(
    user: JwtPayload,
    dto: UpsertConfigContableSiiDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    if (!dto.items?.length) throw new BadRequestException('items es requerido');

    const cuentaIds = [...new Set(dto.items.map((i) => i.cuentaContableId))];
    const cuentas = await this.prisma.cuentaContable.findMany({
      where: { empresaId, id: { in: cuentaIds } },
    });
    if (cuentas.length !== cuentaIds.length) {
      throw new BadRequestException('Una o más cuentas no existen en la empresa');
    }
    const noOk = cuentas.find((c) => !c.activa || c.noImputable);
    if (noOk) {
      throw new BadRequestException(
        `La cuenta ${noOk.codigo} está deshabilitada o no es imputable. No se puede usar en mapeos nuevos.`,
      );
    }
    const cuentaPorId = new Map(cuentas.map((c) => [c.id, c]));

    // Las dimensiones del mapeo deben existir en la empresa: el asiento
    // automático las copia tal cual y allá fallaría con un error opaco.
    await this.assertDimensionesConfigSii(empresaId, dto.items);

    const results = [];
    for (const item of dto.items) {
      const tipo = item.tipoDocumentoSii.trim().toUpperCase();
      const lado = (item.lado?.trim() || 'DEBE').toUpperCase();
      if (!['DEBE', 'HABER'].includes(lado)) {
        throw new BadRequestException(`lado inválido para ${tipo}`);
      }
      const cuenta = cuentaPorId.get(item.cuentaContableId)!;
      const faltan: string[] = [];
      if (cuenta.requiereCc && !item.centroCostoId?.trim()) faltan.push('centro de costo');
      if (cuenta.requiereArea && !item.areaNegocioId?.trim()) faltan.push('área de negocio');
      if (cuenta.requiereElemento && !item.elementoCostoId?.trim()) {
        faltan.push('elemento de costo');
      }
      if (faltan.length) {
        throw new BadRequestException(
          `La cuenta ${cuenta.codigo} (${cuenta.nombre}) exige ${faltan.join(', ')}.`
          + ` Complete esa dimensión en el mapeo ${tipo}: el asiento automático la toma de aquí.`,
        );
      }
      const row = await this.prisma.configContableSii.upsert({
        where: {
          empresaId_tipoDocumentoSii: { empresaId, tipoDocumentoSii: tipo },
        },
        create: {
          empresaId,
          tipoDocumentoSii: tipo,
          codigoSii: item.codigoSii?.trim() || tipo,
          nombre: item.nombre.trim(),
          cuentaContableId: item.cuentaContableId,
          centroCostoId: item.centroCostoId?.trim() || null,
          areaNegocioId: item.areaNegocioId?.trim() || null,
          elementoCostoId: item.elementoCostoId?.trim() || null,
          lado,
          activa: item.activa ?? true,
        },
        update: {
          codigoSii: item.codigoSii?.trim() || tipo,
          nombre: item.nombre.trim(),
          cuentaContableId: item.cuentaContableId,
          centroCostoId: item.centroCostoId?.trim() || null,
          areaNegocioId: item.areaNegocioId?.trim() || null,
          elementoCostoId: item.elementoCostoId?.trim() || null,
          lado,
          activa: item.activa ?? true,
        },
        include: { cuentaContable: { select: CONFIG_SII_CUENTA_SELECT } },
      });
      results.push(this.mapConfigSii(row));
    }
    return results;
  }

  private periodoDateRange(codigo: string) {
    const { fechaDesde, fechaHasta } = this.parsePeriodoCodigo(codigo);
    const hastaFin = new Date(fechaHasta);
    hastaFin.setUTCHours(23, 59, 59, 999);
    return { desde: fechaDesde, hasta: hastaFin };
  }

  private async resolveCuentaPair(
    empresaId: string,
    preferDebeTipos: string[],
    preferHaberTipos: string[],
  ) {
    const configs = await this.prisma.configContableSii.findMany({
      where: { empresaId, activa: true },
    });
    const byTipo = new Map(configs.map((c) => [c.tipoDocumentoSii.toUpperCase(), c]));
    let debeId: string | undefined;
    let haberId: string | undefined;
    for (const t of preferDebeTipos) {
      const c = byTipo.get(t.toUpperCase());
      if (c) { debeId = c.cuentaContableId; break; }
    }
    for (const t of preferHaberTipos) {
      const c = byTipo.get(t.toUpperCase());
      if (c) { haberId = c.cuentaContableId; break; }
    }
    if (!debeId || !haberId) {
      const imputables = await this.prisma.cuentaContable.findMany({
        where: { empresaId, activa: true, noImputable: false },
        orderBy: { codigo: 'asc' },
        take: 2,
      });
      debeId = debeId || imputables[0]?.id;
      haberId = haberId || imputables[1]?.id || imputables[0]?.id;
    }
    return { debeId, haberId };
  }

  async previewCentralizacion(
    user: JwtPayload,
    dto: CentralizacionDto,
    empresaHeader?: string,
  ) {
    return this.runCentralizacion(user, dto, empresaHeader, true);
  }

  async ejecutarCentralizacion(
    user: JwtPayload,
    dto: CentralizacionDto,
    empresaHeader?: string,
  ) {
    return this.runCentralizacion(user, dto, empresaHeader, false);
  }

  private async runCentralizacion(
    user: JwtPayload,
    dto: CentralizacionDto,
    empresaHeader: string | undefined,
    dryRun: boolean,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const periodo = dto.periodo.trim();
    this.parsePeriodoCodigo(periodo);

    const periodoRow = await this.prisma.periodoContable.findUnique({
      where: { empresaId_codigo: { empresaId, codigo: periodo } },
    });
    if (!periodoRow) {
      throw new BadRequestException(
        `No existe el periodo contable ${periodo}. Créalo y déjalo ABIERTO antes de centralizar.`,
      );
    }
    if (periodoRow.estado === 'CERRADO') {
      throw new BadRequestException(`El periodo ${periodo} está cerrado`);
    }

    const origenesReq = (dto.origenes?.length
      ? dto.origenes
      : ['ventas', 'compras', 'contratistas', 'bodega']
    ).map((o) => o.toLowerCase());

    const { desde, hasta } = this.periodoDateRange(periodo);
    const items: Array<{
      origen: string;
      ref: string;
      glosa: string;
      monto: number;
      accion: 'CREAR' | 'OMITIR';
      motivo?: string;
    }> = [];
    const avisos: string[] = [];
    const asientosCreados: Array<{ numero: string; origen: string; monto: number }> = [];
    const porOrigen: Record<string, { pendientes: number; omitidos: number; monto: number }> = {};
    const bump = (origen: string, accion: 'CREAR' | 'OMITIR', monto: number) => {
      if (!porOrigen[origen]) porOrigen[origen] = { pendientes: 0, omitidos: 0, monto: 0 };
      if (accion === 'CREAR') {
        porOrigen[origen].pendientes += 1;
        porOrigen[origen].monto += monto;
      } else {
        porOrigen[origen].omitidos += 1;
      }
    };

    const assertPair = async (
      preferDebe: string[],
      preferHaber: string[],
      label: string,
    ) => {
      const pair = await this.resolveCuentaPair(empresaId, preferDebe, preferHaber);
      if (!pair.debeId || !pair.haberId) {
        throw new BadRequestException(
          `Sin cuentas SII/plan para centralizar ${label}. Configura Contabilidad → Config SII.`,
        );
      }
      return pair as { debeId: string; haberId: string };
    };

    // —— Ventas ——
    if (origenesReq.includes('ventas')) {
      const docs = await this.prisma.documentoComercial.findMany({
        where: {
          empresaId,
          fecha: { gte: desde, lte: hasta },
          estado: { notIn: ['ANULADO', 'CONTABILIZADA'] },
          OR: [{ asientoOriginal: null }, { asientoOriginal: '' }],
          fromReversa: false,
          tipo: { in: ['FACTURA'] },
        },
      });
      const already = await this.prisma.asiento.findMany({
        where: { empresaId, origen: { startsWith: 'CENTRALIZA-VTA:' } },
        select: { origen: true },
      });
      const ya = new Set(already.map((a) => a.origen));
      const pair = await assertPair(
        ['CLIENTES', '33', '1-1-02-01'],
        ['VENTAS', 'INGRESO_VENTA', '5-1-01-01'],
        'ventas',
      );
      for (const d of docs) {
        const origenKey = `CENTRALIZA-VTA:${d.folio}`;
        const monto = Number(d.neto);
        if (ya.has(origenKey) || d.asientoOriginal) {
          items.push({
            origen: 'ventas', ref: d.folio, glosa: `Doc ${d.folio}`, monto,
            accion: 'OMITIR', motivo: 'Ya centralizado',
          });
          bump('ventas', 'OMITIR', monto);
          continue;
        }
        if (monto <= 0) {
          items.push({
            origen: 'ventas', ref: d.folio, glosa: `Doc ${d.folio}`, monto,
            accion: 'OMITIR', motivo: 'monto 0',
          });
          bump('ventas', 'OMITIR', monto);
          continue;
        }
        items.push({
          origen: 'ventas',
          ref: d.folio,
          glosa: `Centraliza venta ${d.folio} · ${d.cliente}`,
          monto,
          accion: 'CREAR',
        });
        bump('ventas', 'CREAR', monto);
        if (!dryRun) {
          const a = await this.contabilizar.createAsiento({
            empresaId,
            periodo,
            fecha: d.fecha,
            tipo: 'DIARIO',
            glosa: `Centraliza venta ${d.folio} · ${d.cliente}`,
            origen: origenKey,
            lineas: [
              { debe: monto, haber: 0, cuentaId: pair.debeId, glosa: 'Clientes' },
              { debe: 0, haber: monto, cuentaId: pair.haberId, glosa: 'Ingresos' },
            ],
          });
          await this.prisma.documentoComercial.update({
            where: { id: d.id },
            data: { estado: 'CONTABILIZADA', asientoOriginal: a.numero },
          });
          asientosCreados.push({ numero: a.numero, origen: 'ventas', monto });
        }
      }
    }

    // —— Compras ——
    if (origenesReq.includes('compras')) {
      const regs = await this.prisma.registroCompra.findMany({
        where: {
          empresaId,
          asientoId: null,
          estado: { notIn: ['ANULADO', 'CONTABILIZADA'] },
          createdAt: { gte: desde, lte: hasta },
        },
      });
      const pair = await assertPair(
        ['COMPRAS', 'GASTO_COMPRA', '46', 'IVA_CREDITO'],
        ['PROVEEDORES', '2-1-01-01'],
        'compras',
      );
      for (const r of regs) {
        const monto = Number(r.monto);
        const accion = monto > 0 ? 'CREAR' as const : 'OMITIR' as const;
        items.push({
          origen: 'compras',
          ref: r.factura,
          glosa: `Centraliza compra ${r.factura} · ${r.proveedorFactura}`,
          monto,
          accion,
          motivo: monto > 0 ? undefined : 'monto 0',
        });
        bump('compras', accion, monto);
        if (!dryRun && monto > 0) {
          const a = await this.contabilizar.createAsiento({
            empresaId,
            periodo,
            tipo: 'DIARIO',
            glosa: `Centraliza compra ${r.factura} · ${r.proveedorFactura}`,
            origen: `CENTRALIZA-CMP:${r.factura}`,
            lineas: [
              { debe: monto, haber: 0, cuentaId: pair.debeId, glosa: 'Gasto/compra' },
              { debe: 0, haber: monto, cuentaId: pair.haberId, glosa: 'Proveedores' },
            ],
          });
          await this.prisma.registroCompra.update({
            where: { id: r.id },
            data: { estado: 'CONTABILIZADA', asientoId: a.id, asientoNumero: a.numero },
          });
          asientosCreados.push({ numero: a.numero, origen: 'compras', monto });
        }
      }
    }

    // —— Contratistas ——
    if (origenesReq.includes('contratistas')) {
      const existing = await this.prisma.asiento.findFirst({
        where: { empresaId, origen: `TRASPASO-CTR:${periodo}` },
      });
      const proformas = await this.prisma.proformaContratista.findMany({
        where: {
          empresaId,
          periodo,
          estado: { in: ['DEFINITIVA', 'FACTURADA'] },
        },
      });
      const montoTotal = proformas.reduce((a, p) => a + Number(p.montoNeto), 0);
      if (existing) {
        items.push({
          origen: 'contratistas', ref: periodo,
          glosa: `Traspaso contratistas ${periodo}`, monto: montoTotal,
          accion: 'OMITIR', motivo: `Ya existe asiento ${existing.numero}`,
        });
        bump('contratistas', 'OMITIR', montoTotal);
      } else if (proformas.length === 0) {
        items.push({
          origen: 'contratistas', ref: periodo,
          glosa: `Traspaso contratistas ${periodo}`, monto: 0,
          accion: 'OMITIR', motivo: 'Sin proformas DEFINITIVA/FACTURADA',
        });
        bump('contratistas', 'OMITIR', 0);
      } else {
        items.push({
          origen: 'contratistas', ref: periodo,
          glosa: `Traspaso/cierre contratistas ${periodo} (${proformas.length} proformas)`,
          monto: montoTotal, accion: 'CREAR',
        });
        bump('contratistas', 'CREAR', montoTotal);
        if (!dryRun && montoTotal > 0) {
          if (!this.contratistas) {
            throw new BadRequestException('Servicio de Contratistas no disponible');
          }
          const cierre = await this.contratistas.traspasoCierre(
            user,
            {
              periodo,
              glosa: `Traspaso/cierre contratistas ${periodo}`,
              tipoCambio: dto.tipoCambio,
              monedaTc: dto.monedaTc,
            },
            empresaId,
          );
          if (cierre.asientoNumero) {
            asientosCreados.push({
              numero: cierre.asientoNumero,
              origen: 'contratistas',
              monto: cierre.montoTotal,
            });
          }
        }
      }
    }

    // —— Bodega ——
    if (origenesReq.includes('bodega')) {
      const movs = await this.prisma.movimientoBodega.findMany({
        where: {
          empresaId,
          estado: 'CONFIRMADO',
          fecha: { gte: desde, lte: hasta },
          centralizadoAsientoId: null,
        },
      });
      const pair = await assertPair(
        ['BODEGA', 'INVENTARIO', '1-1-01-01'],
        ['PROVEEDORES', '2-1-01-01'],
        'bodega',
      );
      let parcialBodega = 0;
      for (const m of movs) {
        const origenKey = `CENTRALIZA-BOD:${m.id}`;
        const monto = Number(m.cantidad) * Number(m.precioUnitario);
        if (monto <= 0) {
          parcialBodega += 1;
          items.push({
            origen: 'bodega', ref: m.id.slice(0, 8),
            glosa: `Mov. ${m.tipo} ${m.articulo}`, monto,
            accion: 'OMITIR', motivo: 'monto 0',
          });
          bump('bodega', 'OMITIR', monto);
          continue;
        }
        items.push({
          origen: 'bodega',
          ref: m.id.slice(0, 8),
          glosa: `Centraliza bodega ${m.tipo} · ${m.articulo}`,
          monto,
          accion: 'CREAR',
        });
        bump('bodega', 'CREAR', monto);
        if (!dryRun) {
          const a = await this.contabilizar.createAsiento({
            empresaId,
            periodo,
            fecha: m.fecha,
            tipo: 'DIARIO',
            glosa: `Centraliza bodega ${m.tipo} · ${m.articulo}`,
            origen: origenKey,
            lineas: [
              { debe: monto, haber: 0, cuentaId: pair.debeId },
              { debe: 0, haber: monto, cuentaId: pair.haberId },
            ],
          });
          await this.prisma.movimientoBodega.update({
            where: { id: m.id },
            data: {
              centralizadoAsientoId: a.id,
              centralizadoAsientoNumero: a.numero,
            },
          });
          asientosCreados.push({ numero: a.numero, origen: 'bodega', monto });
        }
      }
      if (parcialBodega > 0) {
        avisos.push(`Bodega: ${parcialBodega} movimiento(s) omitidos (monto 0).`);
      }
    }

    const crear = items.filter((i) => i.accion === 'CREAR');
    const omitir = items.filter((i) => i.accion === 'OMITIR');
    if (!crear.length && origenesReq.length) {
      avisos.push('No hay documentos pendientes de centralizar para los orígenes seleccionados.');
    }
    if (!dryRun && asientosCreados.length) {
      avisos.push(`${asientosCreados.length} asiento(s) creados y documentos marcados.`);
    }

    return {
      dryRun,
      periodo,
      tipoCambio: dto.tipoCambio,
      monedaTc: dto.monedaTc,
      origenes: origenesReq,
      resumen: {
        pendientes: crear.length,
        omitidos: omitir.length,
        asientosCreados: asientosCreados.length,
        montoTotal: crear.reduce((a, i) => a + i.monto, 0),
      },
      porOrigen,
      items,
      asientosCreados,
      avisos,
    };
  }

  /** Libro diario: líneas de asientos del periodo. */
  async getLibroDiario(
    user: JwtPayload,
    periodo: string,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const codigo = (periodo || '').trim();
    if (!codigo) throw new BadRequestException('periodo (aaaa-mm) es requerido');
    this.parsePeriodoCodigo(codigo);
    const asientos = await this.prisma.asiento.findMany({
      where: {
        empresaId,
        periodo: codigo,
        estado: { not: 'ANULADO' },
      },
      orderBy: [{ fecha: 'asc' }, { numero: 'asc' }],
    });
    const lineas: Array<{
      asientoNumero: string;
      fecha: string;
      glosa: string;
      cuentaId?: string;
      cuentaCodigo?: string;
      cuentaNombre?: string;
      debe: number;
      haber: number;
      lineaGlosa?: string;
      origen?: string;
    }> = [];
    const cuentaIds = new Set<string>();
    for (const a of asientos) {
      const arr = Array.isArray(a.lineas) ? (a.lineas as Array<Record<string, unknown>>) : [];
      for (const l of arr) {
        const cid = typeof l.cuentaId === 'string' ? l.cuentaId : undefined;
        if (cid) cuentaIds.add(cid);
      }
    }
    const cuentas = cuentaIds.size
      ? await this.prisma.cuentaContable.findMany({
          where: { id: { in: [...cuentaIds] } },
          select: { id: true, codigo: true, nombre: true },
        })
      : [];
    const cmap = new Map(cuentas.map((c) => [c.id, c]));
    for (const a of asientos) {
      const arr = Array.isArray(a.lineas) ? (a.lineas as Array<Record<string, unknown>>) : [];
      if (!arr.length) {
        lineas.push({
          asientoNumero: a.numero,
          fecha: a.fecha.toISOString().slice(0, 10),
          glosa: a.glosa,
          debe: Number(a.debe),
          haber: Number(a.haber),
          origen: a.origen ?? undefined,
        });
        continue;
      }
      for (const l of arr) {
        const cid = typeof l.cuentaId === 'string' ? l.cuentaId : undefined;
        const c = cid ? cmap.get(cid) : undefined;
        lineas.push({
          asientoNumero: a.numero,
          fecha: a.fecha.toISOString().slice(0, 10),
          glosa: a.glosa,
          cuentaId: cid,
          cuentaCodigo: c?.codigo,
          cuentaNombre: c?.nombre,
          debe: Number(l.debe || 0),
          haber: Number(l.haber || 0),
          lineaGlosa: typeof l.glosa === 'string' ? l.glosa : undefined,
          origen: a.origen ?? undefined,
        });
      }
    }
    const totalDebe = lineas.reduce((s, l) => s + l.debe, 0);
    const totalHaber = lineas.reduce((s, l) => s + l.haber, 0);
    return {
      periodo: codigo,
      lineas,
      totales: {
        debe: totalDebe,
        haber: totalHaber,
        cuadrado: Math.round(totalDebe * 100) === Math.round(totalHaber * 100),
        asientos: asientos.length,
      },
    };
  }

  /**
   * P1-11: saldo acumulado por cuenta de todos los asientos NO anulados con
   * periodo estrictamente anterior a `periodoCodigo` (comparación léxica
   * válida porque el código es siempre "AAAA-MM"). Es el "arrastre" que
   * antes no existía: cada consulta del mayor partía de cero cada mes.
   */
  private async getSaldosAcumuladosAntesDe(
    empresaId: string,
    periodoCodigo: string,
  ): Promise<Map<string, { debe: number; haber: number }>> {
    const asientos = await this.prisma.asiento.findMany({
      where: {
        empresaId,
        estado: { not: 'ANULADO' },
        periodo: { lt: periodoCodigo },
      },
      select: { lineas: true },
    });
    const acc = new Map<string, { debe: number; haber: number }>();
    for (const a of asientos) {
      const arr = Array.isArray(a.lineas) ? (a.lineas as Array<Record<string, unknown>>) : [];
      for (const l of arr) {
        const cid = typeof l.cuentaId === 'string' ? l.cuentaId : undefined;
        const key = cid || '_SIN_CUENTA';
        if (!acc.has(key)) acc.set(key, { debe: 0, haber: 0 });
        const g = acc.get(key)!;
        g.debe += Number(l.debe || 0);
        g.haber += Number(l.haber || 0);
      }
    }
    return acc;
  }

  /**
   * Mayor por cuenta (opcional cuentaId). P1-11: incluye saldo inicial
   * (arrastre acumulado de periodos anteriores) y saldo final, no solo el
   * movimiento del mes — antes cada consulta era independiente por periodo.
   */
  async getMayor(
    user: JwtPayload,
    periodo: string,
    cuentaId?: string,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const diario = await this.getLibroDiario(user, periodo, empresaHeader, empresaQuery);
    let lineas = diario.lineas;
    if (cuentaId?.trim()) {
      lineas = lineas.filter((l) => l.cuentaId === cuentaId.trim());
    }
    const saldosIniciales = await this.getSaldosAcumuladosAntesDe(empresaId, diario.periodo);
    const byCuenta = new Map<string, {
      cuentaId?: string;
      cuentaCodigo: string;
      cuentaNombre: string;
      debe: number;
      haber: number;
      saldo: number;
      movimientos: typeof lineas;
    }>();
    for (const l of lineas) {
      const key = l.cuentaId || l.cuentaCodigo || '_SIN_CUENTA';
      if (!byCuenta.has(key)) {
        byCuenta.set(key, {
          cuentaId: l.cuentaId,
          cuentaCodigo: l.cuentaCodigo || '—',
          cuentaNombre: l.cuentaNombre || 'Sin cuenta',
          debe: 0,
          haber: 0,
          saldo: 0,
          movimientos: [],
        });
      }
      const g = byCuenta.get(key)!;
      g.debe += l.debe;
      g.haber += l.haber;
      g.saldo = g.debe - g.haber;
      g.movimientos.push(l);
    }
    // Cuentas con saldo arrastrado de periodos anteriores pero sin
    // movimiento este mes también deben aparecer en el mayor.
    const idsFaltantes = [...saldosIniciales.keys()].filter(
      (k) => k !== '_SIN_CUENTA' && !byCuenta.has(k) && (!cuentaId?.trim() || k === cuentaId.trim()),
    );
    if (idsFaltantes.length) {
      const metas = await this.prisma.cuentaContable.findMany({
        where: { id: { in: idsFaltantes } },
        select: { id: true, codigo: true, nombre: true },
      });
      for (const m of metas) {
        byCuenta.set(m.id, {
          cuentaId: m.id,
          cuentaCodigo: m.codigo,
          cuentaNombre: m.nombre,
          debe: 0,
          haber: 0,
          saldo: 0,
          movimientos: [],
        });
      }
    }
    const cuentas = [...byCuenta.values()]
      .map((c) => {
        const ini = (c.cuentaId ? saldosIniciales.get(c.cuentaId) : saldosIniciales.get('_SIN_CUENTA'))
          ?? { debe: 0, haber: 0 };
        const saldoInicial = ini.debe - ini.haber;
        return {
          ...c,
          saldoInicial,
          saldoPeriodo: c.saldo,
          saldo: saldoInicial + c.saldo,
        };
      })
      .sort((a, b) => a.cuentaCodigo.localeCompare(b.cuentaCodigo));
    return {
      periodo: diario.periodo,
      cuentas,
      totales: {
        debe: cuentas.reduce((s, c) => s + c.debe, 0),
        haber: cuentas.reduce((s, c) => s + c.haber, 0),
        saldoInicial: cuentas.reduce((s, c) => s + c.saldoInicial, 0),
      },
    };
  }

  /** Balance de 8 columnas (R4-15): sumas, saldos, inventario, resultados. */
  async getBalance8Columnas(
    user: JwtPayload,
    periodo: string,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const mayor = await this.getMayor(user, periodo, undefined, empresaHeader, empresaQuery);
    const ids = mayor.cuentas.map((c) => c.cuentaId).filter(Boolean) as string[];
    const metas = ids.length
      ? await this.prisma.cuentaContable.findMany({
          where: { id: { in: ids } },
          select: { id: true, tipo: true },
        })
      : [];
    const tipoById = new Map(metas.map((m) => [m.id, m.tipo]));

    const filas = mayor.cuentas.map((c) => {
      const saldoDeudor = c.saldo > 0 ? c.saldo : 0;
      const saldoAcreedor = c.saldo < 0 ? Math.abs(c.saldo) : 0;
      const tipo = (c.cuentaId ? tipoById.get(c.cuentaId) : undefined) ?? '';
      const esResultado = tipo === 'INGRESO' || tipo === 'GASTO'
        || /^[456]/.test(c.cuentaCodigo);
      let inventarioDeudor = 0;
      let inventarioAcreedor = 0;
      let resultadoDeudor = 0;
      let resultadoAcreedor = 0;
      if (esResultado) {
        resultadoDeudor = saldoDeudor;
        resultadoAcreedor = saldoAcreedor;
      } else {
        inventarioDeudor = saldoDeudor;
        inventarioAcreedor = saldoAcreedor;
      }
      return {
        cuentaId: c.cuentaId,
        codigo: c.cuentaCodigo,
        nombre: c.cuentaNombre,
        sumasDebe: c.debe,
        sumasHaber: c.haber,
        saldoDeudor,
        saldoAcreedor,
        inventarioDeudor,
        inventarioAcreedor,
        resultadoDeudor,
        resultadoAcreedor,
      };
    });

    const sum = (key: keyof (typeof filas)[0]) =>
      filas.reduce((s, f) => s + (typeof f[key] === 'number' ? (f[key] as number) : 0), 0);

    return {
      periodo: mayor.periodo,
      filas,
      totales: {
        sumasDebe: sum('sumasDebe'),
        sumasHaber: sum('sumasHaber'),
        saldoDeudor: sum('saldoDeudor'),
        saldoAcreedor: sum('saldoAcreedor'),
        inventarioDeudor: sum('inventarioDeudor'),
        inventarioAcreedor: sum('inventarioAcreedor'),
        resultadoDeudor: sum('resultadoDeudor'),
        resultadoAcreedor: sum('resultadoAcreedor'),
      },
    };
  }
}
