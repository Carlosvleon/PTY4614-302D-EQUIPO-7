-- Reu5: historial periodos, autor borradores, campos cliente alta rápida.
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "creadoPorId" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "creadoPorNombre" TEXT;

ALTER TABLE "erp"."Cliente" ADD COLUMN IF NOT EXISTS "direccion" TEXT;
ALTER TABLE "erp"."Cliente" ADD COLUMN IF NOT EXISTS "comuna" TEXT;
ALTER TABLE "erp"."Cliente" ADD COLUMN IF NOT EXISTS "ciudad" TEXT;
ALTER TABLE "erp"."Cliente" ADD COLUMN IF NOT EXISTS "telefono" TEXT;
ALTER TABLE "erp"."Cliente" ADD COLUMN IF NOT EXISTS "email" TEXT;

CREATE TABLE IF NOT EXISTS "erp"."PeriodoContableEvento" (
    "id" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "estadoAntes" TEXT,
    "estadoDespues" TEXT NOT NULL,
    "motivo" TEXT,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PeriodoContableEvento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PeriodoContableEvento_periodoId_createdAt_idx"
  ON "erp"."PeriodoContableEvento"("periodoId", "createdAt");
CREATE INDEX IF NOT EXISTS "PeriodoContableEvento_empresaId_createdAt_idx"
  ON "erp"."PeriodoContableEvento"("empresaId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "erp"."PeriodoContableEvento"
    ADD CONSTRAINT "PeriodoContableEvento_periodoId_fkey"
    FOREIGN KEY ("periodoId") REFERENCES "erp"."PeriodoContable"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
