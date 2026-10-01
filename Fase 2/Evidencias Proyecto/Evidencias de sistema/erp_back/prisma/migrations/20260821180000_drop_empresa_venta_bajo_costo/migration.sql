-- D16: no vender bajo costo es regla fija de ventas, no parámetro de empresa.
-- IF EXISTS: Prisma local a menudo tiene _prisma_migrations vacía.
-- No migrate deploy a ciegas.

ALTER TABLE "erp"."Empresa" DROP COLUMN IF EXISTS "ventaBajoCosto";
