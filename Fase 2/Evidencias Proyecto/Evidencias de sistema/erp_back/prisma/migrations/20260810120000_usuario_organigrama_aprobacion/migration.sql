-- Organigrama + cadena de aprobación (Reu6)

ALTER TABLE "erp"."Usuario" ADD COLUMN "jefeId" TEXT;
ALTER TABLE "erp"."Usuario" ADD COLUMN "montoMaxAprobacion" DECIMAL(18,2);

ALTER TABLE "erp"."Usuario" ADD CONSTRAINT "Usuario_jefeId_fkey"
  FOREIGN KEY ("jefeId") REFERENCES "erp"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Usuario_jefeId_idx" ON "erp"."Usuario"("jefeId");

ALTER TABLE "erp"."OrdenCompra" ADD COLUMN "aprobacionCadenaIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "erp"."OrdenCompra" ADD COLUMN "aprobacionPasoActual" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "erp"."OrdenCompra" ADD COLUMN "aprobacionPasosTotal" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "erp"."ProformaContratista" ADD COLUMN "aprobacionCadenaIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "erp"."ProformaContratista" ADD COLUMN "aprobacionPasoActual" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "erp"."ProformaContratista" ADD COLUMN "aprobacionPasosTotal" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "erp"."AprobacionOc" ADD COLUMN "pasoOrden" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "erp"."AprobacionOc" ADD COLUMN "pasoTotal" INTEGER NOT NULL DEFAULT 1;
