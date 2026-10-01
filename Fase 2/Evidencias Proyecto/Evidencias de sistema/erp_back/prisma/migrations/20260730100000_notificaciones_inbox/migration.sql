-- Notificaciones inbox + creador proforma
CREATE TABLE IF NOT EXISTS "erp"."Notificacion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "empresaId" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalle" TEXT,
    "href" TEXT NOT NULL,
    "refKey" TEXT NOT NULL,
    "monto" DECIMAL(18,2),
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Notificacion_userId_refKey_key" ON "erp"."Notificacion"("userId", "refKey");
CREATE INDEX IF NOT EXISTS "Notificacion_userId_leida_createdAt_idx" ON "erp"."Notificacion"("userId", "leida", "createdAt");
CREATE INDEX IF NOT EXISTS "Notificacion_empresaId_idx" ON "erp"."Notificacion"("empresaId");

DO $$ BEGIN
  ALTER TABLE "erp"."Notificacion"
    ADD CONSTRAINT "Notificacion_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "erp"."Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "erp"."ProformaContratista" ADD COLUMN IF NOT EXISTS "creadoPorId" TEXT;
ALTER TABLE "erp"."ProformaContratista" ADD COLUMN IF NOT EXISTS "creadoPorNombre" TEXT;
