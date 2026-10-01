-- Resolución SII/QA por sociedad (CAE GUF). Vive en el ERP, no en billing-gateway.
-- IF NOT EXISTS: Prisma local a menudo tiene _prisma_migrations vacía.
-- No migrate deploy a ciegas.

ALTER TABLE "erp"."Empresa" ADD COLUMN IF NOT EXISTS "gosocketNroResolucion" TEXT;
ALTER TABLE "erp"."Empresa" ADD COLUMN IF NOT EXISTS "gosocketFechaResolucion" TEXT;
