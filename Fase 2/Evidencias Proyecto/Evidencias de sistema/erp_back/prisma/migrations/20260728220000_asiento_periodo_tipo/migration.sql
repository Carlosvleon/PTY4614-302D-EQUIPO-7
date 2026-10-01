-- Asientos: periodo contable + tipo de comprobante

ALTER TABLE "erp"."Asiento" ADD COLUMN IF NOT EXISTS "periodo" TEXT;
ALTER TABLE "erp"."Asiento" ADD COLUMN IF NOT EXISTS "tipo" TEXT NOT NULL DEFAULT 'MANUAL';

CREATE INDEX IF NOT EXISTS "Asiento_empresaId_periodo_idx" ON "erp"."Asiento"("empresaId", "periodo");
