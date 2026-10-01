-- Aceptación comercial de factura de compra a N días (default 8).
-- Bitácora ERP: no emite SII/GoSocket y no auto-aprueba la OC.

DO $$ BEGIN
  CREATE TYPE "erp"."AceptacionCompraEstado" AS ENUM ('PENDIENTE', 'ACEPTADA_PLAZO', 'RECLAMADA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "erp"."AceptacionCompraOrigen" AS ENUM ('MANUAL', 'PLAZO_AUTO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "erp"."Empresa"
  ADD COLUMN IF NOT EXISTS "aceptacionCompraPlazoDias" INTEGER NOT NULL DEFAULT 8;

ALTER TABLE "erp"."RegistroCompra"
  ADD COLUMN IF NOT EXISTS "aceptacionEstado" "erp"."AceptacionCompraEstado" NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS "aceptadaAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "aceptacionOrigen" "erp"."AceptacionCompraOrigen";
