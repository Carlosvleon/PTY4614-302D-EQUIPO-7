-- Registro de quien resolvió vs a quien se solicitó la aprobación.
ALTER TABLE "erp"."ProformaContratista"
  ADD COLUMN IF NOT EXISTS "aprobadoPorId" TEXT,
  ADD COLUMN IF NOT EXISTS "aprobadoPorNombre" TEXT;
