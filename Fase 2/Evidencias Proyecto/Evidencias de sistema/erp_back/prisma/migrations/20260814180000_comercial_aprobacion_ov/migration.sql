-- Aprobación comercial OV (propuesta 04-PROPUESTA-APROBACIONES-COMERCIAL)

ALTER TYPE "erp"."EstadoDocumentoErp" ADD VALUE IF NOT EXISTS 'PENDIENTE_APROBACION';
ALTER TYPE "erp"."EstadoDocumentoErp" ADD VALUE IF NOT EXISTS 'AUTORIZADA';

ALTER TABLE "erp"."Empresa"
  ADD COLUMN IF NOT EXISTS "comercialRequiereAprobacion" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "comercialAprobacionDesde" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "erp"."DocumentoComercial"
  ADD COLUMN IF NOT EXISTS "aprobadorId" TEXT,
  ADD COLUMN IF NOT EXISTS "aprobadorNombre" TEXT,
  ADD COLUMN IF NOT EXISTS "aprobacionCadenaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "aprobacionPasoActual" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "aprobacionPasosTotal" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "aprobadoPorId" TEXT,
  ADD COLUMN IF NOT EXISTS "aprobadoPorNombre" TEXT,
  ADD COLUMN IF NOT EXISTS "aprobadaAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "DocumentoComercial_aprobadorId_idx"
  ON "erp"."DocumentoComercial"("aprobadorId");

CREATE TABLE IF NOT EXISTS "erp"."AprobacionOv" (
  "id" TEXT NOT NULL,
  "documentoId" TEXT NOT NULL,
  "ovFolio" TEXT NOT NULL,
  "cliente" TEXT NOT NULL,
  "monto" DECIMAL(18,2) NOT NULL,
  "solicitante" TEXT NOT NULL,
  "aprobadorId" TEXT,
  "aprobadorNombre" TEXT,
  "pasoOrden" INTEGER NOT NULL DEFAULT 1,
  "pasoTotal" INTEGER NOT NULL DEFAULT 1,
  "resueltoPorId" TEXT,
  "resueltoPorNombre" TEXT,
  "estado" "erp"."EstadoAprobacionOc" NOT NULL DEFAULT 'PENDIENTE',
  "fecha" TIMESTAMP(3) NOT NULL,
  "empresaId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AprobacionOv_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AprobacionOv_empresaId_idx" ON "erp"."AprobacionOv"("empresaId");
CREATE INDEX IF NOT EXISTS "AprobacionOv_aprobadorId_idx" ON "erp"."AprobacionOv"("aprobadorId");
CREATE INDEX IF NOT EXISTS "AprobacionOv_documentoId_idx" ON "erp"."AprobacionOv"("documentoId");

ALTER TABLE "erp"."AprobacionOv"
  DROP CONSTRAINT IF EXISTS "AprobacionOv_documentoId_fkey";
ALTER TABLE "erp"."AprobacionOv"
  ADD CONSTRAINT "AprobacionOv_documentoId_fkey"
  FOREIGN KEY ("documentoId") REFERENCES "erp"."DocumentoComercial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."AprobacionOv"
  DROP CONSTRAINT IF EXISTS "AprobacionOv_empresaId_fkey";
ALTER TABLE "erp"."AprobacionOv"
  ADD CONSTRAINT "AprobacionOv_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "erp"."DocumentoComercial"
  ADD COLUMN IF NOT EXISTS "motivoRechazoOv" TEXT;

ALTER TABLE "erp"."AprobacionOv"
  ADD COLUMN IF NOT EXISTS "motivoRechazo" TEXT;
