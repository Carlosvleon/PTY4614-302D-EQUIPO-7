import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hydrateDocumentoAging,
  kpisNomina,
  matchesNominaFiltro,
  nominaExportFilename,
  NOMINA_EXPORT_COLUMNS,
  pickSemanaEnPeriodo,
  pickSemanaNominaInicial,
  type NominaAgingRow,
} from './nomina-semana.ts';

function row(partial: Partial<NominaAgingRow> & Pick<NominaAgingRow, 'id' | 'documento'>): NominaAgingRow {
  return {
    tipo: 'POR_PAGAR',
    contraparte: 'Proveedor',
    fechaEmision: '2026-08-01',
    fechaVencimiento: '2026-08-17',
    monto: 1000,
    saldo: 1000,
    diasAtraso: 0,
    estado: 'AL_DIA',
    ...partial,
  };
}

describe('nomina-semana', () => {
  it('hydrate: saldo 0 = PAGADA; compromiso distinto = aplazada; no pisa vencimiento', () => {
    const pagada = hydrateDocumentoAging(row({
      id: '1',
      documento: 'FAC-1',
      saldo: 0,
      monto: 1000,
      semanaCompromiso: '2026-09-S1',
    }));
    assert.equal(pagada.nominaEstado, 'PAGADA');
    assert.equal(pagada.semanaNatural, '2026-08-S1');
    assert.equal(pagada.semanaCompromiso, '2026-09-S1');
    assert.equal(pagada.aplazada, true);
    assert.equal(pagada.fechaVencimiento, '2026-08-17');
    assert.equal(pagada.montoPagado, 1000);

    const pendiente = hydrateDocumentoAging(row({
      id: '2',
      documento: 'FAC-2',
      saldo: 500,
      monto: 500,
    }));
    assert.equal(pendiente.nominaEstado, 'PENDIENTE');
    assert.equal(pendiente.semanaCompromiso, '2026-08-S1');
    assert.equal(pendiente.aplazada, false);
  });

  it('filtro pendientes vs todos usa nominaEstado / saldo', () => {
    const a = hydrateDocumentoAging(row({ id: 'a', documento: 'A', saldo: 10 }));
    const b = hydrateDocumentoAging(row({ id: 'b', documento: 'B', saldo: 0, montoPagado: 10 }));
    assert.equal(matchesNominaFiltro(a, 'PENDIENTES'), true);
    assert.equal(matchesNominaFiltro(b, 'PENDIENTES'), false);
    assert.equal(matchesNominaFiltro(b, 'TODOS'), true);
  });

  it('KPIs de semana vs mes: solo saldo pendiente en asignados', () => {
    const semana = [
      hydrateDocumentoAging(row({
        id: 's1',
        documento: 'S1',
        saldo: 200,
        monto: 200,
        diasAtraso: 3,
        semanaCompromiso: '2026-08-S3',
      })),
      hydrateDocumentoAging(row({
        id: 's2',
        documento: 'S2',
        saldo: 0,
        monto: 50,
        montoPagado: 50,
        semanaCompromiso: '2026-08-S3',
      })),
    ];
    const mes = [
      ...semana,
      hydrateDocumentoAging(row({
        id: 'm1',
        documento: 'M1',
        saldo: 80,
        monto: 80,
        fechaVencimiento: '2026-08-04',
        semanaCompromiso: '2026-08-S1',
      })),
    ];
    const kSem = kpisNomina(semana);
    const kMes = kpisNomina(mes);
    assert.equal(kSem.asignados, 200);
    assert.equal(kSem.pagados, 50);
    assert.equal(kSem.atrasados, 200);
    assert.equal(kSem.docs, 2);
    assert.equal(kMes.asignados, 280);
    assert.equal(kMes.docs, 3);
    assert.ok(kMes.asignados > kSem.asignados);
  });

  it('pickSemanaEnPeriodo: salta S3 vacío al primer bloque del mes con docs', () => {
    const rows: NominaAgingRow[] = [
      hydrateDocumentoAging(row({
        id: 'a',
        documento: 'A',
        saldo: 10,
        semanaCompromiso: '2026-06-S1',
      })),
      hydrateDocumentoAging(row({
        id: 'b',
        documento: 'B',
        saldo: 10,
        semanaCompromiso: '2026-08-S2',
      })),
    ];
    assert.equal(pickSemanaEnPeriodo(rows, '2026-06', '2026-06-S3'), '2026-06-S1');
    assert.equal(pickSemanaEnPeriodo(rows, '2026-06', '2026-06-S1'), '2026-06-S1');
    assert.equal(pickSemanaEnPeriodo(rows, '2026-07', '2026-07-S3'), '2026-07-S3');
  });

  it('pickSemanaNominaInicial: si hoy no tiene docs, usa la última semana con pendientes', () => {
    const rows: NominaAgingRow[] = [
      hydrateDocumentoAging(row({
        id: 'a',
        documento: 'A',
        saldo: 10,
        semanaCompromiso: '2026-08-S3',
      })),
      hydrateDocumentoAging(row({
        id: 'b',
        documento: 'B',
        saldo: 10,
        semanaCompromiso: '2026-09-S1',
      })),
      hydrateDocumentoAging(row({
        id: 'c',
        documento: 'C',
        tipo: 'POR_COBRAR',
        saldo: 99,
        semanaCompromiso: '2026-09-S3',
      })),
    ];
    assert.equal(pickSemanaNominaInicial(rows, '2026-09-S3'), '2026-09-S1');
    assert.equal(pickSemanaNominaInicial(rows, '2026-09-S1'), '2026-09-S1');
    assert.equal(pickSemanaNominaInicial([], '2026-09-S3'), '2026-09-S3');
  });

  it('export: nombre de archivo y columnas del periodo', () => {
    assert.equal(nominaExportFilename('2026-09-S1'), 'nomina-semanal-pagos-2026-09-S1');
    assert.ok(NOMINA_EXPORT_COLUMNS.some((c) => c.key === 'semanaCompromiso'));
    const sample = hydrateDocumentoAging(row({ id: 'x', documento: 'FAC-X', rut: '1-9' }));
    const docCol = NOMINA_EXPORT_COLUMNS.find((c) => c.key === 'documento');
    assert.equal(docCol?.value(sample), 'FAC-X');
  });
});
