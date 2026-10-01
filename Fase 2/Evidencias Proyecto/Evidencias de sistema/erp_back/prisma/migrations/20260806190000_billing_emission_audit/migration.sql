-- Auditoría emisión billing-gateway (stub / sandbox / live)
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "billingEmissionId" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "billingPartner" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "billingConnectionMode" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "billingStatus" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "folioOficial" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "billingGlobalDocumentId" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "billingDisclaimer" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "billingStub" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "billingEmittedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "DocumentoComercial_billingEmissionId_idx"
  ON "erp"."DocumentoComercial"("billingEmissionId");
