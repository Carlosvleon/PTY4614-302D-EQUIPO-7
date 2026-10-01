-- Tesorería ciclo: pago tipo, caja por banco, nómina compromiso, FKs lógicas CC.
-- IF NOT EXISTS: no migrate deploy a ciegas en local con _prisma_migrations vacía.

ALTER TABLE "erp"."Pago"
  ADD COLUMN IF NOT EXISTS "tipo" TEXT NOT NULL DEFAULT 'PAGO_TOTAL';

ALTER TABLE "erp"."MovimientoCaja"
  ADD COLUMN IF NOT EXISTS "banco" TEXT,
  ADD COLUMN IF NOT EXISTS "moneda" TEXT NOT NULL DEFAULT 'CLP',
  ADD COLUMN IF NOT EXISTS "esApertura" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "MovimientoCaja_empresaId_banco_moneda_idx"
  ON "erp"."MovimientoCaja"("empresaId", "banco", "moneda");

ALTER TABLE "erp"."DocumentoAging"
  ADD COLUMN IF NOT EXISTS "semanaCompromiso" TEXT;

ALTER TABLE "erp"."CuentaCorrienteMovimiento"
  ADD COLUMN IF NOT EXISTS "pagoId" TEXT,
  ADD COLUMN IF NOT EXISTS "documentoComercialId" TEXT,
  ADD COLUMN IF NOT EXISTS "registroCompraId" TEXT,
  ADD COLUMN IF NOT EXISTS "movimientoCartolaId" TEXT;
