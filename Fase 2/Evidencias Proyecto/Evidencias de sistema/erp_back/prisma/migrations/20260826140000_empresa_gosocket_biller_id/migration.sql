-- BillerID GoSocket por sociedad (EXPORT vs SERVICES).
-- IF NOT EXISTS: Prisma local a menudo tiene _prisma_migrations vacía.
-- No migrate deploy a ciegas.

ALTER TABLE "erp"."Empresa" ADD COLUMN IF NOT EXISTS "gosocketBillerId" TEXT;
