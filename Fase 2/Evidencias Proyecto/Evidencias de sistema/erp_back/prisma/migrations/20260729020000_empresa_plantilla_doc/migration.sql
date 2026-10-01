-- Plantilla de documento (cotización / OC): logo, sello, dirección, opciones JSON
ALTER TABLE "erp"."Empresa" ADD COLUMN IF NOT EXISTS "direccion" TEXT;
ALTER TABLE "erp"."Empresa" ADD COLUMN IF NOT EXISTS "comuna" TEXT;
ALTER TABLE "erp"."Empresa" ADD COLUMN IF NOT EXISTS "ciudad" TEXT;
ALTER TABLE "erp"."Empresa" ADD COLUMN IF NOT EXISTS "telefono" TEXT;
ALTER TABLE "erp"."Empresa" ADD COLUMN IF NOT EXISTS "emailContacto" TEXT;
ALTER TABLE "erp"."Empresa" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE "erp"."Empresa" ADD COLUMN IF NOT EXISTS "selloUrl" TEXT;
ALTER TABLE "erp"."Empresa" ADD COLUMN IF NOT EXISTS "plantillaDoc" JSONB;
