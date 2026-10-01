import { Injectable } from '@nestjs/common';
import { CatalogosService } from '../../catalogos/catalogos.service';
import {
  FiltroIndicadoresDto,
  UpdateConfigSyncDto,
} from './dto/indicadores-bc.dto';

@Injectable()
export class IndicadoresBcService {
  constructor(private readonly catalogosService: CatalogosService) {}

  /**
   * Consulta los tipos de cambio almacenados con filtros
   */
  async getIndicadores(filtros: FiltroIndicadoresDto, _empresaId?: string) {
    const records = await this.catalogosService.getIndicadoresBc(filtros.desde, filtros.hasta);

    if (filtros.monedaCodigo || filtros.formato === 'detalle') {
      const result: any[] = [];
      const codFiltro = filtros.monedaCodigo ? filtros.monedaCodigo.toUpperCase() : null;

      for (const r of records) {
        if (!codFiltro || codFiltro === 'USD') {
          result.push({
            id: `${r.id}-USD`,
            fecha: r.fecha,
            valor: r.usd,
            fuente: r.fuente,
            origen: r.origenSync || 'API_BCCH',
            esFeriado: r.completadoFeriado,
            moneda: { codigo: 'USD', nombre: 'Dólar Observado', simbolo: '$' },
          });
        }
        if (!codFiltro || codFiltro === 'EUR') {
          result.push({
            id: `${r.id}-EUR`,
            fecha: r.fecha,
            valor: r.eur,
            fuente: r.fuente,
            origen: r.origenSync || 'API_BCCH',
            esFeriado: r.completadoFeriado,
            moneda: { codigo: 'EUR', nombre: 'Euro', simbolo: '€' },
          });
        }
        if (!codFiltro || codFiltro === 'CNY') {
          result.push({
            id: `${r.id}-CNY`,
            fecha: r.fecha,
            valor: r.cny,
            fuente: r.fuente,
            origen: r.origenSync || 'API_BCCH',
            esFeriado: r.completadoFeriado,
            moneda: { codigo: 'CNY', nombre: 'Yuan Chino', simbolo: '¥' },
          });
        }
      }
      return result;
    }

    return records.map((r) => ({
      ...r,
      valor: r.usd,
      moneda: { codigo: 'USD', nombre: 'Dólar Observado', simbolo: '$' },
      origen: r.origenSync || 'API_BCCH',
      esFeriado: r.completadoFeriado,
    }));
  }

  /**
   * Sincroniza tipos de cambio con el Banco Central para un rango de fechas
   */
  async sincronizarRango(desde?: string, hasta?: string, _empresaId?: string) {
    const result = await this.catalogosService.syncIndicadoresBc({ desde, hasta });
    const count = result?.count ?? 0;
    return {
      ok: true,
      mensaje: `Sincronización finalizada exitosamente: ${count} registros actualizados.`,
      desde: desde ?? '',
      hasta: hasta ?? '',
      totalSincronizados: count,
      detalle: [
        { codigo: 'USD', registrosGuardados: count },
        { codigo: 'EUR', registrosGuardados: count },
        { codigo: 'CNY', registrosGuardados: count },
      ],
    };
  }

  /**
   * Obtiene la configuración de sincronización automática
   */
  async getConfigSync(_empresaId?: string) {
    const meta = await this.catalogosService.getSyncBcMeta();
    return {
      id: 'default',
      syncAutomatica: meta.modo === 'auto',
      tipoProgramacion: 'HORAS_FIJAS',
      horas: meta.horarios && meta.horarios.length > 0 ? meta.horarios : ['09:00'],
      intervaloMinutos: meta.frecuenciaMinutos ?? 60,
      soloDiasHabiles: meta.diasHabiles,
      ultimaSyncAt: meta.ultimaSync || null,
      ultimoEstado: meta.lastStatus || null,
      ultimoError: meta.lastError || null,
    };
  }

  /**
   * Actualiza la configuración de sincronización automática
   */
  async updateConfigSync(dto: UpdateConfigSyncDto, _empresaId?: string) {
    const updated = await this.catalogosService.updateSyncBcMeta({
      modo: dto.syncAutomatica ? 'auto' : 'manual',
      horarios: dto.horas,
      frecuenciaMinutos: dto.intervaloMinutos,
      diasHabiles: dto.soloDiasHabiles,
    });
    return {
      id: 'default',
      syncAutomatica: updated.modo === 'auto',
      tipoProgramacion: 'HORAS_FIJAS',
      horas: updated.horarios && updated.horarios.length > 0 ? updated.horarios : ['09:00'],
      intervaloMinutos: updated.frecuenciaMinutos ?? 60,
      soloDiasHabiles: updated.diasHabiles,
      ultimaSyncAt: updated.ultimaSync || null,
      ultimoEstado: updated.lastStatus || null,
      ultimoError: updated.lastError || null,
    };
  }

  /**
   * Genera el CSV de plantilla
   */
  generarPlantillaCsv(): string {
    return 'fecha,usd,eur,cny\n2026-09-24,930.50,1015.20,130.10\n';
  }

  /**
   * Importa tipos de cambio históricos desde un archivo CSV
   */
  async importarCsv(buffer: Buffer, _empresaId?: string) {
    const content = buffer.toString('utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const items: Array<{ fecha: string; usd?: number; eur?: number; cny?: number }> = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      if (cols.length >= 2) {
        items.push({
          fecha: cols[0],
          usd: parseFloat(cols[1]) || 0,
          eur: parseFloat(cols[2]) || 0,
          cny: parseFloat(cols[3]) || 0,
        });
      }
    }

    const resultado = await this.catalogosService.importIndicadoresBcExcel({ items });
    return {
      ok: true,
      mensaje: `Se importaron ${resultado.total} registros correctamente.`,
      totalImportados: resultado.total,
    };
  }
}
