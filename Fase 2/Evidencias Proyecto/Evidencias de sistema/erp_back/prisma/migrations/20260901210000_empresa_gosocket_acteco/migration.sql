-- Acteco SII (6 dígitos) por sociedad. Vive en el ERP, no en billing-gateway.
-- IF NOT EXISTS: Prisma local a menudo tiene _prisma_migrations vacía.
-- No migrate deploy a ciegas.

ALTER TABLE "erp"."Empresa" ADD COLUMN IF NOT EXISTS "gosocketActeco" TEXT;
