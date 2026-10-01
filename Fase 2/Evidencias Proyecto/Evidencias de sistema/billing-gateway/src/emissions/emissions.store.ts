import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { DatabaseSync } from 'node:sqlite';
import type { CanonicalDocumentV1, EmissionResult } from '../common/types';

export const DEFAULT_BILLING_STORE_PATH = './data/emissions.sqlite';

export type StoredEmission = EmissionResult & {
  canonical: CanonicalDocumentV1;
  canonicalFingerprint: string;
  pdf?: Buffer;
  xml?: string;
};

export interface IdempotencyRecord {
  emissionId: string;
  canonicalFingerprint: string;
}

interface EmissionRow {
  emission_id: string;
  result_json: string;
  canonical_json: string;
  canonical_fingerprint: string;
  pdf: Uint8Array | Buffer | null;
  xml: string | null;
}

/**
 * Store durable de emisiones e idempotencia (SQLite archivo, `node:sqlite`).
 * Una instancia / un proceso. Multi-réplica requiere store compartido (no implementado).
 */
export class SqliteEmissionsStore {
  private readonly db: DatabaseSync;

  static open(filePath: string): SqliteEmissionsStore {
    return new SqliteEmissionsStore(filePath);
  }

  static openFromEnv(env: NodeJS.ProcessEnv = process.env): SqliteEmissionsStore {
    return new SqliteEmissionsStore(resolveBillingStorePath(env));
  }

  private constructor(readonly filePath: string) {
    const memory = isMemoryPath(filePath);
    if (!memory) {
      mkdirSync(dirname(filePath), { recursive: true });
    }
    this.db = new DatabaseSync(filePath);
    this.db.exec('PRAGMA foreign_keys = ON');
    if (!memory) {
      this.db.exec('PRAGMA journal_mode = WAL');
      // FULL ≈ fsync en cada COMMIT (durable ante reinicio del proceso).
      this.db.exec('PRAGMA synchronous = FULL');
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS emissions (
        emission_id TEXT PRIMARY KEY NOT NULL,
        erp_id TEXT NOT NULL,
        empresa_id TEXT NOT NULL,
        status TEXT NOT NULL,
        result_json TEXT NOT NULL,
        canonical_json TEXT NOT NULL,
        canonical_fingerprint TEXT NOT NULL,
        pdf BLOB,
        xml TEXT
      );
      CREATE TABLE IF NOT EXISTS idempotency (
        erp_id TEXT NOT NULL,
        empresa_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        emission_id TEXT NOT NULL,
        canonical_fingerprint TEXT NOT NULL,
        PRIMARY KEY (erp_id, empresa_id, idempotency_key),
        FOREIGN KEY (emission_id) REFERENCES emissions(emission_id)
      );
    `);
  }

  listByErp(erpId: string, opts?: { empresaId?: string; limit?: number }): StoredEmission[] {
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
    const empresaId = opts?.empresaId?.trim();
    const sql = empresaId
      ? `SELECT emission_id, result_json, canonical_json, canonical_fingerprint, pdf, xml
         FROM emissions WHERE erp_id = ? AND empresa_id = ?
         ORDER BY rowid DESC LIMIT ?`
      : `SELECT emission_id, result_json, canonical_json, canonical_fingerprint, pdf, xml
         FROM emissions WHERE erp_id = ?
         ORDER BY rowid DESC LIMIT ?`;
    const rows = empresaId
      ? this.db.prepare(sql).all(erpId, empresaId, limit)
      : this.db.prepare(sql).all(erpId, limit);
    return (rows as unknown as EmissionRow[]).map(mapRow);
  }

  getById(emissionId: string): StoredEmission | undefined {
    const row = this.db
      .prepare(
        `SELECT emission_id, result_json, canonical_json, canonical_fingerprint, pdf, xml
         FROM emissions WHERE emission_id = ?`,
      )
      .get(emissionId) as EmissionRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  getIdempotency(
    erpId: string,
    empresaId: string,
    idempotencyKey: string,
  ): IdempotencyRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT emission_id, canonical_fingerprint
         FROM idempotency
         WHERE erp_id = ? AND empresa_id = ? AND idempotency_key = ?`,
      )
      .get(erpId, empresaId, idempotencyKey) as
      | { emission_id: string; canonical_fingerprint: string }
      | undefined;
    if (!row) return undefined;
    return {
      emissionId: row.emission_id,
      canonicalFingerprint: row.canonical_fingerprint,
    };
  }

  deleteIdempotency(erpId: string, empresaId: string, idempotencyKey: string): void {
    this.db
      .prepare(
        `DELETE FROM idempotency
         WHERE erp_id = ? AND empresa_id = ? AND idempotency_key = ?`,
      )
      .run(erpId, empresaId, idempotencyKey);
  }

  persist(stored: StoredEmission, cacheIdempotency: boolean): void {
    const { canonical, canonicalFingerprint, pdf, xml, ...result } = stored;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `INSERT INTO emissions (
             emission_id, erp_id, empresa_id, status, result_json,
             canonical_json, canonical_fingerprint, pdf, xml
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(emission_id) DO UPDATE SET
             erp_id = excluded.erp_id,
             empresa_id = excluded.empresa_id,
             status = excluded.status,
             result_json = excluded.result_json,
             canonical_json = excluded.canonical_json,
             canonical_fingerprint = excluded.canonical_fingerprint,
             pdf = excluded.pdf,
             xml = excluded.xml`,
        )
        .run(
          result.emissionId,
          canonical.source.erpId,
          canonical.source.empresaId,
          result.status,
          JSON.stringify(result),
          JSON.stringify(canonical),
          canonicalFingerprint,
          pdf && pdf.length ? pdf : null,
          xml ?? null,
        );

      if (cacheIdempotency) {
        this.db
          .prepare(
            `INSERT INTO idempotency (
               erp_id, empresa_id, idempotency_key, emission_id, canonical_fingerprint
             ) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(erp_id, empresa_id, idempotency_key) DO UPDATE SET
               emission_id = excluded.emission_id,
               canonical_fingerprint = excluded.canonical_fingerprint`,
          )
          .run(
            canonical.source.erpId,
            canonical.source.empresaId,
            canonical.idempotencyKey,
            result.emissionId,
            canonicalFingerprint,
          );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    if (this.db.isOpen) this.db.close();
  }

  onModuleDestroy(): void {
    this.close();
  }
}

export function resolveBillingStorePath(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.BILLING_STORE_PATH?.trim();
  if (raw && isMemoryPath(raw)) return raw;
  return resolve(raw && raw.length > 0 ? raw : DEFAULT_BILLING_STORE_PATH);
}

function isMemoryPath(filePath: string): boolean {
  return filePath === ':memory:';
}

function mapRow(row: EmissionRow): StoredEmission {
  const result = JSON.parse(row.result_json) as EmissionResult;
  const canonical = JSON.parse(row.canonical_json) as CanonicalDocumentV1;
  const pdf = toBuffer(row.pdf);
  return {
    ...result,
    canonical,
    canonicalFingerprint: row.canonical_fingerprint,
    ...(pdf ? { pdf } : {}),
    ...(row.xml ? { xml: row.xml } : {}),
  };
}

function toBuffer(value: Uint8Array | Buffer | null): Buffer | undefined {
  if (!value || value.length === 0) return undefined;
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}
