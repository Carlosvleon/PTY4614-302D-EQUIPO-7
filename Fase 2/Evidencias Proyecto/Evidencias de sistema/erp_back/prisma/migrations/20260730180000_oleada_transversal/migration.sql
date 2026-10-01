-- Oleada transversal: creador OC/cliente, aging FK, recepción líneas
ALTER TABLE "erp"."OrdenCompra"
  ADD COLUMN IF NOT EXISTS "creadoPorId" TEXT,
  ADD COLUMN IF NOT EXISTS "creadoPorNombre" TEXT;

CREATE INDEX IF NOT EXISTS "OrdenCompra_creadoPorId_idx" ON "erp"."OrdenCompra"("creadoPorId");

ALTER TABLE "erp"."Cliente"
  ADD COLUMN IF NOT EXISTS "creadoPorId" TEXT,
  ADD COLUMN IF NOT EXISTS "creadoPorNombre" TEXT;

ALTER TABLE "erp"."DocumentoAging"
  ADD COLUMN IF NOT EXISTS "documentoComercialId" TEXT,
  ADD COLUMN IF NOT EXISTS "registroCompraId" TEXT,
  ADD COLUMN IF NOT EXISTS "montoPagado" DECIMAL(18,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "DocumentoAging_documentoComercialId_idx" ON "erp"."DocumentoAging"("documentoComercialId");
CREATE INDEX IF NOT EXISTS "DocumentoAging_registroCompraId_idx" ON "erp"."DocumentoAging"("registroCompraId");

ALTER TABLE "erp"."RecepcionOc"
  ADD COLUMN IF NOT EXISTS "lineas" JSONB;
