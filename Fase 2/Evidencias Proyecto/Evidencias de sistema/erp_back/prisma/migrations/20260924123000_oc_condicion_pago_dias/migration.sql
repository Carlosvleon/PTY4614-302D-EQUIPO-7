-- Condición de pago 30/60/90: default en el proveedor, editable en la OC.

ALTER TABLE "erp"."Proveedor"
  ADD COLUMN IF NOT EXISTS "condicionPagoDias" INTEGER;

ALTER TABLE "erp"."OrdenCompra"
  ADD COLUMN IF NOT EXISTS "condicionPagoDias" INTEGER;
