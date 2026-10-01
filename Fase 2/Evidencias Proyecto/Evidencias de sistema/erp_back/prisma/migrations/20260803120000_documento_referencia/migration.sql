-- AlterTable
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "referenciaTipo" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "referenciaFolio" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "observaciones" TEXT;
