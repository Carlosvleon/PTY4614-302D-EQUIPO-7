-- AlterTable: campos del wizard de emisión en DocumentoComercial
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "formaPago" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "fechaVencimiento" TIMESTAMP(3);
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "indicadorVenta" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "descuentoGlobalPct" DECIMAL(5,2);
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "cuentaContableId" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "centroCostoId" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "receptorRut" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "receptorGiro" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "receptorDireccion" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "receptorComuna" TEXT;
ALTER TABLE "erp"."DocumentoComercial" ADD COLUMN IF NOT EXISTS "receptorCiudad" TEXT;
