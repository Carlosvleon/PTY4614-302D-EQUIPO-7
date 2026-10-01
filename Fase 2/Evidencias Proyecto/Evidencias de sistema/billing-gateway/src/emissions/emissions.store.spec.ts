import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import {
  DEFAULT_BILLING_STORE_PATH,
  resolveBillingStorePath,
  SqliteEmissionsStore,
} from './emissions.store';
import type { CanonicalDocumentV1, EmissionResult } from '../common/types';

function sampleCanonical(): CanonicalDocumentV1 {
  return {
    schemaVersion: '1.0',
    idempotencyKey: 'k-1',
    source: { erpId: 'almahue', empresaId: 'EMP-1', documentoId: 'd1' },
    emisor: { rut: '76.000.000-0', razonSocial: 'Almahue SpA' },
    receptor: { rut: '55.555.555-5', razonSocial: 'Cliente' },
    documento: { tipoDte: 33, fechaEmision: '2026-08-19', numeroInterno: '1' },
    totales: { neto: 100, iva: 19, total: 119 },
    lineas: [{ nro: 1, descripcion: 'x', cantidad: 1, precio: 100, montoNeto: 100 }],
  };
}

function sampleResult(status: EmissionResult['status'], emissionId = 'em-1'): EmissionResult {
  return {
    emissionId,
    partner: 'stub',
    connectionMode: 'stub',
    status,
    folioOficial: null,
    folioSimulado: 'STUB-33-1',
    globalDocumentId: null,
    countryDocumentId: null,
    messages: [],
    disclaimer: null,
    artifacts: { pdfAvailable: false, xmlAvailable: false, dummy: true },
    stub: true,
  };
}

describe('SqliteEmissionsStore', () => {
  it('BILLING_STORE_PATH vacío usa el default local', () => {
    expect(resolveBillingStorePath({})).toBe(resolve(DEFAULT_BILLING_STORE_PATH));
    expect(resolveBillingStorePath({ BILLING_STORE_PATH: '' })).toBe(
      resolve(DEFAULT_BILLING_STORE_PATH),
    );
    expect(resolveBillingStorePath({ BILLING_STORE_PATH: '   ' })).toBe(
      resolve(DEFAULT_BILLING_STORE_PATH),
    );
  });

  it('persiste y relee PENDING desde archivo (nueva instancia)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'billing-sqlite-'));
    const filePath = join(dir, 'emissions.sqlite');
    try {
      const first = SqliteEmissionsStore.open(filePath);
      const canonical = sampleCanonical();
      first.persist(
        {
          ...sampleResult('PENDING'),
          canonical,
          canonicalFingerprint: 'fp-pending',
        },
        true,
      );
      first.close();

      const second = SqliteEmissionsStore.open(filePath);
      const idem = second.getIdempotency('almahue', 'EMP-1', 'k-1');
      expect(idem).toEqual({ emissionId: 'em-1', canonicalFingerprint: 'fp-pending' });
      expect(second.getById('em-1')?.status).toBe('PENDING');
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('REJECTED no escribe fila de idempotencia', () => {
    const store = SqliteEmissionsStore.open(':memory:');
    store.persist(
      {
        ...sampleResult('REJECTED'),
        canonical: sampleCanonical(),
        canonicalFingerprint: 'fp-rej',
      },
      false,
    );
    expect(store.getById('em-1')?.status).toBe('REJECTED');
    expect(store.getIdempotency('almahue', 'EMP-1', 'k-1')).toBeUndefined();
    store.close();
  });
});
