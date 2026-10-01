-- Tesorería fase 2: maestro códigos financieros + destino/contracuenta en movimiento de cartola.
-- IF NOT EXISTS: Prisma local a menudo tiene _prisma_migrations vacía.

CREATE TABLE IF NOT EXISTS "erp"."CodigoFinanciero" (
  "id" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "empresaId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CodigoFinanciero_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CodigoFinanciero_empresaId_codigo_key"
  ON "erp"."CodigoFinanciero"("empresaId", "codigo");

CREATE INDEX IF NOT EXISTS "CodigoFinanciero_empresaId_activa_idx"
  ON "erp"."CodigoFinanciero"("empresaId", "activa");

DO $$ BEGIN
  ALTER TABLE "erp"."CodigoFinanciero"
    ADD CONSTRAINT "CodigoFinanciero_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "erp"."Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "erp"."MovimientoCartola" ADD COLUMN IF NOT EXISTS "cuentaContraId" TEXT;
ALTER TABLE "erp"."MovimientoCartola" ADD COLUMN IF NOT EXISTS "destinoTipo" TEXT;
ALTER TABLE "erp"."MovimientoCartola" ADD COLUMN IF NOT EXISTS "codigoFinancieroId" TEXT;
ALTER TABLE "erp"."MovimientoCartola" ADD COLUMN IF NOT EXISTS "tipoDocumento" TEXT;
ALTER TABLE "erp"."MovimientoCartola" ADD COLUMN IF NOT EXISTS "folioDocumento" TEXT;
ALTER TABLE "erp"."MovimientoCartola" ADD COLUMN IF NOT EXISTS "proveedorId" TEXT;
ALTER TABLE "erp"."MovimientoCartola" ADD COLUMN IF NOT EXISTS "clienteId" TEXT;
ALTER TABLE "erp"."MovimientoCartola" ADD COLUMN IF NOT EXISTS "centroCostoId" TEXT;
ALTER TABLE "erp"."MovimientoCartola" ADD COLUMN IF NOT EXISTS "areaNegocioId" TEXT;
ALTER TABLE "erp"."MovimientoCartola" ADD COLUMN IF NOT EXISTS "elementoCostoId" TEXT;

CREATE INDEX IF NOT EXISTS "MovimientoCartola_codigoFinancieroId_idx"
  ON "erp"."MovimientoCartola"("codigoFinancieroId");

CREATE INDEX IF NOT EXISTS "Asiento_empresaId_origen_idx"
  ON "erp"."Asiento"("empresaId", "origen");

DO $$ BEGIN
  ALTER TABLE "erp"."MovimientoCartola"
    ADD CONSTRAINT "MovimientoCartola_cuentaContraId_fkey"
    FOREIGN KEY ("cuentaContraId") REFERENCES "erp"."CuentaContable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "erp"."MovimientoCartola"
    ADD CONSTRAINT "MovimientoCartola_codigoFinancieroId_fkey"
    FOREIGN KEY ("codigoFinancieroId") REFERENCES "erp"."CodigoFinanciero"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "erp"."MovimientoCartola"
    ADD CONSTRAINT "MovimientoCartola_proveedorId_fkey"
    FOREIGN KEY ("proveedorId") REFERENCES "erp"."Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "erp"."MovimientoCartola"
    ADD CONSTRAINT "MovimientoCartola_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "erp"."Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
