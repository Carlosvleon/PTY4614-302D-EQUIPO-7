-- GAP-03 / GAP-04: líneas de ítems en OC y registro de compra (JSONB)
ALTER TABLE "erp"."OrdenCompra" ADD COLUMN IF NOT EXISTS "lineas" JSONB;
ALTER TABLE "erp"."RegistroCompra" ADD COLUMN IF NOT EXISTS "lineas" JSONB;
