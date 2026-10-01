-- Auditoría de imports Excel de catálogos (plan, CC, elementos).
-- IF NOT EXISTS: Prisma local a menudo tiene _prisma_migrations vacía.

DO $$ BEGIN
  CREATE TYPE "erp"."CatalogoImportacionTipo" AS ENUM (
    'PLAN_CUENTAS',
    'CENTROS_COSTO',
    'ELEMENTOS_COSTO',
    'AREAS_NEGOCIO'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "erp"."CatalogoImportacion" (
  "id" TEXT NOT NULL,
  "tipo" "erp"."CatalogoImportacionTipo" NOT NULL,
  "archivoNombre" TEXT,
  "created" INTEGER NOT NULL DEFAULT 0,
  "updated" INTEGER NOT NULL DEFAULT 0,
  "unchanged" INTEGER NOT NULL DEFAULT 0,
  "politicas" JSONB,
  "resumen" JSONB,
  "usuarioId" TEXT,
  "usuarioEmail" TEXT,
  "usuarioNombre" TEXT,
  "empresaId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CatalogoImportacion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CatalogoImportacion_empresaId_tipo_createdAt_idx"
  ON "erp"."CatalogoImportacion"("empresaId", "tipo", "createdAt");

DO $$ BEGIN
  ALTER TABLE "erp"."CatalogoImportacion"
    ADD CONSTRAINT "CatalogoImportacion_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "erp"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "erp"."CatalogoImportacion"
    ADD CONSTRAINT "CatalogoImportacion_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
