-- H1: flag productor en contraparte (lookup RUT)
-- H6: artículos no inventariables (servicios / AlmaWeb)

ALTER TABLE "erp"."Cliente" ADD COLUMN IF NOT EXISTS "esProductor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "erp"."Proveedor" ADD COLUMN IF NOT EXISTS "esProductor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "erp"."Insumo" ADD COLUMN IF NOT EXISTS "inventariable" BOOLEAN NOT NULL DEFAULT true;
