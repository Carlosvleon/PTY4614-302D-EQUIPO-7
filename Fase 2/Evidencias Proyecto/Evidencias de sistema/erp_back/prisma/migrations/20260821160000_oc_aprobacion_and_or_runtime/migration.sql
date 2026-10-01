-- AND/OR runtime: snapshot de cadena en OC, logica por fila, estado OMITIDA.
-- IF NOT EXISTS: Prisma local a menudo tiene _prisma_migrations vacía.
-- No dropear enum COTIZACION ni otros valores.

ALTER TABLE "erp"."OrdenCompra"
  ADD COLUMN IF NOT EXISTS "aprobacionCadena" JSONB;

ALTER TABLE "erp"."AprobacionOc"
  ADD COLUMN IF NOT EXISTS "logica" TEXT NOT NULL DEFAULT 'SIMPLE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'erp'
      AND t.typname = 'EstadoAprobacionOc'
      AND e.enumlabel = 'OMITIDA'
  ) THEN
    ALTER TYPE "erp"."EstadoAprobacionOc" ADD VALUE 'OMITIDA';
  END IF;
END $$;
