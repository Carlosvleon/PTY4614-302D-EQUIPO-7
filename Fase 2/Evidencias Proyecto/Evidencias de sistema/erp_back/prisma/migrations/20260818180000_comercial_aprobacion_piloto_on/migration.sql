-- Piloto: OV exige cadena de aprobación (mismo criterio que OC).
ALTER TABLE "erp"."Empresa"
  ALTER COLUMN "comercialRequiereAprobacion" SET DEFAULT true;

UPDATE "erp"."Empresa"
SET "comercialRequiereAprobacion" = true,
    "comercialAprobacionDesde" = 0;
