import { Injectable, BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

export interface FilaCsvTipoCambio {
  fecha: string;
  codigoMoneda: string;
  valor: number;
  fuente?: string;
  esFeriado?: boolean;
}

@Injectable()
export class TipoCambioCsvService {
  /**
   * Genera el contenido de una plantilla CSV lista para importar tipos de cambio históricos
   */
  generarPlantilla(): string {
    const filasEjemplo = [
      {
        Fecha: '2026-09-22',
        CodigoMoneda: 'USD',
        Valor: '942.80',
        Fuente: 'Banco Central',
        EsFeriado: 'NO',
      },
      {
        Fecha: '2026-09-23',
        CodigoMoneda: 'USD',
        Valor: '946.10',
        Fuente: 'Banco Central',
        EsFeriado: 'NO',
      },
      {
        Fecha: '2026-09-24',
        CodigoMoneda: 'USD',
        Valor: '945.50',
        Fuente: 'Banco Central',
        EsFeriado: 'NO',
      },
      {
        Fecha: '2026-09-24',
        CodigoMoneda: 'EUR',
        Valor: '1042.30',
        Fuente: 'Banco Central',
        EsFeriado: 'NO',
      },
    ];

    return stringify(filasEjemplo, {
      header: true,
      delimiter: ';',
    });
  }

  /**
   * Parsea un buffer de archivo CSV y valida las filas
   */
  parsearCsv(buffer: Buffer): FilaCsvTipoCambio[] {
    const contenido = buffer.toString('utf-8');
    // Detectar delimitador (punto y coma o coma)
    const delimiter = contenido.includes(';') ? ';' : ',';

    let records: any[];
    try {
      records = parse(contenido, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter,
      });
    } catch (err: any) {
      throw new BadRequestException(`Formato CSV inválido: ${err.message}`);
    }

    if (!records || records.length === 0) {
      throw new BadRequestException('El archivo CSV está vacío.');
    }

    const resultado: FilaCsvTipoCambio[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const filaNum = i + 2;

      // Buscar campos tolerando mayúsculas/minúsculas
      const fecha = (row.Fecha || row.fecha || '').trim();
      const codigoMoneda = (row.CodigoMoneda || row.codigoMoneda || row.Moneda || row.moneda || '').trim().toUpperCase();
      const rawValor = (row.Valor || row.valor || '').trim().replace(',', '.');
      const fuente = (row.Fuente || row.fuente || 'CSV_HISTORICO').trim();
      const rawFeriado = (row.EsFeriado || row.esFeriado || 'NO').trim().toUpperCase();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        throw new BadRequestException(
          `Fila ${filaNum}: La fecha "${fecha}" no tiene el formato requerido YYYY-MM-DD.`,
        );
      }

      if (!codigoMoneda) {
        throw new BadRequestException(`Fila ${filaNum}: Código de moneda vacío.`);
      }

      const valor = parseFloat(rawValor);
      if (isNaN(valor) || valor <= 0) {
        throw new BadRequestException(`Fila ${filaNum}: Valor numérico inválido "${rawValor}".`);
      }

      resultado.push({
        fecha,
        codigoMoneda,
        valor,
        fuente,
        esFeriado: rawFeriado === 'SI' || rawFeriado === 'TRUE' || rawFeriado === '1',
      });
    }

    return resultado;
  }
}
