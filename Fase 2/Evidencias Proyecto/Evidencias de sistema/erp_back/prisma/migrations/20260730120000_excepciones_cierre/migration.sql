-- EX-18: rechazo de proforma
ALTER TYPE "erp"."EstadoProforma" ADD VALUE 'RECHAZADA';

-- GAP-05 / EX-29: vínculo pago ↔ movimiento cartola (calce único)
ALTER TABLE "erp"."Pago" ADD COLUMN IF NOT EXISTS "movimientoCartolaId" TEXT;
ALTER TABLE "erp"."Pago" ADD COLUMN IF NOT EXISTS "proveedorId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Pago_movimientoCartolaId_key"
  ON "erp"."Pago"("movimientoCartolaId");

ALTER TABLE "erp"."MovimientoCartola" ADD COLUMN IF NOT EXISTS "pagoId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "MovimientoCartola_pagoId_key"
  ON "erp"."MovimientoCartola"("pagoId");
