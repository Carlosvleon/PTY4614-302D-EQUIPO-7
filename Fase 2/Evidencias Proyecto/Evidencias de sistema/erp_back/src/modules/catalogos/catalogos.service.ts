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
  resolveOperationalEmpresa,
  resolveTenant,
  assertTenantAccess,
} from '../../auth/tenant.util';
import {
  UpsertMonedaDto,
  UpsertUnidadMedidaDto,
  UpsertTipoDocumentoDto,
  UpsertCentroCostoDto,
  ImportCentrosCostoExcelDto,
  ImportCodigosFinancierosExcelDto,
  UpdateSyncBcMetaDto,
  SyncIndicadoresBcDto,
  UpsertProveedorDto,
  UpsertCodigoFinancieroDto,
  UpsertConceptoFlujoDto,
  ImportIndicadoresBcExcelDto,
} from './dto/catalogos.dto';
import { randomUUID } from 'crypto';
import { dueCronSlot, parseHorarios, normalizeHora } from './bc-schedule.util';
import {
  clpFromParity,
  fetchBdeSeries,
  isoDay,
  observationsByIsoDay,
  readBdeAuth,
  resolveBdeSeriesIds,
} from './bde-client';
import {
  parseActiva,
  parseCodigoNombreWorkbook,
} from './catalog-excel.util';
import { clasificarFilaImport } from './catalog-excel-merge.util';
import { registrarCatalogoImportacion } from './catalogo-importacion.util';
import { mapeoSerieMindicador } from './tipo-cambio.util';
import {
  INDICADORES_BC_IMPORT_MAX,
  parseIndicadoresBcWorkbook,
} from './indicadores-bc-import.util';
import {
  fichaIncludeProveedor,
  mapProveedorFicha,
  syncProveedorFicha,
} from '../ficha/ficha-contraparte.util';
import {
  assertCodigoCatalogoInmutable,
  assertCodigoCatalogoNuevo,
  hoyIsoDateLocal,
  normalizeNombreCatalogo,
} from './catalog-codigo.util';

const BDE_FUENTE = 'BCCh';

function parseDate(value?: string | null): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`Fecha inválida: ${value}`);
  }
  return d;
}

function mapSyncMeta(row: {
  lastSync: Date | null;
  autoSync: boolean;
  horaProgramada: string;
  horarios?: string;
  frecuenciaMinutos?: number | null;
  ventanaInicio?: string;
  ventanaFin?: string;
  diasHabiles?: boolean;
  lastStatus?: string | null;
  lastError?: string | null;
  failStreak?: number;
}) {
  const horarios = parseHorarios(row.horarios || row.horaProgramada);
  return {
    modo: row.autoSync ? ('auto' as const) : ('manual' as const),
    horaProgramada: horarios[0] ?? row.horaProgramada,
    horarios,
    frecuenciaMinutos: row.frecuenciaMinutos ?? null,
    ventanaInicio: row.ventanaInicio ?? '09:00',
    ventanaFin: row.ventanaFin ?? '18:00',
    diasHabiles: row.diasHabiles ?? true,
    ultimaSync: row.lastSync ? row.lastSync.toISOString() : '',
    lastStatus: row.lastStatus ?? undefined,
    lastError: row.lastError ?? undefined,
    failStreak: row.failStreak ?? 0,
  };
}

function mapIndicador(row: {
  id: string;
  fecha: Date;
  usd: Prisma.Decimal;
  eur: Prisma.Decimal;
  cny: Prisma.Decimal;
  fuente: string;
  completadoFeriado: boolean;
  origenSync?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: row.id,
    fecha: row.fecha.toISOString().slice(0, 10),
    usd: Number(row.usd),
    eur: Number(row.eur),
    cny: Number(row.cny),
    fuente: row.fuente,
    completadoFeriado: row.completadoFeriado,
    origenSync: row.origenSync ?? null,
    consultadoEn: (row.updatedAt ?? row.createdAt)?.toISOString() ?? null,
  };
}

const SYNC_DEFAULT_ID = 'default';

@Injectable()
export class CatalogosService {
  constructor(private prisma: PrismaService) {}

  // -------- MONEDAS --------
  getMonedas() {
    return this.prisma.moneda.findMany({ orderBy: { codigo: 'asc' } });
  }

