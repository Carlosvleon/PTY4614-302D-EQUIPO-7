-- Escalas siempre pertenecen a un grupo.
-- Idempotente: si grupoId ya existe (SQL manual en prod), no borra datos.

DROP INDEX IF EXISTS erp."NodoEscalaAprobacion_empresaId_modulo_usuarioId_key";

ALTER TABLE erp."NodoEscalaAprobacion"
  DROP CONSTRAINT IF EXISTS "NodoEscalaAprobacion_empresaId_modulo_usuarioId_key";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'erp'
      AND table_name = 'NodoEscalaAprobacion'
      AND column_name = 'grupoId'
  ) THEN
    DELETE FROM erp."NodoEscalaAprobacion";

    ALTER TABLE erp."NodoEscalaAprobacion"
      ADD COLUMN "grupoId" TEXT NOT NULL;

    ALTER TABLE erp."NodoEscalaAprobacion"
      ADD CONSTRAINT "NodoEscalaAprobacion_grupoId_fkey"
      FOREIGN KEY ("grupoId") REFERENCES erp."GrupoAprobacion"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "NodoEscalaAprobacion_empresaId_modulo_grupoId_usuarioId_key"
  ON erp."NodoEscalaAprobacion" ("empresaId", "modulo", "grupoId", "usuarioId");

CREATE INDEX IF NOT EXISTS "NodoEscalaAprobacion_grupoId_idx"
  ON erp."NodoEscalaAprobacion" ("grupoId");
