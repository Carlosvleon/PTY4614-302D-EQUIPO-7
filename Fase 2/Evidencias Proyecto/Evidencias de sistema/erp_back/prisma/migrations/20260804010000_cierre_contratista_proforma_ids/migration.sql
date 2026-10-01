-- Auditoría de proformas incluidas en cada traspaso/cierre de contratistas.
ALTER TABLE "erp"."PeriodoCierreContratista"
  ADD COLUMN IF NOT EXISTS "proformaIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
