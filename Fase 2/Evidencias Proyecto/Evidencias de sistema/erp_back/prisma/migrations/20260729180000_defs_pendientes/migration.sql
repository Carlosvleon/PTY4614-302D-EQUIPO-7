-- AlterEnum EstadoDte
ALTER TYPE "erp"."EstadoDte" ADD VALUE IF NOT EXISTS 'EMITIDO_SII';

-- CreateEnum
CREATE TYPE "erp"."TerceroCuentaCorriente" AS ENUM ('CLIENTE', 'PROVEEDOR', 'PRODUCTOR');
CREATE TYPE "erp"."OrigenCuentaCorriente" AS ENUM ('VENTA', 'COMPRA', 'PAGO', 'ANTICIPO', 'AJUSTE');
CREATE TYPE "erp"."EstadoGuiaDespacho" AS ENUM ('BORRADOR', 'EMITIDA', 'FACTURADA', 'ANULADA');

-- SyncBcMeta: status tracking for cron
ALTER TABLE "erp"."SyncBcMeta" ADD COLUMN IF NOT EXISTS "lastStatus" TEXT;
ALTER TABLE "erp"."SyncBcMeta" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
ALTER TABLE "erp"."SyncBcMeta" ADD COLUMN IF NOT EXISTS "failStreak" INTEGER NOT NULL DEFAULT 0;

-- DteGoSocket: link + unique idempotency
ALTER TABLE "erp"."DteGoSocket" ADD COLUMN IF NOT EXISTS "documentoComercialId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DteGoSocket_empresaId_folio_tipo_key'
  ) THEN
    -- Deduplicate before unique (keep newest)
    DELETE FROM "erp"."DteGoSocket" a
    USING "erp"."DteGoSocket" b
    WHERE a."empresaId" = b."empresaId"
      AND a.folio = b.folio
      AND a.tipo = b.tipo
      AND a."createdAt" < b."createdAt";
    ALTER TABLE "erp"."DteGoSocket"
      ADD CONSTRAINT "DteGoSocket_empresaId_folio_tipo_key" UNIQUE ("empresaId", "folio", "tipo");
  END IF;
END $$;

-- DteEnvio queue
CREATE TABLE IF NOT EXISTS "erp"."DteEnvio" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "documentoComercialId" TEXT,
    "folio" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB,
    "estado" "erp"."EstadoDte" NOT NULL DEFAULT 'BORRADOR',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "trackId" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DteEnvio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DteEnvio_empresaId_folio_tipo_key"
  ON "erp"."DteEnvio"("empresaId", "folio", "tipo");
CREATE INDEX IF NOT EXISTS "DteEnvio_empresaId_idx" ON "erp"."DteEnvio"("empresaId");
CREATE INDEX IF NOT EXISTS "DteEnvio_estado_idx" ON "erp"."DteEnvio"("estado");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DteEnvio_empresaId_fkey'
  ) THEN
    ALTER TABLE "erp"."DteEnvio"
      ADD CONSTRAINT "DteEnvio_empresaId_fkey"
      FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Cuenta corriente
CREATE TABLE IF NOT EXISTS "erp"."CuentaCorrienteMovimiento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "terceroTipo" "erp"."TerceroCuentaCorriente" NOT NULL,
    "terceroId" TEXT NOT NULL,
    "terceroNombre" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "documentoRef" TEXT,
    "documentoTipo" TEXT,
    "debe" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "haber" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "glosa" TEXT,
    "origen" "erp"."OrigenCuentaCorriente",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CuentaCorrienteMovimiento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CuentaCorrienteMovimiento_empresaId_terceroTipo_terceroId_idx"
  ON "erp"."CuentaCorrienteMovimiento"("empresaId", "terceroTipo", "terceroId");
CREATE INDEX IF NOT EXISTS "CuentaCorrienteMovimiento_empresaId_fecha_idx"
  ON "erp"."CuentaCorrienteMovimiento"("empresaId", "fecha");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CuentaCorrienteMovimiento_empresaId_fkey'
  ) THEN
    ALTER TABLE "erp"."CuentaCorrienteMovimiento"
      ADD CONSTRAINT "CuentaCorrienteMovimiento_empresaId_fkey"
      FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Guías de despacho
CREATE TABLE IF NOT EXISTS "erp"."GuiaDespacho" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estado" "erp"."EstadoGuiaDespacho" NOT NULL DEFAULT 'BORRADOR',
    "documentoComercialId" TEXT,
    "glosa" TEXT,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuiaDespacho_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GuiaDespacho_empresaId_folio_key"
  ON "erp"."GuiaDespacho"("empresaId", "folio");
CREATE INDEX IF NOT EXISTS "GuiaDespacho_empresaId_idx" ON "erp"."GuiaDespacho"("empresaId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GuiaDespacho_empresaId_fkey'
  ) THEN
    ALTER TABLE "erp"."GuiaDespacho"
      ADD CONSTRAINT "GuiaDespacho_empresaId_fkey"
      FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
