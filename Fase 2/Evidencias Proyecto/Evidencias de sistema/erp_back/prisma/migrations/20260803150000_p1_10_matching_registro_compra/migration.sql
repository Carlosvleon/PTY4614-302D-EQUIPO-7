-- P1-10: matching de 3 vías (OC-recepción-factura) en RegistroCompra.
ALTER TABLE "erp"."RegistroCompra" ADD COLUMN IF NOT EXISTS "matchOk" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "erp"."RegistroCompra" ADD COLUMN IF NOT EXISTS "matchDiff" DECIMAL(18,2);