  async createMoneda(dto: UpsertMonedaDto) {
    const codigo = dto.codigo.trim().toUpperCase();
    try {
      return await this.prisma.moneda.create({
        data: {
          codigo,
          nombre: dto.nombre.trim(),
          simbolo: dto.simbolo.trim(),
          activa: dto.activa ?? true,
          focoReporteria:
            dto.focoReporteria ??
            ['CLP', 'USD', 'CNY', 'EUR'].includes(codigo),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una moneda con ese código');
      }
      throw e;
    }
  }

  async updateMoneda(id: string, dto: UpsertMonedaDto) {
    const existing = await this.prisma.moneda.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Moneda no encontrada');
    const codigo = dto.codigo.trim().toUpperCase();
    try {
      return await this.prisma.moneda.update({
        where: { id },
        data: {
          codigo,
          nombre: dto.nombre.trim(),
          simbolo: dto.simbolo.trim(),
          activa: dto.activa ?? true,
          focoReporteria:
            dto.focoReporteria ??
            ['CLP', 'USD', 'CNY', 'EUR'].includes(codigo),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una moneda con ese código');
      }
      throw e;
    }
  }

  // -------- UNIDADES --------
  getUnidades() {
    return this.prisma.unidadMedida.findMany({ orderBy: { codigo: 'asc' } });
  }

  async createUnidad(dto: UpsertUnidadMedidaDto) {
    try {
      return await this.prisma.unidadMedida.create({
        data: {
          codigo: dto.codigo.trim().toUpperCase(),
          nombre: dto.nombre.trim(),
          activa: dto.activa ?? true,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una unidad con ese código');
      }
      throw e;
    }
  }

  async updateUnidad(id: string, dto: UpsertUnidadMedidaDto) {
    const existing = await this.prisma.unidadMedida.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Unidad no encontrada');
    try {
      return await this.prisma.unidadMedida.update({
        where: { id },
        data: {
          codigo: dto.codigo.trim().toUpperCase(),
          nombre: dto.nombre.trim(),
          activa: dto.activa ?? true,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe una unidad con ese código');
      }
      throw e;
    }
  }

  // -------- TIPOS DOCUMENTO --------
  getTiposDocumento() {
    return this.prisma.tipoDocumento.findMany({
      orderBy: [{ modulo: 'asc' }, { codigo: 'asc' }],
    });
  }

  async createTipoDocumento(dto: UpsertTipoDocumentoDto) {
    try {
      return await this.prisma.tipoDocumento.create({
        data: {
          codigo: dto.codigo.trim().toUpperCase(),
          nombre: dto.nombre.trim(),
          modulo: dto.modulo.trim(),
          activo: dto.activo ?? true,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe ese tipo de documento en el módulo');
      }
      throw e;
    }
  }

  async updateTipoDocumento(id: string, dto: UpsertTipoDocumentoDto) {
    const existing = await this.prisma.tipoDocumento.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tipo de documento no encontrado');
    try {
      return await this.prisma.tipoDocumento.update({
        where: { id },
        data: {
          codigo: dto.codigo.trim().toUpperCase(),
          nombre: dto.nombre.trim(),
          modulo: dto.modulo.trim(),
          activo: dto.activo ?? true,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe ese tipo de documento en el módulo');
      }
      throw e;
    }
  }

  // -------- CENTROS DE COSTO --------
  async getCentrosCosto(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const rows = await this.prisma.centroCosto.findMany({
      where: { empresaId },
      include: { empresa: { select: { razonSocial: true } } },
      orderBy: [{ activa: 'desc' }, { codigo: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      activa: r.activa,
      contactoEncargado: r.contactoEncargado,
      empresaId: r.empresaId,
      empresaNombre: r.empresa.razonSocial,
      vigenciaDesde: r.vigenciaDesde?.toISOString().slice(0, 10) ?? null,
      vigenciaHasta: r.vigenciaHasta?.toISOString().slice(0, 10) ?? null,
    }));
  }

  async createCentroCosto(
    user: JwtPayload,
    dto: UpsertCentroCostoDto,
    empresaHeader?: string,
  ) {
    // Siempre la empresa operativa (header/JWT), no confiar en hardcode del client
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || dto.empresaId);
    const codigo = assertCodigoCatalogoNuevo(dto.codigo);
    const nombre = normalizeNombreCatalogo(dto.nombre);
    const vigenciaDesde = parseDate(hoyIsoDateLocal());
    const count = await this.prisma.centroCosto.count({ where: { empresaId } });
    try {
      const row = await this.prisma.centroCosto.create({
        data: {
          id: `CC-${empresaId}-${count + 1}`,
          codigo,
          nombre,
          activa: dto.activa ?? true,
          contactoEncargado: dto.contactoEncargado?.trim() || null,
          empresaId,
          vigenciaDesde,
          vigenciaHasta: parseDate(dto.vigenciaHasta),
        },
        include: { empresa: { select: { razonSocial: true } } },
      });
      return {
        id: row.id,
        codigo: row.codigo,
        nombre: row.nombre,
        activa: row.activa,
        contactoEncargado: row.contactoEncargado,
        empresaId: row.empresaId,
        empresaNombre: row.empresa.razonSocial,
        vigenciaDesde: row.vigenciaDesde?.toISOString().slice(0, 10) ?? null,
        vigenciaHasta: row.vigenciaHasta?.toISOString().slice(0, 10) ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un CC con ese código en la empresa');
      }
      throw e;
    }
  }

  async updateCentroCosto(user: JwtPayload, id: string, dto: UpsertCentroCostoDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.centroCosto.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Centro de costo no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    assertCodigoCatalogoInmutable(existing.codigo, dto.codigo);

    try {
      const row = await this.prisma.centroCosto.update({
        where: { id },
        data: {
          nombre: normalizeNombreCatalogo(dto.nombre),
          activa: dto.activa ?? true,
          contactoEncargado: dto.contactoEncargado?.trim() || null,
          // vigenciaDesde inmutable (fecha de alta)
          vigenciaHasta: parseDate(dto.vigenciaHasta),
        },
        include: { empresa: { select: { razonSocial: true } } },
      });
      return {
        id: row.id,
        codigo: row.codigo,
        nombre: row.nombre,
        activa: row.activa,
        contactoEncargado: row.contactoEncargado,
        empresaId: row.empresaId,
        empresaNombre: row.empresa.razonSocial,
        vigenciaDesde: row.vigenciaDesde?.toISOString().slice(0, 10) ?? null,
        vigenciaHasta: row.vigenciaHasta?.toISOString().slice(0, 10) ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un CC con ese código en la empresa');
      }
      throw e;
    }
  }

  async previewCentrosCostoExcel(
    user: JwtPayload,
    file: Express.Multer.File | undefined,
    empresaHeader?: string,
  ) {
    const parsed = await this.parseCentrosExcel(file);
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const existing = await this.prisma.centroCosto.findMany({
      where: { empresaId },
    });
    const byCodigo = new Map(existing.map((e) => [e.codigo, e]));
    const fields = [
      { key: 'nombre' as const, label: 'Nombre' },
      { key: 'contactoEncargado' as const, label: 'Encargado' },
      { key: 'activa' as const, label: 'Activa' },
    ];
    const items = parsed.items.map((it) => {
      const prev = byCodigo.get(it.codigo);
      const { accion, cambios } = clasificarFilaImport(
        {
          nombre: it.nombre,
          contactoEncargado: it.contactoEncargado,
          activa: it.activa,
        },
        prev
          ? {
              nombre: prev.nombre,
              contactoEncargado: prev.contactoEncargado,
              activa: prev.activa,
            }
          : undefined,
        fields,
      );
      return {
        codigo: it.codigo,
        nombre: it.nombre,
        contactoEncargado: it.contactoEncargado,
        activa: it.activa,
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
      skippedInFile: parsed.skippedInFile,
    };
  }

  async importCentrosCostoExcel(
    user: JwtPayload,
    dto: ImportCentrosCostoExcelDto,
    empresaHeader?: string,
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException('No hay filas para importar');
    }
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.centroCosto.findMany({
        where: { empresaId },
        select: {
          id: true,
          codigo: true,
          nombre: true,
          contactoEncargado: true,
          activa: true,
          vigenciaDesde: true,
        },
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
        const contacto =
          raw.contactoEncargado === undefined || raw.contactoEncargado === null
            ? undefined
            : raw.contactoEncargado.trim() || undefined;
        const found = byCodigo.get(codigo);
        if (!found) {
          const codigoNuevo = assertCodigoCatalogoNuevo(codigoRaw);
          await tx.centroCosto.create({
            data: {
              id: `CC-${empresaId}-${randomUUID()}`,
              codigo: codigoNuevo,
              nombre,
              activa: raw.activa ?? true,
              contactoEncargado: contacto ?? null,
              empresaId,
              vigenciaDesde: parseDate(hoyIsoDateLocal()),
            },
          });
          created += 1;
          resumen.push({ codigo, cambios: ['Nuevo'] });
          continue;
        }
        const data: {
          nombre?: string;
          activa?: boolean;
          contactoEncargado?: string | null;
        } = {};
        const cambios: string[] = [];
        if (nombre !== found.nombre) {
          data.nombre = nombre;
          cambios.push(`Nombre: ${found.nombre} → ${nombre}`);
        }
        if (raw.activa !== undefined && raw.activa !== found.activa) {
          data.activa = raw.activa;
          cambios.push(`Activa: ${found.activa ? 'SI' : 'NO'} → ${raw.activa ? 'SI' : 'NO'}`);
        }
        if (contacto !== undefined && contacto !== (found.contactoEncargado ?? '')) {
          data.contactoEncargado = contacto;
          cambios.push('Contacto');
        }
        if (!Object.keys(data).length) {
          unchanged += 1;
          continue;
        }
        await tx.centroCosto.update({ where: { id: found.id }, data });
        updated += 1;
        resumen.push({ codigo, cambios });
      }
      return { ok: true, created, updated, unchanged, total: dto.items.length, resumen };
    });
    await registrarCatalogoImportacion(this.prisma, {
      empresaId,
      user,
      tipo: 'CENTROS_COSTO',
      archivoNombre: dto.archivoNombre,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      resumen: result.resumen,
    });
    return result;
  }

  async listCatalogoImportaciones(
    user: JwtPayload,
    tipo: string | undefined,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const allowed = new Set(['PLAN_CUENTAS', 'CENTROS_COSTO', 'ELEMENTOS_COSTO', 'AREAS_NEGOCIO', 'CODIGOS_FINANCIEROS']);
    const where: {
      empresaId: string;
      tipo?: 'PLAN_CUENTAS' | 'CENTROS_COSTO' | 'ELEMENTOS_COSTO' | 'AREAS_NEGOCIO' | 'CODIGOS_FINANCIEROS';
    } = {
      empresaId,
    };
    if (tipo && allowed.has(tipo)) {
      where.tipo = tipo as typeof where.tipo;
    }
    const rows = await this.prisma.catalogoImportacion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      archivoNombre: r.archivoNombre,
      created: r.created,
      updated: r.updated,
      unchanged: r.unchanged,
      politicas: r.politicas,
      resumen: r.resumen,
      usuarioEmail: r.usuarioEmail,
      usuarioNombre: r.usuarioNombre,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private async parseCentrosExcel(file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Archivo .xlsx requerido (campo file)');
    }
    const XLSX = await import('xlsx');
    try {
      const parsed = parseCodigoNombreWorkbook(XLSX, file.buffer, /centrosdecosto/i, 'Centros de costo');
      return {
        ignoredHeaders: parsed.ignoredHeaders,
        skippedInFile: parsed.skippedInFile,
        items: parsed.items.map((r) => ({
          codigo: r.codigo,
          nombre: r.nombre,
          contactoEncargado: r.extra.contacto || undefined,
          activa: parseActiva(r.extra.activa) ?? parseActiva(r.extra.vigencia),
        })),
      };
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Excel inválido');
    }
  }

  // -------- SYNC BC / INDICADORES --------
  async getSyncBcMeta() {
    let row = await this.prisma.syncBcMeta.findUnique({ where: { id: SYNC_DEFAULT_ID } });
    if (!row) {
      row = await this.prisma.syncBcMeta.create({
        data: { id: SYNC_DEFAULT_ID, autoSync: false, horaProgramada: '09:00', horarios: '09:00' },
      });
    }
    return mapSyncMeta(row);
  }

  async updateSyncBcMeta(dto: UpdateSyncBcMetaDto) {
    const horarios = dto.horarios
      ? parseHorarios(dto.horarios.join(','))
      : dto.horaProgramada
        ? parseHorarios(dto.horaProgramada)
        : undefined;
    const hora0 = horarios?.[0];
    const ventanaInicio = dto.ventanaInicio ? normalizeHora(dto.ventanaInicio) : undefined;
    const ventanaFin = dto.ventanaFin ? normalizeHora(dto.ventanaFin) : undefined;
    if (dto.ventanaInicio && !ventanaInicio) throw new BadRequestException('ventanaInicio inválida (HH:mm)');
    if (dto.ventanaFin && !ventanaFin) throw new BadRequestException('ventanaFin inválida (HH:mm)');
    if (dto.horarios && !horarios?.length) throw new BadRequestException('Indique al menos un horario HH:mm');

    const data: Prisma.SyncBcMetaUpdateInput = {};
    if (dto.modo !== undefined) data.autoSync = dto.modo === 'auto';
    if (hora0) {
      data.horaProgramada = hora0;
      data.horarios = horarios!.join(',');
    }
    if (dto.frecuenciaMinutos !== undefined) {
      data.frecuenciaMinutos = dto.frecuenciaMinutos;
    }
    if (ventanaInicio) data.ventanaInicio = ventanaInicio;
    if (ventanaFin) data.ventanaFin = ventanaFin;
    if (dto.diasHabiles !== undefined) data.diasHabiles = dto.diasHabiles;
    if (
      dto.modo !== undefined
      || horarios
      || dto.frecuenciaMinutos !== undefined
      || ventanaInicio
      || ventanaFin
      || dto.diasHabiles !== undefined
    ) {
      data.lastCronSlot = null;
    }

    const row = await this.prisma.syncBcMeta.upsert({
      where: { id: SYNC_DEFAULT_ID },
      create: {
        id: SYNC_DEFAULT_ID,
        autoSync: dto.modo === 'auto',
        horaProgramada: hora0 || '09:00',
        horarios: horarios?.join(',') || '09:00',
        frecuenciaMinutos: dto.frecuenciaMinutos ?? null,
        ventanaInicio: ventanaInicio || '09:00',
        ventanaFin: ventanaFin || '18:00',
        diasHabiles: dto.diasHabiles ?? true,
      },
      update: data,
    });
    return mapSyncMeta(row);
  }

  /**
   * Series disponibles. Con token/credenciales BDE → catálogo oficial; si no → mindicador.cl.
   * DEC-05: foco CLP/USD/CNY/EUR.
   */
  async getBcSeriesDisponibles() {
    if (readBdeAuth()) {
      const ids = resolveBdeSeriesIds();
      return [
        {
          codigo: ids.usdClp,
          nombre: 'Dólar observado (CLP/USD) — BDE',
          unidad: 'Pesos por dólar',
          valorActual: null as number | null,
          mapeoErp: 'USD' as const,
          seleccionable: true,
        },
        {
          codigo: ids.eurUsd,
          nombre: 'Paridad Euro (EUR/USD) → CLP/EUR = DO ÷ paridad — BDE',
          unidad: 'EUR por USD',
          valorActual: null as number | null,
          mapeoErp: 'EUR' as const,
          seleccionable: true,
        },
        {
          codigo: ids.cnyUsd,
          nombre: 'Paridad Yuan (CNY/USD) → CLP/CNY = DO ÷ paridad — BDE',
          unidad: 'CNY por USD',
          valorActual: null as number | null,
          mapeoErp: 'CNY' as const,
          seleccionable: true,
        },
      ];
    }

    type MindicadorRoot = Record<
      string,
      { codigo?: string; nombre?: string; unidad_medida?: string; valor?: number } | string
    >;
    try {
      const res = await fetch('https://mindicador.cl/api', {
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as MindicadorRoot;
      const skip = new Set(['version', 'autor', 'fecha']);
      return Object.entries(json)
        .filter(([k, v]) => !skip.has(k) && v && typeof v === 'object' && 'codigo' in v)
        .map(([key, raw]) => {
          const v = raw as {
            codigo?: string;
            nombre?: string;
            unidad_medida?: string;
            valor?: number;
          };
          const codigo = (v.codigo || key).toLowerCase();
          const erp = mapeoSerieMindicador(codigo);
          return {
            codigo,
            nombre: v.nombre || key,
            unidad: v.unidad_medida || '',
            valorActual: typeof v.valor === 'number' ? v.valor : null,
            mapeoErp: erp as 'USD' | 'EUR' | 'CNY' | null,
            seleccionable: erp != null,
          };
        })
        .sort(
          (a, b) =>
            Number(b.seleccionable) - Number(a.seleccionable) ||
            a.nombre.localeCompare(b.nombre, 'es'),
        );
    } catch {
      return [
        {
          codigo: 'dolar',
          nombre: 'Dólar observado',
          unidad: 'Pesos',
          valorActual: null,
          mapeoErp: 'USD' as const,
          seleccionable: true,
        },
        {
          codigo: 'euro',
          nombre: 'Euro',
          unidad: 'Pesos',
          valorActual: null,
          mapeoErp: 'EUR' as const,
          seleccionable: true,
        },
        {
          codigo: 'yuan',
          nombre: 'Yuan (CNY)',
          unidad: 'Pesos',
          valorActual: null,
          mapeoErp: 'CNY' as const,
          seleccionable: true,
        },
      ];
    }
  }

  async getIndicadoresBc(desde?: string, hasta?: string) {
    const where: Prisma.IndicadorBcWhereInput = { empresaId: null };
    if (desde || hasta) {
      where.fecha = {};
      if (desde) {
        const d = parseDate(desde);
        if (d) where.fecha.gte = d;
      }
      if (hasta) {
        const d = parseDate(hasta);
        if (d) {
          d.setHours(23, 59, 59, 999);
          where.fecha.lte = d;
        }
      }
    }
    const rows = await this.prisma.indicadorBc.findMany({
      where,
      orderBy: { fecha: 'desc' },
      take: desde || hasta ? 366 : 90,
    });
    return rows.map(mapIndicador);
  }

  private async parseIndicadoresBcExcel(file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Archivo Excel o CSV requerido (campo file)');
    }
    const XLSX = await import('xlsx');
    try {
      return parseIndicadoresBcWorkbook(XLSX, file.buffer, file.originalname);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Archivo inválido');
    }
  }

  async previewIndicadoresBcExcel(file: Express.Multer.File | undefined) {
    const parsed = await this.parseIndicadoresBcExcel(file);
    if (parsed.items.length > INDICADORES_BC_IMPORT_MAX) {
      throw new BadRequestException(
        `El archivo tiene ${parsed.items.length} filas (máx. ${INDICADORES_BC_IMPORT_MAX})`,
      );
    }
    const existing = await this.prisma.indicadorBc.findMany({
      where: { empresaId: null },
      select: { fecha: true, usd: true, eur: true, cny: true },
    });
    const byFecha = new Map(existing.map((e) => [e.fecha.toISOString().slice(0, 10), e]));
    const fields = [
      { key: 'usd' as const, label: 'USD' },
      { key: 'cny' as const, label: 'CNY' },
      { key: 'eur' as const, label: 'EUR' },
    ];
    const items = parsed.items.map((it) => {
      const prev = byFecha.get(it.fecha);
      const incoming = {
        usd: it.usd,
        cny: it.cny,
        eur: it.eur,
      };
      const { accion, cambios } = clasificarFilaImport(
        incoming,
        prev
          ? { usd: Number(prev.usd), cny: Number(prev.cny), eur: Number(prev.eur) }
          : undefined,
        fields,
      );
      return {
        codigo: it.fecha,
        fecha: it.fecha,
        usd: it.usd,
        cny: it.cny,
        eur: it.eur,
        accion,
        cambios,
      };
    });
    return {
      ok: true,
      total: items.length,
      duplicados: items.filter((i) => i.accion === 'ACTUALIZA').length,
      existingCount: existing.length,
      nuevos: items.filter((i) => i.accion === 'NUEVO').length,
      sinCambios: items.filter((i) => i.accion === 'SIN_CAMBIOS').length,
      items,
      duplicateCodigos: parsed.skippedInFile,
      ignoredHeaders: parsed.ignoredHeaders,
      skippedInFile: parsed.skippedInFile,
    };
  }

  async importIndicadoresBcExcel(dto: ImportIndicadoresBcExcelDto) {
    const items = dto.items ?? [];
    if (!items.length) throw new BadRequestException('No hay filas para importar');
    if (items.length > INDICADORES_BC_IMPORT_MAX) {
      throw new BadRequestException(
        `Demasiadas filas (${items.length}). Máx. ${INDICADORES_BC_IMPORT_MAX}`,
      );
    }
    const existing = await this.prisma.indicadorBc.findMany({
      where: { empresaId: null },
      select: { id: true, fecha: true, usd: true, eur: true, cny: true },
    });
    const byFecha = new Map(existing.map((e) => [e.fecha.toISOString().slice(0, 10), e]));
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    for (const it of items) {
      const fechaIso = String(it.fecha ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) continue;
      const prev = byFecha.get(fechaIso);
      const nextUsd = it.usd != null && it.usd > 0 ? it.usd : prev ? Number(prev.usd) : 0;
      const nextCny = it.cny != null && it.cny > 0 ? it.cny : prev ? Number(prev.cny) : 0;
      const nextEur = it.eur != null && it.eur > 0 ? it.eur : prev ? Number(prev.eur) : 0;
      if (!prev && nextUsd <= 0 && nextCny <= 0 && nextEur <= 0) continue;
      if (prev) {
        const same =
          Number(prev.usd) === nextUsd
          && Number(prev.cny) === nextCny
          && Number(prev.eur) === nextEur;
        if (same) {
          unchanged += 1;
          continue;
        }
        await this.prisma.indicadorBc.update({
          where: { id: prev.id },
          data: {
            usd: nextUsd,
            cny: nextCny,
            eur: nextEur,
            fuente: 'EXCEL',
            origenSync: 'import',
          },
        });
        updated += 1;
      } else {
        const fecha = parseDate(fechaIso);
        if (!fecha) continue;
        const row = await this.prisma.indicadorBc.create({
          data: {
            fecha,
            usd: nextUsd,
            cny: nextCny,
            eur: nextEur,
            fuente: 'EXCEL',
            origenSync: 'import',
            empresaId: null,
          },
        });
        byFecha.set(fechaIso, {
          id: row.id,
          fecha: row.fecha,
          usd: row.usd,
          eur: row.eur,
          cny: row.cny,
        });
        created += 1;
      }
    }
    return { created, updated, unchanged, total: created + updated + unchanged };
  }

  async recordCronFailure(message: string) {
    const row = await this.prisma.syncBcMeta.upsert({
      where: { id: SYNC_DEFAULT_ID },
      create: {
        id: SYNC_DEFAULT_ID,
        autoSync: false,
        horaProgramada: '09:00',
        horarios: '09:00',
        lastStatus: 'ERROR',
        lastError: message.slice(0, 2000),
        failStreak: 1,
      },
      update: {
        lastStatus: 'ERROR',
        lastError: message.slice(0, 2000),
        failStreak: { increment: 1 },
      },
    });
    return mapSyncMeta(row);
  }

  private async fetchMindicadorSerie(
    codigo: string,
    fecha?: Date,
  ): Promise<{ valor: number; fecha: Date; feriado: boolean } | null> {
    const path = fecha
      ? `https://mindicador.cl/api/${codigo}/${String(fecha.getDate()).padStart(2, '0')}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${fecha.getFullYear()}`
      : `https://mindicador.cl/api/${codigo}`;
    try {
      const res = await fetch(path, { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        serie?: { fecha: string; valor: number }[];
      };
      const first = json.serie?.[0];
      if (!first) return null;
      const d = new Date(first.fecha);
      d.setHours(0, 0, 0, 0);
      const dow = d.getDay();
      return { valor: first.valor, fecha: d, feriado: dow === 0 || dow === 6 };
    } catch {
      return null;
    }
  }

  private resolveSyncDays(dto: SyncIndicadoresBcDto): Date[] {
    const days: Date[] = [];
    if (dto.desde && dto.hasta) {
      const from = parseDate(dto.desde);
      const to = parseDate(dto.hasta);
      if (!from || !to) throw new BadRequestException('Rango de fechas inválido');
      if (to < from) throw new BadRequestException('hasta debe ser ≥ desde');
      const cur = new Date(from);
      let guard = 0;
      while (cur <= to && guard < 62) {
        days.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
        guard += 1;
      }
    } else {
      const day = parseDate(dto.fecha) ?? new Date();
      day.setHours(0, 0, 0, 0);
      days.push(day);
    }
    return days;
  }

  private async markSyncBcOk() {
    await this.prisma.syncBcMeta.upsert({
      where: { id: SYNC_DEFAULT_ID },
      create: {
        id: SYNC_DEFAULT_ID,
        lastSync: new Date(),
        autoSync: false,
        horaProgramada: '09:00',
        horarios: '09:00',
        lastStatus: 'OK',
        lastError: null,
        failStreak: 0,
      },
      update: {
        lastSync: new Date(),
        lastStatus: 'OK',
        lastError: null,
        failStreak: 0,
      },
    });
  }

  /** Fallback temporal: mindicador.cl (sin API key). */
  private async syncIndicadoresBcMindicador(
    days: Date[],
    opts?: { fromCron?: boolean },
  ) {
    const saved = [];
    for (const day of days) {
      const [usdS, eurS, cnyS] = await Promise.all([
        this.fetchMindicadorSerie('dolar', day),
        this.fetchMindicadorSerie('euro', day),
        this.fetchMindicadorSerie('yuan', day),
      ]);

      if (!usdS && !eurS && days.length === 1) {
        throw new BadRequestException(
          'No se pudo consultar mindicador.cl (Banco Central). Reintenta o verifica conectividad del servidor.',
        );
      }
      if (!usdS && !eurS) continue;

      const usd = usdS?.valor ?? 0;
      const eur = eurS?.valor;
      const cny = cnyS?.valor;
      const fecha = usdS?.fecha ?? eurS?.fecha ?? day;
      const feriado = usdS?.feriado ?? eurS?.feriado ?? false;
      const origenSync = opts?.fromCron ? 'auto' : 'manual';

      const existing = await this.prisma.indicadorBc.findFirst({
        where: { fecha, empresaId: null },
      });

      const data = {
        usd,
        eur: eur && eur > 0 ? eur : existing ? Number(existing.eur) : 0,
        cny: cny && cny > 0 ? cny : existing ? Number(existing.cny) : 0,
        fuente: 'mindicador.cl',
        completadoFeriado: feriado,
        origenSync,
      };

      const row = existing
        ? await this.prisma.indicadorBc.update({
            where: { id: existing.id },
            data,
          })
        : await this.prisma.indicadorBc.create({
            data: {
              fecha,
              ...data,
              empresaId: null,
            },
          });
      saved.push(mapIndicador(row));
    }

    await this.markSyncBcOk();
    return { count: saved.length, items: saved };
  }

  /** API oficial BDE (token REST `BC_BDE_TOKEN`, o user/pass legado). */
  private async syncIndicadoresBcBde(
    days: Date[],
    opts?: { fromCron?: boolean },
  ) {
    const auth = readBdeAuth();
    if (!auth) {
      throw new BadRequestException('Token BDE no configurado (BC_BDE_TOKEN)');
    }

    const first = isoDay(days[0]);
    const last = isoDay(days[days.length - 1]);
    const seriesIds = resolveBdeSeriesIds();

    let usdMap: Map<string, number>;
    let eurParityMap: Map<string, number>;
    let cnyParityMap: Map<string, number>;
    try {
      const [usdObs, eurObs, cnyObs] = await Promise.all([
        fetchBdeSeries(auth, seriesIds.usdClp, first, last),
        fetchBdeSeries(auth, seriesIds.eurUsd, first, last),
        fetchBdeSeries(auth, seriesIds.cnyUsd, first, last),
      ]);
      usdMap = observationsByIsoDay(usdObs);
      eurParityMap = observationsByIsoDay(eurObs);
      cnyParityMap = observationsByIsoDay(cnyObs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(
        `No se pudo consultar la API BDE del Banco Central (${msg}). Verifica BC_BDE_TOKEN y conectividad hacia si3.bcentral.cl.`,
      );
    }

    if (usdMap.size === 0 && days.length === 1) {
      throw new BadRequestException(
        'La API BDE no devolvió dólar observado para la fecha pedida (fin de semana, feriado o serie sin dato).',
      );
    }

    const saved = [];
    const origenSync = opts?.fromCron ? 'auto' : 'manual';
    for (const day of days) {
      const key = isoDay(day);
      const usd = usdMap.get(key);
      if (usd == null) continue;

      const eurParity = eurParityMap.get(key);
      const cnyParity = cnyParityMap.get(key);
      const eur = eurParity != null ? clpFromParity(usd, eurParity) : null;
      const cny = cnyParity != null ? clpFromParity(usd, cnyParity) : null;
      const dow = day.getDay();
      const feriado = dow === 0 || dow === 6;

      const existing = await this.prisma.indicadorBc.findFirst({
        where: { fecha: day, empresaId: null },
      });

      const data = {
        usd,
        eur: eur && eur > 0 ? eur : existing ? Number(existing.eur) : 0,
        cny: cny && cny > 0 ? cny : existing ? Number(existing.cny) : 0,
        fuente: BDE_FUENTE,
        completadoFeriado: feriado,
        origenSync,
      };

      const row = existing
        ? await this.prisma.indicadorBc.update({
            where: { id: existing.id },
            data,
          })
        : await this.prisma.indicadorBc.create({
            data: {
              fecha: day,
              ...data,
              empresaId: null,
            },
          });
      saved.push(mapIndicador(row));
    }

    if (saved.length === 0) {
      throw new BadRequestException(
        'La API BDE no devolvió observaciones hábiles en el rango pedido.',
      );
    }

    await this.markSyncBcOk();
    return { count: saved.length, items: saved };
  }

  /**
   * Sync indicadores: API oficial BDE si hay token/credenciales; si no, mindicador.cl (respaldo).
   */
  async syncIndicadoresBc(
    dto: SyncIndicadoresBcDto = {},
    opts?: { fromCron?: boolean },
  ) {
    const days = this.resolveSyncDays(dto);
    if (readBdeAuth()) {
      return this.syncIndicadoresBcBde(days, opts);
    }
    return this.syncIndicadoresBcMindicador(days, opts);
  }

  /** Tick del cron (cada 5 min): corre si autoSync y el horario/frecuencia coincide. */
  async runScheduledBcSyncIfDue() {
    if (process.env.BC_CRON_ENABLED === 'false') return { skipped: true as const, reason: 'disabled' };
    const meta = await this.prisma.syncBcMeta.findUnique({ where: { id: SYNC_DEFAULT_ID } });
    if (!meta?.autoSync) return { skipped: true as const, reason: 'manual' };
    const slot = dueCronSlot({
      autoSync: meta.autoSync,
      horarios: parseHorarios(meta.horarios || meta.horaProgramada),
      frecuenciaMinutos: meta.frecuenciaMinutos,
      ventanaInicio: meta.ventanaInicio,
      ventanaFin: meta.ventanaFin,
      diasHabiles: meta.diasHabiles,
    });
    if (!slot) return { skipped: true as const, reason: 'off-slot' };
    if (meta.lastCronSlot === slot) return { skipped: true as const, reason: 'already' };
    const result = await this.syncIndicadoresBc({}, { fromCron: true });
    await this.prisma.syncBcMeta.update({
      where: { id: SYNC_DEFAULT_ID },
      data: { lastCronSlot: slot },
    });
    return { skipped: false as const, slot, count: result.count };
  }

  // -------- PROVEEDORES --------
  private async syncContratistasMismoRut(empresaId: string, proveedorId: string, rut: string) {
    const norm = normalizeRutCatalogo(rut);
    const contratistas = await this.prisma.contratista.findMany({
      where: { empresaId },
      select: { id: true, rut: true, proveedorId: true },
    });
    const enlazar = contratistas
      .filter((row) => normalizeRutCatalogo(row.rut) === norm && row.proveedorId !== proveedorId)
      .map((row) => row.id);
    const desenlazar = contratistas
      .filter((row) => row.proveedorId === proveedorId && normalizeRutCatalogo(row.rut) !== norm)
      .map((row) => row.id);
    if (enlazar.length) {
      await this.prisma.contratista.updateMany({
        where: { id: { in: enlazar }, empresaId },
        data: { proveedorId },
      });
    }
    if (desenlazar.length) {
      await this.prisma.contratista.updateMany({
        where: { id: { in: desenlazar }, empresaId },
        data: { proveedorId: null },
      });
    }
  }

  async buscarContrapartePorRut(user: JwtPayload, rut: string, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const norm = normalizeRutCatalogo(rut || '');
    if (norm.length < 3) throw new BadRequestException('RUT inválido');
    const [proveedores, contratistas] = await Promise.all([
      this.prisma.proveedor.findMany({
        where: { empresaId },
        include: { direcciones: { orderBy: { principal: 'desc' }, take: 1 } },
      }),
      this.prisma.contratista.findMany({ where: { empresaId } }),
    ]);
    const proveedor = proveedores.find((row) => normalizeRutCatalogo(row.rut) === norm);
    const contratista = contratistas.find((row) => normalizeRutCatalogo(row.rut) === norm);
    const dir = proveedor?.direcciones?.[0];
    return {
      rut: norm,
      proveedor: proveedor
        ? {
            id: proveedor.id,
            rut: proveedor.rut,
            razonSocial: proveedor.razonSocial,
            giro: proveedor.giro,
            email: proveedor.email,
            telefono: proveedor.telefono,
            activo: proveedor.activo,
            direccion: dir?.linea ?? null,
            comuna: dir?.comuna ?? null,
            ciudad: dir?.ciudad ?? null,
          }
        : null,
      contratista: contratista
        ? {
            id: contratista.id,
            rut: contratista.rut,
            razonSocial: contratista.razonSocial,
            email: contratista.email,
            telefono: contratista.telefono1,
            direccion: contratista.direccion,
            comuna: contratista.comuna,
            ciudad: contratista.ciudad,
            activo: contratista.activo,
            proveedorId: contratista.proveedorId,
          }
        : null,
    };
  }

  private mapProveedor(row: {
    id: string;
    rut: string;
    razonSocial: string;
    giro: string | null;
    contacto: string | null;
    email: string | null;
    telefono: string | null;
    activo: boolean;
    empresaId: string;
    esProductor?: boolean;
    condicionPagoDias?: number | null;
    condicionIvaDia?: number | null;
    monedaPago?: string | null;
  }) {
    const dias =
      row.condicionPagoDias != null && Number.isInteger(row.condicionPagoDias) && row.condicionPagoDias >= 1
        ? row.condicionPagoDias
        : undefined;
    return {
      id: row.id,
      rut: row.rut,
      razonSocial: row.razonSocial,
      giro: row.giro ?? undefined,
      contacto: row.contacto ?? undefined,
      email: row.email ?? undefined,
      telefono: row.telefono ?? undefined,
      activo: row.activo,
      empresaId: row.empresaId,
      esProductor: row.esProductor ?? false,
      condicionPagoDias: dias,
      condicionIvaDia: row.condicionIvaDia ?? 10,
      monedaPago: (row.monedaPago?.trim().toUpperCase() || 'CLP'),
    };
  }

  async getProveedores(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const [rows, contratistas] = await Promise.all([
      this.prisma.proveedor.findMany({
        where: { empresaId },
        orderBy: { razonSocial: 'asc' },
      }),
      this.prisma.contratista.findMany({
        where: { empresaId },
        select: { rut: true, proveedorId: true },
      }),
    ]);
    const contratistaPorRut = new Set(contratistas.map((row) => normalizeRutCatalogo(row.rut)));
    const contratistaPorId = new Set(
      contratistas.map((row) => row.proveedorId).filter((id): id is string => Boolean(id)),
    );
    return rows.map((r) => ({
      ...this.mapProveedor(r),
      esContratista: contratistaPorId.has(r.id) || contratistaPorRut.has(normalizeRutCatalogo(r.rut)),
    }));
  }

  async getProveedor(user: JwtPayload, id: string, empresaHeader?: string) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const row = await this.prisma.proveedor.findFirst({
      where: { id, empresaId },
      include: fichaIncludeProveedor,
    });
    if (!row) throw new NotFoundException('Proveedor no encontrado');
    const contratistas = await this.prisma.contratista.findMany({
      where: { empresaId },
      select: { rut: true, proveedorId: true },
    });
    const esContratista = contratistas.some((item) =>
      item.proveedorId === row.id || normalizeRutCatalogo(item.rut) === normalizeRutCatalogo(row.rut),
    );
    return { ...this.mapProveedor(row), ...mapProveedorFicha(row), esContratista };
  }

  private async actorNombre(user: JwtPayload) {
    const u = await this.prisma.usuario.findUnique({ where: { id: user.sub }, select: { nombre: true } });
    return u?.nombre ?? user.email ?? user.sub;
  }

  async createProveedor(
    user: JwtPayload,
    dto: UpsertProveedorDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const rut = dto.rut.trim();
    if (!rut) throw new BadRequestException('rut es requerido');
    try {
      const row = await this.prisma.proveedor.create({
        data: {
          rut,
          razonSocial: dto.razonSocial.trim(),
          giro: dto.giro?.trim() || null,
          contacto: dto.contacto?.trim() || null,
          email: dto.email?.trim() || null,
          telefono: dto.telefono?.trim() || null,
          activo: dto.activo ?? true,
          esProductor: dto.esProductor ?? false,
          condicionPagoDias:
            dto.condicionPagoDias != null && Number.isInteger(dto.condicionPagoDias) && dto.condicionPagoDias >= 1
              ? dto.condicionPagoDias
              : null,
          condicionIvaDia: dto.condicionIvaDia ?? 10,
          monedaPago: dto.monedaPago?.trim().toUpperCase() || 'CLP',
          solicitadoPor: dto.solicitadoPor?.trim() || null,
          solicitadoNota: dto.solicitadoNota?.trim() || null,
          empresaId,
        },
      });
      await this.syncContratistasMismoRut(empresaId, row.id, row.rut);
      await syncProveedorFicha(this.prisma, {
        empresaId,
        proveedorId: row.id,
        nested: {
          cuentasBancarias: dto.cuentasBancarias,
          contactos: dto.contactos,
          direcciones: dto.direcciones,
        },
        actor: { id: user.sub, nombre: await this.actorNombre(user) },
        resumen: 'Alta de ficha',
        antes: null,
      });
      return this.getProveedor(user, row.id, empresaHeader);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un proveedor con ese RUT');
      }
      throw e;
    }
  }

  async updateProveedor(user: JwtPayload, id: string, dto: UpsertProveedorDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.proveedor.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Proveedor no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    try {
      const row = await this.prisma.proveedor.update({
        where: { id },
        data: {
          rut: dto.rut.trim(),
          razonSocial: dto.razonSocial.trim(),
          giro: dto.giro?.trim() || null,
          contacto: dto.contacto?.trim() || null,
          email: dto.email?.trim() || null,
          telefono: dto.telefono?.trim() || null,
          activo: dto.activo ?? true,
          ...(dto.esProductor !== undefined ? { esProductor: dto.esProductor } : {}),
          ...(dto.condicionPagoDias !== undefined
            ? {
              condicionPagoDias:
                dto.condicionPagoDias != null
                && Number.isInteger(dto.condicionPagoDias)
                && dto.condicionPagoDias >= 1
                  ? dto.condicionPagoDias
                  : null,
            }
            : {}),
          ...(dto.condicionIvaDia !== undefined ? { condicionIvaDia: dto.condicionIvaDia } : {}),
          ...(dto.monedaPago !== undefined
            ? { monedaPago: dto.monedaPago.trim().toUpperCase() || 'CLP' }
            : {}),
          ...(dto.solicitadoPor !== undefined ? { solicitadoPor: dto.solicitadoPor.trim() || null } : {}),
          ...(dto.solicitadoNota !== undefined ? { solicitadoNota: dto.solicitadoNota.trim() || null } : {}),
        },
      });
      await this.syncContratistasMismoRut(existing.empresaId, row.id, row.rut);
      await syncProveedorFicha(this.prisma, {
        empresaId: existing.empresaId,
        proveedorId: id,
        nested: {
          cuentasBancarias: dto.cuentasBancarias,
          contactos: dto.contactos,
          direcciones: dto.direcciones,
        },
        actor: { id: user.sub, nombre: await this.actorNombre(user) },
        resumen: 'Edición de ficha',
        antes: existing,
      });
      // Igual que updateCliente: usar empresa del registro, no la del JWT
      // (admin multi-empresa operando EMP-2 con JWT EMP-1).
      return this.getProveedor(user, row.id, existing.empresaId);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un proveedor con ese RUT');
      }
      throw e;
    }
  }

  /** Resuelve o crea proveedor por RUT/razón social (para OC/seed). */
  async resolveProveedorId(
    empresaId: string,
    opts: { proveedorId?: string; razonSocial?: string; rut?: string },
  ): Promise<{ id: string; razonSocial: string; rut: string } | null> {
    if (opts.proveedorId) {
      const p = await this.prisma.proveedor.findFirst({
        where: { id: opts.proveedorId, empresaId },
      });
      if (p) return { id: p.id, razonSocial: p.razonSocial, rut: p.rut };
    }
    const rut = opts.rut?.trim();
    if (rut) {
      const p = await this.prisma.proveedor.findUnique({
        where: { empresaId_rut: { empresaId, rut } },
      });
      if (p) return { id: p.id, razonSocial: p.razonSocial, rut: p.rut };
    }
    const nombre = opts.razonSocial?.trim();
    if (nombre) {
      const p = await this.prisma.proveedor.findFirst({
        where: { empresaId, razonSocial: { equals: nombre, mode: 'insensitive' } },
      });
      if (p) return { id: p.id, razonSocial: p.razonSocial, rut: p.rut };
    }
    return null;
  }

  private mapConceptoFlujo(r: {
    id: string;
    codigo: string;
    nombre: string;
    orden: number;
    activo: boolean;
    empresaId: string;
  }) {
    return {
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      orden: r.orden,
      activo: r.activo,
      empresaId: r.empresaId,
    };
  }

  private mapCodigoFinanciero(r: {
    id: string;
    codigo: string;
    nombre: string;
    activa: boolean;
    empresaId: string;
    conceptoId?: string | null;
    concepto?: { id: string; codigo: string; nombre: string } | null;
    createdAt?: Date;
  }) {
    return {
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      activa: r.activa,
      empresaId: r.empresaId,
      conceptoId: r.conceptoId ?? undefined,
      conceptoCodigo: r.concepto?.codigo,
      conceptoNombre: r.concepto?.nombre,
      createdAt: r.createdAt?.toISOString(),
    };
  }

  private async resolveConceptoId(empresaId: string, conceptoId?: string | null): Promise<string | null> {
    const id = conceptoId?.trim();
    if (!id) return null;
    const row = await this.prisma.conceptoFlujo.findFirst({
      where: { id, empresaId },
    });
    if (!row) throw new BadRequestException('El concepto no existe en la empresa');
    return row.id;
  }

  async getConceptosFlujo(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const permisos = user.permisos ?? [];
    const veInactivos =
      permisos.includes('*') ||
      permisos.includes('catalogos:read') ||
      permisos.includes('catalogos:write') ||
      permisos.includes('admin:read');
    const rows = await this.prisma.conceptoFlujo.findMany({
      where: { empresaId, ...(veInactivos ? {} : { activo: true }) },
      orderBy: [{ activo: 'desc' }, { orden: 'asc' }, { codigo: 'asc' }],
    });
    return rows.map((r) => this.mapConceptoFlujo(r));
  }

  async createConceptoFlujo(
    user: JwtPayload,
    dto: UpsertConceptoFlujoDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    try {
      const row = await this.prisma.conceptoFlujo.create({
        data: {
          codigo: dto.codigo.trim().toUpperCase(),
          nombre: dto.nombre.trim(),
          orden: dto.orden ?? 0,
          activo: dto.activo ?? true,
          empresaId,
        },
      });
      return this.mapConceptoFlujo(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un concepto con ese código en la empresa');
      }
      throw e;
    }
  }

  async updateConceptoFlujo(user: JwtPayload, id: string, dto: UpsertConceptoFlujoDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.conceptoFlujo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Concepto no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    try {
      const row = await this.prisma.conceptoFlujo.update({
        where: { id },
        data: {
          codigo: dto.codigo.trim().toUpperCase(),
          nombre: dto.nombre.trim(),
          orden: dto.orden ?? existing.orden,
          activo: dto.activo ?? existing.activo,
        },
      });
      return this.mapConceptoFlujo(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un concepto con ese código en la empresa');
      }
      throw e;
    }
  }

  async getCodigosFinancieros(
    user: JwtPayload,
    empresaHeader?: string,
    empresaQuery?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader || empresaQuery);
    const permisos = user.permisos ?? [];
    const veInactivos =
      permisos.includes('*') ||
      permisos.includes('catalogos:read') ||
      permisos.includes('catalogos:write') ||
      permisos.includes('admin:read');
    const rows = await this.prisma.codigoFinanciero.findMany({
      where: { empresaId, ...(veInactivos ? {} : { activa: true }) },
      include: { concepto: { select: { id: true, codigo: true, nombre: true } } },
      orderBy: [{ activa: 'desc' }, { codigo: 'asc' }],
    });
    return rows.map((r) => this.mapCodigoFinanciero(r));
  }

  async createCodigoFinanciero(
    user: JwtPayload,
    dto: UpsertCodigoFinancieroDto,
    empresaHeader?: string,
  ) {
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const conceptoId = await this.resolveConceptoId(empresaId, dto.conceptoId);
    const codigo = assertCodigoCatalogoNuevo(dto.codigo);
    const nombre = normalizeNombreCatalogo(dto.nombre);
    try {
      const row = await this.prisma.codigoFinanciero.create({
        data: {
          codigo,
          nombre,
          activa: dto.activa ?? true,
          conceptoId,
          empresaId,
        },
        include: { concepto: { select: { id: true, codigo: true, nombre: true } } },
      });
      return this.mapCodigoFinanciero(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un código financiero con ese código en la empresa');
      }
      throw e;
    }
  }

  async updateCodigoFinanciero(user: JwtPayload, id: string, dto: UpsertCodigoFinancieroDto) {
    const scope = resolveTenant(user);
    const existing = await this.prisma.codigoFinanciero.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Código financiero no encontrado');
    assertTenantAccess(scope, existing.empresaId);
    assertCodigoCatalogoInmutable(existing.codigo, dto.codigo);
    const conceptoId = await this.resolveConceptoId(existing.empresaId, dto.conceptoId);
    try {
      const row = await this.prisma.codigoFinanciero.update({
        where: { id },
        data: {
          nombre: normalizeNombreCatalogo(dto.nombre),
          activa: dto.activa ?? existing.activa,
          conceptoId,
        },
        include: { concepto: { select: { id: true, codigo: true, nombre: true } } },
      });
      return this.mapCodigoFinanciero(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un código financiero con ese código en la empresa');
      }
      throw e;
    }
  }

  async previewCodigosFinancierosExcel(
    user: JwtPayload,
    file: Express.Multer.File | undefined,
    empresaHeader?: string,
  ) {
    const parsed = await this.parseCodigosFinancierosExcel(file);
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const existing = await this.prisma.codigoFinanciero.findMany({ where: { empresaId } });
    const byCodigo = new Map(existing.map((e) => [e.codigo, e]));
    const fields = [
      { key: 'nombre' as const, label: 'Nombre' },
      { key: 'activa' as const, label: 'Activa' },
    ];
    const items = parsed.items.map((it) => {
      const prev = byCodigo.get(it.codigo);
      const { accion, cambios } = clasificarFilaImport(
        { nombre: it.nombre, activa: it.activa },
        prev ? { nombre: prev.nombre, activa: prev.activa } : undefined,
        fields,
      );
      return { codigo: it.codigo, nombre: it.nombre, activa: it.activa, accion, cambios };
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
      skippedInFile: parsed.skippedInFile,
    };
  }

  async importCodigosFinancierosExcel(
    user: JwtPayload,
    dto: ImportCodigosFinancierosExcelDto,
    empresaHeader?: string,
  ) {
    if (!dto.items?.length) throw new BadRequestException('No hay filas para importar');
    const empresaId = resolveOperationalEmpresa(user, empresaHeader);
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.codigoFinanciero.findMany({ where: { empresaId } });
      const byCodigo = new Map(existing.map((e) => [e.codigo, e]));
      let created = 0;
      let updated = 0;
      let unchanged = 0;
      const resumen: { codigo: string; cambios: string[] }[] = [];
      for (const raw of dto.items) {
        const codigo = raw.codigo.trim().toUpperCase();
        const nombre = normalizeNombreCatalogo(raw.nombre);
        if (!codigo || !nombre) continue;
        const found = byCodigo.get(codigo);
        if (!found) {
          await tx.codigoFinanciero.create({
            data: {
              codigo: assertCodigoCatalogoNuevo(codigo),
              nombre,
              activa: raw.activa ?? true,
              empresaId,
            },
          });
          created += 1;
          resumen.push({ codigo, cambios: ['Nuevo'] });
          continue;
        }
        const data: { nombre?: string; activa?: boolean } = {};
        const cambios: string[] = [];
        if (nombre !== found.nombre) {
          data.nombre = nombre;
          cambios.push(`Nombre: ${found.nombre} → ${nombre}`);
        }
        if (raw.activa !== undefined && raw.activa !== found.activa) {
          data.activa = raw.activa;
          cambios.push(`Activa: ${found.activa ? 'SI' : 'NO'} → ${raw.activa ? 'SI' : 'NO'}`);
        }
        if (!Object.keys(data).length) {
          unchanged += 1;
          continue;
        }
        await tx.codigoFinanciero.update({ where: { id: found.id }, data });
        updated += 1;
        resumen.push({ codigo, cambios });
      }
      return { ok: true, created, updated, unchanged, total: dto.items.length, resumen };
    });
    await registrarCatalogoImportacion(this.prisma, {
      empresaId,
      user,
      tipo: 'CODIGOS_FINANCIEROS',
      archivoNombre: dto.archivoNombre,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      resumen: result.resumen,
    });
    return result;
  }

  private async parseCodigosFinancierosExcel(file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Archivo .xlsx requerido (campo file)');
    }
    const XLSX = await import('xlsx');
    try {
      const parsed = parseCodigoNombreWorkbook(
        XLSX,
        file.buffer,
        /codigosfinancieros|financiero/i,
        'Codigos financieros',
      );
      return {
        ignoredHeaders: parsed.ignoredHeaders,
        skippedInFile: parsed.skippedInFile,
        items: parsed.items.map((r) => ({
          codigo: r.codigo,
          nombre: r.nombre,
          activa: parseActiva(r.extra.activa),
        })),
      };
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Excel inválido');
    }
  }
}

function normalizeRutCatalogo(value: string): string {
  return value.replace(/[.\s-]/g, '').toUpperCase();
}
