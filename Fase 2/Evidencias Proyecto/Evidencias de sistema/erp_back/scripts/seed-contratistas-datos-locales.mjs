/**
 * Completa datos locales de contratistas sin tocar el resto del ERP.
 * Idempotente: se puede correr más de una vez.
 *
 * - Crea el tipo MANO_OBRA si no existe (cuentas de la misma empresa).
 * - Asigna ese tipo a tarifas, proformas e ingresos que lo tengan vacío.
 * - Si no hay ingresos pendientes, carga jornadas de septiembre 2026
 *   al precio de la tarifa vigente.
 */
import 'dotenv/config';
import pg from 'pg';

const CUENTAS = {
  'EMP-EXPORT': {
    debe: '6-1-01-01-002',
    haber: '2-1-08-02-003',
    admin: '6-2-01-02-029',
  },
  'EMP-SERVICES': {
    debe: '5-1-01-01',
    haber: '2-1-01-01',
    admin: '5-1-01-01',
  },
};

const JORNADAS = [
  { id: 'ING-EX-202609-02', empresaId: 'EMP-EXPORT', contratistaId: 'CTR-EX-PACK', fecha: '2026-09-02', horas: 8 },
  { id: 'ING-EX-202609-03', empresaId: 'EMP-EXPORT', contratistaId: 'CTR-EX-PACK', fecha: '2026-09-03', horas: 8 },
  { id: 'ING-EX-202609-04', empresaId: 'EMP-EXPORT', contratistaId: 'CTR-EX-PACK', fecha: '2026-09-04', horas: 6 },
  { id: 'ING-SV-202609-02', empresaId: 'EMP-SERVICES', contratistaId: 'CTR-SV-LOG', fecha: '2026-09-02', horas: 8 },
  { id: 'ING-SV-202609-03', empresaId: 'EMP-SERVICES', contratistaId: 'CTR-SV-LOG', fecha: '2026-09-03', horas: 8 },
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query('BEGIN');

  for (const [empresaId, codigos] of Object.entries(CUENTAS)) {
    const cuentas = {};
    for (const [rol, codigo] of Object.entries(codigos)) {
      const found = await client.query(
        `SELECT id, nombre, activa, "noImputable"
         FROM erp."CuentaContable"
         WHERE "empresaId" = $1 AND codigo = $2`,
        [empresaId, codigo],
      );
      const row = found.rows[0];
      if (!row || !row.activa || row.noImputable) {
        throw new Error(`${empresaId}: la cuenta ${codigo} (${rol}) no está imputable`);
      }
      cuentas[rol] = row.id;
    }

    const tipo = await client.query(
      `INSERT INTO erp."TipoContratoContratista"
         (id, codigo, nombre, "cuentaDebeId", "cuentaHaberId", "cuentaAdministracionId", activa, "empresaId", "createdAt", "updatedAt")
       VALUES ($1, 'MANO_OBRA', 'Mano de obra contratista', $2, $3, $4, true, $5, NOW(), NOW())
       ON CONFLICT ("empresaId", codigo) DO UPDATE
         SET nombre = EXCLUDED.nombre,
             "cuentaDebeId" = EXCLUDED."cuentaDebeId",
             "cuentaHaberId" = EXCLUDED."cuentaHaberId",
             "cuentaAdministracionId" = EXCLUDED."cuentaAdministracionId",
             activa = true,
             "updatedAt" = NOW()
       RETURNING id`,
      [`TCC-${empresaId}-MO`, cuentas.debe, cuentas.haber, cuentas.admin, empresaId],
    );
    const tipoId = tipo.rows[0].id;

    for (const table of ['TarifaContratista', 'ProformaContratista', 'IngresoLaborDiario']) {
      const updated = await client.query(
        `UPDATE erp."${table}" SET "tipoContratoId" = $1, "updatedAt" = NOW()
         WHERE "empresaId" = $2 AND "tipoContratoId" IS NULL`,
        [tipoId, empresaId],
      );
      console.log(`${empresaId} ${table}: ${updated.rowCount} fila(s) con tipo MANO_OBRA`);
    }
  }

  for (const jornada of JORNADAS) {
    const tarifa = await client.query(
      `SELECT id, tarifa, unidad, "laborId", "actividadId", "centroCostoId", "tipoContratoId"
       FROM erp."TarifaContratista"
       WHERE "empresaId" = $1 AND "contratistaId" = $2 AND "vigenciaHasta" IS NULL
       ORDER BY "vigenciaDesde" DESC
       LIMIT 1`,
      [jornada.empresaId, jornada.contratistaId],
    );
    const row = tarifa.rows[0];
    if (!row?.tipoContratoId) {
      throw new Error(`${jornada.contratistaId}: no hay tarifa vigente con tipo de contrato`);
    }
    const precio = Number(row.tarifa);
    const monto = Math.round(jornada.horas * precio * 100) / 100;
    const inserted = await client.query(
      `INSERT INTO erp."IngresoLaborDiario"
         (id, fecha, "contratistaId", "centroCostoId", "laborId", "actividadId",
          "tipoJornada", cantidad, "precioUnitario", monto, estado, "empresaId",
          "tipoContratoId", "tarifaId", "tarifaAplicada", unidad, "precioOverride",
          "createdAt", "updatedAt")
       VALUES ($1, ($2 || 'T15:00:00Z')::timestamptz, $3, $4, $5, $6,
          'JORNADA'::erp."TipoJornadaLabor", $7, $8, $9, 'PENDIENTE'::erp."EstadoIngresoLabor", $10,
          $11, $12, $8, $13, false, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        jornada.id,
        jornada.fecha,
        jornada.contratistaId,
        row.centroCostoId,
        row.laborId,
        row.actividadId,
        jornada.horas,
        precio,
        monto,
        jornada.empresaId,
        row.tipoContratoId,
        row.id,
        row.unidad,
      ],
    );
    console.log(`${jornada.id}: ${inserted.rowCount ? 'creado' : 'ya existía'} · ${jornada.horas} h × ${precio} = ${monto}`);
  }

  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
