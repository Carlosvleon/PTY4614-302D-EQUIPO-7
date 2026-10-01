-- Programación flexible de sync Banco Central + origen en historial.

ALTER TABLE erp."SyncBcMeta"
  ADD COLUMN IF NOT EXISTS "horarios" TEXT NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS "frecuenciaMinutos" INTEGER,
  ADD COLUMN IF NOT EXISTS "ventanaInicio" TEXT NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS "ventanaFin" TEXT NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS "diasHabiles" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "lastCronSlot" TEXT;

UPDATE erp."SyncBcMeta"
SET "horarios" = "horaProgramada"
WHERE COALESCE(TRIM("horaProgramada"), '') <> '';

ALTER TABLE erp."IndicadorBc"
  ADD COLUMN IF NOT EXISTS "origenSync" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
