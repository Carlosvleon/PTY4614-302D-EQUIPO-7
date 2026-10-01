-- Corrección de saldo de apertura: el movimiento sigue; queda el valor anterior.
-- IF NOT EXISTS: Prisma local a menudo tiene _prisma_migrations vacía.

CREATE TABLE IF NOT EXISTS "erp"."AperturaCorreccion" (
  "id" TEXT NOT NULL,
  "movimientoCajaId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "bancoAnterior" TEXT,
  "bancoNuevo" TEXT NOT NULL,
  "monedaAnterior" TEXT NOT NULL,
  "monedaNueva" TEXT NOT NULL,
  "montoAnterior" DECIMAL(18,2) NOT NULL,
  "montoNuevo" DECIMAL(18,2) NOT NULL,
  "fechaAnterior" TIMESTAMP(3) NOT NULL,
  "fechaNueva" TIMESTAMP(3) NOT NULL,
  "motivo" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "usuarioEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AperturaCorreccion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AperturaCorreccion_movimientoCajaId_createdAt_idx"
  ON "erp"."AperturaCorreccion"("movimientoCajaId", "createdAt");

CREATE INDEX IF NOT EXISTS "AperturaCorreccion_empresaId_idx"
  ON "erp"."AperturaCorreccion"("empresaId");

DO $$ BEGIN
  ALTER TABLE "erp"."AperturaCorreccion"
    ADD CONSTRAINT "AperturaCorreccion_movimientoCajaId_fkey"
    FOREIGN KEY ("movimientoCajaId") REFERENCES "erp"."MovimientoCaja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "erp"."AperturaCorreccion"
    ADD CONSTRAINT "AperturaCorreccion_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
