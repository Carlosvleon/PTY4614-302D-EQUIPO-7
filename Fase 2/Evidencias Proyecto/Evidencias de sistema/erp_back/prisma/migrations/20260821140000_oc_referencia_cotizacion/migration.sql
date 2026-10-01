-- Referencia opcional (cotización u otro) en OC. El documento de arranque es la OC.
ALTER TABLE "erp"."OrdenCompra"
  ADD COLUMN IF NOT EXISTS "referenciaTipo" TEXT,
  ADD COLUMN IF NOT EXISTS "referenciaFolio" TEXT,
  ADD COLUMN IF NOT EXISTS "referenciaFecha" TIMESTAMP(3);
