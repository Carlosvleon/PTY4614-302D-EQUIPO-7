-- T1: historial de tipo de cambio del pago (anticipo productor).
-- IF NOT EXISTS: Prisma local a menudo tiene _prisma_migrations vacía.

CREATE TABLE IF NOT EXISTS "erp"."PagoTcEvento" (
  "id" TEXT NOT NULL,
  "pagoId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "tcAnterior" DECIMAL(18,4),
  "tcNuevo" DECIMAL(18,4) NOT NULL,
  "motivo" TEXT,
  "usuarioId" TEXT NOT NULL,
  "usuarioNombre" TEXT,
  "usuarioEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PagoTcEvento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PagoTcEvento_pagoId_createdAt_idx"
  ON "erp"."PagoTcEvento"("pagoId", "createdAt");

CREATE INDEX IF NOT EXISTS "PagoTcEvento_empresaId_idx"
  ON "erp"."PagoTcEvento"("empresaId");

DO $$ BEGIN
  ALTER TABLE "erp"."PagoTcEvento"
    ADD CONSTRAINT "PagoTcEvento_pagoId_fkey"
    FOREIGN KEY ("pagoId") REFERENCES "erp"."Pago"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "erp"."PagoTcEvento"
    ADD CONSTRAINT "PagoTcEvento_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
