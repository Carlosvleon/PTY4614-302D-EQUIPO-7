-- Catálogos dashboard (schema erp)
SET search_path TO "erp";

-- AlterTable CentroCosto
ALTER TABLE "CentroCosto" ADD COLUMN IF NOT EXISTS "contactoEncargado" TEXT;

-- CreateTable Moneda
CREATE TABLE IF NOT EXISTS "Moneda" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "simbolo" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "focoReporteria" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Moneda_pkey" PRIMARY KEY ("id")
);

-- CreateTable UnidadMedida
CREATE TABLE IF NOT EXISTS "UnidadMedida" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnidadMedida_pkey" PRIMARY KEY ("id")
);

-- CreateTable TipoDocumento
CREATE TABLE IF NOT EXISTS "TipoDocumento" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipoDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable IndicadorBc
CREATE TABLE IF NOT EXISTS "IndicadorBc" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "usd" DECIMAL(18,4) NOT NULL,
    "eur" DECIMAL(18,4) NOT NULL,
    "cny" DECIMAL(18,4) NOT NULL,
    "fuente" TEXT NOT NULL DEFAULT 'BCCh',
    "completadoFeriado" BOOLEAN NOT NULL DEFAULT false,
    "empresaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndicadorBc_pkey" PRIMARY KEY ("id")
);

-- CreateTable SyncBcMeta
CREATE TABLE IF NOT EXISTS "SyncBcMeta" (
    "id" TEXT NOT NULL,
    "lastSync" TIMESTAMP(3),
    "autoSync" BOOLEAN NOT NULL DEFAULT false,
    "horaProgramada" TEXT NOT NULL DEFAULT '09:00',
    "empresaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncBcMeta_pkey" PRIMARY KEY ("id")
);

-- Indexes / uniques
CREATE UNIQUE INDEX IF NOT EXISTS "Moneda_codigo_key" ON "Moneda"("codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "UnidadMedida_codigo_key" ON "UnidadMedida"("codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "TipoDocumento_codigo_modulo_key" ON "TipoDocumento"("codigo", "modulo");
CREATE INDEX IF NOT EXISTS "IndicadorBc_fecha_idx" ON "IndicadorBc"("fecha");
CREATE INDEX IF NOT EXISTS "IndicadorBc_empresaId_idx" ON "IndicadorBc"("empresaId");
CREATE UNIQUE INDEX IF NOT EXISTS "SyncBcMeta_empresaId_key" ON "SyncBcMeta"("empresaId");

-- FKs
DO $$ BEGIN
  ALTER TABLE "IndicadorBc" ADD CONSTRAINT "IndicadorBc_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SyncBcMeta" ADD CONSTRAINT "SyncBcMeta_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
