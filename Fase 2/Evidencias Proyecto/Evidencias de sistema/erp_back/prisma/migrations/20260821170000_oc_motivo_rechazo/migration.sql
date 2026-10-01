-- Motivo obligatorio al rechazar OC (solo Compras).
-- IF NOT EXISTS: Prisma local a menudo tiene _prisma_migrations vacía.
-- No dropear enum COTIZACION ni otros valores.

ALTER TABLE "erp"."OrdenCompra"
  ADD COLUMN IF NOT EXISTS "motivoRechazo" TEXT;

ALTER TABLE "erp"."AprobacionOc"
  ADD COLUMN IF NOT EXISTS "motivoRechazo" TEXT;
