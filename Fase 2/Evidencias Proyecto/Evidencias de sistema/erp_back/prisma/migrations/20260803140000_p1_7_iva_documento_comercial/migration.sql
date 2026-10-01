-- AlterTable: IVA real persistido en DocumentoComercial (P1-7)
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "iva" DECIMAL(18,2);
